"""
Stage 2 — TRIBE v2 Inference.

Loads the Meta TRIBE v2 brain encoding model from HuggingFace and runs
model.predict() to produce per-timestep cortical vertex predictions.

Output shape: (n_timesteps, 20484) at 1 Hz (one prediction per second).

Also supports modality ablation runs (video-only, audio-only, text-only)
by zeroing out the unused modality columns in the events DataFrame.
"""

from __future__ import annotations

from enum import Enum
from pathlib import Path

import numpy as np
import pandas as pd

from backend.config import settings


class Modality(str, Enum):
    FULL = "full"
    VIDEO_ONLY = "video_only"
    AUDIO_ONLY = "audio_only"
    TEXT_ONLY = "text_only"


# ── Overlap batching constants ──────────────────────────────────────────────
OVERLAP_S = 15.0  # seconds of overlap between batches for context continuity
MAX_CHUNK_S = 300.0  # maximum effective (non-overlap) duration per batch


# Lazy global — model is loaded once per worker process
_model = None


def _get_model():
    global _model
    if _model is None:
        from transformers import AutoModel

        _model = AutoModel.from_pretrained(
            settings.tribe_model_id,
            token=settings.hf_token or None,
            trust_remote_code=True,
        )
        _model.eval()
        if settings.device == "cuda":
            _model = _model.to("cuda")
    return _model


def _ablate_events(events_df: pd.DataFrame, modality: Modality) -> pd.DataFrame:
    """
    Zero out unused modality columns so TRIBE v2 treats them as absent.
    Returns a copy — does not modify the original DataFrame.
    """
    df = events_df.copy()
    if modality == Modality.VIDEO_ONLY:
        df["audio_path"] = ""
        df["word"] = ""
    elif modality == Modality.AUDIO_ONLY:
        df["video_path"] = ""
        df["word"] = ""
    elif modality == Modality.TEXT_ONLY:
        df["video_path"] = ""
        df["audio_path"] = ""
    return df


def run_inference(events_df: pd.DataFrame, modality: Modality = Modality.FULL) -> np.ndarray:
    """
    Run TRIBE v2 inference on the events DataFrame.

    Returns vertex predictions as float32 array of shape (n_timesteps, 20484).
    Values represent predicted fMRI BOLD signal (z-scored) at each cortical vertex.
    """
    import torch

    model = _get_model()
    df = _ablate_events(events_df, modality)

    with torch.no_grad():
        predictions = model.predict(df)

    # Ensure numpy float32
    if hasattr(predictions, "numpy"):
        predictions = predictions.cpu().numpy()
    predictions = predictions.astype(np.float32)

    # Expected shape: (n_timesteps, 20484)
    assert predictions.ndim == 2 and predictions.shape[1] == 20484, (
        f"Unexpected TRIBE v2 output shape: {predictions.shape}. Expected (n_timesteps, 20484)."
    )
    return predictions


def run_all_modalities(events_df: pd.DataFrame) -> dict[Modality, np.ndarray]:
    """
    Run all 4 inference passes (full + 3 ablations).
    Returns dict mapping Modality → predictions array (n_timesteps, 20484).

    Delegates to the single shared TRIBE v2 implementation in
    ``backend.pipeline.inference_core`` (the same code the RunPod pod and
    Serverless handler run), passing the events DataFrame in-memory so the
    worker-local path, the pod path, and the serverless path can never drift.
    The string-keyed result is mapped back onto the ``Modality`` enum.
    """
    from backend.pipeline.inference_core import run_tribe_inference

    preds_by_name = run_tribe_inference(events_df=events_df)
    out: dict[Modality, np.ndarray] = {}
    for modality in Modality:
        if modality.value in preds_by_name:
            out[modality] = preds_by_name[modality.value]
    return out


def save_predictions(predictions: dict[Modality, np.ndarray], output_path: Path) -> None:
    """Save all modality predictions to a compressed .npz file."""
    np.savez_compressed(str(output_path), **{m.value: arr for m, arr in predictions.items()})


def load_predictions(npz_path: Path) -> dict[Modality, np.ndarray]:
    """Load predictions from a .npz file."""
    data = np.load(str(npz_path))
    return {Modality(k): data[k] for k in data.files}


# ── Overlap batching for long-form content (feature films) ──────────────────


