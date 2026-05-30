#!/usr/bin/env python3
"""
NeuroPeer — Real TRIBE v2 Inference on DataCrunch A100 Spot Instance.

End-to-end flow:
  1. Create DataCrunch A100 spot instance with TRIBE v2 startup script
  2. Wait for instance to boot and become SSH-accessible
  3. Monitor inference progress via SSH
  4. Download predictions via SCP
  5. DELETE the instance immediately
  6. Compute 20 GTM metrics + Neural Score locally
  7. Store results in PostgreSQL
  8. Display results
"""
import io
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path

import numpy as np

# Load .env file
from dotenv import load_dotenv
load_dotenv("backend/.env")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://neuropeer:neuropeer@127.0.0.1:5433/neuropeer")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:9000")

VIDEO_URL = os.environ.get("VIDEO_URL", "https://www.instagram.com/p/DWcFdH6CXZA/")
CONTENT_TYPE = os.environ.get("CONTENT_TYPE", "instagram_reel")
LABEL = os.environ.get("LABEL", "Instagram — NeuroPeer demo reel (REAL TRIBE v2)")
OUT_DIR = Path(os.environ.get("OUT_DIR", os.path.expanduser("~/neuropeer-data/instagram_real_tribev2")))

DATACRUNCH_CLIENT_ID = os.environ.get("DATACRUNCH_CLIENT_ID", "")
DATACRUNCH_CLIENT_SECRET = os.environ.get("DATACRUNCH_CLIENT_SECRET", "")
SSH_KEY_ID = os.environ.get("SSH_KEY_ID", "")
SSH_PRIVATE_KEY = os.path.expanduser(os.environ.get("SSH_PRIVATE_KEY", "~/.ssh/id_ed25519"))
INSTANCE_TYPE = os.environ.get("INSTANCE_TYPE", "1A100.22V")  # A100 80GB, $0.45/h spot


SSH_OPTS = [
    "-o", "StrictHostKeyChecking=no",
    "-o", "UserKnownHostsFile=/dev/null",
    "-o", "ConnectTimeout=10",
    "-o", "ServerAliveInterval=15",
    "-i", SSH_PRIVATE_KEY,
]


def ssh_cmd(ip, command, timeout=30):
    """Run a command on the remote instance via SSH."""
    result = subprocess.run(
        ["ssh"] + SSH_OPTS + [f"root@{ip}", command],
        capture_output=True, text=True, timeout=timeout
    )
    return result


def ssh_bg(ip, command):
    """Run a command in the background on the remote instance (fire-and-forget)."""
    # Use ssh -f to background after auth, with nohup + full detach
    subprocess.run(
        ["ssh"] + SSH_OPTS + ["-f", f"root@{ip}",
         f"nohup {command} </dev/null >/dev/null 2>&1 &"],
        capture_output=True, text=True, timeout=15
    )


def scp_download(ip, remote_path, local_path):
    """Download a file from the remote instance."""
    subprocess.run(
        ["scp"] + SSH_OPTS + [f"root@{ip}:{remote_path}", str(local_path)],
        check=True, timeout=120
    )


