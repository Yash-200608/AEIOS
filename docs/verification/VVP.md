# AEIOS Verification & Validation Plan (VVP)

**Document ID:** DOC-007  
**Version:** 1.0  
**Status:** Controlled — Gate D baseline (2026-08-01)  
**Classification:** Controlled document  
**Depends on:** DOC-002 SRS, SYSTEM_REQUIREMENTS, DOC-005, DOC-006, RTM, ICD-001/002  

---

## 1. Purpose

Define **how AEIOS proves** it satisfies controlled requirements. Every verification activity must be traceable to SR/FR/NFR/AC IDs. Ad hoc testing is not Gate E evidence.

**Systems-engineering rule:** A feature is not “done” until its mapped verification method has Pass evidence.

---

## 2. Verification method legend

| Code | Method | Typical evidence |
|------|--------|------------------|
| UT | Unit test (host or target) | Log / CI green |
| IT | Integration test | Multi-module log |
| GV | Golden vector | Hex + PASS assert |
| FI | Fault injection | Scripted fault + observed behavior |
| PM | Power measurement | Meter reading / profile |
| FT | Field / range test | Site log |
| RT | Review / inspection | Checklist sign-off |
| AC | Acceptance criterion (SRS §7) | Formal Gate E record |

---

## 3. Requirement → verification map (initial)

### 3.1 Sensing & location

| Req | Method | Test IDs |
|-----|--------|----------|
| SR-001 / FR-SENSE-* | UT + IT | VT-SENSE-001..010 |
| SR-002 / FR-LOC-* | IT | VT-LOC-001..003 |

### 3.2 Power

| Req | Method | Test IDs |
|-----|--------|----------|
| SR-003 / FR-PWR-* / NFR-PWR-* | IT + PM | VT-PWR-001..006 |
| Deep sleep current | PM | VT-PWR-003 |

### 3.3 Communication & recovery

| Req | Method | Test IDs |
|-----|--------|----------|
| SR-005 / FR-COM-* | UT + IT + FT | VT-AMP-001..020, VT-RF-001 |
| Heartbeat TX | UT + IT | VT-AMP-010 |
| CRC validation | UT + GV | VT-AMP-001 |
| MAC verification | UT + GV | VT-AMP-002 |
| Store-and-forward | FI + IT | VT-AMP-015 |
| Emergency priority | IT (queue stress) | VT-AMP-016 |
| LoRa routing | IT + FT | VT-AMP-018, VT-RF-002 |
| SR-006 outage retention | FI | VT-AMP-015, AC-02 |

### 3.4 Gateway / offline / UI / AI (later phases)

| Req | Method | Test IDs |
|-----|--------|----------|
| SR-007 gateway persist | IT | VT-GW-001..005 |
| Offline operation | FI (WAN disconnect) | VT-GW-003, AC-04 |
| SR-008 AI explain | IT | VT-AI-001..003, AC-05 |
| SR-009 offline map | IT | VT-UI-001..003 |
| SR-010 health | IT | VT-HLTH-001..004 |
| SR-011 security | UT + IT | VT-SEC-001..005, AC-10 |
| SR-012 config / maint FW | IT | VT-CFG-001..003, AC-08, AC-09 |
| SR-013 scope | RT | VT-GOV-001 |
| SR-014 / AC-01..10 | AC | Gate E pack |

---

## 4. Test case template (mandatory fields)

Each `VT-*` record SHALL include:

| Field | Description |
|-------|-------------|
| Test ID | e.g. VT-AMP-002 |
| Related IDs | SR / FR / NFR / AC / DOC-005 section |
| Objective | One sentence |
| Preconditions | Build, keys, hardware |
| Procedure | Numbered steps |
| Expected result | Observable outcome |
| Pass/Fail criteria | Binary or measured threshold |
| Evidence required | Log path, hex dump, photo, meter |

Living catalog: [`docs/verification/TEST_CATALOG.md`](../verification/TEST_CATALOG.md)

---

## 5. Minimum Viable Node (MVN) verification gate

The node is **MVN-complete** only when all MVN checklist items in Gate D have Pass evidence (see Gate D checklist / FAS). MVN blocks gateway/AI critical-path work.

---

## 6. Environments

| Env | Use |
|-----|-----|
| Host (desktop) | AMP GV, CRC/MAC, codec — no radio |
| Target lab | Drivers, sleep, LoRa point-to-point |
| Site | Range, canopy, solar |

---

## 7. Defect and merge policy

Every production defect fix SHALL add or extend a regression test (Coding Standards Rule 4 / GOV-EXEC-001). Link defect ID in the VT changelog.

**No untested code enters main** — see [PR_EVIDENCE_CHECKLIST.md](../governance/PR_EVIDENCE_CHECKLIST.md).

---

## 8. Gate E relationship

DOC-007 produces the evidence pack that satisfies SRS acceptance criteria AC-01…AC-10. Gate E does not invent new tests ad hoc.

---

## 9. Approval

| Role | Date | Status |
|------|------|--------|
| Systems engineering | 2026-08-01 | Controlled baseline |
| Updates | — | Expand TEST_CATALOG; ADR if verification strategy changes |
