# AEIOS conflict matrix

**Status:** Awaiting point-by-point Decision. Do not rewrite charter, SRS, SAD, ADRs, AMP, FAS, or BSP until a row is decided.

**Candidate constitution:** [01](01-master-constitution.md) · [02](02-hardware-firmware.md) · [03](03-comms-gateway-database.md) · [04](04-ai-adaptive-sensing.md) · [05](05-dev-test-deployment.md)

**Implemented law today:** Gate A–C freeze, DOC-005 AMP, DOC-006 FAS, D1 accepted. See [docs/README.md](../README.md), [GOV-EXEC-001](../governance/ENGINEERING_EXECUTION.md), [VERSIONING.md](../VERSIONING.md).

How to fill **Decision**: `adopt CF` | `keep ADR` | `hybrid: <one sentence>` | `defer`

After this table is filled, a follow-up pass can set matching `.cursor/rules/*.mdc` to `alwaysApply: true` and, if requested, write **new** ADRs using the next free numbers (do not reuse ADR-001…008).

---

## C-01 Authority

- **Topic:** Which document set is law for implementation.
- **Context files:** CF05 §74 — Contexts 01–05 are authoritative; older proposal text is historical.
- **Frozen docs:** [GOV-EXEC-001](../governance/ENGINEERING_EXECUTION.md) — architecture frozen; implement and verify against controlled documents. [PROJECT_CHARTER.md](../charter/PROJECT_CHARTER.md) — changes after Gate A require design review + ADR.
- **Options:** adopt CF (contexts supersede Gate A–C) / keep ADR (contexts remain vision overlay) / hybrid (contexts win only where an ADR is written).
- **Decision:**

## C-02 MQ135

- **Topic:** MQ-series gas sensor in the v1 node.
- **Context files:** CF01 §3.4, CF02 §10–11, CF04 §30 — locked as duty-cycled heater / gas-response feature, never fake ppm.
- **Frozen docs:** [ADR-005](../adr/ADR-005-scd41-co2-sensor.md), [technology-baseline.md](../technology-baseline.md) — MQ135 / MQ-series **explicitly rejected**.
- **Options:** adopt CF (bring MQ135 back with heater FSM) / keep ADR (no MQ135) / hybrid (research-only, feature-flagged, not in v1 BOM).
- **Decision:**

## C-03 BME688 vs BME680

- **Topic:** Bosch environmental + gas sensor part.
- **Context files:** CF01 §3.3, CF02 §9 — BME688, gas as features not ppm.
- **Frozen docs:** Tech baseline and FAS driver table — BME680. Stubs in `firmware/node/components/aeios_drivers/stubs/driver_stubs.c`.
- **Options:** adopt CF (BME688) / keep ADR (BME680) / hybrid (treat 680/688 as one driver family with a board config).
- **Decision:**

## C-04 Radio IC, band, topology

- **Topic:** Field radio and network shape.
- **Context files:** CF01 §3.6, CF02 §12, CF03 §4 — SX1278 @ 433 MHz, node-to-gateway (star), compact envelope.
- **Frozen docs:** Tech baseline SX1276 / RFM95W; [ADR-006](../adr/ADR-006-binary-lora-protocol.md) + [AMP_PROTOCOL_SPEC.md](../sad/protocol/AMP_PROTOCOL_SPEC.md) — **Gate B frozen** mesh, 64 B max, dest/TTL, HMAC, ACK/NACK.
- **Options:** adopt CF (new 433 MHz star protocol; supersede AMP) / keep ADR (keep AMP mesh, map SX1278 as a board variant if needed) / hybrid (AMP codec on 433 MHz star for v1, mesh later).
- **Decision:**

## C-05 GPS / GNSS

- **Topic:** Positioning on the node.
- **Context files:** CF01 §4, CF02 §5, CF03 §6 — GPS is not used. No UART, PPS, parser, or packet fields. Gateway owns configured lat/lon.
- **Frozen docs:** [ADR-007](../adr/ADR-007-gps-installation-mode.md) — install-mode GPS then disable. FAS NVS `aeios_loc`. BSP `uart_gps_tx/rx`.
- **Options:** adopt CF (remove GPS entirely; manual/gateway coordinates only) / keep ADR (install-mode GPS) / hybrid (gateway-configured coordinates required; GPS optional technician tool, no firmware GPS driver in deployment).
- **Decision:**

## C-06 Pin map collisions

