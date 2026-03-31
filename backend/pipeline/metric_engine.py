"""
Stage 4a — Metric Engine.

Computes all 18 NeuroPeer GTM metrics from per-ROI activation timeseries.
Each metric is normalized to a 0–100 score using population baseline statistics
derived from the neuromarketing research literature.

Metric taxonomy follows Section 2 of the NeuroPeer design document.
"""

from __future__ import annotations

import numpy as np
from pydantic import BaseModel

from backend.pipeline.atlas_mapping import (
    aggregate_roi_timeseries,
    compute_r_squared,
)


class MetricResult(BaseModel):
    name: str
    score: float  # 0–100
    raw_value: float
    description: str
    brain_region: str
    gtm_proxy: str


class ModalityContributionEntry(BaseModel):
    timestamp: float
    visual: float
    audio: float
    text: float


def _norm(value: float, low: float, high: float) -> float:
    """Clamp-normalize a raw value into [0, 100]."""
    if high == low:
        return 50.0
    return float(np.clip((value - low) / (high - low) * 100, 0, 100))


# ---------------------------------------------------------------------------
# 2.1 Attention Capture Metrics
# ---------------------------------------------------------------------------


def hook_score(
    predictions_full: np.ndarray,
    hook_window_seconds: int = 3,
) -> MetricResult:
    """
    NAcc activation minus AIns activation in the first 0–3 seconds.
    High NAcc (approach) + low AIns (avoidance) = strong hook.
    """
    t = min(hook_window_seconds, predictions_full.shape[0])
    nacc = aggregate_roi_timeseries(predictions_full[:t], "ventral_striatum").mean()
    ains = aggregate_roi_timeseries(predictions_full[:t], "anterior_insula").mean()
    raw = float(nacc - ains)
    return MetricResult(
        name="Hook Score",
        score=_norm(raw, -0.1, 0.1),
        raw_value=raw,
        description="Scroll-stop power: NAcc approach signal minus AIns avoidance at content onset (0–3s).",
        brain_region="Ventral striatum (NAcc) + Anterior insula",
        gtm_proxy="Thumb-stop rate (2–3s view / impressions)",
    )


def novelty_spike(predictions_full: np.ndarray) -> MetricResult:
    """
    Peak activation in medial temporal + TPJ — captures pattern interrupt moments.
    """
    mt = aggregate_roi_timeseries(predictions_full, "medial_temporal")
    tpj = aggregate_roi_timeseries(predictions_full, "tpj")
    combined = (mt + tpj) / 2
    raw = float(combined.max())
    return MetricResult(
        name="Novelty Spike",
        score=_norm(raw, 0.0, 0.3),
        raw_value=raw,
        description="Peak hippocampal novelty + TPJ reorienting response — measures strongest pattern interrupt.",
        brain_region="Medial temporal lobe + Temporoparietal junction",
        gtm_proxy="Pattern interrupt effectiveness",
    )


def curiosity_gap_index(predictions_full: np.ndarray) -> MetricResult:
    """
    Sustained ACC + medial frontal activation across the full video.
    High ACC conflict monitoring = information gap that compels continued viewing.
    """
    acc = aggregate_roi_timeseries(predictions_full, "medial_frontal_acc")
    raw = float(acc.mean())
    return MetricResult(
        name="Curiosity Gap Index",
        score=_norm(raw, 0.0, 0.15),
        raw_value=raw,
        description="ACC conflict monitoring intensity — measures how strongly the content creates an unresolved information gap.",
        brain_region="Medial frontal cortex + Dorsal ACC",
        gtm_proxy="Information gap that compels continued viewing",
    )


# ---------------------------------------------------------------------------
# 2.2 Sustained Attention & Retention Metrics
# ---------------------------------------------------------------------------


def attention_curve(predictions_full: np.ndarray) -> np.ndarray:
    """
    Per-second attention intensity from dorsal attention network (IPS + FEF).
    Returns (n_timesteps,) float32 array, values 0–100.
    """
    visual = aggregate_roi_timeseries(predictions_full, "visual_cortex")
    parietal = aggregate_roi_timeseries(predictions_full, "parietal_dorsal")
    raw_curve = (visual + parietal) / 2
    # Normalize each timestep to 0–100 relative to this video's range
    lo, hi = raw_curve.min(), raw_curve.max()
    return np.clip((raw_curve - lo) / max(hi - lo, 1e-6) * 100, 0, 100).astype(np.float32)


