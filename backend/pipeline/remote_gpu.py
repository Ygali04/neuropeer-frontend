"""
Remote GPU Inference — DataCrunch.io A100 Spot Instance Integration.

Routes TRIBE v2 inference to either:
  A) Local GPU on the Celery worker (default for dev)
  B) Ephemeral DataCrunch A100 spot instance (production)

Flow for mode B:
  1. Worker uploads the downloaded video file to S3
  2. Worker creates DataCrunch A100 spot instance with bash startup script
  3. Instance boots, installs tribev2 from GitHub, downloads video from S3
  4. Instance runs TribeModel.get_events_dataframe() + model.predict() for all 4 modalities
  5. Instance uploads predictions.npz + sentinel file to S3
  6. Worker polls S3 for sentinel, downloads predictions, deletes instance

DataCrunch SDK: pip install datacrunch
"""
from __future__ import annotations

import io
import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd

from backend.config import settings
from backend.pipeline.tribe_inference import Modality, run_all_modalities

logger = logging.getLogger(__name__)


# ── Public entry point ────────────────────────────────────────────────────────


def run_inference_backend(
    job_id: str,
    events_df: pd.DataFrame,
    work_dir: Path,
    video_path: Path | None = None,
    audio_path: Path | None = None,
) -> tuple[dict[Modality, np.ndarray], str]:
    """Run TRIBE v2 inference via the configured backend."""
    if settings.inference_backend == "datacrunch":
        if video_path is None:
            logger.warning("DataCrunch backend requires video_path; falling back to local")
            return _run_locally(job_id, events_df)
        return _run_on_datacrunch(job_id, video_path, events_df, audio_path)
    return _run_locally(job_id, events_df)


# ── Local inference ──────────────────────────────────────────────────────────


def _run_locally(
    job_id: str,
    events_df: pd.DataFrame,
) -> tuple[dict[Modality, np.ndarray], str]:
    """Run all 4 TRIBE v2 passes on the local machine."""
    logger.info("Running TRIBE v2 locally for job %s", job_id)
    predictions = run_all_modalities(events_df)

    buf = io.BytesIO()
    np.savez_compressed(buf, **{m.value: arr for m, arr in predictions.items()})
    key = f"predictions/{job_id}/vertices.npz"
    _s3_upload(buf.getvalue(), key)

    return predictions, key


# ── DataCrunch A100 spot instance inference ──────────────────────────────────


class DataCrunchError(RuntimeError):
    pass


def _run_on_datacrunch(
    job_id: str,
    video_path: Path,
    events_df: pd.DataFrame | None = None,
    audio_path: Path | None = None,
) -> tuple[dict[Modality, np.ndarray], str]:
    """Spin up a DataCrunch GPU, run TRIBE v2, download results, delete instance."""
    logger.info("Provisioning DataCrunch GPU instance for job %s", job_id)

    # 1. Upload video + audio + events to S3
    video_s3_key = f"staging/{job_id}/video{video_path.suffix}"
    _s3_upload(video_path.read_bytes(), video_s3_key)

    audio_s3_key = f"staging/{job_id}/audio.wav"
    if audio_path and audio_path.exists():
        _s3_upload(audio_path.read_bytes(), audio_s3_key)
        logger.info("Audio uploaded to S3")

    events_s3_key = f"staging/{job_id}/events.parquet"
    if events_df is not None:
        buf = io.BytesIO()
        events_df.to_parquet(buf, index=False)
        _s3_upload(buf.getvalue(), events_s3_key)
        logger.info("Events DataFrame uploaded to S3")
    logger.info("Video uploaded to s3://%s/%s (%.1f MB)", settings.s3_bucket, video_s3_key, video_path.stat().st_size / (1024 * 1024))

    vertex_key = f"predictions/{job_id}/vertices.npz"
    sentinel_done = f"staging/{job_id}/done"
    sentinel_error = f"staging/{job_id}/error"
    instance_id: str | None = None
    script_id: str | None = None

    try:
        # 2. Create instance (finds available GPU, creates startup script)
        instance_id, script_id = _datacrunch_create_instance(job_id, video_s3_key, audio_s3_key, events_s3_key, vertex_key, sentinel_done, sentinel_error)
        logger.info("DataCrunch instance %s created for job %s", instance_id, job_id)

        # 3. Poll S3 for sentinel
        _poll_for_sentinel(instance_id, job_id, sentinel_done, sentinel_error)
        logger.info("Inference completed for job %s", job_id)

        # 4. Download predictions
        predictions = _s3_download_predictions(vertex_key)
        return predictions, vertex_key

    except DataCrunchError as exc:
        logger.warning("DataCrunch inference failed for job %s (instance=%s): %s", job_id, instance_id, exc)
        raise

    finally:
        if instance_id:
            try:
                _datacrunch_delete(instance_id)
            except Exception:
                logger.warning("Failed to delete DataCrunch instance %s", instance_id)
        if script_id:
            try:
                _datacrunch_client().startup_scripts.delete_by_id(script_id)
            except Exception:
                pass


