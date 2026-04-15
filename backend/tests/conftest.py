"""Shared test fixtures.

Sets a SQLite test DB URL before anything in ``backend`` is imported, so the
pydantic-settings singleton picks it up and we don't hit Postgres during unit
tests.
"""

from __future__ import annotations

import os
import tempfile

# Must run BEFORE any `from backend...` import in test modules.
_tmp_db = os.path.join(tempfile.gettempdir(), "neuropeer_test.db")
os.environ.setdefault("DATABASE_URL", f"sqlite+aiosqlite:///{_tmp_db}")
# Tests toggle this per-test; default off.
os.environ.setdefault("NEUROPEER_REQUIRE_API_KEY", "")
