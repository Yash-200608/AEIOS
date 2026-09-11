# AEIOS Mesh Protocol Specification

**Document ID:** DOC-005  
**Title:** AEIOS Binary Mesh Protocol (AMP)  
**Version:** 1.0  
**On-wire Protocol Version:** **1**  
**Status:** Controlled — Gate B ACCEPTED (2026-08-01); Protocol Version 1 Frozen  
**Date:** 2026-08-01  
**References:** ADR-006, SRS FR-COM-*, SAD §5, VERSIONING.md  

---

## 1. Purpose

Define the contractual binary on-air interface between AEIOS nodes and the gateway radio bridge. After Gate B freeze, firmware, gateway parser, tests, and ICD-001/002 MUST conform to this document.

**Non-goals:** LoRaWAN compatibility; firmware image transfer (ADR-003); JSON/CBOR/Protobuf on air.

---

## 2. Design goals

| Goal | Mechanism |
|------|-----------|
| Compact | Fixed header + typed payloads |
| Routable | Dest, TTL/hop, prev-hop optional |
| Reliable (selective) | ACK/NACK + sequence + retries |
| Authentic | MAC over header+payload |
| Integer | CRC-16 over header+payload (before MAC) |
| Extensible | Packet type + flags; unknown types ignored by v1 nodes if not addressed to them |
| Energy aware | Short frames; duty-cycle friendly defaults |

---

## 3. Conventions

- Endianness: **little-endian** for all multi-byte integers  
- Bit numbering: bit 0 = LSB  
- Time: **Unix epoch seconds** (uint32) unless noted; sync quality in flags  
- Node ID: **uint16** (0x0000 reserved; 0x0001–0xFFFE nodes; **0xFFFF = broadcast**; **0x0002 recommended default Gateway ID** for v1 single-gateway sites)  
- Gateway ID for v1: **0x0002** (configurable in NVS; must not collide)  

---

## 4. Physical / link assumptions (informative)

| Parameter | v1 guidance |
|-----------|-------------|
| Radio | SX1276 / RFM95W class |
| Band | Regional ISM as licensed/allowed (document per deployment) |
| Modulation | LoRa CSS |
| Max PSDU | **64 bytes** total frame (header + payload + CRC + MAC) for v1 |
| Spreading | Configurable; adaptive SF is future (flag reserved) |

Implementations MUST reject frames exceeding Max PSDU.

---

## 5. Frame layout (Protocol Version 1)

```text
+------------------+------+
| Fixed Header     | 20 B |
+------------------+------+
| Payload          | 0–34 |
+------------------+------+
| CRC-16           |  2 B |
+------------------+------+
| MAC              |  8 B |
+------------------+------+
Max total frame = 64 bytes
```

### 5.1 Fixed header (20 bytes) — CANONICAL

| Offset | Len | Field | Type | Notes |
|--------|-----|-------|------|-------|
| 0 | 1 | magic | u8 | `0xAE` |
| 1 | 1 | version | u8 | `1` |
| 2 | 1 | type | u8 | §6 |
| 3 | 1 | flags | u8 | §5.2 |
| 4 | 1 | payload_len | u8 | 0..34 |
| 5 | 1 | sync_status | u8 | §5.3 |
| 6 | 2 | src | u16 | |
| 8 | 2 | dst | u16 | |
| 10 | 2 | prev_hop | u16 | `0` if origin |
| 12 | 1 | ttl | u8 | |
| 13 | 1 | hop_count | u8 | |
| 14 | 2 | seq | u16 | |
| 16 | 4 | timestamp | u32 | Unix seconds |

Overhead = 20 + 2 + 8 = **30 bytes**. Max payload = **34 bytes**.  
Receivers MUST drop frames where `payload_len > 34` or total length ≠ `20 + payload_len + 10`.

### 5.2 Flags (bitfield)

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | ACK_REQ | Sender requests **Link ACK** for this packet (§9.2) |
| 1 | PRIORITY | Emergency / high priority (queues prefer) |
| 2 | ENCRYPTED | Payload encrypted (v1: **MUST be 0**; reserved) |
| 3 | FROM_GW | Set if originated at gateway |
| 4 | FRAGMENT | Fragment present (v1: **MUST be 0**; fragmentation prohibited; reserved for future) |
| 5–7 | RFU | Must be 0 in v1 transmitters; ignore on RX |

