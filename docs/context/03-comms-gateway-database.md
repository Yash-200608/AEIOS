# AEIOS — Context File 03

Communication + Gateway + Database Context

Purpose: This is the authoritative context for the AEIOS wireless protocol, gateway architecture, packet lifecycle, Raspberry Pi 5 services, SQLite data model, offline-first behavior, API boundary, reliability mechanisms, and node-to-gateway interaction. It builds directly on Context Files 01 and 02.

**Ingest status:** Canonical copy of Context File 03 (citation artifacts stripped). Draft until [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) is resolved. Does not silently override Gate A–C controlled documents.

## 1. Scope

This file defines: SX1278 433-MHz communication architecture, packet framing, schema versioning, node identity, sequence numbering, timestamps, CRC/integrity, duplicate detection, delivery semantics, retry strategy, gateway ingestion, Raspberry Pi 5 service architecture, SQLite database, database migrations, offline-first storage, replay and synchronization, gateway APIs, dashboard data contracts, configuration delivery, observability, data lifecycle, gateway failure behavior.

The gateway is an edge intelligence system, not a transparent radio relay.

## 2. System Boundary

```text
┌──────────────────────────────────────────────┐
│                  FIELD NODE                  │
│                                              │
│ Sensors → ESP32 → validation → packet       │
│                         │                    │
│                         ▼                    │
│                    SX1278 433 MHz            │
└────────────────────────┬─────────────────────┘
                         │
                         │ LoRa
                         ▼
┌──────────────────────────────────────────────┐
│               RASPBERRY PI 5                 │
│                                              │
│ LoRa Receiver                                │
│      ↓                                       │
│ Packet Decoder                               │
│      ↓                                       │
│ Integrity / Schema Validation                │
│      ↓                                       │
│ De-duplication / Sequence Analysis           │
│      ↓                                       │
│ SQLite                                      │
│      ↓                                       │
│ Feature / Event Engine                       │
│      ↓                                       │
│ AI / Spatial / Temporal Analytics            │
│      ↓                                       │
│ FastAPI / WebSocket                          │
│      ↓                                       │
│ Dashboard / Alerts / Local Tools             │
└──────────────────────────────────────────────┘
```

## 3. Communication Design Philosophy

The radio link should transmit validated, useful, versioned information rather than blindly streaming all raw data.

LoRa is a low-bandwidth communication mechanism.

Therefore AEIOS should emphasize: compact packets, event-priority telemetry, quality metadata, sequence numbers, integrity, deterministic parsing, controlled retries, explicit failure state.

The engineering blueprint describes the SX1278 as the packet-transmission link and states that the ESP32 should compress/package measurements before transmission while the gateway validates them.

## 4. Locked Radio

The AEIOS field radio is: SX1278 at 433 MHz.

The software must not silently reconfigure it to 868 or 915 MHz.

Radio frequency is a deployment configuration value, but the present project architecture is specifically built around the 433-MHz SX1278 choice.

The gateway radio must use a compatible configuration.

## 5. Node Identity

Every node requires a unique immutable logical identity.

Example: NODE-01, NODE-02, NODE-03, NODE-04.

Recommended identity structure: node_id, hardware_revision, firmware_version, configuration_version.

Example packet metadata:

```json
{
  "node_id": "NODE-03",
  "hardware_revision": "HW-A",
  "firmware_version": "0.3.0",
  "config_version": "CFG-5"
}
```

Node ID must not be derived solely from volatile runtime state.

## 6. Static Deployment Metadata

GPS/GNSS is not used.

Instead, the gateway owns deployment metadata.

Example:

```text
nodes:
  NODE-01:
    name: north_gate
    latitude: 28.xxxxxx
    longitude: 77.xxxxxx

  NODE-02:
    name: academic_block
    latitude: 28.xxxxxx
    longitude: 77.xxxxxx
```

The exact deployment coordinates are configuration data, not sensing-node measurements.

This distinction is essential:

- Node packet: node_id
- Gateway metadata: node_id → installation position

The node does not need GPS.

## 7. Time Architecture

Because there is no GPS/PPS on the node, time synchronization must be handled at the software/network level.

Each packet should contain a node-local timestamp and the gateway should also record gateway_receive_timestamp.

Therefore the database can retain measurement_time and received_at.