- **Topic:** ESP32 GPIO allocation vs current BSP.
- **Context files:** CF01 §5, CF02 §5 — LoRa CS **GPIO5**, DIO0 **GPIO25**, MQ135 ADC **GPIO34**, no GPS UART. LED GPIO2. I²C 21/22 and PMS 16/17 match.
- **Frozen docs:** [aeios_bsp.c](../../firmware/node/components/aeios_bsp/aeios_bsp.c) — LoRa CS **15**, DIO0 **26**, ADC34 **battery**, GPS UART TX4/RX5 (GPIO5 is GPS RX). Maint button GPIO0.
- **Hard collisions:** GPIO5 cannot be LoRa NSS and GPS RX. GPIO34 cannot be MQ135 and battery ADC without a second ADC channel or mux.
- **Options:** adopt CF pin map (update BSP + schematic) / keep ADR (keep HW-NODE-r1 placeholders until schematic freeze) / hybrid (central pin struct now; freeze numbers only after hardware sign-off).
- **Decision:**

## C-07 Firmware layout and language

- **Topic:** Node firmware tree and language.
- **Context files:** CF02 §35, CF05 §3 — `firmware/sensing_node/`, PlatformIO, C++ class sketches.
- **Frozen docs:** [ADR-002](../adr/ADR-002-esp-idf-sole-firmware.md), [FAS.md](../firmware/FAS.md), [CODING_STANDARDS.md](../firmware/CODING_STANDARDS.md) — ESP-IDF C under `firmware/node/` with `aeios_bsp/hal/drivers/amp/services/app` and `aeios_driver_ops_t`.
- **Options:** adopt CF (new PlatformIO C++ tree) / keep ADR (stay ESP-IDF C; map CF layers onto existing components) / hybrid (ESP-IDF C remains; add CF module names as components, no PlatformIO).
- **Decision:**

## C-08 ACK / retry policy

- **Topic:** Link reliability.
- **Context files:** CF02 §13, CF03 §17–18 — at-least-once + bounded priority retries; do not overbuild ACK unless required.
- **Frozen docs:** AMP Link ACK/NACK, retry, store-and-forward already specified (Gate B).
- **Options:** adopt CF (optional ACK, gateway de-dup) / keep ADR (AMP ACK required for SENSOR_DATA) / hybrid (ACK for EVENT/CRITICAL only; observations at-least-once + de-dup).
- **Decision:**

## C-09 Bring-up / init order

- **Topic:** Sensor and radio init sequence.
- **Context files:** CF02 §19 — power/GPIO → buses → digital sensors → analog → radio → intelligence.
- **Frozen docs:** Driver stubs comment: battery → BME680 → SCD41 → PMS → LoRa → GPS.
- **Options:** adopt CF order / keep current D2 order / hybrid (battery first for brownout safety, then CF digital→analog→radio, no GPS).
- **Decision:**

## C-10 Domain and node count

- **Topic:** First vertical and how many nodes the software assumes.
- **Context files:** CF01 identity (smart-city / campus monitoring); CF02 BOM 4 ESP32 kits, do not hard-code five nodes; CF04 event classes particulate/gas/CO₂.
- **Frozen docs:** Charter/README — wildfire risk + environmental air sensing; prototype mesh 3–10 nodes.
- **Options:** adopt CF vertical / keep wildfire Sentinel vertical / hybrid (OS core + air-sensing app; wildfire as a later application).
- **Decision:**

## C-11 Database

- **Topic:** Gateway persistence.
- **Context files:** CF01 §15, CF03 §24 — SQLite, local-first, `sampling_decisions` required.
- **Frozen docs:** Tech baseline — **TimescaleDB (PostgreSQL) required**.
- **Options:** adopt CF (SQLite v1) / keep ADR (TimescaleDB) / hybrid (SQLite now, Timescale interface behind a repository for later).
- **Decision:**

## C-12 MQTT

- **Topic:** Internal message bus.
- **Context files:** CF03 §56 — MQTT optional, not core; do not add because it exists. Primary path SX1278 → app → SQLite.
- **Frozen docs:** Tech baseline Eclipse Mosquitto **required**. [gateway/README.md](../../gateway/README.md) describes MQTT ingestion.
- **Options:** adopt CF (no MQTT in v1) / keep ADR (Mosquitto required) / hybrid (in-process event bus now; MQTT bridge later).
- **Decision:**

## C-13 Packaging / deploy

- **Topic:** How the Pi runs services.
- **Context files:** CF03 §57, CF05 §39 — native Pi may be simpler; Docker optional; systemd units allowed.
- **Frozen docs:** Tech baseline **Docker + Docker Compose required**.
- **Options:** adopt CF (native/systemd v1) / keep ADR (Compose required) / hybrid (Compose for dev, native units on Pi).
- **Decision:**

## C-14 Node identity type

- **Topic:** On-wire and registry ID.
- **Context files:** CF03 §5 — string IDs `NODE-01` … `NODE-04`.
- **Frozen docs:** AMP — `uint16` (0x0002 default gateway). NVS `node_id` u16.
- **Options:** adopt CF strings / keep uint16 / hybrid (uint16 on air, string alias in gateway registry).
- **Decision:**