### 5.3 sync_status

| Value | Meaning |
|-------|---------|
| 0 | Clock unsynchronized / unknown quality |
| 1 | Synchronized to gateway within design tolerance |
| 2 | Synchronized via multi-hop relay estimate |
| 3–255 | RFU |

---

## 6. Packet types

| Code | Name | Direction (typical) | ACK_REQ default | Payload |
|------|------|---------------------|-----------------|---------|
| 0x01 | SENSOR_DATA | Node → GW | 1 | §7.1 |
| 0x02 | HEARTBEAT | Node → GW | 0 | §7.2 |
| 0x03 | ACK | Any → Any | 0 | §7.3 |
| 0x04 | NACK | Any → Any | 0 | §7.4 |
| 0x05 | ROUTE_ADV | Node ↔ Node/GW | 0 | §7.5 |
| 0x06 | ROUTE_UPDATE | Node ↔ Node/GW | 0 | §7.6 |
| 0x07 | CONFIG_UPDATE | GW → Node | 1 | §7.7 |
| 0x08 | DIAGNOSTICS | Node ↔ GW | 1 | §7.8 |
| 0x09 | TIME_SYNC | GW → Node (flood) | 0 | §7.9 |
| 0x0A | EMERGENCY_ALERT | Node → GW | 1 | §7.10 |
| 0x0B | RFU | — | — | reserved |
| 0x0C–0x0F | RFU (core extension band) | — | — | reserved for future core protocol extensions; v1 MUST NOT emit |
| 0x10–0xEF | RFU | — | — | drop if unknown & not forward-all |
| 0xF0–0xFF | Vendor/test | Lab only | — | not in production |

**Forwarding rule:** Nodes forward packets not destined to themselves if `ttl > 0` after decrement, toward next hop per routing table, except ACK/NACK which are single-hop unless noted.

---

## 7. Payload formats

All payloads packed little-endian, tightly packed unless noted.

### 7.1 SENSOR_DATA (0x01) — 32 bytes typical

| Offset | Len | Field | Type | Unit / encoding |
|--------|-----|-------|------|-----------------|
| 0 | 2 | pm25 | u16 | µg/m³ × 10 |
| 2 | 2 | pm10 | u16 | µg/m³ × 10 |
| 4 | 2 | temp_c | i16 | °C × 100 |
| 6 | 2 | rh | u16 | %RH × 100 |
| 8 | 2 | pressure | u16 | hPa × 10 |
| 10 | 2 | gas_res | u16 | sensor raw / kΩ scaled per driver doc |
| 12 | 2 | co2_ppm | u16 | ppm |
| 14 | 1 | batt_pct | u8 | 0–100 |
| 15 | 1 | status_flags | u8 | §7.1.1 |
| 16 | 2 | sample_id | u16 | monotonic sample counter |
| 18 | 2 | reserved | u16 | 0 |
| 20 | 4 | reserved2 | u32 | 0 |
| 24 | 8 | optional_ext | — | omit if payload_len=24; include up to 34 |

**v1 mandatory length:** `payload_len = 20` (through sample_id) **or** `24` with reserved zeroed. Prefer **24** for alignment.

#### 7.1.1 status_flags

| Bit | Meaning |
|-----|---------|
| 0 | PM sensor fault |
| 1 | BME fault |
| 2 | SCD41 fault |
| 3 | Battery low |
| 4 | Sample invalidated |
| 5–7 | RFU |

### 7.2 HEARTBEAT (0x02) — 8 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 1 | batt_pct |
| 1 | 1 | status_flags (same bits) |
| 2 | 1 | uptime_hours (sat at 255) |
| 3 | 1 | link_quality (0–100 estimate) |
| 4 | 2 | parent_or_nexthop |
| 6 | 2 | fw_abi | firmware ABI / semver packed (major<<8\|minor) |

### 7.3 ACK (0x03) — 4 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 2 | ack_seq | sequence being acknowledged |
| 2 | 1 | ack_type | original type |
| 3 | 1 | code | 0 = OK |

