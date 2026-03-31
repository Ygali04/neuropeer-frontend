"""POST /api/v1/analyze — submit a video URL for neural analysis."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from backend.models.schemas import AnalyzeRequest, JobCreatedResponse, JobStatus
from backend.worker.tasks import run_analysis

router = APIRouter(tags=["Analysis"])


@router.post("/analyze", response_model=JobCreatedResponse)
async def submit_analysis(request: AnalyzeRequest) -> JobCreatedResponse:
    job_id = str(uuid.uuid4())

    # Dispatch to Celery worker (non-blocking)
    run_analysis.apply_async(
        args=[job_id, request.url, request.content_type.value],
        kwargs={
            "parent_job_id": str(request.parent_job_id) if request.parent_job_id else None,
            "user_email": request.user_email,
        },
        task_id=job_id,
    )

    return JobCreatedResponse(
        job_id=uuid.UUID(job_id),
        websocket_url=f"/ws/job/{job_id}",
        status=JobStatus.queued,
        parent_job_id=request.parent_job_id,
    )
