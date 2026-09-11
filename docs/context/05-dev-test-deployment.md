# AEIOS — Context File 05

Development + Testing + Deployment Context

Purpose: This is the operational build context for an AI coding agent developing AEIOS. It defines how the system should be organized, implemented, tested, simulated, deployed, observed, updated and maintained.

This is Context File 05/05 and completes the AEIOS context stack:

- 01 — Master Project Context
- 02 — Hardware + Embedded Firmware
- 03 — Communication + Gateway + Database
- 04 — AI + Adaptive Sensing + Patent-Aware Intelligence
- 05 — Development + Testing + Deployment

**Ingest status:** Canonical copy of Context File 05 (citation artifacts stripped). Draft until [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) is resolved. Does not silently override Gate A–C controlled documents.

## 1. Development Philosophy

AEIOS is a cyber-physical system.

Therefore development must cover: software + firmware + hardware interfaces + communication + database + AI + mechanical assumptions + deployment.

A feature is not considered complete merely because the code compiles.

A feature is complete when it has: implementation + tests + observability + failure behavior + documentation + repeatable validation.

The coding agent must therefore think in terms of a system, not isolated source files.

## 2. Repository as the Single Engineering Workspace

Recommended repository:

```text
AEIOS/
│
├── firmware/
├── gateway/
├── ai/
├── dashboard/
├── simulation/
├── tools/
├── tests/
├── docs/
├── configs/
├── scripts/
├── deployment/
├── hardware/
└── experiments/
```

The exact directory names may evolve, but responsibilities should remain separated.

## 3. Firmware Repository

Recommended:

```text
firmware/
└── sensing_node/
    ├── platformio.ini
    ├── README.md
    ├── src/
    │   ├── main.cpp
    │   ├── app/
    │   ├── config/
    │   ├── sensors/
    │   │   ├── pms5003/
    │   │   ├── scd41/
    │   │   ├── bme688/
    │   │   └── mq135/
    │   ├── radio/
    │   ├── processing/
    │   ├── adaptive/
    │   ├── power/
    │   └── diagnostics/
    ├── include/
    ├── test/
    └── scripts/
```

Each sensor driver should be independently testable where possible.

## 4. Gateway Repository

Recommended:

```text
gateway/
├── pyproject.toml
├── README.md
├── src/
│   └── aeios_gateway/
│       ├── main.py
│       ├── config/
│       ├── radio/
│       ├── protocol/
│       ├── ingestion/
│       ├── storage/
│       ├── intelligence/
│       ├── api/
│       ├── diagnostics/
│       └── services/
├── migrations/
├── tests/
└── scripts/
```

Use package boundaries rather than a single large Python application file.

## 5. AI Repository

Potential structure:

```text
ai/
├── datasets/
├── feature_engineering/
├── models/
├── training/
├── evaluation/
├── inference/
├── explainability/
├── experiments/
└── notebooks/
```

Notebooks are for exploration. Production inference code belongs in version-controlled modules.

## 6. Dashboard

Suggested: dashboard/ with src/, public/, tests/, package.json, README.md.

The dashboard must communicate through the gateway API/WebSocket layer.

It must not read SQLite directly.

## 7. Configuration Layout

Keep configuration separate from code.

Possible:

```text
configs/
├── node/
│   ├── default.yaml
│   ├── node-01.yaml
│   └── node-02.yaml
├── gateway/
│   └── gateway.yaml
├── radio/
│   └── sx1278-433.yaml
└── experiments/
```

Never hard-code deployment-specific information into the application.

## 8. Environment Separation

Support at least: development, simulation, hardware_test, staging, production.

Example: AEIOS_ENV=development.

Behavior may change by environment.

Production must disable unsafe development features such as unrestricted fault injection.

## 9. Secrets

Never commit: API keys, passwords, cloud credentials, signing keys, private certificates.

Use: .env, environment variables, secret files, device-specific configuration — and keep secret files out of Git.

For the prototype, most AEIOS operation should work without cloud secrets.

## 10. Coding Standards

Preferred principles: small functions, clear names, strong typing, explicit error handling, low hidden state, minimal global mutable state, testable modules, documented interfaces.

Avoid: giant functions, magic numbers, implicit global state, silent exceptions, hard-coded deployment assumptions.

## 11. Naming

Use consistent domain terms.

