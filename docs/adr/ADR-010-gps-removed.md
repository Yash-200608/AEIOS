# ADR-010: GPS/GNSS Removed from Deployed Nodes

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-05, C-20)  
- **Supersedes:** [ADR-007](ADR-007-gps-installation-mode.md)

## Context

ADR-007 allowed install-mode GNSS, then disable. Context Files 01–03 forbid GPS/GNSS on the node. Spatial intelligence uses **configured** coordinates at the gateway. AMP already has TIME_SYNC without requiring PPS.

## Decision

1. **No GNSS on the node:** no GPS UART, PPS, parser, acquisition, antenna driver, or GPS fields in packets.
2. **Location:** gateway/database node registry stores `configured_latitude`, `configured_longitude`, site, description. The node transmits identity only.
3. **Time:** keep AMP TIME_SYNC. Persist `measurement_time` (node) and `received_at` (gateway) separately. Gateway beacon/offset is the sync path. Do not restore GPS to solve time.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep install-mode GPS (ADR-007) | Reopens GNSS hardware, UART pins (collides with LoRa NSS on GPIO5), and power cost |
| Gateway-only GNSS module | Does not locate remote nodes; still a GNSS dependency |

## Rationale

Fixed outdoor nodes do not need self-positioning. Removing GNSS eliminates a pin conflict, a power path, and a class of firmware. Spatial reconstruction remains a gateway algorithm over static metadata.

## Consequences

- Firmware BSP must not reserve GPS UART (ADR-013).
- No `aeios_drv_gps` in the v1 driver table.
- FAS §5 GPS driver row and NVS `aeios_loc` from GNSS are **pending controlled-doc updates**; do not treat them as implementation requirements after this ADR.
- Charter “installation-time fix” remains historical until DOC-001 change-control.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted — supersedes ADR-007 |
