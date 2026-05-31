"""Tests for the inference backend dispatcher (RunPod-only).

These guard the RunPod-only refactor: the dispatcher must route GPU work to
RunPod, fall back to local when appropriate, and never reference the removed
DataCrunch backend. A stale ``datacrunch`` selector value must degrade
gracefully rather than crash or hit a deleted code path.
"""

from __future__ import annotations

from pathlib import Path
from unittest import mock

import pandas as pd
import pytest

# Imported AFTER conftest.py pins DATABASE_URL to SQLite.
import backend.pipeline.remote_gpu as rg
from backend.config import Settings, settings


@pytest.fixture
def _events_df() -> pd.DataFrame:
    return pd.DataFrame([{"type": "Video", "start": 0, "duration": 1}])


@pytest.fixture(autouse=True)
def _restore_backend():
    """Restore the global backend selector after each test."""
    original = settings.inference_backend
    yield
    settings.inference_backend = original


def test_runpod_routes_to_runpod(_events_df):
    with mock.patch.object(rg, "_run_on_runpod", return_value=({}, "k")) as m_rp, mock.patch.object(
        rg, "_run_locally", return_value=({}, "l")
    ) as m_loc:
        settings.inference_backend = "runpod"
        rg.run_inference_backend("job", _events_df, Path("/tmp"), video_path=Path("/tmp/v.mp4"))
        assert m_rp.called
        assert not m_loc.called


def test_runpod_without_video_falls_back_to_local(_events_df):
    with mock.patch.object(rg, "_run_on_runpod", return_value=({}, "k")) as m_rp, mock.patch.object(
        rg, "_run_locally", return_value=({}, "l")
    ) as m_loc:
        settings.inference_backend = "runpod"
        rg.run_inference_backend("job", _events_df, Path("/tmp"), video_path=None)
        assert m_loc.called
        assert not m_rp.called


@pytest.mark.parametrize("backend", ["local", "mock"])
def test_non_gpu_backends_route_to_local(backend, _events_df):
    with mock.patch.object(rg, "_run_on_runpod", return_value=({}, "k")) as m_rp, mock.patch.object(
        rg, "_run_locally", return_value=({}, "l")
    ) as m_loc:
        settings.inference_backend = backend
        rg.run_inference_backend("job", _events_df, Path("/tmp"), video_path=Path("/tmp/v.mp4"))
        assert m_loc.called
        assert not m_rp.called


def test_no_datacrunch_implementation_remains():
    """The DataCrunch backend must be fully removed from remote_gpu."""
    assert not hasattr(rg, "_run_on_datacrunch")
    assert not hasattr(rg, "DataCrunchError")
    assert not hasattr(rg, "_datacrunch_client")
    leftover = [name for name in dir(rg) if "datacrunch" in name.lower()]
    assert leftover == []


def test_stale_datacrunch_selector_does_not_hit_deleted_path(_events_df):
    """A datacrunch value sneaking past the config validator must not crash.

    It should fall through to the local path rather than reference any
    removed DataCrunch function.
    """
    with mock.patch.object(rg, "_run_on_runpod", return_value=({}, "k")) as m_rp, mock.patch.object(
        rg, "_run_locally", return_value=({}, "l")
    ) as m_loc:
        settings.inference_backend = "datacrunch"
        rg.run_inference_backend("job", _events_df, Path("/tmp"), video_path=Path("/tmp/v.mp4"))
        assert m_loc.called
        assert not m_rp.called


def test_config_migrates_legacy_datacrunch_to_runpod():
    """A stale INFERENCE_BACKEND=datacrunch env value maps to runpod."""
    migrated = Settings(inference_backend="datacrunch")
    assert migrated.inference_backend == "runpod"


def test_config_has_no_datacrunch_fields():
    assert [f for f in Settings.model_fields if "datacrunch" in f.lower()] == []


def test_default_backend_is_runpod():
    assert Settings().inference_backend == "runpod"
