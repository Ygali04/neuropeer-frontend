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


def _persist_to_db(job_id, url, content_type, duration, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key):
    """Write Job + Result rows to PostgreSQL for permanent storage."""
    import asyncio
    from datetime import UTC, datetime
    from uuid import UUID

    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, Result

    async def _write():
        engine = create_async_engine(settings.database_url)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            # Update or create Job row
            from sqlalchemy import select
            stmt = select(Job).where(Job.id == UUID(job_id))
            existing = (await session.execute(stmt)).scalar_one_or_none()
            if existing:
                existing.status = "complete"
                existing.completed_at = datetime.now(UTC).replace(tzinfo=None)
            else:
                session.add(Job(
                    id=UUID(job_id), url=url, content_type=content_type,
                    status="complete",
                    created_at=datetime.now(UTC).replace(tzinfo=None),
                    completed_at=datetime.now(UTC).replace(tzinfo=None),
                ))
                await session.flush()

            # Create Result row
            session.add(Result(
                job_id=UUID(job_id), duration_seconds=duration,
                neural_score_total=neural_score.total,
                hook_score=neural_score.hook_score,
                sustained_attention=neural_score.sustained_attention,
                emotional_resonance=neural_score.emotional_resonance,
                memory_encoding=neural_score.memory_encoding,
                aesthetic_quality=neural_score.aesthetic_quality,
                cognitive_accessibility=neural_score.cognitive_accessibility,
                timeseries_s3_key=timeseries_key,
                vertex_data_s3_key=vertex_key,
                metrics_json=metrics_data,
                key_moments_json=[km.model_dump() for km in key_moments],
                modality_json=[mb.model_dump() for mb in modality_breakdown],
            ))
            await session.commit()
        await engine.dispose()

    try:
        asyncio.run(_write())
        logger.info("Persisted job %s to PostgreSQL", job_id)
    except Exception as exc:
        logger.warning("Failed to persist to DB (non-fatal): %s", exc)


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

        # ── Upload ALL artifacts to S3 ─────────────────────────────────────
        _publish_progress(job_id, "scoring", 0.90, "Uploading artifacts to S3…")

        # Timeseries
        ts_buffer = io.BytesIO()
        np.savez_compressed(ts_buffer, attention=attn_curve, arousal=arousal_curve, cognitive_load=cog_curve)
        timeseries_key = f"jobs/{job_id}/timeseries.npz"
        _save_to_s3(ts_buffer.getvalue(), timeseries_key)

        # Video file
        video_key = f"jobs/{job_id}/video{media.video_path.suffix}"
        _save_to_s3(media.video_path.read_bytes(), video_key)

        # Audio file
        audio_key = f"jobs/{job_id}/audio.wav"
        _save_to_s3(media.audio_path.read_bytes(), audio_key)

        # Transcript
        transcript_key = f"jobs/{job_id}/transcript.json"
        _save_to_s3(json.dumps({"words": media.transcript_words, "text": " ".join(w["word"] for w in media.transcript_words)}).encode(), transcript_key)

        # Metrics + Neural Score
        metrics_data = [m.model_dump() for m in metrics]
        _save_to_s3(json.dumps(metrics_data, indent=2).encode(), f"jobs/{job_id}/metrics.json")
        _save_to_s3(json.dumps(neural_score.model_dump(), indent=2).encode(), f"jobs/{job_id}/neural_score.json")
        _save_to_s3(json.dumps([km.model_dump() for km in key_moments], indent=2).encode(), f"jobs/{job_id}/key_moments.json")

        logger.info("All artifacts uploaded to S3 for job %s", job_id)

        # ── Build result + store in Redis + PostgreSQL ────────────────────
        result = {
            "job_id": job_id,
            "url": url,
            "content_type": content_type,
            "duration_seconds": media.duration_seconds,
            "neural_score": neural_score.model_dump(),
            "metrics": metrics_data,
            "attention_curve": attn_curve.tolist(),
            "emotional_arousal_curve": arousal_curve.tolist(),
            "cognitive_load_curve": cog_curve.tolist(),
            "key_moments": [km.model_dump() for km in key_moments],
            "modality_breakdown": [mb.model_dump() for mb in modality_breakdown],
            "vertex_data_s3_key": vertex_key,
            "timeseries_s3_key": timeseries_key,
        }

        # Redis cache (7 day TTL)
        _get_redis().set(f"neuropeer:result:{job_id}", json.dumps(result), ex=60 * 60 * 24 * 7)

        # Persist to PostgreSQL (permanent)
        _persist_to_db(job_id, url, content_type, media.duration_seconds, neural_score, metrics_data, key_moments, modality_breakdown, vertex_key, timeseries_key)

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
