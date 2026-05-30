# Campaign Analytics & Marketer Profile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign naming, marketer profile with AI summary, and a redesigned dashboard showing campaign trajectories and overall score trends.

**Architecture:** Campaigns map to existing `content_group_id`. New `marketer_profile` DB table stores user-level aggregates. Auto-naming via cheap LLM, profile generation via minimax-m2.7 every 5 analyses. Dashboard redesigned as series-first with profile card, score timeline, and campaign list.

**Tech Stack:** Python/FastAPI/SQLAlchemy (backend), Next.js/TypeScript/Recharts (frontend), OpenRouter API (AI naming + profile).

---

## File Map

### Backend — Create
- `backend/pipeline/campaign_naming.py` — cheap LLM campaign auto-namer
- `backend/pipeline/marketer_profile.py` — profile generation (minimax-m2.7)
- `backend/api/routes/campaigns.py` — campaign list + rename endpoints
- `backend/api/routes/profile.py` — marketer profile endpoint

### Backend — Modify
- `backend/models/db.py` — add `MarketerProfile` model, add `campaign_name`/`user_email` to `Job`
- `backend/models/schemas.py` — add `MarketerProfile`, `CampaignSummary` schemas
- `backend/config.py` — add `openrouter_cheap_model` setting
- `backend/worker/tasks.py` — call campaign naming + profile update after pipeline
- `backend/api/main.py` — register new route modules

### Frontend — Create
- `frontend/components/MarketerProfileCard.tsx` — overall score + AI summary + strengths/weaknesses
- `frontend/components/ScoreTimeline.tsx` — interactive score-over-time chart
- `frontend/components/CampaignCard.tsx` — compact campaign card with sparkline

### Frontend — Modify
- `frontend/lib/types.ts` — add `MarketerProfile`, `CampaignSummary` types
- `frontend/lib/api.ts` — add `getProfile()`, `getCampaigns()`, `renameCampaign()`
- `frontend/app/dashboard/page.tsx` — full redesign

---

## Task 1: Add DB models for marketer profile + extend Job

**Files:**
- Modify: `backend/models/db.py`
- Modify: `backend/config.py`

- [ ] **Step 1: Add MarketerProfile model and extend Job**

In `backend/models/db.py`, add the `MarketerProfile` class after the `Result` class:

```python
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
```

Add `Integer` to the SQLAlchemy imports (alongside `JSON, DateTime, Float, ...`):

```python
from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
```

Add these columns to the `Job` class, after `content_group_id`:

```python
    campaign_name: Mapped[str | None] = mapped_column(Text)
    user_email: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Step 2: Add cheap model config**

In `backend/config.py`, add after `openrouter_api_key`:

```python
    # Cheap model for simple naming tasks
    openrouter_cheap_model: str = "meta-llama/llama-3.2-1b-instruct:free"
```

- [ ] **Step 3: Commit**

```bash
git add backend/models/db.py backend/config.py
git commit -m "feat: add MarketerProfile model, campaign_name/user_email on Job"
```

---

## Task 2: Add Pydantic schemas for profile and campaigns

**Files:**
- Modify: `backend/models/schemas.py`

- [ ] **Step 1: Add schemas**

Add at the end of `backend/models/schemas.py`:

```python
class CampaignSummary(BaseModel):
    content_group_id: UUID
    campaign_name: str | None = None
    media_count: int
    latest_score: float
    first_score: float
    delta: float
    content_type: str
    created_at: str
    latest_at: str


class MarketerProfileResponse(BaseModel):
    user_email: str
    overall_score: float
    total_analyses: int
    ai_summary: str | None = None
    ai_strengths: list[dict] | None = None
    ai_weaknesses: list[dict] | None = None
    ai_trends: list[dict] | None = None
    last_refreshed_at: str | None = None
```

Also add `user_email: str | None = None` to `AnalyzeRequest` after `parent_job_id`.

- [ ] **Step 2: Commit**

```bash
git add backend/models/schemas.py
git commit -m "feat: add CampaignSummary and MarketerProfileResponse schemas"
```

---

## Task 3: Create campaign auto-naming module

**Files:**
- Create: `backend/pipeline/campaign_naming.py`

- [ ] **Step 1: Create the module**

```python
"""
Campaign auto-naming — generates a short name for a content group
using a cheap/free LLM via OpenRouter.
"""