### 7.4 NACK (0x04) — 4 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 2 | nack_seq |
| 2 | 1 | nack_type |
| 3 | 1 | reason | 1=CRC 2=MAC 3=busy 4=unsupported 5=ttl 6=queue full |

### 7.5 ROUTE_ADV (0x05) — 12 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 2 | advertiser |
| 2 | 2 | toward_gateway_cost | composite cost |
| 4 | 1 | hop_to_gw |
| 5 | 1 | seq_r | route seq |
| 6 | 2 | next_hop_suggest |
| 8 | 4 | reserved |

### 7.6 ROUTE_UPDATE (0x06) — 12 bytes

Same layout as ROUTE_ADV; used when cost changes significantly or link breaks.

### 7.7 CONFIG_UPDATE (0x07) — variable ≤ 34

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 1 | config_id | §7.7.1 |
| 1 | 1 | value_len |
| 2 | N | value | raw |

#### 7.7.1 config_id (v1)

| ID | Meaning | value |
|----|---------|-------|
| 1 | sample_interval_s | u16 |
| 2 | heartbeat_interval_s | u16 |
| 3 | tx_power_index | u8 |
| 4 | alert_pm25_thresh | u16 (×10) |
| 5 | alert_temp_thresh | i16 (×100) |
| 6 | duty_profile | u8 enum |
| 7 | request_diag | u8 |
| 8 | restart | u8 magic 0xA5 |

CONFIG_UPDATE MUST set ACK_REQ. Node responds ACK/NACK.

### 7.8 DIAGNOSTICS (0x08)

**Request** (GW→Node), payload 2 bytes: `diag_code`, `param`  
**Response** (Node→GW), payload up to 34 bytes opaque per diag_code table in ICD-001 (battery mV, reset reason, queue depth, last RSSI, etc.).

### 7.9 TIME_SYNC (0x09) — 8 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 4 | gateway_unix |
| 4 | 2 | sync_id |
| 6 | 1 | max_hop_skew_bound_s |
| 7 | 1 | reserved |

Nodes update clock if `FROM_GW` and MAC valid; set sync_status accordingly; may rebroadcast with TTL rules in §8.

### 7.10 EMERGENCY_ALERT (0x0A) — 12 bytes

| Offset | Len | Field |
|--------|-----|-------|
| 0 | 1 | alert_class | 1=env 2=health 3=security |
| 1 | 1 | severity | 1–5 |
| 2 | 2 | code | alert code |
| 4 | 2 | pm25 | snapshot ×10 |
| 6 | 2 | temp_c | ×100 |
| 8 | 2 | co2_ppm |
| 10 | 2 | batt_pct\|flags | batt in low byte |

PRIORITY flag MUST be set. ACK_REQ MUST be set.

---

## 8. Routing (v1 algorithm)

### 8.1 Roles

- **Gateway:** ID default `0x0002`; destination for uplink telemetry  
- **Node:** maintains `next_hop_to_gw`, `cost_to_gw`, `route_seq`  

### 8.2 Cost metric (v1)

`cost = hop_count_to_gw * 16 + (100 - link_quality)` using last successful RX quality from neighbor. Lower is better.

### 8.3 Discovery

1. Gateway emits periodic ROUTE_ADV (or TIME_SYNC piggyback allowed later) with `hop_to_gw=0`, `cost=0`.  
2. Nodes rebroadcast ROUTE_ADV with updated cost if improved path found (hysteresis: switch only if new_cost + margin < old_cost; margin default 8).  
3. On parent loss (missed heartbeats / NACKs), node marks route stale and accepts higher-cost alternatives.

### 8.4 Forwarding

On RX of frame with `dst` ≠ self and ≠ broadcast processing:

1. Verify CRC; verify MAC (using network key); else drop + optional NACK if single-hop feasible  
2. If `ttl == 0` after would-decrement: drop  
3. Decrement `ttl`; increment `hop_count`; set `prev_hop` to self  
4. **Do not recompute MAC** if using end-to-end MAC (see §10) — forward opaque authenticated datagram  
5. Transmit to `next_hop_to_gw` if `dst` is gateway; else lookup route to `dst` (v1: primarily uplink to GW)

