"""GET /api/v1/results/{job_id} — retrieve analysis results."""

from __future__ import annotations

import json
from uuid import UUID

import numpy as np
import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.models.schemas import AnalysisResult, BrainMapFrame

router = APIRouter(tags=["Results"])


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


async def _get_result(job_id: str) -> dict:
    """
    Retrieve result from Redis (fast cache) first, then fall back to
    PostgreSQL (permanent storage) if the cache has expired.
    """
    r = await _get_redis()
    raw = await r.get(f"neuropeer:result:{job_id}")
    if raw:
        return json.loads(raw)

    # Redis miss — try PostgreSQL (permanent storage)
    result = await _load_from_db(job_id)
    if result:
        # Re-populate Redis cache for future requests (7 day TTL)
        await r.set(f"neuropeer:result:{job_id}", json.dumps(result), ex=60 * 60 * 24 * 7)
        return result

    # Check if job is still processing
    status_raw = await r.get(f"neuropeer:job_status:{job_id}")
    if status_raw:
        status_data = json.loads(status_raw)
        raise HTTPException(
            status_code=202,
            detail={"status": status_data.get("status", "processing"), "message": "Analysis in progress"},
        )
    raise HTTPException(status_code=404, detail="Job not found")


async def _load_from_db(job_id: str) -> dict | None:
    """Load a completed result from PostgreSQL and reconstruct the full result dict."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, Result

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            from uuid import UUID as _UUID
            stmt = select(Job, Result).join(Result, Result.job_id == Job.id).where(Job.id == _UUID(job_id))
            row = (await session.execute(stmt)).first()
            if not row:
                return None

            job, res = row

            # Reconstruct timeseries from S3 if available
            attention_curve: list[float] = []
            arousal_curve: list[float] = []
            cog_curve: list[float] = []
            if res.timeseries_s3_key:
                try:
                    import io
                    import boto3
                    import numpy as np
                    s3 = boto3.client(
                        "s3",
                        endpoint_url=settings.s3_endpoint_url or None,
                        aws_access_key_id=settings.aws_access_key_id or None,
                        aws_secret_access_key=settings.aws_secret_access_key or None,
                        region_name=settings.aws_region,
                    )
                    response = s3.get_object(Bucket=settings.s3_bucket, Key=res.timeseries_s3_key)
                    data = np.load(io.BytesIO(response["Body"].read()))
                    attention_curve = data["attention"].tolist()
                    arousal_curve = data["arousal"].tolist()
                    cog_curve = data["cognitive_load"].tolist()
                except Exception:
                    pass  # timeseries unavailable — return empty arrays

            return {
                "job_id": str(job.id),
                "url": job.url,
                "content_type": job.content_type,
                "duration_seconds": res.duration_seconds,
                "neural_score": {
                    "total": res.neural_score_total,
                    "hook_score": res.hook_score,
                    "sustained_attention": res.sustained_attention,
                    "emotional_resonance": res.emotional_resonance,
                    "memory_encoding": res.memory_encoding,
                    "aesthetic_quality": res.aesthetic_quality,
                    "cognitive_accessibility": res.cognitive_accessibility,
                },
                "metrics": res.metrics_json or [],
                "attention_curve": attention_curve,
                "emotional_arousal_curve": arousal_curve,
                "cognitive_load_curve": cog_curve,
                "key_moments": res.key_moments_json or [],
                "modality_breakdown": res.modality_json or [],
                "vertex_data_s3_key": res.vertex_data_s3_key,
                "timeseries_s3_key": res.timeseries_s3_key,
                "overarching_summary": res.overarching_summary or res.ai_summary or "",
                "ai_summary": res.ai_summary or "",
                "ai_report_title": res.ai_report_title or "",
                "ai_action_items": res.ai_action_items or [],
                "ai_priorities": res.ai_priorities or [],
                "ai_category_strategies": res.ai_category_strategies or {},
                "ai_metric_tips": res.ai_metric_tips or {},
                "parent_job_id": str(job.parent_job_id) if job.parent_job_id else None,
                "content_group_id": str(job.content_group_id) if job.content_group_id else None,
            }
    except Exception:
        return None
    finally:
        await engine.dispose()


@router.get("/results/{job_id}", response_model=AnalysisResult)
async def get_result(job_id: UUID) -> dict:
    """Retrieve the full neural analysis report."""
    data = await _get_result(str(job_id))
    # Re-validate through Pydantic before returning
    return AnalysisResult.model_validate(data).model_dump()


@router.get("/results/{job_id}/timeseries")
async def get_timeseries(job_id: UUID) -> dict:
    """Retrieve per-second attention, arousal, and cognitive load curves."""
    result = await _get_result(str(job_id))
    return {
        "job_id": str(job_id),
        "attention_curve": result["attention_curve"],
        "emotional_arousal_curve": result["emotional_arousal_curve"],
        "cognitive_load_curve": result["cognitive_load_curve"],
        "duration_seconds": result["duration_seconds"],
    }


@router.get("/results/{job_id}/brain-map")
async def get_brain_map(job_id: UUID, timestamp: float = 0.0) -> dict:
    """
    Retrieve vertex-level activation for 3D cortical surface rendering.
    Loads the predictions .npz from S3 and returns the frame at `timestamp`.
    """
    import io

    import boto3

    result = await _get_result(str(job_id))
    s3_key = result.get("vertex_data_s3_key")
    if not s3_key:
        raise HTTPException(status_code=404, detail="Vertex data not available")

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        region_name=settings.aws_region,
    )
    response = s3.get_object(Bucket=settings.s3_bucket, Key=s3_key)
    data = np.load(io.BytesIO(response["Body"].read()))
    full_predictions = data["full"]  # (n_timesteps, 20484)

    t_idx = min(int(timestamp), full_predictions.shape[0] - 1)
    vertex_activations = full_predictions[t_idx].tolist()

    return BrainMapFrame(
        timestamp=float(t_idx),
        vertex_activations=vertex_activations,
    ).model_dump()


@router.get("/results/{job_id}/history")
async def get_run_history(job_id: UUID) -> dict:
    """Get all runs in the same content group as this job."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, Result

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        # Find the content_group_id for this job
        stmt = select(Job).where(Job.id == job_id)
        job = (await session.execute(stmt)).scalar_one_or_none()
        if not job:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Job not found")

        group_id = job.content_group_id

        # Fetch all jobs in the same group
        stmt = (
            select(Job, Result.neural_score_total)
            .outerjoin(Result, Result.job_id == Job.id)
            .where(Job.content_group_id == group_id)
            .order_by(Job.created_at.asc())
        )
        rows = (await session.execute(stmt)).all()

    await engine.dispose()

    runs = []
    for row_job, score in rows:
        runs.append({
            "job_id": str(row_job.id),
            "url": row_job.url,
            "neural_score": round(score) if score else 0,
            "created_at": row_job.created_at.isoformat() if row_job.created_at else "",
            "parent_job_id": str(row_job.parent_job_id) if row_job.parent_job_id else None,
            "is_current": str(row_job.id) == str(job_id),
        })

    return {
        "content_group_id": str(group_id),
        "runs": runs,
    }


@router.get("/results/{job_id}/status")
async def get_status(job_id: UUID) -> dict:
    """Check job status without retrieving full results."""
    r = await _get_redis()
    raw = await r.get(f"neuropeer:job_status:{str(job_id)}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)
