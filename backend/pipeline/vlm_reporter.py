"""
VLM Report Generator — produces object-referencing, timestamped action items
by feeding FusedMoment data to MiniMax M2.7 (primary) or Claude Haiku (fallback).

Replaces the generic ai_feedback when TwelveLabs Marengo data is available.
Falls back to the original ai_feedback.py when Marengo is not configured.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from backend.config import settings
from backend.pipeline.fusion import FusedMoment, FusionResult

logger = logging.getLogger(__name__)

OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
PRIMARY_MODEL = "minimax/minimax-m2.7"
FALLBACK_MODEL = "anthropic/claude-haiku-4-5-20251001"

SYSTEM_PROMPT = """You are a neuromarketing video editor analyzing short-form vertical ads (TikTok/Reels/Shorts). You have two data sources:

1. NEURAL SIGNALS (from TRIBE v2 fMRI simulation):
   - attention_curve: per-second attention level (0-1)
   - emotional_arousal_curve: per-second arousal (0-1)
   - cognitive_load_curve: per-second cognitive effort (0-1)
   - key_moments: timestamps where attention drops, peaks, or recovers
   - 6 dimension scores: hook_score, sustained_attention, emotional_resonance, memory_encoding, aesthetic_quality, cognitive_accessibility

2. VISUAL/AUDIO UNDERSTANDING (from TwelveLabs Marengo):
   - per-second visual descriptions (objects, composition, lighting, camera)
   - object tracking (what appears, moves, disappears at each timestamp)
   - audio events (music dynamics, voiceover timing, SFX hits)
   - speech transcript with word-level timestamps
   - camera motion classification (static, dolly, pan, zoom, handheld)

YOUR JOB:
For each problem moment (where neural signals drop), explain:
1. WHAT is happening visually and audibly at that exact timestamp
2. WHY the neural signal drops (which brain mechanism is disengaged)
3. HOW to fix it with a SPECIFIC editing action

RULES FOR YOUR FEEDBACK:
- NEVER write generic advice like "add visual interest" or "improve pacing"
- ALWAYS name specific objects visible in the frame by name
- ALWAYS reference specific audio elements (music at -XdB, VO word, SFX type)
- ALWAYS include exact timestamps (t=2.8s, not "early in the video")
- ALWAYS map to a concrete editing operation:
  - Video: "resume camera dolly at 0.2 m/s", "rotate product 15 degrees"
  - Audio: "duck music -4dB at t=13.5s", "delay VO onset 0.3s"
  - Composition: "add cut at t=2.8s", "cross-dissolve 0.5s at t=6.0s"
- CITE the neural dimension and brain region:
  - "sustained_attention drops 40% (prefrontal cortex deactivation)"
  - "memory_encoding at 0 (no hippocampal novelty spike)"

FORMAT:
Return a JSON object with:
{
  "overall_assessment": "2-3 sentence summary of the video's neural performance",
  "dimension_analysis": {
    "hook_score": { "score": 43, "assessment": "...", "key_frame": 0.3 },
    "sustained_attention": { ... },
    "emotional_resonance": { ... },
    "memory_encoding": { ... },
    "aesthetic_quality": { ... },
    "cognitive_accessibility": { ... }
  },
  "action_items": [
    {
      "priority": 1,
      "timestamp_start": 2.5,
      "timestamp_end": 3.5,
      "dimension": "sustained_attention",
      "brain_region": "prefrontal cortex",
      "problem": "The [specific object] is static against [specific background] for 1.2s...",
      "visual_context": "Objects: [list]. Camera: [state]. Lighting: [state].",
      "audio_context": "Music at -XdB, [VO state], [SFX events]",
      "fix": "Resume lateral camera dolly at 0.2 m/s OR add rim light intensification",
      "edit_type": "cut_tightening"
    }
  ],
  "report_title": "Creative 3-5 word title",
  "priorities": [
    "TOP: What to fix first and why (1-2 sentences)",
    "SECOND: Next improvement",
    "THIRD: Third improvement"
  ]
}"""


CINEMA_SYSTEM_PROMPT = """You are a neuro-cinematic consultant — half film theorist, half cognitive neuroscientist. You receive two data streams for a feature film or narrative short:

1. FILM EDITOR ANALYSIS (from TwelveLabs Pegasus):
   Shot-by-shot breakdown including timestamps, characters (by name or description),
   camera type/movement/angle, audio (dialogue, music, SFX, silence), lighting,
   mood, and editing pace/transitions.

2. NEURAL SIGNALS (from TRIBE v2 fMRI simulation):
   - attention_curve, emotional_arousal_curve, cognitive_load_curve (per-second, 0-1)
   - key_moments: timestamps where attention drops, peaks, or recovers
   - 6 dimension scores: hook_score, sustained_attention, emotional_resonance,
     memory_encoding, aesthetic_quality, cognitive_accessibility

