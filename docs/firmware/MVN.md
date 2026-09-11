# Minimum Viable Node (MVN)

**Status:** Gate D engineering gate  
**Date:** 2026-08-01  
**Blocks:** Gateway feature critical path, AI, dashboard polish  

A node is **MVN-complete** only when all items below have Pass evidence (DOC-007).

---

## MVN checklist

| # | Capability | Evidence |
|---|------------|----------|
| 1 | Boot and complete self-test | Boot log + driver self_test |
| 2 | Load configuration from NVS | NVS dump / log of node_id, intervals |
| 3 | Read BME680, SCD41, PMS5003, battery | IT sample log |
| 4 | Build valid AMP `SENSOR_DATA` | Parse against DOC-005 |
| 5 | Pass all golden-vector protocol tests | VT-AMP-001/002 (+ C suite) |
| 6 | Transmit to gateway | Sniffer / gateway ingest |
| 7 | Receive and apply `CONFIG_UPDATE` | VT-CFG-001 / AC-08 |
| 8 | Send periodic heartbeats | VT-AMP-010 |
| 9 | Enter deep sleep and wake correctly | VT-PWR + wake log |
| 10 | Buffer packets when no route exists | VT-AMP-015 |
| 11 | Resume transmission after connectivity returns | VT-AMP-015 / AC-02 |

---

## Explicitly not required for MVN

- AI inference  
- Dashboard UI  
- FastAPI surface area beyond what ingest needs for lab  
- Multi-hop field campaign (lab multi-hop MAY be deferred slightly after single-hop TX works, but SF still required)

---

## Exit

Sign Gate D “MVN complete” only when this checklist is fully evidenced. Until then, treat gateway/AI work as non-blocking experiments only—not schedule drivers.
