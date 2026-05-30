"""RunPod Serverless handler for TRIBE v2 cortical-prediction inference.

This is the serverless analogue of the legacy pod-per-job path
(``remote_gpu._build_startup_script``). It runs inside a long-lived RunPod
Serverless worker (autoscaled, scale-to-zero) and is invoked once per job via
RunPod's queue. The actual model inference is the SAME code the legacy pod runs
— both import ``backend.pipeline.inference_core`` so there is ONE source of
truth (no duplicated inference logic).

Event input (``event["input"]``):
    {
        "video_s3_uri": "staging/<job_id>/video.mp4",   # S3 key (bucket from env)
        "events_s3_uri": "staging/<job_id>/events.parquet",  # optional
        "output_s3_uri": "predictions/<job_id>/vertices.npz",  # optional override
        "job_id": "<job_id>"
    }

Returns (success):
    {"status": "done", "output_s3_uri": "...", "n_timesteps": N,
     "n_vertices": 20484, "modalities": [...], "gpu": {...}}

Returns (failure):
    {"error": "<message>"}

The download/upload glue lives here (small, backend-specific). The hardware
guards and inference are imported from ``inference_core``.
"""

from __future__ import annotations

import json
import logging
import os

from backend.pipeline.inference_core import (
    HardwareError,
    check_gpu,
    done_sentinel_payload,
    predictions_to_npz_bytes,
    run_tribe_inference,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rp_handler")

LOCAL_VIDEO_PATH = "/tmp/video.mp4"
LOCAL_EVENTS_PATH = "/tmp/events.parquet"


def _s3_client():
    """Build an S3/B2 client from env. Endpoint optional (defaults to AWS)."""
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("S3_ENDPOINT_URL") or None,
        aws_access_key_id=os.environ.get("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("AWS_SECRET_ACCESS_KEY"),
        region_name=os.environ.get("AWS_DEFAULT_REGION", "us-east-1"),
    )


def _download_inputs(bucket: str, video_key: str, events_key: str | None) -> str | None:
    """Download the video (required) and events (optional) from S3 to /tmp.

    Returns the local events path if events were downloaded, else None.
    """
    s3 = _s3_client()
    log.info("Downloading video s3://%s/%s", bucket, video_key)
    s3.download_file(bucket, video_key, LOCAL_VIDEO_PATH)

    if events_key:
        try:
            s3.download_file(bucket, events_key, LOCAL_EVENTS_PATH)
            log.info("Downloaded events s3://%s/%s", bucket, events_key)
            return LOCAL_EVENTS_PATH
        except Exception as exc:  # noqa: BLE001 — events are optional
            log.info("No events at s3://%s/%s (%s); will derive from video", bucket, events_key, exc)
    return None


def handler(event: dict) -> dict:
    """RunPod Serverless entrypoint. One invocation = one inference job."""
    job_input = (event or {}).get("input") or {}
    job_id = job_input.get("job_id", "unknown")

    video_key = job_input.get("video_s3_uri")
    if not video_key:
        return {"error": "missing required input 'video_s3_uri'"}

    events_key = job_input.get("events_s3_uri")
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return {"error": "S3_BUCKET not configured in the serverless endpoint env"}

    output_key = job_input.get("output_s3_uri") or f"predictions/{job_id}/vertices.npz"

    log.info("Serverless job %s starting (video=%s, events=%s)", job_id, video_key, events_key)

    # Fail fast on unusable hardware (VRAM + CUDA compute-capability guards).
    try:
        gpu_info = check_gpu()
    except HardwareError as exc:
        log.error("Hardware guard failed for job %s: %s", job_id, exc)
        return {"error": f"hardware_unsuitable: {exc}"}

    try:
        events_path = _download_inputs(bucket, video_key, events_key)
        predictions = run_tribe_inference(
            video_path=LOCAL_VIDEO_PATH,
            events_path=events_path,
        )

        log.info("Uploading predictions to s3://%s/%s", bucket, output_key)
        _s3_client().put_object(
            Bucket=bucket,
            Key=output_key,
            Body=predictions_to_npz_bytes(predictions),
        )

        summary = json.loads(done_sentinel_payload(predictions).decode())
        summary["output_s3_uri"] = output_key
        summary["gpu"] = gpu_info
        log.info("Serverless job %s done: %s", job_id, summary)
        return summary

    except Exception as exc:  # noqa: BLE001 — report any failure back to the client
        log.error("Serverless job %s failed: %s", job_id, exc, exc_info=True)
        return {"error": str(exc)}


if __name__ == "__main__":
    # Started by the serverless container. ``runpod`` is only present in the
    # serverless image, so import it lazily here (not at module import time)
    # to keep this module importable on the CPU-only API/worker host + tests.
    import runpod  # type: ignore

    runpod.serverless.start({"handler": handler})
