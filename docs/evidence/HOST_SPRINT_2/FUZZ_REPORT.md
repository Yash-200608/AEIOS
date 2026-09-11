# FUZZ_REPORT.md — HOST_SPRINT_2

**Date:** 2026-08-02  
**Binary:** `firmware/host_tests/build/test_amp_fuzz`  
**Raw:** [`fuzz_raw.txt`](fuzz_raw.txt)

## Configuration

| Parameter | Value |
|-----------|--------|
| PRNG | LCG (deterministic) |
| Seed | `0xA5105` |
| Iterations | **20000** |
| Modes | valid encode; mutate valid; random buffer; oversized plen; NULL |

## Guarantees exercised

| Property | Result |
|----------|--------|
| Never crash | **PASS** (process exit 0) |
| Never heap in parser | N/A — parser uses caller buffers only |
| Defined reject codes | Mutated/random → non-OK parse codes |
| Valid frames still OK | All valid-base iterations accepted |

## Counts (this run)

```text
AMP fuzz seed=0x000A5105 iters=20000
fuzz done: ok=4015 reject=15985 valid_base=4015
PASS: no crash across 20000 iterations
```

| Metric | Value |
|--------|--------|
| Iterations | 20000 |
| Valid-base (mode 0) | 4015 |
| Parse OK total | 4015 |
| Rejected | 15985 |
| Failure cases (crashes/asserts) | **0** |

## Coverage notes

Fuzz stresses `amp_parse` length/magic/version/CRC/MAC paths. Does not replace unit tests for routing/queue/retry.

## Pass / Fail

**PASS**