This enables: latency calculation, clock-drift analysis, ordering, replay, event correlation.

Possible future synchronization strategies: gateway beacon, periodic synchronization packet, configurable offset, local oscillator calibration.

The exact synchronization method remains open.

## 8. Packet Architecture

A packet should have a clear envelope:

```text
┌────────────────────────────┐
│ MAGIC                      │
├────────────────────────────┤
│ PROTOCOL VERSION            │
├────────────────────────────┤
│ MESSAGE TYPE                │
├────────────────────────────┤
│ NODE ID                     │
├────────────────────────────┤
│ SEQUENCE NUMBER             │
├────────────────────────────┤
│ TIMESTAMP                   │
├────────────────────────────┤
│ PAYLOAD LENGTH              │
├────────────────────────────┤
│ PAYLOAD                     │
├────────────────────────────┤
│ CRC                         │
└────────────────────────────┘
```

The payload can then contain measurements and metadata.

## 9. Protocol Versioning

Packet versioning is mandatory.

Never silently change packet interpretation.

Example: protocol_version = 1. Future: protocol_version = 2.

The gateway must: recognize supported versions, reject or quarantine unsupported versions, preserve raw packets for diagnostics where practical, never decode a version-2 payload using version-1 assumptions.

Packet version and firmware version are different.

protocol_version ≠ firmware_version

## 10. Message Types

Recommended initial message types: OBSERVATION, EVENT, HEARTBEAT, DIAGNOSTIC, ACK, CONFIG, CONFIG_ACK.

A node should not use one huge packet format for every purpose.

## 11. Observation Packet

Routine measurements.

Suggested fields: protocol_version, message_type, node_id, sequence, timestamp, pm1, pm25, pm10, co2, temperature_scd41, humidity_scd41, temperature_bme688, humidity_bme688, pressure, bme688_gas_feature, mq135_raw, mq135_index, quality_flags, confidence, operating_mode, sampling_interval, battery_voltage, battery_state, firmware_version, config_version, crc.

GPS fields must not exist.

Node location is resolved from gateway metadata.

## 12. Event Packet

Event packets are more important than ordinary observations.

Suggested: event_id, node_id, timestamp, event_type, severity, confidence, triggering_features, supporting_sensors, sensor_quality, operating_mode, sampling_policy, selected measurements, battery_state, sequence, protocol_version, crc.

Example:

```json
{
  "type": "EVENT",
  "event_type": "MULTIMODAL_ANOMALY",
  "node_id": "NODE-03",
  "confidence": 0.91,
  "severity": "HIGH",
  "supporting_sensors": [
    "PMS5003",
    "BME688",
    "MQ135"
  ]
}
```

## 13. Quality Flags

Quality must survive the entire data pipeline.

Potential flags: VALID, STALE, OUT_OF_RANGE, CHECKSUM_ERROR, BUS_ERROR, WARMING, CALIBRATING, DRIFT_SUSPECTED, SENSOR_FAULT, CONDENSATION_RISK, LOW_POWER, RADIO_DEGRADED, INSUFFICIENT_BASELINE.

Use a bitmask on the wire if packet size matters.

In storage, retain both quality_flags_raw and quality_flags_decoded where useful.

## 14. Sequence Numbers

Each node maintains a monotonically increasing sequence number.

Example: 1001, 1002, 1003, 1004.

Gateway behavior:

- Expected sequence: 1004 → 1005
- Gap: 1004 → 1008 records lost_sequences = 1005-1007
- Duplicate: 1008, 1008 — store one logical observation. Optionally retain duplicate telemetry in a radio diagnostics table.

## 15. Sequence Semantics

Sequence numbers are scoped to node_id + protocol stream.

Therefore duplicate detection key: (node_id, sequence_number, message_type) may be used.

The exact uniqueness constraint can be adjusted after packet testing.

## 16. CRC and Integrity

Every packet should contain a CRC covering header + payload.

The gateway must: parse enough to determine the packet frame, verify length, calculate CRC, compare, reject corrupt packets, log the rejection reason.

Corrupt packets must never enter the trusted observation tables.

## 17. Delivery Semantics

The initial system should prefer at-least-once telemetry + gateway de-duplication rather than pretending LoRa is a guaranteed delivery network.

