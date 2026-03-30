# NeuroPeer

Neural Simulation Engine for GTM Content Optimization -- predicts fMRI-level brain responses to video, audio, and text stimuli across 20,484 cortical vertices, without recruiting a single fMRI participant. Powered by Meta TRIBE v2.

Marketing teams use NeuroPeer to quantify attention, emotional resonance, aesthetic appeal, cognitive load, and memory encoding of GTM content (product demos, Instagram Reels, pre-roll ads) via a single API call.

---

## Architecture

```
                         +----------------+
                         |   Next.js 14   |
                         |   Dashboard    |
                         |  (port 3000)   |
                         +-------+--------+
                                 |
                          REST / WebSocket
                                 |
                         +-------v--------+
                         |   FastAPI       |
                         |   API Gateway   |
                         |  (port 8000)    |
                         +---+--------+---+
                             |        |
                    +--------v--+  +--v--------+
                    | PostgreSQL |  |   Redis   |
                    |  (metadata)|  | (cache +  |
                    |  port 5432 |  |  Celery   |
                    +------------+  |  broker)  |
                                    +-----+-----+
                                          |
                                  +-------v--------+
                                  | Celery Worker   |
                                  | (TRIBE v2       |
                                  |  inference)     |
                                  +-------+--------+
                                          |
                              +-----------+-----------+
                              |                       |
                       +------v------+      +---------v--------+
                       | MinIO / S3  |      | DataCrunch A100  |
                       | (media +    |      | (remote GPU via  |
                       |  tensors)   |      |  spot instances)      |
                       +-------------+      +------------------+
```

| Layer            | Technology                                                                     |
|------------------|--------------------------------------------------------------------------------|
| Frontend         | Next.js 14, React 18, TypeScript, D3.js, Three.js, Tailwind CSS               |
| API Gateway      | FastAPI (Python 3.11), JWT auth, WebSocket progress streaming                  |
| Task Queue       | Celery 5.4 + Redis 7 broker                                                   |
| Inference Engine | PyTorch 2.x, Meta TRIBE v2 (HuggingFace `facebook/tribev2`), faster-whisper   |
| Analytics        | NumPy, SciPy, Nilearn (Schaefer-1000 atlas parcellation)                      |
| Storage          | PostgreSQL 16 (metadata), Redis 7 (cache), S3/MinIO (media + prediction data) |
| GPU Compute      | Local NVIDIA A100/H100 or remote DataCrunch A100 spot instances ($0.45/h)     |

---

## Quick Start

```bash
git clone <repo-url> && cd video-brainscore
./setup.sh
```

