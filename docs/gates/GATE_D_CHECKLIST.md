# Gate D — Detailed Design & Firmware Foundation

**Project:** AEIOS 2.0 Sentinel  
**Gate:** D  
**Status:** Engineering Execution Phase (GOV-EXEC-001)  
**Date:** 2026-08-01  

**Review model:** Evidence-first (Chief Systems Reviewer four questions). Compiling is not passing.

---

## Preconditions

| Gate | Status |
|------|--------|
| A–C | ✅ Frozen |
| DOC-006 / 007 / STD-FW-001 | ✅ |
| GOV-EXEC-001 | ✅ Active |

---

## Engineering dashboard

See [ENGINEERING_EXECUTION.md](../governance/ENGINEERING_EXECUTION.md) §2. Gateway / backend / AI remain **blocked by MVN**.

---

## Evidence-gated review points

Submit as one evidence package using [D1_ACCEPTANCE_PREVIEW.md](D1_ACCEPTANCE_PREVIEW.md). Reviewer applies [GOV-REV-001](../governance/REVIEW_POLICY.md) (Evidence A–D; Accept / Conditional / Reject).

### D1 — Platform Bring-up → **D1 Accepted**

| Evidence | Present |
|----------|---------|
| `idf.py build` log | ☑ |
| Firmware binary (path/hash noted) | ☑ |
| Boot log | ☑ (`docs/evidence/D1_RUNTIME/`) |
| Host AMP tests (Python and/or C) | ☑ Python / ☑ C |
| Static analysis report (when tool available) | ☑ (CI / HOST_SPRINT_2) |
| Memory map | ☑ |
| Coding standards frozen | ☑ |
| DOC-007 present | ☑ |
| WDT trip + deep sleep | ☑ (`FINAL_D1_SUPPLEMENT.md`) |

**Outcome:** ☑ **D1 Accepted** (2026-08-02) — record: [`docs/evidence/D1_RUNTIME/D1_ACCEPTANCE_RECORD.md`](../evidence/D1_RUNTIME/D1_ACCEPTANCE_RECORD.md)

**D2 authorized.** Order: battery → BME680 → SCD41 → PMS5003 → LoRa → GPS.

---

### D2 — Driver Validation → **per-driver Accepted**

For **each** driver (order: RTC/HAL → battery → BME680 → SCD41 → PMS5003 → LoRa → GPS):

| Evidence | |
|----------|--|
| Self-test output | ☐ |
| Initialization log | ☐ |
| Raw sensor reading | ☐ |
| Error handling demo | ☐ |
| Power consumption note | ☐ |
| Recovery after disconnect | ☐ |
| Unit tests | ☐ |

One review package per driver. Stubs alone do **not** count as D2 Accepted.

---

### D3 — Communication Validation → **AMP Accepted**

| Evidence | |
|----------|--|
| Packet capture and/or golden compare | ☐ |
| CRC verification | ☑ (host/Python) |
| MAC verification | ☑ (host/Python) |
| Duplicate suppression | ☐ |
| Retry behavior | ☐ |
| Store-and-forward | ☐ |
| Link ACK timing | ☐ |

No dashboard required — protocol correctness only.

---

### D4 — MVN Acceptance → **MVN Accepted**

Full checklist and evidence: [MVN.md](../firmware/MVN.md).

Treat MVN as its own gate. Only then is the node “field ready” for DOC-008 planning.

**Outcome:** ☐ MVN Accepted  

---

## Controlled documents

| ID | Document |
|----|----------|
| DOC-001…007 | As previously controlled |
| GOV-EXEC-001 | Engineering Execution |
| STD-FW-001 | Coding standards (+ no untested merges via GOV-EXEC) |
| DOC-008 | Stub only until MVN |

---

## Sign-off

| Milestone | Reviewer | Date | Result |
|-----------|----------|------|--------|
| D1 Accepted | Chief Systems (project acceptance) | 2026-08-02 | **Accepted** |
| D2 drivers (list) | | | Authorized — not started |
| D3 AMP Accepted | | | |
| MVN Accepted | | | |
| Gate D complete | | | |