This means: Node sends → Gateway receives → If valid: persist. If duplicate: do not duplicate observation. If missing: detect sequence gap.

Exactly-once semantics are not required on the radio.

Exactly-once logical persistence can be achieved through identifiers and database constraints.

## 18. Retry Strategy

Retries should be bounded. Do not retry forever.

Potential policy: attempt 1 → failure → wait → attempt 2 → failure → wait → attempt 3 → failure → mark unsent.

Then choose one of: queue for later, discard low-priority telemetry, preserve critical event packet.

The policy should depend on message priority.

## 19. Message Priority

Recommended priority classes: CRITICAL_EVENT, HIGH_EVENT, DIAGNOSTIC, OBSERVATION, HEARTBEAT.

Priority affects: transmission timing, retry count, batching, gateway alerting.

Example: normal reading → may be batched; high-confidence event → immediate transmission; critical system fault → immediate telemetry + retry.

## 20. Radio Collision Awareness

Multiple nodes can transmit simultaneously.

The gateway/radio architecture must therefore consider: randomized backoff, configurable reporting windows, event priority, packet airtime, retry jitter.

Avoid every node transmitting at the exact same interval after boot.

A small deterministic or pseudo-random phase offset can spread routine telemetry.

## 21. Gateway Architecture

The Raspberry Pi application should be modular.

Recommended:

```text
gateway/
│
├── receiver/
│   ├── radio_adapter
│   └── frame_receiver
│
├── protocol/
│   ├── decoder
│   ├── encoder
│   ├── validators
│   └── versioning
│
├── ingestion/
│   ├── packet_ingest
│   ├── deduplication
│   └── sequence_tracker
│
├── storage/
│   ├── database
│   ├── repositories
│   └── migrations
│
├── intelligence/
│   ├── features
│   ├── events
│   ├── spatial
│   └── analytics
│
├── api/
│   ├── rest
│   └── websocket
│
├── config/
│
└── diagnostics/
```

## 22. Gateway Ingestion Pipeline

Every packet follows:

```text
RADIO FRAME
     ↓
FRAME PARSER
     ↓
LENGTH CHECK
     ↓
CRC CHECK
     ↓
PROTOCOL VERSION CHECK
     ↓
SCHEMA VALIDATION
     ↓
NODE AUTH / ID CHECK
     ↓
DUPLICATE CHECK
     ↓
SEQUENCE ANALYSIS
     ↓
PERSIST
     ↓
PUBLISH INTERNAL EVENT
```

Never send unvalidated packets directly to the AI engine.

## 23. Trusted Data Boundary

Create a conceptual boundary:

UNTRUSTED RADIO DATA → validation → TRUSTED OBSERVATION

Only trusted observations should enter: AI, database measurements, event analysis, dashboard metrics.

Malformed packets should remain in radio_diagnostics or an equivalent quarantine/log mechanism.

## 24. SQLite — Gateway Database

Current V1 database choice: SQLite.

Why: embedded, offline, no separate server, easy backup, appropriate for the expected initial data volume, easy Python integration.

The production application should not depend on an external database connection merely to function locally.

## 25. SQLite Schema

Recommended conceptual schema:

**nodes** — node_id PK, name, site, latitude, longitude, enabled, created_at, updated_at

**firmware_versions** — version, release_notes, created_at

**sensor_readings** — id PK, node_id FK, timestamp, received_at, pm1, pm25, pm10, co2, temperature, humidity, pressure, bme688_gas_feature, mq135_raw, mq135_index, quality_flags, confidence, operating_mode, sampling_interval

**events** — event_id PK, node_id, started_at, ended_at, event_type, severity, confidence, status

**event_features** — event_id, feature_name, feature_value, contribution

**sensor_states** — id, node_id, timestamp, sensor, state, quality, heater_state, warmup_age

**sampling_decisions** — id, node_id, timestamp, previous_mode, new_mode, trigger, confidence, expected_information_gain, estimated_energy_cost, selected_sensor

**radio_packets** — id, received_at, node_id, sequence, message_type, protocol_version, rssi, snr, crc_valid, schema_valid, duplicate, raw_payload

**power_state** — id, node_id, timestamp, battery_voltage, battery_state, solar_state, operating_mode

