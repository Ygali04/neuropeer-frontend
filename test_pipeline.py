"""
End-to-end pipeline test for NeuroPeer.

Outputs everything — video, audio, transcript, events, predictions,
metrics, neural score, key moments, timeseries CSVs, and full log
files — into ../neuropeer-data with one directory per video.

Usage: python test_pipeline.py
"""

import asyncio
import csv
import io
import json
import logging
import os
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

# ── Config overrides ─────────────────────────────────────────────────────────
os.environ["DATABASE_URL"] = "postgresql+asyncpg://neuropeer:neuropeer@127.0.0.1:5433/neuropeer"
os.environ["S3_ENDPOINT_URL"] = "http://localhost:9000"

# ── Resolve output root from TEMP_DIR in .env ────────────────────────────────
# .env says TEMP_DIR=../neuropeer-data (relative to repo root)
REPO_ROOT = Path(__file__).resolve().parent
DATA_ROOT = (REPO_ROOT / ".." / "neuropeer-data").resolve()

from backend.config import settings
from backend.models.schemas import ContentType
from backend.pipeline.ingestion import (
    build_events_dataframe,
    download_video,
    extract_audio,
    get_video_duration,
    transcribe_audio,
)
from backend.pipeline.metric_engine import compute_all_metrics
from backend.pipeline.neural_score import compute_neural_score, detect_key_moments
from backend.pipeline.tribe_inference import Modality

# ── Test URLs ────────────────────────────────────────────────────────────────

TEST_URLS = [
    {
        "url": "https://www.instagram.com/p/DWcFdH6CXZA/",
        "content_type": "instagram_reel",
        "label": "Instagram — NeuroPeer demo reel",
        "dir_name": "instagram_DWcFdH6CXZA",
    },
    {
        "url": "https://www.youtube.com/shorts/Fez9foCZlng",
        "content_type": "custom",
        "label": "YouTube Shorts — Programming advice",
        "dir_name": "youtube_Fez9foCZlng",
    },
]


# ── Logging setup ────────────────────────────────────────────────────────────


