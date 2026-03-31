"""
Marketer profile generation — called after every completed analysis.

Maintains a rolling profile for each user that summarises their overall
content performance across all campaigns.

Behaviour
---------
- Every call increments total_analyses on the MarketerProfile row (upsert).
- Every 5 analyses the full AI profile is regenerated using minimax-m2.7
  via OpenRouter.  The threshold is tracked via refresh_threshold so we
  never skip a generation even if calls arrive out of order.
- Campaign data is aggregated as: latest Result per content_group_id →
  mean overall_score, per-metric averages for strength/weakness ranking.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime
from statistics import mean

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "minimax/minimax-m2.7"

SYSTEM_PROMPT = (
    "You are NeuroPeer's neural content strategist. "
    "You analyse a marketer's performance across all their video campaigns "
    "using fMRI-grade brain response predictions from Meta's TRIBE v2 model. "
    "Rules: Respond ONLY with valid JSON. No markdown wrapping. "
    "Be specific and data-driven. Reference neural mechanisms by name."
)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_profile_prompt(
    overall_score: float,
    metric_averages: dict[str, float],
    total_analyses: int,
    num_campaigns: int,
) -> list[dict]:
    """Build the messages list for the OpenRouter profile generation call."""

    sorted_metrics = sorted(metric_averages.items(), key=lambda kv: kv[1], reverse=True)
    top3 = sorted_metrics[:3]
    bottom3 = sorted_metrics[-3:]

    metrics_block = "\n".join(
        f"  {name}: {round(score, 1)}/100" for name, score in sorted_metrics
    )
    top3_block = ", ".join(f"{n}: {round(s, 1)}" for n, s in top3)
    bottom3_block = ", ".join(f"{n}: {round(s, 1)}" for n, s in bottom3)

    user_content = f"""Marketer profile data:
Overall score (mean of latest campaign scores): {round(overall_score, 1)}/100
Total analyses run: {total_analyses}
Campaigns analysed: {num_campaigns}

Per-metric averages (across all campaigns, highest → lowest):
{metrics_block}

Top 3 metrics: {top3_block}
Bottom 3 metrics: {bottom3_block}

