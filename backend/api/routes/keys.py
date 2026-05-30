"""Public API-key management endpoints (for the kwale.ai dashboard).

The kwale dashboard mints / lists / revokes service API keys here. These
routes are administrative: they are gated behind a single ``ADMIN_API_TOKEN``
bearer secret that the dashboard holds server-side. They are NOT gated by the
per-key ``X-API-Key`` middleware (that middleware gates the compute endpoints
for the keys minted *here*).

Security invariants (matching ``backend/api/middleware/api_key.py``):
    - Raw keys are generated server-side, returned to the caller exactly ONCE
      on create, and never persisted. Only ``sha256(raw)`` is stored.
    - Revocation is a soft-delete: ``revoked_at`` is set, the row remains.
    - Hashing is delegated to the existing ``hash_key`` helper — not
      reimplemented here.
"""

from __future__ import annotations

import os
import secrets
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.middleware.api_key import hash_key
from backend.config import settings
from backend.models.db import ApiKeyRow

router = APIRouter(tags=["API Keys"])

# Raw keys look like ``npk_<43 url-safe chars>`` (npk = NeuroPeer key).
_KEY_PREFIX = "npk_"
_MASK_VISIBLE = 4  # how many post-prefix chars to show in the masked form

_bearer = HTTPBearer(auto_error=False)


# ── admin guard ──────────────────────────────────────────────────────────────


def _admin_token() -> str | None:
    """Live-read the admin bearer secret (env, not cached settings)."""
    val = os.getenv("ADMIN_API_TOKEN", "").strip()
    return val or None


async def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    """Gate: require ``Authorization: Bearer <ADMIN_API_TOKEN>``.

    Fails closed — if ``ADMIN_API_TOKEN`` is not configured, every request is
    rejected (these endpoints must never be open). Uses a constant-time
    comparison to avoid leaking the secret via timing.
    """
    expected = _admin_token()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin API is not configured (ADMIN_API_TOKEN unset)",
        )
    if (
        creds is None
        or creds.scheme.lower() != "bearer"
        or not secrets.compare_digest(creds.credentials, expected)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid admin bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── schemas ──────────────────────────────────────────────────────────────────


class CreateKeyRequest(BaseModel):
    label: str = Field(..., min_length=1, max_length=255)
    user_email: str = Field(..., min_length=3, max_length=320)


class CreatedKeyResponse(BaseModel):
    """Returned ONCE on create — ``api_key`` is never retrievable again."""

    id: str
    label: str
    user_email: str
    api_key: str  # the raw key, shown exactly once
    masked_key: str
    created_at: datetime


class KeyResponse(BaseModel):
    """Masked view for listing — never exposes the raw key."""

    id: str
    label: str
    user_email: str
    masked_key: str
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


# ── helpers ──────────────────────────────────────────────────────────────────


def _mask(raw: str) -> str:
    """Masked, non-secret display form: ``npk_abcd…`` (prefix + first chars)."""
    body = raw[len(_KEY_PREFIX):] if raw.startswith(_KEY_PREFIX) else raw
    shown = body[:_MASK_VISIBLE]
    return f"{_KEY_PREFIX}{shown}…"


# ── routes ───────────────────────────────────────────────────────────────────


@router.post(
    "/keys",
    response_model=CreatedKeyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
async def create_key(body: CreateKeyRequest) -> CreatedKeyResponse:
    """Mint a new API key. Returns the raw key ONCE; stores only its hash."""
    raw = f"{_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    row = ApiKeyRow(
        key_hash=hash_key(raw),  # reuse existing hashing — never store raw
        label=body.label,
        user_email=body.user_email,
        created_at=datetime.utcnow(),
    )

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as session:
            session.add(row)
            await session.commit()
            await session.refresh(row)
    finally:
        await engine.dispose()

    return CreatedKeyResponse(
        id=str(row.id),
        label=row.label,
        user_email=row.user_email,
        api_key=raw,
        masked_key=_mask(raw),
        created_at=row.created_at,
    )


@router.get(
    "/keys",
    response_model=list[KeyResponse],
    dependencies=[Depends(require_admin)],
)
async def list_keys() -> list[KeyResponse]:
    """List all keys (active + revoked), masked. Raw keys are never returned."""
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as session:
            rows = (
                (await session.execute(select(ApiKeyRow).order_by(ApiKeyRow.created_at.desc())))
                .scalars()
                .all()
            )
    finally:
        await engine.dispose()

    # We never stored the raw key, so the masked form here is derived from the
    # hash prefix — enough to disambiguate rows without leaking anything.
    return [
        KeyResponse(
            id=str(r.id),
            label=r.label,
            user_email=r.user_email,
            masked_key=f"{_KEY_PREFIX}…{r.key_hash[:6]}",
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            revoked_at=r.revoked_at,
        )
        for r in rows
    ]


@router.delete(
    "/keys/{key_id}",
    dependencies=[Depends(require_admin)],
)
async def revoke_key(key_id: str) -> dict:
    """Soft-delete a key by setting ``revoked_at``. Idempotent."""
    try:
        kid = UUID(key_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid key id") from exc

    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with Session() as session:
            row = (
                await session.execute(select(ApiKeyRow).where(ApiKeyRow.id == kid))
            ).scalar_one_or_none()
            if row is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Key not found")
            if row.revoked_at is None:
                row.revoked_at = datetime.utcnow()
                await session.commit()
            revoked_at = row.revoked_at
    finally:
        await engine.dispose()

    return {"id": key_id, "revoked": True, "revoked_at": revoked_at.isoformat()}
