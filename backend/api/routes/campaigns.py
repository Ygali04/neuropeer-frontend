"""Campaign management endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import Job, Result

router = APIRouter(tags=["Campaigns"])


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

        campaigns = []
        for cg_id, name, count, ct, created, latest in groups:
            latest_stmt = (
                select(Result.neural_score_total)
                .join(Job, Job.id == Result.job_id)
                .where(Job.content_group_id == cg_id)
                .order_by(Job.created_at.desc())
                .limit(1)
            )
            latest_score = (await session.execute(latest_stmt)).scalar_one_or_none() or 0

            first_stmt = (
                select(Result.neural_score_total)
                .join(Job, Job.id == Result.job_id)
                .where(Job.content_group_id == cg_id)
                .order_by(Job.created_at.asc())
                .limit(1)
            )
            first_score = (await session.execute(first_stmt)).scalar_one_or_none() or 0

            campaigns.append({
                "content_group_id": str(cg_id),
                "campaign_name": name,
                "media_count": count,
                "latest_score": round(latest_score),
                "first_score": round(first_score),
                "delta": round(latest_score - first_score),
                "content_type": ct or "custom",
                "created_at": created.isoformat() if created else "",
                "latest_at": latest.isoformat() if latest else "",
            })

    await engine.dispose()
    return campaigns


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