Return this JSON:
{{
  "summary": "2-3 sentence assessment of this marketer's overall neural content performance. Cite the overall score, dominant strength, and most critical weakness.",
  "strengths": [
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence neural insight explaining why this is strong and how to leverage it."}},
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence insight."}},
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence insight."}}
  ],
  "weaknesses": [
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence neural insight explaining the gap and a concrete fix."}},
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence insight."}},
    {{"metric": "MetricName", "score": 0.0, "insight": "1-2 sentence insight."}}
  ],
  "trends": {{
    "improving": ["metric names that are trending up (infer from score rank vs expected)"],
    "declining": ["metric names that appear underperforming"],
    "stable": ["metric names that are consistent"]
  }}
}}"""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


# ---------------------------------------------------------------------------
# OpenRouter call
# ---------------------------------------------------------------------------

def _call_openrouter(messages: list[dict]) -> dict:
    """
    Synchronous OpenRouter call.  Returns parsed JSON dict on success,
    empty dict on any failure (non-fatal).
    """
    api_key = settings.openrouter_api_key
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not set — skipping marketer profile AI generation")
        return {}

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
                "messages": messages,
                "temperature": 0.7,
                "max_tokens": 3000,
            },
            timeout=55.0,
        )
        resp.raise_for_status()

        raw = resp.json()["choices"][0]["message"]["content"]
        clean = raw.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()

        return json.loads(clean)

    except Exception as exc:
        logger.warning("Marketer profile AI generation failed (non-fatal): %s", exc)
        return {}


# ---------------------------------------------------------------------------
# Async DB helper
# ---------------------------------------------------------------------------

async def _run_profile_update(user_email: str) -> None:
    """
    Core async logic: upsert the MarketerProfile row, check whether an AI
    refresh is due, and if so query campaign data and regenerate the profile.
    """
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, MarketerProfile, Result

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with Session() as session:
            # ── 1. Upsert MarketerProfile row ─────────────────────────────
            stmt = select(MarketerProfile).where(MarketerProfile.user_email == user_email)
            profile = (await session.execute(stmt)).scalar_one_or_none()

            now = datetime.utcnow()

            if profile is None:
                profile = MarketerProfile(
                    user_email=user_email,
                    overall_score=0.0,
                    total_analyses=1,
                    refresh_threshold=0,
                    created_at=now,
                    updated_at=now,
                )
                session.add(profile)
                await session.flush()
            else:
                profile.total_analyses = (profile.total_analyses or 0) + 1
                profile.updated_at = now

            total = profile.total_analyses
            threshold = profile.refresh_threshold or 0

            # ── 2. Always recompute overall_score ────────────────────────
            jobs_stmt = (
                select(Job)
                .where(Job.user_email == user_email)
                .where(Job.status == "complete")
            )
            jobs = (await session.execute(jobs_stmt)).scalars().all()

            if not jobs:
                await session.commit()
                return

            # Group by content_group_id → pick latest job per group
            groups: dict[str, Job] = {}
            for job in jobs:
                key = str(job.content_group_id)
                if key not in groups or job.created_at > groups[key].created_at:
                    groups[key] = job

            # Fetch the Result for each latest job
            latest_job_ids = [j.id for j in groups.values()]
            results_stmt = select(Result).where(Result.job_id.in_(latest_job_ids))
            results = (await session.execute(results_stmt)).scalars().all()

            if not results:
                await session.commit()
                return

            # Compute overall_score (mean of neural_score_total across latest campaigns)
            overall_score = mean(r.neural_score_total for r in results)
            profile.overall_score = overall_score
            profile.updated_at = now

            # ── 3. Only regenerate AI profile every 5 analyses ───────────
            if total >= threshold + 5:
                # Aggregate per-metric averages across all latest results
                metric_sums: dict[str, list[float]] = {}
                for result in results:
                    if not result.metrics_json:
                        continue
                    for m in result.metrics_json:
                        name = m.get("name", "")
                        score = m.get("score")
                        if name and score is not None:
                            metric_sums.setdefault(name, []).append(float(score))

                metric_averages: dict[str, float] = {
                    name: mean(scores) for name, scores in metric_sums.items() if scores
                }

                num_campaigns = len(results)

                messages = _build_profile_prompt(
                    overall_score=overall_score,
                    metric_averages=metric_averages,
                    total_analyses=total,
                    num_campaigns=num_campaigns,
                )
                ai_data = _call_openrouter(messages)

                profile.refresh_threshold = total  # next refresh at total + 5

                if ai_data:
                    profile.ai_summary = ai_data.get("summary") or profile.ai_summary
                    profile.ai_strengths = ai_data.get("strengths") or profile.ai_strengths
                    profile.ai_weaknesses = ai_data.get("weaknesses") or profile.ai_weaknesses
                    profile.ai_trends = ai_data.get("trends") or profile.ai_trends
                    profile.last_refreshed_at = now

            await session.commit()

            logger.info(
                "MarketerProfile refreshed for %s (total_analyses=%d, overall_score=%.1f, campaigns=%d)",
                user_email, total, overall_score, num_campaigns,
            )

    finally:
        await engine.dispose()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def update_marketer_profile(user_email: str) -> None:
    """
    Update the marketer profile for *user_email* after a completed analysis.

    - Increments total_analyses (upsert).
    - Every 5 analyses regenerates the full AI profile via minimax-m2.7.
    - Stores results in the MarketerProfile table.

    This function is non-fatal: any exception is caught and logged as a
    warning so that a profile update failure never breaks the main pipeline.
    """
    if not user_email:
        logger.warning("update_marketer_profile called with empty user_email — skipping")
        return

    try:
        asyncio.run(_run_profile_update(user_email))
    except Exception as exc:
        logger.warning("update_marketer_profile failed for %s (non-fatal): %s", user_email, exc)
