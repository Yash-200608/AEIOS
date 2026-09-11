# ADR-006: Binary LoRa Packet Protocol

- **Status:** Accepted — on-wire Protocol Version 1 **Frozen** (DOC-005 Controlled v1.0)  
- **Date:** 2026-08-01  
- **Gate:** A (decision) / **B (freeze complete)**  

## Context

Using JSON, Protocol Buffers, or CBOR on constrained LoRa links wastes airtime and energy and delays a stable firmware contract. Mesh needs routing, reliability, and authentication fields — not only a sensor payload blob.

## Decision

All LoRa mesh traffic uses a **project-defined binary protocol**. Human-readable encodings (JSON, etc.) exist **only above the gateway** (e.g., local messaging bus and APIs).

Logical layers to be specified before firmware mesh implementation:

| Layer | Contents (logical) |
|-------|--------------------|
| Link | Protocol version, packet type, flags, payload length |
| Network | Source ID, destination ID, hop count/TTL, previous hop (optional), sequence |
| Time | Timestamp, sync status |
| Payload | Sensor / command / config / ACK data |
| Integrity | CRC-16 |
| Authentication | Message Authentication Code (MAC) |

Control types include: Sensor Data, Heartbeat, ACK, NACK, Route Advertisement, Route Update, Configuration Update, Diagnostics, Time Synchronization, Emergency Alert.

**Gate B** freezes byte layout after routing design. No protocol-dependent mesh firmware until then.

## Alternatives considered

| Alternative | Why rejected for mesh |
|-------------|----------------------|
| JSON on air | Verbose, fragile |
| Protobuf/CBOR on air for v1 | Extra complexity before need; may revisit later via new ADR |
| LoRaWAN only | Star topology / stack assumptions may not match custom mesh goals |

## Rationale

Deterministic size, energy efficiency, clear versioning, room for auth and routing.

## Consequences

- Own protocol specification document required  
- Firmware serializers are hand-specified structs  
- SAD references protocol doc; Gate B checklist owns freeze  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Binary-only decision accepted; byte freeze deferred to Gate B |
| 2026-08-01 | Gate B ACCEPTED; DOC-005 v1.0 Controlled; editorial clarifications (CRC role; Link ACK vs application delivery) |
