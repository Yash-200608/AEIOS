# Evidence: AMP Stack (retry / queue / routing / timesync / replay)

**Date:** 2026-08-01  
**Scope:** Host-executable DOC-005 modules — **no radio, no fabricated device logs**  
**Architecture / protocol:** Unchanged (DOC-005 / DOC-006 frozen)

## Delivered modules

| Module | Header | Source | Spec |
|--------|--------|--------|------|
| Routing | `aeios/amp/routing.h` | `routing.c` | DOC-005 §8 |
| Retry | `aeios/amp/retry.h` | `retry.c` | DOC-005 §9.3 |
| Queue (SF) | `aeios/amp/queue.h` | `queue.c` | DOC-005 §9.4 |
| Time sync | `aeios/amp/timesync.h` | `timesync.c` | DOC-005 §7.9 / §12 |
| Replay/dup | `aeios/amp/replay.h` | `replay.c` | DOC-005 §9.1 / §11 |
| Codec ext | `codec.h` | TIME_SYNC + ROUTE_ADV pack/unpack | §7.5 / §7.9 |

## Behavior summary

- **Routing:** uplink cost `hop*16+(100-LQ)`; hysteresis margin 8; stale clears next-hop; `amp_forward_mutate` for hop fields (CRC recompute by caller; MAC not recomputed).
- **Retry:** 3 attempts; timeout `2s * 2^attempt` capped 8s + injectable jitter; SF hint for SENSOR/EMERGENCY on final fail.
- **Queue:** static ring `AMP_SF_CAPACITY` (16); EMERGENCY drops oldest SENSOR under pressure; SENSOR rejected if queue is emergencies-only.
- **Timesync:** apply only if `from_gw`; 8-byte payload; sets `sync_status=1`.
- **Replay:** per-(src,type) window 32; `T_replay=300s` when synced.

## Unit tests

| Test | Result |
|------|--------|
| `test_amp_routing` | PASS |
| `test_amp_retry` | PASS |
| `test_amp_queue` | PASS |
| `test_amp_timesync` | PASS |
| `test_amp_replay` | PASS |

## Pass / Fail

**PASS** (host)

## Out of scope

Air TX/RX, FreeRTOS `comm_task` wiring, NVS persistence of SF queue — deferred until hardware / later D3 integration.
