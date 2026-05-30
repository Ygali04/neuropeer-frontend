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
        if 2 <= len(name) <= 60:
            return name
    except Exception as exc:
        logger.warning("Campaign naming failed (non-fatal): %s", exc)

    return _fallback_name(url, content_type)


def _fallback_name(url: str, content_type: str) -> str:
    """Generate a simple fallback name from URL and content type."""
    ct = content_type.replace("_", " ").title()
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.hostname or ""
    domain = domain.replace("www.", "").split(".")[0].title()
    return f"{domain} {ct}"
