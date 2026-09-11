# ICD-001 — Node ↔ Mesh (AMP)

**ICD ID:** ICD-001  
**Version:** 1.0  
**Status:** Active (post–Gate B)  
**Depends on:** DOC-005 Controlled (AMP Protocol Version 1)  
**Date:** 2026-08-01  

---

## 1. Purpose

Contract for **sensor-node firmware** encoding/decoding and transmitting AEIOS Mesh Protocol (AMP) frames on the LoRa air interface.

---

## 2. Governing specification

All on-wire layouts, algorithms, and behaviors are defined in DOC-005. This ICD does not redefine bytes; it assigns **ownership and mandatory behaviors** to the node.

---

## 3. Modes

| Mode | AMP behavior |
|------|----------------|
| Deployment | LoRa only; full AMP uplink/downlink as below |
| Maintenance / Install | AMP may be idle; GNSS/config via maintenance channel per ADR-007 |

---

## 4. Mandatory packet support (Node v1)

| Type | TX | RX | Notes |
|------|----|----|-------|
| SENSOR_DATA (0x01) | Yes | No (v1) | ACK_REQ=1 |
| HEARTBEAT (0x02) | Yes | No | |
| ACK (0x03) | Yes | Yes | Link ACK only |
| NACK (0x04) | Yes | Yes | |
| ROUTE_ADV (0x05) | Yes | Yes | |
| ROUTE_UPDATE (0x06) | Yes | Yes | |
| CONFIG_UPDATE (0x07) | No | Yes | Apply + Link ACK/NACK |
| DIAGNOSTICS (0x08) | Yes (response) | Yes (request) | |
| TIME_SYNC (0x09) | May rebroadcast | Yes | |
| EMERGENCY_ALERT (0x0A) | Yes | No | PRIORITY + ACK_REQ |

Node MUST reject / not emit on-wire version ≠ 1. FRAGMENT flag MUST be 0. Types 0x0C–0x0F MUST NOT be emitted.

---

## 5. Encode / decode ownership

| Step | Owner |
|------|-------|
| Sample → SENSOR_DATA payload | `firmware/sensors` + packer |
| Header fill (src, seq, timestamp, sync_status) | `firmware/communication` |
| MAC compute (immutable view) | `firmware/communication` |
| Wire CRC compute | `firmware/communication` |
| TX / RX radio | LoRa driver (RadioLib or thin driver) |
| Forwarding (ttl/hop/prev_hop mutate + CRC recompute) | `firmware/communication` |
| Link ACK retry state machine | `firmware/communication` |
| Store-and-forward queue | `firmware/communication` |
| Config apply | `firmware` config manager |

---

## 6. Timing defaults (node)

| Parameter | Default |
|-----------|---------|
| SENSOR_DATA interval | Configurable (config_id=1) |
| HEARTBEAT interval | Configurable (config_id=2) |
| Link ACK retries | 3 |
| Link ACK timeout | DOC-005 §9.3 |
| Default TTL (uplink) | 8 (unless configured) |
| Duplicate seq window | 32 |

---

## 7. Addressing

- Node ID: provisioned uint16 ≠ 0, ≠ 0xFFFF, ≠ gateway ID  
- Uplink `dst`: gateway ID (default `0x0002`)  
- Broadcast `0xFFFF`: TIME_SYNC / ROUTE_ADV processing per DOC-005  

---

## 8. Security (node)

- Store `K_net` in NVS (or secure element if present)  
- Verify MAC on all RX before process/forward  
- Enforce replay window on CONFIG_UPDATE and restart  
- Link ACK success ≠ gateway storage success (DOC-005 §9.2)  

---

## 9. Diagnostics payload codes (v1)

| diag_code | Response body (LE) |
|-----------|-------------------|
| 1 | batt_mV u16, reset_reason u8, queue_depth u8, last_rssi i8, reserved |
| 2 | fw_major u8, fw_minor u8, fw_patch u8, protocol_ver u8 |
| 3 | next_hop u16, cost_to_gw u16, hop_to_gw u8 |

---

## 10. Error handling

| Condition | Action |
|-----------|--------|
| CRC fail | Drop; no forward |
| MAC fail | Drop; optional NACK to prev hop if identifiable |
| Unknown version | Drop; diag counter |
| No route | Queue SENSOR/EMERGENCY; else drop + counter |
| Config bad | NACK reason=unsupported or busy |

---

## 11. Test obligations

Golden vectors under `tests/firmware/protocol/` MUST match DOC-005 algorithms (CRC + MAC with test key `16 × 0x11`).

---

## 12. Change control

Incompatible AMP changes → DOC-005 version bump + ADR. This ICD version tracks DOC-005 on-wire v1.
