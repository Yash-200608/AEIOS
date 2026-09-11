# AEIOS — Context File 02

Hardware + Embedded Firmware Context

Purpose: This is the authoritative hardware/embedded context for an AI coding agent implementing the AEIOS sensing-node firmware. Load Context 01 before this file. Context 01 defines the overall project identity and system philosophy; this file defines the concrete embedded platform, sensor contracts, electrical interfaces, firmware architecture, state machine, power behavior, diagnostics, and hardware-aware constraints.

**Ingest status:** Canonical copy of Context File 02 (citation artifacts stripped). Draft until [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) is resolved. Does not silently override Gate A–C controlled documents.

## 1. Scope

This file governs:

- the locked sensing-node hardware,
- the electrical interfaces used by the ESP32,
- sensor-driver responsibilities,
- sensor lifecycle and warm-up behavior,
- acquisition scheduling,
- validation and quality-state handling,
- firmware state management,
- adaptive sampling hooks,
- radio interaction,
- power-aware behavior,
- failure recovery,
- diagnostics,
- embedded testing,
- hardware-in-the-loop expectations.

It intentionally does not define the complete gateway/database/AI implementation. Those belong primarily to Context Files 03 and 04.

## 2. Locked Embedded Hardware

The current AEIOS sensing-node controller is:

ESP32-DevKitC-32E — 38-pin development board

The locked sensing modalities are:

```text
PMS5003
    └── particulate matter

SCD41
    ├── CO₂
    ├── temperature
    └── relative humidity

BME688
    ├── temperature
    ├── relative humidity
    ├── pressure
    └── gas-response features

MQ135
    └── broad gas-response signal

SX1278 @ 433 MHz
    └── LoRa telemetry
```

The gateway is a Raspberry Pi 5.

GPS/GNSS is not used.

The original engineering source identifies the ESP32 as the node acquisition/control computer and the SX1278 as the low-power LoRa uplink.

## 3. Physical Node Quantities

The currently locked prototype procurement contains:

- 4 ESP32 development-board kits.
- 6 SX1278 modules.
- 3 PMS5003 units.
- 3 SCD41 units.
- 3 BME688 units.
- 3 MQ135 units.
- 1 Raspberry Pi 5 gateway.
- Solar/power hardware as defined by the hardware blueprint.

The proposal text had previously described five distributed environmental nodes while the BOM contained four ESP32 development boards and three of several sensors. The engineering source explicitly identifies this reconciliation problem.

For software architecture:

- Do not hard-code the assumption that exactly five identical nodes exist.
- The firmware should support a configurable node_id and deployable-node count.
- The current physical controller quantity is four.
- The software should be capable of supporting a larger node count later without rewriting the firmware architecture.

## 4. Hardware Design Philosophy

The embedded software must understand that AEIOS sensors are not equivalent devices.

They have different:

- physical sensing principles,
- response times,
- power consumption,
- warm-up requirements,
- measurement reliability,
- environmental sensitivities,
- data formats,
- operating states.

Therefore, do not create a generic function such as `readSensor()` and treat all sensors identically.

Prefer explicit driver contracts:

```text
pms5003.readMeasurement();
scd41.readMeasurement();
bme688.readMeasurement();
mq135.readMeasurement();
```

and expose normalized observation structures above the hardware-driver layer.

## 5. Master ESP32 Pin Map

The baseline engineering allocation is:

```text
I²C
GPIO21 = SDA
GPIO22 = SCL

UART
GPIO16 = RX
GPIO17 = TX

SX1278 SPI
GPIO18 = SCK
GPIO23 = MOSI
GPIO19 = MISO
GPIO5  = NSS / CS

SX1278 control
GPIO14 = RESET
GPIO25 = DIO0

MQ135
GPIO34 = ADC1 analog input

Optional status
GPIO2 = status LED
```

The engineering document defines the same core I²C/UART/SPI/ADC mapping.

