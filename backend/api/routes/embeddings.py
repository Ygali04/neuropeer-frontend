"""Synchronous cortical-embedding endpoint.

kwale.ai's developer-API primitive is the **cortical embedding** — the
per-timestep prediction over the 20,484 fsaverage5 cortical vertices that the
pipeline computes (and, today, mostly discards in favor of a marketing score).

``POST /api/v1/embeddings`` exposes that embedding as a first-class output:

    1. Enqueue the same Celery task /api/v1/score uses (no new pipeline path)
    2. Poll Redis + Postgres until the worker publishes a terminal result
    3. Load the full predictions .npz the worker already wrote to S3
    4. Return a compact per-modality summary (shape + per-vertex mean/L2-norm
       vectors + the s3:// URI of the full .npz). When ``return_full=true``,
       also inline the full (n_timesteps, 20484) arrays.

Auth: standard X-API-Key header via ``require_api_key`` — identical to /score.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from backend.api.middleware.api_key import require_api_key
from backend.api.routes.results import _get_redis, _get_result, _load_from_db
from backend.config import settings
from backend.models.schemas import (
    ContentType,
    EmbeddingsRequest,
    EmbeddingsResponse,
    ModalityEmbeddingSummary,
)
from backend.worker.tasks import run_analysis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Embeddings"])

# Hard ceiling — TRIBE v2 on a fresh GPU shouldn't exceed this.
_DEFAULT_TIMEOUT_S = 1800
_POLL_INTERVAL_S = 2.0


async def _await_job(job_id: str) -> dict:
    """Block until the worker finishes ``job_id``; return the result dict.

    Mirrors the poll loop in /score: Redis cache → Postgres fallback → error
    sentinel. Raises 408 on timeout, 502 on worker error.
    """
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

        cached = await r.get(f"neuropeer:result:{job_id}")
        if cached:
            break

        db_result = await _load_from_db(job_id)
        if db_result:
            break

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
                    detail=f"NeuroPeer worker failed: "
                    f"{status_doc.get('error') or status_doc.get('message') or 'unknown error'}",
                )

        await asyncio.sleep(_POLL_INTERVAL_S)

    return await _get_result(job_id)


def _summarize_predictions(
    predictions: dict, *, return_full: bool
) -> list[ModalityEmbeddingSummary]:
    """Build per-modality embedding summaries from a {modality: array} dict.

    Each array is (n_timesteps, n_vertices). ``mean`` and ``l2_norm`` collapse
    the time axis to per-vertex vectors (length n_vertices). The full array is
    inlined only when ``return_full`` is set.
    """
    summaries: list[ModalityEmbeddingSummary] = []
    for modality, arr in predictions.items():
        modality_value = getattr(modality, "value", str(modality))
        arr = np.asarray(arr, dtype=np.float32)
        if arr.ndim != 2:
            arr = arr.reshape(arr.shape[0] if arr.ndim else 0, -1)
        n_timesteps, n_vertices = (arr.shape if arr.ndim == 2 else (0, 0))
        mean_vec = arr.mean(axis=0) if n_timesteps else np.zeros(n_vertices, dtype=np.float32)
        l2_vec = (
            np.linalg.norm(arr, axis=0)
            if n_timesteps
            else np.zeros(n_vertices, dtype=np.float32)
        )
        summaries.append(
            ModalityEmbeddingSummary(
                modality=modality_value,
                n_timesteps=int(n_timesteps),
                n_vertices=int(n_vertices),
                mean=mean_vec.astype(float).tolist(),
                l2_norm=l2_vec.astype(float).tolist(),
                vertices=arr.astype(float).tolist() if return_full else None,
            )
        )
    return summaries


@router.post("/embeddings", response_model=EmbeddingsResponse)
async def embeddings(
    request: EmbeddingsRequest,
    _api_key=Depends(require_api_key),
) -> EmbeddingsResponse:
    """Submit a video URL and block until its cortical embedding is ready.

    Returns the 20,484-vertex fsaverage5 cortical embedding produced by the
    active :class:`CorticalScorer`. By default the response is compact (shape +
    per-vertex mean/L2-norm vectors + the s3:// URI of the full .npz). Pass
    ``return_full=true`` to inline the full per-modality arrays.

    Raises:
        408 — timeout waiting for worker.
        502 — worker reported an error during inference.
        404 — pipeline finished but wrote no vertex predictions.
    """
    # Lazy import keeps boto3 out of the import graph for unit tests that mock it.
    from backend.pipeline.remote_gpu import _s3_download_predictions

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
    logger.info("embeddings: queued job %s for %s", job_id, request.url)

    result = await _await_job(job_id)

    vertex_key = result.get("vertex_data_s3_key")
    if not vertex_key:
        raise HTTPException(
            status_code=404,
            detail=f"Job {job_id} produced no cortical predictions (no vertex_data_s3_key).",
        )

    # Load the full predictions .npz the worker already wrote. Run the blocking
    # S3 download off the event loop.
    try:
        predictions = await asyncio.to_thread(_s3_download_predictions, vertex_key)
    except Exception as exc:  # noqa: BLE001 — surface storage failures clearly
        logger.warning("embeddings: failed to load %s: %s", vertex_key, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to load cortical predictions from storage: {exc}",
        ) from exc

    summaries = _summarize_predictions(predictions, return_full=request.return_full)

    return EmbeddingsResponse(
        job_id=uuid.UUID(job_id),
        url=result.get("url", request.url),
        content_type=ContentType(result.get("content_type", request.content_type.value)),
        duration_seconds=float(result.get("duration_seconds", 0.0)),
        scorer_backend=settings.scorer_backend,
        vertex_data_s3_key=vertex_key,
        vertex_data_uri=f"s3://{settings.s3_bucket}/{vertex_key}",
        return_full=request.return_full,
        modalities=summaries,
    )