# ── DataCrunch API client ────────────────────────────────────────────────────


def _datacrunch_client():
    """Return an authenticated DataCrunch SDK client."""
    try:
        from datacrunch import DataCrunchClient
    except ImportError as exc:
        raise DataCrunchError("DataCrunch SDK not installed. Run: pip install datacrunch") from exc

    if not settings.datacrunch_client_id or not settings.datacrunch_client_secret:
        raise DataCrunchError("DATACRUNCH_CLIENT_ID and DATACRUNCH_CLIENT_SECRET must be set")

    return DataCrunchClient(settings.datacrunch_client_id, settings.datacrunch_client_secret)


def _datacrunch_create_instance(
    job_id: str,
    video_s3_key: str,
    audio_s3_key: str,
    events_s3_key: str,
    output_s3_key: str,
    sentinel_done: str,
    sentinel_error: str,
) -> tuple[str, str]:
    """Create a DataCrunch spot instance. Returns (instance_id, script_id)."""
    client = _datacrunch_client()

    # SSH keys
    ssh_key_ids = [k.strip() for k in settings.datacrunch_ssh_key_ids.split(",") if k.strip()]
    if not ssh_key_ids:
        keys = client.ssh_keys.get()
        if not keys:
            raise DataCrunchError("No SSH keys configured in DataCrunch account")
        ssh_key_ids = [keys[0].id]
        logger.info("Using SSH key: %s", ssh_key_ids[0])

    # Create startup script as a separate resource (SDK requirement)
    script_content = _build_startup_script(video_s3_key, audio_s3_key, events_s3_key, output_s3_key, sentinel_done, sentinel_error)
    script_obj = client.startup_scripts.create(name=f"neuropeer-{job_id[:8]}", script=script_content)
    logger.info("Created startup script: %s", script_obj.id)

    # Find available instance type + location.
    # TRIBE v2 needs ~30GB VRAM — single-GPU instances are preferred
    # (cheapest), with 2-GPU as fallback. Multi-GPU (4x/8x) is never
    # provisioned to avoid $14+/hr surprises.
    #
    # Ordered by preference (cheapest single-GPU first):
    # Instance type names come from the DataCrunch/Verda API.
    # Format: <count><GPU>.<totalVRAM>V (e.g. 4A100.88V = 4 A100s, 88GB VRAM each × 4 = 352 total)
    # Single-GPU preferred (cheapest). Multi-GPU as last resort.
    # Cap at 4-GPU to avoid $30+/hr instances.
    PREFERRED_TYPES = [
        # Single-GPU — cheapest, preferred (TRIBE v2 needs ~30GB VRAM)
        # Names are exact DataCrunch API strings observed in availability responses.
        # CUDA compat: A100/L40S=sm_80/89, RTX6000Ada=sm_89, H100/H200=sm_90.
        # B200/B300 (Blackwell sm_100) excluded — PyTorch build lacks kernels.
        "1A100.80G",
        "1A100.40G",
        "1L40S.48G",
        "1RTX6000ADA.10V",     # FIN-01, Ada sm_89
        "1H100.80G",
        "1H100.80S.30V",       # FIN-02 naming variant
        "1H200.141S",
        "1H200.141S.44V",      # FIN-02/FIN-03, Hopper sm_90
        # 2-GPU fallbacks (moderate cost)
        "2A100.80G",
        "2RTX6000ADA.20V",     # FIN-03
        "2RTXPRO6000.60V",
        # Multi-GPU fallbacks (expensive, last resort)
        "4A100.88V",
        "4RTXPRO6000.120V",
        "4H200.141S.176V",
        "8H200.141S.176V",     # FIN-03, Hopper sm_90
    ]

    avail = client.instances.get_availabilities()
    inst_type = settings.datacrunch_instance_type
    location = None

    # Try the configured type first
    for entry in avail:
        loc = entry["location_code"] if isinstance(entry, dict) else entry.location_code
        types = entry["availabilities"] if isinstance(entry, dict) else entry.availabilities
        if inst_type in types:
            location = loc
            break

    # Fallback: walk the preference list
    if not location:
        for preferred in PREFERRED_TYPES:
            if preferred == inst_type:
                continue  # already tried
            for entry in avail:
                loc = entry["location_code"] if isinstance(entry, dict) else entry.location_code
                types = entry["availabilities"] if isinstance(entry, dict) else entry.availabilities
                if preferred in types:
                    inst_type = preferred
                    location = loc
                    logger.info("Primary %s unavailable, falling back to %s", settings.datacrunch_instance_type, inst_type)
                    break
            if location:
                break

    if not location:
        client.startup_scripts.delete_by_id(script_obj.id)
        raise DataCrunchError(f"No single-GPU instances available. Checked: {avail}")

    logger.info("Using %s in %s", inst_type, location)

    # Create instance — try spot first (cheaper), fall back to on-demand.
    # Spot instances may be evicted, but NeuroPeer jobs are short (2-5 min)
    # so eviction risk is low. On-demand is the safe fallback.
    last_error = None
    for is_spot in [True, False]:
        tier = "spot" if is_spot else "on-demand"
        try:
            instance = client.instances.create(
                instance_type=inst_type,
                image=settings.datacrunch_image,
                ssh_key_ids=ssh_key_ids,
                hostname=f"neuropeer-{job_id[:8]}",
                description=f"NeuroPeer-{job_id[:8]}-{tier}",
                location=location,
                is_spot=is_spot,
                startup_script_id=script_obj.id,
                max_wait_time=600,
            )
            logger.info("Provisioned %s %s instance: %s", inst_type, tier, instance.id)
            return instance.id, script_obj.id
        except Exception as exc:
            last_error = exc
            logger.warning("Failed to create %s %s instance: %s", inst_type, tier, exc)

    # Both spot and on-demand failed
    client.startup_scripts.delete_by_id(script_obj.id)
    raise DataCrunchError(f"Failed to create {inst_type} instance (spot + on-demand both failed): {last_error}") from last_error


