# Engineering Metrics Snapshot

**As of:** 2026-08-02  
**Phase:** Engineering Execution — **D1 Accepted**; D2 authorized  

| Area | Indicator | Value / note |
|------|-----------|--------------|
| Docs | Controlled DOC-001…007 | Frozen/baseline |
| Docs | ADR count | 8 |
| Docs | VVP + TEST_CATALOG | Active |
| Firmware | `idf.py build` | **PASS** |
| Firmware | `idf.py size` | **PASS** |
| Firmware | `idf.py flash` COM5 | **PASS** |
| Firmware | Boot UART DOC-006 | **PASS** |
| Firmware | WDT trip / deep sleep | **PASS** (TEST_MODE; prod restored) |
| Protocol | Golden vector (Python) | **PASS** |
| Protocol | Host C suite | **PASS** |
| Protocol | Fuzz (20k) | **PASS** |
| Tooling | CI host-tests workflow | Active |
| Verification | D1 | **ACCEPTED** 2026-08-02 — `docs/evidence/D1_RUNTIME/D1_ACCEPTANCE_RECORD.md` |
| Hardware | D2 driver bring-up | **Authorized** — order: battery → BME680 → SCD41 → PMS → LoRa → GPS |
| Gates | MVN | Not started (still blocks gateway/AI critical path) |
| Blocked | Gateway / Backend / AI critical path | Until MVN |

Update this file when D2 drivers are accepted or major metrics change.
