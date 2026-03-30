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
    r = await _get_redis()
    raw = await r.get(f"neuropeer:result:{job_id}")
    if not raw:
        # Check if job is still processing
        status_raw = await r.get(f"neuropeer:job_status:{job_id}")
        if status_raw:
            status_data = json.loads(status_raw)
            raise HTTPException(
                status_code=202,
                detail={"status": status_data.get("status", "processing"), "message": "Analysis in progress"},
            )
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)


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


@router.get("/results/{job_id}/status")
async def get_status(job_id: UUID) -> dict:
    """Check job status without retrieving full results."""
    r = await _get_redis()
    raw = await r.get(f"neuropeer:job_status:{str(job_id)}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)
