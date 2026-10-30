"""Open a usable SQLite connection with FK + migrations + schema check."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from database.migrate import MIGRATIONS_DIR, apply_migrations, verify_schema
from database.paths import DatabasePathError, assert_test_safe


def connect(
    path: str | Path,
    *,
    purpose: str = "runtime",
    migrations_dir: Path | None = None,
    target_version: int | None = None,
) -> sqlite3.Connection:
    """Create the file if missing, migrate, verify. purpose='test' forbids aeios_dev.db."""
    db_path = Path(path)
    if purpose == "test":
        assert_test_safe(db_path)
    elif purpose not in ("runtime", "inspect"):
        raise DatabasePathError(f"unknown database purpose: {purpose}")
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    apply_migrations(conn, migrations_dir or MIGRATIONS_DIR, target_version=target_version)
    if target_version is None:
        verify_schema(conn)
    return conn
