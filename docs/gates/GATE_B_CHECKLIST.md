# Gate B — Protocol Freeze Checklist

**Project:** AEIOS 2.0 Sentinel  
**Gate:** B — Binary mesh protocol freeze  
**Document:** DOC-005 `docs/sad/protocol/AMP_PROTOCOL_SPEC.md`  

---

## Formal decision

| Field | Value |
|-------|-------|
| **Result** | **GATE B — ACCEPTED** |
| **Condition** | Two editorial clarifications incorporated (CRC role; Link ACK vs application delivery) |
| **Date** | 2026-08-01 |
| **On-wire** | Protocol Version **1** Frozen |
| **DOC-005 status** | **Controlled** v1.0 |

Wire format, algorithms, and retry behavior are unchanged by the clarifications.

---

## 1. Preconditions

| Check | Pass |
|-------|------|
| Gate A ACCEPTED | ☑ |
| ADR-006 in force | ☑ |
| DOC-005 present with on-wire version 1 | ☑ |

---

## 2. Technical freeze items

| Item | Pass |
|------|------|
| Endianness defined | ☑ |
| Max frame / max payload defined | ☑ |
| 20-byte header field map complete | ☑ |
| Packet type codes assigned | ☑ |
| SENSOR_DATA / HEARTBEAT / ACK / NACK / CONFIG / TIME_SYNC / EMERGENCY payloads defined | ☑ |
| Routing metric + uplink-centric v1 scope defined | ☑ |
| Link ACK + retry policy defined | ☑ |
| Application delivery distinguished from Link ACK | ☑ |
| CRC-16 algorithm specified | ☑ |
| CRC role = hop corruption only (not security) | ☑ |
| MAC algorithm + hop-mutable field rule specified | ☑ |
| Replay window rules specified | ☑ |
| No firmware-image packet type | ☑ |
| Conformance levels (node vs gateway) listed | ☑ |

---

## 3. Consistency

| Check | Pass |
|-------|------|
| Aligns with SRS FR-COM-* | ☑ |
| Aligns with Gate C | ☑ |
| Aligns with VERSIONING protocol rules | ☑ |
| Risk RISK-005 mitigated by freeze | ☑ |

---

## 4. Decision

| Outcome | Select |
|---------|--------|
| **ACCEPT Gate B** — DOC-005 Controlled; mesh firmware may start; complete ICD-001/002 | ☑ |
| **ACCEPT with changes** | ☐ (clarifications applied) |
| **REJECT** | ☐ |

### Notes

```
Editorial clarifications only — no wire-format change.
ICD-001 and ICD-002 unblocked.
Mesh firmware implementation may begin.
```

---

## 5. Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Author | AEIOS engineering | 2026-08-01 | Accepted |
| Comms / systems reviewer | Design review | 2026-08-01 | Accepted |
| Gate B approver | Project review | 2026-08-01 | **ACCEPTED** |
