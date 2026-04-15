"""
Stage 4b — Neural Score Composite.

Two scoring modes:

**Targeted** (default): Only the dimensions relevant to the content type are
  considered. For a product demo, only Attention, Memory, Clarity, and Aesthetic
  matter — Hook and Emotion are excluded entirely. The targeted score is the
  equal-weighted average of the included dimensions.

**Full**: All 6 dimensions contribute equally. Universal "how engaging is this
  to a human brain" score.

Both scores are always computed and returned together.

v2: Targeted scoring uses dimension subset, not weighted all-6.
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from backend.models.schemas import ContentType
from backend.pipeline.metric_engine import MetricResult

# ── All metric names ───────────────────────────────────────────────────────

ALL_METRIC_NAMES: list[str] = [
    "Hook Score", "Novelty Spike", "Curiosity Gap Index",
    "Hold Rate", "Attention Decay Rate", "Re-engagement Spikes",
    "Emotional Arousal", "Valence", "Reward Prediction", "Social Cognition",
    "Visual Aesthetic Score", "Sensory Richness", "Scene Composition",
    "Cognitive Load", "Memory Encoding", "Mind Wandering Risk",
    "Message Clarity", "Audio-Visual Coherence", "Narration Impact",
    "Modality Dominance",
]

# ── Dimension → metric mapping ─────────────────────────────────────────────

DIMENSION_METRIC_MAPPING: dict[str, list[str]] = {
    "Hook Score": ["Hook Score", "Novelty Spike"],
    "Sustained Attention": [
        "Hold Rate", "Attention Decay Rate", "Re-engagement Spikes",
        "Curiosity Gap Index", "Mind Wandering Risk",
    ],
    "Emotional Resonance": [
        "Emotional Arousal", "Valence", "Reward Prediction", "Social Cognition",
    ],
    "Memory Encoding": ["Memory Encoding", "Message Clarity"],
    "Aesthetic Quality": [
        "Visual Aesthetic Score", "Sensory Richness",
        "Scene Composition", "Audio-Visual Coherence",
    ],
    "Cognitive Accessibility": [
        "Message Clarity", "Narration Impact", "Modality Dominance",
    ],
}

INVERTED_METRICS = {"Cognitive Load"}

# ── Targeted dimension selection per content type ──────────────────────────
# Only these dimensions are included in the targeted score.
# Dimensions NOT listed are excluded entirely (not shown, not averaged in).

TARGETED_DIMENSIONS: dict[ContentType, list[str]] = {
    ContentType.instagram_reel: [
        "Hook Score", "Emotional Resonance", "Aesthetic Quality",
    ],
    ContentType.youtube_preroll: [
        "Hook Score", "Emotional Resonance", "Memory Encoding",
    ],
    ContentType.product_demo: [
        "Sustained Attention", "Memory Encoding",
        "Aesthetic Quality", "Cognitive Accessibility",
    ],
    ContentType.conference_talk: [
        "Sustained Attention", "Memory Encoding", "Cognitive Accessibility",
    ],
    ContentType.podcast_audio: [
        "Sustained Attention", "Emotional Resonance",
        "Memory Encoding", "Cognitive Accessibility",
    ],
    ContentType.music_video: [
        "Hook Score", "Emotional Resonance", "Aesthetic Quality",
    ],
    ContentType.brand_commercial: [
        "Hook Score", "Emotional Resonance",
        "Memory Encoding", "Aesthetic Quality",
    ],
    ContentType.tutorial_screencast: [
        "Sustained Attention", "Memory Encoding", "Cognitive Accessibility",
    ],
    ContentType.testimonial: [
        "Emotional Resonance", "Memory Encoding", "Sustained Attention",
    ],
    ContentType.educational_lecture: [
        "Sustained Attention", "Memory Encoding", "Cognitive Accessibility",
    ],
    ContentType.live_stream_clip: [
        "Hook Score", "Sustained Attention", "Emotional Resonance",
    ],
    ContentType.custom: [
        "Hook Score", "Sustained Attention", "Emotional Resonance",
        "Memory Encoding", "Aesthetic Quality", "Cognitive Accessibility",
    ],
}

# ── Score floors per content type ──────────────────────────────────────────

METRIC_FLOORS: dict[ContentType, dict[str, float]] = {
    ContentType.product_demo: {
        "Visual Aesthetic Score": 30.0, "Scene Composition": 25.0,
        "Social Cognition": 20.0,
    },
    ContentType.tutorial_screencast: {
        "Visual Aesthetic Score": 25.0, "Scene Composition": 20.0,
    },
    ContentType.conference_talk: {
        "Visual Aesthetic Score": 25.0, "Scene Composition": 20.0,
    },
    ContentType.educational_lecture: {
        "Visual Aesthetic Score": 25.0, "Scene Composition": 20.0,
    },
    ContentType.podcast_audio: {
        "Visual Aesthetic Score": 0.0, "Scene Composition": 0.0,
    },
}


# ── Result models ──────────────────────────────────────────────────────────

class NeuralScoreBreakdownResult(BaseModel):
    # Targeted scores (only relevant dimensions contribute to total)
    total: float
    hook_score: float
    sustained_attention: float
    emotional_resonance: float
    memory_encoding: float
    aesthetic_quality: float
    cognitive_accessibility: float
    # Full scores (all 6 dimensions equally weighted)
    full_total: float
    full_hook_score: float
    full_sustained_attention: float
    full_emotional_resonance: float
    full_memory_encoding: float
    full_aesthetic_quality: float
    full_cognitive_accessibility: float
    # Metadata
    content_types: list[str]
    targeted_dimensions: list[str]  # which dimensions are included in targeted
    metric_relevance: dict[str, float]  # 1.0 = included, 0.0 = excluded


class KeyMomentResult(BaseModel):
    timestamp: float
    type: str
    label: str
    score: float


# ── Helpers ────────────────────────────────────────────────────────────────

def _get_metric(metrics: list[MetricResult], name: str) -> float:
    for m in metrics:
        if m.name == name:
            return m.score
    return 50.0


def _compute_dimension(
    metrics: list[MetricResult],
    dimension: str,
    floors: dict[str, float] | None = None,
) -> float:
    """Compute a single dimension score from its constituent metrics."""
    metric_names = DIMENSION_METRIC_MAPPING[dimension]
    total = 0.0
    count = 0

    for name in metric_names:
        score = _get_metric(metrics, name)
        if name in INVERTED_METRICS:
            score = 100.0 - score
        if floors and name in floors:
            score = max(score, floors[name])
        total += score
        count += 1

    return total / count if count > 0 else 50.0


def resolve_targeted_dimensions(content_types: list[ContentType]) -> list[str]:
    """Get the union of targeted dimensions across all selected content types."""
    if not content_types:
        return list(DIMENSION_METRIC_MAPPING.keys())

    dims: set[str] = set()
    for ct in content_types:
        dims.update(TARGETED_DIMENSIONS.get(ct, list(DIMENSION_METRIC_MAPPING.keys())))
    return sorted(dims, key=list(DIMENSION_METRIC_MAPPING.keys()).index)


def blend_floors(content_types: list[ContentType]) -> dict[str, float]:
    """Take the max floor across selected content types."""
    merged: dict[str, float] = {}
    for ct in content_types:
        for metric, floor in METRIC_FLOORS.get(ct, {}).items():
            merged[metric] = max(merged.get(metric, 0.0), floor)
    return merged


# ── Main entry point ──────────────────────────────────────────────────────

def compute_neural_score(
    metrics: list[MetricResult],
    content_types: list[ContentType] | None = None,
    content_type: ContentType = ContentType.custom,
) -> NeuralScoreBreakdownResult:
    """
    Compute both targeted and full Neural Score breakdowns.

    Targeted: averages only the dimensions relevant to the content type.
    Full: averages all 6 dimensions equally.
    """
    if not content_types:
        content_types = [content_type]

    floors = blend_floors(content_types)

    # Compute all 6 dimension scores (with floors for targeted)
    all_dims: dict[str, float] = {}
    all_dims_full: dict[str, float] = {}
    for dim in DIMENSION_METRIC_MAPPING:
        all_dims[dim] = _compute_dimension(metrics, dim, floors)
        all_dims_full[dim] = _compute_dimension(metrics, dim)  # no floors for full

    # ── Full score: average all 6 dimensions equally ──
    full_total = sum(all_dims_full.values()) / len(all_dims_full)
    full_total = float(np.clip(full_total, 0, 100))

    # ── Targeted score: average only the relevant dimensions ──
    targeted_dims = resolve_targeted_dimensions(content_types)
    if targeted_dims:
        targeted_total = sum(all_dims[d] for d in targeted_dims) / len(targeted_dims)
    else:
        targeted_total = full_total
    targeted_total = float(np.clip(targeted_total, 0, 100))

    # Build relevance map: 1.0 for included dimensions' metrics, 0.0 for excluded
    relevance: dict[str, float] = {}
    for dim, metric_names in DIMENSION_METRIC_MAPPING.items():
        val = 1.0 if dim in targeted_dims else 0.0
        for name in metric_names:
            relevance[name] = max(relevance.get(name, 0.0), val)

    return NeuralScoreBreakdownResult(
        # Targeted
        total=round(targeted_total, 1),
        hook_score=round(all_dims["Hook Score"], 1),
        sustained_attention=round(all_dims["Sustained Attention"], 1),
        emotional_resonance=round(all_dims["Emotional Resonance"], 1),
        memory_encoding=round(all_dims["Memory Encoding"], 1),
        aesthetic_quality=round(all_dims["Aesthetic Quality"], 1),
        cognitive_accessibility=round(all_dims["Cognitive Accessibility"], 1),
        # Full
        full_total=round(full_total, 1),
        full_hook_score=round(all_dims_full["Hook Score"], 1),
        full_sustained_attention=round(all_dims_full["Sustained Attention"], 1),
        full_emotional_resonance=round(all_dims_full["Emotional Resonance"], 1),
        full_memory_encoding=round(all_dims_full["Memory Encoding"], 1),
        full_aesthetic_quality=round(all_dims_full["Aesthetic Quality"], 1),
        full_cognitive_accessibility=round(all_dims_full["Cognitive Accessibility"], 1),
        # Metadata
        content_types=[ct.value for ct in content_types],
        targeted_dimensions=targeted_dims,
        metric_relevance=relevance,
    )


# ── Key Moment Detection (unchanged) ──────────────────────────────────────

def detect_key_moments(
    attention_curve: np.ndarray,
    arousal_curve: np.ndarray,
    cognitive_load_curve: np.ndarray,
    predictions_full: np.ndarray,
) -> list[KeyMomentResult]:
    """Automatically identify key inflection points in the attention timeline."""
    moments = []
    n = len(attention_curve)

    hook_window = min(5, n)
    if hook_window > 0:
        best_t = int(np.argmax(attention_curve[:hook_window]))
        moments.append(KeyMomentResult(timestamp=float(best_t), type="best_hook", label="Best Hook", score=float(attention_curve[best_t])))

    if n > hook_window:
        peak_t = int(np.argmax(attention_curve[hook_window:])) + hook_window
        moments.append(KeyMomentResult(timestamp=float(peak_t), type="peak_engagement", label="Peak Engagement", score=float(attention_curve[peak_t])))

    mean_a, std_a = arousal_curve.mean(), arousal_curve.std()
    threshold_a = mean_a + 1.5 * std_a
    above = np.where(arousal_curve > threshold_a)[0]
    prev_t = -5
    for t in above:
        if t - prev_t >= 2:
            moments.append(KeyMomentResult(timestamp=float(t), type="emotional_peak", label="Emotional Peak", score=float(arousal_curve[t])))
            prev_t = int(t)

    if n > 5:
        for t in range(2, n - 1):
            attn_falling = attention_curve[t] < attention_curve[t - 2] - 10
            cog_high = cognitive_load_curve[t] > cognitive_load_curve.mean() + cognitive_load_curve.std()
            if attn_falling and cog_high:
                moments.append(KeyMomentResult(timestamp=float(t), type="dropoff_risk", label="Drop-off Risk", score=float(attention_curve[t])))

    for t in range(2, n):
        if attention_curve[t] - attention_curve[t - 2] > 15:
            moments.append(KeyMomentResult(timestamp=float(t), type="recovery", label="Re-engagement", score=float(attention_curve[t])))

    moments.sort(key=lambda m: m.timestamp)
    seen: set[float] = set()
    return [m for m in moments if m.timestamp not in seen and not seen.add(m.timestamp)]  # type: ignore[func-returns-value]