Examples: node_id, event_confidence, sensor_quality, sampling_mode, protocol_version, firmware_version, config_version, received_at, measurement_time.

Do not create multiple names for the same concept.

Bad: nodeId, nodeID, device_id, sensorNode. Good: node_id where language conventions permit.

## 12. Type Discipline

Python: type hints, Pydantic models, dataclasses where appropriate.

C++: strong enums, fixed-width integers, explicit units, bounded buffers.

Do not represent important domain concepts as unstructured strings everywhere.

## 13. Units

Every measurement must have an explicit unit.

Examples: PM2.5 → µg/m³, CO₂ → ppm, temperature → °C, humidity → %RH, pressure → hPa, battery → V, time → ms / UTC timestamp, RSSI → dBm, SNR → dB.

Internal representations should be documented.

Never mix units silently.

## 14. Error Handling

Errors should carry: error code, component, timestamp, severity, context.

Example:

```json
{
  "code": "SCD41_I2C_NACK",
  "component": "scd41",
  "severity": "WARNING"
}
```

The system should distinguish: expected transient failure, recoverable failure, persistent failure, fatal configuration error.

## 15. Logging Standard

Use structured logging.

Suggested levels: DEBUG, INFO, WARNING, ERROR, CRITICAL.

Examples: INFO node initialized; WARNING MQ135 warm-up incomplete; ERROR PMS5003 checksum failures exceeded threshold; CRITICAL power rail unstable.

Do not log sensitive credentials.

## 16. Observability

Every important subsystem should expose measurable state.

Firmware: sensor status, read counts, failure counts, sampling mode, battery state, radio status.

Gateway: packet counts, CRC failures, sequence gaps, database latency, AI latency, node status, storage usage.

AI: model version, inference count, inference latency, confidence distribution, fallback count.

## 17. Versioning

Use separate versions: firmware_version, protocol_version, database_schema_version, configuration_version, feature_version, model_version.

Example: Firmware 0.4.1, Protocol 1, DB 3, Config 7, Features 0.3, Model event-0.2.

Never assume one version identifies the entire system.

## 18. Git Strategy

