"""
TwelveLabs Marengo 2.7 client — per-second multimodal video understanding.

Provides the "eyes and ears" that tell the VLM report generator WHAT is in
each frame, complementing TRIBE v2 which tells WHERE the neural problems are.

API docs: https://docs.twelvelabs.io/reference/api-reference
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
from pydantic import BaseModel, Field

from backend.config import settings

logger = logging.getLogger(__name__)

TWELVELABS_BASE = "https://api.twelvelabs.io/v1.3"


class PerSecondAnalysis(BaseModel):
    """Visual + audio description for one second of video."""

    second: float
    objects: list[str] = Field(default_factory=list)
    camera: str = "static"
    framing: str = "medium"
    lighting: str = ""
    audio: dict[str, Any] = Field(default_factory=dict)
    text_on_screen: str = ""
    description: str = ""


class MarengoResult(BaseModel):
    """Complete Marengo analysis for one video."""

    video_id: str
    duration_s: float
    per_second: list[PerSecondAnalysis] = Field(default_factory=list)
    full_description: str = ""
    transcript: str = ""


class TwelveLabsClient:
    """Async client for TwelveLabs Marengo 2.7 API."""

    def __init__(self, api_key: str | None = None, index_id: str | None = None):
        self.api_key = api_key or settings.twelvelabs_api_key
        self.index_id = index_id or settings.twelvelabs_index_id
        self._client: httpx.AsyncClient | None = None

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key)

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=TWELVELABS_BASE,
                headers={"x-api-key": self.api_key},
                timeout=300.0,
            )
        return self._client

    async def close(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    async def index_video(self, video_url: str) -> str:
        """Submit a video for indexing via /tasks endpoint. Returns video_id.

        Downloads the video to a temp file first, then uploads via multipart
        form to /tasks (the task-based upload that works with all index types).
        """
        import tempfile
        from pathlib import Path

        client = await self._get_client()

        # Download video to temp file
        logger.info("TwelveLabs: downloading video from %s", video_url)
        async with httpx.AsyncClient(timeout=120.0) as dl:
            dl_resp = await dl.get(video_url)
            dl_resp.raise_for_status()

        suffix = ".mp4"
        if ".webm" in video_url:
            suffix = ".webm"
        elif ".mov" in video_url:
            suffix = ".mov"

        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(dl_resp.content)
            tmp_path = tmp.name

        try:
            # Upload via /tasks multipart endpoint
            with open(tmp_path, "rb") as f:
                resp = await client.post(
                    "/tasks",
                    data={
                        "index_id": self.index_id,
                        "provide_transcription": "true",
                    },
                    files={"video_file": (f"video{suffix}", f, "video/mp4")},
                    timeout=120.0,
                )
            resp.raise_for_status()
            data = resp.json()
            video_id = data.get("_id") or data.get("video_id", "")
            logger.info("TwelveLabs: video task created, id=%s", video_id)
            return video_id
        finally:
            Path(tmp_path).unlink(missing_ok=True)

    async def wait_for_indexing(
        self, video_id: str, poll_interval: float = 5.0, timeout: float = 600.0
    ) -> None:
        """Poll /tasks/{id} until video indexing is complete."""
        client = await self._get_client()
        elapsed = 0.0
        while elapsed < timeout:
            resp = await client.get(f"/tasks/{video_id}")
            resp.raise_for_status()
            status = resp.json().get("status", "")
            if status == "ready":
                logger.info("TwelveLabs: video %s ready", video_id)
                return
            if status == "failed":
                error = resp.json().get("error", "unknown")
                raise RuntimeError(f"TwelveLabs indexing failed: {error}")
            await asyncio.sleep(poll_interval)
            elapsed += poll_interval
        raise TimeoutError(f"TwelveLabs indexing timed out after {timeout}s")

    async def generate_text(self, video_id: str, prompt: str) -> str:
        """Generate text from video using Marengo's generate endpoint."""
        client = await self._get_client()
        resp = await client.post(
            "/generate",
            json={"video_id": video_id, "prompt": prompt},
        )
        resp.raise_for_status()
        return resp.json().get("data", "")

    async def search_moments(
        self, query: str, video_id: str
    ) -> list[dict[str, Any]]:
        """Search for specific moments in an indexed video."""
        client = await self._get_client()
        resp = await client.post(
            "/search",
            json={
                "index_id": self.index_id,
                "query": query,
                "search_options": ["visual", "audio"],
                "filter": {"id": [video_id]},
            },
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def analyze_per_second(
        self, video_id: str, duration_s: float
    ) -> list[PerSecondAnalysis]:
        """Get structured visual + audio description for each second of video.

        Uses Marengo's generate endpoint with a structured JSON prompt.
        Falls back to a simpler description if JSON parsing fails.
        """
        prompt = (
            "Analyze this video second by second. For each second, describe:\n"
            "1. Objects visible (with positions: center, left-third, right-third)\n"
            "2. Camera motion (static, dolly left/right, push in, pull back, pan, tilt, handheld)\n"
            "3. Framing (extreme-close, close, medium, full, wide)\n"
            "4. Lighting state (key direction, color temperature, rim light)\n"
            "5. Audio: music level (loud/medium/quiet/silent), voiceover active (true/false), SFX events\n"
            "6. Any text visible on screen\n\n"
            "Format as JSON array, one entry per second:\n"
            '[{"second": 0, "objects": ["product bottle (center)"], '
            '"camera": "static", "framing": "close", "lighting": "warm key 3/4", '
            '"audio": {"music": "medium", "vo": true, "sfx": "none"}, '
            '"text_on_screen": ""}]'
        )
        raw = await self.generate_text(video_id, prompt)

        try:
            parsed = json.loads(raw)
            return [PerSecondAnalysis(**entry) for entry in parsed]
        except (json.JSONDecodeError, TypeError):
            logger.warning("TwelveLabs: JSON parse failed for per-second analysis, using fallback")
            return [
                PerSecondAnalysis(second=float(s), description=raw)
                for s in range(int(duration_s))
            ]

    async def get_full_description(self, video_id: str) -> str:
        """Get a complete narrative description of the video."""
        return await self.generate_text(
            video_id,
            "Describe this video in detail: what objects appear, how the camera moves, "
            "what the lighting is like, what audio you hear (music, speech, effects), "
            "and any text overlays. Be specific about timestamps.",
        )

    async def analyze_scene(self, video_id: str, prompt: str) -> str:
        """Analyze a video using the Pegasus /analyze streaming endpoint.

        POSTs to /analyze and processes the streaming response, concatenating
        all text_generation events into a single string.
        """
        client = await self._get_client()
        result_parts: list[str] = []

        async with client.stream(
            "POST",
            "/analyze",
            json={"video_id": video_id, "prompt": prompt},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("event_type") == "text_generation":
                    result_parts.append(event.get("text", ""))

        full_text = "".join(result_parts)
        logger.info("TwelveLabs analyze_scene: got %d chars for video %s", len(full_text), video_id)
        return full_text

    async def analyze_per_scene(self, video_id: str, duration_s: float) -> str:
        """Get a shot-by-shot film-editor breakdown using Pegasus /analyze.

        Returns a detailed textual analysis covering timestamps, characters,
        camera work, audio, lighting, mood, and editing pace.
        """
        prompt = (
            f"You are a professional film editor analyzing a {duration_s:.0f}-second video. "
            "Provide a detailed shot-by-shot breakdown with the following for each shot:\n"
            "1. TIMESTAMP: Exact start and end time (e.g., [00:00-00:05])\n"
            "2. CHARACTERS: Who is visible — describe by name if known, otherwise by appearance "
            "(e.g., 'woman in red dress', 'older man with glasses')\n"
            "3. CAMERA: Shot type (close-up, medium, wide, extreme close-up), movement "
            "(static, dolly, pan, tilt, handheld, Steadicam, crane), and angle (eye-level, "
            "low-angle, high-angle, Dutch)\n"
            "4. AUDIO: Dialogue (quote key lines), music (genre, tempo, dynamics), ambient sound, "
            "sound effects, silence\n"
            "5. LIGHTING: Key light direction, color temperature, contrast ratio, practical lights, "
            "motivated vs unmotivated sources\n"
            "6. MOOD/TONE: Emotional register of the shot\n"
            "7. EDITING PACE: Cut duration, transition type (hard cut, dissolve, wipe, match cut), "
            "rhythm relative to surrounding shots\n\n"
            "Be precise with timestamps. Name or describe every character consistently. "
            "Note any continuity issues, focus pulls, or rack focus moments."
        )
        return await self.analyze_scene(video_id, prompt)

    async def analyze_video(self, video_url: str, duration_s: float) -> MarengoResult:
        """Full analysis pipeline: index → wait → per-second + full description.

        This is the main entry point called by the fusion layer.
        """
        video_id = await self.index_video(video_url)
        await self.wait_for_indexing(video_id)

        per_second, full_desc = await asyncio.gather(
            self.analyze_per_second(video_id, duration_s),
            self.get_full_description(video_id),
        )

        return MarengoResult(
            video_id=video_id,
            duration_s=duration_s,
            per_second=per_second,
            full_description=full_desc,
        )


def get_twelvelabs_client() -> TwelveLabsClient | None:
    """Factory: returns a configured client or None if API key is missing."""
    client = TwelveLabsClient()
    if not client.is_configured:
        logger.info("TwelveLabs not configured (TWELVELABS_API_KEY missing)")
        return None
    return client
