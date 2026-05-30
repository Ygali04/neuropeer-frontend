# RunPod Serverless GPU backend

An alternative compute backend for TRIBE v2 inference that uses **RunPod
Serverless** (queue-driven autoscaling + scale-to-zero) instead of the legacy
pod-per-job path. Selected at runtime via the `GPU_BACKEND` feature flag; the
default (`pod`) leaves the existing behaviour untouched.

## How it fits together

```
worker/tasks.py
  └─ remote_gpu.run_inference_backend()        # dispatch
       ├─ GPU_BACKEND=pod (default) ─→ _run_on_runpod()        # boot pod per job
       └─ GPU_BACKEND=serverless    ─→ runpod_serverless_client.run_on_serverless()
                                          ├─ upload video/events to S3
                                          ├─ POST /run  → endpoint
                                          ├─ poll /status until COMPLETED
                                          └─ download predictions from S3
```

The model inference itself is **shared** between both paths via
`backend/pipeline/inference_core.py`:

- the legacy pod renders `/tmp/inference.py` from `render_pod_inference_script()`
- the serverless worker (`rp_handler.py`) calls `run_tribe_inference()` directly

There is exactly one copy of the chunked-predict + ablation logic.

## 1. Build & push the image

The build context must be the **repo root** so the `backend/` package is
included:

```bash
docker build -f backend/serverless/Dockerfile.serverless \
  --build-arg HF_TOKEN="$HF_TOKEN" \
  -t <registry>/neuropeer-serverless:latest .

docker push <registry>/neuropeer-serverless:latest
```

`HF_TOKEN` is optional — it pre-downloads the (gated) `facebook/tribev2`
weights at build time to cut cold-start. Without it, weights download on the
first job.

## 2. Create the serverless endpoint

In the RunPod console (**Serverless → New Endpoint**) or via the RunPod API:

- **Container image:** `<registry>/neuropeer-serverless:latest`
- **GPU:** an 80 GB A100 (or any GPU with >= 22 GB VRAM and compute capability
  <= sm_90 — the `check_gpu()` guard rejects anything smaller or newer like
  Blackwell).
- **Workers:** `min_workers=0`, `max_workers=N` (e.g. 3-5). `min=0` gives true
  scale-to-zero (you pay nothing when idle) at the cost of a cold start on the
  first request.
  - **Paid tier note:** set `min_workers=1` to keep one worker warm and
    eliminate cold starts for latency-sensitive traffic. This bills the warm
    worker continuously, so only do it on the paid tier when warm latency
    matters.
- **Environment variables** (the handler reads these at runtime):
  - `S3_BUCKET`
  - `S3_ENDPOINT_URL` (for Backblaze B2 / MinIO; omit for AWS S3)
  - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`
  - `HF_TOKEN` (if weights are not baked into the image)

Copy the resulting **Endpoint ID**.

## 3. Point the backend at the endpoint

Set these on the Celery worker / API host (env or `.env`):

```bash
GPU_BACKEND=serverless
RUNPOD_SERVERLESS_ENDPOINT_ID=<endpoint-id>
RUNPOD_API_KEY=<your-runpod-api-key>
# RUNPOD_SERVERLESS_TIMEOUT=1800   # optional, seconds to poll /status
```

`GPU_BACKEND` is live-read on every job (see `config.gpu_backend()`), so you can
flip between `pod` and `serverless` without restarting the worker. `RUNPOD_API_KEY`
is shared with the existing pod path.

To revert to the legacy path, set `GPU_BACKEND=pod` (or unset it).

## Job contract

Request `input` submitted to the endpoint:

```json
{
  "job_id": "<job_id>",
  "video_s3_uri": "staging/<job_id>/video.mp4",
  "events_s3_uri": "staging/<job_id>/events.parquet",
  "output_s3_uri": "predictions/<job_id>/vertices.npz"
}
```

Handler `output` on success:

```json
{
  "status": "done",
  "n_timesteps": 312,
  "n_vertices": 20484,
  "modalities": ["full", "video_only", "audio_only", "text_only"],
  "output_s3_uri": "predictions/<job_id>/vertices.npz",
  "gpu": {"name": "NVIDIA A100 80GB PCIe", "vram_mb": 81920, "compute_cap": 80}
}
```

On failure the handler returns `{"error": "<message>"}` (including
`hardware_unsuitable: ...` if the VRAM / compute-capability guard rejects the
GPU), which the client surfaces as a `RunPodServerlessError`.