def setup_logging(log_path: Path) -> logging.Logger:
    """Create a logger that writes to both a file and stdout."""
    logger = logging.getLogger(f"neuropeer.{log_path.stem}")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    fmt = logging.Formatter(
        "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    fh = logging.FileHandler(log_path, mode="w")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    sh = logging.StreamHandler(sys.stdout)
    sh.setLevel(logging.INFO)
    sh.setFormatter(fmt)
    logger.addHandler(sh)

    # Also capture ingestion / metric_engine / atlas_mapping logs
    for mod_name in [
        "backend.pipeline.ingestion",
        "backend.pipeline.metric_engine",
        "backend.pipeline.atlas_mapping",
        "backend.pipeline.neural_score",
    ]:
        mod_logger = logging.getLogger(mod_name)
        mod_logger.setLevel(logging.DEBUG)
        mod_logger.addHandler(fh)

    return logger


# ── Mock inference ───────────────────────────────────────────────────────────


def mock_tribe_predictions(n_timesteps: int) -> dict[Modality, np.ndarray]:
    rng = np.random.default_rng(42)
    n_vertices = 20484
    t = np.linspace(0, 1, n_timesteps)

    hook_envelope = np.exp(-2 * t) + 0.3
    sustained_envelope = 1 - np.exp(-3 * t)
    emotional_envelope = 0.5 + 0.5 * np.sin(2 * np.pi * t * 3)

    predictions = {}
    for modality in Modality:
        data = rng.standard_normal((n_timesteps, n_vertices)).astype(np.float32)
        visual_scale = 1.0 if modality != Modality.AUDIO_ONLY else 0.1
        data[:, :3000] *= sustained_envelope[:, None] * visual_scale * 2
        audio_scale = 1.0 if modality != Modality.VIDEO_ONLY else 0.1
        data[:, 3000:5000] *= emotional_envelope[:, None] * audio_scale * 1.5
        data[:, 5000:8000] *= sustained_envelope[:, None] * 1.2
        data[:, 8000:10000] *= emotional_envelope[:, None] * 1.8
        data[:, 10000:12000] *= hook_envelope[:, None] * 1.3
        data[:, 12000:13000] *= hook_envelope[:, None] * 2.5
        data[:, 13000:15000] *= (1 - sustained_envelope)[:, None] * 1.4
        text_scale = 1.0 if modality != Modality.VIDEO_ONLY else 0.2
        data[:, 15000:17000] *= sustained_envelope[:, None] * text_scale * 1.3
        data[:, 17000:] *= 0.5
        if modality == Modality.FULL:
            data *= 1.2
        predictions[modality] = data
    return predictions


# ── File savers ──────────────────────────────────────────────────────────────


def save_timeseries_csv(path: Path, curves: dict[str, np.ndarray]):
    """Save per-second metric curves as a human-readable CSV."""
    n = max(len(v) for v in curves.values())
    with open(path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["second"] + list(curves.keys()))
        for i in range(n):
            row = [i] + [round(float(curves[k][i]), 4) if i < len(curves[k]) else "" for k in curves]
            writer.writerow(row)


def save_summary_report(
    path: Path,
    *,
    job_id,
    url,
    label,
    content_type,
    duration,
    fps,
    n_words,
    transcript,
    neural_score,
    metrics,
    key_moments,
    modality_breakdown,
    file_manifest,
):
    """Write a comprehensive human-readable summary report."""
    lines = []
    lines.append("=" * 72)
    lines.append("  NeuroPeer Analysis Report")
    lines.append("=" * 72)
    lines.append("")
    lines.append(f"  Job ID:       {job_id}")
    lines.append(f"  URL:          {url}")
    lines.append(f"  Label:        {label}")
    lines.append(f"  Content Type: {content_type}")
    lines.append(f"  Duration:     {duration:.1f}s")
    lines.append(f"  FPS:          {fps:.1f}")
    lines.append(f"  Words:        {n_words}")
    lines.append(f"  Generated:    {datetime.now(UTC).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    lines.append("")

    lines.append("-" * 72)
    lines.append(f"  NEURAL SCORE: {neural_score.total:.1f} / 100")
    lines.append("-" * 72)
    lines.append(f"  Hook Score:              {neural_score.hook_score:6.1f}")
    lines.append(f"  Sustained Attention:     {neural_score.sustained_attention:6.1f}")
    lines.append(f"  Emotional Resonance:     {neural_score.emotional_resonance:6.1f}")
    lines.append(f"  Memory Encoding:         {neural_score.memory_encoding:6.1f}")
    lines.append(f"  Aesthetic Quality:       {neural_score.aesthetic_quality:6.1f}")
    lines.append(f"  Cognitive Accessibility: {neural_score.cognitive_accessibility:6.1f}")
    lines.append("")

    lines.append("-" * 72)
    lines.append(f"  ALL METRICS ({len(metrics)} total)")
    lines.append("-" * 72)
    for m in metrics:
        lines.append(f"  {m.name:32s}  {m.score:6.1f}/100  raw={m.raw_value:8.4f}")
        lines.append(f"    Brain region: {m.brain_region}")
        lines.append(f"    GTM proxy:    {m.gtm_proxy}")
        lines.append(f"    Description:  {m.description}")
        lines.append("")

    lines.append("-" * 72)
    lines.append(f"  KEY MOMENTS ({len(key_moments)} detected)")
    lines.append("-" * 72)
    for km in key_moments:
        lines.append(f"  [{km['timestamp']:6.1f}s]  {km['type']:22s}  {km['label']}  (score={km['score']:.1f})")
    lines.append("")

    lines.append("-" * 72)
    lines.append("  TRANSCRIPT")
    lines.append("-" * 72)
    # Word-wrap transcript at 70 chars
    words = transcript.split()
    line = "  "
    for w in words:
        if len(line) + len(w) + 1 > 70:
            lines.append(line)
            line = "  "
        line += w + " "
    if line.strip():
        lines.append(line)
    lines.append("")

    lines.append("-" * 72)
    lines.append("  OUTPUT FILES")
    lines.append("-" * 72)
    for name, size in file_manifest:
        lines.append(f"  {name:40s}  {size}")
    lines.append("")
    lines.append("=" * 72)

    path.write_text("\n".join(lines))


# ── Database helpers ─────────────────────────────────────────────────────────


async def create_tables(db_url: str):
    from sqlalchemy.ext.asyncio import create_async_engine

    from backend.models.db import Base

    engine = create_async_engine(db_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def store_result(db_url: str, job_data: dict, result_data: dict):
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from backend.models.db import Job, Result

    engine = create_async_engine(db_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        job = Job(
            id=job_data["id"],
            url=job_data["url"],
            label=job_data["label"],
            content_type=job_data["content_type"],
            status="complete",
            created_at=job_data["created_at"],
            completed_at=datetime.now(UTC).replace(tzinfo=None),
        )
        session.add(job)
        await session.flush()
        result = Result(
            job_id=job_data["id"],
            duration_seconds=result_data["duration_seconds"],
            neural_score_total=result_data["neural_score_total"],
            hook_score=result_data["hook_score"],
            sustained_attention=result_data["sustained_attention"],
            emotional_resonance=result_data["emotional_resonance"],
            memory_encoding=result_data["memory_encoding"],
            aesthetic_quality=result_data["aesthetic_quality"],
            cognitive_accessibility=result_data["cognitive_accessibility"],
            timeseries_s3_key=result_data.get("timeseries_s3_key"),
            vertex_data_s3_key=result_data.get("vertex_data_s3_key"),
            metrics_json=result_data.get("metrics_json"),
            key_moments_json=result_data.get("key_moments_json"),
            modality_json=result_data.get("modality_json"),
        )
        session.add(result)
        await session.commit()
    await engine.dispose()


async def query_results(db_url: str) -> str:
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine

    out = []
    engine = create_async_engine(db_url)
    async with engine.connect() as conn:
        jobs = await conn.execute(
            text("SELECT id, url, label, content_type, status, created_at, completed_at FROM jobs ORDER BY created_at")
        )
        rows = jobs.fetchall()
        out.append(f"  {len(rows)} jobs in database:\n")
        for r in rows:
            out.append(f"    Job {str(r[0])[:8]}...")
            out.append(f"      URL:       {r[1]}")
            out.append(f"      Label:     {r[2]}")
            out.append(f"      Type:      {r[3]}")
            out.append(f"      Status:    {r[4]}")
            out.append(f"      Created:   {r[5]}")
            out.append(f"      Completed: {r[6]}")
            out.append("")

        results = await conn.execute(
            text(
                "SELECT r.job_id, j.label, r.duration_seconds, r.neural_score_total, "
                "r.hook_score, r.sustained_attention, r.emotional_resonance, "
                "r.memory_encoding, r.aesthetic_quality, r.cognitive_accessibility "
                "FROM results r JOIN jobs j ON r.job_id = j.id ORDER BY j.created_at"
            )
        )
        rrows = results.fetchall()
        out.append(f"  {len(rrows)} results in database:\n")
        for r in rrows:
            out.append(f"    {r[1]}")
            out.append(f"      Duration:            {r[2]:.1f}s")
            out.append(f"      Neural Score:        {r[3]:.1f}/100")
            out.append(f"      Hook Score:          {r[4]:.1f}")
            out.append(f"      Sustained Attention: {r[5]:.1f}")
            out.append(f"      Emotional Resonance: {r[6]:.1f}")
            out.append(f"      Memory Encoding:     {r[7]:.1f}")
            out.append(f"      Aesthetic Quality:   {r[8]:.1f}")
            out.append(f"      Cognitive Access.:   {r[9]:.1f}")
            out.append("")
    await engine.dispose()
    return "\n".join(out)


# ── Main ─────────────────────────────────────────────────────────────────────


async def main():
    db_url = os.environ["DATABASE_URL"]

    # Create output root
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"\n  Output root: {DATA_ROOT}")
    print(f"  Database:    {db_url.split('@')[1]}")
    print(f"  Videos:      {len(TEST_URLS)}\n")

    # Fresh tables
    await create_tables(db_url)
    print("  Database tables created (fresh).\n")

    for test in TEST_URLS:
        url = test["url"]
        content_type_str = test["content_type"]
        label = test["label"]
        dir_name = test["dir_name"]
        job_id = uuid.uuid4()

        # Per-video output directory
        out_dir = DATA_ROOT / dir_name
        out_dir.mkdir(parents=True, exist_ok=True)

        # Set up per-video log file
        log = setup_logging(out_dir / "pipeline.log")
        log.info("=" * 60)
        log.info("NeuroPeer Pipeline — %s", label)
        log.info("URL: %s", url)
        log.info("Job ID: %s", job_id)
        log.info("Output: %s", out_dir)
        log.info("=" * 60)

        # ── Stage 1: Download ────────────────────────────────────────
        log.info("[1/6] Downloading video...")
        try:
            video_path = download_video(url, out_dir)
            size_mb = video_path.stat().st_size / (1024 * 1024)
            log.info("Downloaded: %s (%.1f MB)", video_path.name, size_mb)
        except Exception as exc:
            log.error("Download failed: %s", exc, exc_info=True)
            print(f"  SKIP {label}: download failed — see {out_dir / 'pipeline.log'}")
            continue

        # ── Stage 2: Audio extraction ────────────────────────────────
        log.info("[2/6] Extracting audio...")
        audio_path = extract_audio(video_path, out_dir)
        log.info("Audio: %s (%.1f MB)", audio_path.name, audio_path.stat().st_size / (1024 * 1024))

        # ── Stage 3: Video metadata + Transcription ──────────────────
        log.info("[3/6] Getting video metadata...")
        duration, fps = get_video_duration(video_path)
        log.info("Duration: %.1fs | FPS: %.1f", duration, fps)

        log.info("[3/6] Transcribing audio (faster-whisper, model=%s)...", settings.whisper_model_size)
        transcript_words = transcribe_audio(audio_path)
        full_text = " ".join(w["word"] for w in transcript_words)
        log.info("Transcription complete: %d words", len(transcript_words))
        log.info("Transcript: %s", full_text[:200])

        # Save transcript
        transcript_out = {
            "job_id": str(job_id),
            "url": url,
            "label": label,
            "content_type": content_type_str,
            "duration_seconds": round(duration, 2),
            "fps": round(fps, 2),
            "whisper_model": settings.whisper_model_size,
            "word_count": len(transcript_words),
            "full_text": full_text,
            "words": transcript_words,
        }
        with open(out_dir / "transcript.json", "w") as f:
            json.dump(transcript_out, f, indent=2, ensure_ascii=False)
        log.info("Saved transcript.json")

        # ── Stage 4: Events DataFrame ────────────────────────────────
        log.info("[4/6] Building events DataFrame (1 Hz)...")
        events_df = build_events_dataframe(video_path, audio_path, transcript_words, duration, fps)
        events_df.to_parquet(out_dir / "events.parquet", index=False)
        events_df.to_csv(out_dir / "events.csv", index=False)
        log.info("Events: %d rows x %d cols → events.parquet + events.csv", len(events_df), len(events_df.columns))

        # ── Stage 5: Mock TRIBE v2 inference ─────────────────────────
        log.info("[5/6] Running mock TRIBE v2 inference (4 modality passes)...")
        n_timesteps = int(duration)
        predictions = mock_tribe_predictions(n_timesteps)
        for mod, arr in predictions.items():
            log.info("  %s: shape=%s, mean=%.4f, std=%.4f", mod.value, arr.shape, arr.mean(), arr.std())

        # Save predictions (compressed numpy)
        vertex_key = f"predictions/{job_id}/vertices.npz"
        buf = io.BytesIO()
        np.savez_compressed(buf, **{m.value: arr for m, arr in predictions.items()})
        (out_dir / "vertices.npz").write_bytes(buf.getvalue())
        log.info("Saved vertices.npz (%.1f MB)", (out_dir / "vertices.npz").stat().st_size / (1024 * 1024))

        # ── Stage 6: Metrics + Neural Score ──────────────────────────
        log.info("[6/6] Computing 18 GTM metrics + Neural Score...")
        content_type_enum = ContentType(content_type_str)
        metrics, attn_curve, arousal_curve, cog_curve, modality_breakdown = compute_all_metrics(predictions)

        neural_score = compute_neural_score(metrics, content_type_enum)
        key_moments = detect_key_moments(attn_curve, arousal_curve, cog_curve, predictions[Modality.FULL])

        log.info("Neural Score: %.1f/100", neural_score.total)
        for m in metrics:
            log.info("  %-32s %5.1f/100  (raw=%.4f)", m.name, m.score, m.raw_value)

        # ── Save all result files ────────────────────────────────────

        # Timeseries (numpy + CSV)
        np.savez_compressed(
            out_dir / "timeseries.npz",
            attention=attn_curve,
            arousal=arousal_curve,
            cognitive_load=cog_curve,
        )
        save_timeseries_csv(
            out_dir / "timeseries.csv",
            {
                "attention": attn_curve,
                "emotional_arousal": arousal_curve,
                "cognitive_load": cog_curve,
            },
        )
        log.info("Saved timeseries.npz + timeseries.csv")

        # Metrics JSON
        metrics_json = [
            {
                "name": m.name,
                "score": round(m.score, 2),
                "raw_value": round(m.raw_value, 4),
                "description": m.description,
                "brain_region": m.brain_region,
                "gtm_proxy": m.gtm_proxy,
            }
            for m in metrics
        ]
        with open(out_dir / "metrics.json", "w") as f:
            json.dump(metrics_json, f, indent=2)
        log.info("Saved metrics.json")

        # Neural score JSON
        score_json = {
            "total": round(neural_score.total, 2),
            "hook_score": round(neural_score.hook_score, 2),
            "sustained_attention": round(neural_score.sustained_attention, 2),
            "emotional_resonance": round(neural_score.emotional_resonance, 2),
            "memory_encoding": round(neural_score.memory_encoding, 2),
            "aesthetic_quality": round(neural_score.aesthetic_quality, 2),
            "cognitive_accessibility": round(neural_score.cognitive_accessibility, 2),
            "content_type": content_type_str,
        }
        with open(out_dir / "neural_score.json", "w") as f:
            json.dump(score_json, f, indent=2)
        log.info("Saved neural_score.json")

        # Key moments JSON
        with open(out_dir / "key_moments.json", "w") as f:
            json.dump(key_moments, f, indent=2)
        log.info("Saved key_moments.json")

        # Modality breakdown JSON
        with open(out_dir / "modality_breakdown.json", "w") as f:
            json.dump(modality_breakdown, f, indent=2)
        log.info("Saved modality_breakdown.json")

        # Attention curve CSV (separate, easy to plot)
        with open(out_dir / "attention_curve.csv", "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["second", "attention_score"])
            for i, v in enumerate(attn_curve):
                writer.writerow([i, round(float(v), 4)])
        log.info("Saved attention_curve.csv")

        # ── Build file manifest ──────────────────────────────────────
        file_manifest = []
        for fp in sorted(out_dir.iterdir()):
            sz = fp.stat().st_size
            if sz >= 1024 * 1024:
                file_manifest.append((fp.name, f"{sz / (1024 * 1024):.1f} MB"))
            else:
                file_manifest.append((fp.name, f"{sz / 1024:.1f} KB"))

        # Summary report (human-readable text)
        save_summary_report(
            out_dir / "REPORT.txt",
            job_id=job_id,
            url=url,
            label=label,
            content_type=content_type_str,
            duration=duration,
            fps=fps,
            n_words=len(transcript_words),
            transcript=full_text,
            neural_score=neural_score,
            metrics=metrics,
            key_moments=key_moments,
            modality_breakdown=modality_breakdown,
            file_manifest=file_manifest + [("REPORT.txt", "this file")],
        )
        log.info("Saved REPORT.txt")

        # ── Store in PostgreSQL ──────────────────────────────────────
        log.info("Storing results in PostgreSQL...")
        job_data = {
            "id": job_id,
            "url": url,
            "label": label,
            "content_type": content_type_str,
            "created_at": datetime.now(UTC).replace(tzinfo=None),
        }
        result_data = {
            "duration_seconds": duration,
            "neural_score_total": neural_score.total,
            "hook_score": neural_score.hook_score,
            "sustained_attention": neural_score.sustained_attention,
            "emotional_resonance": neural_score.emotional_resonance,
            "memory_encoding": neural_score.memory_encoding,
            "aesthetic_quality": neural_score.aesthetic_quality,
            "cognitive_accessibility": neural_score.cognitive_accessibility,
            "timeseries_s3_key": f"predictions/{job_id}/timeseries.npz",
            "vertex_data_s3_key": vertex_key,
            "metrics_json": metrics_json,
            "key_moments_json": key_moments,
            "modality_json": modality_breakdown,
        }
        await store_result(db_url, job_data, result_data)
        log.info("Stored in PostgreSQL (job_id=%s)", job_id)

        # ── Print summary to stdout ──────────────────────────────────
        print(f"  {label}")
        print(f"    Neural Score: {neural_score.total:.1f}/100")
        print(f"    Duration: {duration:.1f}s | Words: {len(transcript_words)}")
        print(f"    Files: {out_dir}/")
        for name, size in file_manifest:
            print(f"      {name:40s}  {size}")
        print()

    # ── Database summary ─────────────────────────────────────────────────────
    db_report = await query_results(db_url)

    # Save database dump to data root
    with open(DATA_ROOT / "database_dump.txt", "w") as f:
        f.write("NeuroPeer Database Contents\n")
        f.write(f"Generated: {datetime.now(UTC).replace(tzinfo=None).strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
        f.write("=" * 60 + "\n\n")
        f.write(db_report)
    print(f"  Database dump: {DATA_ROOT / 'database_dump.txt'}")

    # Print database contents
    print("\n  DATABASE CONTENTS")
    print(f"  {'=' * 50}")
    print(db_report)

    # Final listing
    print(f"\n  ALL OUTPUT FILES IN {DATA_ROOT}:")
    print(f"  {'=' * 50}")
    for sub in sorted(DATA_ROOT.iterdir()):
        if sub.is_dir():
            total_size = sum(f.stat().st_size for f in sub.iterdir() if f.is_file())
            print(f"\n  {sub.name}/  ({total_size / (1024 * 1024):.1f} MB total)")
            for fp in sorted(sub.iterdir()):
                sz = fp.stat().st_size
                if sz >= 1024 * 1024:
                    print(f"    {fp.name:42s}  {sz / (1024 * 1024):6.1f} MB")
                else:
                    print(f"    {fp.name:42s}  {sz / 1024:6.1f} KB")
        elif sub.is_file():
            print(f"\n  {sub.name}")

    print("\n  Done.\n")


if __name__ == "__main__":
    asyncio.run(main())
