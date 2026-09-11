# ADR-003: No Firmware OTA Over LoRa

- **Status:** Accepted  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

ESP32 firmware images are typically on the order of 1–2 MB. LoRa duty cycle, bandwidth, and mesh multi-hop make full-image OTA impractical and energy-hostile for v1 field nodes.

## Decision

**No full firmware image transfer over LoRa in v1.**

Node firmware updates use:

- USB / serial, or  
- Maintenance-mode local wireless (short-range), under physical/maintenance control  

LoRa may carry **compact** configuration, thresholds, time sync, restart/diagnostics commands only.

Gateway software updates use ordinary gateway maintenance paths (e.g., image/compose update via local access or removable media) — not mesh OTA.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Full firmware OTA over LoRa mesh | Bandwidth, energy, reliability unrealistic for v1 |
| Dual-bank LoRa delta OTA | Complex; defer to future ADR |
| Cloud-triggered OTA as requirement | Violates Offline First |

## Rationale

Protects energy budget and honesty of the demo; config-over-LoRa still enables field tuning.

## Consequences

- SRS must not require LoRa firmware OTA  
- API “firmware update” applies to maintenance channels, not mesh telemetry path  
- Protocol defines config/command types, not image chunks, for v1  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted in design review |
