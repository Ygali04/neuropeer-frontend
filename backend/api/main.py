"""NeuroPeer FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import analyze, compare, export, results
from backend.api.routes.campaigns import router as campaigns_router
from backend.api.routes.profile import router as profile_router
from backend.api.routes.projects import router as projects_router
from backend.api.websocket import router as ws_router
from backend.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables + run migrations on startup."""
    from sqlalchemy import text
    from backend.models.db import Base, engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns that create_all won't add to existing tables
        for sql in [
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_neural_score_total FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_hook_score FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_sustained_attention FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_emotional_resonance FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_memory_encoding FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_aesthetic_quality FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS full_cognitive_accessibility FLOAT",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS content_types_json JSONB",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS metric_relevance_json JSONB",
            "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_regen_count INTEGER DEFAULT 0",
        ]:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass
    yield
    await engine.dispose()


app = FastAPI(
    title="NeuroPeer API",
    description="Neural Simulation Engine for GTM Content Optimization — powered by Meta TRIBE v2",
    version="1.0.0",
    lifespan=lifespan,
)

# Allow the Vercel frontend + localhost for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://neuropeer.app",
        "https://*.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router, prefix="/api/v1")
app.include_router(results.router, prefix="/api/v1")
app.include_router(compare.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(ws_router)


@app.get("/health")
async def health() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "neuropeer"}


@app.get("/debug/flush-cache/{job_id}")
async def debug_flush_cache(job_id: str) -> dict:
    """Flush the Redis cache for a specific job."""
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    deleted = await r.delete(f"neuropeer:result:{job_id}")
    await r.aclose()
    return {"flushed": job_id, "deleted": deleted}


@app.get("/debug/recompute/{job_id}")
async def debug_recompute(job_id: str) -> dict:
    """Recompute scores for a specific job (bypasses all caching)."""
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    raw = await r.get(f"neuropeer:result:{job_id}")
    await r.aclose()
    if not raw:
        return {"error": "not in cache"}
    import json as _json
    cached = _json.loads(raw)
    metrics_data = cached.get("metrics", [])
    if not metrics_data:
        return {"error": "no metrics in cache"}
    from backend.pipeline.metric_engine import MetricResult
    from backend.pipeline.neural_score import compute_neural_score
    from backend.models.schemas import ContentType
    metric_objs = [MetricResult(**m) for m in metrics_data]
    ct = ContentType(cached.get("content_type", "custom"))
    recomputed = compute_neural_score(metric_objs, content_types=[ct])
    return recomputed.model_dump()


@app.get("/debug/reset-regen-counts")
async def debug_reset_regen_counts() -> dict:
    """Reset ai_regen_count to 0 for all results (admin use after bulk refresh)."""
    from sqlalchemy import text, update
    from backend.models.db import Result, engine
    from sqlalchemy.ext.asyncio import async_sessionmaker
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        await session.execute(update(Result).values(ai_regen_count=0))
        await session.commit()
    return {"status": "ok", "message": "All regen counts reset to 0"}


@app.get("/debug/score-test")
async def debug_score_test() -> dict:
    """Test the scoring engine."""
    from backend.pipeline.metric_engine import MetricResult
    from backend.pipeline.neural_score import compute_neural_score
    from backend.models.schemas import ContentType
    m = MetricResult(name="Hook Score", score=50.0, raw_value=0.0, description="x", brain_region="y", gtm_proxy="z")
    result = compute_neural_score([m], content_types=[ContentType.product_demo])
    return result.model_dump()


@app.get("/health/deep")
async def health_deep() -> dict:
    """Deep health check — verifies DB, Redis, S3 connectivity."""
    checks = {}

    # PostgreSQL
    try:
        from sqlalchemy import text

        from backend.models.db import engine

        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Redis
    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.redis_url)
        await r.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    # S3
    try:
        import boto3

        s3 = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.aws_access_key_id or None,
            aws_secret_access_key=settings.aws_secret_access_key or None,
            region_name=settings.aws_region,
        )
        # Use list_objects instead of head_bucket (B2 returns 403 on HeadBucket)
        s3.list_objects_v2(Bucket=settings.s3_bucket, MaxKeys=1)
        checks["s3"] = "ok"
    except Exception as e:
        checks["s3"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "ok" if all_ok else "degraded", "checks": checks}
