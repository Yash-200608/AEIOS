# AEIOS agent guidance

Load in this order before major architectural work:

1. [docs/context/CONFLICT_MATRIX.md](docs/context/CONFLICT_MATRIX.md) (resolved 2026-09-11)
2. [docs/context/RESOLVED_ARCHITECTURE.md](docs/context/RESOLVED_ARCHITECTURE.md)
3. [docs/context/01-master-constitution.md](docs/context/01-master-constitution.md) through [05](docs/context/05-dev-test-deployment.md)
4. ADR-009…017 under [docs/adr/](docs/adr/)

**Release law:** Gate A–C controlled documents (charter, SRS, SAD, DOC-004, AMP, FAS, ADR-001…008 as frozen). Do not silently rewrite them. Required follow-up edits: [docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md](docs/adr/CONTROLLED_DOC_CHANGE_QUEUE.md).

**Target architecture:** resolved matrix + ADR-009…017. Where they disagree with a frozen document, implement toward the ADR and record the document gap in the change queue.

Cursor rules in `.cursor/rules/` stay `alwaysApply: false` so they cannot override controlled documents.

## Role

Senior embedded + AI + distributed-systems engineer. Prefer a correct, extensible architecture over the shortest code. Avoid abstraction for its own sake.

## Locked for implementation

- Hardware: ESP32-DevKitC-32E, PMS5003, SCD41, BME688, MQ135, SX1278 @ 433 MHz, Pi 5. No GPS/GNSS. No 868/915 MHz.
- Pins: centralized BSP `HW-NODE-r2` (ADR-013). GPIO34 = MQ135 only; battery ADC unassigned until schematic.
- Firmware: ESP-IDF C in `firmware/node/` only. No Arduino, no PlatformIO tree, no TinyML/TFLite.
- MQ135 and BME688 gas outputs are **not** universal ppm.
- AMP v1 on the wire (`uint16` IDs); star v1; ACK/NACK retained.
- SQLite v1 behind a repository; MQTT not on the core ingest path.
- Node count configurable; do not hard-code five nodes.
- Do not reuse ADR numbers 001–008. Next free: ADR-018.
- Hardware-independent simulation lives in `simulation/` and must use the same AMP/SQLite/observation contracts. Simulation outputs are never field-readiness evidence.

## Before implementing a feature

- Does this fit closed-loop AEIOS (not a logger)?
- Does it match target ADRs without rewriting frozen docs in place?
- Modular, host-testable, offline, observable?
- Quality flags, provenance, `sampling_decisions` preserved?
- Adaptive / patent-relevant loop intact?
- MVN still gates field-readiness claims (C-19).

## Priority

correctness → observability → testability → maintainability → measured performance → sophistication
