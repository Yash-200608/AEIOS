# Resolved architecture (2026-09-11)

This page is the **target architecture** after [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md). It does **not** rewrite Gate A–C controlled documents. Release law for those files stays as written until [CONTROLLED_DOC_CHANGE_QUEUE.md](../adr/CONTROLLED_DOC_CHANGE_QUEUE.md) items are merged.

## Authority (C-01)

- Controlled Gate A–C artifacts = **release law**.
- Resolved context stack + ADR-009…017 = **target architecture**.
- Changing a frozen contract requires a new ADR (009+) and the normal change-control process. Context files never silently override charter, SRS, SAD, DOC-004, AMP, or FAS.

## Locked hardware

ESP32-DevKitC-32E (38-pin), PMS5003, SCD41, BME688, MQ135, SX1278 @ **433 MHz**, Raspberry Pi 5, solar/rechargeable power. **No GPS/GNSS.** No 868/915 MHz. No Arduino/PlatformIO firmware tree. No TinyML/TFLite.

Pins: [ADR-013](../adr/ADR-013-hw-node-r2-pinmap.md). GPIO34 = MQ135 only; battery ADC hardware-pending (`-1`).

## Firmware

ESP-IDF C under `firmware/node/` (ADR-002, C-07, C-21). Map context layers onto `aeios_bsp` / `hal` / `drivers` / `amp` / `services` / `app`. AMP ACK/NACK/retry retained (C-08). Bring-up: ADR-013 / C-09.

Node intelligence (ADR-017): deterministic validation, features, quality, adaptive policy, power — not neural nets.

## Comms / gateway / data

- AMP Protocol Version 1 on air; `uint16` wire ID; registry string alias `NODE-nn` (ADR-009).
- Star node-to-gateway for v1; codec ≠ radio driver.
- TIME_SYNC without GNSS (ADR-010). Store node time and `received_at`.
- SQLite v1 behind a repository; `sampling_decisions` mandatory (ADR-014).
- MQTT not on the core path (ADR-015).
- Compose for dev; systemd OK on Pi (ADR-016).
- Keep directory names: `firmware/`, `gateway/`, `backend/`, `frontend/`, `database/` (C-15).
- Configurable node IDs; BOM has 4 ESP32 kits; do not hard-code 5 nodes (C-10). v1 application is environmental sensing; wildfire remains a later vertical.

## Execution (C-19)

MVN still gates **field** readiness. Allowed now: codec, fixtures, SQLite schema, gateway host skeleton, simulator, unit/contract tests. The software laboratory is `simulation/` plus `gateway/` Python ingest; its metrics are **SIMULATION RESULT**, not field evidence. Not allowed without hardware evidence: field gateway readiness, sensor accuracy, LoRa range, adaptive energy savings. Firmware next slice remains PMS-first E2E on the ESP-IDF tree.

## ADR numbering (C-18)

ADR-001…008 are historical and immutable except status/review-history. Next unused number after this reconciliation: **ADR-018**.