def hold_rate(predictions_full: np.ndarray) -> MetricResult:
    """
    PFC sustained engagement relative to DMN suppression.
    High PFC / low DMN = viewer is actively processing (not mind-wandering).
    """
    pfc = aggregate_roi_timeseries(predictions_full, "prefrontal_dlPFC").mean()
    dmn = aggregate_roi_timeseries(predictions_full, "dmn").mean()
    raw = float(pfc / (abs(dmn) + 1e-6))
    return MetricResult(
        name="Hold Rate",
        score=_norm(raw, 0.0, 10.0),
        raw_value=raw,
        description="PFC sustained engagement relative to DMN suppression — predicts ThruPlay and watch-through rate.",
        brain_region="Dorsolateral PFC (high) + Medial DMN (low)",
        gtm_proxy="ThruPlay / 3s views ratio",
    )


def attention_decay_rate(predictions_full: np.ndarray) -> MetricResult:
    """
    Slope of DMN re-engagement over time. Rising DMN = mind wandering = viewer drop-off.
    Lower (more negative) decay = better content retention.
    """
    dmn = aggregate_roi_timeseries(predictions_full, "dmn")
    t = np.arange(len(dmn), dtype=np.float32)
    if len(t) < 2:
        slope = 0.0
    else:
        slope = float(np.polyfit(t, dmn, 1)[0])
    # Invert: negative slope (good) → high score
    raw = -slope
    return MetricResult(
        name="Attention Decay Rate",
        score=_norm(raw, -0.02, 0.02),
        raw_value=raw,
        description="Rate of DMN re-engagement (mind wandering). Negative slope = retention; positive = drop-off risk.",
        brain_region="Default Mode Network (mPFC + PCC)",
        gtm_proxy="Slope of viewer drop-off curve",
    )


