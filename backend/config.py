from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    app_name: str = "NeuroPeer"
    debug: bool = False

    # Database (Railway provides postgresql://, we need postgresql+asyncpg://)
    database_url: str = "postgresql+asyncpg://neuropeer:neuropeer@localhost:5432/neuropeer"

    @model_validator(mode="after")
    def fix_database_url(self):
        """Railway provides postgresql:// but asyncpg needs postgresql+asyncpg://"""
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # S3 / Storage (supports AWS S3, Backblaze B2, MinIO)
    s3_bucket: str = "NeuroPeer"
    b2_bucket: str = ""  # alias for s3_bucket
    s3_endpoint_url: str = ""  # e.g. https://s3.us-west-004.backblazeb2.com
    aws_access_key_id: str = ""
    b2_key_id: str = ""  # alias for aws_access_key_id
    aws_secret_access_key: str = ""
    b2_app_key: str = ""  # alias for aws_secret_access_key
    aws_region: str = "us-west-004"

    @model_validator(mode="after")
    def resolve_b2_aliases(self):
        """Map B2_* env vars to AWS_* fields for S3-compatible access."""
        if self.b2_key_id and not self.aws_access_key_id:
            self.aws_access_key_id = self.b2_key_id
        if self.b2_app_key and not self.aws_secret_access_key:
            self.aws_secret_access_key = self.b2_app_key
        if self.b2_bucket and not self.s3_bucket:
            self.s3_bucket = self.b2_bucket
        if self.s3_endpoint_url and not self.s3_endpoint_url.startswith("http"):
            self.s3_endpoint_url = f"https://{self.s3_endpoint_url}"
        return self

    # Server port (Railway assigns PORT dynamically)
    port: int = 8000

    # JWT
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # HuggingFace
    hf_token: str = ""
    tribe_model_id: str = "facebook/tribev2"

    # Transcription (ElevenLabs Scribe v2)
    elevenlabs_api_key: str = ""

    # AI Feedback (OpenRouter)
    openrouter_api_key: str = ""
    # Cheap model for simple naming tasks
    openrouter_cheap_model: str = "meta-llama/llama-3.2-1b-instruct:free"

    # TwelveLabs Marengo (multimodal video understanding)
    twelve_labs_api_key: str = ""
    twelvelabs_api_key: str = ""  # alias
    twelve_labs_index_id: str = ""
    twelvelabs_index_id: str = ""  # alias

    @model_validator(mode="after")
    def resolve_twelvelabs_aliases(self):
        """Support both TWELVE_LABS_API_KEY and TWELVELABS_API_KEY."""
        if self.twelve_labs_api_key and not self.twelvelabs_api_key:
            self.twelvelabs_api_key = self.twelve_labs_api_key
        if self.twelve_labs_index_id and not self.twelvelabs_index_id:
            self.twelvelabs_index_id = self.twelve_labs_index_id
        return self

    # Inference
    device: str = "cuda"  # cuda / cpu
    temp_dir: str = "/tmp/neuropeer"

    # Cortical scorer backend — selects which model produces the cortical
    # embedding (the 20,484-vertex fsaverage5 prediction). Swap via the
    # SCORER_BACKEND env var without touching pipeline code.
    #   "tribe-v2"   — Meta TRIBE v2 encoder (default, production)
    #   "orcle-nano" — in-house ORCLE Nano encoder (placeholder, not yet implemented)
    scorer_backend: str = "tribe-v2"

    # yt-dlp download settings
    # Path to a Netscape-format cookies.txt exported from your browser.
    # Required for Instagram, age-gated YouTube, and other auth-walled content.
    # Use Firefox (Chrome cookie extraction is broken since July 2024).
    ytdlp_cookies_file: str = ""  # e.g. /run/secrets/cookies.txt
    # Optional: override User-Agent sent to platforms. Leave empty for yt-dlp default.
    ytdlp_user_agent: str = ""
    # Max times to retry a download on rate-limit / transient error before failing.
    ytdlp_max_retries: int = 3
    # Seconds to wait between retries (doubles each attempt).
    ytdlp_retry_backoff: float = 15.0

    # Residential proxy for Instagram / Facebook (datacenter IPs are blocked by Meta).
    # Format: http://user:password@host:port  OR leave empty to disable.
    # Recommended provider: Oxylabs rotating residential ($8–15/GB).
    # Use rotating session IDs per request to avoid rate-limit accumulation.
    proxy_url: str = ""  # e.g. http://proxy.oxylabs.io:60000
    proxy_username: str = ""  # Oxylabs username (session ID appended automatically)
    proxy_password: str = ""  # Oxylabs password

    # Remote GPU inference
    # "runpod" — spin up a RunPod GPU pod per job (recommended, reliable A100 availability)
    # "datacrunch" — DataCrunch A100 spot instances (legacy, unreliable GPU supply)
    # "local" — run TRIBE v2 on the worker itself (requires local GPU)
    # "mock" — return random predictions (dev/test only)
    inference_backend: str = "runpod"  # runpod | datacrunch | local | mock

    # GPU compute backend selector for the RunPod provider.
    #   "pod"        — provision one RunPod pod per job (legacy, default; ~2-3 min cold start)
    #   "serverless" — submit to a RunPod Serverless endpoint (queue-driven autoscale + scale-to-zero)
    # Orthogonal to `inference_backend` above (which picks the provider). This
    # only refines *how* the runpod provider runs. Prefer the live-read helper
    # `gpu_backend()` (below) over this cached field so the flag can be flipped
    # without a worker restart — mirrors the api-key middleware's `_enforce()`.
    gpu_backend: str = "pod"  # pod | serverless

    # RunPod.io GPU pods (preferred)
    runpod_api_key: str = ""
    runpod_gpu_type: str = "NVIDIA A100 80GB PCIe"
    runpod_container_image: str = "pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel"
    runpod_boot_timeout: int = 600

    # RunPod Serverless (used when GPU_BACKEND=serverless)
    runpod_serverless_endpoint_id: str = ""
    # Max seconds to poll the serverless endpoint /status before giving up.
    runpod_serverless_timeout: int = 1800

    # DataCrunch.io (legacy fallback)
    datacrunch_client_id: str = ""
    datacrunch_client_secret: str = ""
    datacrunch_image: str = "ubuntu-24.04-cuda-12.8-open-docker"
    datacrunch_instance_type: str = "1A100.80G"
    datacrunch_ssh_key_ids: str = ""
    datacrunch_boot_timeout: int = 600

    class Config:
        env_file = ".env"


settings = Settings()


def gpu_backend() -> str:
    """Live-read the GPU backend selector (env first, then cached settings).

    Mirrors the api-key middleware's ``_enforce()`` pattern: reads ``GPU_BACKEND``
    from the environment on every call so the flag can be flipped on a running
    worker without a restart. Returns ``"serverless"`` or ``"pod"`` (default).
    """
    import os

    raw = os.getenv("GPU_BACKEND")
    value = (raw if raw is not None else settings.gpu_backend).strip().lower()
    return "serverless" if value == "serverless" else "pod"
