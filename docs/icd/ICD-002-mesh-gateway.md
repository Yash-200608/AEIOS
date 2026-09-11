# ICD-002 — Mesh ↔ Gateway

**ICD ID:** ICD-002  
**Version:** 1.0  
**Status:** Active (post–Gate B)  
**Depends on:** DOC-005 Controlled (AMP Protocol Version 1), SAD §6  
**Date:** 2026-08-01  

---

## 1. Purpose

Contract between the **LoRa/mesh bridge process** on the gateway and the **ingestion / parser / MQTT data plane**.

---

## 2. Components

```text
LoRa radio (gateway)
    ↔  mesh_bridge (decode AMP, verify CRC/MAC, hop role)
    ↔  internal bus (MQTT topics — Technology Baseline)
    ↔  parser / ingestion → TimescaleDB
    ↔  optional realtime fanout → backend / dashboard
```

---

## 3. Bridge responsibilities

| Responsibility | Required |
|----------------|----------|
| RX AMP frames; drop bad CRC | Yes |
| Verify MAC; drop failures; count | Yes |
| Accept on-wire version 1 only | Yes |
| Act as node ID default `0x0002` (configurable) | Yes |
| Emit ROUTE_ADV / TIME_SYNC / CONFIG_UPDATE / DIAG request | Yes |
| Forward role N/A at GW for uplink terminus | Process locally when `dst` is GW or broadcast |
| Send Link ACK/NACK when ACK_REQ and frame accepted for local ingest path | Yes |
| **Not** claim application delivery via AMP Link ACK alone | Yes (§9.2 DOC-005) |
| Publish validated uplink to ingest bus | Yes |
| Recompute nothing on MAC; GW is typically terminus | — |

---

## 4. Application delivery (gateway-local)

When a SENSOR_DATA or EMERGENCY_ALERT is:

1. MAC-valid  
2. replay-accepted  
3. successfully written to durable store (or accepted into the durable ingest pipeline)  

…the gateway records **application delivery** in logs/metrics/DB. This is **not** an AMP Link ACK. v1 does not require an on-wire application-ACK type.

Downstream APIs MAY expose delivery status to operators (ICD-004 later).

---

## 5. MQTT topic conventions (v1)

| Topic | Payload | Publisher |
|-------|---------|-----------|
| `aeios/amp/uplink/raw` | Binary AMP frame (optional debug) | bridge |
| `aeios/amp/uplink/decoded` | JSON object (below) | bridge/parser |
| `aeios/amp/downlink/cmd` | JSON command → bridge encodes AMP | backend |
| `aeios/amp/event/link_ack` | `{src, seq, type, ok}` | bridge |
| `aeios/amp/event/drop` | `{reason, src?, seq?}` | bridge |

JSON is **off-air only** (ADR-006).

### 5.1 Decoded uplink object (minimum)

```json
{
  "protocol_version": 1,
  "type": "SENSOR_DATA",
  "src": 10,
  "dst": 2,
  "seq": 1234,
  "timestamp": 1710000000,
  "hop_count": 2,
  "sync_status": 1,
  "payload": { },
  "rx_unix": 1710000001,
  "rssi": -90,
  "snr": 5.5,
  "mac_ok": true,
  "application_accepted": false
}
```

`application_accepted` is set **true** only by ingestion after durable accept (may be a second message on `aeios/amp/uplink/accepted`).

---

## 6. Downlink commands (backend → bridge)

| cmd | AMP type | Notes |
|-----|----------|-------|
| `time_sync` | 0x09 | Broadcast or scoped |
| `config_update` | 0x07 | dst=node, ACK_REQ |
| `diagnostics` | 0x08 | request |
| `route_adv` | 0x05 | periodic from bridge itself |

Bridge encodes per DOC-005; awaits Link ACK where required; reports link result on `aeios/amp/event/link_ack`. Application success for config is confirmed when node behavior changes / diag — not by Link ACK alone.

---

## 7. Ingest validation

| Check | On failure |
|-------|------------|
| type known | drop + counter |
| SENSOR_DATA length | drop |
| status_flags fault bits | store sample + raise health |
| duplicate (src,seq) | drop silently |

---

## 8. Error / NACK reasons

Bridge maps DOC-005 NACK reasons to `aeios/amp/event/drop` reason strings: `crc`, `mac`, `busy`, `unsupported`, `ttl`, `queue_full`, `bad_version`.

---

## 9. Security

- `K_net` provisioned on gateway secure config (not in git)  
- CONFIG_UPDATE only from authenticated backend sessions (ICD-003/004)  
- Rate-limit downlink commands  

---

## 10. Test obligations

- Independent decode of golden vectors from `tests/firmware/protocol/`  
- Integration: node SENSOR_DATA → bridge → MQTT decoded → DB row  
- Assert Link ACK does not flip `application_accepted` without DB write  

---

## 11. Change control

Tied to DOC-005 on-wire v1. Topic renames are ICD MINOR; AMP changes are DOC-005 + ADR.
