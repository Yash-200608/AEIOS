# ADR-002: ESP-IDF as Sole Firmware Framework

- **Status:** Accepted  
- **Date:** 2026-08-01  
- **Gate:** A  

## Context

Sensor-node firmware must manage sensors, LoRa, deep sleep, watchdogs, NVS, and production-grade reliability. Dual Arduino + ESP-IDF paths commonly create throwaway prototypes and inconsistent drivers.

## Decision

**ESP-IDF only** for all shipping and integration node firmware. No Arduino compatibility layer in the AEIOS firmware tree. Short bring-up sketches outside the repo are allowed for lab wiring checks but are not AEIOS firmware.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Arduino / Arduino-ESP32 core | Insufficient production controls; debt risk |
| Zephyr / other RTOS | Extra learning cost; ESP-IDF already fits ESP32 + FreeRTOS |
| Dual Arduino prototype then rewrite | Violates Technology Introduction Rule (not demonstrable as the real stack) |

## Rationale

ESP-IDF provides FreeRTOS, OTA primitives (for maintenance-path updates), power management, NVS, and watchdog support aligned with field nodes.

## Consequences

- Developers need ESP-IDF tooling  
- Technology Baseline lists ESP-IDF  
- CI/tests target ESP-IDF projects under `firmware/`  

## Review history

| Date | Event |
|------|-------|
| 2026-08-01 | Accepted in design review |
