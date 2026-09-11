# AEIOS conflict matrix

**Status:** Resolved 2026-09-11.

**Authority (C-01):** Controlled Gate A–C artifacts remain **release law**. The resolved context stack is the **target architecture**. Where implementation needs a frozen contract to change, an ADR (009+) plus normal design-review/change-control is required. Context Files 01–05 do **not** silently override charter, SRS, SAD, DOC-004, AMP, or FAS.

**Target summary:** [RESOLVED_ARCHITECTURE.md](RESOLVED_ARCHITECTURE.md)  
**Pending controlled-doc edits:** [../adr/CONTROLLED_DOC_CHANGE_QUEUE.md](../adr/CONTROLLED_DOC_CHANGE_QUEUE.md)  
**Context files:** [01](01-master-constitution.md) · [02](02-hardware-firmware.md) · [03](03-comms-gateway-database.md) · [04](04-ai-adaptive-sensing.md) · [05](05-dev-test-deployment.md)

Cursor rules stay `alwaysApply: false` so they cannot override controlled documents. They must match this matrix.

Decision vocabulary: `adopt CF` | `keep ADR` | `hybrid: …`

---

## C-01 Authority

- **Topic:** Which document set is law for implementation.
- **Context files:** CF05 §74 — Contexts 01–05 are authoritative; older proposal text is historical.
- **Frozen docs:** [GOV-EXEC-001](../governance/ENGINEERING_EXECUTION.md); [PROJECT_CHARTER.md](../charter/PROJECT_CHARTER.md).
- **Options:** adopt CF / keep ADR / hybrid (contexts win only where an ADR is written).
- **Decision:** hybrid. Controlled Gate A–C artifacts remain release law. The resolved context stack is the target architecture. Changing a frozen artifact requires an ADR and change-control. Do not silently let context override controlled documents.

## C-02 MQ135

- **Topic:** MQ-series gas sensor in the v1 node.
- **Context files:** CF01 §3.4, CF02 §10–11, CF04 §30.
- **Frozen docs:** [ADR-005](../adr/ADR-005-scd41-co2-sensor.md), [technology-baseline.md](../technology-baseline.md) — MQ135 rejected.
- **Decision:** adopt CF. MQ135 is in v1 as a duty-cycled, warm-up-aware gas-response / anomaly modality. Never label raw response as universal calibrated ppm. Heater/quality metadata required. **ADR-011** (amends ADR-005 MQ135 clause only; SCD41 remains CO₂).

## C-03 BME688 vs BME680

- **Topic:** Bosch environmental + gas sensor part.
- **Context files:** CF01 §3.3, CF02 §9 — BME688.
- **Frozen docs:** Tech baseline and FAS — BME680.
- **Decision:** adopt CF. Target part is BME688 (T/RH/P + gas **features**, not generic ppm). **ADR-012**. FAS/DOC-004 await change-control.

## C-04 Radio IC, band, topology

- **Topic:** Field radio and network shape.
- **Context files:** SX1278 @ 433 MHz star envelope.
- **Frozen docs:** SX1276/RFM95W; AMP mesh Gate B freeze.
- **Decision:** hybrid. Physical: SX1278, 433 MHz, node-to-gateway star for v1. No 868/915 MHz. Retain frozen AMP codec until a formally approved protocol revision. Codec separate from radio driver. Do not casually rewrite AMP_PROTOCOL_SPEC.md. **ADR-009**.

## C-05 GPS / GNSS

- **Topic:** Positioning on the node.
- **Context files:** GPS not used.
- **Frozen docs:** [ADR-007](../adr/ADR-007-gps-installation-mode.md).
- **Decision:** adopt CF. No GPS UART, PPS, parser, acquisition, packet fields, or runtime GNSS. Gateway owns static coordinates. **ADR-010** supersedes ADR-007.

## C-06 Pin map collisions

- **Topic:** ESP32 GPIO vs BSP.
- **Context files:** CS GPIO5, DIO0 25, MQ135 ADC 34, no GPS UART.
- **Frozen docs:** BSP CS 15, DIO0 26, ADC34 battery, GPS on 4/5.
- **Decision:** hybrid. Centralize the pin map immediately (ADR-013, `HW-NODE-r2`). Target: PMS 16/17, I²C 21/22, LoRa 18/23/19/5/14/25, MQ135 34, LED 2. GPIO34 is **not** battery ADC; battery channel is hardware-pending (`adc_battery = -1`). Never hide an electrical conflict in software.

