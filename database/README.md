# Database

v1 operational store is **SQLite** behind a repository (ADR-014). PostgreSQL/TimescaleDB may be introduced later without rewriting domain logic. No external database server is required.

- Schema: [SCHEMA.md](SCHEMA.md)
- Migrations: [migrations/](migrations/) (`001`–`004`)
- Development file: `aeios_dev.db` (never a baked-in production path)
- Production path example (config/env only): `/var/lib/aeios/aeios.db`
- Override: `--db PATH` or environment variable `AEIOS_DB_PATH`
- Dashboard/AI must not open the DB file; use the gateway snapshot/API
- `sampling_decisions` is mandatory
- Trusted `sensor_readings` are separate from `radio_packets`

The first simulator or gateway open against a missing path creates the file, enables foreign keys, applies migrations, verifies the schema, and returns a usable repository. Do not mutate schema from application startup except through `database/migrations/*.sql`.

```bash
python -m simulation.run --scenario multimodal_event --duration 120 --nodes 4 --seed 42
python -m database.inspect --db aeios_dev.db
python -m unittest discover -s database/tests -v
```

DOC-004 still lists TimescaleDB as required until the [change queue](../docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md) revision.
