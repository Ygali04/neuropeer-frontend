"""Tests for the public API-key CRUD routes.

Mirrors the pattern in ``test_api_key_auth.py``: pins a SQLite DB (via
conftest), builds a minimal FastAPI app mounting the keys router, and drives
it with ``TestClient``. No real network.

Asserts:
    - admin guard rejects without/with a bad bearer
    - create returns the raw key ONCE and persists only the sha256 hash
    - list masks (never returns the raw key)
    - delete sets revoked_at (soft delete), and is reflected in list
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.api.middleware.api_key import hash_key
from backend.api.routes.keys import router as keys_router
from backend.config import settings
from backend.models.db import ApiKeyRow, Base

_ADMIN = "test-admin-secret"


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(keys_router, prefix="/api/v1")
    return app


async def _ensure_schema() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def _wipe() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.execute(text("DELETE FROM api_keys"))
    await engine.dispose()


async def _fetch_all() -> list[ApiKeyRow]:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        rows = (await session.execute(select(ApiKeyRow))).scalars().all()
    await engine.dispose()
    return rows


@pytest.fixture(autouse=True)
def _schema():
    asyncio.run(_ensure_schema())
    asyncio.run(_wipe())
    yield


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.setenv("ADMIN_API_TOKEN", _ADMIN)
    return TestClient(_build_app())


def _auth() -> dict:
    return {"Authorization": f"Bearer {_ADMIN}"}


# ── admin guard ──────────────────────────────────────────────────────────────


def test_create_requires_admin_token(client):
    r = client.post("/api/v1/keys", json={"label": "x", "user_email": "a@b.co"})
    assert r.status_code == 401


def test_wrong_admin_token_rejected(client):
    r = client.post(
        "/api/v1/keys",
        json={"label": "x", "user_email": "a@b.co"},
        headers={"Authorization": "Bearer nope"},
    )
    assert r.status_code == 401


def test_admin_api_unavailable_when_token_unset(monkeypatch):
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)
    c = TestClient(_build_app())
    r = c.get("/api/v1/keys", headers={"Authorization": "Bearer anything"})
    assert r.status_code == 503


# ── create ───────────────────────────────────────────────────────────────────


def test_create_returns_raw_key_once_and_persists_only_hash(client):
    r = client.post(
        "/api/v1/keys",
        json={"label": "nucleus", "user_email": "ops@kwale.ai"},
        headers=_auth(),
    )
    assert r.status_code == 201, r.text
    body = r.json()
    raw = body["api_key"]
    assert raw.startswith("npk_")
    assert body["masked_key"].startswith("npk_")
    assert body["label"] == "nucleus"

    # DB must store ONLY the hash, never the raw key.
    rows = asyncio.run(_fetch_all())
    assert len(rows) == 1
    stored = rows[0]
    assert stored.key_hash == hash_key(raw)
    assert stored.key_hash != raw
    assert raw not in stored.key_hash


# ── list ─────────────────────────────────────────────────────────────────────


def test_list_masks_and_never_returns_raw(client):
    created = client.post(
        "/api/v1/keys",
        json={"label": "svc", "user_email": "ops@kwale.ai"},
        headers=_auth(),
    ).json()
    raw = created["api_key"]

    r = client.get("/api/v1/keys", headers=_auth())
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    item = items[0]
    # Masked, no raw key field, and the raw secret never appears anywhere.
    assert "api_key" not in item
    assert item["masked_key"].startswith("npk_")
    assert raw not in str(item)
    assert item["revoked_at"] is None
    assert item["last_used_at"] is None


# ── delete / revoke ──────────────────────────────────────────────────────────


def test_delete_revokes_via_soft_delete(client):
    created = client.post(
        "/api/v1/keys",
        json={"label": "to-revoke", "user_email": "ops@kwale.ai"},
        headers=_auth(),
    ).json()
    kid = created["id"]

    r = client.delete(f"/api/v1/keys/{kid}", headers=_auth())
    assert r.status_code == 200
    assert r.json()["revoked"] is True

    # Row still present (soft delete) with revoked_at set.
    rows = asyncio.run(_fetch_all())
    assert len(rows) == 1
    assert rows[0].revoked_at is not None

    # Reflected in the list.
    listed = client.get("/api/v1/keys", headers=_auth()).json()
    assert listed[0]["revoked_at"] is not None


def test_delete_unknown_key_returns_404(client):
    import uuid

    r = client.delete(f"/api/v1/keys/{uuid.uuid4()}", headers=_auth())
    assert r.status_code == 404


def test_delete_invalid_uuid_returns_400(client):
    r = client.delete("/api/v1/keys/not-a-uuid", headers=_auth())
    assert r.status_code == 400
