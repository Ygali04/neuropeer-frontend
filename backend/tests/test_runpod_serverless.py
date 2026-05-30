"""Unit tests for the RunPod Serverless GPU backend.

All RunPod HTTP and S3 calls are mocked — these tests never hit RunPod or S3.
They prove:
  * the client builds the correct /run request and parses /status output
  * failure statuses and handler errors raise RunPodServerlessError
  * GPU_BACKEND routing selects the serverless client (and the default does not)
  * the serverless handler shares ONE inference path with the legacy pod script
"""

from __future__ import annotations

import numpy as np
import pytest

from backend.config import gpu_backend
from backend.pipeline import runpod_serverless_client as client
from backend.pipeline.runpod_serverless_client import RunPodServerlessError


class _FakeResp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._payload


@pytest.fixture(autouse=True)
def _configure(monkeypatch):
    """Give the client a fake endpoint + key so it doesn't bail early."""
    from backend.config import settings

    monkeypatch.setattr(settings, "runpod_serverless_endpoint_id", "ep-test", raising=False)
    monkeypatch.setattr(settings, "runpod_api_key", "key-test", raising=False)
    monkeypatch.setattr(settings, "runpod_serverless_timeout", 60, raising=False)
    # No real sleeping during polling.
    monkeypatch.setattr(client.time, "sleep", lambda *_a, **_k: None)


# ── submit_job builds the right request ──────────────────────────────────────


def test_submit_job_builds_run_request(monkeypatch):
    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _FakeResp({"id": "rp-123", "status": "IN_QUEUE"})

    monkeypatch.setattr(client.requests, "post", fake_post)

    rp_id = client.submit_job({"job_id": "abc", "video_s3_uri": "staging/abc/video.mp4"})

    assert rp_id == "rp-123"
    assert captured["url"] == "https://api.runpod.ai/v2/ep-test/run"
    assert captured["headers"]["Authorization"] == "Bearer key-test"
    # Payload must be wrapped in {"input": ...}
    assert captured["json"]["input"]["job_id"] == "abc"
    assert captured["json"]["input"]["video_s3_uri"] == "staging/abc/video.mp4"


def test_submit_job_missing_id_raises(monkeypatch):
    monkeypatch.setattr(client.requests, "post", lambda *a, **k: _FakeResp({"status": "IN_QUEUE"}))
    with pytest.raises(RunPodServerlessError):
        client.submit_job({"job_id": "abc"})


def test_submit_job_requires_endpoint_id(monkeypatch):
    from backend.config import settings

    monkeypatch.setattr(settings, "runpod_serverless_endpoint_id", "", raising=False)
    with pytest.raises(RunPodServerlessError):
        client.submit_job({"job_id": "abc"})


# ── poll_status parses output / errors ───────────────────────────────────────


def test_poll_status_returns_output_on_completed(monkeypatch):
    seq = iter(
        [
            {"status": "IN_QUEUE"},
            {"status": "IN_PROGRESS"},
            {"status": "COMPLETED", "output": {"status": "done", "output_s3_uri": "predictions/x.npz"}},
        ]
    )
    monkeypatch.setattr(client.requests, "get", lambda *a, **k: _FakeResp(next(seq)))

    out = client.poll_status("rp-123")
    assert out["output_s3_uri"] == "predictions/x.npz"


def test_poll_status_raises_on_failed(monkeypatch):
    monkeypatch.setattr(
        client.requests,
        "get",
        lambda *a, **k: _FakeResp({"status": "FAILED", "error": "boom"}),
    )
    with pytest.raises(RunPodServerlessError, match="FAILED"):
        client.poll_status("rp-123")


def test_poll_status_raises_on_handler_error_in_output(monkeypatch):
    monkeypatch.setattr(
        client.requests,
        "get",
        lambda *a, **k: _FakeResp({"status": "COMPLETED", "output": {"error": "hardware_unsuitable: no GPU"}}),
    )
    with pytest.raises(RunPodServerlessError, match="hardware_unsuitable"):
        client.poll_status("rp-123")


def test_poll_status_times_out(monkeypatch):
    monkeypatch.setattr(client.requests, "get", lambda *a, **k: _FakeResp({"status": "IN_PROGRESS"}))

    # Each call to time() jumps far into the future so the deadline is exceeded.
    t = {"now": 1000.0}

    def advancing_time():
        t["now"] += 1000
        return t["now"]

    monkeypatch.setattr(client.time, "time", advancing_time)
    with pytest.raises(RunPodServerlessError, match="timed out"):
        client.poll_status("rp-123", timeout=1)


# ── run_on_serverless end-to-end (S3 + HTTP mocked) ──────────────────────────


def test_run_on_serverless_full_flow(monkeypatch, tmp_path):
    # Fake video file on disk.
    video = tmp_path / "video.mp4"
    video.write_bytes(b"fake-bytes")

    uploaded = []

    from backend.pipeline import remote_gpu
    from backend.pipeline.tribe_inference import Modality

    monkeypatch.setattr(remote_gpu, "_s3_upload", lambda data, key: uploaded.append(key))

    fake_preds = {m: np.zeros((3, 4), dtype=np.float32) for m in Modality}
    monkeypatch.setattr(remote_gpu, "_s3_download_predictions", lambda key: dict(fake_preds))

    monkeypatch.setattr(client, "submit_job", lambda payload: "rp-xyz")
    monkeypatch.setattr(
        client, "poll_status", lambda rp_id, timeout=None: {"output_s3_uri": "predictions/job1/vertices.npz"}
    )

    preds, key = client.run_on_serverless("job1", video, events_df=None, audio_path=None)

    assert key == "predictions/job1/vertices.npz"
    assert set(preds.keys()) == set(Modality)
    # Video was staged to S3.
    assert any(k.startswith("staging/job1/video") for k in uploaded)


