"""Single source of truth for TRIBE v2 GPU-side inference.

This module contains the inference logic that runs *on the GPU* (inside a
RunPod pod's startup script today, and inside a RunPod Serverless handler
going forward). It is deliberately self-contained and dependency-light at
import time: heavy GPU deps (``torch``, ``tribev2``, ``boto3``) are imported
lazily inside the functions that need them so this module can be imported on
the CPU-only API/worker host (and in unit tests) without those packages.

Historically this code lived as an inline ``/tmp/inference.py`` heredoc string
inside ``remote_gpu._build_startup_script``. That string is now generated *from*
the functions here (see :func:`render_pod_inference_script`) so there is exactly
ONE copy of the inference logic, shared by:

  * the legacy pod-per-job path (``remote_gpu._build_startup_script``)
  * the new RunPod Serverless handler (``backend/serverless/rp_handler.py``)

Both paths ultimately call :func:`run_tribe_inference`.
"""

from __future__ import annotations

import inspect
import io
import json
import logging
import os
from typing import Any

import numpy as np

log = logging.getLogger("tribe_inference")

# Event-level chunking params (chunk the DataFrame, NOT the video file).
MAX_CHUNK_S = 300  # seconds per chunk
OVERLAP_S = 15  # seconds of overlap for context continuity

# Hardware guard thresholds — kept in sync with the bash checks in the legacy
# pod startup script so both compute backends fail fast on unusable hardware.
MIN_VRAM_MB = 22000  # TRIBE v2 needs ~22 GB VRAM
MAX_CUDA_COMPUTE_CAP = 90  # PyTorch cu124 supports up to sm_90 (no Blackwell)

N_VERTICES = 20484

MODALITIES = ("full", "video_only", "audio_only", "text_only")


# ── Hardware guards ──────────────────────────────────────────────────────────


class HardwareError(RuntimeError):
    """Raised when the GPU is missing or unsuitable for TRIBE v2."""


def check_gpu(
    min_vram_mb: int = MIN_VRAM_MB,
    max_compute_cap: int = MAX_CUDA_COMPUTE_CAP,
) -> dict[str, Any]:
    """Validate the GPU has enough VRAM and a supported compute capability.

    Mirrors the ``nvidia-smi`` based checks in the legacy pod startup script,
    but runs in-process via ``torch`` (available inside the serverless image).

    Returns a dict describing the detected GPU. Raises :class:`HardwareError`
    if no CUDA GPU is present, VRAM is below ``min_vram_mb``, or the compute
    capability exceeds ``max_compute_cap`` (e.g. Blackwell sm_120+).
    """
    import torch

    if not torch.cuda.is_available():
        raise HardwareError("No CUDA GPU detected by torch")

    props = torch.cuda.get_device_properties(0)
    vram_mb = int(props.total_memory / (1024 * 1024))
    # compute_cap as a 2-digit int, e.g. 8.0 -> 80, 9.0 -> 90, 12.0 -> 120
    compute_cap = props.major * 10 + props.minor
    info = {
        "name": props.name,
        "vram_mb": vram_mb,
        "compute_cap": compute_cap,
    }

    if vram_mb < min_vram_mb:
        raise HardwareError(f"GPU {props.name} has {vram_mb} MB VRAM, need >= {min_vram_mb} MB for TRIBE v2")
    if compute_cap > max_compute_cap:
        raise HardwareError(
            f"GPU {props.name} compute capability sm_{compute_cap} exceeds PyTorch cu124 max (sm_{max_compute_cap})"
        )

    log.info("GPU OK: %s, %d MB VRAM, sm_%d", props.name, vram_mb, compute_cap)
    return info


# ── Chunked inference (the actual model run) ─────────────────────────────────


