"""SQLite migration runner. Schema changes live only in database/migrations/*.sql."""

from __future__ import annotations

import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

REQUIRED_TABLES = (
    "schema_migrations",
    "nodes",
    "sensor_readings",
    "sensor_states",
    "events",
    "event_features",
    "sampling_decisions",
    "radio_packets",
    "power_state",
    "system_logs",
)

_REPO_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = _REPO_ROOT / "database" / "migrations"

_IGNORABLE = (
    "duplicate column name",
    "already exists",
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def split_sql_statements(sql: str) -> list[str]:
    stripped = re.sub(r"--[^\n]*", "", sql)
    parts = []
    for chunk in stripped.split(";"):
        stmt = chunk.strip()
        if stmt:
            parts.append(stmt)
    return parts


def apply_migrations(
    conn: sqlite3.Connection,
    migrations_dir: Path | None = None,
    *,
    target_version: int | None = None,
) -> list[int]:
    """Apply numbered *.sql files in order. Idempotent via schema_migrations."""
    directory = Path(migrations_dir or MIGRATIONS_DIR)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    applied = {int(row[0]) for row in conn.execute("SELECT version FROM schema_migrations")}
    newly: list[int] = []
    files = sorted(directory.glob("*.sql"))
    for path in files:
        version = int(path.stem.split("_", 1)[0])
        if version in applied:
            continue
        if target_version is not None and version > target_version:
            continue
        sql = path.read_text(encoding="utf-8")
        for stmt in split_sql_statements(sql):
            try:
                conn.execute(stmt)
            except sqlite3.Error as exc:
                msg = str(exc).lower()
                if any(tok in msg for tok in _IGNORABLE):
                    continue
                conn.rollback()
                raise
        conn.execute(
            "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
            (version, path.name, utc_now_iso()),
        )
        conn.commit()
        newly.append(version)
        applied.add(version)
    return newly


def schema_version(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()
    return int(row[0])


def applied_migrations(conn: sqlite3.Connection) -> list[dict[str, str | int]]:
    rows = conn.execute(
        "SELECT version, name, applied_at FROM schema_migrations ORDER BY version"
    ).fetchall()
    return [{"version": int(r[0]), "name": r[1], "applied_at": r[2]} for r in rows]


def list_user_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        """
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    ).fetchall()
    return [r[0] for r in rows]


def verify_schema(conn: sqlite3.Connection) -> None:
    tables = set(list_user_tables(conn))
    missing = [t for t in REQUIRED_TABLES if t not in tables]
    if missing:
        raise RuntimeError(f"schema verification failed; missing tables: {missing}")
    fk = conn.execute("PRAGMA foreign_keys").fetchone()
    if fk is None or int(fk[0]) != 1:
        raise RuntimeError("foreign_keys PRAGMA is not enabled")


def table_counts(conn: sqlite3.Connection) -> dict[str, int]:
    out: dict[str, int] = {}
    for name in list_user_tables(conn):
        out[name] = int(conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])
    return out
