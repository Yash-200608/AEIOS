# ADR-009: SX1278 at 433 MHz, Star Topology, AMP Codec Retained

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-04, C-14)  
- **Does not supersede:** [ADR-006](ADR-006-binary-lora-protocol.md) (on-wire AMP remains Protocol Version 1)

## Context

The technology baseline listed SX1276 / RFM95W class radios without a locked ISM band. Context Files 01–03 lock **SX1278 at 433 MHz** and a node-to-gateway star for v1. Rewriting DOC-005 (AMP) would break Gate B freeze, host golden tests, and ICD-001/002.

## Decision

1. **Physical radio for v1:** Semtech SX1278, **433 MHz only**. Do not configure 868 MHz or 915 MHz.
2. **v1 topology:** node-to-gateway **star**. Multi-hop mesh remains a future AMP capability, not a v1 deployment requirement.
3. **On-wire contract:** keep frozen AMP (DOC-005 Protocol Version 1): 20-byte header, CRC-16, HMAC MAC, ACK/NACK/retry, `uint16` node IDs (gateway default `0x0002`).
4. **Separation:** AMP codec stays radio-agnostic. The SX1278 driver owns SPI/modem parameters only.
5. **Human identity:** gateway registry maps `wire_id` (uint16) to `display_id` (e.g. `NODE-03`). Strings are not on the air.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| New star envelope replacing AMP | Breaks Gate B, golden vectors, and ICD-001 |
| 868/915 MHz | Contradicts locked hardware and procurement |
| LoRaWAN | Star assumptions and stack do not match AMP |

## Rationale

Locks the radio that will be wired, without discarding a frozen, tested codec. Star v1 reduces routing risk while leaving AMP room for mesh later.

## Consequences

- Technology Baseline (DOC-004) radio row requires a controlled revision (see [CONTROLLED_DOC_CHANGE_QUEUE.md](CONTROLLED_DOC_CHANGE_QUEUE.md)).
- SAD “LoRa mesh” wording remains historical until that revision.
- Firmware BSP / radio driver target SX1278 @ 433 MHz (ADR-013 pins).
- Do not rewrite [AMP_PROTOCOL_SPEC.md](../sad/protocol/AMP_PROTOCOL_SPEC.md) in this change.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted — conflict matrix C-04 / C-14 |
