"""Database path resolution. Development default is aeios_dev.db; production is config-only."""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_DEV_DB = "aeios_dev.db"
ENV_DB_PATH = "AEIOS_DB_PATH"
PRODUCTION_MARKERS = ("/var/lib/aeios", "\\var\\lib\\aeios")


class DatabasePathError(ValueError):
    pass


def resolve_db_path(cli_path: str | os.PathLike[str] | None = None) -> Path:
    """CLI wins, then AEIOS_DB_PATH, then aeios_dev.db. Never a baked-in production path."""
    if cli_path:
        return Path(cli_path)
    env = os.environ.get(ENV_DB_PATH)
    if env:
        return Path(env)
    return Path(DEFAULT_DEV_DB)


def is_forbidden_test_path(path: str | os.PathLike[str]) -> bool:
    p = Path(path)
    text = str(p).replace("\\", "/")
    if p.name == DEFAULT_DEV_DB:
        return True
    if p.name == "aeios.db":
        return True
    return any(m.replace("\\", "/") in text for m in PRODUCTION_MARKERS)


def assert_test_safe(path: str | os.PathLike[str]) -> Path:
    p = Path(path)
    if is_forbidden_test_path(p):
        raise DatabasePathError(
            f"tests must not use development/production DB path: {p}"
        )
    return p