def chunked_predict(model, events_df, max_chunk_s=MAX_CHUNK_S, overlap_s=OVERLAP_S):
    """Run TRIBE v2 in time-windowed chunks on the events DataFrame.

    Chunk the EVENTS, not the video file — this is the approach that works for
    long-form content. For content shorter than ``max_chunk_s`` this is a single
    ``model.predict`` call.
    """
    time_col = None
    for col_name in ["onset", "start", "time", "timestamp"]:
        if col_name in events_df.columns:
            time_col = col_name
            break
    if time_col is None:
        log.warning(
            "No time column found in events_df (columns=%s), running single-pass",
            list(events_df.columns),
        )
        preds, _segments = model.predict(events=events_df)
        return preds

    total_duration = events_df[time_col].max() + 1

    if total_duration <= max_chunk_s:
        log.info("Video <= %ds, running single-pass inference", max_chunk_s)
        preds, _segments = model.predict(events=events_df)
        log.info("Single-pass predictions: shape=%s, dtype=%s", preds.shape, preds.dtype)
        return preds

    log.info(
        "Chunking %d seconds into %d-second windows with %d-second overlap",
        int(total_duration),
        max_chunk_s,
        overlap_s,
    )

    all_preds = []
    chunk_start = 0
    while chunk_start < total_duration:
        chunk_end = min(chunk_start + max_chunk_s, total_duration)
        mask = (events_df[time_col] >= chunk_start) & (events_df[time_col] < chunk_end)
        chunk_df = events_df[mask].copy()
        if len(chunk_df) == 0:
            log.warning("  Chunk %.0f-%.0fs: 0 events, skipping", chunk_start, chunk_end)
            chunk_start += max_chunk_s - overlap_s
            continue
        log.info("  Chunk %.0f-%.0fs (%d events)", chunk_start, chunk_end, len(chunk_df))
        preds, _segments = model.predict(events=chunk_df)
        log.info("  Chunk result: shape=%s", preds.shape)
        all_preds.append((chunk_start, chunk_end, preds))
        chunk_start += max_chunk_s - overlap_s

    if len(all_preds) == 0:
        log.error("No chunks produced predictions!")
        return np.zeros((int(total_duration), N_VERTICES), dtype=np.float32)
    if len(all_preds) == 1:
        return all_preds[0][2]
    return merge_overlapping(all_preds, total_duration, overlap_s)


def merge_overlapping(batch_preds, total_duration, overlap_s=OVERLAP_S):
    """Merge overlapping prediction chunks with a linear crossfade."""
    total_s = int(total_duration)
    n_vertices = batch_preds[0][2].shape[1] if len(batch_preds[0][2].shape) > 1 else 1
    merged = np.zeros((total_s, n_vertices), dtype=np.float32)
    weights = np.zeros(total_s, dtype=np.float32)

    for start, _end, preds in batch_preds:
        n = preds.shape[0]
        offset = int(start)
        for t in range(n):
            gt = offset + t
            if gt >= total_s:
                break
            if t < overlap_s:
                w = t / overlap_s
            elif t > n - overlap_s:
                w = (n - t) / overlap_s
            else:
                w = 1.0
            w = max(0.0, min(1.0, w))
            merged[gt] += preds[t] * w if len(preds.shape) > 1 else float(preds[t]) * w
            weights[gt] += w

    nonzero = weights > 1e-8
    if len(merged.shape) > 1:
        merged[nonzero] /= weights[nonzero, np.newaxis]
    else:
        merged[nonzero] /= weights[nonzero]
    return merged


# Columns blanked (set to "") to produce each single-modality ablation. Kept
# here next to the inference loop so the GPU/pod path and the worker-local
# CorticalScorer path share ONE definition of what each ablation means.
_ABLATION_COLUMNS: dict[str, tuple[str, ...]] = {
    "video_only": ("audio_path",),
    "audio_only": ("video_path",),
    "text_only": ("video_path", "audio_path"),
}


def _ablate_events_df(events_df, modality_name: str):
    """Return a copy of ``events_df`` with the ablation columns for ``modality_name`` blanked."""
    df_ablated = events_df.copy()
    for col in _ABLATION_COLUMNS.get(modality_name, ()):
        if col in df_ablated.columns:
            df_ablated[col] = ""
    return df_ablated