**v1 simplification:** Only require robust **uplink to gateway** and **downlink from gateway to addressed node**. Node-to-node app traffic WON'T for v1.

### 8.5 Broadcast

`dst = 0xFFFF`: process locally if type is TIME_SYNC / ROUTE_ADV; forward if `ttl` allows and not looped (`prev_hop` / recent seq cache).

---

## 9. Reliability

### 9.1 Sequence numbers

Per-source monotonic `seq` (uint16 wrap). Receivers keep last-seen window (size 32) for duplicate suppression and replay defense.

### 9.2 Acknowledgement model (NORMATIVE)

Two acknowledgement concepts exist. They MUST NOT be conflated:

| Concept | Name | What it confirms | On-wire in v1 |
|---------|------|------------------|---------------|
| **Transport / Link ACK** | Hop-by-hop ACK (`type=0x03`) | The **previous hop → next hop** transmission of this frame succeeded (neighbor received a CRC-valid, MAC-valid frame and accepted it for local processing or forward) | **Required** when `ACK_REQ=1` |
| **Application delivery** | Gateway acceptance | The **gateway** successfully **validated, accepted, and stored** (or otherwise durably ingested) the packet for the data plane | **Not an on-wire AMP packet in v1**; may be observed via gateway logs/API/diagnostics. A future protocol revision MAY add an explicit application-ACK type (new ADR + version bump) |

**Link ACK** alone does **not** mean the gateway has stored the sample. Multi-hop paths only guarantee progress hop-by-hop; durable acceptance is an application-plane property at the gateway.

### 9.3 Link ACK / retry

If `ACK_REQ`:

- Retries: **3** attempts  
- Timeout base: **2 s** × 2^attempt (capped 8 s), plus random 0–200 ms jitter  
- On final failure: buffer in store-and-forward if SENSOR_DATA / EMERGENCY; else drop with diag counter  

Link ACK/NACK are sent to the previous hop (`prev_hop`, or `src` if `hop_count==0`). **v1 uses hop-by-hop Link ACK only** for `ACK_REQ` frames to reduce long-path loss.

### 9.4 Store-and-forward

Nodes MUST queue SENSOR_DATA and EMERGENCY_ALERT when no route / TX fail, FIFO with drop-oldest under memory pressure; EMERGENCY never dropped before SENSOR. Minimum retention target per NFR-OFF-002 (capacity documented in firmware design).

---

## 10. Integrity and authentication

### 10.1 CRC-16

- Algorithm: **CRC-16/CCITT-FALSE** (poly 0x1021, init 0xFFFF, refin/refout false, xorout 0x0000)  
- Coverage: bytes `[0 .. 20 + payload_len - 1]` (on-wire header + payload)  
- Placement: immediately after payload  

**CRC protects the transmitted frame on each hop against accidental corruption only. Authentication and end-to-end integrity are provided solely by the MAC.**

### 10.2 MAC

- Algorithm: **HMAC-SHA256** truncated to **8 bytes** (leftmost)  
- Key: 128-bit network key `K_net` provisioned at install (expand to HMAC key per ICD security note)  
- Input: immutable header view \|\| payload (see §10.3)  
- Placement: last 8 bytes of frame  

**v1:** Single shared network key acceptable for prototype; per-node keys SHOULD follow before wide deployment (NFR-SEC-002).  

Intermediate nodes that share `K_net` MUST verify the MAC before forwarding.

### 10.3 Hop-mutable fields vs MAC (NORMATIVE)

Mutable in transit: `ttl`, `hop_count`, `prev_hop`.  

**Authenticated immutable region:** magic, version, type, flags (implementations MUST NOT clear PRIORITY or set FRAGMENT in v1), payload_len, sync_status, src, dst, seq, timestamp, payload.  

**Wire CRC (NORMATIVE):** Computed over the **on-wire** header (including actual `ttl`, `hop_count`, `prev_hop`) + payload. Detects accidental corruption on the current hop. Forwarders **recompute wire CRC** after mutating hop fields.

**MAC (NORMATIVE):**  
`MAC = trunc64(HMAC-SHA256(K_net, H_imm || payload))`  

