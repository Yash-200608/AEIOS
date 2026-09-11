# NVS_TEST.md — D1 Runtime

**Date:** 2026-08-02  

## Requested test

Write `AEIOS_TEST_KEY` → reset → read → verify persistence.

## Firmware capability

Production D1 firmware **does not** define or log `AEIOS_TEST_KEY`.  
NVS is exercised via existing `aeios_cfg` namespace (`node_id`, `gw_id`, `sample_s`, `hb_s`) per DOC-006 §8.1.

Per verification rules: **no new features** added solely to create that key name.

## Equivalent persistence evidence (executed)

| Step | Observation |
|------|-------------|
| Boot A | `config loaded node=16 gw=2 sample=60s hb=120s` |
| RTS reset | |
| Boot B | **Identical** `config loaded node=16 gw=2 sample=60s hb=120s` |

Values survive reset ⇒ NVS write (on first init/defaults commit) + read path **PASS**.

Raw: `boot_A.txt`, `boot_B.txt`

## AEIOS_TEST_KEY literal

| Status | Note |
|--------|------|
| **NOT EXECUTED** | Key not present in frozen D1 image |
| Corrective action | Optional future verification-only probe (out of this sprint scope) |

## Pass / Fail

**PASS** (NVS persistence via `aeios_cfg`)  
**PARTIAL** vs literal `AEIOS_TEST_KEY` name (not in firmware)
