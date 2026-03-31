"""
Stage 3 — Region Aggregation.

Maps TRIBE v2's 20,484 fsaverage5 cortical vertex predictions to functional
ROIs using the Schaefer-1000 parcellation (via Nilearn).

Each NeuroPeer metric is computed by aggregating vertex-level predictions
over the specific functional region(s) that its neural substrate occupies.
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# ROI definitions — named vertex index arrays on fsaverage5 (20,484 vertices)
# These are fetched from the Schaefer-1000 atlas parcellation at runtime.
# Labels are based on the 7-network Schaefer parcellation naming convention.
# ---------------------------------------------------------------------------

# Canonical ROI group names → list of Schaefer 7-network parcel label fragments
# Label format: 7Networks_{LH,RH}_{Network}_{Subregion}_{Number}
# Available networks: Vis, SomMot, DorsAttn, SalVentAttn, Limbic, Cont, Default
_PARCEL_PATTERNS: dict[str, list[str]] = {
    "ventral_striatum": ["Limbic_OFC"],  # NAcc proxy via OFC
    "anterior_insula": ["SalVentAttn_FrOperIns"],  # AIns: frontal operculum / insula
    "medial_temporal": ["Limbic_TempPole"],  # hippocampus / amygdala proxy
    "tpj": ["SalVentAttn_TempOccPar"],  # temporoparietal junction
    "medial_frontal_acc": ["SalVentAttn_Med", "Cont_Cing"],  # ACC / medial frontal
    "visual_cortex": ["_Vis_"],  # V1–V4: all visual parcels
    "parietal_dorsal": ["DorsAttn_Post", "DorsAttn_FEF"],  # IPS + FEF
    "prefrontal_dlPFC": ["Cont_PFCd", "Cont_PFCl"],  # dlPFC (executive)
    "dmn": ["Default_"],  # Default Mode Network
    "limbic_amygdala": ["Limbic_"],  # amygdala + limbic system
    "hippocampal": ["Limbic_TempPole", "Default_PHC"],  # medial temporal lobe + PHC
    "mpfc_ofc": ["Default_PFC", "Limbic_OFC"],  # mPFC + OFC (valuation)
    "auditory_sts": ["SalVentAttn_TempOcc", "_SomMot_"],  # A1 / STS / somatomotor
    "broca_wernicke": ["SalVentAttn_FrOperIns", "SalVentAttn_PFCl"],  # left IFG + PFC proxy
    "parahippocampal": ["Default_PHC"],  # parahippocampal place area
    "fusiform": ["_Vis_", "DorsAttn_Post"],  # FFA proxy via ventral visual
    "subcortical": ["Limbic_"],  # subcortical reward proxy
}

_atlas_cache: dict | None = None


def _load_atlas() -> dict:
    """Load Schaefer-1000 7-network parcellation for fsaverage5 via Nilearn."""
    global _atlas_cache
    if _atlas_cache is not None:
        return _atlas_cache

    from nilearn import datasets, surface

    atlas = datasets.fetch_atlas_schaefer_2018(
        n_rois=1000,
        yeo_networks=7,
        resolution_mm=1,
    )
    # Load surface labels for fsaverage5 (left + right hemisphere)
    # nilearn returns label images; we project to surface vertices
    fsaverage = datasets.fetch_surf_fsaverage("fsaverage5")

    lh_labels = surface.vol_to_surf(atlas.maps, fsaverage.pial_left)
    rh_labels = surface.vol_to_surf(atlas.maps, fsaverage.pial_right)

    # Concatenate: first 10242 = LH, next 10242 = RH
    all_labels = np.concatenate([lh_labels, rh_labels]).astype(int)  # (20484,)
    label_names: list[str] = atlas.labels  # list of parcel names

    # Ensure label names are strings (nilearn sometimes returns bytes)
    label_names_str = [l.decode() if isinstance(l, bytes) else str(l) for l in label_names]

    _atlas_cache = {
        "vertex_labels": all_labels,  # (20484,) int array, 0 = unlabeled
        "label_names": label_names_str,  # list[str] length ~1001 (incl. Background)
    }
    return _atlas_cache


def get_roi_vertex_indices(roi_name: str) -> np.ndarray:
    """
    Return the fsaverage5 vertex indices (0-indexed into 20484) that belong
    to the named ROI group.
    """
    atlas = _load_atlas()
    vertex_labels = atlas["vertex_labels"]
    label_names = atlas["label_names"]

    patterns = _PARCEL_PATTERNS.get(roi_name, [roi_name])
    matching_parcel_ids = []
    for idx, name in enumerate(label_names):
        if any(pat in name for pat in patterns):
            matching_parcel_ids.append(idx + 1)  # Schaefer parcels are 1-indexed

    if not matching_parcel_ids:
        raise ValueError(f"No Schaefer parcels matched ROI '{roi_name}' with patterns {patterns}")

    mask = np.isin(vertex_labels, matching_parcel_ids)
    return np.where(mask)[0]


def aggregate_roi_timeseries(
    predictions: np.ndarray,
    roi_name: str,
) -> np.ndarray:
    """
    Aggregate vertex predictions over an ROI to produce a 1D timeseries.

    Args:
        predictions: (n_timesteps, 20484) float32 array from TRIBE v2
        roi_name: name from _PARCEL_PATTERNS

    Returns:
        (n_timesteps,) float32 array — mean activation across ROI vertices
    """
    indices = get_roi_vertex_indices(roi_name)
    return predictions[:, indices].mean(axis=1)


def aggregate_all_rois(predictions: np.ndarray) -> dict[str, np.ndarray]:
    """
    Compute per-ROI mean timeseries for all defined ROIs.

    Returns dict: roi_name → (n_timesteps,) float32 array
    """
    return {name: aggregate_roi_timeseries(predictions, name) for name in _PARCEL_PATTERNS}


def compute_r_squared(a: np.ndarray, b: np.ndarray) -> float:
    """Pearson R² between two 1D timeseries (used for modality coherence)."""
    # Truncate to shorter length (ablation passes may differ by 1-2 timesteps)
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    corr = np.corrcoef(a[:n], b[:n])[0, 1]
    return float(corr**2)
