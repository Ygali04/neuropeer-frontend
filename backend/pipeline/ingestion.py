"""
Stage 1 — Stimulus Ingestion.

Downloads a video from a URL using yt-dlp with platform-aware strategies,
extracts audio via ffmpeg, transcribes via faster-whisper, and produces
the events DataFrame that TRIBE v2 expects.

Platform support:
  - Instagram Reels / Posts  (requires cookies for auth-walled content)
  - YouTube / YouTube Shorts (works anonymously; cookies help avoid bot blocks)
  - TikTok                   (works anonymously; cookies help for some regions)
  - Vimeo                    (anonymous for public videos)
  - Twitter / X              (anonymous for public videos)
  - Facebook                 (requires cookies)
  - Direct MP4/MOV/WebM URLs (bypasses yt-dlp entirely)

Cookie setup (required for Instagram):
  1. Install the "cookies.txt" browser extension (Firefox recommended — Chrome broken since July 2024)
  2. Log in to Instagram in your browser
  3. Export cookies to a file, mount it at the path in YTDLP_COOKIES_FILE
  4. The worker container reads this path at download time

Residential proxy (required for server IP blocks on Instagram):
  Datacenter / cloud IPs are banned by Meta. Use a rotating residential proxy.
  Set PROXY_URL, PROXY_USERNAME, PROXY_PASSWORD in .env.
  Recommended: Oxylabs rotating residential ($8-15/GB).
"""

from __future__ import annotations

import logging
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
from pydantic import BaseModel, ConfigDict

from backend.config import settings

logger = logging.getLogger(__name__)

# ── Platform detection ────────────────────────────────────────────────────────

_DIRECT_VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}

_PLATFORM_PATTERNS = {
    "instagram": re.compile(r"instagram\.com/(reel|p|tv)/"),
    "youtube": re.compile(r"(youtube\.com/watch|youtu\.be/|youtube\.com/shorts/)"),
    "tiktok": re.compile(r"tiktok\.com/"),
    "twitter": re.compile(r"(twitter\.com|x\.com)/\w+/status/"),
    "facebook": re.compile(r"(facebook\.com|fb\.watch)/"),
    "vimeo": re.compile(r"vimeo\.com/"),
}


def _detect_platform(url: str) -> str:
    for name, pattern in _PLATFORM_PATTERNS.items():
        if pattern.search(url):
            return name
    parsed = urlparse(url)
    ext = Path(parsed.path).suffix.lower()
    if ext in _DIRECT_VIDEO_EXTS:
        return "direct"
    return "generic"


# ── Custom error ──────────────────────────────────────────────────────────────


class DownloadError(RuntimeError):
    """Raised when yt-dlp fails. Carries the full stderr for debugging."""

    def __init__(self, message: str, stderr: str = ""):
        self.stderr = stderr
        # Keep stderr in the message so it surfaces in the job error field
        full = f"{message}\n\nyt-dlp stderr:\n{stderr.strip()}" if stderr.strip() else message
        super().__init__(full)


# ── Base yt-dlp command builder ───────────────────────────────────────────────


def _residential_proxy_url() -> str | None:
    """
    Build a rotating residential proxy URL with a fresh session ID per call.

    Oxylabs format:
      http://username-sessid_RANDOM:password@proxy.oxylabs.io:60000
    A new random session ID per request prevents accumulation of rate-limit
    strikes against a single session.

    Returns None if proxy is not configured.
    """
    if not settings.proxy_url or not settings.proxy_username:
        return None

    session_id = uuid.uuid4().hex[:12]
    username = f"{settings.proxy_username}-sessid_{session_id}"
    password = settings.proxy_password

    # Insert credentials into the proxy URL if it doesn't already have them
    if "@" not in settings.proxy_url:
        # http://host:port  →  http://user:pass@host:port
        scheme, rest = settings.proxy_url.split("://", 1)
        return f"{scheme}://{username}:{password}@{rest}"

    return settings.proxy_url