Earlier drafts contained GPS UART/PPS assignments. Those are obsolete and must not be implemented.

There is:

- no GPS UART reservation,
- no PPS input,
- no GPS parser,
- no GPS packet field.

## 6. I²C Bus Architecture

The shared I²C bus is:

```text
ESP32 GPIO21
      SDA
       │
       ├──────── SCD41
       │
       └──────── BME688

ESP32 GPIO22
      SCL
       │
       ├──────── SCD41
       │
       └──────── BME688
```

Expected addresses:

- SCD41 = 0x62
- BME688 = 0x76 or 0x77

The BME688 address is selected through its SDO configuration.

The engineering blueprint states that the SCD41 and BME688 addresses can coexist on the same bus, while two SCD41 devices with the fixed address would require a second bus or I²C multiplexer.

Firmware requirements:

- perform I²C bus initialization once,
- scan expected addresses during diagnostics,
- explicitly validate sensor identity,
- detect NACKs,
- recover from a stuck bus where possible,
- distinguish "sensor absent" from "sensor returned invalid data",
- avoid endless blocking waits.

## 7. PMS5003 UART Architecture

Baseline:

```text
PMS5003 TX
      ↓
ESP32 GPIO16 RX

ESP32 GPIO17 TX
      ↓
PMS5003 RX
```

PMS5003 is the principal particulate sensor.

The engineering source specifies 3.3-V TTL UART and default 9600 bps, 8N1.

The driver must implement:

- UART initialization,
- frame synchronization,
- frame-length validation,
- checksum validation,
- field decoding,
- unit normalization,
- timeout detection,
- stale-frame detection,
- impossible-value detection,
- driver health state.

The driver must not publish a sample until its frame validity passes.

## 8. SCD41 Firmware Contract

The SCD41 should be treated as a high-value environmental reference channel.

Responsibilities of the driver:

- initialize
- configure mode
- start measurement
- wait without blocking entire system
- read result
- validate result
- return structured measurement

The driver must support the selected measurement mode and must respect the sensor's timing constraints.

The engineering source identifies SCD41 as the primary quantitative CO₂ signal, with I²C address 0x62, and notes its measurement/calibration considerations.

Do not:

- read it faster than its supported operating mode,
- treat a transient startup value as a stable environmental baseline,
- blindly run self-calibration without the deployment assumptions being satisfied.

The driver should expose state such as:

UNINITIALIZED, INITIALIZING, WARMING / STABILIZING, READY, READING, VALID, INVALID, FAULT

## 9. BME688 Firmware Contract

BME688 is a multi-purpose context sensor.

The driver must support:

- I²C initialization,
- identity check,
- address configuration,
- T/RH/pressure acquisition,
- gas-sensing configuration,
- gas-feature acquisition,
- data validity,
- configuration-state tracking.

The engineering documentation specifies I²C operation, 0x76/0x77 addressing and environmental/gas-feature roles.

Important:

BME688 gas output must not automatically become a claimed universal ppm concentration.

The software should preserve the semantics of:

- raw/derived gas response,
- BSEC-derived feature if used,
- calibration/baseline state,
- model/configuration version.

A future software model should know which BME688 configuration generated an observation.

## 10. MQ135 Firmware Contract

MQ135 is the most hardware-sensitive sensing path.

It contains a heater.

The engineering documentation specifies a nominal 5-V heater and potentially high heater consumption. It also explicitly warns about cross-sensitivity, warm-up requirements and the need for target-specific calibration.

The firmware therefore must treat MQ135 as a stateful subsystem:

```text
OFF
  ↓
POWERED
  ↓
HEATING / WARM-UP
  ↓
THERMAL STABILIZATION
  ↓
MEASUREMENT WINDOW
  ↓
VALIDATION
  ↓
RESULT
  ↓
OPTIONAL COOL-DOWN / SLEEP
```

A raw ADC value is not equivalent to ppm.

The firmware should store:

