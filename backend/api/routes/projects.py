"""Projects API — CRUD for top-level project folders."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import Campaign, Job, Project, Result

router = APIRouter(tags=["Projects"])


def _engine():
    return create_async_engine(settings.database_url)


# ── Request/Response models ──────────────────────────────────────────────────


class CreateProjectRequest(BaseModel):
    name: str
    description: str | None = None
    user_email: str


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    description: str | None = None


class ProjectSummary(BaseModel):
    id: str
    name: str
    description: str | None
    user_email: str
    campaign_count: int
    report_count: int
    latest_score: float | None
    created_at: str
    updated_at: str


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/projects")
async def create_project(req: CreateProjectRequest) -> dict:
    """Create a new project folder."""
    engine = _engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        project = Project(
            id=uuid.uuid4(),
            user_email=req.user_email,
            name=req.name,
            description=req.description,
        )
        session.add(project)
        await session.commit()
    await engine.dispose()
    return {"id": str(project.id), "name": project.name, "user_email": req.user_email}


@router.get("/projects")
async def list_projects(user_email: str) -> list[ProjectSummary]:
    """List all projects for a user with campaign/report counts."""
    engine = _engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        # Get projects
        stmt = select(Project).where(Project.user_email == user_email).order_by(Project.updated_at.desc())
        projects = (await session.execute(stmt)).scalars().all()

        results = []
        for p in projects:
            # Count campaigns in this project
            camp_count = (await session.execute(
                select(func.count()).where(Campaign.project_id == p.id)
            )).scalar() or 0

            # Count reports (jobs) in this project
            report_count = (await session.execute(
                select(func.count()).where(Job.project_id == p.id)
            )).scalar() or 0

            # Latest score
            latest = (await session.execute(
                select(Result.neural_score_total)
                .join(Job, Result.job_id == Job.id)
                .where(Job.project_id == p.id)
                .order_by(Job.created_at.desc())
                .limit(1)
            )).scalar()

            results.append(ProjectSummary(
                id=str(p.id),
                name=p.name,
                description=p.description,
                user_email=p.user_email,
                campaign_count=camp_count,
                report_count=report_count,
                latest_score=latest,
                created_at=p.created_at.isoformat() if p.created_at else "",
                updated_at=p.updated_at.isoformat() if p.updated_at else "",
            ))

    await engine.dispose()
    return results


@router.put("/projects/{project_id}")
async def update_project(project_id: str, req: UpdateProjectRequest) -> dict:
    """Rename or update a project."""
    engine = _engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        project = (await session.execute(
            select(Project).where(Project.id == uuid.UUID(project_id))
        )).scalar_one_or_none()
        if not project:
            raise HTTPException(404, "Project not found")
        if req.name is not None:
            project.name = req.name
        if req.description is not None:
            project.description = req.description
        project.updated_at = datetime.utcnow()
        await session.commit()
    await engine.dispose()
    return {"id": project_id, "name": project.name}


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str) -> dict:
    """Delete a project. Campaigns cascade-delete, jobs become loose."""
    engine = _engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        project = (await session.execute(
            select(Project).where(Project.id == uuid.UUID(project_id))
        )).scalar_one_or_none()
        if not project:
            raise HTTPException(404, "Project not found")

        # Nullify project_id on jobs (don't delete the reports)
        from sqlalchemy import update
        await session.execute(
            update(Job).where(Job.project_id == uuid.UUID(project_id)).values(project_id=None)
        )
        # Campaigns will cascade-delete via FK
        await session.delete(project)
        await session.commit()
    await engine.dispose()
    return {"deleted": project_id}


@router.get("/projects/{project_id}")
async def get_project_detail(project_id: str) -> dict:
    """Get project with its campaigns and loose reports."""
    engine = _engine()
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        project = (await session.execute(
            select(Project).where(Project.id == uuid.UUID(project_id))
        )).scalar_one_or_none()
        if not project:
            raise HTTPException(404, "Project not found")

        # Get campaigns in this project
        campaigns = (await session.execute(
            select(Campaign).where(Campaign.project_id == project.id).order_by(Campaign.created_at.desc())
        )).scalars().all()

        campaign_data = []
        for c in campaigns:
            # Get actual reports in this campaign
            camp_jobs = (await session.execute(
                select(Job, Result.neural_score_total)
                .outerjoin(Result, Result.job_id == Job.id)
                .where(Job.campaign_id == c.id)
                .order_by(Job.created_at.desc())
            )).all()

            camp_reports = [{
                "job_id": str(j.id), "url": j.url, "content_type": j.content_type,
                "score": score, "created_at": j.created_at.isoformat() if j.created_at else "",
            } for j, score in camp_jobs]

            latest = camp_reports[0]["score"] if camp_reports else None

            campaign_data.append({
                "id": str(c.id), "name": c.name, "description": c.description,
                "report_count": len(camp_reports), "latest_score": latest,
                "reports": camp_reports,
                "created_at": c.created_at.isoformat() if c.created_at else "",
            })

        # Get loose reports (in project but no campaign)
        loose_jobs = (await session.execute(
            select(Job, Result.neural_score_total)
            .outerjoin(Result, Result.job_id == Job.id)
            .where(Job.project_id == project.id, Job.campaign_id.is_(None))
            .order_by(Job.created_at.desc())
        )).all()

        loose_reports = [{
            "job_id": str(j.id), "url": j.url, "content_type": j.content_type,
            "score": score, "created_at": j.created_at.isoformat() if j.created_at else "",
        } for j, score in loose_jobs]

    await engine.dispose()
    return {
        "id": str(project.id), "name": project.name, "description": project.description,
        "campaigns": campaign_data, "loose_reports": loose_reports,
    }
