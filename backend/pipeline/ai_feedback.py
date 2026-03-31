"""
AI feedback generation — called once during the pipeline, persisted forever.

Uses OpenRouter (minimax-m2.7) to generate:
- summary, report_title, action_items, priorities
- category_strategies, metric_tips
- Delta-aware insights when a parent result is provided.
"""

from __future__ import annotations

import json
import logging

import httpx

from backend.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "minimax/minimax-m2.7"

SYSTEM_PROMPT = """You are NeuroPeer's neural content strategist. You analyze video content using fMRI-grade brain response predictions from Meta's TRIBE v2 model (20,484 cortical vertices at 1Hz).

Rules:
- Respond ONLY with valid JSON. No markdown wrapping.
- Keep text SHORT — every string must fit on a UI card (max 2 sentences per item).
- Be specific to the video's actual scores. No generic advice.
- Reference brain regions and neural mechanisms by name."""


def _top_metrics(metrics: list[dict], n: int, ascending: bool) -> str:
    sorted_m = sorted(metrics, key=lambda m: m["score"], reverse=not ascending)
    return ", ".join(f"{m['name']}: {round(m['score'])}/100" for m in sorted_m[:n])


def _format_moments(moments: list[dict]) -> str:
    return "; ".join(f"{m['timestamp']}s: {m['type']} ({round(m['score'])})" for m in moments[:6])


def _build_prompt(result: dict, parent_result: dict | None = None) -> list[dict]:
    ns = result["neural_score"]
    metrics = result["metrics"]
    moments = result.get("key_moments", [])
    ct = result.get("content_type", "custom").replace("_", " ")
    dur = result.get("duration_seconds", 0)

    user_content = f"""Video: {ct} ({dur}s)
Score: {round(ns['total'])}/100 | Hook: {round(ns['hook_score'])} | Attention: {round(ns['sustained_attention'])} | Emotion: {round(ns['emotional_resonance'])} | Memory: {round(ns['memory_encoding'])} | Aesthetic: {round(ns['aesthetic_quality'])} | Clarity: {round(ns['cognitive_accessibility'])}
Weakest: {_top_metrics(metrics, 5, True)}
Strongest: {_top_metrics(metrics, 3, False)}
Moments: {_format_moments(moments)}"""

    if parent_result:
        pns = parent_result["neural_score"]
        delta = round(ns["total"]) - round(pns["total"])
        sign = "+" if delta >= 0 else ""
        user_content += f"""

PREVIOUS RUN COMPARISON (delta-aware — highlight changes):
Previous Score: {round(pns['total'])}/100 → Current: {round(ns['total'])}/100 ({sign}{delta})
Hook: {round(pns['hook_score'])} → {round(ns['hook_score'])}
Attention: {round(pns['sustained_attention'])} → {round(ns['sustained_attention'])}
Emotion: {round(pns['emotional_resonance'])} → {round(ns['emotional_resonance'])}
Memory: {round(pns['memory_encoding'])} → {round(ns['memory_encoding'])}
Aesthetic: {round(pns['aesthetic_quality'])} → {round(ns['aesthetic_quality'])}
Clarity: {round(pns['cognitive_accessibility'])} → {round(ns['cognitive_accessibility'])}

Frame improvements as validation of the content strategy changes. Highlight what improved, regressed, and stayed flat."""

    user_content += """

Return this JSON:
{
  "summary": "2-3 sentence assessment. State score, top strength, critical weakness, one recommendation.",
  "report_title": "Creative 3-5 word title",
  "action_items": [
    "Specific quick-win action (1 sentence, max 15 words)",
    "Content edit to make (1 sentence, max 15 words)",
    "Strategic shift (1 sentence, max 15 words)"
  ],
  "priorities": [
    "TOP: What to fix first and why (1-2 sentences)",
    "SECOND: Next improvement (1-2 sentences)",
    "THIRD: Third improvement (1-2 sentences)"
  ],
  "category_strategies": {
    "Attention & Hook": {
      "score_context": "1 sentence assessment (max 20 words)",
      "strategies": ["Strategy with neural rationale (2 sentences max)", "Second strategy (2 sentences max)"]
    },
    "Emotional Engagement": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Memory & Recall": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    },
    "Production Quality": {
      "score_context": "1 sentence (max 20 words)",
      "strategies": ["Strategy (2 sentences max)", "Strategy (2 sentences max)"]
    }
  },
  "metric_tips": {
    "WeakestMetric1": "1-sentence tip grounded in neural substrate",
    "WeakestMetric2": "1-sentence tip",
    "WeakestMetric3": "1-sentence tip"
  }
}"""

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def generate_ai_feedback(
    result: dict,
    parent_result: dict | None = None,
) -> dict:
    """
    Call OpenRouter to generate AI feedback for an analysis result.

    Returns dict with keys: summary, report_title, action_items, priorities,
    category_strategies, metric_tips. Returns empty dict on failure.
    """
    api_key = settings.openrouter_api_key
    if not api_key:
        logger.warning("OPENROUTER_API_KEY not set — skipping AI feedback generation")
        return {}

    messages = _build_prompt(result, parent_result)

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
                "max_tokens": 6000,
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

        parsed = json.loads(clean)

        return {
            "summary": parsed.get("summary", ""),
            "report_title": parsed.get("report_title", ""),
            "action_items": parsed.get("action_items", []),
            "priorities": parsed.get("priorities", []),
            "category_strategies": parsed.get("category_strategies", {}),
            "metric_tips": parsed.get("metric_tips", {}),
        }

    except Exception as exc:
        logger.warning("AI feedback generation failed (non-fatal): %s", exc)
        return {}