def run_tribe_inference(
    video_path: str = "/tmp/video.mp4",
    events_path: str | None = "/tmp/events.parquet",
    events_df=None,
) -> dict[str, np.ndarray]:
    """Run the full + 3 ablation TRIBE v2 passes.

    This is the **single** TRIBE v2 inference implementation, shared by every
    compute backend:

      * the legacy pod-per-job path and the RunPod Serverless handler call it
        with file paths (``video_path`` / ``events_path``);
      * the worker-local :class:`CorticalScorer` calls it with an in-memory
        ``events_df`` (no temp files, no video regeneration — ablations are
        produced by blanking columns on the provided DataFrame).

    Loads ``facebook/tribev2`` once, then produces predictions for the ``full``
    modality plus the ``video_only`` / ``audio_only`` / ``text_only`` ablations.

    Returns a dict mapping modality name -> float32 predictions array of shape
    ``(n_timesteps, 20484)``.
    """
    import pandas as pd
    from tribev2 import TribeModel

    log.info("Loading TRIBE v2 model...")
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/tmp/tribe_cache")
    log.info("Model loaded successfully")

    # Source the full-modality events DataFrame. An in-memory df (worker-local
    # scorer) takes precedence; then a pre-built parquet; then regenerate from
    # the source video (GPU/pod path).
    in_memory = events_df is not None
    if in_memory:
        log.info("Using in-memory events DataFrame (%d rows)", len(events_df))
        df = events_df
    elif events_path and os.path.exists(events_path):
        log.info("Loading pre-built events from %s", events_path)
        df = pd.read_parquet(events_path)
        try:
            from neuralset.events.utils import standardize_events

            df = standardize_events(df)
        except Exception as e:
            log.warning("standardize_events failed: %s — using raw events", e)
    else:
        log.info("Generating events from video...")
        df = model.get_events_dataframe(video_path=video_path)
    log.info("Events DataFrame: %d rows, columns=%s", len(df), list(df.columns))

    log.info("Running TRIBE v2 full multimodal inference...")
    preds_full = chunked_predict(model, df)
    log.info(
        "Full predictions: shape=%s, nonzero=%d/%d",
        preds_full.shape,
        int(np.count_nonzero(preds_full)),
        int(preds_full.size),
    )

    predictions: dict[str, np.ndarray] = {"full": preds_full.astype(np.float32)}

    for modality_name in ("video_only", "audio_only", "text_only"):
        log.info("Running ablation: %s", modality_name)
        try:
            if in_memory:
                # Ablate the provided DataFrame directly (no video access).
                df_ablated = _ablate_events_df(df, modality_name)
            else:
                # Regenerate events from the source video, then blank columns.
                df_ablated = _ablate_events_df(
                    model.get_events_dataframe(video_path=video_path), modality_name
                )
            preds = chunked_predict(model, df_ablated)
            predictions[modality_name] = preds.astype(np.float32)
            log.info("  %s: shape=%s", modality_name, predictions[modality_name].shape)
        except Exception as e:
            log.warning(
                "Ablation %s failed: %s — using full predictions as fallback",
                modality_name,
                e,
            )
            predictions[modality_name] = predictions["full"].copy()

    return predictions


def predictions_to_npz_bytes(predictions: dict[str, np.ndarray]) -> bytes:
    """Serialize a modality->array dict to compressed .npz bytes."""
    buf = io.BytesIO()
    np.savez_compressed(buf, **predictions)
    return buf.getvalue()


def done_sentinel_payload(predictions: dict[str, np.ndarray]) -> bytes:
    """Build the JSON 'done' sentinel body summarizing a prediction set."""
    preds_full = predictions["full"]
    return json.dumps(
        {
            "status": "done",
            "n_timesteps": int(preds_full.shape[0]),
            "n_vertices": int(preds_full.shape[1]) if len(preds_full.shape) > 1 else 0,
            "modalities": list(predictions.keys()),
        }
    ).encode()


# ── Pod startup-script rendering (legacy path) ───────────────────────────────
#
# The legacy RunPod pod runs a *bash* startup command, which in turn writes a
# Python file and executes it. To keep ONE source of truth, we render that
# Python file from the functions above instead of hand-maintaining a second
# copy of the inference code. The bash wrapper (deps install, S3 download,
# nvidia-smi guards, log upload) stays in remote_gpu.py; the *inference body*
# comes from here.


def _inference_module_source() -> str:
    """Return the source of the chunking + inference functions as a string.

    Used to embed identical logic into the pod's ``/tmp/inference.py`` without
    importing this package on the pod (the pod has no ``backend`` on its path).
    """
    parts = [
        inspect.getsource(chunked_predict),
        inspect.getsource(merge_overlapping),
    ]
    return "\n\n".join(parts)


