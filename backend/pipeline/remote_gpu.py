"""
Remote GPU Inference — DataCrunch.io A100 Spot Instance Integration.

Routes TRIBE v2 inference to either:
  A) Local GPU on the Celery worker (default for dev)
  B) Ephemeral DataCrunch A100 spot instance (recommended for production)

Flow for mode B:
  1. Worker stages events.parquet to S3
  2. Worker creates DataCrunch A100 spot instance with bash startup script
  3. Instance boots, installs deps, downloads events from S3, runs TRIBE v2
  4. Instance uploads predictions.npz + sentinel file to S3, then idles
  5. Worker polls S3 for sentinel, downloads predictions, deletes instance

DataCrunch SDK: pip install datacrunch
Docs: https://datacrunch-python.readthedocs.io
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
) -> tuple[dict[Modality, np.ndarray], str]:
    """Run TRIBE v2 inference via the configured backend."""
    if settings.inference_backend == "datacrunch":
        return _run_on_datacrunch(job_id, events_df)
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
    events_df: pd.DataFrame,
) -> tuple[dict[Modality, np.ndarray], str]:
    """Spin up a DataCrunch A100 spot, run inference, download results, delete instance."""
    logger.info("Provisioning DataCrunch A100 instance for job %s", job_id)

    # 1. Stage events to S3
    events_s3_key = f"staging/{job_id}/events.parquet"
    buf = io.BytesIO()
    events_df.to_parquet(buf, index=False)
    _s3_upload(buf.getvalue(), events_s3_key)
    logger.info("Events staged to s3://%s/%s", settings.s3_bucket, events_s3_key)

    vertex_key = f"predictions/{job_id}/vertices.npz"
    sentinel_done = f"staging/{job_id}/done"
    sentinel_error = f"staging/{job_id}/error"
    instance_id: str | None = None

    try:
        # 2. Create spot instance
        instance_id = _datacrunch_create_instance(job_id, events_s3_key, vertex_key, sentinel_done, sentinel_error)
        logger.info("DataCrunch instance %s created for job %s", instance_id, job_id)

        # 3. Poll S3 for sentinel (instance has no "completed" status)
        _poll_for_sentinel(instance_id, job_id, sentinel_done, sentinel_error)
        logger.info("Inference completed for job %s", job_id)

        # 4. Download predictions
        predictions = _s3_download_predictions(vertex_key)
        return predictions, vertex_key

    except DataCrunchError as exc:
        logger.warning(
            "DataCrunch inference failed for job %s (instance=%s), falling back to local: %s",
            job_id,
            instance_id,
            exc,
        )
        return _run_locally(job_id, events_df)

    finally:
        if instance_id:
            try:
                _datacrunch_delete(instance_id)
            except Exception:
                logger.warning("Failed to delete DataCrunch instance %s", instance_id)


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
    events_s3_key: str,
    output_s3_key: str,
    sentinel_done: str,
    sentinel_error: str,
) -> str:
    """Create a DataCrunch A100 spot instance with a startup script."""
    client = _datacrunch_client()

    ssh_key_ids = [k.strip() for k in settings.datacrunch_ssh_key_ids.split(",") if k.strip()]
    if not ssh_key_ids:
        # Try to get first available SSH key from account
        keys = client.ssh_keys.get()
        if not keys:
            raise DataCrunchError(
                "No SSH keys configured. Add an SSH key in the DataCrunch dashboard "
                "and set DATACRUNCH_SSH_KEY_IDS in your .env"
            )
        ssh_key_ids = [keys[0].id]
        logger.info("Using SSH key: %s", ssh_key_ids[0])

    startup_script = _build_startup_script(events_s3_key, output_s3_key, sentinel_done, sentinel_error)

    try:
        instance = client.instances.create(
            instance_type=settings.datacrunch_instance_type,
            image=settings.datacrunch_image,
            ssh_key_ids=ssh_key_ids,
            hostname=f"neuropeer-{job_id[:8]}",
            description=f"NeuroPeer TRIBE v2 inference for job {job_id}",
            is_spot=True,
            startup_script=startup_script,
        )
        return instance.id
    except Exception as exc:
        raise DataCrunchError(f"Failed to create DataCrunch instance: {exc}") from exc


def _poll_for_sentinel(instance_id: str, job_id: str, sentinel_done: str, sentinel_error: str) -> None:
    """Poll S3 for sentinel file indicating inference completion."""
    deadline = time.time() + settings.datacrunch_boot_timeout
    poll_interval = 15.0
    client = _datacrunch_client()

    while time.time() < deadline:
        # Check S3 for completion sentinel
        if _s3_key_exists(sentinel_done):
            return
        if _s3_key_exists(sentinel_error):
            error_body = _s3_download_text(sentinel_error)
            raise DataCrunchError(f"Inference script failed on instance {instance_id}: {error_body[:500]}")

        # Check instance hasn't failed
        try:
            instance = client.instances.get_by_id(instance_id)
            status = getattr(instance, "status", "unknown")
            logger.debug("Instance %s status: %s (job=%s)", instance_id, status, job_id)
            if status in ("failed", "error", "offline"):
                raise DataCrunchError(f"DataCrunch instance {instance_id} entered status '{status}'")
        except DataCrunchError:
            raise
        except Exception as exc:
            logger.warning("DataCrunch poll error: %s", exc)

        time.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.3, 60)

    raise DataCrunchError(f"DataCrunch instance {instance_id} timed out after {settings.datacrunch_boot_timeout}s")


def _datacrunch_delete(instance_id: str) -> None:
    """Delete a DataCrunch instance."""
    try:
        from datacrunch.constants import Actions

        client = _datacrunch_client()
        client.instances.action(instance_id, Actions.DELETE)
        logger.info("Deleted DataCrunch instance %s", instance_id)
    except Exception as exc:
        logger.warning("Error deleting DataCrunch instance %s: %s", instance_id, exc)


# ── Startup script (bash, runs inside the DataCrunch instance) ───────────────


def _build_startup_script(
    events_s3_key: str,
    output_s3_key: str,
    sentinel_done: str,
    sentinel_error: str,
) -> str:
    """Generate the bash startup script that runs on the DataCrunch A100 instance."""
    # Inject S3 credentials and config as environment variables
    s3_env = f"""
