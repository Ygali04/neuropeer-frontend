"""
Fusion Layer — merges TRIBE v2 neural signals with TwelveLabs Marengo
visual/audio understanding to produce FusedMoment objects.

For each key_moment (especially dropoff_risk), this layer builds a
structured context packet containing:
  - neural_context: which brain signal dropped, by how much, which dimension
  - visual_context: what objects are in frame, camera state, lighting
  - audio_context: music level, VO state, SFX events, transcript

These FusedMoment objects are the input to the VLM report generator.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np
from pydantic import BaseModel, Field

from backend.clients.twelvelabs import MarengoResult, PerSecondAnalysis
from backend.pipeline.metric_engine import MetricResult
from backend.pipeline.neural_score import KeyMomentResult, NeuralScoreBreakdownResult

logger = logging.getLogger(__name__)

# Maps dimension names to brain regions for the VLM prompt
DIMENSION_BRAIN_MAP: dict[str, str] = {
    "hook_score": "prefrontal cortex (attentional gating)",
    "sustained_attention": "dorsolateral PFC + anterior cingulate cortex",
    "emotional_resonance": "amygdala + ventromedial PFC",
    "memory_encoding": "hippocampus + parahippocampal cortex",
    "aesthetic_quality": "orbitofrontal cortex + visual cortex V4",
    "cognitive_accessibility": "inferior frontal gyrus (Broca's) + superior temporal gyrus",
}


class NeuralContext(BaseModel):
    """Neural signal state at a specific timestamp."""

    timestamp: float
    attention: float = Field(ge=0.0, le=100.0)
    attention_delta: float = Field(
        description="Change from previous second. Negative = drop."
    )
    arousal: float = Field(ge=0.0, le=100.0)
    cognitive_load: float = Field(ge=0.0, le=100.0)
    dimension: str = Field(description="Which 6-dimension score this moment maps to")
    brain_region: str = Field(description="Brain region driving the signal")
    severity: str = Field(description="'critical' | 'moderate' | 'mild'")


class VisualContext(BaseModel):
    """What is visually happening at a specific timestamp."""

    objects: list[str] = Field(default_factory=list)
    camera: str = "unknown"
    framing: str = "unknown"
    lighting: str = ""
    text_on_screen: str = ""
    description: str = ""


class AudioContext(BaseModel):
    """What is audibly happening at a specific timestamp."""

    music_level: str = "unknown"  # loud / medium / quiet / silent
    vo_active: bool = False
    sfx_events: str = ""
    transcript_nearby: str | None = None


class FusedMoment(BaseModel):
    """A problem moment with full neural + visual + audio context.

    This is the primary input to the VLM report generator.
    """

    timestamp: float
    moment_type: str  # from KeyMomentResult.type
    label: str
    score: float
    neural: NeuralContext
    visual: VisualContext
    audio: AudioContext


class FusionResult(BaseModel):
    """Complete fusion output for one video analysis."""

    fused_moments: list[FusedMoment] = Field(default_factory=list)
    neural_score: dict[str, Any] = Field(default_factory=dict)
    metrics: list[dict[str, Any]] = Field(default_factory=list)
    marengo_available: bool = False


def _get_visual_at(
    per_second: list[PerSecondAnalysis], timestamp: float
) -> VisualContext:
    """Look up Marengo visual description at a given timestamp."""
    idx = int(timestamp)
    # Search within ±1s window for the best match
    for offset in [0, -1, 1]:
        target = idx + offset
        for ps in per_second:
            if int(ps.second) == target:
                return VisualContext(
                    objects=ps.objects,
                    camera=ps.camera,
                    framing=ps.framing,
                    lighting=ps.lighting,
                    text_on_screen=ps.text_on_screen,
                    description=ps.description,
                )
    return VisualContext()


def _get_audio_at(per_second: list[PerSecondAnalysis], timestamp: float) -> AudioContext:
    """Look up Marengo audio description at a given timestamp."""
    idx = int(timestamp)
    for ps in per_second:
        if int(ps.second) == idx:
            audio = ps.audio
            return AudioContext(
                music_level=audio.get("music", "unknown"),
                vo_active=audio.get("vo", False),
                sfx_events=audio.get("sfx", ""),
                transcript_nearby=audio.get("transcript"),
            )
    return AudioContext()


def _classify_severity(attention_delta: float, score: float) -> str:
    """Classify how severe a neural signal drop is."""
    if attention_delta < -0.30 or score < 20:
        return "critical"
    if attention_delta < -0.15 or score < 40:
        return "moderate"
    return "mild"


def _identify_dimension(
    timestamp: float,
    attention_curve: np.ndarray,
    arousal_curve: np.ndarray,
    cognitive_load_curve: np.ndarray,
    neural_score: NeuralScoreBreakdownResult,
) -> str:
    """Identify which of the 6 dimensions is weakest at this timestamp."""
    idx = min(int(timestamp), len(attention_curve) - 1)

    # Check which curve is lowest at this timestamp
    values = {
        "hook_score": attention_curve[min(idx, 2)] if idx <= 2 else 0.5,
        "sustained_attention": attention_curve[idx] if idx < len(attention_curve) else 0.5,
        "emotional_resonance": arousal_curve[idx] if idx < len(arousal_curve) else 0.5,
        "cognitive_accessibility": 1.0 - (
            cognitive_load_curve[idx] if idx < len(cognitive_load_curve) else 0.5
        ),
    }

    # Also check the overall dimension scores
    dim_scores = {
        "hook_score": neural_score.hook_score,
        "sustained_attention": neural_score.sustained_attention,
        "emotional_resonance": neural_score.emotional_resonance,
        "memory_encoding": neural_score.memory_encoding,
        "aesthetic_quality": neural_score.aesthetic_quality,
        "cognitive_accessibility": neural_score.cognitive_accessibility,
    }

    # For dropoff moments, the dimension is the one with the lowest curve value
    # weighted by its overall score (lower overall = more likely the problem)
    worst = min(values, key=lambda k: values[k] * (dim_scores.get(k, 50) / 100))
    return worst


def fuse(
    key_moments: list[KeyMomentResult],
    attention_curve: np.ndarray,
    arousal_curve: np.ndarray,
    cognitive_load_curve: np.ndarray,
    neural_score: NeuralScoreBreakdownResult,
    metrics: list[MetricResult],
    marengo: MarengoResult | None = None,
) -> FusionResult:
    """Merge TRIBE v2 signals with Marengo visual/audio context.

    Args:
        key_moments: Detected key moments from TRIBE v2 (dropoffs, peaks, etc.)
        attention_curve: Per-second attention values (0-100 from metric_engine)
        arousal_curve: Per-second emotional arousal values (0-100 from metric_engine)
        cognitive_load_curve: Per-second cognitive load values (0-100 from metric_engine)
        neural_score: 6-dimension composite score
        metrics: Fine-grained metric scores
        marengo: TwelveLabs analysis result (None if not available)

    Returns:
        FusionResult with FusedMoment objects ready for the VLM reporter.
    """
    fused_moments: list[FusedMoment] = []
    per_second = marengo.per_second if marengo else []

    for km in key_moments:
        ts = km.timestamp
        idx = min(int(ts), len(attention_curve) - 1)

        # Neural context
        attn = float(attention_curve[idx]) if idx < len(attention_curve) else 0.5
        prev_attn = float(attention_curve[max(idx - 1, 0)]) if idx > 0 else attn
        attn_delta = attn - prev_attn
        arousal_val = float(arousal_curve[idx]) if idx < len(arousal_curve) else 0.5
        cog_val = float(cognitive_load_curve[idx]) if idx < len(cognitive_load_curve) else 0.5

        dimension = _identify_dimension(
            ts, attention_curve, arousal_curve, cognitive_load_curve, neural_score
        )
        brain_region = DIMENSION_BRAIN_MAP.get(dimension, "cortical network")

        neural = NeuralContext(
            timestamp=round(ts, 1),
            attention=round(attn, 3),
            attention_delta=round(attn_delta, 3),
            arousal=round(arousal_val, 3),
            cognitive_load=round(cog_val, 3),
            dimension=dimension,
            brain_region=brain_region,
            severity=_classify_severity(attn_delta, km.score),
        )

        # Visual context (from Marengo or empty)
        visual = _get_visual_at(per_second, ts) if per_second else VisualContext()

        # Audio context (from Marengo or empty)
        audio = _get_audio_at(per_second, ts) if per_second else AudioContext()

        fused_moments.append(
            FusedMoment(
                timestamp=round(ts, 1),
                moment_type=km.type,
                label=km.label,
                score=round(km.score, 1),
                neural=neural,
                visual=visual,
                audio=audio,
            )
        )

    # Sort by severity (critical first) then by timestamp
    severity_order = {"critical": 0, "moderate": 1, "mild": 2}
    fused_moments.sort(
        key=lambda m: (severity_order.get(m.neural.severity, 3), m.timestamp)
    )

    return FusionResult(
        fused_moments=fused_moments,
        neural_score=neural_score.model_dump(),
        metrics=[m.model_dump() for m in metrics],
        marengo_available=marengo is not None,
    )
