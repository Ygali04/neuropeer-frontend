"""
Remote GPU Inference — Verda B200 Spot Instance Integration.

This module abstracts the inference compute backend so TRIBE v2 can run either:
  A) Locally on the Celery worker (requires local GPU — default for dev)
  B) On an ephemeral Verda B200 spot instance (recommended for production)

Architecture for mode B:
  Celery Worker (CPU only)
    1. Stages events.parquet to S3
    2. POSTs to Verda API → B200 spot instance boots
    3. Instance: downloads events.parquet, loads TRIBE v2, runs 4 passes
    4. Instance: uploads predictions.npz to S3, self-terminates
    5. Worker: downloads predictions, runs metrics (CPU), broadcasts results

Key properties:
  - GPU billing starts only when inference begins
  - Instance auto-terminates after uploading results — no zombie instances
  - Median inference time on B200: ~45-90s for a 60s video (4 passes)
  - Fallback to local inference if Verda API is unreachable

Verda SDK: pip install verda  (github.com/verda-cloud/sdk-python)
  Client is authenticated via API key set in VERDA_API_KEY.
  Docs: https://docs.verda.com
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
    """
    Run TRIBE v2 inference via the configured backend.

    Returns:
        predictions: dict Modality -> (n_timesteps, 20484) float32 array
        vertex_s3_key: S3 key where the raw predictions are stored
    """
    if settings.inference_backend == "verda":
        return _run_on_verda(job_id, events_df)
    else:
        return _run_locally(job_id, events_df)


# ── Local inference (dev / worker-with-GPU) ───────────────────────────────────


def _run_locally(
    job_id: str,
    events_df: pd.DataFrame,
) -> tuple[dict[Modality, np.ndarray], str]:
    """Run all 4 TRIBE v2 passes on the local machine (requires CUDA GPU)."""
    logger.info("Running TRIBE v2 locally for job %s", job_id)
    predictions = run_all_modalities(events_df)

    buf = io.BytesIO()
    np.savez_compressed(buf, **{m.value: arr for m, arr in predictions.items()})
    key = f"predictions/{job_id}/vertices.npz"
    _s3_upload(buf.getvalue(), key)

    return predictions, key


# ── Verda B200 spot instance inference ────────────────────────────────────────


class VerdaError(RuntimeError):
    pass


def _run_on_verda(
    job_id: str,
    events_df: pd.DataFrame,
) -> tuple[dict[Modality, np.ndarray], str]:
    """
    Spin up a Verda B200 spot instance, run TRIBE v2 inference,
    download results, and terminate the instance.

    Falls back to local inference if Verda is unreachable.
    """
    logger.info("Provisioning Verda B200 instance for job %s", job_id)

    # 1. Stage events DataFrame to S3 so the instance can fetch it
    events_s3_key = f"staging/{job_id}/events.parquet"
    buf = io.BytesIO()
    events_df.to_parquet(buf, index=False)
    _s3_upload(buf.getvalue(), events_s3_key)
    logger.info("Events DataFrame staged to s3://%s/%s", settings.s3_bucket, events_s3_key)

    vertex_key = f"predictions/{job_id}/vertices.npz"
    instance_id: str | None = None

    try:
        # 2. Create and start the B200 spot instance
        instance_id = _verda_create_instance(job_id, events_s3_key, vertex_key)
        logger.info("Verda instance %s created for job %s", instance_id, job_id)

        # 3. Poll until instance completes (self-terminates after uploading results)
        _verda_wait_for_completion(instance_id, job_id)
        logger.info("Verda instance %s completed for job %s", instance_id, job_id)

        # 4. Download predictions from S3
        predictions = _s3_download_predictions(vertex_key)
        return predictions, vertex_key

    except VerdaError as exc:
        logger.warning(
            "Verda inference failed for job %s (instance=%s), falling back to local: %s",
            job_id,
            instance_id,
            exc,
        )
        # Graceful fallback — job never hard-fails due to spot availability
        return _run_locally(job_id, events_df)

    finally:
        # Terminate instance even if we crashed mid-flight
        if instance_id:
            try:
                _verda_terminate(instance_id)
            except Exception:
                logger.warning(
                    "Failed to terminate Verda instance %s — may require manual cleanup",
                    instance_id,
                )


# ── Verda API client (via official verda Python SDK) ──────────────────────────


def _verda_client():
    """
    Return an authenticated Verda SDK client.

    Install: pip install verda
    Docs:    https://docs.verda.com/sdk/python
    """
    try:
        import verda  # noqa: PLC0415

        return verda.Client(api_key=settings.verda_api_key, base_url=settings.verda_api_url)
    except ImportError as exc:
        raise VerdaError("Verda SDK not installed. Run: pip install verda") from exc


def _verda_create_instance(job_id: str, events_s3_key: str, output_s3_key: str) -> str:
    """
    Create a B200 spot instance with a startup script that runs TRIBE v2
    inference and uploads predictions to S3 before exiting.
    """
    startup_script = _build_inference_script(events_s3_key, output_s3_key)

    payload = {
        "instance_type": settings.verda_instance_type,  # "b200.1x"
        "image": settings.verda_inference_image,  # pre-built Docker image
        "spot": True,
        "labels": {
            "neuropeer_job_id": job_id,
            "managed_by": "neuropeer",
        },
        "env": {
            "AWS_ACCESS_KEY_ID": settings.aws_access_key_id,
            "AWS_SECRET_ACCESS_KEY": settings.aws_secret_access_key,
            "AWS_REGION": settings.aws_region,
            "S3_ENDPOINT_URL": settings.s3_endpoint_url,
            "S3_BUCKET": settings.s3_bucket,
            "HF_TOKEN": settings.hf_token,
            "TRIBE_MODEL_ID": settings.tribe_model_id,
        },
        "startup_script": startup_script,
        "max_runtime_seconds": 1800,  # 30-min safety cap
    }

    try:
        client = _verda_client()
        instance = client.instances.create(**payload)
        return instance.id
    except VerdaError:
        raise
    except Exception as exc:
        raise VerdaError(f"Failed to create Verda instance: {exc}") from exc


def _verda_wait_for_completion(instance_id: str, job_id: str) -> None:
    """
    Poll the Verda instance until it reaches status 'completed' or 'terminated'.
    The startup script exits 0 on success; Verda propagates the exit code.
    """
    deadline = time.time() + settings.verda_boot_timeout
    poll_interval = 10.0

    try:
        client = _verda_client()
    except VerdaError:
        raise

    while time.time() < deadline:
        try:
            instance = client.instances.get(instance_id)
            status = getattr(instance, "status", "unknown")
            logger.debug("Verda instance %s status: %s (job=%s)", instance_id, status, job_id)

            if status in ("completed", "terminated", "stopped"):
                exit_code = getattr(instance, "exit_code", 0) or 0
                if exit_code != 0:
                    logs = getattr(instance, "logs", "") or ""
                    raise VerdaError(
                        f"Inference script exited {exit_code} on instance {instance_id}. Logs: {logs[-500:]}"
                    )
                return

            if status in ("failed", "error", "cancelled"):
                logs = getattr(instance, "logs", "") or ""
                raise VerdaError(f"Verda instance {instance_id} entered status '{status}'. Logs: {logs[-500:]}")

        except VerdaError:
            raise
        except Exception as exc:
            logger.warning("Verda poll error for %s: %s", instance_id, exc)

        time.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.5, 60)

    raise VerdaError(f"Verda instance {instance_id} timed out after {settings.verda_boot_timeout}s")


def _verda_terminate(instance_id: str) -> None:
    """Force-terminate a Verda spot instance."""
    try:
        client = _verda_client()
        client.instances.terminate(instance_id)
    except Exception as exc:
        logger.warning("Error terminating Verda instance %s: %s", instance_id, exc)


# ── Inference script (runs INSIDE the Verda B200 instance) ───────────────────


def _build_inference_script(events_s3_key: str, output_s3_key: str) -> str:
    """
    Generate the Python startup script that runs inside the B200 instance.

    Self-contained: downloads events.parquet from S3, loads TRIBE v2,
    runs 4 modality passes, uploads predictions.npz, exits 0.
    The instance self-terminates after the script exits.
    """
    return (
        "#!/usr/bin/env python3\n"
        "import io, os, sys, logging\n"
        "import numpy as np\n"
        "import pandas as pd\n"
        "import boto3\n"
        "logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')\n"
        "log = logging.getLogger('tribe_inference')\n"
        f"EVENTS_KEY = {events_s3_key!r}\n"
        f"OUTPUT_KEY = {output_s3_key!r}\n"
        "S3_BUCKET = os.environ['S3_BUCKET']\n"
        "s3 = boto3.client('s3',\n"
        "    endpoint_url=os.environ.get('S3_ENDPOINT_URL') or None,\n"
        "    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID') or None,\n"
        "    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY') or None,\n"
        "    region_name=os.environ.get('AWS_REGION', 'us-east-1'),\n"
        ")\n"
        "log.info('Downloading events: s3://%s/%s', S3_BUCKET, EVENTS_KEY)\n"
        "buf = io.BytesIO(s3.get_object(Bucket=S3_BUCKET, Key=EVENTS_KEY)['Body'].read())\n"
        "events_df = pd.read_parquet(buf)\n"
        "log.info('Events loaded: %d rows', len(events_df))\n"
        "import torch\n"
        "from transformers import AutoModel\n"
        "MODEL_ID = os.environ.get('TRIBE_MODEL_ID', 'facebook/tribev2')\n"
        "HF_TOKEN = os.environ.get('HF_TOKEN') or None\n"
        "model = AutoModel.from_pretrained(MODEL_ID, token=HF_TOKEN, trust_remote_code=True)\n"
        "model.eval().cuda()\n"
        "log.info('Model loaded on GPU')\n"
        "MODALITIES = ['full', 'video_only', 'audio_only', 'text_only']\n"
        "predictions = {}\n"
        "for modality in MODALITIES:\n"
        "    df = events_df.copy()\n"
        "    if modality == 'video_only': df['audio_path'] = ''; df['word'] = ''\n"
        "    elif modality == 'audio_only': df['video_path'] = ''; df['word'] = ''\n"
        "    elif modality == 'text_only': df['video_path'] = ''; df['audio_path'] = ''\n"
        "    log.info('Inference: modality=%s', modality)\n"
        "    with torch.no_grad():\n"
        "        preds = model.predict(df)\n"
        "    if hasattr(preds, 'cpu'): preds = preds.cpu().numpy()\n"
        "    predictions[modality] = preds.astype(np.float32)\n"
        "    log.info('Done %s: shape=%s', modality, preds.shape)\n"
        "out_buf = io.BytesIO()\n"
        "np.savez_compressed(out_buf, **predictions)\n"
        "s3.put_object(Bucket=S3_BUCKET, Key=OUTPUT_KEY, Body=out_buf.getvalue())\n"
        "log.info('Uploaded predictions to s3://%s/%s', S3_BUCKET, OUTPUT_KEY)\n"
        "sys.exit(0)\n"
    )


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


def _s3_download_predictions(key: str) -> dict[Modality, np.ndarray]:
    """Download a predictions .npz from S3 and return as Modality -> array dict."""
    resp = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    data = np.load(io.BytesIO(resp["Body"].read()))
    return {Modality(k): data[k] for k in data.files}