from __future__ import annotations

import json
import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"


def generate_campaign_name(url: str, content_type: str, ai_summary: str = "") -> str:
    """
    Generate a 3-5 word campaign name from URL, content type, and summary.
    Returns a default name on failure.
    """
    api_key = settings.openrouter_api_key
    if not api_key:
        return _fallback_name(url, content_type)

    snippet = ai_summary[:150] if ai_summary else ""
    prompt = f"Generate a creative 3-5 word campaign name for this video analysis. URL: {url}. Type: {content_type.replace('_', ' ')}. Summary: {snippet}. Reply with ONLY the name, nothing else."

    try:
        resp = httpx.post(
            OPENROUTER_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://neuropeer-frontend.vercel.app",
                "X-Title": "NeuroPeer",
            },
            json={
                "model": settings.openrouter_cheap_model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.8,
                "max_tokens": 20,
            },
            timeout=15.0,
        )
        resp.raise_for_status()
        name = resp.json()["choices"][0]["message"]["content"].strip().strip('"\'')
        # Ensure reasonable length
        if 2 <= len(name) <= 60:
            return name
    except Exception as exc:
        logger.warning("Campaign naming failed (non-fatal): %s", exc)

    return _fallback_name(url, content_type)


def _fallback_name(url: str, content_type: str) -> str:
    """Generate a simple fallback name from URL and content type."""
    ct = content_type.replace("_", " ").title()
    # Extract domain or path hint from URL
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.hostname or ""
    domain = domain.replace("www.", "").split(".")[0].title()
    return f"{domain} {ct}"
```

- [ ] **Step 2: Commit**

```bash
git add backend/pipeline/campaign_naming.py
git commit -m "feat: create campaign auto-naming module"
```

---

## Task 4: Create marketer profile generation module

**Files:**
- Create: `backend/pipeline/marketer_profile.py`

- [ ] **Step 1: Create the module**

```python
"""
Marketer profile generation — aggregates campaign data and generates
an AI summary of the user's marketing strengths, weaknesses, and trends.

Triggered every 5 completed analyses. Uses minimax-m2.7 via OpenRouter.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from uuid import UUID

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "minimax/minimax-m2.7"

PROFILE_PROMPT = """You are NeuroPeer's marketing coach. Analyze this marketer's performance across all their campaigns and video analyses.

Rules:
- Respond ONLY with valid JSON. No markdown.
- Be specific to their actual scores. No generic advice.
- Reference brain regions and neural mechanisms.
- Keep each insight to 1-2 sentences max.

{data}

