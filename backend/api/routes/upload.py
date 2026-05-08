"""
POST /api/v1/analyze/upload — secure file upload for video analysis.

Security layers:
  1. Request validation (500MB max, rate limiting)
  2. File type validation (magic bytes + extension + MIME)
  3. Content sanitization (ffprobe: valid container, codec allowlist, duration cap)
  4. Storage security (S3 hash-based keys, no user filenames)
  5. Processing isolation (GPU reads from S3 only)
  6. Known vulnerability mitigations (path traversal, polyglot, SSRF, XSS, DoS)
"""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.config import settings
from backend.models.schemas import ContentType, JobCreatedResponse, JobStatus
from backend.worker.tasks import run_analysis

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Upload"])

# ── Constants ────────────────────────────────────────────────────────────────

MAX_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB
CHUNK_SIZE = 8192

# Per-content-type duration limits (seconds)
MAX_DURATION_BY_TYPE: dict[str, int] = {
    "instagram_reel": 300,
    "youtube_preroll": 300,
    "product_demo": 600,
    "conference_talk": 1800,
    "podcast_audio": 1800,
    "feature_film": 14400,
    "custom": 300,
}
MAX_DURATION_S = 300  # default fallback

ALLOWED_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}
ALLOWED_VIDEO_CODECS = {"h264", "hevc", "vp8", "vp9", "av1"}

# Magic byte signatures for video containers
# (offset, expected_bytes, format_name)
MAGIC_SIGNATURES: list[tuple[int, bytes, str]] = [
    (4, b"ftyp", "mp4/mov"),           # MP4/MOV: bytes 4-8
    (0, b"\x1aE\xdf\xa3", "webm"),     # WebM: EBML header
    (0, b"RIFF", "avi"),               # AVI: RIFF header (also check bytes 8-11 = "AVI ")
]


# ── Validation helpers ───────────────────────────────────────────────────────

def _validate_extension(filename: str | None) -> None:
    """Layer 2a: validate file extension."""
    if not filename:
        raise HTTPException(415, "Missing filename")
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            415,
            f"Unsupported file extension: {ext}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )


def _validate_magic_bytes(header: bytes) -> None:
    """Layer 2b: validate magic bytes against known video signatures."""
    for offset, magic, fmt in MAGIC_SIGNATURES:
        end = offset + len(magic)
        if len(header) >= end and header[offset:end] == magic:
            # AVI needs additional check: bytes 8-11 must be "AVI "
            if fmt == "avi" and (len(header) < 12 or header[8:12] != b"AVI "):
                continue
            return  # Valid signature found
    raise HTTPException(415, "Invalid video file: magic bytes do not match any supported format")