## C-07 Firmware layout and language

- **Topic:** Node firmware tree and language.
- **Context files:** `firmware/sensing_node/`, PlatformIO, C++.
- **Frozen docs:** [ADR-002](../adr/ADR-002-esp-idf-sole-firmware.md), FAS, STD-FW-001.
- **Decision:** keep ADR. ESP-IDF, C, `firmware/node/` with `aeios_bsp` / `hal` / `drivers` / `amp` / `services` / `app`. No parallel PlatformIO C++ tree. Map context responsibilities onto that architecture. ADR-002 remains valid.

## C-08 ACK / retry policy

- **Topic:** Link reliability.
- **Context files:** at-least-once + bounded retries.
- **Frozen docs:** AMP ACK/NACK/retry, store-and-forward.
- **Decision:** keep ADR. Preserve AMP ACK/NACK/retry. Bounded retries, priority-aware behavior, gateway de-duplication, sequence tracking, store-and-forward as specified. Do not weaken to generic at-least-once.

## C-09 Bring-up / init order

- **Topic:** Sensor and radio init sequence.
- **Context files:** power → buses → digital → analog → radio → intelligence.
- **Frozen docs:** stubs `battery → BME680 → SCD41 → PMS → LoRa → GPS`.
- **Decision:** hybrid. Order: (1) power/brownout (2) GPIO/BSP (3) I²C (4) SCD41/BME688 (5) UART/PMS5003 (6) MQ135 analog/heater (7) SX1278 (8) intelligence/services. No GPS. Non-blocking, explicit failure states, degraded operation. Recorded in **ADR-013**.

## C-10 Domain and node count

- **Topic:** First vertical and assumed node count.
- **Context files:** campus/smart-city; 4 ESP32 kits; do not hard-code five.
- **Frozen docs:** wildfire Sentinel; mesh 3–10.
- **Decision:** hybrid. v1 application is **environmental sensing**. Architecture stays reusable for wildfire and other event verticals later. Do not hard-code 5 nodes. Procurement is 4 ESP32 kits. Configurable `wire_id` / registry. Software must scale without rewrite.

## C-11 Database

- **Topic:** Gateway persistence.
- **Context files:** SQLite.
- **Frozen docs:** TimescaleDB required.
- **Decision:** adopt CF with repository abstraction. SQLite for v1 (local-first, transactions, migrations, schema version, `sampling_decisions` mandatory, quality/provenance, radio diagnostics separate). Repository interface so PostgreSQL/Timescale can arrive later. No external DB server for core v1. **ADR-014**.

## C-12 MQTT

- **Topic:** Internal message bus.
- **Context files:** MQTT not core.
- **Frozen docs:** Mosquitto required.
- **Decision:** adopt CF. MQTT is not on the core v1 LoRa ingestion path. Core: SX1278 → radio → validation → ingestion → SQLite → intelligence → API/WebSocket. MQTT may be a later bridge. **ADR-015**.

## C-13 Packaging / deploy

- **Topic:** How the Pi runs services.
- **Context files:** native Pi preferred.
- **Frozen docs:** Docker Compose required.
- **Decision:** hybrid. Docker/Compose for development and integration. Native systemd acceptable and preferred on the field Pi when simpler. Same application/config contracts. **ADR-016**.

## C-14 Node identity type

- **Topic:** On-wire vs UI identity.
- **Context files:** strings `NODE-01`.
- **Frozen docs:** AMP `uint16`.
- **Decision:** hybrid. `uint16` on air (`wire_id`); human-readable `display_id` (e.g. `NODE-03`) in gateway registry/UI. Do not break wire compatibility. **ADR-009**.

## C-15 Repo layout (dashboard / backend)

- **Topic:** Directory names and service split.
- **Context files:** `dashboard/`, gateway package with migrations.
- **Frozen docs:** `frontend/`, `backend/`, `database/`, `gateway/`.
- **Decision:** keep current dirs; evolve progressively. No mass rename. Move responsibilities toward gateway core / API / storage / intelligence without destructive moves.