- raw_adc
- conditioned_voltage
- normalized_index
- heater_state
- time_since_activation
- warmup_state
- quality
- confidence

Potential future model:

```text
MQ135 usable confidence =
    f(
        raw response,
        heater state,
        time since activation,
        temperature,
        humidity,
        recent baseline,
        BME688 context
    )
```

This is one of the areas where hardware-aware firmware becomes central to AEIOS.

## 11. MQ135 Analog Safety

The MQ135 analog output must not be connected directly to an ESP32 ADC if the conditioned signal can exceed the ADC input domain.

The engineering source explicitly requires voltage conditioning before GPIO34.

Firmware must therefore know:

- ADC resolution,
- divider ratio,
- ADC calibration,
- expected maximum conditioned voltage,
- sensor-board variant,
- saturation range.

ADC conversion should conceptually be:

```text
ADC raw
  ↓
ADC calibration
  ↓
divider compensation
  ↓
engineering voltage
  ↓
MQ135 response normalization
  ↓
quality evaluation
```

The divider ratio should be a configuration parameter, not a hard-coded magic number buried inside application code.

## 12. SX1278 Firmware Contract

The SX1278 is the node radio.

Locked band: 433 MHz

Baseline interface:

- GPIO18 → SCK
- GPIO23 → MOSI
- GPIO19 → MISO
- GPIO5  → NSS
- GPIO14 → RESET
- GPIO25 → DIO0

The engineering source explicitly specifies this mapping and identifies the radio's job as compressed/validated packet transmission.

The driver must expose:

init(), reset(), configure(), set_frequency(), set_spreading_factor(), set_bandwidth(), set_coding_rate(), set_tx_power(), send(), receive(), read_rssi(), read_snr(), get_state()

Configuration values should live in a radio configuration structure.

Do not scatter LoRa modem parameters across application code.

## 13. Radio State Machine

Recommended:

```text
RADIO_OFF
    ↓
RADIO_INIT
    ↓
RADIO_READY
    ↓
RADIO_TX
    ↓
RADIO_TX_WAIT
    ↓
RADIO_COMPLETE
    ↓
RADIO_SLEEP
```

Reception/acknowledgment can later add:

RADIO_RX, RADIO_ACK_WAIT, RADIO_RETRY, RADIO_TIMEOUT

The initial software should not overcomplicate acknowledgments unless the telemetry design actually requires them.

The packet layer and radio driver should remain separate.

## 14. Sensor Abstraction Layer

The firmware should have three layers.

Layer 1 — Driver: understands hardware. Example: PMS5003Driver, SCD41Driver, BME688Driver, MQ135Driver, SX1278Driver.

Layer 2 — Normalized sensor service: converts hardware-specific output into project-native objects.

```c
struct PmObservation {
    float pm1;
    float pm25;
    float pm10;
    bool valid;
    uint32_t timestamp;
};
```

Layer 3 — Intelligence: consumes normalized observations.

```text
SensorObservation
      ↓
Quality
      ↓
Features
      ↓
Confidence
      ↓
Adaptive decision
```

This separation is essential.

## 15. Common Observation Structure

A generic observation can include:

```c
struct ObservationMeta {
    uint64_t timestamp_ms;
    uint32_t sequence;
    float quality;
    uint32_t quality_flags;
    SensorState state;
};

struct PmObservation : ObservationMeta {
    float pm1;
    float pm25;
    float pm10;
};

struct ClimateObservation : ObservationMeta {
    float temperature;
    float humidity;
    float co2;
};

struct EnvironmentObservation : ObservationMeta {
    float temperature;
    float humidity;
    float pressure;
    float gas_feature;
};

struct GasObservation : ObservationMeta {
    uint16_t raw_adc;
    float conditioned_voltage;
    float gas_index;
    HeaterState heater_state;
    uint32_t heater_age_ms;
};
```

The exact type system is open to engineering refinement.

Do not force all sensors into one giant struct if doing so creates unnecessary coupling.

## 16. Sensor State Model

