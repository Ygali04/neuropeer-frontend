"""NeuroPeer FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import analyze, compare, export, results
from backend.api.routes.campaigns import router as campaigns_router
from backend.api.routes.profile import router as profile_router
from backend.api.websocket import router as ws_router
from backend.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create database tables on startup."""
    from backend.models.db import Base, engine

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

app.include_router(analyze.router, prefix="/api/v1")
app.include_router(results.router, prefix="/api/v1")
app.include_router(compare.router, prefix="/api/v1")
app.include_router(export.router, prefix="/api/v1")
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
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
        s3.head_bucket(Bucket=settings.s3_bucket)
        checks["s3"] = "ok"
    except Exception as e:
        checks["s3"] = f"error: {e}"

    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "ok" if all_ok else "degraded", "checks": checks}
