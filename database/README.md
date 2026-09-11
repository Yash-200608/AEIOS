# Database

v1 operational store is **SQLite** behind a repository/storage interface (ADR-014). PostgreSQL/TimescaleDB may be introduced later without rewriting domain logic.

- Schema: [migrations/001_initial.sql](migrations/001_initial.sql)
- Development file: `aeios_dev.db` (never a production path)
- Dashboard/AI must not open the DB file; use the gateway snapshot/API
- `sampling_decisions` is mandatory
- Trusted `sensor_readings` are separate from `radio_packets`

DOC-004 still lists TimescaleDB as required until the [change queue](../docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md) revision.
