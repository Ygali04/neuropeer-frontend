# NeuroPeer Setup Guide

## 1. Cookie Authentication (Instagram, Facebook, age-gated YouTube)

Instagram blocks anonymous yt-dlp downloads from server IPs. You must provide
cookies from a logged-in browser session.

**Important:** Use Firefox for cookie export — Chrome cookie extraction is broken
since July 2024 and will produce invalid cookies.

### Steps

```bash
# 1. Install the "cookies.txt" Firefox add-on:
#    https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/

# 2. Log in to Instagram in Firefox

# 3. Navigate to https://www.instagram.com
#    Click the extension icon → Export → save as cookies.txt

# 4. Place the file in the secrets directory
mkdir -p secrets
cp ~/Downloads/cookies.txt secrets/cookies.txt

# 5. Start or restart the worker (it mounts the file automatically)
docker-compose restart worker
```

### Verifying it works

```bash
# Test yt-dlp with your cookies directly inside the running worker
docker-compose exec worker yt-dlp \
  --cookies /run/secrets/cookies.txt \
  --simulate \
  "https://www.instagram.com/reel/YOUR_REEL_ID/"
```

If that prints video metadata without errors, cookie auth is working.

### Cookie expiry

Instagram cookies typically expire after 30–90 days or when you log out.
If downloads start failing again, re-export cookies and replace `secrets/cookies.txt`.

---

## 2. Residential Proxy (Instagram / Facebook from Cloud IPs)

Meta blocks datacenter and cloud provider IPs from downloading Instagram/Facebook content.
Even with valid cookies, downloads from AWS/GCP/Azure will fail with HTTP 403 or
"content not available" errors. You need a **residential proxy** that routes requests
through real home IP addresses.

### Recommended: Oxylabs Rotating Residential

Pricing: $8–15/GB. Session IDs rotate per-request to spread load across many IPs.

```bash
# 1. Sign up at https://oxylabs.io/products/residential-proxy-pool

# 2. Add credentials to backend/.env:
PROXY_URL=http://proxy.oxylabs.io:60000
PROXY_USERNAME=your_oxylabs_username
PROXY_PASSWORD=your_oxylabs_password

# 3. Restart the worker
docker-compose restart worker
```

The worker auto-generates a fresh session ID per download (e.g. `username-sessid_abc123def456`)
to avoid per-session rate-limit accumulation.

### How it works

- Without proxy: Instagram sees your cloud IP → 403 / "content not available"
- With proxy: Request routes through a residential IP → Instagram serves the content
- NeuroPeer always uses residential proxy for Instagram and Facebook; other platforms use direct connection

---

## 3. Platform Support Matrix

| Platform | Auth required | Proxy required | Notes |
|---|---|---|---|
| Instagram Reels / Posts | ✅ Yes (Firefox cookies) | ✅ Yes (residential) | Must use Firefox for cookie export |
| YouTube | ❌ No (anonymous) | ❌ No | Cookies help avoid rate-limit blocks on shared IPs |
| YouTube Shorts | ❌ No (anonymous) | ❌ No | Same as YouTube |
| TikTok | ❌ No (anonymous) | ❌ No | Regional availability may vary |
| Vimeo (public) | ❌ No | ❌ No | Password-protected videos require cookies |
| Twitter / X | ❌ No | ❌ No | Works for public tweets |
| Facebook | ✅ Yes (cookies) | ✅ Yes (residential) | Export from facebook.com while logged in |
| Direct MP4/MOV URL | ❌ No | ❌ No | Bypasses yt-dlp entirely |

---

## 4. Verda B200 Spot Instance Setup

### Why Verda B200?

TRIBE v2 uses V-JEPA2 (ViT-Giant) + Wav2Vec-BERT 2.0 + LLaMA 3.2-3B run in 4 passes.
On a B200:
- 4 inference passes on a 60s Reel: ~45–75 seconds
- Cost per analysis: ~$0.08–0.15 at spot pricing ($1.67/hr)
- vs. A100: ~180–300 seconds / ~$0.25–0.40

### Setup

```bash
# 1. Install the Verda Python SDK
pip install verda

# 2. Create an API key at https://app.verda.com/settings/api-keys

# 3. Set your Verda credentials in backend/.env
INFERENCE_BACKEND=verda
VERDA_API_KEY=your_verda_api_key
VERDA_API_URL=https://api.verda.com/v1

# 4. Build and push the pre-loaded inference image
cd verda-inference-image
docker build \
  --build-arg HF_TOKEN=your_hf_token \
  --build-arg TRIBE_MODEL_ID=facebook/tribev2 \
  -t neuropeer/tribe-inference:latest .
docker push neuropeer/tribe-inference:latest

# 5. Update VERDA_INFERENCE_IMAGE in .env to match your registry
VERDA_INFERENCE_IMAGE=your-registry/neuropeer/tribe-inference:latest

# 6. Restart the worker
docker-compose restart worker
```

### Instance lifecycle per job

```
Job submitted (0s)
  ↓
Stage 1: Download + transcribe on CPU worker (~30–90s)
  ↓
Worker POSTs to Verda API → B200 instance boots (~25–40s cold start)
  ↓
Instance pulls events.parquet from S3 → loads TRIBE v2 (~5s, pre-loaded)
  ↓
4 × model.predict() passes (~45–75s on B200)
  ↓
Instance uploads predictions.npz to S3 → self-terminates
  ↓
Worker downloads predictions → runs 18 metrics (CPU, ~5s)
  ↓
Results broadcast to frontend via WebSocket (total: ~2–4 minutes)
```

### Fallback behavior

If the Verda API is unreachable or the spot instance fails, the worker
automatically falls back to local inference (requires local NVIDIA GPU).
The job never hard-fails due to spot availability issues.

### Pre-warming (optional, for sub-30s cold start)

```bash
# Check Verda docs at https://docs.verda.com for pre-warm endpoint details
```

---

## 5. Quick Start (Local Dev — No GPU)

```bash
# Create secrets dir and empty cookies file
mkdir -p secrets && touch secrets/cookies.txt

# Copy and fill in env vars
cp backend/.env.example backend/.env
# Edit backend/.env: set HF_TOKEN, leave INFERENCE_BACKEND=local, DEVICE=cpu

# Start all services
docker-compose up

# Frontend: http://localhost:3000
# API docs: http://localhost:8000/docs
# MinIO console: http://localhost:9001 (neuropeer / neuropeer123)
```

For dev without a real GPU, mock TRIBE v2 by replacing `run_inference` in
`backend/pipeline/tribe_inference.py` with:
```python
return np.random.randn(n_timesteps, 20484).astype(np.float32)
```

---

## 6. Debugging Download Failures

The full yt-dlp error (including stderr) is now included in the job error message.
To see it:

```bash
# Via API
curl http://localhost:8000/api/v1/results/{job_id}/status

# Via Redis directly
docker-compose exec redis redis-cli GET "neuropeer:job_status:{job_id}"

# Via worker logs (live)
docker-compose logs -f worker
```

Common errors and fixes:

| Error | Fix |
|---|---|
| `Authentication required` | Add/refresh `secrets/cookies.txt` (use Firefox, not Chrome) |
| `rate-limit` / `429` | Add residential proxy (PROXY_URL/PROXY_USERNAME/PROXY_PASSWORD) |
| `403` / `content not available` on Instagram | Residential proxy required — cloud IPs are blocked by Meta |
| `Private` / `not available` | Content is private or region-blocked |
| `ffmpeg not found` | Ensure ffmpeg is in the worker Docker image (it is by default) |
| `yt-dlp not found` | Rebuild the worker container: `docker-compose build worker` |
| `Verda SDK not installed` | Add `verda>=1.20.0` to requirements.txt and rebuild |