Every sensor should have an explicit state.

Recommended: UNKNOWN, DISABLED, INITIALIZING, WARMING, READY, READING, VALID, DEGRADED, FAULT, RECOVERING

Potential transition model:

```text
UNKNOWN
  ↓
INITIALIZING
  ↓
READY
  ↓
READING
  ↓
VALID

Fault:
READING
   ↓
INVALID
   ↓
DEGRADED
   ↓
RECOVERING
   ↓
READY

Persistent failure:
DEGRADED
   ↓
FAULT
```

Do not let an individual sensor fault crash the entire node.

## 17. Graceful Degradation

AEIOS should keep operating if one sensor fails.

Examples:

PMS5003 fails — continue SCD41, BME688, MQ135 if safe, telemetry, diagnostics. Mark PMS5003 = FAULT. Do not fabricate PM values.

SCD41 fails — continue other sensors. Reduce confidence of events requiring CO₂ evidence.

BME688 fails — remove its contribution from gas/context reasoning.

MQ135 fails — do not force a heater retry loop. Disable the sensor if necessary and continue using the lower-power sensors.

## 18. Boot Sequence

The preferred boot process:

```text
POWER ON
  ↓
Early hardware initialization
  ↓
Watchdog
  ↓
Nonvolatile configuration load
  ↓
GPIO safety configuration
  ↓
I²C initialization
  ↓
UART initialization
  ↓
SPI initialization
  ↓
Sensor identity checks
  ↓
Radio initialization
  ↓
Power-state verification
  ↓
Baseline acquisition
  ↓
System READY
```

Boot should generate a diagnostic record.

Example:

```text
BOOT
firmware=1.0.0
node_id=NODE-03
pms5003=OK
scd41=OK
bme688=OK
mq135=OK
sx1278=OK
battery=OK
```

## 19. Startup Order and Dependencies

Recommended dependency order:

1. Power and GPIO.
2. Communication buses.
3. Digital sensors.
4. Analog path.
5. Radio.
6. Higher-level intelligence.

The event engine must not begin making strong decisions before sufficient baseline data exists.

## 20. Baseline Acquisition

A sensor node needs an understanding of "normal."

Baseline collection should therefore be explicit.

Possible baseline features: rolling mean, rolling variance, median, MAD, rate of change, short-term slope, long-term trend, sensor agreement, sensor disagreement.

Example: PM2.5, CO₂, BME gas, MQ135, temperature, humidity, pressure baselines.

Do not build a confidence model that assumes the first single reading is the environmental baseline.

## 21. Sampling Scheduler

The initial firmware should have a centralized scheduler.

```text
Scheduler
│
├── PMS task
├── SCD41 task
├── BME688 task
├── MQ135 task
├── radio task
├── power task
├── diagnostics task
└── heartbeat
```

Avoid a single giant loop containing all sensor-specific timing logic.

A cooperative scheduler or RTOS task design can be used.

The implementation choice is open.

The important requirement is deterministic sensor ownership and non-blocking behavior.

## 22. Sampling Modes

Recommended initial modes: BOOT, CALIBRATION, NORMAL, WATCH, EVENT_CONFIRMATION, HIGH_RESOLUTION, LOW_BATTERY, DEGRADED, RECOVERY, SAFE.

Example behavior:

- NORMAL — standard sampling, normal telemetry, normal power policy.
- WATCH — triggered by a weak anomaly; increase selected contextual sampling; gather evidence; avoid immediately turning everything on.
- EVENT_CONFIRMATION — multiple signals suggest something is happening; increase relevant measurements; activate additional confirmation channel if useful.
- HIGH_RESOLUTION — strong event confidence; tighter sampling; high-priority packet generation; more detailed diagnostics.
- LOW_BATTERY — reduce high-power operations; lengthen intervals; reduce unnecessary telemetry; preserve core environmental monitoring.
- SAFE — severe power/system condition; minimal safe sensing; radio only when required; wait for recovery.

