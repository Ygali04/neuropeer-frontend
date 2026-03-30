"""
Celery worker tasks — async pipeline execution.

Each task corresponds to one stage of the NeuroPeer inference pipeline.
Progress is streamed back to the frontend via Redis pub/sub → WebSocket.
"""

from __future__ import annotations

import json
import logging
import tempfile
from pathlib import Path

import numpy as np
import redis as redis_sync

from backend.config import settings

logger = logging.getLogger(__name__)

# Celery app
from celery import Celery

celery_app = Celery("neuropeer", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.task_serializer = "json"
celery_app.conf.result_expires = 60 * 60 * 24  # 24h

_redis_client: redis_sync.Redis | None = None


def _get_redis() -> redis_sync.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis_sync.from_url(settings.redis_url)
    return _redis_client


def _publish_progress(job_id: str, status: str, progress: float, message: str) -> None:
    """Publish a progress event to the Redis channel for this job."""
    payload = json.dumps(
        {
            "job_id": job_id,
            "status": status,
            "progress": progress,
            "message": message,
        }
    )
    _get_redis().publish(f"neuropeer:job:{job_id}", payload)


def _update_job_status(job_id: str, status: str, error: str | None = None) -> None:
    """Update the job status in Redis (fast cache — DB update happens via API)."""
    data = {"status": status}
    if error:
        data["error"] = error
    _get_redis().set(f"neuropeer:job_status:{job_id}", json.dumps(data), ex=60 * 60 * 24)


def _save_to_s3(data: bytes, key: str) -> str:
    """Upload bytes to S3 and return the S3 key."""
    import boto3

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        region_name=settings.aws_region,
    )
    s3.put_object(Bucket=settings.s3_bucket, Key=key, Body=data)
    return key


