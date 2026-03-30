"""
Stage 4b — Neural Score Composite.

Computes the NeuroPeer Neural Score (0–100) as a weighted composite of
six core GTM dimensions. Weights are calibrated against real-world
engagement data and can be overridden per content type preset.
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from backend.models.schemas import ContentType
from backend.pipeline.metric_engine import MetricResult

DEFAULT_WEIGHTS: dict[str, float] = {
    "Hook Score": 0.25,
    "Sustained Attention": 0.20,  # mapped from Hold Rate + Attention Decay Rate
    "Emotional Resonance": 0.20,  # mapped from Emotional Arousal + Valence
    "Memory Encoding": 0.15,
    "Aesthetic Quality": 0.10,  # mapped from Visual Aesthetic Score
    "Cognitive Accessibility": 0.10,  # inverse of Cognitive Load
}

CONTENT_PRESETS: dict[ContentType, dict[str, float]] = {
    ContentType.instagram_reel: {
        "Hook Score": 0.35,
        "Sustained Attention": 0.15,
        "Emotional Resonance": 0.20,
        "Memory Encoding": 0.10,
        "Aesthetic Quality": 0.12,
        "Cognitive Accessibility": 0.08,
    },
    ContentType.youtube_preroll: {
        "Hook Score": 0.40,
        "Sustained Attention": 0.15,
        "Emotional Resonance": 0.15,
        "Memory Encoding": 0.15,
        "Aesthetic Quality": 0.08,
        "Cognitive Accessibility": 0.07,
    },
    ContentType.product_demo: {
        "Hook Score": 0.20,
        "Sustained Attention": 0.25,
        "Emotional Resonance": 0.15,
        "Memory Encoding": 0.20,
        "Aesthetic Quality": 0.05,
        "Cognitive Accessibility": 0.15,
    },
    ContentType.conference_talk: {
        "Hook Score": 0.15,
        "Sustained Attention": 0.25,
        "Emotional Resonance": 0.15,
        "Memory Encoding": 0.20,
        "Aesthetic Quality": 0.05,
        "Cognitive Accessibility": 0.20,
    },
    ContentType.podcast_audio: {
        "Hook Score": 0.20,
        "Sustained Attention": 0.20,
        "Emotional Resonance": 0.25,
        "Memory Encoding": 0.15,
        "Aesthetic Quality": 0.02,
        "Cognitive Accessibility": 0.18,
    },
    ContentType.custom: DEFAULT_WEIGHTS,
}


class NeuralScoreBreakdownResult(BaseModel):
    total: float
    hook_score: float
    sustained_attention: float
    emotional_resonance: float
    memory_encoding: float
    aesthetic_quality: float
    cognitive_accessibility: float


class KeyMomentResult(BaseModel):
    timestamp: float
    type: str
    label: str
    score: float


def _get_metric(metrics: list[MetricResult], name: str) -> float:
    for m in metrics:
        if m.name == name:
            return m.score
    return 50.0  # fallback to neutral if not found


def compute_neural_score(
    metrics: list[MetricResult],
    content_type: ContentType = ContentType.custom,
) -> NeuralScoreBreakdownResult:
    """
    Compute the NeuroPeer Neural Score (0–100) and its 6 component breakdown.

    Dimension mappings:
      Hook Score           → Hook Score metric (direct)
      Sustained Attention  → average(Hold Rate, 100 - Attention Decay Rate*inverse)
      Emotional Resonance  → average(Emotional Arousal, Valence)
      Memory Encoding      → Memory Encoding metric (direct)
      Aesthetic Quality    → Visual Aesthetic Score metric (direct)
      Cognitive Accessibility → 100 - Cognitive Load score (inverted)
    """
    weights = CONTENT_PRESETS.get(content_type, DEFAULT_WEIGHTS)

    # Resolve dimension scores from individual metrics
    hook = _get_metric(metrics, "Hook Score")

    hold = _get_metric(metrics, "Hold Rate")
    decay = _get_metric(metrics, "Attention Decay Rate")
    sustained = (hold + decay) / 2

    arousal = _get_metric(metrics, "Emotional Arousal")
    val = _get_metric(metrics, "Valence")
    emotional = (arousal + val) / 2

    memory = _get_metric(metrics, "Memory Encoding")
    aesthetic = _get_metric(metrics, "Visual Aesthetic Score")
    cog_load = _get_metric(metrics, "Cognitive Load")
    cognitive_accessibility = 100.0 - cog_load

    dimensions = {
        "Hook Score": hook,
        "Sustained Attention": sustained,
        "Emotional Resonance": emotional,
        "Memory Encoding": memory,
        "Aesthetic Quality": aesthetic,
        "Cognitive Accessibility": cognitive_accessibility,
    }

    total = sum(dimensions[dim] * weights.get(dim, 0.0) for dim in dimensions)
    total = float(np.clip(total, 0, 100))

    return NeuralScoreBreakdownResult(
        total=round(total, 1),
        hook_score=round(hook, 1),
        sustained_attention=round(sustained, 1),
        emotional_resonance=round(emotional, 1),
        memory_encoding=round(memory, 1),
        aesthetic_quality=round(aesthetic, 1),
        cognitive_accessibility=round(cognitive_accessibility, 1),
    )


def detect_key_moments(
    attention_curve: np.ndarray,
    arousal_curve: np.ndarray,
    cognitive_load_curve: np.ndarray,
    predictions_full: np.ndarray,
) -> list[KeyMomentResult]:
    """
    Automatically identify key inflection points in the attention timeline.

    Moment types:
      best_hook       — peak NAcc at onset (first 5s)
      peak_engagement — global attention maximum
      emotional_peak  — amygdala spike (arousal > mean + 1.5 std)
      dropoff_risk    — DMN spike (cognitive load drop + attention drop together)
      recovery        — re-engagement after drop (attention recovering upward)
    """

    moments = []
    n = len(attention_curve)

    # best_hook: highest attention in first 5 seconds
    hook_window = min(5, n)
    if hook_window > 0:
        best_t = int(np.argmax(attention_curve[:hook_window]))
        moments.append(
            KeyMomentResult(
                timestamp=float(best_t),
                type="best_hook",
                label="Best Hook",
                score=float(attention_curve[best_t]),
            )
        )

    # peak_engagement: global attention maximum (after hook window)
    if n > hook_window:
        peak_t = int(np.argmax(attention_curve[hook_window:])) + hook_window
        moments.append(
            KeyMomentResult(
                timestamp=float(peak_t),
                type="peak_engagement",
                label="Peak Engagement",
                score=float(attention_curve[peak_t]),
            )
        )

    # emotional_peaks: arousal spikes > mean + 1.5 std
    mean_a, std_a = arousal_curve.mean(), arousal_curve.std()
    threshold_a = mean_a + 1.5 * std_a
    above = np.where(arousal_curve > threshold_a)[0]
    # Deduplicate — only keep local maxima separated by 2+ seconds
    prev_t = -5
    for t in above:
        if t - prev_t >= 2:
            moments.append(
                KeyMomentResult(
                    timestamp=float(t),
                    type="emotional_peak",
                    label="Emotional Peak",
                    score=float(arousal_curve[t]),
                )
            )
            prev_t = int(t)

    # dropoff_risk: attention declining AND cognitive load high
    if n > 5:
        for t in range(2, n - 1):
            attn_falling = attention_curve[t] < attention_curve[t - 2] - 10
            cog_high = cognitive_load_curve[t] > cognitive_load_curve.mean() + cognitive_load_curve.std()
            if attn_falling and cog_high:
                moments.append(
                    KeyMomentResult(
                        timestamp=float(t),
                        type="dropoff_risk",
                        label="Drop-off Risk",
                        score=float(attention_curve[t]),
                    )
                )

    # recovery: attention rises > 15 points over 2-second window
    for t in range(2, n):
        if attention_curve[t] - attention_curve[t - 2] > 15:
            moments.append(
                KeyMomentResult(
                    timestamp=float(t),
                    type="recovery",
                    label="Re-engagement",
                    score=float(attention_curve[t]),
                )
            )

    # Sort by timestamp, deduplicate same-second entries
    moments.sort(key=lambda m: m.timestamp)
    seen_times: set[float] = set()
    deduped = []
    for m in moments:
        if m.timestamp not in seen_times:
            deduped.append(m)
            seen_times.add(m.timestamp)

    return deduped