**system_logs** — id, timestamp, component, level, code, message

## 26. Why sampling_decisions Must Be Stored

This table is especially important.

AEIOS is not only interested in what it sensed. It needs to know why it sensed at that rate.

Example:

```text
NODE-03
10:31:20

previous_mode = NORMAL
new_mode = EVENT_CONFIRMATION

trigger = BME688_GAS_CHANGE

confidence = 0.63

expected_information_gain = 0.72

estimated_energy_cost = 0.19

selected_sensor = PMS5003
```

This becomes invaluable for: debugging, experiments, model training, energy analysis, explainability, patent validation.

## 27. Database Constraints

Use database constraints wherever logical.

Examples: PRIMARY KEY, FOREIGN KEY, UNIQUE(node_id, sequence, message_type), CHECK(confidence >= 0 AND confidence <= 1).

Do not rely only on application logic.

## 28. Database Time Handling

Store timestamps in UTC-like canonical representation.

Keep timestamp and received_at separate.

Do not overwrite sensor time with gateway arrival time.

This distinction matters for: latency, ordering, temporal event reconstruction, clock drift.

## 29. Offline-First Gateway

The gateway must function when internet is completely unavailable.

Internet DOWN → LoRa still works → Database still works → AI still works where local models/data allow → Dashboard on LAN still works.

Internet connectivity is an enhancement, not a prerequisite.

## 30. Sync Model

If cloud synchronization is later introduced:

local record → sync_status = PENDING → internet available → upload → server acknowledgement → sync_status = COMPLETE.

On failure: PENDING → retry later.

Do not delete the local record merely because it was sent once.

Require acknowledgement.

## 31. Replay and Recovery

After gateway restart: database opens, ingestion service starts, radio interface initializes, system continues receiving, persisted observations remain available, pending sync records remain queued.

The gateway should not require a fresh bootstrap of historical state.

## 32. Gateway Crash Consistency

Every accepted packet should be persisted through a transaction before the system considers it safely ingested.

Conceptually: validate → BEGIN TRANSACTION → insert observation, insert diagnostics, update node state → COMMIT.

If commit fails: do not acknowledge logical ingestion.

## 33. Node State in Gateway

Gateway maintains current status: ONLINE, STALE, OFFLINE, DEGRADED, FAULT.

Example: last_seen < threshold → STALE; last_seen > larger threshold → OFFLINE.

Exact thresholds are configuration, not hard-coded business logic.

## 34. Gateway Node Registry

Each node record should include: node_id, display_name, site, deployment position, firmware, hardware revision, configuration, last_seen, last_sequence, status.

This registry is the authoritative source for node identity.

## 35. Configuration System

Gateway-managed configuration may include: sampling policy, radio settings, event thresholds, node metadata, feature toggles, sensor calibration metadata, deployment location.

Configuration should be versioned. Example: CFG-001, CFG-002, CFG-003.

The node reports which configuration it currently uses.

## 36. Configuration Delivery

Future architecture may support: Gateway → CONFIG → Node → CONFIG_ACK → Gateway.

Configuration updates must be: authenticated, versioned, validated, atomic, rollback-capable where possible.

Never allow an invalid remote configuration to brick the node.

## 37. API Architecture

Use a clean API layer.

Potential endpoints:

- GET /api/v1/nodes
- GET /api/v1/nodes/{node_id}
- GET /api/v1/nodes/{node_id}/readings
- GET /api/v1/nodes/{node_id}/events
- GET /api/v1/events
- GET /api/v1/health
- GET /api/v1/radio
- GET /api/v1/power
- GET /api/v1/analytics/summary
- GET /api/v1/analytics/trends
- GET /api/v1/analytics/spatial

Dashboard should not query SQLite directly.

Use API/service boundaries.

## 38. WebSocket / Live Data

For real-time dashboard updates: LoRa packet → database → event bus → WebSocket → dashboard.

The dashboard should not poll the entire database every second.

## 39. Internal Event Bus

The gateway can use an internal event mechanism: PacketReceived, ObservationStored, SensorFaultDetected, EventDetected, NodeStatusChanged, PowerAlert.

Subscribers may include: database, AI engine, dashboard websocket, alert manager, diagnostics.

This avoids tightly coupling the modules.

## 40. Dashboard Data Contract

