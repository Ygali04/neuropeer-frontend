"""Run database migrations — adds new columns for linked runs, AI feedback, campaigns, and marketer profiles."""

import asyncio
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine


async def migrate():
    db_url = os.environ.get("DATABASE_URL", "")
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_async_engine(db_url)

    migrations = [
        # Linked runs on jobs
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS content_group_id UUID DEFAULT gen_random_uuid()",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS campaign_name TEXT",
        "ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_email TEXT",

        # AI feedback on results
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_summary TEXT",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_report_title TEXT",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_action_items JSONB",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_priorities JSONB",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_category_strategies JSONB",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS ai_metric_tips JSONB",
        "ALTER TABLE results ADD COLUMN IF NOT EXISTS overarching_summary TEXT",

        # Marketer profiles table
        """CREATE TABLE IF NOT EXISTS marketer_profiles (
            user_email TEXT PRIMARY KEY,
            overall_score FLOAT DEFAULT 0,
            total_analyses INT DEFAULT 0,
            ai_summary TEXT,
            ai_strengths JSONB,
            ai_weaknesses JSONB,
            ai_trends JSONB,
            last_refreshed_at TIMESTAMP,
            refresh_threshold INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )""",
    ]

    async with engine.begin() as conn:
        for sql in migrations:
            try:
                await conn.execute(text(sql))
                print(f"OK: {sql[:80]}...")
            except Exception as e:
                print(f"SKIP: {sql[:80]}... ({e})")

    await engine.dispose()
    print("\nMigrations complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