where `H_imm` is the 20-byte header with `ttl`, `hop_count`, and `prev_hop` **set to zero**. Transmitters compute MAC with those zeros. Forwarders MUST NOT recalculate MAC when updating hop fields. Verifiers zero those three fields before verifying.

**CRC protects the transmitted frame on each hop against accidental corruption only. Authentication and end-to-end integrity of the immutable datagram are provided solely by the MAC.**

---

## 11. Replay protection

Receivers drop packets with `seq` inside the last-seen duplicate window for `(src, type)` or with `timestamp` older than **T_replay** (default **300 s**) relative to local synchronized clock when `sync_status ≥ 1`. If unsynced, rely on seq window only.

Commands (CONFIG_UPDATE, restart) MUST enforce both.

---

## 12. Time synchronization

- Gateway sends TIME_SYNC periodically (default 1 hour) and on join  
- Nodes adopt gateway time if MAC OK  
- SENSOR_DATA timestamps use node clock; gateway stores both device time and receive time  

---

## 13. Security threat mapping (brief)

| Threat | Control |
|--------|---------|
| Corruption (accidental) | CRC-16 (per hop; not a security control) |
| Spoofing / tampering | MAC |
| Replay commands | seq window + timestamp window |
| Firmware abuse over mesh | Not supported (ADR-003) |

Full threat model remains in SAD security section expansion.

---

## 14. Conformance levels

| Level | Required types |
|-------|----------------|
| Node v1 | 0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x09, 0x0A |
| Gateway v1 | All above + emit 0x05/0x06/0x07/0x09 |

---

## 15. Test vectors (normative examples)

### 15.1 Empty HEARTBEAT skeleton

Implementations SHALL provide golden vectors in `tests/firmware/protocol/` at implementation time:

- Known header bytes  
- Known payload  
- Known CRC  
- Known MAC for test key `K_net = 16 × 0x11`  

*(Vectors to be filled mechanically during firmware bring-up; Gate B freeze locks algorithms and field layout above.)*

---

## 16. Gate B freeze checklist

| Item | Locked in this doc |
|------|--------------------|
| Endianness | Yes |
| Max frame 64 B / max payload 34 B | Yes |
| Header 20 B fields | Yes |
| Type codes | Yes |
| SENSOR_DATA encoding | Yes |
| CRC algorithm + “corruption-only” role clarified | Yes |
| MAC algorithm + mutable field rule | Yes |
| Link ACK vs application delivery distinguished | Yes |
| Hop-by-hop Link ACK policy | Yes |
| Uplink-centric routing metric | Yes |
| No on-air encryption (flag RFU) | Yes |
| FRAGMENT flag reserved (must be 0 in v1) | Yes |
| Type 0x0C–0x0F reserved for core extensions | Yes |
| No firmware image type | Yes |

---

## 17. Protocol version compatibility

| On-wire version | v1 gateway | v1 node |
|-----------------|------------|---------|
| 1 | Accept and process | Accept and process |
| ≠ 1 | Reject; increment diag counter; MAY emit DIAGNOSTICS/NACK reason=unsupported | Reject; do not forward |

Future Protocol Version 2 requires a new ADR and DOC-005 major revision per VERSIONING.md.

---

## 18. Open items (deferred; non-breaking)

| Item | Default if frozen now |
|------|------------------------|
| Exact ISM channel plan | Deployment-specific annex |
| Per-node keys | Deferred; shared K_net v1 |
| Adaptive SF | RFU |
| On-wire application-delivery ACK | Not required v1 (§9.2) |
| Hex dump appendix / golden vectors | Required at firmware bring-up under `tests/` |

---

## 19. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | AEIOS engineering | 2026-08-01 | Applied editorial clarifications |
| Comms reviewer | Design review | 2026-08-01 | Gate B ACCEPTED WITH clarifications |
| Gate B approver | Project review | 2026-08-01 | **ACCEPTED** — Protocol Version 1 Frozen |

**Effect:** DOC-005 is **Controlled**. ICD-001/002 may be completed. Mesh firmware may begin against on-wire version 1. Incompatible changes require new ADR + protocol version increment.