YOUR JOB — INTERSECT film craft and neuroscience:
For every problem moment you must deliver ALL THREE of these layers:
  A) PEGASUS OBSERVATION — Quote what the film editor analysis says is happening:
     specific characters, shot type, camera movement, audio, lighting.
  B) NEURAL DIAGNOSIS — What the brain data shows at that exact timestamp:
     which curve dropped, by how much, which neural circuit disengaged.
  C) EDITING PRESCRIPTION — A concrete fix grounded in BOTH the visual reality
     and the neural response. Frame-accurate timestamps, named characters,
     specific cinematic techniques.

GOOD FEEDBACK EXAMPLE:
"[00:29-00:42] Barbara searches the dark room in a series of static medium shots
with no cuts for 13 seconds. The neural data shows sustained_attention dropping
from 0.72 to 0.31 — the dorsal attention network disengages when shot composition
remains unchanged. FIX: Insert a reverse-angle close-up of her face at 00:35 to
reset the visual cortex orienting response, and add a subtle creaking SFX at 00:33
to activate the amygdala threat circuit before the visual cut."

BAD FEEDBACK — NEVER produce vague advice like:
- "Add visual interest to maintain engagement"
- "Consider adding crescendo music +3dB"
- "Improve pacing in the second act"
These are useless because they reference no character, no shot, and no brain mechanism.

RULES:
- Name characters by their name or consistent description ("the woman in the red coat")
- Reference specific shots from the Pegasus analysis — never invent shots that weren't described
- Tie EVERY recommendation to a brain mechanism (name the circuit/region)
- Give frame-accurate editing instructions: "cut at 00:35", not "add a cut somewhere"
- Treat the neural data as the DIAGNOSTIC (what broke) and the film analysis as the PRESCRIPTION (what to change)
- When Pegasus reports dialogue, quote the line and explain how it interacts with the neural signal
- When suggesting audio changes, specify exact placement relative to visual cuts
- For pacing fixes, state the current shot duration and the proposed duration with rationale