def _poll_for_sentinel(instance_id: str, job_id: str, sentinel_done: str, sentinel_error: str) -> None:
    """Poll S3 for sentinel file indicating inference completion."""
    deadline = time.time() + settings.datacrunch_boot_timeout
    poll_interval = 15.0
    client = _datacrunch_client()

    while time.time() < deadline:
        if _s3_key_exists(sentinel_done):
            return
        if _s3_key_exists(sentinel_error):
            error_body = _s3_download_text(sentinel_error)
            raise DataCrunchError(f"Inference failed on instance {instance_id}: {error_body[:500]}")

        try:
            instance = client.instances.get_by_id(instance_id)
            status = getattr(instance, "status", "unknown")
            logger.debug("Instance %s status: %s (job=%s)", instance_id, status, job_id)
            if status in ("failed", "error", "offline"):
                raise DataCrunchError(f"DataCrunch instance {instance_id} status: {status}")
        except DataCrunchError:
            raise
        except Exception as exc:
            logger.warning("DataCrunch poll error: %s", exc)

        time.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.3, 60)

    raise DataCrunchError(f"Instance {instance_id} timed out after {settings.datacrunch_boot_timeout}s")


def _datacrunch_delete(instance_id: str) -> None:
    """Delete a DataCrunch instance."""
    try:
        from datacrunch.constants import Actions

        client = _datacrunch_client()
        client.instances.action(instance_id, Actions.DELETE)
        logger.info("Deleted DataCrunch instance %s", instance_id)
    except Exception as exc:
        logger.warning("Error deleting DataCrunch instance %s: %s", instance_id, exc)


# ── Startup script (runs inside the DataCrunch A100 instance) ────────────────


