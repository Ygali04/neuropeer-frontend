"""POST /api/v1/analyze — submit a video URL for neural analysis."""

from __future__ import annotations

import uuid as _uuid
from datetime import UTC, datetime

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import Job
from backend.models.schemas import AnalyzeRequest, JobCreatedResponse, JobStatus
from backend.worker.tasks import run_analysis

router = APIRouter(tags=["Analysis"])


@router.post("/analyze", response_model=JobCreatedResponse)
async def submit_analysis(request: AnalyzeRequest) -> JobCreatedResponse:
    job_id = str(_uuid.uuid4())

    # Create the Job row immediately so it appears on the dashboard
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        session.add(Job(
            id=_uuid.UUID(job_id),
            url=request.url,
            content_type=request.content_type.value,
            status="queued",
            created_at=datetime.now(UTC).replace(tzinfo=None),
            user_email=request.user_email,
            parent_job_id=_uuid.UUID(str(request.parent_job_id)) if request.parent_job_id else None,
            content_group_id=_uuid.uuid4(),
            project_id=_uuid.UUID(str(request.project_id)) if request.project_id else None,
            campaign_id=_uuid.UUID(str(request.campaign_id)) if request.campaign_id else None,
        ))
        await session.commit()
    await engine.dispose()

    # Dispatch to Celery worker (non-blocking)
    run_analysis.apply_async(
        args=[job_id, request.url, request.content_type.value],
        kwargs={
            "parent_job_id": str(request.parent_job_id) if request.parent_job_id else None,
            "user_email": request.user_email,
            "project_id": str(request.project_id) if request.project_id else None,
            "campaign_id": str(request.campaign_id) if request.campaign_id else None,
            "content_types": [ct.value for ct in request.content_types] if request.content_types else None,
        },
        task_id=job_id,
    )

    return JobCreatedResponse(
        job_id=_uuid.UUID(job_id),
        websocket_url=f"/ws/job/{job_id}",
        status=JobStatus.queued,
        parent_job_id=request.parent_job_id,
    )