Return this JSON:
{{
  "summary": "2-3 sentence marketer profile. State their archetype, top strength, critical growth area.",
  "strengths": [
    {{"metric": "MetricName", "insight": "1 sentence why this is a strength"}},
    {{"metric": "MetricName", "insight": "1 sentence"}},
    {{"metric": "MetricName", "insight": "1 sentence"}}
  ],
  "weaknesses": [
    {{"metric": "MetricName", "insight": "1 sentence what to improve"}},
    {{"metric": "MetricName", "insight": "1 sentence"}},
    {{"metric": "MetricName", "insight": "1 sentence"}}
  ],
  "trends": [
    {{"metric": "MetricName", "direction": "improving", "insight": "1 sentence"}},
    {{"metric": "MetricName", "direction": "declining", "insight": "1 sentence"}},
    {{"metric": "MetricName", "direction": "stable", "insight": "1 sentence"}}
  ]
}}"""


def update_marketer_profile(user_email: str) -> None:
    """
    Check if the user's profile needs regeneration (every 5 analyses).
    If so, aggregate campaign data and generate a new AI profile.
    """
    import asyncio

    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, MarketerProfile, Result

    async def _update():
        engine = create_async_engine(settings.database_url)
        Session = async_sessionmaker(engine, expire_on_commit=False)

        async with Session() as session:
            # Upsert profile: increment total_analyses
            stmt = select(MarketerProfile).where(MarketerProfile.user_email == user_email)
            profile = (await session.execute(stmt)).scalar_one_or_none()

            if not profile:
                profile = MarketerProfile(user_email=user_email, total_analyses=1, refresh_threshold=0)
                session.add(profile)
                await session.flush()
            else:
                profile.total_analyses += 1

            # Check if we need to regenerate (every 5 analyses)
            if profile.total_analyses < profile.refresh_threshold + 5:
                await session.commit()
                await engine.dispose()
                return

            # Fetch all campaigns for this user
            campaigns_stmt = (
                select(
                    Job.content_group_id,
                    Job.campaign_name,
                    Job.content_type,
                    func.count(Job.id).label("media_count"),
                    func.min(Job.created_at).label("first_at"),
                    func.max(Job.created_at).label("latest_at"),
                )
                .where(Job.user_email == user_email, Job.status == "complete")
                .group_by(Job.content_group_id, Job.campaign_name, Job.content_type)
            )
            campaign_rows = (await session.execute(campaigns_stmt)).all()

            if not campaign_rows:
                await session.commit()
                await engine.dispose()
                return

            # For each campaign, get latest result's metrics
            campaign_data = []
            all_metrics = {}  # metric_name -> [scores across campaigns]

            for cg_id, name, ct, count, first_at, latest_at in campaign_rows:
                # Get latest result in this group
                latest_stmt = (
                    select(Result)
                    .join(Job, Job.id == Result.job_id)
                    .where(Job.content_group_id == cg_id)
                    .order_by(Job.created_at.desc())
                    .limit(1)
                )
                latest_result = (await session.execute(latest_stmt)).scalar_one_or_none()

                # Get first result in this group
                first_stmt = (
                    select(Result)
                    .join(Job, Job.id == Result.job_id)
                    .where(Job.content_group_id == cg_id)
                    .order_by(Job.created_at.asc())
                    .limit(1)
                )
                first_result = (await session.execute(first_stmt)).scalar_one_or_none()

                if latest_result:
                    latest_score = latest_result.neural_score_total
                    first_score = first_result.neural_score_total if first_result else latest_score

                    campaign_data.append({
                        "name": name or "Unnamed",
                        "score": round(latest_score),
                        "first_score": round(first_score),
                        "delta": round(latest_score - first_score),
                        "media_count": count,
                    })

                    # Aggregate metrics
                    if latest_result.metrics_json:
                        for m in latest_result.metrics_json:
                            mn = m.get("name", "")
                            if mn not in all_metrics:
                                all_metrics[mn] = []
                            all_metrics[mn].append(m.get("score", 0))

            # Compute overall score
            if campaign_data:
                overall = sum(c["score"] for c in campaign_data) / len(campaign_data)
            else:
                overall = 0

            # Compute metric averages for strengths/weaknesses
            metric_avgs = {k: sum(v) / len(v) for k, v in all_metrics.items() if v}
            sorted_metrics = sorted(metric_avgs.items(), key=lambda x: x[1])
            top_3 = sorted_metrics[-3:] if len(sorted_metrics) >= 3 else sorted_metrics
            bottom_3 = sorted_metrics[:3] if len(sorted_metrics) >= 3 else sorted_metrics

            # Generate AI profile
            data_block = f"""Campaigns: {len(campaign_data)}
