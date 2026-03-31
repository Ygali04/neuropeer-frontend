"""Campaign management endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import json

import redis.asyncio as aioredis

from backend.config import settings
from backend.models.db import Job, Result

router = APIRouter(tags=["Campaigns"])


class AssignRequest(BaseModel):
    job_id: str
    user_email: str
    campaign_name: str | None = None


@router.post("/campaigns/assign")
async def assign_job_to_user(body: AssignRequest) -> dict:
    """Assign a job to a user's profile and optionally name the campaign."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        stmt = select(Job).where(Job.id == UUID(body.job_id))
        job = (await session.execute(stmt)).scalar_one_or_none()
        if not job:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Job not found")
        job.user_email = body.user_email
        if body.campaign_name:
            job.campaign_name = body.campaign_name
        await session.commit()

    await engine.dispose()
    return {"job_id": body.job_id, "user_email": body.user_email, "campaign_name": body.campaign_name}


class RenameRequest(BaseModel):
    name: str


@router.get("/campaigns")
async def list_campaigns(user_email: str | None = None) -> list[dict]:
    """List all campaigns for a user, with scores and deltas."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        base_filter = [Job.status == "complete"]
        if user_email:
            base_filter.append(Job.user_email == user_email)

        groups_stmt = (
            select(
                Job.content_group_id,
                func.min(Job.campaign_name).label("campaign_name"),
                func.count(Job.id).label("media_count"),
                func.min(Job.content_type).label("content_type"),
                func.min(Job.created_at).label("created_at"),
                func.max(Job.created_at).label("latest_at"),
            )
            .where(*base_filter)
            .group_by(Job.content_group_id)
            .order_by(func.max(Job.created_at).desc())
        )
        groups = (await session.execute(groups_stmt)).all()

        # Redis for reading cached scores (source of truth for frontend)
        r = aioredis.from_url(settings.redis_url, decode_responses=True)

        campaigns = []
        for cg_id, name, count, ct, created, latest in groups:
            # Get latest and first job IDs
            latest_job_stmt = (
                select(Job.id)
                .where(Job.content_group_id == cg_id, Job.status == "complete")
                .order_by(Job.created_at.desc())
                .limit(1)
            )
            latest_job_id = (await session.execute(latest_job_stmt)).scalar_one_or_none()

            first_job_stmt = (
                select(Job.id)
                .where(Job.content_group_id == cg_id, Job.status == "complete")
                .order_by(Job.created_at.asc())
                .limit(1)
            )
            first_job_id = (await session.execute(first_job_stmt)).scalar_one_or_none()

            # Read scores from Redis first (matches what frontend report shows), fall back to DB
            latest_score = 0
            first_score = 0

            if latest_job_id:
                raw = await r.get(f"neuropeer:result:{latest_job_id}")
                if raw:
                    latest_score = json.loads(raw).get("neural_score", {}).get("total", 0)
                else:
                    res = (await session.execute(select(Result.neural_score_total).where(Result.job_id == latest_job_id))).scalar_one_or_none()
                    latest_score = res or 0

            if first_job_id:
                raw = await r.get(f"neuropeer:result:{first_job_id}")
                if raw:
                    first_score = json.loads(raw).get("neural_score", {}).get("total", 0)
                else:
                    res = (await session.execute(select(Result.neural_score_total).where(Result.job_id == first_job_id))).scalar_one_or_none()
                    first_score = res or 0

            await r.aclose()

            campaigns.append({
                "content_group_id": str(cg_id),
                "campaign_name": name,
                "media_count": count,
                "latest_score": round(latest_score, 1),
                "first_score": round(first_score, 1),
                "delta": round(latest_score - first_score, 1),
                "content_type": ct or "custom",
                "created_at": created.isoformat() if created else "",
                "latest_at": latest.isoformat() if latest else "",
                "latest_job_id": str(latest_job_id) if latest_job_id else None,
            })

    await engine.dispose()
    return campaigns


@router.delete("/campaigns/{content_group_id}")
async def delete_campaign(content_group_id: UUID) -> dict:
    """Delete a campaign and all its jobs/results."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        # Delete results first (FK constraint)
        jobs_stmt = select(Job.id).where(Job.content_group_id == content_group_id)
        job_ids = (await session.execute(jobs_stmt)).scalars().all()
        if not job_ids:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Campaign not found")

        from sqlalchemy import delete as sql_delete
        await session.execute(sql_delete(Result).where(Result.job_id.in_(job_ids)))
        await session.execute(sql_delete(Job).where(Job.content_group_id == content_group_id))
        await session.commit()

    # Clean Redis cache
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    for jid in job_ids:
        await r.delete(f"neuropeer:result:{jid}")
        await r.delete(f"neuropeer:job_status:{jid}")
    await r.aclose()

    await engine.dispose()
    return {"deleted": len(job_ids), "content_group_id": str(content_group_id)}


@router.post("/campaigns/bulk-delete")
async def bulk_delete_campaigns(body: dict) -> dict:
    """Delete multiple campaigns at once. Body: {"content_group_ids": ["uuid", ...]}"""
    ids = body.get("content_group_ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No campaign IDs provided")

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    total_deleted = 0

    async with Session() as session:
        for cg_id in ids:
            jobs_stmt = select(Job.id).where(Job.content_group_id == UUID(cg_id))
            job_ids = (await session.execute(jobs_stmt)).scalars().all()
            if job_ids:
                from sqlalchemy import delete as sql_delete
                await session.execute(sql_delete(Result).where(Result.job_id.in_(job_ids)))
                await session.execute(sql_delete(Job).where(Job.content_group_id == UUID(cg_id)))
                total_deleted += len(job_ids)

                r = aioredis.from_url(settings.redis_url, decode_responses=True)
                for jid in job_ids:
                    await r.delete(f"neuropeer:result:{jid}")
                    await r.delete(f"neuropeer:job_status:{jid}")
                await r.aclose()

        await session.commit()

    await engine.dispose()
    return {"deleted_jobs": total_deleted, "deleted_campaigns": len(ids)}


@router.put("/campaigns/{content_group_id}/name")
async def rename_campaign(content_group_id: UUID, body: RenameRequest) -> dict:
    """Rename a campaign (updates all jobs in the content group)."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        stmt = select(Job).where(Job.content_group_id == content_group_id)
        jobs = (await session.execute(stmt)).scalars().all()
        if not jobs:
            await engine.dispose()
            raise HTTPException(status_code=404, detail="Campaign not found")

        for job in jobs:
            job.campaign_name = body.name
        await session.commit()

    await engine.dispose()
    return {"content_group_id": str(content_group_id), "campaign_name": body.name}
