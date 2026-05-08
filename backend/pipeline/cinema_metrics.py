"""
Stage 4a-cinema — Cinema Metric Engine.

Computes 18 cinema-specific neuroscience metrics from TRIBE v2 cortical
vertex predictions.  Each metric maps to fsaverage5 ROI vertex ranges and
is scored 0-100 using a method grounded in peer-reviewed research.

Metric taxonomy follows the Cinema Neural Analysis PRD (cinema-neuropeer-integration.md).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np


# ── ROI vertex ranges (fsaverage5 parcels, 20484 vertices) ─────────────────

ROI_RANGES: dict[str, list[tuple[int, int]]] = {
    "DMN": [(6000, 8000), (14000, 15500)],
    "Salience": [(4500, 5500)],
    "Limbic": [(15500, 17000)],
    "Mentalizing": [(6000, 7000), (3500, 4000)],
    "Visual": [(0, 2500)],
    "Reward": [(5500, 6000), (18000, 18500)],
    "DAN": [(3500, 4500), (10000, 11000)],
    "Auditory": [(2500, 3500)],
    "Hippocampus": [(16000, 17000)],
    "PFC": [(8000, 10000)],
    "Language": [(8500, 9500), (2800, 3200)],
}


@dataclass
class CinemaMetricDef:
    """Definition of a single cinema metric."""

    name: str
    key: str
    brain_regions: list[str]
    vertex_ranges: list[tuple[int, int]]
    description: str
    citation: str
    score_method: str
    # Optional: secondary ROI for coupling-based metrics
    secondary_vertex_ranges: list[tuple[int, int]] = field(default_factory=list)


# ── The 18 Cinema Metrics ──────────────────────────────────────────────────

CINEMA_METRICS: list[CinemaMetricDef] = [
    CinemaMetricDef(
        name="Narrative Absorption",
        key="narrative_absorption",
        brain_regions=["DMN"],
        vertex_ranges=ROI_RANGES["DMN"],
        description="Default-mode network engagement during narrative processing — how deeply the viewer is absorbed in the story world.",
        citation="Simony et al. 2016, Nature Communications",
        score_method="mean_activation",
    ),
    CinemaMetricDef(
        name="Suspense Arc",
        key="suspense_arc",
        brain_regions=["Salience"],
        vertex_ranges=ROI_RANGES["Salience"],
        description="Sustained salience network activation reflecting anticipatory tension and uncertainty.",
        citation="Bezdek et al. 2015, Annals of the NY Academy of Sciences",
        score_method="sustained_activation",
    ),
    CinemaMetricDef(
        name="Emotional Depth",
        key="emotional_depth",
        brain_regions=["Limbic"],
        vertex_ranges=ROI_RANGES["Limbic"],
        description="Limbic system engagement capturing the richness and variation of emotional responses.",
        citation="Nummenmaa et al. 2018, Cerebral Cortex",
        score_method="mean_activation",
    ),
    CinemaMetricDef(
        name="Character Empathy",
        key="character_empathy",
        brain_regions=["Mentalizing"],
        vertex_ranges=ROI_RANGES["Mentalizing"],
        secondary_vertex_ranges=ROI_RANGES["DMN"],
        description="Mentalizing-DMN coupling reflecting theory-of-mind engagement with on-screen characters.",
        citation="Nummenmaa et al. 2014, PNAS",
        score_method="coupling_strength",
    ),
    CinemaMetricDef(
        name="Visual Spectacle",
        key="visual_spectacle",
        brain_regions=["Visual"],
        vertex_ranges=ROI_RANGES["Visual"],
        description="Visual cortex activation driven by cinematography, composition, and visual complexity.",
        citation="Gallese & Guerra 2019, Progress in Brain Research",
        score_method="mean_activation",
    ),
    CinemaMetricDef(
        name="Cinematic Frisson",
        key="cinematic_frisson",
        brain_regions=["Reward"],
        vertex_ranges=ROI_RANGES["Reward"],
        description="Peak reward-circuit activation — the chills, goosebumps, and awe moments.",
        citation="Blood & Zatorre 2001, PNAS",
        score_method="peak_activation",
    ),
    CinemaMetricDef(
        name="Pacing Coherence",
        key="pacing_coherence",
        brain_regions=["Salience", "Visual"],
        vertex_ranges=ROI_RANGES["Salience"],
        secondary_vertex_ranges=ROI_RANGES["Visual"],
        description="Salience-Visual coupling reflecting how well the editing rhythm matches neural expectation.",
        citation="Sanz-Aznar et al. 2021, NeuroImage",
        score_method="coupling_strength",
    ),
    CinemaMetricDef(
        name="Soundtrack Integration",
        key="soundtrack_integration",
        brain_regions=["Auditory", "Limbic"],
        vertex_ranges=ROI_RANGES["Auditory"],
        secondary_vertex_ranges=ROI_RANGES["Limbic"],
        description="Auditory-Limbic coupling indicating how effectively the score amplifies emotional content.",
        citation="Salimpoor et al. 2013, Science",
        score_method="coupling_strength",
    ),
    CinemaMetricDef(
        name="Memory Imprint",
        key="memory_imprint",
        brain_regions=["Hippocampus"],
        vertex_ranges=ROI_RANGES["Hippocampus"],
        description="Hippocampal peak activation at event boundaries — how memorable key scenes will be.",
        citation="Ben-Yakov & Henson 2018, Journal of Neuroscience",
        score_method="peak_activation",
    ),
    CinemaMetricDef(
        name="Cognitive Clarity",
        key="cognitive_clarity",
        brain_regions=["PFC"],
        vertex_ranges=ROI_RANGES["PFC"],
        description="Inverse prefrontal load — lower PFC effort means the story is easy to follow.",
        citation="Hasson et al. 2008, Neuron",
        score_method="inverse_activation",
    ),
    CinemaMetricDef(
        name="Attention Grip",
        key="attention_grip",
        brain_regions=["DAN"],
        vertex_ranges=ROI_RANGES["DAN"],
        description="Sustained dorsal attention network engagement — how consistently the film holds focused attention.",
        citation="Petersen & Posner 2012, Annual Review of Neuroscience",
        score_method="sustained_activation",
    ),
    CinemaMetricDef(
        name="Surprise (Prediction Error)",
        key="surprise_prediction_error",
        brain_regions=["Salience", "DMN"],
        vertex_ranges=ROI_RANGES["Salience"] + ROI_RANGES["DMN"],
        description="Peak salience+DMN activation reflecting narrative surprise and prediction error.",
        citation="van der Meer et al. 2020, NeuroImage",
        score_method="peak_activation",
    ),
    CinemaMetricDef(
        name="Opening Hook",
        key="opening_hook",
        brain_regions=["Salience", "DAN"],
        vertex_ranges=ROI_RANGES["Salience"] + ROI_RANGES["DAN"],
        description="Salience-to-DAN activation in the first 5 minutes — how effectively the opening grabs attention.",
        citation="Zak 2015, Annals of the NY Academy of Sciences",
        score_method="mean_activation",
    ),
    CinemaMetricDef(
        name="Climax Impact",
        key="climax_impact",
        brain_regions=["Reward", "DMN"],
        vertex_ranges=ROI_RANGES["Reward"] + ROI_RANGES["DMN"],
        description="Peak Reward+DMN activation at the narrative climax — the emotional payoff of the story arc.",
        citation="Zak 2015, Annals of the NY Academy of Sciences",
        score_method="peak_activation",
    ),
    CinemaMetricDef(
        name="Resolution Satisfaction",
        key="resolution_satisfaction",
        brain_regions=["Reward", "PFC"],
        vertex_ranges=ROI_RANGES["Reward"],
        secondary_vertex_ranges=ROI_RANGES["PFC"],
        description="Reward/PFC ratio in the final act — whether the ending feels earned and satisfying.",
        citation="Rajimehr et al. 2022, NeuroImage",
        score_method="coupling_strength",
    ),
    CinemaMetricDef(
        name="Scene Transition Flow",
        key="scene_transition_flow",
        brain_regions=["Hippocampus", "Visual"],
        vertex_ranges=ROI_RANGES["Hippocampus"],
        secondary_vertex_ranges=ROI_RANGES["Visual"],
        description="Hippocampal-Visual recovery speed at scene boundaries — how smoothly cuts and transitions feel.",
        citation="Magliano & Zacks 2011, Journal of Experimental Psychology",
        score_method="coupling_strength",
    ),
    CinemaMetricDef(
        name="Dialogue Engagement",
        key="dialogue_engagement",
        brain_regions=["Language"],
        vertex_ranges=ROI_RANGES["Language"],
        description="Language network (Broca's + Wernicke's) engagement during dialogue — how compelling the words are.",
        citation="Silbert et al. 2014, PNAS",
        score_method="mean_activation",
    ),
    CinemaMetricDef(
        name="Tonal Consistency",
        key="tonal_consistency",
        brain_regions=["Limbic"],
        vertex_ranges=ROI_RANGES["Limbic"],
        description="Inverse limbic variance — whether the emotional tone is cohesive rather than jarring.",
        citation="Nummenmaa et al. 2012, PNAS",
        score_method="variance_inverse",
    ),
]


# ── Score computation helpers ──────────────────────────────────────────────


def _extract_roi_timeseries(
    predictions: np.ndarray,
    vertex_ranges: list[tuple[int, int]],
) -> np.ndarray:
    """Extract mean timeseries across vertex ranges from predictions.

    Args:
        predictions: Shape (n_timesteps, 20484).
        vertex_ranges: List of (start, end) index pairs into the vertex axis.

    Returns:
        1-D array of shape (n_timesteps,) — mean activation across ROI vertices.
    """
    cols: list[int] = []
    for start, end in vertex_ranges:
        cols.extend(range(start, min(end, predictions.shape[1])))
    if not cols:
        return np.zeros(predictions.shape[0], dtype=np.float32)
    return predictions[:, cols].mean(axis=1)


def _z_score_to_0_100(values: np.ndarray) -> float:
    """Z-score a timeseries mean and scale to 0-100.

    Assumes population baseline mean ~0, std ~1 (z-scored BOLD signal).
    Maps [-2, +2] range linearly to [0, 100], then clips.
    """
    mean_val = float(np.mean(values))
    # Map z-score range [-2, 2] to [0, 100]
    score = (mean_val + 2.0) / 4.0 * 100.0
    return float(np.clip(score, 0, 100))


def _mean_activation(ts: np.ndarray) -> float:
    """Mean activation: z-scored mean, scaled to 0-100."""
    return _z_score_to_0_100(ts)


def _sustained_activation(ts: np.ndarray) -> float:
    """Sustained activation: mean * (1 - coefficient_of_variation), scaled to 0-100.

    Rewards both high average activation AND consistency over time.
    """
    mean_val = float(np.mean(ts))
    std_val = float(np.std(ts))
    if abs(mean_val) < 1e-8:
        cv = 1.0
    else:
        cv = min(abs(std_val / mean_val), 1.0)
    raw = mean_val * (1.0 - cv)
    # Scale similarly: raw is roughly in [-2, 2] range
    score = (raw + 2.0) / 4.0 * 100.0
    return float(np.clip(score, 0, 100))


def _peak_activation(ts: np.ndarray) -> float:
    """Peak activation: max of ROI mean timeseries, scaled to 0-100."""
    peak = float(np.max(ts))
    # Peak z-scores typically in [0, 4] range
    score = peak / 4.0 * 100.0
    return float(np.clip(score, 0, 100))


def _coupling_strength(ts_a: np.ndarray, ts_b: np.ndarray) -> float:
    """Coupling strength: Pearson correlation between two ROI timeseries, scaled to 0-100.

    r in [-1, 1] -> score in [0, 100].
    """
    if len(ts_a) < 2 or len(ts_b) < 2:
        return 50.0
    # Ensure same length
    min_len = min(len(ts_a), len(ts_b))
    ts_a, ts_b = ts_a[:min_len], ts_b[:min_len]
    if np.std(ts_a) < 1e-8 or np.std(ts_b) < 1e-8:
        return 50.0
    r = float(np.corrcoef(ts_a, ts_b)[0, 1])
    if np.isnan(r):
        return 50.0
    # Map r from [-1, 1] to [0, 100]
    score = (r + 1.0) / 2.0 * 100.0
    return float(np.clip(score, 0, 100))


def _inverse_activation(ts: np.ndarray) -> float:
    """Inverse activation: 100 - mean_activation (lower raw = higher score)."""
    return 100.0 - _mean_activation(ts)


def _variance_inverse(ts: np.ndarray) -> float:
    """Variance inverse: 100 * (1 - normalized_variance).

    Low variance = high tonal consistency.
    """
    var = float(np.var(ts))
    # Normalize: typical variance for z-scored BOLD is ~1.0
    norm_var = min(var / 2.0, 1.0)
    score = 100.0 * (1.0 - norm_var)
    return float(np.clip(score, 0, 100))


# ── Main computation entry point ──────────────────────────────────────────


def compute_cinema_metrics(
    predictions: np.ndarray,
    timestamps: list[float],
) -> list[dict]:
    """Compute all 18 cinema neuroscience metrics from TRIBE v2 output.

    Args:
        predictions: Shape (n_timesteps, 20484) — cortical vertex predictions.
        timestamps: List of floats, one per timestep (seconds).

    Returns:
        List of 18 dicts, each with keys:
          name, key, score (0-100), raw_value, description, citation,
          brain_regions, score_method.
    """
    results: list[dict] = []

    for metric in CINEMA_METRICS:
        ts_primary = _extract_roi_timeseries(predictions, metric.vertex_ranges)

        # For opening_hook, restrict to first 5 minutes
        if metric.key == "opening_hook":
            cutoff = 5 * 60  # 5 minutes in seconds
            cutoff_idx = min(cutoff, len(ts_primary))
            ts_primary = ts_primary[:cutoff_idx]

        # For climax_impact, use last 25% of the content
        if metric.key == "climax_impact":
            start_idx = int(len(ts_primary) * 0.75)
            ts_primary = ts_primary[start_idx:]

        # For resolution_satisfaction, use last 5 minutes
        if metric.key == "resolution_satisfaction":
            cutoff = 5 * 60
            start_idx = max(0, len(ts_primary) - cutoff)
            ts_primary = ts_primary[start_idx:]

        # Compute score based on method
        if metric.score_method == "mean_activation":
            score = _mean_activation(ts_primary)
            raw_value = float(np.mean(ts_primary))

        elif metric.score_method == "sustained_activation":
            score = _sustained_activation(ts_primary)
            raw_value = float(np.mean(ts_primary))

        elif metric.score_method == "peak_activation":
            score = _peak_activation(ts_primary)
            raw_value = float(np.max(ts_primary)) if len(ts_primary) > 0 else 0.0

        elif metric.score_method == "coupling_strength":
            ts_secondary = _extract_roi_timeseries(
                predictions, metric.secondary_vertex_ranges
            )
            # Apply same time restrictions for secondary timeseries
            if metric.key == "resolution_satisfaction":
                cutoff = 5 * 60
                start_idx = max(0, len(ts_secondary) - cutoff)
                ts_secondary = ts_secondary[start_idx:]
            score = _coupling_strength(ts_primary, ts_secondary)
            min_len = min(len(ts_primary), len(ts_secondary))
            if min_len >= 2:
                raw_value = float(
                    np.corrcoef(ts_primary[:min_len], ts_secondary[:min_len])[0, 1]
                )
                if np.isnan(raw_value):
                    raw_value = 0.0
            else:
                raw_value = 0.0

        elif metric.score_method == "inverse_activation":
            score = _inverse_activation(ts_primary)
            raw_value = float(np.mean(ts_primary))

        elif metric.score_method == "variance_inverse":
            score = _variance_inverse(ts_primary)
            raw_value = float(np.var(ts_primary))

        else:
            score = 50.0
            raw_value = 0.0

        results.append(
            {
                "name": metric.name,
                "key": metric.key,
                "score": round(score, 1),
                "raw_value": round(raw_value, 4),
                "description": metric.description,
                "citation": metric.citation,
                "brain_regions": metric.brain_regions,
                "score_method": metric.score_method,
            }
        )

    return results