The setup script handles everything: prerequisite checks, Python environment, dependencies, Docker services, and environment configuration. See [Manual Setup](#manual-setup) below if you prefer doing it step by step.

---

## Manual Setup

### Prerequisites

- Python 3.11+
- Docker and docker compose v2
- ffmpeg
- [uv](https://docs.astral.sh/uv/) (recommended) or pip

### Steps

```bash
# 1. Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# 2. Create virtual environment
uv venv .venv
source .venv/bin/activate

# 3. Install dependencies (editable + dev extras)
uv pip install -e ".[dev]"

# 4. Configure environment
cp backend/.env.example .env
# Edit .env — set HF_TOKEN, SECRET_KEY at minimum

# 5. Create secrets directory (for yt-dlp cookies)
mkdir -p secrets && touch secrets/cookies.txt

# 6. Start infrastructure services
docker compose up -d postgres redis minio

# 7. Start the API server
uvicorn backend.api.main:app --reload --port 8000

# 8. Start the Celery worker (separate terminal)
celery -A backend.worker.tasks.celery_app worker --loglevel=info --concurrency=1

# 9. Start the frontend (separate terminal)
cd frontend && npm install && npm run dev
```

---

## Dev Workflow

```bash
# Activate the environment
source .venv/bin/activate

# Run the full stack via Docker
docker compose up

# Or run services individually for development:
docker compose up -d postgres redis minio      # infrastructure only
uvicorn backend.api.main:app --reload           # API with hot reload
celery -A backend.worker.tasks.celery_app worker --loglevel=info  # worker

# Run tests
pytest

# Lint and format
ruff check backend/
ruff format backend/

# Type check (if mypy is configured)
mypy backend/

# View API docs
open http://localhost:8000/docs
```

### Environment Variables

Copy `backend/.env.example` to `.env` and configure:

| Variable              | Required | Description                                |
|-----------------------|----------|--------------------------------------------|
| `HF_TOKEN`           | Yes      | HuggingFace token for `facebook/tribev2`   |
| `SECRET_KEY`         | Yes      | JWT signing key (change from default)      |
| `DATABASE_URL`       | Yes      | PostgreSQL connection string               |
| `REDIS_URL`          | Yes      | Redis connection string                    |
| `S3_BUCKET`          | Yes      | S3/MinIO bucket name                       |
| `DEVICE`             | No       | `cpu` (default) or `cuda` for GPU          |
| `INFERENCE_BACKEND`  | No       | `local` (default) or `datacrunch` for GPU  |
| `DATACRUNCH_CLIENT_ID` | No     | DataCrunch OAuth2 client ID (remote GPU)   |
| `YTDLP_COOKIES_FILE` | No      | Path to cookies.txt for auth-walled sites  |

---

## API Endpoints

Base URL: `http://localhost:8000/api/v1`

| Method | Endpoint                          | Description                                   | Response                                  |
|--------|-----------------------------------|-----------------------------------------------|-------------------------------------------|
| `POST` | `/analyze`                        | Submit a video URL for neural analysis        | Job ID + WebSocket URL for progress       |
| `GET`  | `/results/{job_id}`               | Retrieve full neural analysis report          | All metrics, timeseries, and scores       |
| `GET`  | `/results/{job_id}/status`        | Check job processing status                   | Current status and progress               |
| `GET`  | `/results/{job_id}/timeseries`    | Second-by-second attention curve data         | Per-second metric value arrays            |
| `GET`  | `/results/{job_id}/brain-map`     | 3D cortical activation at a given timestamp   | 20,484 vertex-level activation values     |
| `POST` | `/compare`                        | A/B neural comparison of 2+ analyzed videos   | Comparative metrics + recommendation      |
| `POST` | `/results/{job_id}/export`        | Export analysis as PDF or JSON report         | Download URL or inline data               |
| `GET`  | `/health`                         | Service health check                          | `{"status": "ok"}`                        |
| `WS`   | `/ws/job/{job_id}`                | Real-time progress updates via WebSocket      | Streaming status + stage progress         |

### Example: Submit a video for analysis

```bash
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=example", "content_type": "product_demo"}'
```

Response:
```json
{
  "job_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "websocket_url": "/ws/job/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "status": "queued"
}
```

---

## Project Structure

```
video-brainscore/
├── setup.sh                     # Automated dev environment setup
├── pyproject.toml               # Python project config + dependencies
├── docker-compose.yml           # Full stack: postgres, redis, minio, api, worker, frontend
├── .gitignore
├── .env                         # Local env vars (git-ignored)
├── NEUROPEER_SPEC.md            # Full technical specification
│
├── backend/
│   ├── __init__.py
│   ├── Dockerfile
│   ├── requirements.txt         # Pinned deps (pyproject.toml is source of truth)
│   ├── .env.example             # Template for environment variables
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app, CORS, router registration
│   │   ├── websocket.py         # WebSocket endpoint for live progress
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── analyze.py       # POST /analyze — submit video for analysis
│   │       ├── results.py       # GET /results — retrieve reports, timeseries, brain maps
│   │       ├── compare.py       # POST /compare — A/B neural comparison
│   │       └── export.py        # POST /export — PDF/JSON report generation
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── schemas.py           # Pydantic request/response models
│   │   └── db.py                # SQLAlchemy models + async session
│   │
│   ├── pipeline/
│   │   ├── __init__.py
│   │   └── tribe_inference.py   # TRIBE v2 model loading + inference
│   │
│   └── worker/
│       ├── __init__.py
│       └── tasks.py             # Celery tasks (download, transcribe, infer, score)
│
├── frontend/
│   ├── Dockerfile
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── eslint.config.mjs
│   ├── app/                     # Next.js app directory
│   └── public/                  # Static assets
│
└── secrets/                     # Git-ignored; cookies.txt for yt-dlp auth
    └── cookies.txt
```

---

## License

TRIBE v2 is licensed under **CC BY-NC 4.0** (non-commercial only). Commercial deployment requires a separate licensing agreement with Meta FAIR.
