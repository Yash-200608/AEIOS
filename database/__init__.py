"""AEIOS v1 SQLite persistence (ADR-014). No PostgreSQL/Timescale/MQTT runtime dependency."""

from __future__ import annotations

from pathlib import Path

from database.connection import connect
from database.paths import DEFAULT_DEV_DB, ENV_DB_PATH, resolve_db_path


def open_repository(path: str | Path | None = None, *, purpose: str = "runtime"):
    """Bootstrap SQLite and return the gateway repository facade."""
    from gateway.storage.sqlite import SqliteRepository

    return SqliteRepository(resolve_db_path(path), purpose=purpose)


__all__ = ["DEFAULT_DEV_DB", "ENV_DB_PATH", "connect", "open_repository", "resolve_db_path"]
