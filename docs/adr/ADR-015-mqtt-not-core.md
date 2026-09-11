# ADR-015: MQTT Is Not on the Core v1 Ingestion Path

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-12)

## Context

DOC-004 lists Eclipse Mosquitto as required. SAD and the gateway README describe MQTT as the ingestion fabric. Context File 03 forbids adding MQTT merely because a broker exists. The field path is LoRa → validate → SQLite.

## Decision

**Core v1 path:**

```text
SX1278 → radio interface → packet validation → ingestion
      → SQLite (trusted vs quarantine) → intelligence → API / WebSocket
```

Use an **in-process event bus** for PacketReceived, ObservationStored, EventDetected, NodeStatusChanged.

MQTT is **out of v1 core**. It may be added later as an optional integration bridge (new ADR), not as a prerequisite for reception, persistence, local AI, or LAN dashboard.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Mosquitto required in v1 | Extra failure domain; not needed for LoRa→SQLite |
| Dashboard polling SQLite | Violates API boundary (ADR-014) |

## Rationale

Fewer moving parts on the Pi. The radio boundary is already untrusted; a broker does not make it safer.

## Consequences

- DOC-004 MQTT **Required** needs a controlled revision.
- Gateway README must not describe MQTT as the primary ingest path.
- SAD communication-fabric diagram remains historical until change-control.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted |
