from __future__ import annotations

from enum import Enum
from uuid import UUID

from pydantic import BaseModel, field_validator


class ContentType(str, Enum):
    instagram_reel = "instagram_reel"
    product_demo = "product_demo"
    youtube_preroll = "youtube_preroll"
    conference_talk = "conference_talk"
    podcast_audio = "podcast_audio"
    custom = "custom"


class JobStatus(str, Enum):
    queued = "queued"
    downloading = "downloading"
    transcribing = "transcribing"
    inferring = "inferring"
    aggregating = "aggregating"
    scoring = "scoring"
    complete = "complete"
    error = "error"


# --- Request schemas ---


class AnalyzeRequest(BaseModel):
    url: str
    content_type: ContentType = ContentType.custom
    label: str | None = None  # user-provided name for A/B labeling

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        # Accept http/https URLs and direct video links
        if not (v.startswith("http://") or v.startswith("https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class CompareRequest(BaseModel):
    job_ids: list[UUID]

    @field_validator("job_ids")
    @classmethod
    def validate_count(cls, v: list[UUID]) -> list[UUID]:
        if len(v) < 2:
            raise ValueError("At least 2 job IDs required for comparison")
        if len(v) > 5:
            raise ValueError("Maximum 5 videos can be compared at once")
        return v


# --- Response schemas ---


class JobCreatedResponse(BaseModel):
    job_id: UUID
    websocket_url: str
    status: JobStatus = JobStatus.queued


class ProgressEvent(BaseModel):
    job_id: str
    status: JobStatus
    progress: float  # 0.0 – 1.0
    message: str


class MetricScore(BaseModel):
    name: str
    score: float  # 0–100
    raw_value: float  # raw computation output
    description: str
    brain_region: str
    gtm_proxy: str


class KeyMoment(BaseModel):
    timestamp: float  # seconds
    type: str  # "best_hook" | "peak_engagement" | "emotional_peak" | "dropoff_risk" | "recovery"
    label: str
    score: float


class ModalityContribution(BaseModel):
    timestamp: float
    visual: float
    audio: float
    text: float


class NeuralScoreBreakdown(BaseModel):
    total: float  # 0–100, weighted composite
    hook_score: float
    sustained_attention: float
    emotional_resonance: float
    memory_encoding: float
    aesthetic_quality: float
    cognitive_accessibility: float


class AnalysisResult(BaseModel):
    job_id: UUID
    url: str
    content_type: ContentType
    duration_seconds: float
    neural_score: NeuralScoreBreakdown
    metrics: list[MetricScore]
    attention_curve: list[float]  # per-second, length = duration
    emotional_arousal_curve: list[float]  # per-second
    cognitive_load_curve: list[float]  # per-second
    key_moments: list[KeyMoment]
    modality_breakdown: list[ModalityContribution]


class BrainMapFrame(BaseModel):
    timestamp: float
    vertex_activations: list[float]  # length 20484


class ComparisonResult(BaseModel):
    job_ids: list[UUID]
    labels: list[str]
    neural_scores: list[NeuralScoreBreakdown]
    winner_job_id: UUID
    recommendation: str
    delta_metrics: dict[str, list[float]]  # metric_name -> [score_per_video]