## C-15 Repo layout (dashboard / backend)

- **Topic:** Directory names and service split.
- **Context files:** CF05 §2, §4, §6 — `dashboard/`, gateway package `aeios_gateway` with migrations; no separate backend.
- **Frozen docs:** Existing `frontend/`, `backend/`, `database/`, `gateway/` split ([README.md](../../README.md)).
- **Options:** adopt CF names (rename later) / keep current dirs / hybrid (keep paths; treat `frontend` as dashboard, `backend` as API inside gateway over time).
- **Decision:**

## C-16 On-node intelligence vs TinyML

- **Topic:** How much reasoning runs on the ESP32.
- **Context files:** CF04 §61, §54 — on-node deterministic policy, confidence pre-process, VoI/heater control; tiny models on ESP32 only if later evidence.
- **Frozen docs:** [ADR-001](../adr/ADR-001-hierarchical-edge-intelligence.md), Gate C — nodes may raise **threshold events**, not full risk models; **TinyML excluded**.
- **Options:** adopt CF on-node policy engines (still not TinyML) / keep ADR (thresholds only on node) / hybrid (replaceable deterministic policy on node; all ML on gateway; no TFLite).
- **Decision:**

## C-17 Explainability (SHAP)

- **Topic:** How events are explained.
- **Context files:** CF04 §43–44, §77 — hybrid evidence traces required; SHAP optional.
- **Frozen docs:** SAD + tech baseline — **SHAP required** for gateway risk models. [ai/README.md](../../ai/README.md).
- **Options:** adopt CF (SHAP not mandatory) / keep ADR (SHAP required when supervised models exist) / hybrid (rule/evidence traces always; SHAP when a tree/boosting model is deployed).
- **Decision:**

## C-18 ADR numbering

- **Topic:** New architecture records.
- **Context files:** CF05 §72 examples (`ADR-001 SQLite`, `ADR-002 SX1278`, `ADR-003 GPS removed`, …).
- **Frozen docs:** [VERSIONING.md](../VERSIONING.md) — numbers never reused. Existing ADR-001…008.
- **Options:** (only valid) continue from **ADR-009+**. Do not write the CF05 example numbers.
- **Decision:**

## C-19 Execution path

- **Topic:** What to build next after ingest.
- **Context files:** CF05 §83–87 — sprints; PMS-first E2E slice; do not start with AI.
- **Frozen docs:** [ENGINEERING_EXECUTION.md](../governance/ENGINEERING_EXECUTION.md) — D1 accepted; D2 drivers authorized; gateway/AI **blocked by MVN**.
- **Options:** adopt CF sprint sequence / keep D2→MVN then gateway / hybrid (keep MVN gate; allow host-side protocol/SQLite skeletons without claiming field gateway).
- **Decision:**

## C-20 Time synchronization

- **Topic:** Node clock without GPS/PPS.
- **Context files:** CF03 §7 — node timestamp + `received_at`; sync method open (beacon/offset).
- **Frozen docs:** AMP TIME_SYNC; install GPS as time assist in ADR-007.
- **Options:** adopt CF open sync (no GPS) / keep AMP TIME_SYNC + install GPS / hybrid (AMP TIME_SYNC from gateway; no GNSS).
- **Decision:**

## C-21 Toolchain note in CF03

- **Topic:** Firmware SDK wording.
- **Context files:** CF03 §76 — “PlatformIO or ESP-IDF / Arduino-compatible”.
- **Frozen docs:** ADR-002 ESP-IDF sole; Arduino not approved.
- **Options:** adopt CF (allow PlatformIO/Arduino) / keep ADR-002 / hybrid (ESP-IDF only; PlatformIO as an optional ESP-IDF wrapper is still an ADR).
- **Decision:**

---

## Already aligned (no decision needed)

Recorded so they are not re-litigated:

- Raspberry Pi 5 gateway
- PMS5003 and SCD41 in the sensing set
- I²C GPIO21/22 and PMS UART 16/17
- Status LED GPIO2
- Centralized pin/config layer (even if numbers disagree)
- Versioned packets + CRC; packet codec separate from radio driver
- Static buffers / host-testable firmware
- Offline-first core path; Wi-Fi not field telemetry
- Quality flags and provenance
- FastAPI + WebSocket
- Hierarchical edge intelligence (node light, gateway heavy)
- No federated learning; no cloud-required inference
- No unsafe full firmware OTA over LoRa (ADR-003); CF05 OTA is optional/signed later
- Evidence + tests before merge (GOV-EXEC-001)
- Demo vs live distinction
- Simulation before relying on field data

---

## Sign-off

| Role | Date | Notes |
|------|------|-------|
| Owner | | Fill Decision cells, then request rule promotion |
