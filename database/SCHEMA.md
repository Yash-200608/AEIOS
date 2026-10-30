# AEIOS v1 SQLite schema

Operational store is **SQLite** behind the gateway repository (ADR-014). There is no PostgreSQL/TimescaleDB or MQTT runtime dependency.

`wire_id` is the AMP uint16 node identity (`node_id` in CF03). `display_id` is the human alias (for example `NODE-03`). Latitude/longitude on `nodes` are **configured site coordinates**, not GNSS measurements. There are no GPS columns.

Trusted measurements live in `sensor_readings`. Invalid or duplicate frames stay in `radio_packets` (quarantine) and must not be copied into trusted tables.

## Units (`sensor_readings`)

| Column | Meaning | Unit / encoding |
|--------|---------|-----------------|
| `pm1`, `pm25`, `pm10` | Particulate mass | µg/m³ |
| `co2` | Carbon dioxide | ppm |
| `temperature` | Air temperature | °C |
| `humidity` | Relative humidity | %RH |
| `pressure` | Barometric pressure | hPa |
| `bme688_gas_feature` | BME688 gas resistance feature | **not universal ppm** |
| `mq135_raw` | MQ135 ADC / raw count | raw |
| `mq135_index` | MQ135 derived index | unitless |
| `quality_flags` | AMP status flags | bitfield |
| `sensor_quality` | Combined per-sensor quality | 0–1 |
| `confidence` | Observation confidence | 0–1 |
| `sampling_interval_s` | Commanded sample interval | seconds |
| `measurement_time` | Node timestamp | integer seconds |
| `received_at` | Gateway receive time | integer seconds |
| `provenance` | Data plane | `SIMULATED` or `LIVE` |

MQ135 and BME688 gas outputs are **not** interchangeable ppm gas concentrations.

## Tables

| Table | Role |
|-------|------|
| `schema_migrations` | Applied migration versions (created by the runner, not by `001`) |
| `nodes` | Registry: `wire_id` PK, `display_id`, site, configured lat/lon, HW/FW/config versions, `enabled`, `status`, `last_seen`, `last_sequence` |
| `sensor_readings` | Trusted observations; `UNIQUE(wire_id, sequence)` |
| `sensor_states` | Per-sensor lifecycle: `VALID`, `WARMING`, `CALIBRATING`, `STALE`, `SENSOR_FAULT`, `DEGRADED` |
| `events` | Event lifecycle separate from severity and from the three confidence values |
| `event_features` | Named feature contributions for explanations |
| `sampling_decisions` | Mandatory adaptive-sensing trace |
| `radio_packets` | All received frames including CRC/schema failures and duplicates |
| `power_state` | Battery/solar/mode samples (simulator-compatible) |
| `system_logs` | Structured logs (`component`, `level`, `code`, `message`, optional `wire_id`) |

Event `status`: `CANDIDATE`, `CONFIRMING`, `CONFIRMED`, `ACTIVE`, `RESOLVING`, `RESOLVED`, `REJECTED`. Severity is a separate column. Confidences (`environment_event_confidence`, `sensor_fault_confidence`, `uncertain_confidence`, `event_confidence`) are not collapsed.

`firmware_versions` from CF03 is **not** a separate table in v1; firmware/config strings are stored on `nodes` and `sensor_readings`.

## Constraints and indexes

- `nodes.wire_id` CHECK: 1–65534 and **not** gateway id `2`
- Foreign keys from readings/states/events/sampling/power to `nodes`
- `UNIQUE(wire_id, sequence)` on `sensor_readings`
- Partial unique index `idx_radio_trusted_unique` on trusted non-duplicate radio rows `(wire_id, sequence, message_type)`
- `CHECK (confidence >= 0 AND confidence <= 1)` on sampling decisions and observation/event confidence columns
- Indexes: `sensor_readings(wire_id, measurement_time)`, `events(wire_id, started_at)`, `radio_packets(wire_id, sequence)`, `sampling_decisions(wire_id, timestamp)`, `system_logs(timestamp)`

## Access rule

Domain, intelligence, and dashboard code must use `gateway.storage` / `gateway.snapshot`. They must not open the SQLite file.
