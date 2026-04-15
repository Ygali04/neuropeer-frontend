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
        cached = json.loads(raw)
        # Backfill targeted/full scores for legacy cached results
        ns = cached.get("neural_score", {})
        # Always recompute targeted/full scores from stored metrics
        if cached.get("metrics"):
            try:
                from backend.pipeline.metric_engine import MetricResult
                from backend.pipeline.neural_score import compute_neural_score
                from backend.models.schemas import ContentType

                metric_objs = [MetricResult(**m) for m in cached["metrics"]]
                ct = ContentType(cached.get("content_type", "custom"))
                recomputed = compute_neural_score(metric_objs, content_types=[ct])
                cached["neural_score"] = recomputed.model_dump()
                # Update Redis cache too
                await r.set(f"neuropeer:result:{job_id}", json.dumps(cached), ex=60 * 60 * 24 * 7)
            except Exception as exc:
                # Surface the error in the response for debugging
                cached["_scoring_error"] = f"{type(exc).__name__}: {exc}"
        return cached

    # Redis miss — try PostgreSQL (permanent storage)
    result = await _load_from_db(job_id)
    if result:
        # Re-populate Redis cache for future requests (7 day TTL)
        await r.set(f"neuropeer:result:{job_id}", json.dumps(result), ex=60 * 60 * 24 * 7)
        return result

    # Check if this job was auto-retried → redirect to new job
    retry_raw = await r.get(f"neuropeer:retry:{job_id}")
    if retry_raw:
        retry_data = json.loads(retry_raw)
        raise HTTPException(
            status_code=301,
            detail={"new_job_id": retry_data["new_job_id"], "reason": retry_data.get("reason", "GPU error")},
            headers={"Location": f"/api/v1/results/{retry_data['new_job_id']}"},
        )

    # Check if job is still processing or failed
    status_raw = await r.get(f"neuropeer:job_status:{job_id}")
    if status_raw:
        status_data = json.loads(status_raw)
        job_status = status_data.get("status", "processing")
        if job_status == "error":
            error_msg = status_data.get("error", "Analysis failed")
            raise HTTPException(status_code=500, detail=error_msg)
        raise HTTPException(
            status_code=202,
            detail={"status": job_status, "message": "Analysis in progress"},
        )

    # Check DB for job status
    from sqlalchemy import select as _sel
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from backend.models.db import Job
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        from uuid import UUID as _UUID
        job = (await session.execute(_sel(Job).where(Job.id == _UUID(job_id)))).scalar_one_or_none()
    await engine.dispose()
    if job:
        if job.status == "error":
            raise HTTPException(status_code=500, detail="Analysis failed — GPU provisioning error")
        raise HTTPException(status_code=202, detail={"status": job.status, "message": "Analysis in progress"})

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

            # Compute targeted + full scores on-the-fly for legacy reports
            neural_score_data = {
                "total": res.neural_score_total,
                "hook_score": res.hook_score,
                "sustained_attention": res.sustained_attention,
                "emotional_resonance": res.emotional_resonance,
                "memory_encoding": res.memory_encoding,
                "aesthetic_quality": res.aesthetic_quality,
                "cognitive_accessibility": res.cognitive_accessibility,
                "full_total": res.full_neural_score_total,
                "full_hook_score": res.full_hook_score,
                "full_sustained_attention": res.full_sustained_attention,
                "full_emotional_resonance": res.full_emotional_resonance,
                "full_memory_encoding": res.full_memory_encoding,
                "full_aesthetic_quality": res.full_aesthetic_quality,
                "full_cognitive_accessibility": res.full_cognitive_accessibility,
                "content_types": res.content_types_json,
                "targeted_dimensions": None,
                "metric_relevance": res.metric_relevance_json,
            }

            # Backfill for legacy reports — always recompute to get targeted_dimensions
            if res.metrics_json:
                try:
                    from backend.pipeline.metric_engine import MetricResult
                    from backend.pipeline.neural_score import compute_neural_score
                    from backend.models.schemas import ContentType

                    metric_objs = [MetricResult(**m) for m in res.metrics_json]
                    ct = ContentType(job.content_type) if job.content_type else ContentType.custom
                    recomputed = compute_neural_score(metric_objs, content_types=[ct])
                    neural_score_data.update({
                        "total": recomputed.total,
                        "hook_score": recomputed.hook_score,
                        "sustained_attention": recomputed.sustained_attention,
                        "emotional_resonance": recomputed.emotional_resonance,
                        "memory_encoding": recomputed.memory_encoding,
                        "aesthetic_quality": recomputed.aesthetic_quality,
                        "cognitive_accessibility": recomputed.cognitive_accessibility,
                        "full_total": recomputed.full_total,
                        "full_hook_score": recomputed.full_hook_score,
                        "full_sustained_attention": recomputed.full_sustained_attention,
                        "full_emotional_resonance": recomputed.full_emotional_resonance,
                        "full_memory_encoding": recomputed.full_memory_encoding,
                        "full_aesthetic_quality": recomputed.full_aesthetic_quality,
                        "full_cognitive_accessibility": recomputed.full_cognitive_accessibility,
                        "content_types": recomputed.content_types,
                        "targeted_dimensions": recomputed.targeted_dimensions,
                        "metric_relevance": recomputed.metric_relevance,
                    })
                except Exception:
                    import traceback
                    traceback.print_exc()

            return {
                "job_id": str(job.id),
                "url": job.url,
                "content_type": job.content_type,
                "duration_seconds": res.duration_seconds,
                "neural_score": neural_score_data,
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


@router.post("/results/{job_id}/regenerate-feedback")
async def regenerate_feedback(job_id: UUID) -> dict:
    """Regenerate AI feedback for a report. Limited to 3 user-triggered regenerations."""
    from sqlalchemy import select as _select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from backend.models.db import Job, Result
    from backend.pipeline.ai_feedback import generate_ai_feedback

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        stmt = _select(Job, Result).join(Result, Result.job_id == Job.id).where(Job.id == job_id)
        row = (await session.execute(stmt)).first()
        if not row:
            await engine.dispose()
            raise HTTPException(404, "Report not found")
        job, res = row

        # Check regeneration limit
        count = res.ai_regen_count or 0
        if count >= 3:
            await engine.dispose()
            raise HTTPException(429, "AI feedback regeneration limit reached (3/3)")

        # Build the result dict for the AI feedback generator
        result_data = {
            "neural_score": {
                "total": res.neural_score_total, "hook_score": res.hook_score,
                "sustained_attention": res.sustained_attention, "emotional_resonance": res.emotional_resonance,
                "memory_encoding": res.memory_encoding, "aesthetic_quality": res.aesthetic_quality,
                "cognitive_accessibility": res.cognitive_accessibility,
            },
            "metrics": res.metrics_json or [],
            "key_moments": res.key_moments_json or [],
            "content_type": job.content_type,
            "duration_seconds": res.duration_seconds,
        }

        # Recompute scores with targeted system before generating feedback
        try:
            from backend.pipeline.metric_engine import MetricResult
            from backend.pipeline.neural_score import compute_neural_score
            from backend.models.schemas import ContentType
            metric_objs = [MetricResult(**m) for m in res.metrics_json]
            ct = ContentType(job.content_type) if job.content_type else ContentType.custom
            recomputed = compute_neural_score(metric_objs, content_types=[ct])
            result_data["neural_score"] = recomputed.model_dump()
        except Exception:
            pass

        # Generate new feedback
        feedback = generate_ai_feedback(result_data)
        if not feedback:
            await engine.dispose()
            raise HTTPException(500, "AI feedback generation failed")

        # Update the Result row
        res.ai_summary = feedback.get("summary") or res.ai_summary
        res.ai_report_title = feedback.get("report_title") or res.ai_report_title
        res.ai_action_items = feedback.get("action_items") or res.ai_action_items
        res.ai_priorities = feedback.get("priorities") or res.ai_priorities
        res.ai_category_strategies = feedback.get("category_strategies") or res.ai_category_strategies
        res.ai_metric_tips = feedback.get("metric_tips") or res.ai_metric_tips
        res.ai_regen_count = count + 1
        await session.commit()

    await engine.dispose()

    # Invalidate Redis cache so next load picks up new feedback
    r = await _get_redis()
    await r.delete(f"neuropeer:result:{job_id}")

    return {
        "job_id": str(job_id),
        "regenerations_used": count + 1,
        "regenerations_remaining": 3 - (count + 1),
        "summary": feedback.get("summary", ""),
        "report_title": feedback.get("report_title", ""),
    }


@router.delete("/results/{job_id}")
async def delete_report(job_id: UUID) -> dict:
    """Delete a report (Job + Result rows) and clear its cache."""
    from sqlalchemy import select as _sel, delete as _del
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from backend.models.db import Job, Result

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        job = (await session.execute(_sel(Job).where(Job.id == job_id))).scalar_one_or_none()
        if not job:
            await engine.dispose()
            raise HTTPException(404, "Report not found")
        await session.execute(_del(Result).where(Result.job_id == job_id))
        await session.execute(_del(Job).where(Job.id == job_id))
        await session.commit()
    await engine.dispose()

    r = await _get_redis()
    await r.delete(f"neuropeer:result:{job_id}")
    await r.delete(f"neuropeer:job_status:{job_id}")

    return {"deleted": str(job_id)}


@router.put("/results/{job_id}/title")
async def set_report_title(job_id: UUID, body: dict) -> dict:
    """Set a custom title for a report."""
    from sqlalchemy import select as _select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from backend.models.db import Job, Result

    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Title cannot be empty")

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        job = (await session.execute(_select(Job).where(Job.id == job_id))).scalar_one_or_none()
        if not job:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Job not found")
        job.label = title

        # Also update ai_report_title in Result
        result = (await session.execute(_select(Result).where(Result.job_id == job_id))).scalar_one_or_none()
        if result:
            result.ai_report_title = title

        await session.commit()

    # Update Redis cache if it exists
    r = await _get_redis()
    raw = await r.get(f"neuropeer:result:{str(job_id)}")
    if raw:
        data = json.loads(raw)
        data["ai_report_title"] = title
        await r.set(f"neuropeer:result:{str(job_id)}", json.dumps(data), ex=60 * 60 * 24 * 7)

    await engine.dispose()
    return {"job_id": str(job_id), "title": title}


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
    from sqlalchemy import select as _sel, text as _text
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            # Use raw SQL to avoid SQLAlchemy model column mismatches
            row = (await session.execute(
                _text("SELECT content_group_id FROM jobs WHERE id = :jid"),
                {"jid": str(job_id)}
            )).first()
            if not row:
                raise HTTPException(status_code=404, detail="Job not found")

            group_id = str(row[0])

            # Fetch all jobs in the same group with scores
            result = await session.execute(
                _text("""
                    SELECT j.id, j.url, r.neural_score_total, j.created_at, j.parent_job_id
                    FROM jobs j
                    LEFT JOIN results r ON r.job_id = j.id
                    WHERE j.content_group_id = :gid AND j.status = 'complete'
                    ORDER BY j.created_at ASC
                """),
                {"gid": group_id}
            )
            rows = result.all()

            runs = []
            for jid, url, db_score, created_at, parent_jid in rows:
                runs.append({
                    "job_id": str(jid),
                    "url": url or "",
                    "neural_score": round(float(db_score), 1) if db_score else 0.0,
                    "created_at": created_at.isoformat() if created_at else "",
                    "parent_job_id": str(parent_jid) if parent_jid else None,
                    "is_current": str(jid) == str(job_id),
                })

        await engine.dispose()

        # Enrich with full-precision scores from Redis
        try:
            r = aioredis.from_url(settings.redis_url, decode_responses=True)
            for run in runs:
                cached_raw = await r.get(f"neuropeer:result:{run['job_id']}")
                if cached_raw:
                    cached = json.loads(cached_raw)
                    run["neural_score"] = round(float(cached.get("neural_score", {}).get("total", run["neural_score"])), 1)
            await r.aclose()
        except Exception:
            pass

        return {"content_group_id": group_id, "runs": runs}

    except HTTPException:
        raise
    except Exception as exc:
        await engine.dispose()
        raise HTTPException(status_code=500, detail=f"History error: {str(exc)[:200]}")


@router.get("/results/{job_id}/status")
async def get_status(job_id: UUID) -> dict:
    """Check job status without retrieving full results."""
    r = await _get_redis()
    raw = await r.get(f"neuropeer:job_status:{str(job_id)}")
    if not raw:
        raise HTTPException(status_code=404, detail="Job not found")
    return json.loads(raw)