def _base_ytdlp_args(use_proxy: bool = False) -> list[str]:
    """
    Common yt-dlp flags shared across all platforms.

    Args:
        use_proxy: If True and proxy is configured, inject --proxy arg.
                   Pass True for Instagram/Facebook (blocked on datacenter IPs).
    """
    args: list[str] = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",  # suppress non-critical warnings
        "--no-part",  # don't leave .part files on failure
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--file-access-retries",
        "3",
        "--extractor-retries",
        "3",
        # Throttled download — helps avoid rate-limit bans on Meta platforms
        "--sleep-requests",
        "1",
        "--min-sleep-interval",
        "3",
        "--max-sleep-interval",
        "8",
        # Force IPv4 — avoids some IPv6 routing issues with residential proxies
        "--force-ipv4",
    ]

    # Residential proxy (required for Instagram/Facebook from cloud IPs)
    if use_proxy:
        proxy = _residential_proxy_url()
        if proxy:
            args += ["--proxy", proxy]
            logger.debug("Using residential proxy for download")
        else:
            logger.warning(
                "Proxy requested but PROXY_URL/PROXY_USERNAME not configured. "
                "Instagram downloads from cloud IPs will likely fail."
            )

    # Inject cookies file if configured (use Firefox export — Chrome broken since July 2024)
    if settings.ytdlp_cookies_file and Path(settings.ytdlp_cookies_file).exists():
        args += ["--cookies", settings.ytdlp_cookies_file]
    else:
        logger.debug("No cookies file at %s", settings.ytdlp_cookies_file)

    # Custom user-agent
    if settings.ytdlp_user_agent:
        args += ["--user-agent", settings.ytdlp_user_agent]

    return args


# ── Per-platform yt-dlp strategy lists ───────────────────────────────────────