## 23. Adaptive Scheduler Interface

The scheduler should not directly contain the AI algorithm.

Instead:

```text
Decision decision =
    adaptive_policy.evaluate(context);
```

where context might contain: latest observations, quality states, event confidence, battery state, solar state, radio state, sensor thermal state, current operating mode.

The result could be: next sampling interval, sensors to activate, MQ135 heater command, telemetry priority, mode transition.

This keeps the adaptive policy replaceable.

## 24. Sensor Confidence Engine Interface

The intelligence layer should operate on normalized observations.

Conceptual interface:

```text
ConfidenceResult evaluate(
    const SensorSnapshot& current,
    const SensorHistory& history,
    const SystemContext& system
);
```

Output: event_confidence, event_type, severity, supporting_signals, contradicting_signals, sensor_confidence, recommended_action.

Do not directly couple this function to I²C/UART/SPI.

## 25. Hardware-Aware Confidence

The confidence model should eventually be able to account for:

- PMS5003 airflow health
- SCD41 calibration state
- BME688 gas mode
- MQ135 heater age
- MQ135 baseline age
- ESP32 thermal state
- battery condition
- radio quality

Example:

MQ135 reading rises BUT heater_age = 4 s AND thermal stabilization incomplete → reduce trust in MQ135.

This is not a claim that this logic is already validated. It is an intended engineering research direction.

## 26. Filtering

Filtering should be sensor-specific.

- PMS5003 — plausibility limits, median/EMA, rate-of-change checks, humidity-aware correction only after validation.
- SCD41 — baseline tracking, plausibility, temporal smoothing where appropriate.
- BME688 — feature normalization, baseline drift tracking, outlier handling.
- MQ135 — warm-up gating, moving average, baseline normalization, drift monitoring.

Never apply the same filter blindly to every sensor.

## 27. Quality Flags

The firmware should use machine-readable quality flags.

Example: VALID, STALE, OUT_OF_RANGE, CHECKSUM_ERROR, BUS_ERROR, WARMING, CALIBRATING, DRIFT_SUSPECTED, CONDENSATION_RISK, LOW_POWER, SENSOR_FAULT, INSUFFICIENT_BASELINE.

Quality flags must survive through:

sensor → normalized observation → event engine → packet → gateway database → AI → dashboard

Do not throw them away after acquisition.

## 28. Watchdog and Recovery

The firmware must include: watchdog, brownout detection/handling, sensor timeout, communication timeout, bounded retries, fault counters.

A failed I²C sensor should not hang the entire MCU.

A lost radio packet should not lock the scheduler.

A heater-control error should not leave MQ135 indefinitely active without software awareness.

## 29. Brownout Strategy

Brownouts can occur because of: PMS5003 current demand, MQ135 heater, radio transmission peaks, regulator limitations, battery sag.

The power architecture explicitly separates the 5-V sensor/heater loads from the 3.3-V MCU/radio rail to reduce destabilization.

Firmware should: detect low supply, record the state, reduce optional loads, extend sampling intervals, limit radio behavior if required, preserve a recoverable state.

## 30. Power Manager

The power manager should expose: battery_voltage, battery_state, solar_state, estimated_energy_state, current_mode, allowed_sensor_actions.

It should not make unvalidated battery chemistry assumptions.

The exact battery model and charger hardware are hardware-validation responsibilities.

Firmware should work from measured electrical state.

## 31. Power-Aware Policy

The conceptual decision:

battery healthy + solar available + event confidence rising → normal/high-resolution operation

Versus:

battery low + environment stable → energy preservation

Potentially: MQ135 disabled, sampling interval increased, radio batching enabled, SCD41/BME688 retained.

This policy must be experimentally tuned.

## 32. MQ135 Energy Strategy

Because the MQ135 heater is a meaningful load, the firmware architecture must make heater control explicit.

Possible states: HEATER_OFF, HEATER_START, HEATER_WARMING, HEATER_STABLE, HEATER_MEASURING, HEATER_STOPPING.