def render_pod_inference_script(
    output_s3_key: str,
    sentinel_done: str,
    sentinel_error: str,
) -> str:
    """Render the ``/tmp/inference.py`` body for the legacy pod path.

    The chunking + merge functions are injected verbatim from this module so
    they can never drift from the serverless handler. The S3 glue and the
    full/ablation orchestration are templated around them with the runtime
    S3 keys. Substitution is done via ``str.replace`` (not an f-string) so the
    embedded Python's own braces need no escaping.
    """
    shared_fns = _inference_module_source()
    template = """import io, os, sys, logging, json
import numpy as np
import pandas as pd
import boto3

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tribe_inference")

S3_BUCKET = os.environ["S3_BUCKET"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL") or None
VIDEO_PATH = "/tmp/video.mp4"
EVENTS_PATH = "/tmp/events.parquet"
OUTPUT_KEY = "__OUTPUT_KEY__"
SENTINEL_DONE = "__SENTINEL_DONE__"
SENTINEL_ERROR = "__SENTINEL_ERROR__"

MAX_CHUNK_S = 300
OVERLAP_S = 15

def s3():
    return boto3.client("s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    )


__SHARED_FNS__


try:
    from tribev2 import TribeModel

    log.info("Loading TRIBE v2 model...")
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/tmp/tribe_cache")
    log.info("Model loaded successfully")

    if os.path.exists(EVENTS_PATH):
        log.info("Loading pre-built events from %s", EVENTS_PATH)
        df = pd.read_parquet(EVENTS_PATH)
        try:
            from neuralset.events.utils import standardize_events
            df = standardize_events(df)
        except Exception as e:
            log.warning("standardize_events failed: %s — using raw events", e)
    else:
        log.info("Generating events from video...")
        df = model.get_events_dataframe(video_path=VIDEO_PATH)
    log.info("Events DataFrame: %d rows, columns=%s", len(df), list(df.columns))

    log.info("Running TRIBE v2 full multimodal inference...")
    preds_full = chunked_predict(model, df)
    log.info("Full predictions: shape=%s, nonzero=%d/%d",
             preds_full.shape, int(np.count_nonzero(preds_full)), int(preds_full.size))

    predictions = {"full": preds_full.astype(np.float32)}

    for modality_name, ablation_kwargs in [
        ("video_only", {"audio_path": None}),
        ("audio_only", {"video_path": None}),
        ("text_only",  {"video_path": None, "audio_path": None}),
    ]:
        log.info("Running ablation: %s", modality_name)
        try:
            df_ablated = model.get_events_dataframe(video_path=VIDEO_PATH)
            for col, val in ablation_kwargs.items():
                if col in df_ablated.columns and val is None:
                    df_ablated[col] = ""
            preds = chunked_predict(model, df_ablated)
            predictions[modality_name] = preds.astype(np.float32)
            log.info("  %s: shape=%s", modality_name, predictions[modality_name].shape)
        except Exception as e:
            log.warning("Ablation %s failed: %s — using full predictions as fallback", modality_name, e)
            predictions[modality_name] = predictions["full"].copy()

    log.info("Uploading predictions to S3...")
    out_buf = io.BytesIO()
    np.savez_compressed(out_buf, **predictions)
    s3().put_object(Bucket=S3_BUCKET, Key=OUTPUT_KEY, Body=out_buf.getvalue())

    s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_DONE, Body=json.dumps({
        "status": "done",
        "n_timesteps": int(preds_full.shape[0]),
        "n_vertices": int(preds_full.shape[1]) if len(preds_full.shape) > 1 else 0,
        "modalities": list(predictions.keys()),
    }).encode())
    log.info("Done! Predictions uploaded successfully.")

except Exception as e:
    log.error("Inference failed: %s", e, exc_info=True)
    try:
        s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_ERROR, Body=str(e).encode())
    except Exception:
        pass
    sys.exit(1)
"""
    return (
        template.replace("__SHARED_FNS__", shared_fns)
        .replace("__OUTPUT_KEY__", output_s3_key)
        .replace("__SENTINEL_DONE__", sentinel_done)
        .replace("__SENTINEL_ERROR__", sentinel_error)
    )
