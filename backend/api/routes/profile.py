"""Marketer profile endpoint."""

from __future__ import annotations

from statistics import mean

from fastapi import APIRouter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import Job, MarketerProfile, Result

router = APIRouter(tags=["Profile"])


@router.get("/profile")
async def get_profile(user_email: str) -> dict:
    """Get the marketer profile for a user, with live-computed score and count."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        stmt = select(MarketerProfile).where(MarketerProfile.user_email == user_email)
        profile = (await session.execute(stmt)).scalar_one_or_none()

        # Always compute live values from actual completed jobs
        score_rows = (await session.execute(
            select(Result.neural_score_total)
            .join(Job, Result.job_id == Job.id)
            .where(Job.user_email == user_email, Job.status == "complete")
        )).scalars().all()

        live_count = len(score_rows)
        live_score = round(mean(score_rows), 1) if score_rows else 0

    await engine.dispose()

    if not profile:
        return {
            "user_email": user_email,
            "overall_score": live_score,
            "total_analyses": live_count,
            "ai_summary": None,
            "ai_strengths": [],
            "ai_weaknesses": [],
            "ai_trends": [],
            "last_refreshed_at": None,
        }

    return {
        "user_email": profile.user_email,
        "overall_score": live_score,
        "total_analyses": live_count,
        "ai_summary": profile.ai_summary,
        "ai_strengths": profile.ai_strengths or [],
        "ai_weaknesses": profile.ai_weaknesses or [],
        "ai_trends": profile.ai_trends or [],
        "last_refreshed_at": profile.last_refreshed_at.isoformat() if profile.last_refreshed_at else None,
    }