Potential future policy:

```text
continuous environmental event evidence
         ↓
Would MQ135 add information?
         ↓
YES ──→ heater activation
NO  ──→ remain off / defer
```

This is one of AEIOS's intended research areas.

## 33. Firmware Timing

Do not assume one universal sampling period.

Different sensors have different practical timing.

For example:

- fast: PMS frame acquisition
- moderate: BME environmental readings
- slower: SCD41 meaningful CO₂ response
- conditional: MQ135 activated measurement window
- event-driven: LoRa transmission

The exact numerical schedule should be developed experimentally.

Context 02 does not freeze arbitrary sample intervals.

## 34. Concurrency Model

The firmware can be implemented using:

- Option A — Cooperative scheduler. Advantages: deterministic, lightweight, easy to reason about.
- Option B — FreeRTOS tasks. Advantages: better separation, easier asynchronous drivers, useful for radio + sensors.
- Option C — Hybrid.

Recommended investigation direction:

```text
FreeRTOS
│
├── Sensor acquisition tasks
├── Adaptive intelligence task
├── Radio task
├── Power/health task
└── Diagnostics task
```

But the project should not introduce multitasking complexity unless it creates real value.

## 35. Recommended Internal Modules

Suggested repository:

```text
firmware/
└── sensing_node/
    ├── src/
    │   ├── main.cpp
    │   ├── app/
    │   │   ├── system_manager
    │   │   ├── operating_mode
    │   │   └── scheduler
    │   ├── config/
    │   │   ├── pins
    │   │   ├── node_config
    │   │   └── sensor_config
    │   ├── sensors/
    │   │   ├── pms5003
    │   │   ├── scd41
    │   │   ├── bme688
    │   │   └── mq135
    │   ├── radio/
    │   │   ├── sx1278
    │   │   ├── radio_manager
    │   │   └── packet
    │   ├── processing/
    │   │   ├── normalization
    │   │   ├── validation
    │   │   ├── calibration
    │   │   ├── filtering
    │   │   ├── features
    │   │   └── confidence
    │   ├── adaptive/
    │   │   ├── policy
    │   │   ├── scheduler
    │   │   └── energy_policy
    │   ├── power/
    │   │   ├── battery
    │   │   └── power_manager
    │   └── diagnostics/
    │       ├── watchdog
    │       ├── health
    │       └── metrics
    └── test/
```

Creativity is open within this structure.

If another architecture proves superior, the structure can evolve.

## 36. Driver API Philosophy

Hardware drivers should present stable application-facing interfaces.

Example:

```cpp
class Sensor {
public:
    virtual bool begin() = 0;
    virtual SensorStatus status() const = 0;
    virtual bool update() = 0;
};
```

But avoid forcing inappropriate inheritance if composition provides a cleaner design.

The point is abstraction of hardware details.

## 37. Configuration

Runtime configuration should include: node_id, sampling policy, sensor enable states, MQ135 divider ratio, calibration offsets, radio parameters, packet version, diagnostic level, operating-mode thresholds, power thresholds.

Store configuration in nonvolatile storage.

Do not compile every deployment-specific value into source code.

## 38. Node Identity

Each node should have: node_id, hardware_version, firmware_version, configuration_version.

Example: NODE-01, HW-A, FW-0.1.0, CFG-3

This must be included in diagnostics and preferably packet metadata.

## 39. Firmware Versioning

Use semantic versioning or a similarly explicit mechanism: MAJOR.MINOR.PATCH (0.1.0, 0.2.0, 1.0.0).

Database/gateway compatibility should understand firmware version.

Packet schema version is separate.

Do not assume firmware version == packet version.

They are different concepts.

## 40. Diagnostics

Every major module should expose health metrics.

Possible: sensor_read_count, sensor_error_count, last_success_timestamp, last_error_code, consecutive_failure_count, recovery_count.

