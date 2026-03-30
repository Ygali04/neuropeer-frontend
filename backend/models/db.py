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

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    job: Mapped[Job] = relationship("Job", back_populates="result")


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