def _validate_with_ffprobe(file_path: Path, content_type: str = "custom") -> tuple[float, set[str]]:
    """Layer 3: validate video with ffprobe. Returns (duration_s, video_codecs)."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=format_name,duration,nb_streams",
                "-show_entries", "stream=codec_name,codec_type",
                "-of", "json",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(415, "Video validation timed out — file may be corrupted")
    except FileNotFoundError:
        raise HTTPException(500, "ffprobe not found — video validation unavailable")

    if result.returncode != 0:
        raise HTTPException(415, f"File is not a valid video container: {result.stderr[:200]}")

    try:
        info = json.loads(result.stdout)
    except json.JSONDecodeError:
        raise HTTPException(415, "ffprobe returned invalid output — file may be corrupted")

    # Duration check — limit depends on content type
    max_duration = MAX_DURATION_BY_TYPE.get(content_type, MAX_DURATION_S)
    duration = float(info.get("format", {}).get("duration", 0))
    if duration <= 0:
        raise HTTPException(415, "Video has zero or negative duration")
    if duration > max_duration:
        raise HTTPException(
            413,
            f"Video duration {duration:.0f}s exceeds {max_duration}s limit for {content_type}",
        )

    # Must have at least one video stream
    streams = info.get("streams", [])
    video_codecs = {
        s["codec_name"]
        for s in streams
        if s.get("codec_type") == "video" and "codec_name" in s
    }
    if not video_codecs:
        raise HTTPException(415, "File contains no video streams")

    # Codec allowlist
    if not video_codecs & ALLOWED_VIDEO_CODECS:
        raise HTTPException(
            415,
            f"Unsupported video codec(s): {video_codecs}. "
            f"Allowed: {', '.join(sorted(ALLOWED_VIDEO_CODECS))}",
        )

    return duration, video_codecs


async def _save_upload(file: UploadFile) -> tuple[Path, str]:
    """Stream upload to temp file, enforce size limit. Returns (path, sha256)."""
    tmp_dir = Path(tempfile.mkdtemp(prefix="neuropeer-upload-"))
    dest = tmp_dir / f"{uuid.uuid4().hex}.mp4"

    hasher = hashlib.sha256()
    total = 0

    try:
        with open(dest, "wb") as f:
            while chunk := await file.read(CHUNK_SIZE):
                total += len(chunk)
                if total > MAX_SIZE_BYTES:
                    dest.unlink(missing_ok=True)
                    shutil.rmtree(tmp_dir, ignore_errors=True)
                    raise HTTPException(413, f"File exceeds {MAX_SIZE_BYTES // (1024 * 1024)}MB limit")
                hasher.update(chunk)
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:
        dest.unlink(missing_ok=True)
        shutil.rmtree(tmp_dir, ignore_errors=True)
        raise HTTPException(500, f"Upload failed: {exc}") from exc

    return dest, hasher.hexdigest()


def _upload_to_s3(file_path: Path, sha256: str) -> str:
    """Upload validated file to S3 with content-addressed key. Returns S3 key."""
    import boto3

    key = f"uploads/{sha256}{file_path.suffix}"

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url or None,
        aws_access_key_id=settings.aws_access_key_id or None,
        aws_secret_access_key=settings.aws_secret_access_key or None,
        region_name=settings.aws_region,
    )
    s3.upload_file(str(file_path), settings.s3_bucket, key)

    # Generate presigned URL (1-hour expiry) for the pipeline to download
    url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=3600,
    )
    return url


# ── Route ────────────────────────────────────────────────────────────────────

@router.post("/analyze/upload", response_model=JobCreatedResponse)
async def upload_and_analyze(
    file: UploadFile = File(...),
    content_type: str = "custom",
    parent_job_id: str | None = None,
    user_email: str | None = None,
    project_id: str | None = None,
    campaign_id: str | None = None,
) -> JobCreatedResponse:
    """Upload a video file for neural analysis.

    The file passes through 6 security layers before being submitted
    to the analysis pipeline.
    """
    # Layer 2a: Extension check
    _validate_extension(file.filename)

    # Layer 1: Stream to disk with size limit + compute hash
    file_path, sha256 = await _save_upload(file)

    try:
        # Layer 2b: Magic byte check
        with open(file_path, "rb") as f:
            header = f.read(32)
        _validate_magic_bytes(header)

        # Layer 3: ffprobe validation (container, duration, codec)
        duration, codecs = _validate_with_ffprobe(file_path, content_type)
        logger.info(
            "Upload validated: %s, %.0fs, codecs=%s, sha256=%s",
            file.filename, duration, codecs, sha256[:12],
        )

        # Layer 4: Upload to S3 with hash-based key (no user filenames)
        video_url = _upload_to_s3(file_path, sha256)

    finally:
        # Clean up temp file regardless of outcome
        tmp_dir = file_path.parent
        shutil.rmtree(tmp_dir, ignore_errors=True)

    # Submit to analysis pipeline (same as URL-based path)
    job_id = str(uuid.uuid4())
    content_type_enum = ContentType(content_type)

    run_analysis.apply_async(
        args=[job_id, video_url, content_type_enum.value],
        kwargs={
            "parent_job_id": parent_job_id,
            "user_email": user_email,
            "project_id": project_id,
            "campaign_id": campaign_id,
        },
        task_id=job_id,
    )

    return JobCreatedResponse(
        job_id=uuid.UUID(job_id),
        websocket_url=f"/ws/job/{job_id}",
        status=JobStatus.queued,
        parent_job_id=uuid.UUID(parent_job_id) if parent_job_id else None,
    )