Overall Score: {round(overall)}/100
Campaign scores: {', '.join(f'{c["name"]}: {c["score"]}' for c in campaign_data[:10])}
Top metrics: {', '.join(f'{name}: {round(score)}' for name, score in top_3)}
Weakest metrics: {', '.join(f'{name}: {round(score)}' for name, score in bottom_3)}
Campaign deltas: {', '.join(f'{c["name"]}: {c["delta"]:+d}' for c in campaign_data[:10] if c["delta"] != 0)}"""

            ai_data = _call_profile_ai(data_block)

            # Update profile
            profile.overall_score = round(overall, 1)
            profile.ai_summary = ai_data.get("summary")
            profile.ai_strengths = ai_data.get("strengths", [])
            profile.ai_weaknesses = ai_data.get("weaknesses", [])
            profile.ai_trends = ai_data.get("trends", [])
            profile.refresh_threshold = profile.total_analyses
            profile.last_refreshed_at = datetime.now(UTC).replace(tzinfo=None)
            profile.updated_at = datetime.now(UTC).replace(tzinfo=None)

            await session.commit()

        await engine.dispose()

    try:
        asyncio.run(_update())
        logger.info("Updated marketer profile for %s", user_email)
    except Exception as exc:
        logger.warning("Profile update failed (non-fatal): %s", exc)


def _call_profile_ai(data_block: str) -> dict:
    """Call OpenRouter minimax-m2.7 for profile generation."""
    api_key = settings.openrouter_api_key
    if not api_key:
        return {}

    prompt = PROFILE_PROMPT.format(data=data_block)

    try:
        resp = httpx.post(
            OPENROUTER_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://neuropeer-frontend.vercel.app",
                "X-Title": "NeuroPeer",
            },
            json={
                "model": MODEL,
                "messages": [
                    {"role": "system", "content": "You are NeuroPeer's marketing coach. Respond ONLY with valid JSON."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 2000,
            },
            timeout=55.0,
        )
        resp.raise_for_status()
        raw = resp.json()["choices"][0]["message"]["content"].strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        return json.loads(raw)
    except Exception as exc:
        logger.warning("Profile AI generation failed: %s", exc)
        return {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/pipeline/marketer_profile.py
git commit -m "feat: create marketer profile generation module"
```

---

## Task 5: Integrate campaign naming + profile into Celery worker

**Files:**
- Modify: `backend/worker/tasks.py`

- [ ] **Step 1: Update run_analysis to accept user_email**

Change the task signature to:

```python
def run_analysis(self, job_id: str, url: str, content_type: str, parent_job_id: str | None = None, user_email: str | None = None) -> dict:
```

- [ ] **Step 2: Add campaign naming after AI feedback**

After the AI feedback section (after `ai_feedback = generate_ai_feedback(...)`) and before S3 uploads, add:

```python
        # ── Stage 6: Campaign naming (first video in group only) ──────────
        campaign_name = None
        if not parent_job_id:
            from backend.pipeline.campaign_naming import generate_campaign_name
            campaign_name = generate_campaign_name(url, content_type, ai_feedback.get("summary", ""))
```

- [ ] **Step 3: Add campaign_name and user_email to result dict**

In the result dict, add:

```python
            "campaign_name": campaign_name,
            "user_email": user_email,
```

- [ ] **Step 4: Update _persist_to_db to store campaign_name and user_email**

Update the signature:

```python
def _persist_to_db(job_id, url, content_type, duration, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key, ai_feedback=None, parent_job_id=None, content_group_id=None, campaign_name=None, user_email=None):
```

In the Job creation inside `_write()`, add:

```python
                    campaign_name=campaign_name,
                    user_email=user_email,
```

Update the call site to pass the new args:

```python
        _persist_to_db(job_id, url, content_type, media.duration_seconds, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key, ai_feedback=ai_feedback, parent_job_id=parent_job_id, content_group_id=content_group_id, campaign_name=campaign_name, user_email=user_email)
```

- [ ] **Step 5: Add profile update after persist**

After the `_persist_to_db` call, add:

```python
        # ── Update marketer profile ───────────────────────────────────────
        if user_email:
            from backend.pipeline.marketer_profile import update_marketer_profile
            update_marketer_profile(user_email)
```

- [ ] **Step 6: Commit**

```bash
git add backend/worker/tasks.py
git commit -m "feat: integrate campaign naming and profile update into pipeline"
```

---

## Task 6: Add campaign and profile API routes

**Files:**
- Create: `backend/api/routes/campaigns.py`
- Create: `backend/api/routes/profile.py`
- Modify: `backend/api/main.py`
- Modify: `backend/api/routes/analyze.py`

- [ ] **Step 1: Create campaigns route**

Create `backend/api/routes/campaigns.py`:

```python
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
        # Get all content groups for this user
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
            # Latest score
            latest_stmt = (
                select(Result.neural_score_total)
                .join(Job, Job.id == Result.job_id)
                .where(Job.content_group_id == cg_id)
                .order_by(Job.created_at.desc())
                .limit(1)
            )
            latest_score = (await session.execute(latest_stmt)).scalar_one_or_none() or 0

            # First score
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
```

- [ ] **Step 2: Create profile route**

Create `backend/api/routes/profile.py`:

```python
"""Marketer profile endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
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
```

- [ ] **Step 3: Register routes in main.py**

Read `backend/api/main.py` and add these imports and router includes alongside existing ones:

```python
from backend.api.routes.campaigns import router as campaigns_router
from backend.api.routes.profile import router as profile_router
```

```python
app.include_router(campaigns_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
```

- [ ] **Step 4: Pass user_email through analyze route**

In `backend/api/routes/analyze.py`, update the `apply_async` kwargs to include user_email:

```python
    run_analysis.apply_async(
        args=[job_id, request.url, request.content_type.value],
        kwargs={
            "parent_job_id": str(request.parent_job_id) if request.parent_job_id else None,
            "user_email": request.user_email,
        },
        task_id=job_id,
    )
```

- [ ] **Step 5: Commit**

```bash
git add backend/api/routes/campaigns.py backend/api/routes/profile.py backend/api/main.py backend/api/routes/analyze.py
git commit -m "feat: add campaign and profile API routes"
```

---

## Task 7: Update frontend types and API

**Files:**
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add types**

Add to `frontend/lib/types.ts` at the end:

```typescript
export interface CampaignSummary {
  content_group_id: string;
  campaign_name: string | null;
  media_count: number;
  latest_score: number;
  first_score: number;
  delta: number;
  content_type: string;
  created_at: string;
  latest_at: string;
}

export interface MarketerProfile {
  user_email: string;
  overall_score: number;
  total_analyses: number;
  ai_summary: string | null;
  ai_strengths: { metric: string; insight: string }[];
  ai_weaknesses: { metric: string; insight: string }[];
  ai_trends: { metric: string; direction: string; insight: string }[];
  last_refreshed_at: string | null;
}
```

- [ ] **Step 2: Add API functions**

Add to `frontend/lib/api.ts` after `getRunHistory`:

```typescript
export async function getProfile(
  userEmail: string
): Promise<import("./types").MarketerProfile> {
  const res = await fetch(`${API_BASE}/api/v1/profile?user_email=${encodeURIComponent(userEmail)}`);
  if (!res.ok) return { user_email: userEmail, overall_score: 0, total_analyses: 0, ai_summary: null, ai_strengths: [], ai_weaknesses: [], ai_trends: [], last_refreshed_at: null };
  return res.json();
}

export async function getCampaigns(
  userEmail?: string
): Promise<import("./types").CampaignSummary[]> {
  const params = userEmail ? `?user_email=${encodeURIComponent(userEmail)}` : "";
  const res = await fetch(`${API_BASE}/api/v1/campaigns${params}`);
  if (!res.ok) return [];
  return res.json();
}

export async function renameCampaign(
  contentGroupId: string,
  name: string
): Promise<void> {
  await fetch(`${API_BASE}/api/v1/campaigns/${contentGroupId}/name`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}
```

- [ ] **Step 3: Update submitAnalysis to pass user_email**

Update `submitAnalysis` to accept and pass `userEmail`:

```typescript
export async function submitAnalysis(
  url: string,
  contentType: ContentType,
  parentJobId?: string,
  userEmail?: string
): Promise<{ job_id: string; websocket_url: string }> {
  const body: Record<string, unknown> = { url, content_type: contentType };
  if (parentJobId) body.parent_job_id = parentJobId;
  if (userEmail) body.user_email = userEmail;

  const res = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/types.ts frontend/lib/api.ts
git commit -m "feat: add campaign and profile types and API functions"
```

---

## Task 8: Create MarketerProfileCard component

**Files:**
- Create: `frontend/components/MarketerProfileCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { TrendingUp, TrendingDown, Minus, Brain } from "lucide-react";
import type { MarketerProfile } from "@/lib/types";

interface Props {
  profile: MarketerProfile;
}

export function MarketerProfileCard({ profile }: Props) {
  const scoreColor = profile.overall_score >= 75 ? "text-emerald-400" : profile.overall_score >= 50 ? "text-amber-400" : "text-red-400";

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain className="w-4 h-4 text-brand-400" />
            <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Marketer Profile</h2>
          </div>
          {profile.ai_summary && (
            <p className="text-sm text-white/60 leading-relaxed max-w-xl mt-2">{profile.ai_summary}</p>
          )}
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold tabular-nums ${scoreColor}`}>{Math.round(profile.overall_score)}</div>
          <div className="text-[10px] text-white/30 uppercase tracking-wider">Overall Score</div>
        </div>
      </div>

      {(profile.ai_strengths?.length > 0 || profile.ai_weaknesses?.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">
          {profile.ai_strengths?.length > 0 && (
            <div>
              <h3 className="text-[10px] text-emerald-400/80 uppercase tracking-wider font-medium mb-2">Strengths</h3>
              <div className="space-y-1.5">
                {profile.ai_strengths.map((s) => (
                  <div key={s.metric} className="flex items-start gap-2">
                    <TrendingUp className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-white/70 font-medium">{s.metric}</span>
                      <p className="text-[10px] text-white/35">{s.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {profile.ai_weaknesses?.length > 0 && (
            <div>
              <h3 className="text-[10px] text-red-400/80 uppercase tracking-wider font-medium mb-2">Growth Areas</h3>
              <div className="space-y-1.5">
                {profile.ai_weaknesses.map((w) => (
                  <div key={w.metric} className="flex items-start gap-2">
                    <TrendingDown className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs text-white/70 font-medium">{w.metric}</span>
                      <p className="text-[10px] text-white/35">{w.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {profile.ai_trends?.length > 0 && (
        <div className="pt-3 border-t border-white/[0.06]">
          <h3 className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2">Trends</h3>
          <div className="flex flex-wrap gap-2">
            {profile.ai_trends.map((t) => {
              const Icon = t.direction === "improving" ? TrendingUp : t.direction === "declining" ? TrendingDown : Minus;
              const color = t.direction === "improving" ? "text-emerald-400" : t.direction === "declining" ? "text-red-400" : "text-white/40";
              return (
                <div key={t.metric} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06]">
                  <Icon className={`w-3 h-3 ${color}`} />
                  <span className="text-[10px] text-white/50">{t.metric}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-white/15">
        {profile.total_analyses} analyses · Updates every 5 runs
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/MarketerProfileCard.tsx
git commit -m "feat: create MarketerProfileCard component"
```

---

## Task 9: Create CampaignCard component

**Files:**
- Create: `frontend/components/CampaignCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { Pencil, Check, X } from "lucide-react";
import type { CampaignSummary } from "@/lib/types";
import { renameCampaign } from "@/lib/api";

interface Props {
  campaign: CampaignSummary;
  onRename?: (id: string, name: string) => void;
}

export function CampaignCard({ campaign, onRename }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(campaign.campaign_name || "");

  const scoreColor = campaign.latest_score >= 75 ? "var(--color-score-green)" : campaign.latest_score >= 50 ? "var(--color-score-amber)" : "var(--color-score-red)";
  const deltaColor = campaign.delta > 0 ? "text-emerald-400" : campaign.delta < 0 ? "text-red-400" : "text-white/30";
  const deltaSign = campaign.delta >= 0 ? "+" : "";

  const handleSave = async () => {
    if (name.trim()) {
      await renameCampaign(campaign.content_group_id, name.trim());
      onRename?.(campaign.content_group_id, name.trim());
    }
    setEditing(false);
  };

  return (
    <div className="glass-card glass-card-hover p-4 group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="text-sm font-medium text-white bg-white/[0.04] border border-white/[0.1] rounded px-2 py-0.5 focus:outline-none focus:border-brand-500/50 w-full"
                autoFocus
              />
              <button onClick={handleSave} className="p-0.5 text-emerald-400 hover:text-emerald-300"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setEditing(false)} className="p-0.5 text-white/30 hover:text-white/50"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-white/80 truncate">{campaign.campaign_name || "Unnamed Campaign"}</h3>
              <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 p-0.5 text-white/20 hover:text-white/50 transition-all">
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-white/25">{campaign.media_count} {campaign.media_count === 1 ? "video" : "videos"}</span>
            <span className="text-[10px] text-white/15">·</span>
            <span className="text-[10px] text-white/25">{campaign.content_type.replace("_", " ")}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 ml-4">
          <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor }}>{campaign.latest_score}</div>
          {campaign.delta !== 0 && (
            <div className={`text-xs font-bold tabular-nums ${deltaColor}`}>{deltaSign}{campaign.delta}</div>
          )}
        </div>
      </div>

      {/* Score trajectory: first → latest */}
      {campaign.media_count > 1 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] text-white/30 tabular-nums">{campaign.first_score}</span>
          <div className="flex-1 h-1 bg-white/[0.04] rounded-full overflow-hidden relative">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(5, campaign.latest_score)}%`,
                background: `linear-gradient(90deg, rgba(249,115,22,0.3), ${scoreColor})`,
              }}
            />
          </div>
          <span className="text-[10px] font-medium tabular-nums" style={{ color: scoreColor }}>{campaign.latest_score}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/20">
          {new Date(campaign.created_at).toLocaleDateString()} — {new Date(campaign.latest_at).toLocaleDateString()}
        </span>
        <Link
          href={`/analyze/${campaign.content_group_id}`}
          className="text-[10px] text-brand-400 hover:text-brand-300 transition-colors opacity-0 group-hover:opacity-100"
        >
          View campaign →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/CampaignCard.tsx
git commit -m "feat: create CampaignCard component with inline rename"
```

---

## Task 10: Create ScoreTimeline component

**Files:**
- Create: `frontend/components/ScoreTimeline.tsx`

- [ ] **Step 1: Install recharts if not present**

```bash
cd frontend && npm install recharts --legacy-peer-deps
```

- [ ] **Step 2: Create the component**

```typescript
"use client";

import { useMemo } from "react";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { CampaignSummary } from "@/lib/types";

interface Props {
  campaigns: CampaignSummary[];
  overallScore: number;
}

export function ScoreTimeline({ campaigns, overallScore }: Props) {
  const dataPoints = useMemo(() => {
    // Flatten campaigns into time-ordered data points
    return campaigns
      .filter((c) => c.latest_at)
      .map((c) => ({
        date: new Date(c.latest_at).getTime(),
        dateLabel: new Date(c.latest_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: c.latest_score,
        name: c.campaign_name || "Unnamed",
        delta: c.delta,
        groupId: c.content_group_id,
      }))
      .sort((a, b) => a.date - b.date);
  }, [campaigns]);

  if (dataPoints.length < 2) return null;

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-medium text-white/50 uppercase tracking-wider">Score Timeline</h2>
        </div>
        <span className="text-xs text-white/25">{dataPoints.length} campaigns</span>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dataPoints} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15, 13, 20, 0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
              }}
              formatter={(value: number, _name: string, props: { payload: { name: string; delta: number } }) => {
                const d = props.payload.delta;
                const deltaStr = d !== 0 ? ` (${d >= 0 ? "+" : ""}${d})` : "";
                return [`${value}/100${deltaStr}`, props.payload.name];
              }}
              labelFormatter={() => ""}
            />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#f97316"
              strokeWidth={2.5}
              dot={{ r: 5, fill: "#f97316", stroke: "rgba(7,6,11,0.8)", strokeWidth: 2 }}
              activeDot={{ r: 7, fill: "#f97316", stroke: "#fff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/components/ScoreTimeline.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat: create ScoreTimeline chart component"
```

---

## Task 11: Redesign dashboard page

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Rewrite the dashboard**

Read the current `frontend/app/dashboard/page.tsx` fully, then replace it with a redesigned version that:

1. Imports and uses `MarketerProfileCard`, `ScoreTimeline`, `CampaignCard`
2. Fetches data from `getProfile(email)` and `getCampaigns(email)` instead of localStorage
3. Still falls back to localStorage run history for users without backend data
4. Layout: Profile card at top, Score timeline in middle, Campaign list at bottom
5. Keeps the existing nav header style
6. Adds sorting for campaigns (by date, score, delta)
7. Empty state for new users

The page should fetch profile and campaigns on mount, using the authenticated user's email from `useAuth()`.

Key structure:
```tsx
<MarketerProfileCard profile={profile} />
<ScoreTimeline campaigns={campaigns} overallScore={profile.overall_score} />
<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
  {campaigns.map(c => <CampaignCard key={c.content_group_id} campaign={c} />)}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat: redesign dashboard with profile card, timeline, and campaign list"
```

---

## Task 12: Build, verify, and deploy

- [ ] **Step 1: Build frontend**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && cd frontend && npx next build
```

Fix any TypeScript errors.

- [ ] **Step 2: Commit any fixes**

```bash
git add -A && git commit -m "fix: resolve build errors"
```

- [ ] **Step 3: Deploy**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vercel --prod --yes
```

- [ ] **Step 4: Push backend changes to repo**

```bash
cd /tmp/neuropeer-backend-push && git pull origin main && cp -r /Users/yahvingali/video-brainscore/backend/* backend/ && cp /Users/yahvingali/video-brainscore/backend/.env.example backend/.env.example && git add -A && git commit -m "feat: campaign naming, marketer profile, campaigns API" && git push origin main
```
