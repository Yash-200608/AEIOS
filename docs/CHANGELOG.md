# Changelog (docs)

## 2026-09-12

- SQLite v1 persistence: numbered migrations `001`–`004`, automatic bootstrap, repository split, transactional trusted ingest, `python -m database.inspect`. Development default remains `aeios_dev.db` (path via CLI/`AEIOS_DB_PATH`). No PostgreSQL/TimescaleDB runtime dependency.

## 2026-09-11

- Ingested Context Files 01–05 under `docs/context/`.
- Resolved conflict matrix C-01…C-21.
- Added ADR-009…017 (target architecture). ADR-007 superseded; ADR-005 MQ135 clause superseded.
- Implementation-facing BSP `HW-NODE-r2`, driver stubs (BME688, MQ135, no GPS).
- Frozen Gate A–C / FAS / AMP body text **not** rewritten; see `docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md`.
- Hardware-independent simulation laboratory (`simulation/`, `gateway/` Python ingest, SQLite migrations). PMS UART frames go through `gateway.pms`. AMP uses the frozen v1 codec. Outputs labelled SIMULATION RESULT.
