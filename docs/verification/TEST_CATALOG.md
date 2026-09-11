# AEIOS Test Catalog (living)

**Parent:** DOC-007 VVP  
**Version:** 1.0  
**Status:** Living — expand during Gate D  

---

## VT-AMP-001 — CRC-16 validation

| Field | Content |
|-------|---------|
| Related | FR-COM-003/004, DOC-005 §10.1, SR-005 |
| Objective | Verify CRC-16/CCITT-FALSE detects corruption |
| Preconditions | Host test or `golden_ref.py` |
| Procedure | 1) Encode frame 2) Flip payload bit 3) Recompute/verify wire CRC path 4) Confirm parse fails on CRC mismatch |
| Expected | Tampered frame rejected with CRC failure before MAC accept |
| Pass/Fail | Deterministic FAIL on corrupt; PASS on golden |
| Evidence | Test log / CI |

**Status:** PASS (Python golden + host suite design)

---

## VT-AMP-002 — MAC verification & hop immutability

| Field | Content |
|-------|---------|
| Related | FR-COM-004, DOC-005 §10.2–10.3, SR-011 |
| Objective | MAC authenticates immutable region; hop fields may change |
| Preconditions | K_net = 16×0x11 |
| Procedure | 1) Encode 2) Mutate ttl/hop/prev_hop 3) Recompute wire CRC only 4) Verify MAC still OK 5) Tamper payload 6) Confirm MAC fail |
| Expected | Hop mutate PASS; payload tamper FAIL |
| Pass/Fail | As expected |
| Evidence | `golden_ref.py` output; GOLDEN.md |

**Status:** PASS

---

## VT-AMP-003 — SENSOR_DATA codec round-trip

| Field | Content |
|-------|---------|
| Related | FR-SENSE-*, FR-COM-003, DOC-005 §7.1 |
| Objective | Pack/unpack sensor payload LE fields |
| Preconditions | Host AMP library |
| Procedure | Pack known struct → encode frame → decode → unpack → compare fields |
| Expected | Field equality |
| Pass/Fail | All compared fields match |
| Evidence | `test_amp_golden` / future Unity |

**Status:** Designed (C suite); Python partial

---

## VT-AMP-010 — Heartbeat transmit (node)

| Field | Content |
|-------|---------|
| Related | FR-COM-007, ICD-001 |
| Objective | Node emits HEARTBEAT on schedule |
| Preconditions | MVN radio path or sniffer |
| Procedure | Boot → wait interval → capture AMP type 0x02 |
| Expected | Valid golden-compatible frame to gateway ID |
| Pass/Fail | ≥1 valid frame / interval |
| Evidence | Sniffer hex + parse log |

**Status:** Blocked on LoRa bring-up

---

## VT-AMP-015 — Store-and-forward

| Field | Content |
|-------|---------|
| Related | FR-COM-006, NFR-OFF-002, SR-006, AC-02 |
| Objective | Buffer SENSOR_DATA when no route; deliver after restore |
| Preconditions | Node with SF queue; gateway radio controllable |
| Procedure | 1) Silence gateway 2) Generate N samples 3) Restore 4) Count delivered |
| Expected | Samples retained and delivered within tolerance |
| Pass/Fail | Per AC-02 |
| Evidence | Counts + timestamps |

**Status:** Not started (needs queue + radio)

---

## VT-AMP-016 — Emergency priority

| Field | Content |
|-------|---------|
| Related | FR-NODE-003, DOC-005 PRIORITY |
| Objective | EMERGENCY_ALERT drains before routine SENSOR under stress |
| Preconditions | Full TX queue |
| Procedure | Fill queue with SENSOR; inject EMERGENCY; observe TX order |
| Expected | Emergency sent first |
| Pass/Fail | Ordering met |
| Evidence | TX log |

**Status:** Not started

---

## VT-PWR-003 — Deep sleep current

| Field | Content |
|-------|---------|
| Related | FR-PWR-002, NFR-PWR-001, SR-003 |
| Objective | Measure sleep current vs budget |
| Preconditions | Hardware + meter |
| Procedure | Enter deep sleep; measure; compare to design budget |
| Expected | ≤ budget (TBD in power design) |
| Pass/Fail | Measured ≤ limit |
| Evidence | Meter photo / CSV |

**Status:** Not started

---

## VT-CFG-001 — CONFIG_UPDATE apply

| Field | Content |
|-------|---------|
| Related | FR-CFG-001, FR-COM-014, AC-08 |
| Objective | Gateway config changes sampling/alert behavior |
| Preconditions | Link + authenticated config |
| Procedure | Send CONFIG_UPDATE; verify NVS; observe interval change |
| Expected | Behavior matches new config |
| Pass/Fail | AC-08 |
| Evidence | Logs |

**Status:** Not started

---

## VT-GOV-001 — Gate C scope inspection

| Field | Content |
|-------|---------|
| Related | SR-013, FR-OUT-* |
| Objective | No v1 MUST implementation of excluded features |
| Preconditions | Code freeze candidate |
| Procedure | Review tree for satellite/TinyML/LoRa OTA image/etc. |
| Expected | None present as required paths |
| Pass/Fail | RT sign-off |
| Evidence | Checklist |

**Status:** Ongoing

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-01 | Initial catalog from DOC-007 |