MQ135 additionally: heater_activation_count, heater_runtime, last_warmup_duration.

Radio: tx_count, tx_success, tx_failure, retry_count, rssi, snr.

Power: battery_voltage, low_battery_count, brownout_count.

## 41. Testable Fault Injection

Firmware should support development-only fault injection.

Examples: simulate_pms_timeout, simulate_i2c_failure, simulate_bme688_drift, simulate_mq135_spike, simulate_low_battery, simulate_lora_failure, simulate_corrupt_packet.

This allows the intelligence engine to be tested before field deployment.

Fault injection must be disabled or safely protected in production firmware.

## 42. Embedded Test Cases

Minimum target:

- BOOT-001 Node starts without solar.
- SENSOR-001 PMS5003 valid frame.
- SENSOR-002 PMS5003 checksum failure.
- SENSOR-003 SCD41 missing.
- SENSOR-004 BME688 address detection.
- SENSOR-005 MQ135 ADC over-range.
- SENSOR-006 MQ135 warm-up gating.
- RADIO-001 SX1278 initialization.
- RADIO-002 Packet CRC generation.
- RADIO-003 Packet transmission timeout.
- POWER-001 Low battery policy.
- POWER-002 Brownout recovery.
- ADAPT-001 Stable environment → low-power policy.
- ADAPT-002 PM event → increased sampling.
- ADAPT-003 Single-sensor spike → low confidence.
- ADAPT-004 Multimodal agreement → high confidence.

The engineering source already defines several of these test directions, including PMS checksum failures, I²C disconnects, MQ135 ADC over-voltage, LoRa packet loss, low-battery sampling changes, PM-driven sampling changes, gateway outage and condensation challenges.

## 43. Sensor Driver Unit Testing Without Hardware

Each driver should support a mock/test mode.

Example PMS frame: valid frame, invalid checksum, truncated frame, oversized values, stale frame.

Example MQ135: raw ADC = 100, 1000, saturation; heater = warming / stable.

Example SCD41: valid CO₂, invalid RH, I²C unavailable.

This allows CI to execute without a physical ESP32.

## 44. Hardware-in-the-Loop

After unit tests: Firmware → ESP32 → real sensor → real radio → gateway.

HIL tests should validate: timing, electrical stability, sensor readings, packet integrity, recovery behavior.

## 45. Mechanical/Firmware Contract

Firmware must assume: PMS airflow geometry exists, environmental sensors are thermally isolated, MQ135 has a heater, electronics may create heat, outdoor condensation is possible.

The engineering blueprint explicitly treats the enclosure as an instrument rather than merely a box, with separate air inlet/outlet paths, environmental sensing zone, gas zone, electronics zone and power zone.

The firmware should expose states needed to interpret physical conditions: heater state, warmup age, sensor temperature, humidity, battery state, sampling mode.

## 46. Embedded Safety Rules

Never:

- drive an unverified voltage into ESP32 ADC,
- assume a sensor is healthy because it answered once,
- block indefinitely waiting for a sensor,
- allow failed sensors to deadlock the main control loop,
- transmit unvalidated data as if it were correct,
- activate MQ135 indefinitely without tracking the state,
- ignore brownouts,
- change radio frequency outside the locked 433-MHz design,
- add GPS dependencies,
- hide calibration state.

## 47. What the Firmware Must Never Assume

It must never assume:

- all sensors are always present,
- all sensors produce data at the same rate,
- MQ135 provides exact ppm,
- one sensor represents environmental truth,
- power is infinite,
- LoRa always succeeds,
- the gateway is always online,
- internet is always available,
- node location is available from hardware,
- every environmental change is a real event,
- every sensor anomaly is an environmental event.

## 48. Open Engineering Decisions

The following are intentionally not frozen and may be optimized creatively:

