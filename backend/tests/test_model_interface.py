"""Tests for the CorticalScorer contract + get_scorer() factory.

No real GPUs / models are touched — TRIBEv2Scorer.predict is monkeypatched to
verify wiring, and the ORCLE Nano placeholder is checked for its NotImplemented
behavior.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

# Imported AFTER conftest.py pins DATABASE_URL to SQLite.
from backend.pipeline import model_interface
from backend.pipeline.model_interface import (
    CorticalScorer,
    ORCLENanoScorer,
    TRIBEv2Scorer,
    get_scorer,
)
from backend.pipeline.tribe_inference import Modality


@pytest.fixture(autouse=True)
def _clear_scorer_cache():
    """Each test gets a fresh factory cache so backend swaps take effect."""
    model_interface._scorer_cache.clear()
    yield
    model_interface._scorer_cache.clear()


def test_get_scorer_defaults_to_tribe_v2():
    scorer = get_scorer()
    assert isinstance(scorer, TRIBEv2Scorer)
    assert scorer.backend_id == "tribe-v2"
    assert isinstance(scorer, CorticalScorer)


def test_get_scorer_respects_settings_env(monkeypatch):
    """Flipping settings.scorer_backend (the SCORER_BACKEND env field) selects
    a different backend without code changes."""
    monkeypatch.setattr(model_interface.settings, "scorer_backend", "orcle-nano")
    scorer = get_scorer()
    assert isinstance(scorer, ORCLENanoScorer)
    assert scorer.backend_id == "orcle-nano"


def test_get_scorer_explicit_backend_overrides_default():
    scorer = get_scorer("orcle-nano")
    assert isinstance(scorer, ORCLENanoScorer)


def test_get_scorer_is_case_insensitive_and_trimmed(monkeypatch):
    monkeypatch.setattr(model_interface.settings, "scorer_backend", "  TRIBE-V2 ")
    assert isinstance(get_scorer(), TRIBEv2Scorer)


def test_get_scorer_unknown_backend_raises():
    with pytest.raises(ValueError, match="Unknown SCORER_BACKEND"):
        get_scorer("does-not-exist")


def test_get_scorer_memoizes_instances():
    assert get_scorer("tribe-v2") is get_scorer("tribe-v2")


def test_orcle_nano_predict_raises_not_implemented():
    with pytest.raises(NotImplementedError, match="ORCLE Nano"):
        ORCLENanoScorer().predict(pd.DataFrame())


def test_tribe_v2_scorer_delegates_to_run_all_modalities(monkeypatch):
    """TRIBEv2Scorer.predict must call the existing run_all_modalities path so
    tribe-v2 behavior is unchanged by the refactor."""
    fake = {m: np.zeros((3, 20484), dtype=np.float32) for m in Modality}
    calls = {}

    def _fake_run_all(events_df):
        calls["events"] = events_df
        return fake

    monkeypatch.setattr(model_interface, "run_all_modalities", _fake_run_all)

    events = pd.DataFrame({"type": ["Video"], "start": [0]})
    out = TRIBEv2Scorer().predict(events)

    assert out is fake
    assert calls["events"] is events


def test_available_backends_lists_both():
    backends = model_interface.available_backends()
    assert "tribe-v2" in backends
    assert "orcle-nano" in backends
