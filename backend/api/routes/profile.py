"""Marketer profile endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import MarketerProfile

router = APIRouter(tags=["Profile"])


@router.get("/profile")
async def get_profile(user_email: str) -> dict:
    """Get the marketer profile for a user."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as session:
        stmt = select(MarketerProfile).where(MarketerProfile.user_email == user_email)
        profile = (await session.execute(stmt)).scalar_one_or_none()

    await engine.dispose()

    if not profile:
        return {
            "user_email": user_email,
            "overall_score": 0,
            "total_analyses": 0,
            "ai_summary": None,
            "ai_strengths": [],
            "ai_weaknesses": [],
            "ai_trends": [],
            "last_refreshed_at": None,
        }

    return {
        "user_email": profile.user_email,
        "overall_score": profile.overall_score,
        "total_analyses": profile.total_analyses,
        "ai_summary": profile.ai_summary,
        "ai_strengths": profile.ai_strengths or [],
        "ai_weaknesses": profile.ai_weaknesses or [],
        "ai_trends": profile.ai_trends or [],
        "last_refreshed_at": profile.last_refreshed_at.isoformat() if profile.last_refreshed_at else None,
    }
