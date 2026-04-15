"""Mint a new NeuroPeer API key.

Usage:
    python -m backend.scripts.mint_api_key \
        --label "nucleus-dev" \
        --user-email yahvin@gmail.com

Generates 32 random bytes (base64url-encoded), hashes them with sha256, stores
the hash + metadata in the ``api_keys`` table, then prints the RAW key to
stdout ONCE. The raw key cannot be recovered — copy it immediately.

Respects DATABASE_URL (same env the backend uses). Auto-creates the
``api_keys`` table if missing so a fresh SQLite file works out of the box.
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import os
import secrets
import sys
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _generate_raw_key() -> str:
    """32 random bytes → URL-safe base64 (no padding)."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("ascii")


def _normalize_db_url(url: str) -> str:
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    if url.startswith("sqlite://") and not url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url


async def _mint(
    label: str,
    user_email: str,
    db_url: str,
    raw_override: str | None = None,
) -> str:
    # Import inside the function so module import doesn't touch a missing DB.
    from backend.models.db import ApiKeyRow, Base

    engine = create_async_engine(_normalize_db_url(db_url))
    # Ensure the table exists (fine in dev; no-op in prod where it already does).
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    raw = raw_override or _generate_raw_key()
    key_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()

    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        session.add(
            ApiKeyRow(
                id=uuid.uuid4(),
                key_hash=key_hash,
                label=label,
                user_email=user_email,
                created_at=datetime.utcnow(),
            )
        )
        await session.commit()
    await engine.dispose()
    return raw


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mint a NeuroPeer API key")
    parser.add_argument("--label", required=True, help="Human label, e.g. 'nucleus-dev'")
    parser.add_argument("--user-email", required=True, help="Owner email")
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./neuropeer.db"),
        help="Override DATABASE_URL",
    )
    parser.add_argument(
        "--key",
        default=None,
        help=(
            "Use this exact raw key instead of generating a new one. Useful "
            "when seeding a prod DB with a key that's already in a caller's "
            "env file. Provide the same URL-safe base64 form the mint CLI "
            "normally prints."
        ),
    )
    args = parser.parse_args(argv)

    raw = asyncio.run(
        _mint(args.label, args.user_email, args.database_url, args.key)
    )

    print("=" * 72)
    print("NeuroPeer API key minted.")
    print(f"  label      : {args.label}")
    print(f"  user_email : {args.user_email}")
    print(f"  raw key    : {raw}")
    print("=" * 72)
    print("WARNING: this key is shown ONCE and cannot be recovered. Store it now.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