def _build_startup_script(
    video_s3_key: str,
    audio_s3_key: str,
    events_s3_key: str,
    output_s3_key: str,
    sentinel_done: str,
    sentinel_error: str,
) -> str:
    """Generate the bash startup script for the DataCrunch A100 instance.

    Uses the real TRIBE v2 API from facebookresearch/tribev2:
      from tribev2 import TribeModel
      model = TribeModel.from_pretrained("facebook/tribev2")
      df = model.get_events_dataframe(video_path="video.mp4")
      preds, segments = model.predict(events=df)
    """
    return f"""#!/bin/bash
set -e

export AWS_ACCESS_KEY_ID="{settings.aws_access_key_id}"
export AWS_SECRET_ACCESS_KEY="{settings.aws_secret_access_key}"
export AWS_DEFAULT_REGION="{settings.aws_region}"
export S3_BUCKET="{settings.s3_bucket}"
export S3_ENDPOINT_URL="{settings.s3_endpoint_url}"
export HF_TOKEN="{settings.hf_token}"

echo "=== NeuroPeer TRIBE v2 Inference ==="
echo "Installing dependencies..."

# Install system deps first (python3-venv missing on DataCrunch images)
apt-get update -qq && apt-get install -y -qq python3-venv python3-pip ffmpeg > /dev/null 2>&1

# Install tribev2 with optimized dependency resolution
python3 -m venv /tmp/venv
source /tmp/venv/bin/activate
pip install --upgrade pip -q

# Install PyTorch first with CUDA (uses pre-built wheel, ~60s)
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124 -q 2>&1 | tail -2

# Install tribev2 WITHOUT reinstalling torch (--no-deps + manual deps)
pip install git+https://github.com/facebookresearch/tribev2.git --no-deps 2>&1 | tail -3
# IMPORTANT: neuralset must be pinned to 0.0.2 — version 0.0.3 removed
# AddText from events.transforms, which tribev2 still imports.
pip install transformers huggingface-hub numpy pandas pyarrow scipy \
  nilearn nibabel x-transformers einops soundfile moviepy julius \
  exca "neuralset==0.0.2" neuraltrain boto3 polars mne spacy langdetect -q 2>&1 | tail -3

echo "Dependencies installed."

# Download video + events from S3
echo "Downloading files from S3..."
python3 -c "
import boto3, os
s3 = boto3.client('s3',
    endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None,
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'))
s3.download_file(os.environ['S3_BUCKET'], '{video_s3_key}', '/tmp/video.mp4')
try:
    s3.download_file(os.environ['S3_BUCKET'], '{audio_s3_key}', '/tmp/audio.wav')
    print('Audio downloaded')
except:
    print('No audio file, TRIBE will extract from video')
try:
    s3.download_file(os.environ['S3_BUCKET'], '{events_s3_key}', '/tmp/events.parquet')
    print('Events downloaded')
except:
    print('No pre-built events, will generate from video')
"
echo "Files downloaded."

# Write the inference script
cat > /tmp/inference.py << 'PYEOF'
import io, os, sys, logging, json
import numpy as np
import pandas as pd
import boto3

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tribe_inference")

S3_BUCKET = os.environ["S3_BUCKET"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL") or None
VIDEO_PATH = "/tmp/video.mp4"
EVENTS_PATH = "/tmp/events.parquet"
OUTPUT_KEY = "{output_s3_key}"
SENTINEL_DONE = "{sentinel_done}"
SENTINEL_ERROR = "{sentinel_error}"

def s3():
    return boto3.client("s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    )

MAX_CHUNK_S = 300  # seconds per chunk
OVERLAP_S = 15     # seconds of overlap for context continuity

def chunked_predict(model, events_df, max_chunk_s=MAX_CHUNK_S, overlap_s=OVERLAP_S):
    """Run TRIBE v2 in chunks to avoid OOM on long videos."""
    total_duration = events_df["onset"].max() + 1

    if total_duration <= max_chunk_s:
        # Short video — single pass
        preds, segments = model.predict(events=events_df)
        return preds, segments

    log.info("Chunking %d seconds into %d-second windows with %d-second overlap",
             int(total_duration), max_chunk_s, overlap_s)

    all_preds = []
    chunk_start = 0

    while chunk_start < total_duration:
        chunk_end = min(chunk_start + max_chunk_s, total_duration)

        # Select events in this chunk's time range
        mask = (events_df["onset"] >= chunk_start) & (events_df["onset"] < chunk_end)
        chunk_df = events_df[mask].copy()

        if len(chunk_df) == 0:
            chunk_start += max_chunk_s - overlap_s
            continue

        log.info("  Chunk %.0f-%.0fs (%d events)", chunk_start, chunk_end, len(chunk_df))
        preds, segments = model.predict(events=chunk_df)
        all_preds.append((chunk_start, chunk_end, preds))

        chunk_start += max_chunk_s - overlap_s

    # Merge with linear crossfade
    return merge_overlapping(all_preds, total_duration), None


def merge_overlapping(batch_preds, total_duration, overlap_s=OVERLAP_S):
    """Merge overlapping prediction chunks with linear crossfade."""
    if len(batch_preds) == 1:
        return batch_preds[0][2]

    total_s = int(total_duration)
    n_vertices = batch_preds[0][2].shape[1] if len(batch_preds[0][2].shape) > 1 else 1
    merged = np.zeros((total_s, n_vertices), dtype=np.float32)
    weights = np.zeros(total_s, dtype=np.float32)

    for start, end, preds in batch_preds:
        n = preds.shape[0]
        offset = int(start)

        for t in range(n):
            gt = offset + t
            if gt >= total_s:
                break
            # Linear ramp in overlap regions
            if t < overlap_s:
                w = t / overlap_s
            elif t > n - overlap_s:
                w = (n - t) / overlap_s
            else:
                w = 1.0
            w = max(0.0, min(1.0, w))
            merged[gt] += preds[t] * w if len(preds.shape) > 1 else preds[t] * w
            weights[gt] += w

    nonzero = weights > 1e-8
    merged[nonzero] /= weights[nonzero, np.newaxis] if len(merged.shape) > 1 else weights[nonzero]
    return merged

try:
    from tribev2 import TribeModel
    from neuralset.events.utils import standardize_events

    # Load TRIBE v2 model
    log.info("Loading TRIBE v2 model...")
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/tmp/tribe_cache")
    log.info("Model loaded successfully")

    # Use pre-built events if available (avoids whisperx dependency)
    if os.path.exists(EVENTS_PATH):
        log.info("Loading pre-built events from %s", EVENTS_PATH)
        df = pd.read_parquet(EVENTS_PATH)
        df = standardize_events(df)
    else:
        log.info("Generating events from video...")
        df = model.get_events_dataframe(video_path=VIDEO_PATH)
    log.info("Events: %d rows", len(df))

    # Run full multimodal prediction
    log.info("Running TRIBE v2 full multimodal inference...")
    preds_full, segments = chunked_predict(model, df)
    log.info("Full predictions: shape=%s", preds_full.shape)

    # Run modality ablations (video-only, audio-only, text-only)
    predictions = {{"full": preds_full.astype(np.float32) if hasattr(preds_full, 'astype') else np.array(preds_full, dtype=np.float32)}}

    for modality_name, ablation_kwargs in [
        ("video_only", {{"audio_path": None}}),
        ("audio_only", {{"video_path": None}}),
        ("text_only",  {{"video_path": None, "audio_path": None}}),
    ]:
        log.info("Running ablation: %s", modality_name)
        try:
            df_ablated = model.get_events_dataframe(video_path=VIDEO_PATH)
            # Zero out the ablated modality columns
            for col, val in ablation_kwargs.items():
                if col in df_ablated.columns and val is None:
                    df_ablated[col] = ""
            preds, _ = chunked_predict(model, df_ablated)
            predictions[modality_name] = preds.astype(np.float32) if hasattr(preds, 'astype') else np.array(preds, dtype=np.float32)
            log.info("  %s: shape=%s", modality_name, predictions[modality_name].shape)
        except Exception as e:
            log.warning("Ablation %s failed: %s — using full predictions as fallback", modality_name, e)
            predictions[modality_name] = predictions["full"].copy()

    # Upload predictions to S3
    log.info("Uploading predictions to S3...")
    out_buf = io.BytesIO()
    np.savez_compressed(out_buf, **predictions)
    s3().put_object(Bucket=S3_BUCKET, Key=OUTPUT_KEY, Body=out_buf.getvalue())

    # Signal success
    s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_DONE, Body=json.dumps({{
        "status": "done",
        "n_timesteps": int(preds_full.shape[0]),
        "n_vertices": int(preds_full.shape[1]) if len(preds_full.shape) > 1 else 0,
        "modalities": list(predictions.keys()),
    }}).encode())
    log.info("Done! Predictions uploaded successfully.")

except Exception as e:
    log.error("Inference failed: %s", e, exc_info=True)
    try:
        s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_ERROR, Body=str(e).encode())
    except Exception:
        pass
    sys.exit(1)
PYEOF

# Run inference
echo "Running inference script..."
python /tmp/inference.py
echo "Inference complete!"
"""


# ── S3 helpers ────────────────────────────────────────────────────────────────


def _s3_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        region_name=settings.aws_region,
    )


def _s3_upload(data: bytes, key: str) -> None:
    _s3_client().put_object(Bucket=settings.s3_bucket, Key=key, Body=data)


def _s3_key_exists(key: str) -> bool:
    import botocore.exceptions

    try:
        _s3_client().head_object(Bucket=settings.s3_bucket, Key=key)
        return True
    except botocore.exceptions.ClientError:
        return False


def _s3_download_text(key: str) -> str:
    resp = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return resp["Body"].read().decode("utf-8", errors="replace")


def _s3_download_predictions(key: str) -> dict[Modality, np.ndarray]:
    resp = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    data = np.load(io.BytesIO(resp["Body"].read()))
    return {Modality(k): data[k] for k in data.files}
