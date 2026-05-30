"""Client for submitting jobs to a RunPod Serverless endpoint.

Used when ``GPU_BACKEND=serverless``. Instead of provisioning a pod per job
(``remote_gpu._run_on_runpod``), this uploads the inputs to S3 (same staging
keys as the pod path), submits the job to a pre-deployed RunPod Serverless
endpoint, polls ``/status`` until the worker finishes, and downloads the
predictions from S3.

RunPod Serverless REST API (https://docs.runpod.io/serverless/endpoints/job-operations):
    POST https://api.runpod.ai/v2/{endpoint_id}/run         -> {"id": "...", "status": "IN_QUEUE"}
    GET  https://api.runpod.ai/v2/{endpoint_id}/status/{id} -> {"status": "...", "output": {...}}

Terminal statuses: COMPLETED, FAILED, CANCELLED, TIMED_OUT.
"""

from __future__ import annotations

import io
import logging
import time

import pandas as pd
import requests

from backend.config import settings

logger = logging.getLogger(__name__)

RUNPOD_SERVERLESS_BASE = "https://api.runpod.ai/v2"

_TERMINAL_OK = {"COMPLETED"}
_TERMINAL_FAIL = {"FAILED", "CANCELLED", "TIMED_OUT"}


class RunPodServerlessError(RuntimeError):
    pass


def _endpoint_id() -> str:
    eid = settings.runpod_serverless_endpoint_id
    if not eid:
        raise RunPodServerlessError("RUNPOD_SERVERLESS_ENDPOINT_ID not configured")
    return eid


def _headers() -> dict[str, str]:
    if not settings.runpod_api_key:
        raise RunPodServerlessError("RUNPOD_API_KEY not configured")
    return {
        "Authorization": f"Bearer {settings.runpod_api_key}",
        "Content-Type": "application/json",
    }


def submit_job(payload: dict) -> str:
    """Submit a job to the serverless endpoint. Returns the RunPod job id."""
    url = f"{RUNPOD_SERVERLESS_BASE}/{_endpoint_id()}/run"
    resp = requests.post(url, headers=_headers(), json={"input": payload}, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    job_rp_id = data.get("id")
    if not job_rp_id:
        raise RunPodServerlessError(f"RunPod /run returned no job id: {data}")
    logger.info("Submitted serverless job %s (status=%s)", job_rp_id, data.get("status"))
    return job_rp_id


def poll_status(job_rp_id: str, timeout: int | None = None) -> dict:
    """Poll ``/status`` until the job reaches a terminal state.

    Returns the parsed ``output`` dict on success. Raises
    :class:`RunPodServerlessError` on FAILED/CANCELLED/TIMED_OUT or local timeout.
    """
    timeout = timeout if timeout is not None else settings.runpod_serverless_timeout
    url = f"{RUNPOD_SERVERLESS_BASE}/{_endpoint_id()}/status/{job_rp_id}"
    deadline = time.time() + timeout
    poll_interval = 5.0

    while time.time() < deadline:
        resp = requests.get(url, headers=_headers(), timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "")

        if status in _TERMINAL_OK:
            output = data.get("output") or {}
            if isinstance(output, dict) and output.get("error"):
                raise RunPodServerlessError(f"Serverless handler error: {output['error']}")
            logger.info("Serverless job %s completed", job_rp_id)
            return output if isinstance(output, dict) else {}

        if status in _TERMINAL_FAIL:
            err = data.get("error") or data.get("output") or status
            raise RunPodServerlessError(f"Serverless job {job_rp_id} {status}: {err}")

        # IN_QUEUE / IN_PROGRESS — keep waiting with mild backoff
        time.sleep(poll_interval)
        poll_interval = min(poll_interval * 1.3, 30)

    raise RunPodServerlessError(f"Serverless job {job_rp_id} timed out after {timeout}s")


def run_on_serverless(
    job_id: str,
    video_path,
    events_df: pd.DataFrame | None = None,
    audio_path=None,
) -> tuple[dict, str]:
    """Run TRIBE v2 inference via a RunPod Serverless endpoint.

    Uploads inputs to S3 (same staging layout as the pod path), submits the
    job, polls to completion, and downloads predictions from S3.

    Returns ``(predictions, vertex_key)`` where ``predictions`` maps
    :class:`~backend.pipeline.tribe_inference.Modality` -> ndarray, matching the
    contract of ``remote_gpu._run_on_runpod``.
    """
    # Import here to avoid a circular import and to reuse the existing S3
    # helpers verbatim (single source of S3 config).
    from backend.pipeline import remote_gpu
    from backend.pipeline.tribe_inference import Modality

    logger.info("Submitting job %s to RunPod Serverless endpoint", job_id)

    video_s3_key = f"staging/{job_id}/video{video_path.suffix}"
    remote_gpu._s3_upload(video_path.read_bytes(), video_s3_key)

    if audio_path is not None and audio_path.exists():
        remote_gpu._s3_upload(audio_path.read_bytes(), f"staging/{job_id}/audio.wav")

    events_s3_key = f"staging/{job_id}/events.parquet"
    if events_df is not None:
        buf = io.BytesIO()
        events_df.to_parquet(buf, index=False)
        remote_gpu._s3_upload(buf.getvalue(), events_s3_key)

    vertex_key = f"predictions/{job_id}/vertices.npz"
    payload = {
        "job_id": job_id,
        "video_s3_uri": video_s3_key,
        "events_s3_uri": events_s3_key if events_df is not None else None,
        "output_s3_uri": vertex_key,
    }

    rp_id = submit_job(payload)
    output = poll_status(rp_id)

    # Handler uploaded predictions to S3; prefer the key it reports back.
    result_key = output.get("output_s3_uri", vertex_key)
    predictions = remote_gpu._s3_download_predictions(result_key)
    logger.info("Downloaded predictions for job %s from %s", job_id, result_key)

    # Normalize keys to the Modality enum the rest of the pipeline expects.
    predictions = {k if isinstance(k, Modality) else Modality(k): v for k, v in predictions.items()}
    return predictions, result_key
