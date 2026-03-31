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
    # For B2: endpoint_url=https://s3.us-west-004.backblazeb2.com, region=us-west-004
    s3_bucket: str = "NeuroPeer"
    s3_endpoint_url: str = ""  # leave empty for AWS, set for B2/MinIO
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-west-004"

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

    # Inference
    device: str = "cuda"  # cuda / cpu
    temp_dir: str = "/tmp/neuropeer"

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

    # Remote GPU inference (DataCrunch.io A100 spot instances)
    # Set to "local" to run TRIBE v2 on the worker itself (requires local GPU).
    # Set to "datacrunch" to spin up an A100 spot instance per job.
    inference_backend: str = "local"  # local | datacrunch

    # DataCrunch.io OAuth2 credentials (only needed when inference_backend = "datacrunch")
    # Generate at the DataCrunch dashboard → API credentials
    datacrunch_client_id: str = ""
    datacrunch_client_secret: str = ""
    # OS image with CUDA pre-installed (bare image — deps installed via startup script)
    datacrunch_image: str = "ubuntu-24.04-cuda-12.8-open-docker"
    # Instance type: 1A100.80G ($0.45/h spot), 1A100.40G ($0.25/h spot)
    datacrunch_instance_type: str = "1A100.80G"
    # Comma-separated SSH key IDs from DataCrunch dashboard (required for instance creation)
    datacrunch_ssh_key_ids: str = ""
    # Max seconds to wait for spot instance to boot and complete inference
    datacrunch_boot_timeout: int = 600

    class Config:
        env_file = ".env"


settings = Settings()