# ── GPU_BACKEND routing ──────────────────────────────────────────────────────


def test_gpu_backend_default_is_pod(monkeypatch):
    monkeypatch.delenv("GPU_BACKEND", raising=False)
    from backend.config import settings

    monkeypatch.setattr(settings, "gpu_backend", "pod", raising=False)
    assert gpu_backend() == "pod"


def test_gpu_backend_env_overrides_to_serverless(monkeypatch):
    monkeypatch.setenv("GPU_BACKEND", "serverless")
    assert gpu_backend() == "serverless"


def test_gpu_backend_unknown_value_falls_back_to_pod(monkeypatch):
    monkeypatch.setenv("GPU_BACKEND", "banana")
    assert gpu_backend() == "pod"


def test_run_inference_backend_routes_to_serverless(monkeypatch, tmp_path):
    """When GPU_BACKEND=serverless, the runpod provider dispatches to the client."""
    import pandas as pd

    from backend.config import settings
    from backend.pipeline import remote_gpu

    monkeypatch.setattr(settings, "inference_backend", "runpod", raising=False)
    monkeypatch.setenv("GPU_BACKEND", "serverless")

    called = {}

    def fake_run_on_serverless(job_id, video_path, events_df, audio_path):
        called["job_id"] = job_id
        return ({"full": np.zeros((1, 1))}, "predictions/k.npz")

    # Patch the symbol where run_on_serverless is imported (the client module).
    monkeypatch.setattr("backend.pipeline.runpod_serverless_client.run_on_serverless", fake_run_on_serverless)

    # Pod path must NOT be hit.
    def _boom(*a, **k):
        raise AssertionError("legacy pod path was called despite GPU_BACKEND=serverless")

    monkeypatch.setattr(remote_gpu, "_run_on_runpod", _boom)

    video = tmp_path / "v.mp4"
    video.write_bytes(b"x")
    _preds, key = remote_gpu.run_inference_backend(
        "job-route", pd.DataFrame([{"start": 0}]), tmp_path, video_path=video
    )
    assert called["job_id"] == "job-route"
    assert key == "predictions/k.npz"


def test_run_inference_backend_default_uses_pod(monkeypatch, tmp_path):
    """Default (GPU_BACKEND unset) keeps the legacy pod path."""
    import pandas as pd

    from backend.config import settings
    from backend.pipeline import remote_gpu

    monkeypatch.setattr(settings, "inference_backend", "runpod", raising=False)
    monkeypatch.setattr(settings, "gpu_backend", "pod", raising=False)
    monkeypatch.delenv("GPU_BACKEND", raising=False)

    called = {}
    monkeypatch.setattr(remote_gpu, "_run_on_runpod", lambda *a, **k: called.setdefault("pod", True) or ({}, "k"))

    def _boom(*a, **k):
        raise AssertionError("serverless client called despite default GPU_BACKEND=pod")

    monkeypatch.setattr("backend.pipeline.runpod_serverless_client.run_on_serverless", _boom)

    video = tmp_path / "v.mp4"
    video.write_bytes(b"x")
    remote_gpu.run_inference_backend("job-pod", pd.DataFrame([{"start": 0}]), tmp_path, video_path=video)
    assert called.get("pod") is True


# ── Shared inference: one source of truth ────────────────────────────────────


def test_handler_and_pod_share_inference_core():
    """The serverless handler and the rendered pod script use the same chunking code."""
    import inspect

    from backend.pipeline import inference_core
    from backend.serverless import rp_handler

    # Handler imports run_tribe_inference / check_gpu from inference_core.
    handler_src = inspect.getsource(rp_handler)
    assert "from backend.pipeline.inference_core import" in handler_src
    assert "run_tribe_inference" in handler_src
    assert "check_gpu" in handler_src

    # The rendered pod script embeds the SAME chunked_predict source verbatim.
    rendered = inference_core.render_pod_inference_script(
        "predictions/j/vertices.npz", "staging/j/done", "staging/j/error"
    )
    chunk_src = inspect.getsource(inference_core.chunked_predict)
    # A distinctive line from chunked_predict must appear in the source...
    assert "Chunk the EVENTS, not the video file" in chunk_src
    # ...and the rendered pod script must embed that logic verbatim.
    assert "max_chunk_s - overlap_s" in rendered
    # Rendered script must be valid Python.
    compile(rendered, "<rendered>", "exec")


def test_check_gpu_guard_constants():
    """VRAM + CUDA-capability guards match the legacy pod thresholds."""
    from backend.pipeline import inference_core

    assert inference_core.MIN_VRAM_MB == 22000
    assert inference_core.MAX_CUDA_COMPUTE_CAP == 90
