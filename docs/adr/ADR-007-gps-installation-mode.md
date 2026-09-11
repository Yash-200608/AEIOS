# ADR-007: GPS Used Only During Installation

- **Status:** Superseded by [ADR-010](ADR-010-gps-removed.md)  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

Continuous GPS on every node increases power cost and often fails under dense canopy. Node locations for environmental mesh are largely static after installation.

## Decision

**Installation-mode GPS only:**

1. Technician enables GPS in maintenance/install mode  
2. Position is acquired  
3. Coordinates stored in non-volatile memory on the node  
4. GPS is disabled for normal deployment operation  
5. Gateway retains the node location for map and analytics  

No continuous GPS tracking in v1 (Gate C exclusion).

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Continuous GPS per node | Power + canopy fix rate; Gate C excluded |
| No GPS / manual coordinates only | Error-prone but acceptable fallback if install fix fails — manual entry allowed as backup |
| Gateway-only GPS | Does not locate remote nodes |

## Rationale

Adequate spatial tagging for static deployments with minimal energy impact.

## Consequences

- Firmware has explicit Install vs Deployment modes  
- Health monitoring does not expect continuous GNSS  
- Dashboard positions come from stored coordinates  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted in design review |
| 2026-09-11 | Superseded by ADR-010 (no GNSS on deployed nodes) |
