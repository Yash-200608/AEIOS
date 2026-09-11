# D1 Acceptance Preview — Evidence Checklist

**Gate item:** D1 — Platform Bring-up  
**Recommendation target:** D1 Accepted (GOV-REV-001)  
**Parent:** [GATE_D_CHECKLIST.md](../gates/GATE_D_CHECKLIST.md)  

Submit as one evidence package. Reviewer will score Evidence Level A–D and issue Accept / Conditional / Reject.

---

## Build

| Item | Attached |
|------|----------|
| Successful `idf.py build` log | ☐ |
| No unexpected compiler errors | ☐ |
| Unexpected warnings listed & justified | ☐ |
| Firmware binary path / size / hash | ☐ |

## Boot

| Item | Attached |
|------|----------|
| Complete boot log | ☐ |
| Initialization sequence matches FAS boot order | ☐ |
| NVS initialization visible | ☐ |
| Watchdog / HAL startup visible | ☐ |
| Task start (sensor/comm/power/diag stubs OK) | ☐ |

## AMP

| Item | Attached |
|------|----------|
| Host test results (Python and/or C) | ☐ |
| Golden vector verification | ☐ |
| CRC/MAC correctness demonstrated | ☐ |

## Memory

| Item | Attached |
|------|----------|
| Flash usage (`idf.py size` or map) | ☐ |
| RAM usage | ☐ |
| Partition layout (if available) | ☐ |

## Quality

| Item | Attached |
|------|----------|
| Static analysis output (or N/A + reason) | ☐ |
| Coding standards compliance statement | ☐ |
| Known issues list | ☐ |
| Deviations from controlled docs | ☐ none / ☐ listed |

## Traceability

| Item | |
|------|--|
| Scope links to Gate D1 / DOC-006 | ☐ |
| VT IDs exercised (e.g. VT-AMP-001/002) | ☐ |

---

## Reviewer stub (filled at review)

| Field | Value |
|-------|-------|
| Compliance | Platform bring-up evidenced (build, flash, boot, NVS, WDT, deep sleep, host AMP) |
| Evidence level | A (runtime + host) |
| Critical/Major findings | None blocking after D1_RUNTIME supplement |
| Recommendation | **Accept** |
| Date / Reviewer | 2026-08-02 — Chief Systems / project acceptance |
