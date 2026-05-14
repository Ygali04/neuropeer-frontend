"""API-key authentication.

A lightweight shared-secret auth layer so sibling services (Nucleus) can call
NeuroPeer with a key instead of the full OAuth stack.

Env flag:
    NEUROPEER_REQUIRE_API_KEY=true   — enforce auth (prod).
    NEUROPEER_REQUIRE_API_KEY unset  — dev mode, all requests pass through
                                       with a synthetic row.

Clients send the key via:
    HTTP   : header ``X-API-Key: <raw>``
    WS     : query param ``?api_key=<raw>`` (WebSockets drop custom headers
             through some proxies, so we accept both forms everywhere).

First-party origins (the NeuroPeer Vercel frontend) are exempt from API-key
requirements — CORS already restricts which browser origins can call
cross-origin. Service-to-service callers (Nucleus, scripts) have no Origin
header and must provide an API key.

Storage: raw keys are never persisted. Only ``sha256(raw).hexdigest()`` lives
in the ``api_keys`` table. Revoked keys remain rows with ``revoked_at`` set.
"""

from __future__ import annotations

import asyncio
import hashlib
import os
import re
import uuid
from datetime import datetime

from fastapi import Header, HTTPException, Query, Request, WebSocket, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.config import settings
from backend.models.db import ApiKeyRow


# ── first-party origins (kept in sync with CORS in main.py) ─────────────────

_FIRST_PARTY_EXACT = {
    "http://localhost:3000",
    "https://neuropeer.app",
}
_FIRST_PARTY_REGEX = re.compile(r"^https://.*\.vercel\.app$")


def _is_first_party_origin(origin: str | None) -> bool:
    if not origin:
        return False
    return origin in _FIRST_PARTY_EXACT or bool(_FIRST_PARTY_REGEX.match(origin))


# ── helpers ──────────────────────────────────────────────────────────────────


def _enforce() -> bool:
    """Live-read the enforcement flag (env, not cached settings)."""
    return str(os.getenv("NEUROPEER_REQUIRE_API_KEY", "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def hash_key(raw: str) -> str:
    """sha256 hex of the raw key — the only form we ever persist."""
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _dev_row() -> ApiKeyRow:
    """Synthetic row returned when auth is disabled (dev mode)."""
    return ApiKeyRow(
        id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        key_hash="dev",
        label="dev-bypass",
        user_email="dev@local",
        created_at=datetime.utcnow(),
    )


async def _touch_last_used(key_id: uuid.UUID) -> None:
    """Best-effort update of last_used_at. Swallow all errors."""
    try:
        engine = create_async_engine(settings.database_url)
        Session = async_sessionmaker(engine, expire_on_commit=False)
        async with Session() as session:
            await session.execute(
                update(ApiKeyRow)
                .where(ApiKeyRow.id == key_id)
                .values(last_used_at=datetime.utcnow())
            )
            await session.commit()
        await engine.dispose()
    except Exception:
        pass


async def _lookup(raw_key: str) -> ApiKeyRow | None:
    """Return the matching, non-revoked ApiKeyRow, or None."""
    key_hash = hash_key(raw_key)
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as session:
            row = (
                await session.execute(select(ApiKeyRow).where(ApiKeyRow.key_hash == key_hash))
            ).scalar_one_or_none()
    finally:
        await engine.dispose()
    if row is None or row.revoked_at is not None:
        return None
    return row


def _extract_raw_key(
    request: Request | None,
    header_key: str | None,
    query_key: str | None,
) -> str | None:
    if header_key:
        return header_key.strip()
    if query_key:
        return query_key.strip()
    if request is not None:
        hv = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
        if hv:
            return hv.strip()
        qv = request.query_params.get("api_key")
        if qv:
            return qv.strip()
    return None


# ── FastAPI dependencies ─────────────────────────────────────────────────────


async def require_api_key(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    api_key: str | None = Query(default=None),
) -> ApiKeyRow:
    """Dependency for HTTP routes.

    - Dev mode (flag unset): returns a synthetic row, doesn't touch the DB.
    - First-party browser origin: returns a synthetic row (CORS gates the
      browser; service callers have no Origin and must use an API key).
    - Prod mode: looks up the raw key's sha256, rejects missing/unknown/
      revoked keys with 401. Schedules a fire-and-forget last_used_at bump.
    """
    if not _enforce():
        return _dev_row()

    # First-party browser requests are pre-authenticated by CORS.
    origin = request.headers.get("origin")
    if _is_first_party_origin(origin):
        return _dev_row()

    raw = _extract_raw_key(request, x_api_key, api_key)
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key (X-API-Key header or ?api_key= query param)",
        )

    row = await _lookup(raw)
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
        )

    # Fire-and-forget — never block the request on this write.
    try:
        asyncio.create_task(_touch_last_used(row.id))
    except RuntimeError:
        # No running loop (shouldn't happen in FastAPI, but be safe).
        pass
    return row


async def authenticate_websocket(websocket: WebSocket) -> ApiKeyRow | None:
    """Gate a WebSocket handshake.

    Returns the ApiKeyRow on success (synthetic row in dev mode).
    On failure, closes the socket with code 4401 and returns None — the
    caller should abort immediately.
    """
    if not _enforce():
        return _dev_row()

    raw = websocket.query_params.get("api_key") or websocket.headers.get("x-api-key")
    if not raw:
        await websocket.close(code=4401, reason="missing api key")
        return None

    row = await _lookup(raw.strip())
    if row is None:
        await websocket.close(code=4401, reason="invalid api key")
        return None

    try:
        asyncio.create_task(_touch_last_used(row.id))
    except RuntimeError:
        pass
    return row
