# Controlled document change queue

**Status:** Open — 2026-09-11  
**Rule:** Gate A–C / Gate D **controlled artifacts remain release law** until a design-review revision of that document is merged. ADRs ADR-009…017 record the **target architecture**. This file lists the follow-up edits; it is not itself a rewrite of those documents.

| Controlled document | Stale content (leave until revision) | Target after change-control | Driving ADR |
|---------------------|--------------------------------------|-----------------------------|-------------|
| [DOC-004 technology-baseline.md](../technology-baseline.md) | SX1276/RFM95W; BME680; GNSS install-mode; MQ135 rejected; TimescaleDB required; Mosquitto required; Docker Compose required | SX1278 433 MHz; BME688; no GNSS; MQ135 as feature sensor; SQLite v1; MQTT optional; Compose for dev, systemd OK on Pi | 009, 010, 011, 012, 014, 015, 016 |
| [DOC-001 PROJECT_CHARTER.md](../charter/PROJECT_CHARTER.md) | LoRa mesh as v1 include; install-time GPS; wildfire as sole first vertical wording | Star v1 radio; no GNSS; environmental sensing v1, wildfire later | 009, 010 |
| [DOC-002 SRS.md](../srs/SRS.md) / [SYSTEM_REQUIREMENTS.md](../srs/SYSTEM_REQUIREMENTS.md) | Install-mode GNSS (FR-LOC-*, AC-07, SR-002) | Gateway-configured coordinates; no GNSS | 010 |
| [ICD-001](../icd/ICD-001-node-mesh.md) | Maintenance GNSS per ADR-007 | Maintenance without GNSS | 010 |
| [DOC-003 SAD.md](../sad/SAD.md) | Mesh + MQTT + TimescaleDB diagrams; SHAP always; GPS install mode; BME680 | Star + in-process bus + SQLite; SHAP when supervised models exist; BME688; no GPS | 009, 010, 012, 014, 015, 017 |
| [DOC-005 AMP_PROTOCOL_SPEC.md](../sad/protocol/AMP_PROTOCOL_SPEC.md) | Informative SX1276 / regional ISM | Informative SX1278 433 MHz; **on-wire v1 unchanged** | 009 |
| [DOC-006 FAS.md](../firmware/FAS.md) | BME680, GPS UART driver, SX1276, GPIO placeholders, maint GPS task, NVS `aeios_loc` from GNSS | BME688, MQ135, no GPS, HW-NODE-r2 pins, TIME_SYNC without GNSS | 010, 011, 012, 013 |
| [ADR-007](ADR-007-gps-installation-mode.md) | Install-mode GPS | **Superseded** by ADR-010 (status append only) | 010 |
| [ADR-005](ADR-005-scd41-co2-sensor.md) | “Drop MQ135” | SCD41 kept; MQ135 clause superseded by ADR-011 | 011 |
| [AGENTS.md](../../AGENTS.md) “Locked for implementation” hardware line | No GPS/GNSS; SCD41/BME688 on nodes; AMP only | Add a pointer: live v0 prototype (`edge/v0/`) uses CSV packets, BME680 + GPS, no SCD41 as an interim deviation | 018 |

Do **not** treat this queue as permission to edit those files in the same change without an explicit document-revision task.