The dashboard should receive semantic data.

Bad: `{ "x": 82, "y": 742 }`

Good:

```json
{
  "node_id": "NODE-03",
  "pm25": 82,
  "co2": 742,
  "confidence": 0.91,
  "status": "EVENT",
  "updated_at": "...",
  "quality": {
    "pm25": 0.96,
    "co2": 0.94
  }
}
```

## 41. Gateway AI Boundary

Do not bury AI logic in database code.

Prefer: Storage → Feature service → AI / event service → Results.

AI results should reference source observations/event IDs.

This creates traceability.

## 42. Event Lifecycle at Gateway

Example: CANDIDATE → CONFIRMING → CONFIRMED → ACTIVE → RESOLVING → RESOLVED.

Alternative: CANDIDATE → REJECTED.

The state machine should be explicit.

## 43. Event Correlation

When multiple nodes report related events:

NODE-03 10:00:00 confidence=.82  
NODE-04 10:01:20 confidence=.90  
NODE-05 10:03:10 confidence=.87  

the gateway can form a higher-level REGIONAL_EVENT.

This event references multiple node-level observations.

## 44. GPS-Less Spatial Model

Database stores nodes.latitude, nodes.longitude. The node packet does not.

Spatial analytics then operates on: node_id + fixed coordinates + event timestamp + confidence + measurements.

Potential outputs: event centroid, source region, propagation direction, estimated velocity, spatial confidence.

The exact algorithm remains open.

## 45. Radio Quality Storage

Every received packet should preserve at least: RSSI, SNR, received_at.

This enables: range analysis, dead-zone detection, antenna debugging, node-health interpretation, link-aware scheduling later.

## 46. Gateway Health

Gateway diagnostics should include: uptime, CPU temperature, CPU load, memory, disk usage, database size, radio state, received packets, invalid packets, duplicate packets, sequence gaps, AI latency, API latency.

## 47. Logging

Use structured logs.

Example:

```json
{
  "timestamp": "...",
  "component": "packet_ingest",
  "level": "WARNING",
  "code": "CRC_FAILURE",
  "node_id": "NODE-03"
}
```

Prefer machine-readable logs for gateway services.

Human-readable console output remains useful for development.

## 48. Data Retention

Define data tiers.

- Raw radio data — retain long enough for debugging/provenance.
- Normal observations — potentially retain for long-term analysis.
- Derived features — retain if useful for model training.
- Events — retain long-term.
- Logs — shorter rolling retention.

Storage policy should be configurable.

## 49. Database Indexes

Expected indexes: sensor_readings(node_id, timestamp), events(node_id, started_at), radio_packets(node_id, sequence), sampling_decisions(node_id, timestamp), system_logs(timestamp).

Do not over-index before observing real workload.

## 50. Database Migration Strategy

Use explicit migrations.

Example:

```text
migrations/
  001_initial_schema.sql
  002_add_quality_flags.sql
  003_add_sampling_decisions.sql
```

Application should know current schema version.

Never manually modify the production database without a migration.

## 51. Data Model Versioning

Maintain: packet_schema_version, database_schema_version, firmware_version, model_version, configuration_version.

These are separate.

For an AI result, ideally retain model_version and feature_version so old predictions remain reproducible.

## 52. Model/Data Provenance

Every AI-derived event should be traceable to: source observation IDs, feature version, model version, configuration version, timestamp.

Example:

```json
{
  "event_id": "EVT-0042",
  "model_version": "event-model-0.3",
  "feature_version": "features-0.2",
  "source_window": {
    "start": "...",
    "end": "..."
  }
}
```

This is essential for professional explainability.

## 53. Security Boundary

Even on a local network: validate packet lengths, validate packet versions, validate node IDs, do not execute payload content, sanitize API parameters, protect configuration endpoints, limit remote control, authenticate future configuration updates.

The LoRa payload should be treated as untrusted input.

## 54. Development Database vs Production Database

Development: aeios_dev.db  
Production: /var/lib/aeios/aeios.db

Do not let development tests overwrite production data.

Use explicit environment/configuration selection.

## 55. SQLite MCP Relationship

A SQLite MCP server may be used by the development coding agent.

It can help with: schema inspection, test data, queries, migrations, debugging, validation.

