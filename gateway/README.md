# Gateway

Host-testable edge pipeline used by the Raspberry Pi in the field and by the software simulator on a PC.

**Core v1 path (ADR-015):** radio PSDU → AMP validate → de-dup → SQLite → intelligence → snapshot. MQTT is not on this path. No physical Pi is required to run this package.

| Module | Role |
|--------|------|
| `gateway.amp` | Frozen AMP Protocol Version 1 codec (matches firmware `aeios_amp`) |
| `gateway.pms` | PMS5003 32-byte UART parser |
| `gateway.ingest.Gateway` | Ingest + ACK + event engine |
| `gateway.storage.sqlite.SqliteRepository` | ADR-014 repository |
| `gateway.snapshot` | Dashboard contract (`data_plane`: SIMULATED \| LIVE) |

Virtual radios call `Gateway.ingest(RadioRx)`. A future real SX1278 driver should deliver the same `RadioRx`.
