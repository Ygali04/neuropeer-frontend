"""SQLAlchemy async models and database setup."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from backend.config import settings

engine = create_async_engine(settings.database_url, echo=settings.debug)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(50), default="custom")
    status: Mapped[str] = mapped_column(String(20), default="queued")
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)

    # Linked runs
    parent_job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True
    )
    content_group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), default=uuid.uuid4, nullable=False
    )
    campaign_name: Mapped[str | None] = mapped_column(Text)
    user_email: Mapped[str | None] = mapped_column(Text)

    result: Mapped[Result | None] = relationship("Result", back_populates="job", uselist=False)


class Result(Base):
    __tablename__ = "results"

    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id"), primary_key=True)
    duration_seconds: Mapped[float] = mapped_column(Float)

    # Neural Score components
    neural_score_total: Mapped[float] = mapped_column(Float)
    hook_score: Mapped[float] = mapped_column(Float)
    sustained_attention: Mapped[float] = mapped_column(Float)
    emotional_resonance: Mapped[float] = mapped_column(Float)
    memory_encoding: Mapped[float] = mapped_column(Float)
    aesthetic_quality: Mapped[float] = mapped_column(Float)
    cognitive_accessibility: Mapped[float] = mapped_column(Float)

    # S3 paths for heavy numpy arrays
    timeseries_s3_key: Mapped[str | None] = mapped_column(Text)  # per-second metric curves
    vertex_data_s3_key: Mapped[str | None] = mapped_column(Text)  # full (n_timesteps, 20484) array

    # JSON blobs for smaller data
    metrics_json: Mapped[dict | None] = mapped_column(JSON)  # list[MetricScore]
    key_moments_json: Mapped[dict | None] = mapped_column(JSON)  # list[KeyMoment]
    modality_json: Mapped[dict | None] = mapped_column(JSON)  # list[ModalityContribution]

    # AI-generated feedback (persisted once during pipeline)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_report_title: Mapped[str | None] = mapped_column(Text)
    ai_action_items: Mapped[dict | None] = mapped_column(JSON)
    ai_priorities: Mapped[dict | None] = mapped_column(JSON)
    ai_category_strategies: Mapped[dict | None] = mapped_column(JSON)
    ai_metric_tips: Mapped[dict | None] = mapped_column(JSON)
    overarching_summary: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job: Mapped[Job] = relationship("Job", back_populates="result")


class MarketerProfile(Base):
    __tablename__ = "marketer_profiles"

    user_email: Mapped[str] = mapped_column(Text, primary_key=True)
    overall_score: Mapped[float] = mapped_column(Float, default=0)
    total_analyses: Mapped[int] = mapped_column(default=0)
    ai_summary: Mapped[str | None] = mapped_column(Text)
    ai_strengths: Mapped[dict | None] = mapped_column(JSON)
    ai_weaknesses: Mapped[dict | None] = mapped_column(JSON)
    ai_trends: Mapped[dict | None] = mapped_column(JSON)
    last_refreshed_at: Mapped[datetime | None] = mapped_column(DateTime)
    refresh_threshold: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
