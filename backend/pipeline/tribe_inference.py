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
    """
    return {modality: run_inference(events_df, modality) for modality in Modality}


def save_predictions(predictions: dict[Modality, np.ndarray], output_path: Path) -> None:
    """Save all modality predictions to a compressed .npz file."""
    np.savez_compressed(str(output_path), **{m.value: arr for m, arr in predictions.items()})


def load_predictions(npz_path: Path) -> dict[Modality, np.ndarray]:
    """Load predictions from a .npz file."""
    data = np.load(str(npz_path))
    return {Modality(k): data[k] for k in data.files}
