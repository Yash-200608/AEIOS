# ADR-008: Driver Interface Includes shutdown()

- **Status:** Accepted  
- **Date:** 2026-08-01  
- **Gate:** D (D1 bring-up)  

## Context

DOC-006 §5 defined uniform driver ops as `init/read/self_test/health/sleep/wake`. Engineering Execution driver standard (Lead Embedded bring-up) also requires **`shutdown()`** for orderly power-down and bus release before deep sleep or maintenance.

This is an **additive**, non-breaking extension of the public ops table. Existing call sites that ignore `shutdown` remain valid if the pointer is non-NULL after this change.

## Decision

Extend `aeios_driver_ops_t` with:

```c
int (*shutdown)(void *ctx);
```

Update DOC-006 §5 and all driver stubs. `shutdown` SHALL release hardware resources; may be called before deep sleep or reboot. Return `0` on success.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Overload `sleep()` for full power-off | Ambiguous; sleep is duty-cycle soft power |
| Silent add without ADR | Violates controlled-document change rule |

## Rationale

Clear lifecycle: init → … → sleep/wake cycles → shutdown. Matches industrial driver patterns and D1 sleep manager needs.

## Consequences

- All drivers implement `shutdown` (may no-op if nothing to release)  
- FAS §5 updated to v1.2 aligning with this ADR  
- No AMP / DOC-005 impact  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted for D1 implementation |