Suggested branches: main, develop, feature/*, fix/*, experiment/*, release/*.

Main branch should represent stable software.

Experimental AI work should not silently land in production.

## 19. Commit Style

Use meaningful commits.

Examples:

- feat(firmware): add PMS5003 frame validation
- feat(protocol): add event packet v1
- feat(gateway): persist sequence gaps
- feat(ai): add cross-modal confidence baseline
- fix(mq135): reject readings during warm-up
- fix(db): prevent duplicate packet inserts
- test(protocol): cover CRC failure

Avoid: update, changes, stuff, final, working.

## 20. Pull Requests

Each significant change should describe: What changed? Why? How tested? Any architecture impact? Any migration? Any hardware dependency?

If a change affects the patent-relevant adaptive loop, explicitly identify it.

## 21. Definition of a Safe Change

Before merging an architectural change, verify: firmware tests, gateway tests, schema compatibility, packet compatibility, simulation, documentation.

If hardware is affected, HIL test must be planned.

## 22. Test Pyramid

AEIOS should use: unit (largest) → component/service + contract → integration + HIL → E2E (smallest).

Do not depend entirely on hardware tests.

## 23. Firmware Unit Tests

Test: frame parsers, checksum, conversion functions, filters, quality flags, state transitions, adaptive policy, packet encoding, CRC, configuration parsing.

No physical hardware should be required for most of these tests.

## 24. Gateway Unit Tests

Test: packet parsing, schema validation, duplicate detection, sequence analysis, repositories, database transactions, event transitions, configuration parsing, API service functions.

## 25. AI Unit Tests

Test deterministic components: feature calculations, rolling windows, baseline calculations, confidence functions, quality scoring, policy decisions.

For probabilistic models: use fixture datasets, expected ranges, regression tests.

## 26. Contract Testing

The following boundaries should have explicit contracts: firmware → packet protocol, packet → gateway decoder, gateway → database, database → AI, gateway → API, API → dashboard.

A contract test must catch schema drift.

## 27. Packet Golden Tests

Maintain canonical packets: valid observation, valid event, heartbeat, diagnostic, bad CRC, old version, unknown node, duplicate.

Store them as fixtures.

Every decoder update must pass the fixture suite.

## 28. Database Migration Tests

Every migration must test: fresh install, upgrade from previous version, data preservation, rollback behavior where supported, constraint validity.

Never test migrations only on an empty database.

## 29. Simulation Environment

Simulation is mandatory.

Create:

```text
simulation/
├── sensors/
├── scenarios/
├── radio/
├── power/
└── environment/
```

Simulation should be able to generate: normal, PM event, gas event, CO₂ event, multimodal event, sensor fault, sensor drift, battery decline, radio loss, gateway outage.

## 30. Synthetic Node

The synthetic node should emit the same normalized observations as the physical node.

Therefore: SimulationNode → same packet encoder → same gateway decoder.

This dramatically reduces integration bugs.

## 31. Deterministic Simulation

Simulation should support fixed random seeds.

Example: seed = 42. Then same input + same software/model version = same output as far as deterministic components allow.

## 32. Scenario Files

Example:

```yaml
scenario: multimodal_pollution_event
duration: 3600
events:
  - type: particulate
    start: 1200
    duration: 300
    amplitude: 4.0
  - type: gas_response
    start: 1215
    duration: 240
    amplitude: 2.0
```

Do not hard-code test scenarios into algorithms.

## 33. Fault Injection

Support: sensor_missing, sensor_stuck, sensor_noise, sensor_drift, sensor_spike, checksum_failure, i2c_timeout, uart_timeout, radio_loss, battery_low, gateway_restart, database_failure.

Each should be independently configurable.

## 34. Hardware-in-the-Loop

HIL connects: real ESP32 + real sensors/radio + simulation or controlled environment.

Potential HIL: PC → test controller → ESP32 → PMS/SCD/BME/MQ → SX1278 → Pi gateway.

The objective is to validate real interfaces.

## 35. Serial Diagnostics

Maintain a structured serial diagnostic mode.

Example:

```text
[INFO] boot node=NODE-03 fw=0.3.0
[INFO] PMS5003=OK
[INFO] SCD41=OK
[INFO] BME688=OK addr=0x76
[INFO] MQ135=WARMING
[INFO] SX1278=OK freq=433000000
```

Production logging may be reduced.

## 36. Flashing and Firmware Release

Firmware build should produce: firmware.bin, version metadata, checksum.

Release record: FW-0.3.0, commit=<hash>, protocol=1, config=<version>.

## 37. OTA

OTA is optional for early prototype.

If added later: signed firmware, version validation, rollback, power-safe update, recovery path.

Do not implement unsafe remote updates merely to check a feature box.

## 38. Raspberry Pi Deployment

The gateway should eventually have a documented deployment script.

Example: install_dependencies, initialize_database, install_services, configure_radio, configure_node_registry, start_gateway, verify_health.

## 39. System Services

One possible design: aeios-gateway.service, aeios-api.service, aeios-worker.service. Or a unified service.

The final choice should be driven by failure isolation and maintenance simplicity.

## 40. Health Check

Gateway endpoint: GET /api/v1/health

Healthy example: status healthy, database/radio/ai/disk ok.

Degraded example: status degraded, ai fallback.

## 41. Readiness vs Liveness

Use two conceptual checks.

- Liveness: Is the service alive?
- Readiness: Can it process AEIOS workload?

For example: gateway process alive but database locked means alive = yes, ready = no.

## 42. Backups

SQLite should be backed up.

Potential: daily backup, rolling backups, manual snapshot.

Do not rely only on copying a live SQLite file unsafely.

Use a safe backup mechanism.

## 43. Recovery

Recovery procedure should cover: Pi failure, SD/storage failure, database corruption, configuration loss, firmware failure, radio configuration failure.

The node should continue collecting/retrying as far as its local buffer allows when the gateway is unavailable.

## 44. Node-Offline Recovery

When gateway returns: node reconnects → heartbeat → sequence state → queued events if supported → normal operation.

Do not assume a node must be factory-reset after gateway loss.

## 45. Local Dashboard

The Pi should be able to host the dashboard locally.

Desired: http://<gateway>/ with node status, live observations, events, health, trends, diagnostics.

Internet should not be required.

## 46. Demo Mode

Create a demo mode: AEIOS_MODE=demo.

It should generate realistic sensor data and events.

Demo mode is useful for: competitions, presentations, workshops, UI development, testing without sensors.

It must clearly identify simulated values.

Never present simulated data as real.

## 47. Field Mode

Production prototype: AEIOS_MODE=field.

Features: real sensors, real radio, real database, production models, safety limits, reduced debug logging.

## 48. Calibration Mode

Separate: AEIOS_MODE=calibration.

Allows controlled experiments without contaminating production data.

Calibration records must include: operator, date, sensor, reference, conditions, result, calibration version.

## 49. Experiment Mode

Research experiments should be reproducible.

Example fields: experiment_id, dataset_version, firmware, gateway version, model, configuration, scenario, results.

Store outputs separately from production data.

## 50. Metrics for the Entire System

AEIOS should measure:

- Detection: precision, recall, F1, false positives, latency
- Energy: Wh/day, battery runtime, heater runtime, radio energy
- Communication: packet success, packet loss, retry rate, RSSI, SNR, bytes/day
- Reliability: sensor uptime, gateway uptime, fault recovery rate
- Adaptivity: sampling reduction, energy reduction, event recall retained
- AI: inference latency, model accuracy, uncertainty, fallback count

## 51. Adaptive-Sensing Experiment

Required baseline comparison: A fixed-rate sensing, B threshold adaptive sensing, C confidence-based sensing, D information/energy policy.

Measure: energy, event recall, false-positive rate, latency, packet count.

The result should determine whether the more sophisticated strategy is actually worthwhile.

## 52. Enclosure Experiment

Compare unpartitioned enclosure vs partitioned enclosure.

Measure: thermal rise, sensor bias, PM stability, gas-response stability, cross-sensor interference.

## 53. Radio Experiment

Measure: distance, RSSI, SNR, packet loss, retry rate, antenna orientation, obstruction, weather effects where feasible.

Do this with the actual 433-MHz hardware.

## 54. Power Experiment

Test: battery only, solar only where appropriate, solar + battery, low battery, MQ135 ON, MQ135 OFF, radio transmit, high PM load, combined worst-case.

Log rail behavior.

The engineering blueprint explicitly calls for worst-case simultaneous load measurements and brownout logging.

## 55. Sensor Validation

Before claiming accuracy: AEIOS sensor + reference instrument + same location + same time.

Measure: bias, correlation, RMSE, repeatability, drift, humidity sensitivity.

The project documentation explicitly requires co-location with a trusted/reference monitor before quantitative accuracy claims.

## 56. Field Commissioning

Every node should go through: physical inspection → power test → sensor test → radio test → configuration → node identity verification → placement verification → baseline collection → gateway visibility → event test → commissioned.

## 57. Commissioning Checklist

Node ID assigned; firmware version recorded; configuration version recorded; battery verified; solar verified; MQ135 heater verified; PMS airflow verified; SCD41 verified; BME688 verified; SX1278 verified; antenna verified; gateway receives heartbeat; database receives readings; dashboard shows node; location metadata correct; baseline established.

## 58. Site Metadata

Gateway should record: node_id, site_name, installation_description, configured_latitude, configured_longitude, orientation, height, deployment_date, firmware, hardware revision.

The node itself remains GPS-free.

## 59. Maintenance

Field maintenance events should record: sensor replacement, battery replacement, enclosure cleaning, air-path cleaning, firmware update, calibration, antenna replacement.

This is useful for interpreting historical drift.

## 60. Cleaning / Particulate Path

PMS5003 air path should have maintenance documentation.

Record: last_cleaned, filter condition, condensation observation, fan/airflow status.

Air-path degradation can look like sensor drift.

## 61. Model Maintenance

When field data changes: monitor drift, validate model, retrain if justified, compare old/new, deploy only if better.

Never automatically retrain and replace production models without evaluation.

## 62. Database Maintenance

Monitor: database size, free disk, fragmentation if relevant, backup status, migration version.

Retention policies must prevent uncontrolled disk growth.

## 63. Performance Testing

Gateway should handle expected prototype load comfortably.

Test: nominal node count, burst events, duplicate packets, high event rate, historical database.

Do not optimize beyond observed bottlenecks.

## 64. Security Testing

Minimum: malformed packet, oversized packet, invalid node ID, invalid protocol version, invalid configuration, API invalid input.

Do not allow these to crash the gateway.

## 65. Dependency Management

Pin important dependencies.

Python: pyproject.toml, lock file where appropriate.

Frontend: package-lock / pnpm-lock / equivalent.

Firmware libraries: versioned dependency configuration.

Avoid undocumented "works on my machine" dependencies.

## 66. Build Reproducibility

A clean machine should be able to: clone repo, install dependencies, run tests, build firmware, build gateway, build dashboard — with documented commands.

## 67. CI Pipeline

Minimum CI: lint, unit tests, protocol tests, database tests, simulation tests, build checks.

Firmware CI: compile, static checks, unit tests.

Gateway CI: Python tests, type checks, lint, migration tests.

Dashboard: build, lint, unit tests.

## 68. Release Gates

Before a tagged release: all tests pass, schema verified, packet fixtures pass, simulation pass, hardware smoke test pass, documentation updated, version bumped.

## 69. Semantic Releases

Potential: v0.1.0, v0.2.0, v0.3.0, v1.0.0.

Major version may represent incompatible protocol or architecture changes.

## 70. Compatibility Matrix

Maintain: Firmware version, Protocol version, Gateway version, Database schema, Model version.

Example: FW 0.4, Protocol 1, Gateway 0.5, DB 3, Model 0.2.

The gateway should reject or quarantine incompatible packets rather than interpreting them blindly.

## 71. Deployment Documentation

Keep:

```text
docs/
├── architecture/
├── firmware/
├── gateway/
├── protocol/
├── database/
├── ai/
├── testing/
├── deployment/
└── field/
```

A future team member should be able to reconstruct the system from documentation.

## 72. Architecture Decision Records

Important decisions should be recorded.

**Note for this ingest:** Example names in the original Context File 05 (`ADR-001 SQLite selected`, `ADR-002 SX1278 fixed at 433 MHz`, …) **collide** with existing numbered ADRs in this repository. Do not reuse ADR-001…008. New ADRs must continue from the next free number after the current set. See [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) and [docs/VERSIONING.md](../VERSIONING.md).

Every ADR should record: decision, context, alternatives, reason, consequences, date.

## 73. Change Management

When changing a locked decision: identify impact, update relevant context, create ADR, update tests, update documentation, update hardware/software interfaces.

Do not silently alter core architecture.

## 74. Reconciliation Rule

The original proposal and later engineering decisions may differ.

The current locked decisions in Context 01–05 are authoritative for implementation.

Older proposal material should be treated as historical/reference material where a later explicit project decision supersedes it.

This especially applies to: GPS/GNSS, exact node quantities, radio frequency, hardware revisions.

**Ingest note:** This claim is recorded as conflict C-01 against the frozen Gate A–C document set. Do not apply it until the conflict matrix is decided.

## 75. Demo Readiness

A competition/demo build should have: one-button/one-command startup, health screen, known-good demo scenario, recorded backup demo, simulation fallback.

The demo must clearly distinguish LIVE SENSOR DATA vs SIMULATED DATA.

## 76. Presentation Mode

The dashboard may provide: LIVE, DEMO, REPLAY.

- LIVE — Real system.
- DEMO — Controlled simulation.
- REPLAY — Historical event visualization.

Replay mode can be particularly valuable for demonstrating rare events.

## 77. Event Replay

Store enough data to replay: measurements, events, sensor quality, sampling decisions, timestamps, node positions.

Then: select event → replay timeline → show sensing decisions → show confidence → show node map → show gateway inference.

This is useful for: debugging, presentations, scientific analysis, patent evidence.

## 78. Auditability

Important conclusions must have provenance.

Example: Event EVT-042 sourced from OBS-101, OBS-102, OBS-103; model event-model-0.3; feature version features-0.2; node decisions SD-983, SD-984.

This makes AEIOS explainable and reproducible.

## 79. Field Data Protection

Do not delete raw evidence when an event is detected.

Preserve: pre-event window, event window, post-event window.

This allows retrospective analysis.

## 80. Patent Evidence Collection

For every major proposed patent mechanism, preserve: design version, experiment ID, raw data, analysis code, result, comparison baseline, date, contributors.

Potential evidence:

- Family A: Energy reduction + event detection performance.
- Family B: Thermal/airflow interference reduction.
- Family C: Source reconstruction accuracy.

## 81. Research vs Product Separation

AEIOS should support research code and production code without mixing them.

Example: experiments/bandit_policy_test.py vs gateway/adaptive_policy.py.

The experiment can inform the production implementation after validation.

## 82. Prototype First, Production Later

Do not over-engineer: Kubernetes, microservices, large cloud architecture, distributed databases for the initial prototype.

Start with: ESP32 + SX1278 + Raspberry Pi 5 + SQLite + FastAPI + local dashboard.

Then scale based on measured needs.

## 83. Recommended Initial Development Sequence

Sprint 1 Repository + build systems.  
Sprint 2 ESP32 bring-up.  
Sprint 3 Sensor drivers.  
Sprint 4 Normalized data model.  
Sprint 5 Packet protocol.  
Sprint 6 LoRa gateway ingestion.  
Sprint 7 SQLite + API.  
Sprint 8 Simulation.  
Sprint 9 Basic confidence/event engine.  
Sprint 10 Adaptive sensing.  
Sprint 11 AI models.  
Sprint 12 Dashboard + integration.

The exact calendar is flexible.

## 84. First Working Vertical Slice

Before building every feature, build: PMS5003 → ESP32 → SX1278 → Pi → SQLite → FastAPI → Dashboard.

Then add: SCD41, BME688, MQ135.

Then: confidence, adaptive sensing, AI, spatial intelligence.

This reduces integration risk.

## 85. Second Vertical Slice

After telemetry works: PMS + SCD + BME + MQ → normalized observation → quality → confidence → event → packet → gateway.

## 86. Third Vertical Slice

Then: event confidence → adaptive sampling → sampling decision stored → energy measurement → comparison against baseline.

This is the first proof of AEIOS's distinctive behavior.

## 87. Fourth Vertical Slice

Then: multiple nodes → timestamped events → fixed coordinates → spatial correlation → regional event.

## 88. Definition of Complete AEIOS V1

V1 should demonstrate: real environmental sensing, validated data, multi-modal context, node-local reasoning, adaptive sensing, LoRa telemetry, offline gateway, SQLite persistence, event detection, basic AI, spatial correlation, explainability, fault handling, power-aware behavior, reproducible testing.

## 89. What Success Looks Like

A successful demonstration should be able to show:

- "Nothing unusual is happening." → low-power normal monitoring
- "Something changed." → watch mode
- "Multiple signals agree." → event confirmation
- "The additional sensor is worth activating." → higher-information measurement
- "The event is real." → high-priority transmission
- "Multiple nodes see a related event." → regional event reconstruction
- "Here is why AEIOS believes it." → explanation

That is the complete product story.

## 90. Final Operational Rule

The coding agent should prioritize: correctness → observability → testability → maintainability → measured performance → sophistication in that order.

Do not introduce complexity merely to make the project look advanced.

At the same time, do not simplify away the core AEIOS innovation.

The implementation should remain ambitious enough to demonstrate adaptive environmental intelligence operating as a real closed-loop cyber-physical system.

## 91. Complete Context Stack

The five context files now form the AEIOS engineering constitution:

- 01 — MASTER PROJECT CONTEXT — What AEIOS is.
- 02 — HARDWARE + EMBEDDED FIRMWARE — How the physical node senses and behaves.
- 03 — COMMUNICATION + GATEWAY + DATABASE — How data moves, persists and survives failure.
- 04 — AI + ADAPTIVE SENSING + PATENT INTELLIGENCE — How AEIOS reasons and adapts.
- 05 — DEVELOPMENT + TESTING + DEPLOYMENT — How AEIOS is built, validated, released and maintained.

An AI coding agent should load all five before making major architectural decisions.

## 92. Final Agent Instruction

When working on AEIOS, do not ask only: "How do I implement this feature?"

Also ask:

- What layer owns this feature?
- What contract does it expose?
- How will it be tested?
- What happens when it fails?
- How will it be observed?
- What data proves it worked?
- Does it preserve offline operation?
- Does it respect the hardware?
- Does it preserve provenance?
- Does it preserve the adaptive intelligence loop?
- Can it be replaced later?
- Does it create unnecessary coupling?

The correct solution is the one that fits the complete AEIOS system.

## 93. Final Context File Status

Context 01/05 — COMPLETE  
Context 02/05 — COMPLETE  
Context 03/05 — COMPLETE  
Context 04/05 — COMPLETE  
Context 05/05 — COMPLETE

The context-building phase is now complete.

The next phase is implementation.

Recommended first implementation step (after conflict sign-off):

Repository scaffold → protocol/schema contracts → simulation fixtures → ESP32 sensor-driver skeleton → gateway ingestion skeleton → SQLite migrations → first end-to-end vertical slice.

Do not start with the AI model.

Start with the contracts and the smallest real data path.
