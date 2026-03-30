"""WebSocket endpoint — streams real-time job progress to the frontend."""

from __future__ import annotations

import json

import redis.asyncio as aioredis
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.config import settings

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/job/{job_id}")
async def job_progress(websocket: WebSocket, job_id: str) -> None:
    """
    WebSocket connection for a specific job.

    Subscribes to the Redis pub/sub channel for this job and forwards
    all progress events to the connected frontend client.

    Emits ProgressEvent JSON objects:
      {"job_id": str, "status": str, "progress": float, "message": str}

    Closes the connection when status is "complete" or "error".
    """
    await websocket.accept()

    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    await pubsub.subscribe(f"neuropeer:job:{job_id}")

    try:
        # First, check if the job is already complete (race condition)
        existing = await r.get(f"neuropeer:result:{job_id}")
        if existing:
            await websocket.send_json(
                {
                    "job_id": job_id,
                    "status": "complete",
                    "progress": 1.0,
                    "message": "Analysis already complete.",
                }
            )
            await websocket.close()
            return

        # Stream progress until complete or error
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue

            try:
                event = json.loads(message["data"])
            except (json.JSONDecodeError, TypeError):
                continue

            await websocket.send_json(event)

            if event.get("status") in ("complete", "error"):
                break

    except WebSocketDisconnect:
        pass
    finally:
        await pubsub.unsubscribe(f"neuropeer:job:{job_id}")
        await r.aclose()