def reengagement_spikes(predictions_full: np.ndarray) -> MetricResult:
    """
    Count of transient TPJ + ventral frontal spikes above 1 std threshold.
    These spikes = ventral attention network reorienting = re-engagement moments.
    """
    tpj = aggregate_roi_timeseries(predictions_full, "tpj")
    threshold = tpj.mean() + tpj.std()
    spike_count = int((tpj > threshold).sum())
    raw = float(spike_count)
    return MetricResult(
        name="Re-engagement Spikes",
        score=_norm(raw, 0.0, float(max(len(tpj) // 5, 1))),
        raw_value=raw,
        description="Count of TPJ transient spikes = ventral attention reorienting events = recovery moments after drop-off.",
        brain_region="Temporoparietal junction + Ventral frontal cortex",
        gtm_proxy="Retention recovery after drop-off",
    )


# ---------------------------------------------------------------------------
# 2.3 Emotional Resonance Metrics
# ---------------------------------------------------------------------------


def emotional_arousal(predictions_full: np.ndarray) -> MetricResult:
    """Absolute limbic activation intensity — amygdala bilateral arousal."""
    limbic = aggregate_roi_timeseries(predictions_full, "limbic_amygdala")
    raw = float(np.abs(limbic).mean())
    return MetricResult(
        name="Emotional Arousal",
        score=_norm(raw, 0.0, 0.15),
        raw_value=raw,
        description="Mean absolute amygdala/limbic activation — measures emotional salience and affective intensity.",
        brain_region="Amygdala + Limbic system (inner temporal)",
        gtm_proxy="Engagement rate, share propensity",
    )


def emotional_arousal_curve(predictions_full: np.ndarray) -> np.ndarray:
    """Per-second emotional arousal (0–100). Used for the frontend dual-line chart."""
    limbic = aggregate_roi_timeseries(predictions_full, "limbic_amygdala")
    raw = np.abs(limbic).astype(np.float32)
    lo, hi = raw.min(), raw.max()
    return np.clip((raw - lo) / max(hi - lo, 1e-6) * 100, 0, 100).astype(np.float32)


def valence(predictions_full: np.ndarray) -> MetricResult:
    """
    NAcc (positive valence) minus AIns (negative valence) averaged over full video.
    Positive = reward-approach content; negative = avoidance/aversive content.
    """
    nacc = aggregate_roi_timeseries(predictions_full, "ventral_striatum").mean()
    ains = aggregate_roi_timeseries(predictions_full, "anterior_insula").mean()
    raw = float(nacc - ains)
    return MetricResult(
        name="Valence",
        score=_norm(raw, -0.1, 0.1),
        raw_value=raw,
        description="NAcc vs AIns differential across full video. High = positive/rewarding. Low = aversive/avoidant.",
        brain_region="Ventral striatum (NAcc) vs. Anterior insula",
        gtm_proxy="Sentiment-driven virality",
    )


def reward_prediction(predictions_full: np.ndarray) -> MetricResult:
    """Subcortical reward circuit / NAcc mean activation — purchase intent proxy."""
    nacc = aggregate_roi_timeseries(predictions_full, "subcortical").mean()
    raw = float(nacc)
    return MetricResult(
        name="Reward Prediction",
        score=_norm(raw, 0.0, 0.1),
        raw_value=raw,
        description="Ventral striatum / NAcc reward circuit activation — neural correlate of purchase intent and CTA click likelihood.",
        brain_region="Ventral striatum (subcortical reward)",
        gtm_proxy="Purchase intent, CTA click rate",
    )


def social_cognition(predictions_full: np.ndarray) -> MetricResult:
    """mPFC + bilateral TPJ activation — theory of mind / social relatability."""
    mpfc = aggregate_roi_timeseries(predictions_full, "mpfc_ofc")
    tpj = aggregate_roi_timeseries(predictions_full, "tpj")
    raw = float(((mpfc + tpj) / 2).mean())
    return MetricResult(
        name="Social Cognition",
        score=_norm(raw, 0.0, 0.1),
        raw_value=raw,
        description="mPFC + TPJ theory-of-mind network activation — predicts relatability and social sharing tendency.",
        brain_region="Medial PFC + Bilateral temporoparietal junction",
        gtm_proxy="Relatability, social sharing tendency",
    )


# ---------------------------------------------------------------------------
# 2.4 Aesthetic Quality Metrics
# ---------------------------------------------------------------------------


def visual_aesthetic_score(predictions_full: np.ndarray) -> MetricResult:
    """mOFC + mPFC aesthetic valuation circuit mean activation."""
    mpfc_ofc = aggregate_roi_timeseries(predictions_full, "mpfc_ofc").mean()
    raw = float(mpfc_ofc)
    return MetricResult(
        name="Visual Aesthetic Score",
        score=_norm(raw, 0.0, 0.1),
        raw_value=raw,
        description="mOFC + mPFC aesthetic valuation circuit activation — neural correlate of visual beauty judgment.",
        brain_region="Medial orbitofrontal cortex + mPFC",
        gtm_proxy="Creative quality perception, brand premium",
    )


def sensory_richness(predictions_full: np.ndarray) -> MetricResult:
    """Breadth of visual cortex (V1–V4) + auditory cortex activation."""
    visual = aggregate_roi_timeseries(predictions_full, "visual_cortex")
    auditory = aggregate_roi_timeseries(predictions_full, "auditory_sts")
    # Richness = spread across both channels
    raw = float(np.std(visual) + np.std(auditory))
    return MetricResult(
        name="Sensory Richness",
        score=_norm(raw, 0.0, 0.3),
        raw_value=raw,
        description="Variability in visual + auditory cortex activation — measures production value and sensory engagement.",
        brain_region="Visual cortex (V1–V4) + Auditory cortex (A1/STS)",
        gtm_proxy="Production value perception",
    )


def scene_composition(predictions_full: np.ndarray) -> MetricResult:
    """Parahippocampal gyrus (PPA) activation — spatial layout / scene structure."""
    para = aggregate_roi_timeseries(predictions_full, "parahippocampal").mean()
    raw = float(para)
    return MetricResult(
        name="Scene Composition",
        score=_norm(raw, 0.0, 0.15),
        raw_value=raw,
        description="Parahippocampal place area activation — measures how well scene composition guides visual attention.",
        brain_region="Parahippocampal gyrus (PPA)",
        gtm_proxy="Thumbnail effectiveness, visual hierarchy",
    )


# ---------------------------------------------------------------------------
# 2.5 Cognitive Processing & Memory Metrics
# ---------------------------------------------------------------------------


def cognitive_load(predictions_full: np.ndarray) -> MetricResult:
    """dlPFC activation intensity — working memory / executive processing demand."""
    dlpfc = aggregate_roi_timeseries(predictions_full, "prefrontal_dlPFC").mean()
    raw = float(dlpfc)
    return MetricResult(
        name="Cognitive Load",
        score=_norm(raw, 0.0, 0.15),
        raw_value=raw,
        description="dlPFC activation — measures cognitive processing demand. High load may cause viewer fatigue and drop-off.",
        brain_region="Dorsolateral prefrontal cortex (dlPFC)",
        gtm_proxy="Message complexity, comprehension barrier",
    )


def cognitive_load_curve(predictions_full: np.ndarray) -> np.ndarray:
    """Per-second cognitive load (0–100). Used for frontend comprehension ceiling monitor."""
    dlpfc = aggregate_roi_timeseries(predictions_full, "prefrontal_dlPFC").astype(np.float32)
    lo, hi = dlpfc.min(), dlpfc.max()
    return np.clip((dlpfc - lo) / max(hi - lo, 1e-6) * 100, 0, 100).astype(np.float32)


def memory_encoding(predictions_full: np.ndarray) -> MetricResult:
    """Hippocampal + parahippocampal formation activation — long-term memory encoding."""
    hippo = aggregate_roi_timeseries(predictions_full, "hippocampal").mean()
    para = aggregate_roi_timeseries(predictions_full, "parahippocampal").mean()
    raw = float((hippo + para) / 2)
    return MetricResult(
        name="Memory Encoding",
        score=_norm(raw, 0.0, 0.1),
        raw_value=raw,
        description="Hippocampal + parahippocampal activity — predicts brand recall and message retention probability.",
        brain_region="Hippocampal formation + Parahippocampal gyrus",
        gtm_proxy="Brand recall, message retention",
    )


def mind_wandering(predictions_full: np.ndarray) -> MetricResult:
    """
    DMN activation level — inverse engagement signal.
    High DMN = viewer is self-referential / disengaged.
    """
    dmn = aggregate_roi_timeseries(predictions_full, "dmn").mean()
    raw = float(dmn)
    # Invert so that high score = low mind wandering = good
    return MetricResult(
        name="Mind Wandering Risk",
        score=_norm(-raw, -0.15, 0.0),
        raw_value=raw,
        description="Inverse DMN activation — high DMN = disengagement risk. Score reflects content's ability to suppress mind wandering.",
        brain_region="Default Mode Network (mPFC + PCC + Angular gyrus)",
        gtm_proxy="Content disengagement risk",
    )


def message_clarity(predictions_full: np.ndarray) -> MetricResult:
    """
    Broca's + Wernicke's area activation — language comprehension / CTA clarity.
    """
    lang = aggregate_roi_timeseries(predictions_full, "broca_wernicke").mean()
    raw = float(lang)
    return MetricResult(
        name="Message Clarity",
        score=_norm(raw, 0.0, 0.1),
        raw_value=raw,
        description="Broca's + Wernicke's area activation — measures how clearly the verbal/textual message is encoded.",
        brain_region="Left inferior frontal gyrus (Broca's) + Superior temporal gyrus (Wernicke's)",
        gtm_proxy="CTA comprehension, conversion rate",
    )


# ---------------------------------------------------------------------------
# 2.6 Multimodal Integration Metrics
# ---------------------------------------------------------------------------


def audio_visual_coherence(
    predictions_full: np.ndarray,
    predictions_video_only: np.ndarray,
) -> MetricResult:
    """
    R² between full-model STS predictions and video-only STS predictions.
    High R² = audio is reinforcing visual signal = coherent multimodal production.
    """
    sts_full = aggregate_roi_timeseries(predictions_full, "auditory_sts")
    sts_video = aggregate_roi_timeseries(predictions_video_only, "auditory_sts")
    raw = compute_r_squared(sts_full, sts_video)
    return MetricResult(
        name="Audio-Visual Coherence",
        score=_norm(raw, 0.0, 1.0),
        raw_value=raw,
        description="R² between full-model and video-only STS predictions — measures how well audio reinforces visual processing.",
        brain_region="Superior temporal sulcus (STS) — multisensory integration",
        gtm_proxy="Production quality, professional feel",
    )


def narration_impact(
    predictions_full: np.ndarray,
    predictions_video_only: np.ndarray,
    predictions_text_only: np.ndarray,
) -> MetricResult:
    """
    Delta in language cortex activation: text-encoder contribution above video baseline.
    High delta = narration adds meaningful cognitive engagement beyond visuals alone.
    """
    lang_full = aggregate_roi_timeseries(predictions_full, "broca_wernicke").mean()
    lang_video = aggregate_roi_timeseries(predictions_video_only, "broca_wernicke").mean()
    lang_text = aggregate_roi_timeseries(predictions_text_only, "broca_wernicke").mean()
    raw = float(lang_full - lang_video + (lang_text - lang_video))
    return MetricResult(
        name="Narration Impact",
        score=_norm(raw, 0.0, 0.3),
        raw_value=raw,
        description="Language cortex delta: text-encoder contribution above video-only baseline — voiceover effectiveness.",
        brain_region="Broca's + Wernicke's area (language network)",
        gtm_proxy="Voiceover effectiveness",
    )


def modality_dominance(
    predictions_full: np.ndarray,
    predictions_video_only: np.ndarray,
    predictions_audio_only: np.ndarray,
    predictions_text_only: np.ndarray,
) -> tuple[MetricResult, list[ModalityContributionEntry]]:
    """
    Determine which modality drives engagement via per-region R² ablation.
    Returns (MetricResult, per-second modality contribution breakdown).
    """
    # Use attention ROI (parietal dorsal) as the reference region
    ref_full = aggregate_roi_timeseries(predictions_full, "parietal_dorsal")
    r2_video = compute_r_squared(ref_full, aggregate_roi_timeseries(predictions_video_only, "parietal_dorsal"))
    r2_audio = compute_r_squared(ref_full, aggregate_roi_timeseries(predictions_audio_only, "parietal_dorsal"))
    r2_text = compute_r_squared(ref_full, aggregate_roi_timeseries(predictions_text_only, "parietal_dorsal"))

    dominant = max([("visual", r2_video), ("audio", r2_audio), ("text", r2_text)], key=lambda x: x[1])
    raw = dominant[1]

    # Build per-second breakdown for modality stacked bar chart
    n = predictions_full.shape[0]
    breakdown = []
    for t in range(n):
        total = r2_video + r2_audio + r2_text + 1e-6
        breakdown.append(
            ModalityContributionEntry(
                timestamp=float(t),
                visual=round(r2_video / total * 100, 1),
                audio=round(r2_audio / total * 100, 1),
                text=round(r2_text / total * 100, 1),
            )
        )

    result = MetricResult(
        name="Modality Dominance",
        score=_norm(raw, 0.0, 1.0),
        raw_value=raw,
        description=f"Dominant channel: {dominant[0]} (R²={raw:.2f}). Compares video-only, audio-only, text-only ablations.",
        brain_region="Parietal dorsal attention network (reference region)",
        gtm_proxy="Which channel drives engagement",
    )
    return result, breakdown


# ---------------------------------------------------------------------------
# Full metric computation
# ---------------------------------------------------------------------------


def compute_all_metrics(
    predictions: dict,  # Modality -> np.ndarray
) -> tuple[list[MetricResult], np.ndarray, np.ndarray, np.ndarray, list[ModalityContributionEntry]]:
    """
    Run all 18 metrics given the 4 modality prediction arrays.

    Returns:
        metrics: list[MetricResult] (18 items)
        attention_curve_arr: (n_timesteps,) float32
        arousal_curve_arr: (n_timesteps,) float32
        cognitive_load_arr: (n_timesteps,) float32
        modality_breakdown: list[dict]
    """
    from backend.pipeline.tribe_inference import Modality as M

    full = predictions[M.FULL]
    vid = predictions[M.VIDEO_ONLY]
    aud = predictions[M.AUDIO_ONLY]
    txt = predictions[M.TEXT_ONLY]

    metrics: list[MetricResult] = [
        # 2.1 Attention Capture
        hook_score(full),
        novelty_spike(full),
        curiosity_gap_index(full),
        # 2.2 Sustained Attention
        hold_rate(full),
        attention_decay_rate(full),
        reengagement_spikes(full),
        # 2.3 Emotional Resonance
        emotional_arousal(full),
        valence(full),
        reward_prediction(full),
        social_cognition(full),
        # 2.4 Aesthetic Quality
        visual_aesthetic_score(full),
        sensory_richness(full),
        scene_composition(full),
        # 2.5 Cognitive Processing & Memory
        cognitive_load(full),
        memory_encoding(full),
        mind_wandering(full),
        message_clarity(full),
        # 2.6 Multimodal Integration
        audio_visual_coherence(full, vid),
        narration_impact(full, vid, txt),
    ]

    dom_metric, breakdown = modality_dominance(full, vid, aud, txt)
    metrics.append(dom_metric)

    attn_curve = attention_curve(full)
    arousal_curve = emotional_arousal_curve(full)
    cog_curve = cognitive_load_curve(full)

    return metrics, attn_curve, arousal_curve, cog_curve, breakdown