But: SQLite MCP is not part of the deployed AEIOS gateway runtime.

Production AEIOS uses SQLite directly through the application.

## 56. MQTT — Optional, Not Core

MQTT is not required for the initial LoRa path.

The primary path is: SX1278 → gateway receiver → local application → SQLite.

MQTT may later be useful for: internal service separation, dashboard integrations, external consumers, experimentation.

Do not introduce MQTT simply because it exists.

## 57. Containerization

Docker can be useful on the development machine and potentially the gateway.

Potential services: gateway-core, api, ai, dashboard.

But V1 should not become operationally fragile because of unnecessary container orchestration.

A simple native Pi deployment may be preferable initially.

## 58. Gateway Service Structure

Possible runtime: aeios-radio.service, aeios-gateway.service, aeios-api.service, aeios-worker.service.

Or a unified process where that is simpler.

The architecture should permit either.

## 59. Graceful Shutdown

Gateway shutdown should: stop accepting new work, finish in-flight database transactions, close radio interface, flush logs, close database, persist internal state where needed.

## 60. Startup Recovery

On restart: load node registry, load last sequence values, load pending operations, initialize database, initialize radio, start ingestion, start event services, start API.

The gateway should recover from interrupted operation without corrupting event state.

## 61. Gateway-to-Node Command Boundary

The gateway may eventually issue: CONFIG, REQUEST_STATUS, REQUEST_DIAGNOSTIC, SYNC_TIME.

Do not begin with unrestricted command execution.

Every command should have: command_id, node_id, command_type, payload, timestamp, configuration/protocol version, and require acknowledgement where appropriate.

## 62. Packet Compression

Compression should be considered carefully.

Because payloads are small, compact binary encoding may be preferable to generic compression.

Potential strategy: binary fixed/optional fields + bit-packed flags + integer scaling.

Do not optimize prematurely.

First establish a clear protocol.

## 63. Raw Payload Preservation

For diagnostics, the gateway should be able to preserve the raw packet payload for a configurable retention period.

This allows: decoding bugs, protocol migrations, forensic analysis, packet corruption debugging.

## 64. Protocol Evolution

A protocol change requires: version bump, migration strategy, gateway compatibility, firmware compatibility matrix.

Avoid breaking all deployed nodes for one new field.

Possible mechanism: message type, schema version, optional field bitmap.

## 65. Gateway Test Matrix

Minimum: GW-001 valid packet, GW-002 invalid CRC, GW-003 invalid length, GW-004 unsupported version, GW-005 duplicate sequence, GW-006 missing sequence, GW-007 out-of-order packet, GW-008 unknown node, GW-009 database restart, GW-010 database write failure, GW-011 gateway restart, GW-012 internet outage, GW-013 event correlation, GW-014 stale node detection, GW-015 RSSI/SNR recording, GW-016 configuration acknowledgement.

## 66. End-to-End Test

The ideal end-to-end test:

Simulated / real sensor event → ESP32 changes sampling → event packet formed → SX1278 transmits → gateway receives → CRC passes → schema passes → database transaction succeeds → event engine updates → API updates → dashboard displays event.

Every stage should be observable.

## 67. Offline Scenario

Test: Internet disabled → Node sends → Pi receives → SQLite stores → AI processes → Dashboard on local network still works.

Then: Internet restored → optional sync → records remain deduplicated.

No data should disappear merely because the internet was unavailable.

## 68. Node Offline Scenario

If a node disappears: last_seen → stale → offline.

Gateway should not interpret missing data as zero.

This is critical: missing ≠ zero.

## 69. Invalid Sensor Scenario

If MQ135 fails: MQ135 unavailable → quality flag → event engine removes / reduces MQ135 contribution → other sensors continue → gateway knows MQ135 is unavailable.

Do not fabricate a neutral value.

## 70. Regional Event Scenario

Example: NODE-03 → event confidence .82; NODE-04 → .90; NODE-05 → .87.

Gateway: Temporal correlation + static node coordinates + confidence weighting → REGIONAL EVENT.

The exact spatial model is Context 04.

## 71. Data Lifecycle

RADIO → RAW PACKET → VALIDATED PACKET → OBSERVATION → FEATURE → EVENT → ANALYTIC RESULT → DASHBOARD / ALERT