def merge_overlapping_predictions(
    batch_predictions: list[tuple[float, float, np.ndarray]],
    overlap_s: float = OVERLAP_S,
) -> tuple[np.ndarray, list[float]]:
    """Merge predictions from overlapping batches with linear crossfade.

    Ported from cinema/tribe.py — handles the boundary artifacts that arise
    when TRIBE v2's hemodynamic response function needs warm-up context.

    Args:
        batch_predictions: List of (start_sec, end_sec, predictions) tuples.
                           predictions shape: (n_seconds, 20484).
        overlap_s: Overlap duration in seconds.

    Returns:
        (merged_predictions, timestamps) where merged has shape
        (total_unique_seconds, 20484).
    """
    if not batch_predictions:
        return np.empty((0, 20484), dtype=np.float32), []

    if len(batch_predictions) == 1:
        start, end, preds = batch_predictions[0]
        timestamps = [start + t for t in range(preds.shape[0])]
        return preds, timestamps

    # Sort by start time
    batch_predictions.sort(key=lambda x: x[0])

    # Find the global time range
    global_start = batch_predictions[0][0]
    global_end = max(bp[1] for bp in batch_predictions)
    total_seconds = int(global_end - global_start)

    merged = np.zeros((total_seconds, 20484), dtype=np.float32)
    weights = np.zeros(total_seconds, dtype=np.float32)

    for start, end, preds in batch_predictions:
        n = preds.shape[0]
        offset = int(start - global_start)

        for t in range(n):
            global_t = offset + t
            if global_t >= total_seconds:
                break

            # Linear ramp-up over first overlap_s seconds (warm-up)
            if t < overlap_s:
                w = t / overlap_s
            # Linear ramp-down over last overlap_s seconds
            elif t > n - overlap_s:
                w = (n - t) / overlap_s
            else:
                w = 1.0

            w = max(0.0, min(1.0, w))
            merged[global_t] += preds[t] * w
            weights[global_t] += w

    # Normalize by total weight (handles overlap blending)
    nonzero = weights > 1e-8
    merged[nonzero] /= weights[nonzero, np.newaxis]

    timestamps = [global_start + t for t in range(total_seconds)]
    return merged, timestamps


def run_inference_with_overlap(
    events_df: pd.DataFrame,
    duration_s: float,
    modality: Modality = Modality.FULL,
    max_chunk_s: float = MAX_CHUNK_S,
    overlap_s: float = OVERLAP_S,
) -> np.ndarray:
    """Run TRIBE v2 inference with overlap batching for long-form content.

    When duration exceeds max_chunk_s, the events are split into overlapping
    windows and predictions are merged with linear crossfade to eliminate
    boundary artifacts from the hemodynamic response warm-up period.

    For content <= max_chunk_s, this is equivalent to run_inference().

    Args:
        events_df: Events DataFrame for the full content.
        duration_s: Total content duration in seconds.
        modality: Which modality channels to use.
        max_chunk_s: Maximum effective duration per batch (default 300s).
        overlap_s: Overlap between adjacent batches (default 15s).

    Returns:
        Vertex predictions as float32 array of shape (n_timesteps, 20484).
    """
    if duration_s <= max_chunk_s:
        return run_inference(events_df, modality)

    # Split events into overlapping time windows
    batch_predictions: list[tuple[float, float, np.ndarray]] = []
    chunk_start = 0.0

    while chunk_start < duration_s:
        chunk_end = min(chunk_start + max_chunk_s, duration_s)

        # Filter events DataFrame to this time window
        if "onset" in events_df.columns:
            mask = (events_df["onset"] >= chunk_start) & (events_df["onset"] < chunk_end)
        elif "start" in events_df.columns:
            mask = (events_df["start"] >= chunk_start) & (events_df["start"] < chunk_end)
        else:
            # Fall back to index-based slicing (1 Hz assumption)
            start_idx = int(chunk_start)
            end_idx = min(int(chunk_end), len(events_df))
            mask = events_df.index.isin(range(start_idx, end_idx))

        chunk_df = events_df.loc[mask].copy()
        if len(chunk_df) == 0:
            chunk_start = chunk_end - overlap_s
            continue

        preds = run_inference(chunk_df, modality)
        batch_predictions.append((chunk_start, chunk_end, preds))

        # Advance by (max_chunk_s - overlap_s) so adjacent batches overlap
        chunk_start += max_chunk_s - overlap_s

    if not batch_predictions:
        return run_inference(events_df, modality)

    merged, _timestamps = merge_overlapping_predictions(batch_predictions, overlap_s)
    return merged
