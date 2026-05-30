"""Tests for POST /api/v1/embeddings.

The pipeline (Celery enqueue, Redis/Postgres poll, GPU inference, S3 download)
is fully mocked — no real workers, brokers, storage, or GPUs are touched. We
assert the route returns the EmbeddingsResponse schema for both the compact
(default) and full (return_full=true) shapes.
"""

from __future__ import annotations

import numpy as np
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

# Imported AFTER conftest.py pins DATABASE_URL to SQLite.
from backend.api.routes import embeddings as embeddings_route

N_TIMESTEPS = 5
N_VERTICES = 20484


def _fake_predictions() -> dict[str, np.ndarray]:
    rng = np.random.default_rng(0)
    return {
        "full": rng.standard_normal((N_TIMESTEPS, N_VERTICES)).astype(np.float32),
        "video_only": rng.standard_normal((N_TIMESTEPS, N_VERTICES)).astype(np.float32),
        "audio_only": rng.standard_normal((N_TIMESTEPS, N_VERTICES)).astype(np.float32),
        "text_only": rng.standard_normal((N_TIMESTEPS, N_VERTICES)).astype(np.float32),
    }


@pytest.fixture
def client(monkeypatch):
    """Build an app mounting only the embeddings router, with the pipeline mocked."""

    # 1. Celery enqueue is a no-op — never spin up a worker.
    class _FakeAsyncResult:
        def __init__(self, *a, **k):
            pass

    monkeypatch.setattr(
        embeddings_route.run_analysis,
        "apply_async",
        lambda *a, **k: _FakeAsyncResult(),
    )

    # 2. Skip the Redis/Postgres poll loop — return a finished result dict.
    async def _fake_await_job(job_id: str) -> dict:
        return {
            "url": "https://example.com/video.mp4",
            "content_type": "instagram_reel",
            "duration_seconds": float(N_TIMESTEPS),
            "vertex_data_s3_key": f"predictions/{job_id}/vertices.npz",
        }

    monkeypatch.setattr(embeddings_route, "_await_job", _fake_await_job)

    # 3. S3 download returns in-memory fake predictions (lazy-imported in-route).
    from backend.pipeline import remote_gpu

    monkeypatch.setattr(
        remote_gpu, "_s3_download_predictions", lambda key: _fake_predictions()
    )

    app = FastAPI()
    app.include_router(embeddings_route.router, prefix="/api/v1")
    return TestClient(app)


def _payload(**extra) -> dict:
    return {"url": "https://example.com/video.mp4", "content_type": "instagram_reel", **extra}


def test_embeddings_compact_default(client):
    r = client.post("/api/v1/embeddings", json=_payload())
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["surface"] == "fsaverage5"
    assert body["n_vertices"] == N_VERTICES
    assert body["scorer_backend"] == "tribe-v2"
    assert body["return_full"] is False
    assert body["vertex_data_s3_key"].endswith("vertices.npz")
    assert body["vertex_data_uri"].startswith("s3://")
    assert body["duration_seconds"] == float(N_TIMESTEPS)

    mods = {m["modality"]: m for m in body["modalities"]}
    assert set(mods) == {"full", "video_only", "audio_only", "text_only"}
    full = mods["full"]
    assert full["n_timesteps"] == N_TIMESTEPS
    assert full["n_vertices"] == N_VERTICES
    # Compact summary: per-vertex vectors present, full array omitted.
    assert len(full["mean"]) == N_VERTICES
    assert len(full["l2_norm"]) == N_VERTICES
    assert full["vertices"] is None


def test_embeddings_return_full_inlines_array(client):
    r = client.post("/api/v1/embeddings", json=_payload(return_full=True))
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["return_full"] is True
    full = next(m for m in body["modalities"] if m["modality"] == "full")
    assert full["vertices"] is not None
    assert len(full["vertices"]) == N_TIMESTEPS
    assert len(full["vertices"][0]) == N_VERTICES


def test_embeddings_404_when_no_vertex_key(client, monkeypatch):
    async def _no_vertex(job_id: str) -> dict:
        return {
            "url": "https://example.com/video.mp4",
            "content_type": "instagram_reel",
            "duration_seconds": 1.0,
            # no vertex_data_s3_key
        }

    monkeypatch.setattr(embeddings_route, "_await_job", _no_vertex)
    r = client.post("/api/v1/embeddings", json=_payload())
    assert r.status_code == 404


def test_embeddings_requires_api_key_when_enforced(monkeypatch):
    """With enforcement on and no key / no first-party origin, auth rejects
    before any pipeline work — exactly like /score."""
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")

    app = FastAPI()
    app.include_router(embeddings_route.router, prefix="/api/v1")
    client = TestClient(app)

    r = client.post("/api/v1/embeddings", json=_payload())
    assert r.status_code == 401


def test_summarize_predictions_math():
    """Sanity-check the summary math independent of the HTTP layer."""
    arr = np.array([[1.0, 2.0], [3.0, 4.0]], dtype=np.float32)  # (2 timesteps, 2 verts)
    out = embeddings_route._summarize_predictions({"full": arr}, return_full=False)
    s = out[0]
    assert s.n_timesteps == 2
    assert s.n_vertices == 2
    assert s.mean == pytest.approx([2.0, 3.0])  # column means
    assert s.l2_norm == pytest.approx([np.sqrt(10.0), np.sqrt(20.0)])
    assert s.vertices is None