- FreeRTOS task topology vs cooperative scheduler.
- Exact sensor sampling periods.
- Exact operating-mode thresholds.
- Confidence mathematical formulation.
- Feature extraction techniques.
- MQ135 duty-cycle policy.
- Battery-state estimation algorithm.
- LoRa spreading factor/bandwidth/coding-rate configuration.
- ACK/retry policy.
- Packet compression strategy.
- On-node filtering algorithm.
- On-node anomaly model.
- Configuration protocol.
- Firmware update architecture.
- Logging verbosity.
- Test framework.
- Build system, provided it remains maintainable.

The agent may propose better approaches.

## 49. Embedded Performance Expectations

The firmware should be designed for: deterministic acquisition, bounded latency, low unnecessary RAM use, low power, fault isolation, observable state, reproducible behavior.

Avoid unnecessary dynamic allocation in core sensor/radio paths if it creates fragmentation or unpredictable behavior.

Prefer: fixed buffers, bounded queues, explicit ownership, compile-time constants where appropriate, clear error codes.

## 50. Recommended Initial Firmware Milestones

- M1 — Board Bring-Up: ESP32 boots, GPIO tested, serial logging works, configuration loaded, watchdog works.
- M2 — Sensor Drivers: PMS5003, SCD41, BME688, MQ135 independently tested.
- M3 — Normalized Observation Layer.
- M4 — Validation / Quality: bad samples rejected and flagged.
- M5 — SX1278: reliable 433-MHz packet transmission.
- M6 — Integrated Loop: sensor → validate → packet → gateway.
- M7 — Adaptive Intelligence: event → confidence → changed sampling.
- M8 — Energy Policy: battery condition → changed sensor/radio behavior.
- M9 — Fault Resilience.
- M10 — Hardware-in-the-loop validation.

## 51. Definition of Firmware Complete

The sensing-node firmware is complete enough for V1 when it can:

- Boot safely.
- Discover/initialize the locked sensors.
- Collect validated measurements.
- Track quality state.
- Maintain sensor-specific lifecycle states.
- Perform local preprocessing.
- Compute initial cross-modal features.
- Produce versioned observations.
- Communicate using SX1278 at 433 MHz.
- Detect radio failures.
- Monitor battery/power state.
- Modify sampling according to validated policy.
- Handle at least one sensor failing without collapsing the node.
- Recover from transient faults.
- Produce reproducible diagnostics.
- Operate without GPS.
- Be testable without physical hardware through mocks/simulation.
- Support hardware-in-the-loop testing.

## 52. Relationship to Patent-Relevant Software

The firmware architecture should leave explicit interfaces for:

- CrossModalConfidenceEngine
- InformationValueEstimator
- AdaptiveSamplingPolicy
- EnergyPolicy
- SensorPlacementContext
- FaultDifferentiationEngine
- TelemetryPriorityPolicy

These modules may begin as deterministic algorithms.

Later they may be replaced by statistical/ML implementations.

The firmware architecture must not make that transition painful.

This is intentional because AEIOS's patent research identifies cross-modal event confidence, confidence-driven sensor role switching and information-value-per-energy sensing as strategically important directions.

## 53. Final Context Rule

For an AI coding agent:

- Hardware drivers know hardware.
- Sensor services know measurements.
- Processing knows meaning.
- The adaptive policy decides behavior.
- The radio layer knows communication.
- The application layer orchestrates the node.

No layer should silently take over another layer's responsibilities.

The embedded system should remain modular enough that the PMS5003 driver can be improved without rewriting the confidence engine, and the confidence engine can evolve without rewriting the SX1278 driver.

This separation is a core maintainability requirement.

## 54. Next Context File

Context File 03 — Communication + Gateway + Database Context.

It will define: SX1278 packet protocol, packet schema/versioning, sequencing, CRC, retries/ACK policy, node IDs, gateway receiver, Raspberry Pi 5 software architecture, SQLite database, migrations, offline-first storage, duplicate detection, replay, gateway API, configuration delivery, gateway-to-node boundaries, observability, and data lifecycle.

Context 03 must build directly on the hardware and firmware contracts defined here.
