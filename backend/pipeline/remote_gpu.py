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
    if settings.inference_backend == "mock":
        logger.info("Mock TRIBE v2 for job %s (%d events)", job_id, len(events_df))
        n_timesteps = max(len(events_df), 1)
        mock_preds = np.random.randn(n_timesteps, 20484).astype(np.float32) * 0.3
        predictions = {m: mock_preds.copy() for m in Modality}
    else:
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

        # 3b. Download and display GPU inference log (DIAG output)
        gpu_log_key = f"staging/{job_id}/gpu_log.txt"
        try:
            gpu_log = _s3_download_text(gpu_log_key)
            # Show last 5KB of GPU log (includes DIAG lines and chunk summary)
            log_tail = gpu_log[-5000:] if len(gpu_log) > 5000 else gpu_log
            logger.info("=== GPU INFERENCE LOG (last %d chars) ===\n%s\n=== END GPU LOG ===", len(log_tail), log_tail)
        except Exception:
            logger.debug("No GPU log found at %s", gpu_log_key)

        # 4. Download predictions
        predictions = _s3_download_predictions(vertex_key)
        return predictions, vertex_key

    except DataCrunchError as exc:
        logger.warning("DataCrunch inference failed for job %s (instance=%s): %s", job_id, instance_id, exc)
        # Try to retrieve GPU log even on failure
        gpu_log_key = f"staging/{job_id}/gpu_log.txt"
        try:
            gpu_log = _s3_download_text(gpu_log_key)
            log_tail = gpu_log[-5000:] if len(gpu_log) > 5000 else gpu_log
            logger.error("=== GPU LOG (FAILED RUN) ===\n%s\n=== END GPU LOG ===", log_tail)
        except Exception:
            logger.debug("No GPU log available for failed run")
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
        # Single-GPU — cheapest first. TRIBE v2 needs ~30GB VRAM.
        # Both old-format (e.g. 1A100.80G) and new Verda-format (e.g.
        # 1A100.22V) are listed — API may return either depending on region.
        # CUDA compat: A6000/A100=sm_80, L40S/RTX6000Ada=sm_89, H100/H200=sm_90.
        # B200/B300 (Blackwell sm_100) excluded — PyTorch build lacks kernels.
        # RTX PRO 6000 (Blackwell) uses sm_100 too — excluded for same reason.
        "1A100.22V",           # A100 80GB SXM4 new naming, ~$1.29/hr — most reliable
        "1A100.80G",           # A100 80GB old naming
        "1RTX6000ADA.10V",     # RTX 6000 Ada 48GB, ~$0.83/hr, sm_89
        "1A100.40S.22V",       # A100 40GB SXM4, ~$0.72/hr
        "1A100.40G",           # A100 40GB old naming
        "1L40S.20V",           # L40S 48GB new naming, ~$0.91/hr
        "1L40S.48G",           # L40S 48GB old naming
        "1A6000.10V",          # A6000 48GB — OS image compat issues, try last
        "1H100.80S.30V",       # H100 80GB SXM5 FIN-02, ~$2.29/hr
        "1H100.80S.32V",       # H100 80GB SXM5 variant, ~$2.29/hr
        "1H100.80G",           # H100 80GB old naming
        "1H200.141S.44V",      # H200 141GB SXM5, ~$3.39/hr
        "1H200.141S",          # H200 old naming
        # 2-GPU fallbacks (moderate cost)
        "2A100.80G",
        "2RTX6000ADA.20V",
        "2RTXPRO6000.60V",
        # 4-GPU last resort (cap here to avoid $30+/hr)
        "4A100.88V",
        "4RTXPRO6000.120V",
        "4H200.141S.176V",
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

    # Dynamic fallback: accept any single/dual-GPU instance not in the
    # preferred list.  VRAM is validated on-instance by the startup script,
    # so we only filter out known-incompatible architectures (Blackwell
    # sm_100 — PyTorch lacks kernels).
    if not location:
        _BLACKWELL_PATTERNS = {"B200", "B300"}
        tried = {inst_type} | set(PREFERRED_TYPES)
        for entry in avail:
            loc = entry["location_code"] if isinstance(entry, dict) else entry.location_code
            types = entry["availabilities"] if isinstance(entry, dict) else entry.availabilities
            for t in types:
                if t in tried:
                    continue
                if not (t.startswith("1") or t.startswith("2")):
                    continue
                if any(bp in t for bp in _BLACKWELL_PATTERNS):
                    continue
                inst_type = t
                location = loc
                logger.info("Dynamic fallback: using %s in %s", inst_type, location)
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
    # Derive GPU log key from sentinel path (staging/{job_id}/gpu_log.txt)
    gpu_log_key = sentinel_done.rsplit("/", 1)[0] + "/gpu_log.txt"

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
  exca "neuralset==0.0.2" neuraltrain boto3 polars mne spacy langdetect \
  Levenshtein -q 2>&1 | tail -3

