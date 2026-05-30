"""Swappable cortical-prediction model interface.

kwale.ai's core primitive is the **cortical embedding** — the per-timestep
prediction over the 20,484 fsaverage5 cortical vertices. Today that embedding
is produced by Meta's TRIBE v2 encoder; tomorrow it will be produced by
"ORCLE Nano" (a lighter, in-house encoder). Everything downstream of inference
(metrics, neural score, fusion) already consumes a plain
``dict[Modality, np.ndarray]`` and is therefore model-agnostic.

This module formalizes that contract so the underlying encoder can be swapped
purely via the ``SCORER_BACKEND`` env var, with no changes to the pipeline:

    SCORER_BACKEND=tribe-v2   (default) → TRIBEv2Scorer  (wraps run_inference)
    SCORER_BACKEND=orcle-nano           → ORCLENanoScorer (placeholder)

The factory ``get_scorer()`` resolves the active backend at call time, mirroring
the live-read pattern used by ``settings.scorer_backend``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
import pandas as pd

from backend.config import settings
from backend.pipeline.tribe_inference import Modality, run_all_modalities


class CorticalScorer(ABC):
    """Abstract base for any model that predicts cortical vertex activations.

    Implementations turn a TRIBE-v2-style events DataFrame into per-modality
    cortical embeddings of shape ``(n_timesteps, 20484)`` on the fsaverage5
    surface (one prediction per second).
    """

    #: Stable identifier used by the factory / logging.
    backend_id: str = "abstract"

    @abstractmethod
    def predict(self, events: pd.DataFrame) -> dict[Modality, np.ndarray]:
        """Predict cortical embeddings for the given events DataFrame.

        Args:
            events: TRIBE-v2-compatible events DataFrame (Video/Audio/Word rows).

        Returns:
            Mapping of ``Modality`` → float32 array of shape
            ``(n_timesteps, 20484)``. Must contain at least ``Modality.FULL``;
            implementations are expected to also provide the three ablations.
        """
        raise NotImplementedError


class TRIBEv2Scorer(CorticalScorer):
    """Cortical scorer backed by Meta's TRIBE v2 encoder.

    Thin wrapper over ``tribe_inference.run_all_modalities`` — preserves exactly
    the existing behavior (full multimodal pass + 3 ablations).
    """

    backend_id = "tribe-v2"

    def predict(self, events: pd.DataFrame) -> dict[Modality, np.ndarray]:
        return run_all_modalities(events)


class ORCLENanoScorer(CorticalScorer):
    """Placeholder for the in-house "ORCLE Nano" cortical encoder.

    Reserved as the future swap target for TRIBE v2. Selecting this backend
    today raises a clear ``NotImplementedError`` rather than silently falling
    back, so misconfiguration fails loudly.
    """

    backend_id = "orcle-nano"

    def predict(self, events: pd.DataFrame) -> dict[Modality, np.ndarray]:
        raise NotImplementedError(
            "ORCLE Nano scorer is not implemented yet. "
            "Set SCORER_BACKEND=tribe-v2 (the default) until the ORCLE Nano "
            "encoder lands. This placeholder exists to reserve the swap path."
        )


# ── Factory ───────────────────────────────────────────────────────────────────

# Single-source registry: backend_id → scorer class.
_SCORER_REGISTRY: dict[str, type[CorticalScorer]] = {
    TRIBEv2Scorer.backend_id: TRIBEv2Scorer,
    ORCLENanoScorer.backend_id: ORCLENanoScorer,
}

# Memoize one instance per backend so model weights load once per process.
_scorer_cache: dict[str, CorticalScorer] = {}


def available_backends() -> list[str]:
    """Return the list of registered scorer backend ids."""
    return sorted(_SCORER_REGISTRY)


def get_scorer(backend: str | None = None) -> CorticalScorer:
    """Return the active :class:`CorticalScorer` instance.

    Args:
        backend: Explicit backend id. When ``None`` (default), reads the live
            ``settings.scorer_backend`` value so the choice can be flipped via
            the ``SCORER_BACKEND`` env var without a code change.

    Raises:
        ValueError: if the requested backend id is not registered.
    """
    backend = (backend if backend is not None else settings.scorer_backend).strip().lower()
    if backend not in _SCORER_REGISTRY:
        raise ValueError(
            f"Unknown SCORER_BACKEND {backend!r}. "
            f"Available backends: {available_backends()}"
        )
    if backend not in _scorer_cache:
        _scorer_cache[backend] = _SCORER_REGISTRY[backend]()
    return _scorer_cache[backend]