export AWS_ACCESS_KEY_ID="{settings.aws_access_key_id}"
export AWS_SECRET_ACCESS_KEY="{settings.aws_secret_access_key}"
export AWS_DEFAULT_REGION="{settings.aws_region}"
export S3_BUCKET="{settings.s3_bucket}"
export S3_ENDPOINT_URL="{settings.s3_endpoint_url}"
export HF_TOKEN="{settings.hf_token}"
export TRIBE_MODEL_ID="{settings.tribe_model_id}"
"""

    return f"""#!/bin/bash
set -e

{s3_env}

# Install Python ML dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124 2>&1 | tail -3
pip install transformers huggingface-hub numpy pandas pyarrow boto3 scipy 2>&1 | tail -3

# Write the inference script
cat > /tmp/inference.py << 'PYEOF'
import io, os, sys, logging
import numpy as np
import pandas as pd
import boto3

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tribe_inference")

S3_BUCKET = os.environ["S3_BUCKET"]
S3_ENDPOINT = os.environ.get("S3_ENDPOINT_URL") or None
EVENTS_KEY = "{events_s3_key}"
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

try:
    log.info("Downloading events from S3")
    buf = io.BytesIO(s3().get_object(Bucket=S3_BUCKET, Key=EVENTS_KEY)["Body"].read())
    events_df = pd.read_parquet(buf)

    import torch
    from transformers import AutoModel
    MODEL_ID = os.environ.get("TRIBE_MODEL_ID", "facebook/tribev2")
    HF_TOKEN = os.environ.get("HF_TOKEN") or None
    model = AutoModel.from_pretrained(MODEL_ID, token=HF_TOKEN, trust_remote_code=True)
    model.eval().cuda()
    log.info("Model loaded on GPU")

    MODALITIES = ["full", "video_only", "audio_only", "text_only"]
    predictions = {{}}
    for modality in MODALITIES:
        df = events_df.copy()
        if modality == "video_only": df["audio_path"] = ""; df["word"] = ""
        elif modality == "audio_only": df["video_path"] = ""; df["word"] = ""
        elif modality == "text_only": df["video_path"] = ""; df["audio_path"] = ""
        log.info("Inference: %s", modality)
        with torch.no_grad():
            preds = model.predict(df)
        if hasattr(preds, "cpu"): preds = preds.cpu().numpy()
        predictions[modality] = preds.astype(np.float32)
        log.info("Done %s: shape=%s", modality, preds.shape)

    out_buf = io.BytesIO()
    np.savez_compressed(out_buf, **predictions)
    s3().put_object(Bucket=S3_BUCKET, Key=OUTPUT_KEY, Body=out_buf.getvalue())
    s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_DONE, Body=b"ok")
    log.info("Done. Predictions uploaded.")

except Exception as e:
    log.error("Inference failed: %s", e)
    try:
        s3().put_object(Bucket=S3_BUCKET, Key=SENTINEL_ERROR, Body=str(e).encode())
    except Exception:
        pass
    sys.exit(1)
PYEOF

# Run the inference script
python /tmp/inference.py
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
    """Check if an S3 key exists (used for sentinel file polling)."""
    import botocore.exceptions

    try:
        _s3_client().head_object(Bucket=settings.s3_bucket, Key=key)
        return True
    except botocore.exceptions.ClientError:
        return False


def _s3_download_text(key: str) -> str:
    """Download a small text file from S3."""
    resp = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    return resp["Body"].read().decode("utf-8", errors="replace")


def _s3_download_predictions(key: str) -> dict[Modality, np.ndarray]:
    """Download predictions .npz from S3."""
    resp = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    data = np.load(io.BytesIO(resp["Body"].read()))
    return {Modality(k): data[k] for k in data.files}