@celery_app.task(name="neuropeer.analyze", bind=True, max_retries=1)
def run_analysis(self, job_id: str, url: str, content_type: str) -> dict:
    """
    Full NeuroPeer analysis pipeline for a single video URL.
    Streams progress events at each stage.

    Pipeline stages:
      1. Download + extract audio + transcribe (CPU, ~30–120s depending on video length)
      2. TRIBE v2 inference × 4 modalities (GPU, main compute step)
      3. Atlas ROI aggregation + 18 metric computations (CPU)
      4. Neural Score composite + key moment detection (CPU)
    """
    import io

    from backend.models.schemas import ContentType
    from backend.pipeline.ingestion import DownloadError, ingest
    from backend.pipeline.metric_engine import compute_all_metrics
    from backend.pipeline.neural_score import compute_neural_score, detect_key_moments
    from backend.pipeline.remote_gpu import run_inference_backend

    work_dir = Path(tempfile.mkdtemp(prefix=f"neuropeer_{job_id}_", dir=settings.temp_dir))

    try:
        # ── Stage 1: Download, audio extract, transcribe ──────────────────────
        _publish_progress(job_id, "downloading", 0.05, "Detecting platform and downloading video…")
        _update_job_status(job_id, "downloading")

        try:
            media, events_df = ingest(url, work_dir)
        except DownloadError as exc:
            # Surface the full yt-dlp stderr in the job error — never swallow it
            logger.error("Download failed for job %s: %s", job_id, str(exc))
            _update_job_status(job_id, "error", error=str(exc))
            _publish_progress(job_id, "error", 0.0, _friendly_download_error(str(exc), url))
            raise

        _publish_progress(
            job_id, "transcribing", 0.18, f"Downloaded {media.duration_seconds:.0f}s video. Transcribing audio…"
        )

        # ── Stage 2: TRIBE v2 inference (local GPU or DataCrunch A100 spot) ──
        _publish_progress(job_id, "inferring", 0.25, _inference_start_msg())
        _update_job_status(job_id, "inferring")

        predictions, vertex_key = run_inference_backend(
            job_id, events_df, work_dir, video_path=media.video_path
        )

        _publish_progress(job_id, "inferring", 0.65, "All 4 modality passes complete.")

        # ── Stage 3: ROI aggregation + 18 metrics ─────────────────────────────
        _publish_progress(job_id, "aggregating", 0.70, "Mapping cortical regions (Schaefer-1000)…")
        _update_job_status(job_id, "aggregating")

        content_type_enum = ContentType(content_type)
        metrics, attn_curve, arousal_curve, cog_curve, modality_breakdown = compute_all_metrics(predictions)

        # ── Stage 4: Neural Score + key moments ───────────────────────────────
        _publish_progress(job_id, "scoring", 0.85, "Computing Neural Score composite…")
        _update_job_status(job_id, "scoring")

        from backend.pipeline.tribe_inference import Modality

        neural_score = compute_neural_score(metrics, content_type_enum)
        key_moments = detect_key_moments(attn_curve, arousal_curve, cog_curve, predictions[Modality.FULL])

        # Save timeseries to S3
        ts_buffer = io.BytesIO()
        np.savez_compressed(
            ts_buffer,
            attention=attn_curve,
            arousal=arousal_curve,
            cognitive_load=cog_curve,
        )
        timeseries_key = f"predictions/{job_id}/timeseries.npz"
        _save_to_s3(ts_buffer.getvalue(), timeseries_key)

        # Build final result dict using Pydantic model_dump()
        result = {
            "job_id": job_id,
            "url": url,
            "content_type": content_type,
            "duration_seconds": media.duration_seconds,
            "neural_score": neural_score.model_dump(),
            "metrics": [m.model_dump() for m in metrics],
            "attention_curve": attn_curve.tolist(),
            "emotional_arousal_curve": arousal_curve.tolist(),
            "cognitive_load_curve": cog_curve.tolist(),
            "key_moments": [km.model_dump() for km in key_moments],
            "modality_breakdown": [mb.model_dump() for mb in modality_breakdown],
            "vertex_data_s3_key": vertex_key,
            "timeseries_s3_key": timeseries_key,
        }

        _get_redis().set(
            f"neuropeer:result:{job_id}",
            json.dumps(result),
            ex=60 * 60 * 24 * 7,
        )
        _update_job_status(job_id, "complete")
        _publish_progress(job_id, "complete", 1.0, "Analysis complete!")
        return result

    except DownloadError:
        raise  # already handled above with friendly message

    except Exception as exc:
        error_msg = str(exc)
        logger.exception("Pipeline error for job %s", job_id)
        _update_job_status(job_id, "error", error=error_msg)
        _publish_progress(job_id, "error", 0.0, f"Pipeline error: {error_msg}")
        raise

    finally:
        import shutil

        shutil.rmtree(work_dir, ignore_errors=True)


def _friendly_download_error(raw_error: str, url: str) -> str:
    """Convert a raw DownloadError message into a user-facing string."""
    err_lower = raw_error.lower()
    if "authentication" in err_lower or "login" in err_lower or "cookies" in err_lower:
        return (
            "Download failed: authentication required. "
            "This platform needs a cookies.txt file from a logged-in browser session. "
            "See docs → Setup → Cookie Authentication."
        )
    if "rate-limit" in err_lower or "429" in err_lower or "too many requests" in err_lower:
        return (
            "Download failed: platform is rate-limiting the server IP. "
            "Try again in a few minutes, or add a cookies.txt file to reduce bot detection."
        )
    if "not available" in err_lower or "private" in err_lower:
        return "Download failed: content is private or unavailable in this region."
    return f"Download failed. Check that the URL is publicly accessible. Details: {raw_error[:300]}"


def _inference_start_msg() -> str:
    backend = settings.inference_backend
    if backend == "datacrunch":
        return "Provisioning DataCrunch A100 GPU instance for TRIBE v2 inference…"
    return "Running TRIBE v2 inference (full multimodal + 3 ablations)…"
