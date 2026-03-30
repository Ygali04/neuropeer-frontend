"""POST /api/v1/compare — A/B neural comparison of 2+ videos."""

from __future__ import annotations

import json

import redis.asyncio as aioredis
from fastapi import APIRouter, HTTPException

from backend.config import settings
from backend.models.schemas import CompareRequest

router = APIRouter(tags=["Comparison"])


async def _get_redis() -> aioredis.Redis:
    return aioredis.from_url(settings.redis_url, decode_responses=True)


@router.post("/compare")
async def compare_videos(request: CompareRequest) -> dict:
    """
    Compare 2–5 already-analyzed videos side by side.
    Returns comparative metrics and a winner recommendation.
    """
    r = await _get_redis()
    results = []

    for job_id in request.job_ids:
        raw = await r.get(f"neuropeer:result:{str(job_id)}")
        if not raw:
            raise HTTPException(
                status_code=404,
                detail=f"Results not found for job {job_id}. Ensure analysis is complete before comparing.",
            )
        results.append(json.loads(raw))

    # Build per-video Neural Score breakdown
    neural_scores = [r["neural_score"] for r in results]
    labels = [r.get("url", str(jid))[:50] for r, jid in zip(results, request.job_ids)]

    # Determine winner by total neural score
    totals = [ns["total"] for ns in neural_scores]
    winner_idx = int(max(range(len(totals)), key=lambda i: totals[i]))
    winner_job_id = str(request.job_ids[winner_idx])

    # Build delta metrics table
    metric_names = [m["name"] for m in results[0]["metrics"]]
    delta_metrics: dict[str, list[float]] = {}
    for name in metric_names:
        scores_per_video = []
        for result in results:
            score = next((m["score"] for m in result["metrics"] if m["name"] == name), 0.0)
            scores_per_video.append(score)
        delta_metrics[name] = scores_per_video

    # Generate recommendation text
    winner_score = totals[winner_idx]
    runner_up_score = sorted(totals, reverse=True)[1] if len(totals) > 1 else 0
    margin = winner_score - runner_up_score

    hook_scores = [ns["hook_score"] for ns in neural_scores]
    best_hook_idx = hook_scores.index(max(hook_scores))

    recommendation = (
        f'Video {winner_idx + 1} ("{labels[winner_idx][:30]}...") leads with a Neural Score of {winner_score:.0f}/100 '
        f"(+{margin:.0f} vs. runner-up). "
    )
    if best_hook_idx != winner_idx:
        recommendation += (
            f"Note: Video {best_hook_idx + 1} has the strongest hook score ({hook_scores[best_hook_idx]:.0f}) — "
            "consider using its opening sequence with the overall winner's body content."
        )

    return {
        "job_ids": [str(jid) for jid in request.job_ids],
        "labels": labels,
        "neural_scores": neural_scores,
        "winner_job_id": winner_job_id,
        "recommendation": recommendation,
        "delta_metrics": delta_metrics,
    }