def _strategies_for_platform(url: str, output_template: str, platform: str) -> list[list[str]]:
    """
    Return an ordered list of yt-dlp command variants to try.
    We try the best-quality format first, then progressively simpler fallbacks.
    Each inner list is a complete argv.
    """
    # Instagram and Facebook require a residential proxy — cloud/datacenter IPs are blocked by Meta
    needs_proxy = platform in ("instagram", "facebook")
    base = _base_ytdlp_args(use_proxy=needs_proxy)
    out = ["--output", output_template, "--merge-output-format", "mp4"]

    def _cmd(*extra: str) -> list[str]:
        return base + list(extra) + out + [url]

    if platform == "instagram":
        return [
            # Strategy 1: best quality — requires residential proxy + Firefox cookies
            _cmd(
                "--format",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--add-header",
                "referer:https://www.instagram.com/",
                "--add-header",
                "x-ig-app-id:936619743392459",
                "--extractor-args",
                "instagram:api_version=v1",
            ),
            # Strategy 2: single-stream mp4 (avoids merge issues)
            _cmd(
                "--format",
                "best[ext=mp4]/best",
                "--add-header",
                "referer:https://www.instagram.com/",
            ),
            # Strategy 3: generic best (last resort)
            _cmd("--format", "best"),
        ]

    elif platform == "youtube":
        return [
            # Strategy 1: best mp4 video + m4a audio (most compatible)
            _cmd(
                "--format",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            ),
            # Strategy 2: any best video + audio
            _cmd(
                "--format",
                "bestvideo+bestaudio/best",
            ),
            # Strategy 3: single best stream
            _cmd("--format", "best"),
            # Strategy 4: absolute fallback
            _cmd("--format", "worst"),
        ]

    elif platform == "tiktok":
        return [
            _cmd(
                "--format",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--add-header",
                "referer:https://www.tiktok.com/",
            ),
            _cmd("--format", "best"),
        ]

    elif platform == "twitter":
        return [
            _cmd("--format", "best[ext=mp4]/best"),
            _cmd("--format", "best"),
        ]

    elif platform == "facebook":
        # Facebook requires residential proxy + logged-in cookies
        return [
            _cmd(
                "--format",
                "best[ext=mp4]/best",
                "--add-header",
                "referer:https://www.facebook.com/",
            ),
            _cmd("--format", "best"),
        ]

    elif platform == "vimeo":
        return [
            _cmd(
                "--format",
                "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            ),
            _cmd("--format", "best"),
        ]

    else:
        # Generic / unknown platform — try three progressively simpler formats
        return [
            _cmd("--format", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"),
            _cmd("--format", "best[ext=mp4]/best"),
            _cmd("--format", "best"),
        ]


# ── Direct URL downloader (bypasses yt-dlp) ──────────────────────────────────


def _download_direct(url: str, output_dir: Path) -> Path:
    """Download a direct video file URL using urllib. No auth needed."""
    import urllib.request

    ext = Path(urlparse(url).path).suffix.lower() or ".mp4"
    output_path = output_dir / f"video{ext}"
    logger.info("Direct URL detected, downloading with urllib: %s", url)

    headers = {
        "User-Agent": (
            settings.ytdlp_user_agent or "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        )
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=120) as resp:
        output_path.write_bytes(resp.read())

    return output_path


# ── Instagram GraphQL fallback (no cookies / no proxy needed) ────────────────
#
# When yt-dlp fails for Instagram (IP blocks, missing cookies), this fallback
# queries Instagram's internal GraphQL endpoint directly — the same endpoint
# the web app uses. No authentication required for public Reels.
#
# Based on: Instagram web client reverse engineering (GraphQL query mimicry).
# doc_id and app_id may change if Instagram updates their web client.

_IG_SHORTCODE_RE = re.compile(r"instagram\.com/(?:[^/]+/)?(?:reel|p|tv)/([^/?#]+)")
_IG_GRAPHQL_URL = "https://www.instagram.com/graphql/query"
_IG_APP_ID = "936619743392459"
_IG_DOC_ID = "24368985919464652"
_IG_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _extract_instagram_shortcode(url: str) -> str | None:
    """Extract the shortcode from an Instagram Reel / Post URL."""
    match = _IG_SHORTCODE_RE.search(url)
    return match.group(1) if match else None


def _download_instagram_graphql(url: str, output_dir: Path) -> Path | None:
    """
    Download an Instagram Reel/Post video via GraphQL query mimicry.

    Sends a POST to Instagram's internal GraphQL endpoint with the reel's
    shortcode. The response contains direct CDN URLs for the video file.
    No cookies, no proxy, no API key needed for public content.

    Returns the downloaded video Path, or None if the approach fails.
    """
    import json
    import urllib.request

    shortcode = _extract_instagram_shortcode(url)
    if not shortcode:
        logger.debug("Could not extract Instagram shortcode from URL: %s", url)
        return None

    logger.info("Attempting Instagram GraphQL download for shortcode: %s", shortcode)

    # Step 1: GET instagram.com to obtain a CSRF token from the Set-Cookie header
    csrf_token = ""
    try:
        init_req = urllib.request.Request(
            "https://www.instagram.com/",
            headers={"User-Agent": _IG_USER_AGENT},
        )
        with urllib.request.urlopen(init_req, timeout=10) as resp:
            for cookie_header in resp.headers.get_all("Set-Cookie") or []:
                if "csrftoken=" in cookie_header:
                    csrf_token = cookie_header.split("csrftoken=")[1].split(";")[0]
                    break
    except Exception as exc:
        logger.debug("Failed to fetch CSRF token: %s", exc)

    if not csrf_token:
        # Use a placeholder — some requests work without a valid token
        csrf_token = "missing"
        logger.debug("No CSRF token obtained, proceeding with placeholder")

    # Step 2: POST to GraphQL endpoint
    payload = f'variables={{"shortcode":"{shortcode}"}}&doc_id={_IG_DOC_ID}'

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": _IG_USER_AGENT,
        "X-CSRFToken": csrf_token,
        "X-IG-App-ID": _IG_APP_ID,
        "Referer": "https://www.instagram.com/",
        "Origin": "https://www.instagram.com",
    }

    try:
        req = urllib.request.Request(
            _IG_GRAPHQL_URL,
            data=payload.encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        logger.warning("Instagram GraphQL request failed: %s", exc)
        return None

    # Step 3: Extract video URL from the GraphQL response
    video_url = _extract_video_url_from_graphql(data)
    if not video_url:
        logger.warning("No video URL found in GraphQL response for shortcode %s", shortcode)
        return None

    # Step 4: Download the video file from the CDN URL
    output_path = output_dir / "video.mp4"
    try:
        dl_req = urllib.request.Request(video_url, headers={"User-Agent": _IG_USER_AGENT})
        with urllib.request.urlopen(dl_req, timeout=120) as resp:
            output_path.write_bytes(resp.read())
        logger.info("Instagram GraphQL download succeeded: %s", output_path)
        return output_path
    except Exception as exc:
        logger.warning("Failed to download video from CDN URL: %s", exc)
        return None


def _extract_video_url_from_graphql(data: dict) -> str | None:
    """
    Walk the GraphQL response JSON to find the best video URL.

    Instagram's GraphQL endpoint returns different structures depending on
    the doc_id and content type. Known response shapes:

    1. xdt_api__v1__media__shortcode__web_info → items[] → video_versions[]
       (most common for Reels and video posts, as of 2024+)
    2. xdt_shortcode_media → video_url / video_versions[]
       (older format, still used by some doc_ids)
    3. shortcode_media → video_url / edge_sidecar_to_children
       (legacy format)
    """
    try:
        data_root = data.get("data", {})

        # ── Shape 1: xdt_api__v1__media__shortcode__web_info (current) ───
        web_info = data_root.get("xdt_api__v1__media__shortcode__web_info")
        if web_info:
            items = web_info.get("items") or []
            for item in items:
                url = _video_url_from_item(item)
                if url:
                    return url
                # Check carousel items
                carousel = item.get("carousel_media") or []
                for ci in carousel:
                    url = _video_url_from_item(ci)
                    if url:
                        return url

        # ── Shape 2: xdt_shortcode_media / shortcode_media (fallback) ────
        for key in ("xdt_shortcode_media", "shortcode_media"):
            media = data_root.get(key)
            if not media:
                continue
            url = _video_url_from_item(media)
            if url:
                return url
            # Carousel edge format
            edges = (media.get("edge_sidecar_to_children") or {}).get("edges") or []
            for edge in edges:
                node = edge.get("node") or {}
                if node.get("is_video"):
                    url = _video_url_from_item(node)
                    if url:
                        return url

        return None
    except (KeyError, TypeError, IndexError):
        return None


def _video_url_from_item(item: dict) -> str | None:
    """Extract the best video URL from a single media item dict."""
    # Direct video_url field
    if item.get("video_url"):
        return item["video_url"]

    # video_versions array — pick highest resolution
    versions = item.get("video_versions") or []
    if versions:
        best = max(versions, key=lambda v: (v.get("width", 0) or 0) * (v.get("height", 0) or 0))
        return best.get("url")

    return None


# ── Main download function ────────────────────────────────────────────────────


def download_video(url: str, output_dir: Path) -> Path:
    """
    Download a video from any supported URL.

    Tries platform-specific yt-dlp strategies in order, with exponential
    backoff on rate-limit errors. Raises DownloadError with full stderr
    if all strategies fail.
    """
    platform = _detect_platform(url)
    logger.info("Detected platform '%s' for URL: %s", platform, url)

    # Bypass yt-dlp for direct video files
    if platform == "direct":
        return _download_direct(url, output_dir)

    output_template = str(output_dir / "video.%(ext)s")
    strategies = _strategies_for_platform(url, output_template, platform)

    last_stderr = ""
    last_returncode = 0

    for attempt_i, cmd in enumerate(strategies):
        # Retry loop within each strategy for transient / rate-limit errors
        for retry in range(settings.ytdlp_max_retries):
            logger.info(
                "Download attempt strategy=%d retry=%d platform=%s url=%s",
                attempt_i,
                retry,
                platform,
                url,
            )
            result = subprocess.run(cmd, capture_output=True, text=True)
            last_stderr = result.stderr
            last_returncode = result.returncode

            if result.returncode == 0:
                # Success — find the output file
                for path in output_dir.glob("video.*"):
                    if path.suffix.lower() not in {".part", ".ytdl"}:
                        logger.info("Download succeeded: %s", path)
                        return path
                # yt-dlp exited 0 but file not found (edge case)
                logger.warning("yt-dlp exited 0 but no video file found, trying next strategy")
                break

            stderr_lower = result.stderr.lower()

            # Detect rate-limit or transient errors → retry with backoff
            is_rate_limit = any(
                kw in stderr_lower
                for kw in [
                    "rate-limit",
                    "rate limit",
                    "429",
                    "too many requests",
                    "temporarily unavailable",
                    "please wait",
                    "try again later",
                    "http error 429",
                    "http error 503",
                ]
            )
            is_network = any(
                kw in stderr_lower
                for kw in [
                    "connection reset",
                    "connection refused",
                    "timed out",
                    "network error",
                    "urlopen error",
                ]
            )

            if is_rate_limit or is_network:
                wait = settings.ytdlp_retry_backoff * (2**retry)
                reason = "rate-limit" if is_rate_limit else "network error"
                logger.warning(
                    "yt-dlp %s on strategy %d, retry %d/%d — waiting %.0fs",
                    reason,
                    attempt_i,
                    retry + 1,
                    settings.ytdlp_max_retries,
                    wait,
                )
                time.sleep(wait)
                continue

            # Detect auth / login wall
            # Note: "format is not available" is a format error, NOT an auth error
            is_format_error = "format" in stderr_lower and "not available" in stderr_lower
            is_auth = not is_format_error and any(
                kw in stderr_lower
                for kw in [
                    "login required",
                    "private",
                    "content is not available",
                    "requested content is not available",
                    "cookies",
                    "sign in",
                    "authentication required",
                    "403 forbidden",
                ]
            )
            if is_auth:
                # For Instagram, don't raise immediately — let it exhaust strategies
                # so we can try the GraphQL fallback after all yt-dlp strategies fail
                if platform != "instagram":
                    _raise_auth_error(platform, result.stderr)
                logger.info(
                    "Instagram auth error on strategy %d, will try remaining strategies + GraphQL fallback",
                    attempt_i,
                )

            # Other hard failure — move to next strategy without sleeping
            logger.debug(
                "yt-dlp strategy %d failed (rc=%d), moving to next strategy. stderr: %s",
                attempt_i,
                result.returncode,
                result.stderr[-400:],
            )
            break  # inner retry loop

    # All yt-dlp strategies exhausted — try platform-specific fallbacks
    if platform == "instagram":
        logger.info("All yt-dlp strategies failed for Instagram, trying GraphQL fallback")
        graphql_path = _download_instagram_graphql(url, output_dir)
        if graphql_path:
            return graphql_path

    raise DownloadError(
        f"All download strategies failed for platform '{platform}'. "
        f"Last exit code: {last_returncode}. " + _auth_hint(platform),
        stderr=last_stderr,
    )


def _auth_hint(platform: str) -> str:
    hints = {
        "instagram": (
            "Instagram download failed (yt-dlp + GraphQL fallback both exhausted). "
            "For best results: (1) export Firefox cookies and set YTDLP_COOKIES_FILE, "
            "(2) configure a residential proxy (PROXY_URL/PROXY_USERNAME/PROXY_PASSWORD). "
            "The content may also be private or region-blocked."
        ),
        "facebook": (
            "Facebook requires authentication. "
            "Export cookies from a logged-in Facebook session and set YTDLP_COOKIES_FILE."
        ),
        "youtube": (
            "YouTube may be rate-limiting the worker IP. "
            "Try setting YTDLP_COOKIES_FILE to a cookies.txt exported from a logged-in YouTube session."
        ),
    }
    return hints.get(platform, "Try setting YTDLP_COOKIES_FILE to a Netscape-format cookies.txt from your browser.")


def _raise_auth_error(platform: str, stderr: str) -> None:
    raise DownloadError(
        f"Authentication required for {platform}. {_auth_hint(platform)}",
        stderr=stderr,
    )


# ── Audio extraction ──────────────────────────────────────────────────────────


def extract_audio(video_path: Path, output_dir: Path) -> Path:
    """Extract audio track as 16 kHz mono WAV via ffmpeg."""
    audio_path = output_dir / "audio.wav"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(video_path),
        "-ac",
        "1",  # mono
        "-ar",
        "16000",  # 16 kHz — Whisper / Wav2Vec standard
        "-vn",  # no video stream
        "-loglevel",
        "error",
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extraction failed:\n{result.stderr}")
    return audio_path


# ── Video metadata ────────────────────────────────────────────────────────────


def get_video_duration(video_path: Path) -> tuple[float, float]:
    """Return (duration_seconds, fps) via ffprobe."""
    import json

    cmd = [
        "ffprobe",
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_streams",
        str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed:\n{result.stderr}")

    info = json.loads(result.stdout)
    duration = 0.0
    fps = 25.0
    for stream in info.get("streams", []):
        if stream.get("codec_type") == "video":
            duration = float(stream.get("duration", 0))
            r_frame_rate = stream.get("r_frame_rate", "25/1")
            num, den = r_frame_rate.split("/")
            fps = float(num) / float(den)
            break

    if duration == 0:
        # Fallback: try format-level duration
        cmd2 = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            str(video_path),
        ]
        r2 = subprocess.run(cmd2, capture_output=True, text=True)
        if r2.returncode == 0:
            fmt = json.loads(r2.stdout).get("format", {})
            duration = float(fmt.get("duration", 0))

    return duration, fps


# ── Transcription ─────────────────────────────────────────────────────────────


def transcribe_audio(audio_path: Path) -> list[dict]:
    """
    Transcribe audio using ElevenLabs Scribe v2 with word-level timestamps.
    Returns list of {"word": str, "start": float, "end": float}.
    """
    from elevenlabs.client import ElevenLabs

    if not settings.elevenlabs_api_key:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is required for transcription. Get one at https://elevenlabs.io/app/settings/api-keys"
        )

    client = ElevenLabs(api_key=settings.elevenlabs_api_key)
    logger.info("Transcribing with ElevenLabs Scribe v2: %s", audio_path.name)

    with open(audio_path, "rb") as f:
        result = client.speech_to_text.convert(
            file=f,
            model_id="scribe_v2",
            tag_audio_events=False,
            timestamps_granularity="word",
        )

    words = []
    for chunk in result.words:
        text = chunk.text.strip()
        if not text:
            continue
        words.append(
            {
                "word": text,
                "start": chunk.start,
                "end": chunk.end,
            }
        )

    logger.info("Transcription complete: %d words", len(words))
    return words


# ── Events DataFrame ──────────────────────────────────────────────────────────


def build_events_dataframe(
    video_path: Path,
    audio_path: Path,
    transcript_words: list[dict],
    duration_seconds: float,
    fps: float,
) -> pd.DataFrame:
    """
    Build the events DataFrame that TRIBE v2's get_events_dataframe() expects.

    One row per second (1 Hz, matching fMRI TR). Columns:
      onset, duration, video_path, audio_path, word, word_onset, word_offset
    """
    n_timesteps = int(duration_seconds)
    rows = []

    # Build a quick lookup: second → active word
    word_at_second: dict[int, str] = {}
    for w in transcript_words:
        for t in range(int(w["start"]), int(w["end"]) + 1):
            if t not in word_at_second:
                word_at_second[t] = w["word"]

    for t in range(n_timesteps):
        rows.append(
            {
                "onset": float(t),
                "duration": 1.0,
                "video_path": str(video_path),
                "audio_path": str(audio_path),
                "word": word_at_second.get(t, ""),
                "word_onset": float(t),
                "word_offset": float(t + 1),
            }
        )

    return pd.DataFrame(rows)


# ── Top-level entry point ─────────────────────────────────────────────────────


class IngestedMedia(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    video_path: Path
    audio_path: Path
    transcript_words: list[dict]
    duration_seconds: float
    fps: float


def ingest(url: str, work_dir: Path | None = None) -> tuple[IngestedMedia, pd.DataFrame]:
    """
    Full ingestion pipeline for a single video URL.

    Returns (IngestedMedia, events_dataframe).
    The work_dir is NOT cleaned up — the caller owns cleanup.
    Raises DownloadError with full yt-dlp stderr on download failure.
    """
    if work_dir is None:
        work_dir = Path(tempfile.mkdtemp(prefix="neuropeer_", dir=settings.temp_dir))
    work_dir.mkdir(parents=True, exist_ok=True)

    video_path = download_video(url, work_dir)
    audio_path = extract_audio(video_path, work_dir)
    duration, fps = get_video_duration(video_path)
    transcript_words = transcribe_audio(audio_path)
    events_df = build_events_dataframe(video_path, audio_path, transcript_words, duration, fps)

    return IngestedMedia(
        video_path=video_path,
        audio_path=audio_path,
        transcript_words=transcript_words,
        duration_seconds=duration,
        fps=fps,
    ), events_df