Every transition should be traceable.

## 72. No Silent Data Mutation

If the gateway corrects/calibrates a value, store both where practical: raw_value, processed_value, correction_version.

For example: pm25_raw, pm25_corrected, correction_model_version.

This preserves scientific traceability.

## 73. Database + AI Integration

AI should query views/services rather than raw tables everywhere.

Example: FeatureService → FeatureFrame → EventModel.

The model should not know SQL table names.

This makes model code testable.

## 74. Gateway API + AI Separation

Recommended:

API → Application Service → Repository / Service → Database

AI: AI Service → Feature Service → Repository

Avoid: FastAPI endpoint → SQL directly → AI directly because it creates unmaintainable coupling.

## 75. Observability

At every stage expose: counts, latencies, errors, states, throughput.

Potential metrics: packets_received_total, packets_valid_total, packets_invalid_total, duplicates_total, sequence_gaps_total, events_detected_total, db_write_latency, ai_inference_latency, api_request_latency, node_online_count.

Prometheus is optional.

SQLite/system logs are sufficient for early development.

## 76. Development Tooling

Recommended stack:

- Python: FastAPI, Pydantic, SQLAlchemy or sqlite3, pytest
- ESP32: **ESP-IDF only** (C-21 / ADR-002). Arduino is not approved. PlatformIO is not a separate AEIOS firmware architecture.
- Gateway: systemd (field) or Docker (dev) — ADR-016

Historical ingest text allowed “PlatformIO or Arduino-compatible”; that wording is superseded.

## 77. Coding Rule — No Business Logic in Drivers

Incorrect: `if (pm25 > 80) { turnOnMQ135(); }` inside PMS5003 driver.

Correct: PMS5003 Driver → observation → Processing → feature → Confidence Engine → event confidence → Adaptive Policy → action → MQ135 Controller.

Drivers expose facts. Policies make decisions.

## 78. Coding Rule — Gateway Validates Again

Even if the node validates data, the gateway must validate independently.

The network boundary is untrusted.

Node and gateway must not share blind assumptions.

## 79. Coding Rule — Schema First

Before implementing ingestion, define: packet schema, database schema, observation model, event model.

Then code against those contracts.

This prevents later rewrites.

## 80. Creativity Is Open

Potential future additions include: local message broker, higher-performance time-series database, MQTT bridge, cloud sync, remote fleet management, signed firmware, predictive communication scheduling, gateway-side digital twins, graph-based node event correlation, event replay tools, database-backed experiment runner.

None are mandatory.

Do not add complexity solely because it is fashionable.

## 81. Definition of Gateway V1 Complete

V1 is complete when the gateway can:

- Receive SX1278 packets.
- Validate frame integrity.
- Validate schema version.
- Validate node identity.
- Detect duplicates.
- Detect sequence gaps.
- Store trusted observations in SQLite.
- Store radio quality metadata.
- Track node online/offline state.
- Persist event records.
- Operate without internet.
- Survive restart without corrupting data.
- Provide a clean API.
- Supply real-time data to the dashboard.
- Preserve enough provenance for AI/explainability.
- Support simulated and real node inputs.
- Expose diagnostics.

## 82. Context 03 Rules for the Coding Agent

When implementing gateway or communication code:

- Never trust the radio payload.
- Never assume delivery.
- Never equate missing data with zero.
- Never discard quality metadata.
- Never store location inside the node measurement as if GPS exists.
- Never couple the dashboard directly to SQLite.
- Never make AI depend on SQL implementation details.
- Never silently change protocol interpretation.
- Never let internet connectivity become mandatory.
- Never let one malformed packet crash the gateway.
- Never lose the reason behind an adaptive sensing decision.

## 83. Next Context File

Context File 04 — AI + Adaptive Sensing + Patent-Aware Intelligence Context.

It will define: feature engineering, baselines, cross-modal confidence, event detection, sensor fault vs environmental event, MQ135 contextual interpretation, information-value-per-energy, adaptive policy, sensor role switching, energy-aware sensing, event confidence, spatial/temporal intelligence, prediction, anomaly detection, explainability, model selection, training data, evaluation metrics, and how the software architecture preserves the project's patent-relevant technical interactions.

Context 04 should build directly on the observation/event/provenance contracts defined here.
