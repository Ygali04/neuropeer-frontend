"""Tests for the X-API-Key middleware."""

from __future__ import annotations

import asyncio
import hashlib
import os
import uuid
from datetime import datetime

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Imported AFTER conftest.py pins DATABASE_URL to SQLite.
from backend.api.middleware.api_key import require_api_key
from backend.models.db import ApiKeyRow, Base
from backend.config import settings


def _build_app() -> FastAPI:
    app = FastAPI()

    @app.get("/protected")
    async def protected(row: ApiKeyRow = Depends(require_api_key)) -> dict:
        return {"label": row.label, "user_email": row.user_email}

    return app


async def _ensure_schema() -> None:
    engine = create_async_engine(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


async def _insert_key(raw: str, *, label: str, revoked: bool = False) -> uuid.UUID:
    engine = create_async_engine(settings.database_url)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    kid = uuid.uuid4()
    async with Session() as session:
        session.add(
            ApiKeyRow(
                id=kid,
                key_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
                label=label,
                user_email="test@local",
                created_at=datetime.utcnow(),
                revoked_at=datetime.utcnow() if revoked else None,
            )
        )
        await session.commit()
    await engine.dispose()
    return kid


@pytest.fixture(autouse=True)
def _schema():
    """Reset the api_keys table for each test (SQLite file is shared)."""
    asyncio.run(_ensure_schema())
    # Wipe any keys from previous tests.
    engine = create_async_engine(settings.database_url)

    async def _wipe():
        async with engine.begin() as conn:
            from sqlalchemy import text
            await conn.execute(text("DELETE FROM api_keys"))
        await engine.dispose()

    asyncio.run(_wipe())
    yield


def test_dev_mode_allows_unauthenticated(monkeypatch):
    monkeypatch.delenv("NEUROPEER_REQUIRE_API_KEY", raising=False)
    client = TestClient(_build_app())
    r = client.get("/protected")
    assert r.status_code == 200
    assert r.json()["label"] == "dev-bypass"


def test_missing_key_returns_401_when_enforced(monkeypatch):
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")
    client = TestClient(_build_app())
    r = client.get("/protected")
    assert r.status_code == 401


def test_unknown_key_returns_401(monkeypatch):
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")
    client = TestClient(_build_app())
    r = client.get("/protected", headers={"X-API-Key": "not-a-real-key"})
    assert r.status_code == 401


def test_revoked_key_returns_401(monkeypatch):
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")
    raw = "revoked-key-abc"
    asyncio.run(_insert_key(raw, label="revoked-one", revoked=True))
    client = TestClient(_build_app())
    r = client.get("/protected", headers={"X-API-Key": raw})
    assert r.status_code == 401


def test_valid_key_returns_200(monkeypatch):
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")
    raw = "valid-key-xyz"
    asyncio.run(_insert_key(raw, label="nucleus-test"))
    client = TestClient(_build_app())
    r = client.get("/protected", headers={"X-API-Key": raw})
    assert r.status_code == 200
    assert r.json()["label"] == "nucleus-test"


def test_valid_key_via_query_param(monkeypatch):
    monkeypatch.setenv("NEUROPEER_REQUIRE_API_KEY", "true")
    raw = "query-key-123"
    asyncio.run(_insert_key(raw, label="nucleus-ws"))
    client = TestClient(_build_app())
    r = client.get(f"/protected?api_key={raw}")
    assert r.status_code == 200