def main():
    from datacrunch import DataCrunchClient
    from datacrunch.constants import Actions

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    job_id = str(uuid.uuid4())
    print(f"\n{'='*70}")
    print(f"  NeuroPeer — Real TRIBE v2 Inference")
    print(f"{'='*70}")
    print(f"  Job ID: {job_id}")
    print(f"  Video:  {VIDEO_URL}")
    print(f"  GPU:    DataCrunch (preferred: {INSTANCE_TYPE})")
    print(f"{'='*70}\n")

    # ── Step 1: Download video locally + transcribe with ElevenLabs ──────
    print("[1/7] Downloading video + transcribing with ElevenLabs Scribe v2...", flush=True)
    from backend.pipeline.ingestion import download_video, extract_audio, get_video_duration, transcribe_audio

    # Reuse previously downloaded video if available
    cached_video = Path("/Users/yahvingali/neuropeer-data/instagram_DWcFdH6CXZA/video.mp4")
    if cached_video.exists():
        import shutil
        video_path = OUT_DIR / "video.mp4"
        shutil.copy2(cached_video, video_path)
        print(f"  Using cached video: {video_path}", flush=True)
    else:
        video_path = download_video(VIDEO_URL, OUT_DIR)
    audio_path = extract_audio(video_path, OUT_DIR)
    duration, fps = get_video_duration(video_path)
    transcript_words = transcribe_audio(audio_path)
    full_text = " ".join(w["word"] for w in transcript_words)
    print(f"  Video: {video_path.name} ({video_path.stat().st_size/(1024*1024):.1f} MB)")
    print(f"  Duration: {duration:.1f}s | Words: {len(transcript_words)}")
    print(f"  Transcript: {full_text[:100]}...")

    # Save transcript
    with open(OUT_DIR / "transcript.json", "w") as f:
        json.dump({"words": transcript_words, "text": full_text, "model": "elevenlabs_scribe_v2"}, f, indent=2)

    # ── Step 2: Create DataCrunch A100 spot instance ─────────────────────
    print(f"\n[2/7] Creating DataCrunch A100 spot instance...")
    client = DataCrunchClient(DATACRUNCH_CLIENT_ID, DATACRUNCH_CLIENT_SECRET)

    # Build ordered list of (instance_type, location) to try
    avail = client.instances.get_availabilities()
    gpu_candidates = []
    # Priority: preferred type first, then A100s, then H100s, then others
    # ONLY allow single-GPU instances (1x prefix) to avoid multi-GPU costs
    ALLOWED_PREFIXES = ["1A100", "1H100", "1L40", "1A6000", "1RTX", "1V100"]
    for entry in avail:
        loc_code = entry["location_code"] if isinstance(entry, dict) else entry.location_code
        instance_list = entry["availabilities"] if isinstance(entry, dict) else entry.availabilities
        # Preferred type first
        if INSTANCE_TYPE in instance_list:
            gpu_candidates.insert(0, (INSTANCE_TYPE, loc_code))
        # Then single-GPU types only
        for itype in instance_list:
            if any(itype.startswith(p) for p in ALLOWED_PREFIXES) and (itype, loc_code) not in gpu_candidates:
                gpu_candidates.append((itype, loc_code))
    if not gpu_candidates:
        raise RuntimeError(f"No GPU instances available anywhere. Availabilities: {avail}")
    print(f"  GPU candidates: {[(t, l) for t, l in gpu_candidates[:5]]}")

    # Startup script: install pip + ffmpeg (heavy ML deps installed via SSH)
    startup_script_content = """#!/bin/bash
apt-get update -qq && apt-get install -y -qq ffmpeg python3-pip python3-venv > /dev/null 2>&1
echo "READY" > /tmp/setup_done
"""
    script_obj = client.startup_scripts.create(
        name=f"neuropeer-{job_id[:8]}",
        script=startup_script_content,
    )
    print(f"  Startup script created: {script_obj.id}")

    # Try each GPU candidate until one succeeds
    instance = None
    inst_type = None
    location = None
    for candidate_type, candidate_loc in gpu_candidates:
        print(f"  Trying {candidate_type} in {candidate_loc}...")
        t_boot = time.time()
        try:
            instance = client.instances.create(
                instance_type=candidate_type,
                image="ubuntu-24.04-cuda-12.8-open-docker",
                ssh_key_ids=[SSH_KEY_ID],
                hostname=f"neuropeer-{job_id[:8]}",
                description="NeuroPeer TRIBE v2 inference",
                location=candidate_loc,
                is_spot=False,  # On-demand to avoid spot eviction
                startup_script_id=script_obj.id,
                max_wait_time=600,
            )
            inst_type = candidate_type
            location = candidate_loc
            break
        except Exception as e:
            print(f"    Failed: {e}")
            continue
    if instance is None:
        raise RuntimeError("All GPU candidates exhausted. No spot instances available.")
    instance_id = instance.id
    boot_time = time.time() - t_boot
    print(f"  Instance created: {inst_type} in {location}")
    print(f"  Instance ID: {instance_id}")
    print(f"  IP: {instance.ip}")
    print(f"  Boot time: {boot_time:.0f}s")

    ip_address = instance.ip

    try:
        # ── Step 3: Wait for SSH + basic setup ───────────────────────────
        print(f"\n[3/7] Waiting for SSH access...")
        for attempt in range(60):
            result = ssh_cmd(ip_address, "cat /tmp/setup_done 2>/dev/null || echo 'booting'")
            if result.returncode == 0 and "READY" in result.stdout:
                print(f"  SSH ready ({attempt*5}s)")
                break
            if attempt % 6 == 0:
                print(f"  Waiting... ({attempt*5}s)")
            time.sleep(5)
        else:
            raise RuntimeError("SSH timed out after 5 minutes")

        # ── Step 4: Build events DataFrame + upload to GPU ────────────────
        print(f"\n[4/7] Building events + uploading to GPU instance...")
        import re as _re
        sentences = [s.strip() for s in _re.split(r'[.!?]+', full_text) if s.strip()]
        events = []
        events.append({"type": "Video", "filepath": "/tmp/video.mp4", "start": 0,
            "duration": duration, "timeline": "default", "subject": "default"})
        events.append({"type": "Audio", "filepath": "/tmp/audio.wav", "start": 0,
            "duration": duration, "timeline": "default", "subject": "default"})
        for w in transcript_words:
            wt = w["word"].strip()
            if not wt: continue
            sentence = full_text
            for s in sentences:
                if wt.lower() in s.lower(): sentence = s; break
            events.append({"type": "Word", "text": wt, "start": w["start"],
                "duration": max(w["end"] - w["start"], 0.01), "timeline": "default",
                "subject": "default", "sentence": sentence, "context": sentence})
        import pandas as pd
        events_df = pd.DataFrame(events)
        events_parquet = OUT_DIR / "events_for_gpu.parquet"
        events_df.to_parquet(str(events_parquet), index=False)
        print(f"  Events: {len(events_df)} rows ({events_df['type'].value_counts().to_dict()})")

        for local, remote in [(video_path, "/tmp/video.mp4"), (audio_path, "/tmp/audio.wav"),
                               (events_parquet, "/tmp/events.parquet")]:
            subprocess.run(["scp"] + SSH_OPTS + [str(local), f"root@{ip_address}:{remote}"],
                check=True, timeout=60)
        print(f"  Files uploaded to GPU instance")

        # ── Step 5: Install tribev2 + run inference ──────────────────────
        print(f"\n[5/7] Installing tribev2 + running model.predict() on GPU...")
        print(f"  (No whisperx needed — events built locally with ElevenLabs)")
        hf_token = os.environ.get("HF_TOKEN", "")
        remote_script = r'''#!/bin/bash
exec > /tmp/inference.log 2>&1
set -eo pipefail

echo "=== Creating venv + installing tribev2 ==="
python3 -m venv /tmp/venv
source /tmp/venv/bin/activate
pip install --upgrade pip -q
pip install git+https://github.com/facebookresearch/tribev2.git 2>&1 | tail -3
echo "=== tribev2 installed ==="

echo "=== Running inference ==="
export HF_TOKEN="''' + hf_token + r'''"
export HUGGING_FACE_HUB_TOKEN="$HF_TOKEN"
python3 -u << 'PYEOF'
import sys, time, logging, json
import numpy as np
import pandas as pd
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("tribe")
t0 = time.time()

# Load pre-built events (transcription done locally with ElevenLabs)
events = pd.read_parquet("/tmp/events.parquet")
log.info("Events loaded: %d rows, types: %s", len(events), events["type"].value_counts().to_dict())

# Standardize events (tribev2 expects this)
from neuralset.events.utils import standardize_events
events = standardize_events(events)
log.info("Events standardized: %d rows", len(events))

# Load TRIBE v2 model
log.info("Loading TRIBE v2 model...")
from tribev2 import TribeModel
model = TribeModel.from_pretrained("facebook/tribev2", cache_folder="/tmp/tribe_cache")
log.info("Model loaded in %.1fs", time.time() - t0)

# Run prediction (events already contain Video + Audio + Word events)
log.info("Running model.predict()...")
t2 = time.time()
preds, segments = model.predict(events=events)
log.info("Full prediction done in %.1fs: shape=%s", time.time() - t2, preds.shape)

results = {"full": preds.astype(np.float32)}

# Ablations: zero out modality columns
for name in ["video_only", "audio_only", "text_only"]:
    log.info("Ablation: %s", name)
    try:
        df2 = events.copy()
        if "video" in name:
            mask = df2["type"].isin(["Audio", "Word"])
            df2 = df2[~mask]
        elif "audio" in name:
            mask = df2["type"].isin(["Video", "Word"])
            df2 = df2[~mask]
        elif "text" in name:
            mask = df2["type"].isin(["Video", "Audio"])
            df2 = df2[~mask]
        if len(df2) > 0:
            p, _ = model.predict(events=df2)
            results[name] = p.astype(np.float32)
            log.info("  %s: shape=%s", name, p.shape)
        else:
            log.warning("  %s: no events remain, using full", name)
            results[name] = results["full"].copy()
    except Exception as e:
        log.warning("  %s failed: %s", name, e)
        results[name] = results["full"].copy()

np.savez_compressed("/tmp/predictions.npz", **results)
total = time.time() - t0
summary = {"n_timesteps": int(preds.shape[0]), "n_vertices": int(preds.shape[1]),
    "mean": float(preds.mean()), "std": float(preds.std()),
    "total_seconds": round(total, 1), "device": "cuda", "model": "facebook/tribev2"}
with open("/tmp/inference_summary.json", "w") as f:
    json.dump(summary, f, indent=2)
log.info("DONE! Total: %.1fs", total)
PYEOF
echo "INFERENCE_DONE" > /tmp/inference_done
'''
        # Upload the script
        ssh_cmd(ip_address, f"cat > /tmp/run_all.sh << 'ENDSCRIPT'\n{remote_script}\nENDSCRIPT", timeout=15)
        ssh_cmd(ip_address, "chmod +x /tmp/run_all.sh", timeout=10)
        # Launch in background using ssh -f (fully detached)
        ssh_bg(ip_address, "bash /tmp/run_all.sh")
        print(f"  Script launched on GPU instance")

        # Poll for completion (up to 20 min)
        t_infer = time.time()
        for attempt in range(240):
            done = ssh_cmd(ip_address, "cat /tmp/inference_done 2>/dev/null")
            if done.returncode == 0 and "INFERENCE_DONE" in done.stdout:
                elapsed = time.time() - t_infer
                print(f"  Inference complete! ({elapsed:.0f}s total)")
                break

            if attempt % 6 == 0:
                log_tail = ssh_cmd(ip_address, "tail -1 /tmp/inference.log 2>/dev/null")
                elapsed = time.time() - t_infer
                line = log_tail.stdout.strip()[-100:] if log_tail.stdout.strip() else "working..."
                print(f"  [{elapsed:.0f}s] {line}")
            time.sleep(5)
        else:
            # Dump full log before failing
            full_log = ssh_cmd(ip_address, "cat /tmp/inference.log 2>/dev/null", timeout=15)
            (OUT_DIR / "gpu_inference.log").write_text(full_log.stdout or "no log")
            raise RuntimeError("Inference timed out after 20 minutes. See gpu_inference.log")

        # Get results
        summary_result = ssh_cmd(ip_address, "cat /tmp/inference_summary.json")
        summary = json.loads(summary_result.stdout)
        print(f"\n  TRIBE v2 Results:")
        print(f"    Shape: ({summary['n_timesteps']}, {summary['n_vertices']})")
        print(f"    Mean:  {summary['mean']:.6f}")
        print(f"    Std:   {summary['std']:.6f}")
        print(f"    Total: {summary['total_seconds']:.1f}s on GPU")

        # ── Step 6: Download predictions ─────────────────────────────────
        print(f"\n[6/7] Downloading predictions...")
        pred_path = OUT_DIR / "tribe_predictions_real.npz"
        scp_download(ip_address, "/tmp/predictions.npz", pred_path)
        print(f"  Downloaded: {pred_path.stat().st_size/(1024*1024):.1f} MB")

        log_result = ssh_cmd(ip_address, "cat /tmp/inference.log", timeout=15)
        (OUT_DIR / "gpu_inference.log").write_text(log_result.stdout or "")
        with open(OUT_DIR / "tribe_summary.json", "w") as f:
            json.dump(summary, f, indent=2)

    finally:
        # ── DELETE INSTANCE IMMEDIATELY ──────────────────────────────────
        print(f"\n  DELETING DataCrunch instance {instance_id}...")
        try:
            client.instances.action(instance_id, Actions.DELETE)
            print(f"  Instance deleted. No more charges.")
        except Exception as e:
            print(f"  WARNING: Failed to delete instance: {e}")
            print(f"  MANUALLY DELETE: instance {instance_id}")
        # Clean up startup script
        try:
            client.startup_scripts.delete_by_id(script_obj.id)
        except Exception:
            pass

    # ── Step 7: Compute metrics + store in DB ────────────────────────────
    print(f"\n[7/7] Computing 20 GTM metrics + Neural Score...")
    from backend.pipeline.tribe_inference import Modality
    from backend.pipeline.metric_engine import compute_all_metrics
    from backend.pipeline.neural_score import compute_neural_score, detect_key_moments
    from backend.models.schemas import ContentType

    # Load real predictions
    data = np.load(str(pred_path))
    predictions = {Modality(k): data[k] for k in data.files}

    content_type_enum = ContentType(CONTENT_TYPE)
    metrics, attn_curve, arousal_curve, cog_curve, modality_breakdown = compute_all_metrics(predictions)
    neural_score = compute_neural_score(metrics, content_type_enum)
    key_moments = detect_key_moments(attn_curve, arousal_curve, cog_curve, predictions[Modality.FULL])

    print(f"\n    {'='*50}")
    print(f"    NEURAL SCORE: {neural_score.total:.1f} / 100")
    print(f"    {'='*50}")
    print(f"    Hook Score:            {neural_score.hook_score:.1f}")
    print(f"    Sustained Attention:   {neural_score.sustained_attention:.1f}")
    print(f"    Emotional Resonance:   {neural_score.emotional_resonance:.1f}")
    print(f"    Memory Encoding:       {neural_score.memory_encoding:.1f}")
    print(f"    Aesthetic Quality:     {neural_score.aesthetic_quality:.1f}")
    print(f"    Cognitive Access.:     {neural_score.cognitive_accessibility:.1f}")
    print(f"    {'='*50}")

    for m in metrics:
        print(f"    {m.name:32s} {m.score:6.1f}/100")

    # Store in PostgreSQL
    import asyncio
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from backend.models.db import Base, Job, Result

    async def store():
        engine = create_async_engine(os.environ["DATABASE_URL"])
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            job = Job(
                id=uuid.UUID(job_id), url=VIDEO_URL, label=LABEL,
                content_type=CONTENT_TYPE, status="complete",
                created_at=datetime.now(UTC).replace(tzinfo=None),
                completed_at=datetime.now(UTC).replace(tzinfo=None),
            )
            session.add(job)
            await session.flush()
            result = Result(
                job_id=uuid.UUID(job_id), duration_seconds=duration,
                neural_score_total=neural_score.total,
                hook_score=neural_score.hook_score,
                sustained_attention=neural_score.sustained_attention,
                emotional_resonance=neural_score.emotional_resonance,
                memory_encoding=neural_score.memory_encoding,
                aesthetic_quality=neural_score.aesthetic_quality,
                cognitive_accessibility=neural_score.cognitive_accessibility,
                metrics_json=[m.model_dump() for m in metrics],
                key_moments_json=[km.model_dump() for km in key_moments],
                modality_json=[mb.model_dump() for mb in modality_breakdown],
            )
            session.add(result)
            await session.commit()
        await engine.dispose()

    asyncio.run(store())
    print(f"\n  Stored in PostgreSQL (job_id={job_id})")

    # Store result in Redis for API access
    import redis as redis_sync
    r = redis_sync.from_url("redis://localhost:6379/0")
    result_dict = {
        "job_id": job_id, "url": VIDEO_URL, "content_type": CONTENT_TYPE,
        "duration_seconds": duration,
        "neural_score": neural_score.model_dump(),
        "metrics": [m.model_dump() for m in metrics],
        "attention_curve": attn_curve.tolist(),
        "emotional_arousal_curve": arousal_curve.tolist(),
        "cognitive_load_curve": cog_curve.tolist(),
        "key_moments": [km.model_dump() for km in key_moments],
        "modality_breakdown": [mb.model_dump() for mb in modality_breakdown],
    }
    r.set(f"neuropeer:result:{job_id}", json.dumps(result_dict), ex=60*60*24*7)
    r.set(f"neuropeer:job_status:{job_id}", json.dumps({"status": "complete"}), ex=60*60*24*7)
    print(f"  Cached in Redis (TTL 7 days)")

    # Save all results to disk
    with open(OUT_DIR / "metrics.json", "w") as f:
        json.dump([m.model_dump() for m in metrics], f, indent=2)
    with open(OUT_DIR / "neural_score.json", "w") as f:
        json.dump(neural_score.model_dump(), f, indent=2)
    with open(OUT_DIR / "key_moments.json", "w") as f:
        json.dump([km.model_dump() for km in key_moments], f, indent=2)

    print(f"\n{'='*70}")
    print(f"  COMPLETE — Real TRIBE v2 Neural Analysis")
    print(f"{'='*70}")
    print(f"  Results: {OUT_DIR}")
    print(f"  Job ID: {job_id}")
    print(f"  View in UI: http://localhost:3000/analyze/{job_id}")
    print(f"  API: http://localhost:8000/api/v1/results/{job_id}")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