FORMAT:
Return a JSON object with:
{
  "overall_assessment": "2-3 sentence summary tying the film's visual storytelling to its neural performance",
  "dimension_analysis": {
    "hook_score": { "score": 43, "assessment": "...", "key_frame": 0.3 },
    "sustained_attention": { ... },
    "emotional_resonance": { ... },
    "memory_encoding": { ... },
    "aesthetic_quality": { ... },
    "cognitive_accessibility": { ... }
  },
  "action_items": [
    {
      "priority": 1,
      "timestamp_start": 29.0,
      "timestamp_end": 42.0,
      "dimension": "sustained_attention",
      "brain_region": "dorsal attention network",
      "problem": "Barbara searches the dark room in static medium shots — 13s with no cut...",
      "visual_context": "Shot: medium, static, eye-level. Character: Barbara. Lighting: low-key, single practical lamp.",
      "audio_context": "Ambient room tone only, no dialogue, no music underscore",
      "fix": "Insert reverse-angle CU of Barbara's face at 00:35; add creaking SFX at 00:33",
      "edit_type": "cut_insertion"
    }
  ],
  "report_title": "Creative 3-5 word title",
  "priorities": [
    "TOP: What to fix first and why (1-2 sentences)",
    "SECOND: Next improvement",
    "THIRD: Third improvement"
  ]
}"""


def get_system_prompt(content_type: str) -> str:
    """Return the appropriate system prompt based on content type."""
    if content_type == "feature_film":
        return CINEMA_SYSTEM_PROMPT
    return SYSTEM_PROMPT


def _build_user_prompt(fusion: FusionResult, content_type: str, duration_s: float, pegasus_analysis: str | None = None, screenplay_context: str | None = None) -> str:
    """Build the user prompt from fusion result."""
    ns = fusion.neural_score
    lines = [
        f"Video: {content_type.replace('_', ' ')} ({duration_s:.0f}s)",
    ]

    if screenplay_context:
        lines.append("")
        lines.append("SCREENPLAY / CHARACTER GUIDE:")
        lines.append("Use these character names and plot details to identify who is on screen.")
        lines.append("Match visual descriptions from Pegasus to these named characters.")
        lines.append(screenplay_context)
        lines.append("")

    if pegasus_analysis:
        lines.append("")
        lines.append("FILM EDITOR ANALYSIS (from TwelveLabs Pegasus):")
        lines.append(pegasus_analysis)
        lines.append("")

    lines.extend([
        "NEURAL SIGNALS:",
        f"Score: {round(ns.get('total', 0))}/100 | "
        f"Hook: {round(ns.get('hook_score', 0))} | "
        f"Attention: {round(ns.get('sustained_attention', 0))} | "
        f"Emotion: {round(ns.get('emotional_resonance', 0))} | "
        f"Memory: {round(ns.get('memory_encoding', 0))} | "
        f"Aesthetic: {round(ns.get('aesthetic_quality', 0))} | "
        f"Clarity: {round(ns.get('cognitive_accessibility', 0))}",
        "",
        f"PROBLEM MOMENTS ({len(fusion.fused_moments)} detected):",
    ])

    for fm in fusion.fused_moments:
        lines.append(f"\n--- Moment at t={fm.timestamp}s ({fm.moment_type}, severity: {fm.neural.severity}) ---")
        lines.append(f"Neural: attention={fm.neural.attention:.2f} (delta={fm.neural.attention_delta:+.2f}), "
                     f"arousal={fm.neural.arousal:.2f}, cog_load={fm.neural.cognitive_load:.2f}")
        lines.append(f"Dimension: {fm.neural.dimension} ({fm.neural.brain_region})")

        if fusion.marengo_available:
            lines.append(f"Visual: objects={fm.visual.objects}, camera={fm.visual.camera}, "
                         f"framing={fm.visual.framing}, lighting={fm.visual.lighting}")
            if fm.visual.text_on_screen:
                lines.append(f"Text on screen: {fm.visual.text_on_screen}")
            lines.append(f"Audio: music={fm.audio.music_level}, vo_active={fm.audio.vo_active}, "
                         f"sfx={fm.audio.sfx_events}")
            if fm.audio.transcript_nearby:
                lines.append(f"Transcript: \"{fm.audio.transcript_nearby}\"")
        else:
            lines.append("(No visual/audio context available — Marengo not configured)")

    lines.append("\n\nReturn the JSON report as specified in the system prompt.")
    return "\n".join(lines)


def _call_openrouter(messages: list[dict], model: str) -> dict[str, Any]:
    """Call OpenRouter and return parsed JSON response."""
    api_key = settings.openrouter_api_key
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY not set")

    resp = httpx.post(
        OPENROUTER_ENDPOINT,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "HTTP-Referer": "https://neuropeer-frontend.vercel.app",
            "X-Title": "NeuroPeer",
        },
        json={
            "model": model,
            "messages": messages,
            "temperature": 0.5,
            "max_tokens": 8000,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"]

    # Strip markdown code fences if present
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"):
            clean = clean[:-3]
        clean = clean.strip()

    return json.loads(clean)


def generate_vlm_report(
    fusion: FusionResult,
    content_type: str = "custom",
    duration_s: float = 0.0,
    parent_result: dict | None = None,
    pegasus_analysis: str | None = None,
    screenplay_context: str | None = None,
) -> dict[str, Any]:
    """Generate an enriched VLM report from fused neural + visual/audio context.

    Returns a dict compatible with the ai_feedback fields in the result:
      summary, report_title, action_items, priorities,
      category_strategies, metric_tips

    Falls back from MiniMax M2.7 to Claude Haiku if the primary model fails.
    """
    user_prompt = _build_user_prompt(fusion, content_type, duration_s, pegasus_analysis=pegasus_analysis, screenplay_context=screenplay_context)

    if parent_result:
        pns = parent_result.get("neural_score", {})
        ns = fusion.neural_score
        delta = round(ns.get("total", 0)) - round(pns.get("total", 0))
        sign = "+" if delta >= 0 else ""
        user_prompt += f"\n\nPREVIOUS RUN: {round(pns.get('total', 0))}/100 → Current: {round(ns.get('total', 0))}/100 ({sign}{delta}). Highlight what changed."

    messages = [
        {"role": "system", "content": get_system_prompt(content_type)},
        {"role": "user", "content": user_prompt},
    ]

    # Try primary model, fall back to secondary
    for model in [PRIMARY_MODEL, FALLBACK_MODEL]:
        try:
            parsed = _call_openrouter(messages, model)
            logger.info("VLM report generated via %s", model)

            # Extract action items as simple strings for backward compat
            raw_items = parsed.get("action_items", [])
            simple_items = []
            for item in raw_items:
                if isinstance(item, dict):
                    fix = item.get("fix", "")
                    problem = item.get("problem", "")
                    ts = item.get("timestamp_start", "?")
                    simple_items.append(f"[t={ts}s] {problem} → {fix}")
                else:
                    simple_items.append(str(item))

            # Build category strategies from dimension_analysis
            dim_analysis = parsed.get("dimension_analysis", {})
            category_strategies = {}
            for dim, info in dim_analysis.items():
                if isinstance(info, dict):
                    category_strategies[dim] = {
                        "score_context": info.get("assessment", ""),
                        "strategies": [info.get("assessment", "")],
                    }

            return {
                "summary": parsed.get("overall_assessment", ""),
                "report_title": parsed.get("report_title", ""),
                "action_items": simple_items,
                "priorities": parsed.get("priorities", []),
                "category_strategies": category_strategies,
                "metric_tips": {},
                # Enriched fields (new — only present with VLM reporter)
                "vlm_action_items": raw_items,
                "dimension_analysis": dim_analysis,
                "marengo_enriched": fusion.marengo_available,
            }

        except Exception as exc:
            logger.warning("VLM report via %s failed: %s", model, exc)
            if model == FALLBACK_MODEL:
                logger.error("Both VLM models failed — returning empty feedback")
                return {}

    return {}