# TRIBE v2 uses 'uvx' (from uv) to run whisperx for audio transcription
pip install uv -q 2>&1 | tail -1

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

# VRAM validation — fail fast if GPU has insufficient memory for TRIBE v2
echo "Checking GPU VRAM..."
GPU_MEM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 | tr -d ' ')
if [ -z "$GPU_MEM_MB" ]; then
    echo "ERROR: nvidia-smi not found or no GPU detected"
    python3 -c "
import boto3, os
s3 = boto3.client('s3', endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None,
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'))
s3.put_object(Bucket=os.environ['S3_BUCKET'], Key='{sentinel_error}',
    Body=b'No GPU detected by nvidia-smi')
"
    exit 1
fi
MIN_VRAM_MB=22000
echo "GPU VRAM: ${{GPU_MEM_MB}} MB (minimum: ${{MIN_VRAM_MB}} MB)"
if [ "$GPU_MEM_MB" -lt "$MIN_VRAM_MB" ]; then
    echo "ERROR: GPU has ${{GPU_MEM_MB}} MB VRAM, need >= ${{MIN_VRAM_MB}} MB for TRIBE v2"
    python3 -c "
import boto3, os
s3 = boto3.client('s3', endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None,
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'))
s3.put_object(Bucket=os.environ['S3_BUCKET'], Key='{sentinel_error}',
    Body=b'GPU VRAM insufficient: ${{GPU_MEM_MB}} MB < ${{MIN_VRAM_MB}} MB required for TRIBE v2')
"
    exit 1
fi

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

# Event-level chunking params (chunk the DataFrame, NOT the video file)
MAX_CHUNK_S = 300  # seconds per chunk
OVERLAP_S = 15     # seconds of overlap for context continuity

def s3():
    return boto3.client("s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    )

def chunked_predict(model, events_df, max_chunk_s=MAX_CHUNK_S, overlap_s=OVERLAP_S):
    # Run TRIBE v2 in time-windowed chunks on the events DataFrame.
    # This is the approach that works — chunk the EVENTS, not the video file.
    # Detect the time column name
    time_col = None
    for col_name in ["onset", "start", "time", "timestamp"]:
        if col_name in events_df.columns:
            time_col = col_name
            break
    if time_col is None:
        log.warning("No time column found in events_df (columns=%s), running single-pass", list(events_df.columns))
        preds, segments = model.predict(events=events_df)
        return preds

    total_duration = events_df[time_col].max() + 1

    if total_duration <= max_chunk_s:
        # Short video — single pass (no chunking needed)
        log.info("Video <= %ds, running single-pass inference", max_chunk_s)
        preds, segments = model.predict(events=events_df)
        log.info("Single-pass predictions: shape=%s, dtype=%s", preds.shape, preds.dtype)
        return preds

    log.info("Chunking %d seconds into %d-second windows with %d-second overlap",
             int(total_duration), max_chunk_s, overlap_s)

    all_preds = []
    chunk_start = 0

    while chunk_start < total_duration:
        chunk_end = min(chunk_start + max_chunk_s, total_duration)

        # Select events in this chunk's time range
        mask = (events_df[time_col] >= chunk_start) & (events_df[time_col] < chunk_end)
        chunk_df = events_df[mask].copy()

        if len(chunk_df) == 0:
            log.warning("  Chunk %.0f-%.0fs: 0 events, skipping", chunk_start, chunk_end)
            chunk_start += max_chunk_s - overlap_s
            continue

        log.info("  Chunk %.0f-%.0fs (%d events)", chunk_start, chunk_end, len(chunk_df))
        preds, segments = model.predict(events=chunk_df)
        log.info("  Chunk result: shape=%s", preds.shape)
        all_preds.append((chunk_start, chunk_end, preds))

        chunk_start += max_chunk_s - overlap_s

    # Merge with linear crossfade
    if len(all_preds) == 0:
        log.error("No chunks produced predictions!")
        return np.zeros((int(total_duration), 20484), dtype=np.float32)
    if len(all_preds) == 1:
        return all_preds[0][2]

    return merge_overlapping(all_preds, total_duration, overlap_s)


def merge_overlapping(batch_preds, total_duration, overlap_s=OVERLAP_S):
    # Merge overlapping prediction chunks with linear crossfade.
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
            merged[gt] += preds[t] * w if len(preds.shape) > 1 else float(preds[t]) * w
            weights[gt] += w

    nonzero = weights > 1e-8
    if len(merged.shape) > 1:
        merged[nonzero] /= weights[nonzero, np.newaxis]
    else:
        merged[nonzero] /= weights[nonzero]
    return merged


try:
    from tribev2 import TribeModel

    # Load TRIBE v2 model ONCE
    log.info("Loading TRIBE v2 model...")
    model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/tmp/tribe_cache")
    log.info("Model loaded successfully")

    # Use pre-built events if available, otherwise extract from video
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

    # Run full multimodal prediction (with event-level chunking for long videos)
    log.info("Running TRIBE v2 full multimodal inference...")
    preds_full = chunked_predict(model, df)
    log.info("Full predictions: shape=%s, nonzero=%d/%d",
             preds_full.shape, int(np.count_nonzero(preds_full)), int(preds_full.size))

    predictions = {{"full": preds_full.astype(np.float32)}}

    # Run modality ablations (video-only, audio-only, text-only)
    for modality_name, ablation_kwargs in [
        ("video_only", {{"audio_path": None}}),
        ("audio_only", {{"video_path": None}}),
        ("text_only",  {{"video_path": None, "audio_path": None}}),
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

# Run inference — capture ALL output to log file for S3 upload
echo "Running inference script..."
set +e
python /tmp/inference.py > /tmp/gpu_inference.log 2>&1
INFERENCE_EXIT=$?
set -e

# Print log to stdout (visible in instance console if SSH'd in)
cat /tmp/gpu_inference.log

# Upload GPU log to S3 regardless of inference outcome
echo "Uploading GPU log to S3..."
python3 -c "
import boto3, os
s3 = boto3.client('s3', endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None,
    aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
    aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    region_name=os.environ.get('AWS_DEFAULT_REGION', 'us-east-1'))
with open('/tmp/gpu_inference.log', 'rb') as f:
    s3.put_object(Bucket=os.environ['S3_BUCKET'], Key='{gpu_log_key}', Body=f.read())
print('GPU log uploaded to S3 at {gpu_log_key}')
" || echo "WARNING: Failed to upload GPU log"

if [ $INFERENCE_EXIT -ne 0 ]; then
    echo "Inference script failed with exit code $INFERENCE_EXIT"
    exit $INFERENCE_EXIT
fi
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


def _s3_presigned_url(key: str, expires_in: int = 3600) -> str:
    """Generate a presigned GET URL for an S3 object (1-hour default)."""
    return _s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires_in,
    )


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
