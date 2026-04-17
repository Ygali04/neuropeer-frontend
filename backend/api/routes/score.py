"""Synchronous one-shot scoring endpoint.

Designed for service-to-service callers (Nucleus, batch pipelines, etc.)
that want a single HTTP request: give a URL, get the full AnalysisResult
back. Internally:

    1. Enqueue the same Celery task the async /api/v1/analyze uses
    2. Poll Redis + Postgres until the worker publishes a terminal event
    3. Fetch the final result via _get_result
    4. Return it

The async /api/v1/analyze + WebSocket path stays untouched for UI clients
that want live progress. /api/v1/score is purely ergonomic — one call, one
response, no state to manage on the caller.

Auth: standard X-API-Key header via `require_api_key`. No anonymous access.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from backend.api.middleware.api_key import require_api_key
from backend.api.routes.results import _get_result, _load_from_db, _get_redis
from backend.models.schemas import AnalyzeRequest, AnalysisResult
from backend.worker.tasks import run_analysis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scoring"])

# Hard ceiling — TRIBE v2 on a fresh GPU shouldn't exceed this.
_DEFAULT_TIMEOUT_S = 1800
_POLL_INTERVAL_S = 2.0


@router.post("/score", response_model=AnalysisResult)
async def score_video(
    request: AnalyzeRequest,
    _api_key=Depends(require_api_key),
) -> dict[str, Any]:
    """Submit a video URL and block until the full NeuroPeer report is ready.

    One call. One response body. The caller doesn't need to know about
    WebSockets or poll loops.

    Raises:
        408 — timeout waiting for worker (default 30 min)
        502 — worker reported an error during inference
        4xx — validation errors from AnalyzeRequest
    """
    job_id = str(uuid.uuid4())

    run_analysis.apply_async(
        args=[job_id, request.url, request.content_type.value],
        kwargs={
            "parent_job_id": str(request.parent_job_id) if request.parent_job_id else None,
            "user_email": request.user_email,
            "project_id": str(request.project_id) if request.project_id else None,
            "campaign_id": str(request.campaign_id) if request.campaign_id else None,
        },
        task_id=job_id,
    )
    logger.info("score: queued job %s for %s", job_id, request.url)

    # Poll Redis pubsub mirror / DB until terminal.
    r = await _get_redis()
    deadline = asyncio.get_event_loop().time() + _DEFAULT_TIMEOUT_S
    last_status = "queued"
    while True:
        if asyncio.get_event_loop().time() > deadline:
            raise HTTPException(
                status_code=408,
                detail=f"Timed out after {_DEFAULT_TIMEOUT_S}s waiting on job {job_id}. "
                f"Last observed status: {last_status}",
            )

        # Check for cached terminal result.
        cached = await r.get(f"neuropeer:result:{job_id}")
        if cached:
            logger.info("score: job %s complete", job_id)
            break

        # Fall through to DB check for jobs whose Redis cache expired.
        db_result = await _load_from_db(job_id)
        if db_result:
            logger.info("score: job %s loaded from db", job_id)
            break

        # Check for an error sentinel on the job status channel.
        status_raw = await r.get(f"neuropeer:job:status:{job_id}")
        if status_raw:
            try:
                status_doc = json.loads(status_raw)
            except (TypeError, ValueError):
                status_doc = {}
            last_status = status_doc.get("status", last_status)
            if last_status == "error":
                raise HTTPException(
                    status_code=502,
                    detail=f"NeuroPeer worker failed: {status_doc.get('error') or status_doc.get('message') or 'unknown error'}",
                )

        await asyncio.sleep(_POLL_INTERVAL_S)

    data = await _get_result(job_id)
    return AnalysisResult.model_validate(data).model_dump(mode="json")