## C-16 On-node intelligence vs TinyML

- **Topic:** Reasoning on the ESP32.
- **Context files:** on-node policy + VoI; tiny models only with evidence.
- **Frozen docs:** ADR-001 / Gate C — no TinyML; threshold events only.
- **Decision:** hybrid. Node: validation, filtering, features, quality, lightweight confidence pre-process, **deterministic** adaptive policy, power, packetization. Gateway: heavy ML, multi-node, spatial, forecast, history. TinyML/TFLite is **not** v1. **ADR-017**.

## C-17 Explainability (SHAP)

- **Topic:** How events are explained.
- **Context files:** hybrid traces; SHAP optional.
- **Frozen docs:** SHAP required for gateway risk models.
- **Decision:** hybrid. Evidence traces mandatory for all significant events (supporting/contradicting sensors, quality, features/trends, confidence, reason). SHAP required when a supervised/tree-based gateway model is actually deployed. Do not force SHAP into deterministic rule engines. **ADR-017**.

## C-18 ADR numbering

- **Topic:** New architecture records.
- **Context files:** example ADR-001 SQLite … collide with existing numbers.
- **Frozen docs:** [VERSIONING.md](../VERSIONING.md) — numbers never reused.
- **Decision:** adopt CF (numbering rule only). ADR-001…008 immutable historical records. New ADRs start at **ADR-009** (this reconciliation uses 009–017). Never reuse numbers. Context File 05 example names are not real ADRs.

## C-19 Execution path

- **Topic:** What to build next.
- **Context files:** PMS-first E2E; do not start with AI.
- **Frozen docs:** D1 accepted; D2 authorized; gateway/AI blocked by MVN.
- **Decision:** hybrid. MVN still gates **field** readiness. Allowed before full hardware validation: packet codec, fixtures, SQLite schema/migrations, gateway host skeleton, simulator, synthetic nodes, unit/contract tests. Not allowed without evidence: claiming field gateway readiness, sensor accuracy, LoRa range, or adaptive energy savings. Follow the PMS-first smallest E2E path on the ESP-IDF tree.

## C-20 Time synchronization

- **Topic:** Node clock without GPS/PPS.
- **Context files:** node timestamp + `received_at`.
- **Frozen docs:** AMP TIME_SYNC; ADR-007 GPS time assist.
- **Decision:** hybrid. No GNSS/PPS. Retain protocol-level TIME_SYNC. Store node measurement timestamp and gateway `received_at` separately. Gateway beacons/offset for future sync. Do not put GPS back to solve time. **ADR-010**.

## C-21 Toolchain note in CF03

- **Topic:** Firmware SDK wording.
- **Context files:** “PlatformIO or ESP-IDF / Arduino-compatible”.
- **Frozen docs:** ADR-002 ESP-IDF sole; Arduino not approved.
- **Decision:** keep ADR. Firmware is ESP-IDF only. Arduino is not approved. PlatformIO is not a separate firmware architecture. Do not create contradictory toolchain documentation.

---

## Already aligned (no decision needed)

- Raspberry Pi 5 gateway
- PMS5003 and SCD41 in the sensing set
- I²C GPIO21/22 and PMS UART 16/17
- Status LED GPIO2
- Centralized pin/config layer
- Versioned packets + CRC; packet codec separate from radio driver
- Static buffers / host-testable firmware
- Offline-first core path; Wi-Fi not field telemetry
- Quality flags and provenance
- FastAPI + WebSocket
- Hierarchical edge intelligence (node light, gateway heavy) — refined by ADR-017
- No federated learning; no cloud-required inference
- No unsafe full firmware OTA over LoRa (ADR-003)
- Evidence + tests before merge (GOV-EXEC-001)
- Demo vs live distinction
- Simulation before relying on field data

---

## Sign-off

| Role | Date | Notes |
|------|------|-------|
| Owner (task) | 2026-09-11 | C-01…C-21 filled; ADR-009…017 created; BSP/driver stubs aligned to target map |
| Controlled-doc revision | pending | See [CONTROLLED_DOC_CHANGE_QUEUE.md](../adr/CONTROLLED_DOC_CHANGE_QUEUE.md) |
