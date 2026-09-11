# ADR-014: SQLite for v1 Gateway Persistence, Repository Abstraction

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-11)

## Context

DOC-004 requires TimescaleDB (PostgreSQL). Context File 03 requires **SQLite** so the Pi can run offline without an external database server. v1 data volume and the offline-first rule favor an embedded file.

## Decision

1. **v1 operational store:** SQLite on the gateway (`aeios_dev.db` in development; production path e.g. `/var/lib/aeios/aeios.db`).
2. Core ingestion **must not** require a network database server.
3. Domain code talks to a **repository/storage interface**, not to SQL dialect details. PostgreSQL/TimescaleDB may be introduced later behind the same interface (new ADR).
4. Schema is versioned with explicit migrations. Trusted observations are separate from `radio_packets` / quarantine.
5. **`sampling_decisions` is mandatory** (mode change, trigger, confidence, expected information gain, estimated energy, selected sensor).
6. Constraints: uniqueness for de-dup (at least `wire_id` + sequence + message type), `CHECK` on confidence in [0, 1], UTC timestamps, `measurement_time` ≠ `received_at`.
7. Dashboard and AI **must not** open the SQLite file. They use API / feature services.

## Alternatives considered

| Alternative | Why rejected for v1 |
|-------------|---------------------|
| TimescaleDB required from day one | External server; contradicts offline-first prototype |
| SQLite with SQL leaked into FastAPI/AI | Unmaintainable coupling |

## Rationale

Local-first persistence with a migration path, without pretending Timescale is running on every lab Pi.

## Consequences

- DOC-004 Timescale **Required** row needs a controlled revision to “v1 SQLite; Timescale optional later.”
- `database/` holds schema/migrations; gateway storage implements the repository.
- Do not delete local records merely because a future sync uploaded them once.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted |
