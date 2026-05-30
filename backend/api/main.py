"""NeuroPeer FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.middleware.api_key import require_api_key
from backend.api.routes import analyze, compare, embeddings, export, results, score
from backend.api.routes.campaigns import router as campaigns_router
from backend.api.routes.keys import router as keys_router
from backend.api.routes.profile import router as profile_router
from backend.api.routes.projects import router as projects_router
from backend.api.routes.upload import router as upload_router
from backend.api.websocket import router as ws_router
from backend.config import settings
from backend.observability.tracing import setup_tracing


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    from backend.models.db import Base, engine

    # OTel tracing — safe no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
    setup_tracing(app)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
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

# API-key auth gates ONLY the endpoints that spend GPU compute (analyze /
# score / compare). Report reads (/results/*) are intentionally public so a
# scored video's permalink works for anyone who has the URL — the original
# product promise. Campaigns / projects / profile / export stay open for
# the first-party frontend.
_auth = [Depends(require_api_key)]
app.include_router(analyze.router, prefix="/api/v1", dependencies=_auth)
app.include_router(upload_router, prefix="/api/v1", dependencies=_auth)
app.include_router(score.router, prefix="/api/v1")  # auth handled in-route
app.include_router(embeddings.router, prefix="/api/v1")  # auth handled in-route
app.include_router(results.router, prefix="/api/v1")  # public read
app.include_router(compare.router, prefix="/api/v1", dependencies=_auth)
app.include_router(export.router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(projects_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
# API-key management — gated by ADMIN_API_TOKEN bearer (kwale dashboard only).
app.include_router(keys_router, prefix="/api/v1")
app.include_router(ws_router)


@app.get("/health")
async def health() -> dict:
    """Basic health check."""
    return {"status": "ok", "service": "neuropeer"}


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
# noop 1776236994
