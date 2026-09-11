# ADR-013: HW-NODE-r2 Central Pin Map and Bring-Up Order

- **Status:** Accepted  
- **Date:** 2026-09-11  
- **Gate:** Post–Gate C reconciliation (C-06, C-09)  
- **Hardware revision:** `HW-NODE-r2` (sensor set + pinout change per [VERSIONING.md](../VERSIONING.md) §6)

## Context

`HW-NODE-r1` BSP placeholders collided with the locked DevKitC-32E map: GPIO5 as GPS RX vs LoRa NSS; GPIO34 as battery ADC vs MQ135; LoRa DIO0 26 vs 25; GPS UART present. Pins must live in one BSP table.

## Decision

Central software baseline (ESP32-DevKitC-32E, 38-pin):

| Function | GPIO |
|----------|------|
| I²C SDA | 21 |
| I²C SCL | 22 |
| PMS5003 RX | 16 |
| PMS5003 TX | 17 |
| LoRa SCK | 18 |
| LoRa MOSI | 23 |
| LoRa MISO | 19 |
| LoRa NSS/CS | **5** |
| LoRa RESET | 14 |
| LoRa DIO0 | **25** |
| MQ135 conditioned ADC | **34** |
| Status LED | 2 |
| Maintenance button (optional) | 0 |

Rules:

- **No GPS UART / PPS pins.**
- **GPIO34 is MQ135 only.** Do not also assign it as battery ADC.
- Battery voltage sensing is **hardware-pending**: BSP `adc_battery = -1` until a second validated ADC channel is chosen on the schematic. Do not invent a pin to hide the conflict.
- MQ135 analog must be voltage-conditioned; divider ratio is configuration.

Bring-up order (no GPS):

1. Power / brownout safety  
2. GPIO / BSP  
3. I²C bus  
4. SCD41 + BME688  
5. UART / PMS5003  
6. MQ135 analog / heater  
7. SX1278  
8. Intelligence / services  

Init must not block indefinitely; expose absent / fault / warming; allow degraded operation.

## Alternatives considered

| Alternative | Why rejected |
|-------------|--------------|
| Keep r1 placeholders until schematic freeze | GPIO5/34 conflicts are electrical, not cosmetic |
| Mux MQ135 and battery on GPIO34 in software | Hides an electrical conflict |

## Rationale

One pin table, matching locked wiring, without pretending battery and MQ135 share ADC1 channel 6.

## Consequences

- [aeios_bsp.h](../../firmware/node/components/aeios_bsp/include/aeios_bsp.h) / `.c` implement this map.
- FAS pin/driver sections need a controlled revision; until then this ADR + BSP are implementation law for pins.
- Field PCB must match `HW-NODE-r2` or carry a new revision.

## Review history

| Date | Event |
|------|-------|
| 2026-09-11 | Accepted |
