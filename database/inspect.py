"""Development database inspector. Usage: python -m database.inspect [--db PATH]"""

from __future__ import annotations

import argparse
import json
import sys

from database.connection import connect
from database.migrate import applied_migrations, list_user_tables, schema_version, table_counts
from database.paths import resolve_db_path


def inspect_report(path: str) -> dict:
    conn = connect(path, purpose="inspect")
    try:
        return {
            "database_path": str(path),
            "schema_version": schema_version(conn),
            "tables": list_user_tables(conn),
            "row_counts": table_counts(conn),
            "migrations": applied_migrations(conn),
        }
    finally:
        conn.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Inspect an AEIOS SQLite database (no secrets).")
    parser.add_argument(
        "--db",
        default=None,
        help="SQLite path (default: AEIOS_DB_PATH or aeios_dev.db)",
    )
    parser.add_argument("--json", action="store_true", help="Print JSON instead of text")
    args = parser.parse_args(argv)
    path = str(resolve_db_path(args.db))
    report = inspect_report(path)
    if args.json:
        print(json.dumps(report, indent=2))
        return 0
    print(f"database path: {report['database_path']}")
    print(f"schema version: {report['schema_version']}")
    print("migrations:")
    for row in report["migrations"]:
        print(f"  {row['version']:3d}  {row['name']}  {row['applied_at']}")
    print("tables / row counts:")
    for name in report["tables"]:
        print(f"  {name:24s} {report['row_counts'].get(name, 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
