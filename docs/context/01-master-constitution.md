# AEIOS — Context File 01

Master Project Context / System Constitution

Purpose of this file: This is the first and highest-level context file for an AI coding agent working on AEIOS. It is intended to be loaded before any implementation task. It defines what AEIOS is, what is locked, what must not be assumed, what the software is expected to accomplish, and where creative engineering freedom is intentionally preserved.

**Ingest status:** Canonical copy of Context File 01 (citation artifacts stripped). Draft until [CONFLICT_MATRIX.md](CONFLICT_MATRIX.md) is resolved. Does not silently override Gate A–C controlled documents.

## 1. Project Identity

Project name: AEIOS  
Full name: Adaptive Environmental Intelligence Operational System  
Domain: Environmental Intelligence / AI / IoT / Edge Computing / Distributed Sensing  
Primary deployment concept: Distributed outdoor environmental monitoring with autonomous sensing nodes and a central edge gateway.

AEIOS is not intended to be merely an air-quality dashboard.

The project is intended to be an adaptive environmental intelligence system that:

- senses environmental conditions,
- validates and contextualizes measurements,
- detects changes and environmental events,
- decides what additional sensing is useful,
- adapts its sensing behavior,
- communicates important observations efficiently,
- maintains local operation when connectivity is unavailable,
- performs multi-node intelligence at an edge gateway,
- predicts environmental risk where sufficient data exists,
- explains why an event or recommendation was produced.

The original proposal positions AEIOS around AI, IoT, environmental monitoring, smart-city applications and edge computing. Its stated problem is that conventional systems largely collect and display environmental data without sufficient predictive, adaptive and decision-making capability. The stated innovation includes multi-node sensing, centralized AI at a gateway, anomaly detection, adaptive sensor sampling, edge processing, offline operation, modularity and low-cost deployment.

## 2. Core Product Vision

The mental model for AEIOS is:

```text
          CONVENTIONAL SENSOR SYSTEM

       Sensors → Data → Dashboard


          AEIOS

       Sensors
          ↓
   Physical Context
          ↓
   Quality Assessment
          ↓
   Multimodal Reasoning
          ↓
   Event Confidence
          ↓
   Adaptive Sensing
          ↓
   Efficient Telemetry
          ↓
   Gateway Intelligence
          ↓
   Prediction / Detection / Explanation
          ↓
   Decision Support
          ↺
   Feedback into sensing
```

The critical conceptual shift is:

AEIOS should be a closed-loop sensing system, not a passive measurement system.

The system should be able to ask:

- Is this measurement believable?
- Is this change likely to be environmental or sensor-specific?
- Do independent physical sensing modalities agree?
- Is another sensor worth activating now?
- Is the information gained worth the energy spent?
- Should the node sample faster or slower?
- Should the node transmit immediately or defer/batch?
- Is the gateway receiving enough evidence to classify an event?
- Should the gateway change the behavior of the node?

This feedback loop is a central design principle.

## 3. Authoritative Hardware Baseline

The following components are LOCKED for the current AEIOS build.

Do not replace them casually in implementation tasks.

### 3.1 PMS5003

Role:

- Primary particulate sensing modality.
- Optical particle-scattering sensor.
- Provides PM1.0 / PM2.5 / PM10-related observations and particle-count information.
- UART interface.
- Requires a controlled air path.

AEIOS interpretation:

- This is one of the strongest quantitative environmental signals.
- It is not a universal gas sensor.
- It should be treated as an event-confirmation modality and as one of the primary pollution indicators.
- PM rate-of-change is valuable for adaptive sensing.

Mechanical implications:

- Controlled inlet.
- Separate exhaust.
- Protection against direct water/splash.
- Condensation management.
- Avoid recirculating the sensor exhaust into the inlet.
- Keep away from MQ135 heater and electronics-generated heat.

The engineering blueprint describes PMS5003 as a primary particulate signal and explicitly connects it to adaptive sampling through PM rate-of-change.

### 3.2 SCD41

Role:

- Primary quantitative CO₂ sensor.
- Also provides temperature and relative humidity.
- I²C interface.
- Fixed I²C address in the AEIOS design.

AEIOS interpretation:

- This is the preferred quantitative CO₂ channel.
- Do not infer CO₂ directly from MQ135.
- Temperature and humidity are contextual signals and can cross-check BME688.

The engineering document specifies a 0–40,000 ppm output range and states the SCD41 accuracy under its specified conditions.

Mechanical implications:

- Ambient-air exposure.
- Isolated from MQ135 heater.
- Isolated from regulator/ESP32 heat.
- Do not place in PMS5003 exhaust.

### 3.3 BME688

Role:

- Temperature.
- Humidity.
- Pressure.
- Gas-response / gas-feature sensing.

AEIOS interpretation:

- BME688 is a contextual multi-parameter sensor.
- It provides richer environmental context than MQ135 alone.
- Gas outputs are not to be presented as universally calibrated ppm measurements.
- Gas-response features are especially useful for anomaly/event reasoning.

The engineering blueprint explicitly positions BME688 as T/RH/pressure plus gas-feature context and warns against treating gas output as a universal calibrated analyzer.

Mechanical implications:

- Ambient-air access.
- Splash protection.
- Thermal isolation.
- Keep away from MQ135 heater and switching regulators.

### 3.4 MQ135

Role:

- Broad gas-response sensing.
- Heated semiconductor / SnO₂ sensing.
- Analog measurement.
- Significant heater power.

AEIOS interpretation:

- MQ135 is not allowed to become an inaccurate pretend-ppm sensor.
- It should primarily function as:
  - a broad gas-response feature,
  - contextual evidence,
  - an anomaly trigger,
  - a complementary modality.

The engineering blueprint explicitly notes cross-sensitivity and says raw ADC voltage must not be labelled as ppm without target-specific calibration.

This sensor is strategically important to AEIOS because its heater introduces a real energy cost and thermal side effect.

This makes it a candidate for:

- conditional activation,
- duty cycling,
- warm-up state modeling,
- information-value-per-energy reasoning,
- sensor-placement-aware confidence.

Mechanical implications:

- Separate thermal zone.
- Dedicated ambient vent.
- Do not let its hot plume flow into SCD41/BME688.
- Do not locate immediately adjacent to temperature-sensitive components.

### 3.5 ESP32-DevKitC-32E — 38-pin

Locked development controller.

Primary role:

- Sensor acquisition.
- Sensor validation.
- Local preprocessing.
- Quality estimation.
- Feature extraction.
- Adaptive sensing logic.
- Packetization.
- SX1278 control.
- Power-state decisions.
- Diagnostics.

The exact development-board choice is:

ESP32-DevKitC-32E, 38-pin.

The board has Wi-Fi and Bluetooth/BLE capability because of the underlying ESP32-WROOM-32E platform.

However:

Wi-Fi and Bluetooth are NOT part of the normal AEIOS field telemetry path.

Normal field behavior should use:

- wired sensor buses internally,
- SX1278 433-MHz LoRa externally.

Wi-Fi/BLE may be considered later for controlled commissioning or maintenance if useful, but they should not become an accidental architectural dependency.

### 3.6 SX1278 — 433 MHz

Locked radio choice.

AEIOS uses SX1278 at the 433-MHz implementation.

Do not redesign AEIOS around 868 MHz or 915 MHz unless the project team explicitly reopens the locked hardware decision.

Role:

- Low-power long-range telemetry.
- Small packet transport.
- Event-priority communication.
- Node-to-gateway link.

AEIOS should not try to stream high-volume raw sensor data continuously over LoRa.

The radio should transport validated, meaningful, versioned observations and events.

The engineering documentation identifies the SX1278 family and the 433-MHz class as the intended implementation.

### 3.7 Raspberry Pi 5

Role:

- Central gateway.
- LoRa reception interface.
- Packet validation.
- Local database.
- Multi-node aggregation.
- AI/analytics.
- Event correlation.
- Dashboard backend.
- Offline-first operation.
- Configuration distribution to nodes.

The Pi 5 is not just a bridge.

It is the system-level intelligence hub.

### 3.8 Power System

AEIOS uses autonomous outdoor power.

Current engineering direction:

- Solar input.
- Rechargeable battery.
- Regulated 5-V rail.
- Regulated 3.3-V rail.
- Power monitoring.
- Protection.
- Energy-aware operation.

Critical design principle:

Battery chemistry and charger chemistry must match.

Do not blindly pair a generic 4.2-V Li-ion charger configuration with a LiFePO₄ battery.

The software must remain able to adapt to the actual validated power subsystem.

## 4. GPS / GNSS Status

GPS IS NOT USED.

This is an explicit project decision.

Do not introduce:

- NEO-6M,
- NEO-6,
- GPS coordinates in node packets,
- GNSS drivers,
- PPS,
- GPS acquisition,
- GPS antenna hardware,

unless the project owner explicitly reopens this decision.

AEIOS uses static deployment knowledge instead.

The gateway/database can store:

- node_id
- installation_site
- configured_latitude
- configured_longitude
- zone
- description

The node itself only needs its identity.

This is important because AEIOS is designed for fixed environmental nodes.

The software architecture must therefore support spatial intelligence without requiring the node to determine its own coordinates.

## 5. Current Node-Level Interface Baseline

The proposed baseline interface mapping is:

```text
I²C
GPIO21 = SDA
GPIO22 = SCL

Devices:
  SCD41
  BME688


UART
GPIO16 = RX
GPIO17 = TX

Device:
  PMS5003


SPI
GPIO18 = SCK
GPIO23 = MOSI
GPIO19 = MISO
GPIO5  = NSS/CS

Device:
  SX1278


LoRa control
GPIO14 = RESET
GPIO25 = DIO0


ADC
GPIO34 = MQ135 conditioned analog signal
```

Important:

The software should keep GPIO mapping in one configuration layer.

Never scatter raw pin numbers throughout the application.

Use something equivalent to:

```c
struct HardwarePins {
    static constexpr int PMS_RX = 16;
    static constexpr int PMS_TX = 17;

    static constexpr int I2C_SDA = 21;
    static constexpr int I2C_SCL = 22;

    static constexpr int LORA_SCK  = 18;
    static constexpr int LORA_MOSI = 23;
    static constexpr int LORA_MISO = 19;
    static constexpr int LORA_NSS  = 5;
    static constexpr int LORA_RST  = 14;
    static constexpr int LORA_DIO0 = 25;

    static constexpr int MQ135_ADC = 34;
};
```

## 6. System Architecture

The preferred software architecture is:

```text
                    ┌─────────────────────┐
                    │     DASHBOARD       │
                    │ Web UI / Analytics  │
                    └──────────┬──────────┘
                               │
                         HTTP / WS / API
                               │
                    ┌──────────▼──────────┐
                    │     GATEWAY API     │
                    │      FastAPI        │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼──────────────────────┐
         │                     │                      │
         ▼                     ▼                      ▼
   AI / Analytics        Event Engine           Database
         │                     │                      │
         └─────────────────────┼──────────────────────┘
                               │
                         Gateway Core
                               │
                       LoRa Radio Interface
                               │
                         433-MHz LoRa
                               │
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
     NODE 01                 NODE 02               NODE N
        │                      │
      ESP32                  ESP32
        │                      │
   Sensor stack           Sensor stack
```

## 7. Sensing Node Software Layers

The firmware should conceptually contain:

```text
Application
│
├── Event Engine
├── Adaptive Sampling
├── Power Policy
└── Telemetry Policy
│
Processing
│
├── Feature Extraction
├── Calibration
├── Filtering
├── Quality Assessment
└── Sensor Fusion
│
Sensors
│
├── PMS5003 Driver
├── SCD41 Driver
├── BME688 Driver
└── MQ135 Driver
│
Communication
│
└── SX1278 Driver / Packet Layer
│
Hardware
│
└── ESP32 / GPIO / ADC / I2C / UART / SPI
```

## 8. The Node Must NOT Behave Like a Simple Logger

A naive firmware implementation would do:

```text
read all sensors
↓
send all values
↓
sleep
```

This is insufficient for AEIOS.

Preferred architecture:

```text
BOOT
 ↓
SELF TEST
 ↓
SENSOR INITIALIZATION
 ↓
BASELINE ACQUISITION
 ↓
NORMAL MONITORING
 ↓
QUALITY CHECK
 ↓
FEATURE UPDATE
 ↓
EVENT ANALYSIS
 ↓
CONFIDENCE CALCULATION
 ↓
ADAPTIVE DECISION
 ↓
OPTIONAL SENSOR ACTIVATION
 ↓
EVENT / TELEMETRY DECISION
 ↓
TRANSMIT
 ↓
POWER MANAGEMENT
 ↓
NEXT CYCLE
```

## 9. Sensor Confidence Philosophy

Every sensor reading should have more meaning than:

```json
{
  "value": 83
}
```

AEIOS should eventually reason about:

```json
{
  "value": 83,
  "quality": 0.94,
  "state": "valid",
  "confidence": 0.89,
  "calibration_state": "valid",
  "sensor_mode": "normal"
}
```

Not every sensor needs exactly the same fields.

The data model should distinguish:

- measurement,
- quality,
- confidence,
- sensor operational state,
- calibration state,
- event relevance.

## 10. Cross-Modal Event Reasoning

This is a central AEIOS concept.

Example A:

- PMS5003 stable
- SCD41 stable
- BME688 stable
- MQ135 sudden spike

Interpretation:

likely sensor-specific or gas-localized disturbance; low environmental-event confidence unless additional evidence arrives.

Example B:

- PMS5003 rising quickly
- SCD41 changing
- BME688 gas feature rising
- MQ135 rising

Interpretation:

multiple independent modalities agree; increase event confidence.

The important point is:

Do not simply average the sensors.

Their physical meaning is different.

AEIOS should use the difference in physical modalities as an advantage.

## 11. Confidence-Driven Sensor Role Switching

One of the most important project ideas:

Low-cost / lower-energy observation

For example:

SCD41 + BME688

can provide continuous contextual evidence.

If the system detects suspicious environmental movement:

BME688 gas feature rises

the system can change behavior:

increase PMS5003 sampling

If PM confirms the environmental event:

activate / increase MQ135 measurement window

If all modalities converge:

high-confidence event

then:

high-priority LoRa event packet

This is intended to make AEIOS hierarchical and active, not passive.

## 12. Information Value per Energy

A central creative opportunity is:

```text
expected information value
          /
energy required
```

The project should investigate whether the node can estimate:

"Is activating this expensive sensor worth the energy right now?"

For MQ135 specifically, the system may consider:

- current battery state,
- expected heater cost,
- duration of activation,
- recent event evidence,
- disagreement between sensors,
- predicted value of the additional measurement.

Possible action:

```text
if expected_information_gain /
   expected_energy_cost
   > threshold:
       activate MQ135
else:
       defer MQ135
```

This is a design hypothesis and must be experimentally validated before being treated as a proven project capability.

## 13. Sensor Placement Awareness

AEIOS should eventually know that sensor location and operating state affect measurement reliability.

For example:

MQ135 heater just activated
+
ambient temperature
+
humidity
+
time since activation

can influence how much trust is placed on its output.

Therefore a future confidence model may incorporate:

sensor reading
+
sensor thermal state
+
time since activation
+
environmental context
+
historical baseline

This connects:

hardware + firmware + AI

rather than treating them as unrelated subsystems.

## 14. Gateway Responsibilities

Raspberry Pi 5 should provide:

```text
LoRa Reception
      ↓
Packet Validation
      ↓
CRC / Schema Validation
      ↓
Duplicate Detection
      ↓
Sequence Analysis
      ↓
Time Ordering
      ↓
Database Persistence
      ↓
Feature Aggregation
      ↓
AI / Event Analysis
      ↓
API
      ↓
Dashboard
```

The gateway should be offline-first.

Internet failure must not stop:

- node reception,
- database writes,
- event analysis,
- local dashboard functionality,
- diagnostics.

## 15. Database Philosophy

Current database recommendation:

SQLite on the Raspberry Pi 5.

The ESP32 should not use a traditional relational database.

Node-side:

- RAM buffers,
- persistent configuration,
- diagnostics,
- limited event buffering if required.

Gateway-side:

- SQLite,
- versioned schema,
- migrations,
- local-first storage.

Possible tables:

- nodes
- sensor_readings
- sensor_states
- events
- event_features
- quality_metrics
- power_state
- radio_packets
- sampling_decisions
- configuration
- system_logs
- model_versions

The key distinction:

Store not only what happened, but why AEIOS made a sensing decision.

For example:

```text
sampling_decisions
────────────────────────────
timestamp
node_id
previous_mode
new_mode
trigger
confidence
expected_information_gain
estimated_energy_cost
selected_sensor
```

This will be extremely valuable for:

- debugging,
- AI research,
- experiments,
- patent evidence,
- explainability,
- system optimization.

## 16. Packet Philosophy

AEIOS should use an explicit, versioned packet protocol.

Conceptual packet:

```text
MAGIC
VERSION
NODE_ID
SEQUENCE
TIMESTAMP

PM1
PM2_5
PM10

CO2
TEMPERATURE
HUMIDITY

PRESSURE
BME_GAS_FEATURE
MQ135_VALUE

QUALITY_FLAGS
CONFIDENCE
OPERATING_MODE
SAMPLING_INTERVAL

BATTERY_STATE

RSSI/SNR metadata where applicable

FIRMWARE_VERSION

CRC
```

No GPS fields.

No GPS coordinates.

Node location belongs to gateway configuration.

## 17. Event Record

The gateway should distinguish:

- Observation — Routine measurement.
- Candidate event — Something changed enough to investigate.
- Confirmed event — Multiple signals support the interpretation.
- Sensor fault — Evidence indicates the sensor itself may be unreliable.
- Recovery — A sensor/event returns to normal.

Example:

```json
{
  "event_id": "EVT-000042",
  "node_id": "NODE-03",
  "event_type": "MULTIMODAL_ENVIRONMENTAL_ANOMALY",
  "confidence": 0.91,
  "severity": "HIGH",
  "triggered_by": [
    "pm25_rate",
    "bme688_gas_change",
    "mq135_response"
  ],
  "sensor_quality": {
    "pms5003": 0.96,
    "scd41": 0.94,
    "bme688": 0.91,
    "mq135": 0.71
  }
}
```

## 18. Spatial Intelligence Without GPS

Every deployed node has a configured static location.

Example gateway configuration:

```text
nodes:
  NODE-01:
    site: "North Gate"
    latitude: ...
    longitude: ...

  NODE-02:
    site: "Academic Block"
    latitude: ...
    longitude: ...

  NODE-03:
    site: "Main Road"
    latitude: ...
    longitude: ...
```

The node does not need GPS.

The gateway can reconstruct:

```text
time:
10:00 Node 03
10:01 Node 04
10:03 Node 05
10:05 Node 02
```

and use the configured spatial positions to infer:

- propagation direction,
- approximate source region,
- event movement,
- spatial confidence.

This is a research direction, not an assumption that the algorithm is already solved.

## 19. AI Architecture Direction

The AI layer should not be one monolithic model.

Prefer:

```text
Raw Data
   ↓
Quality Engine
   ↓
Feature Engineering
   ↓
Baseline / Drift Models
   ↓
Event Detection
   ↓
Event Classification
   ↓
Spatial / Temporal Correlation
   ↓
Forecasting
   ↓
Explainability
```

Potential techniques include:

- statistical thresholds,
- EWMA/CUSUM,
- Isolation Forest,
- One-Class SVM,
- XGBoost,
- LightGBM,
- temporal models,
- Bayesian approaches,
- change-point detection,
- clustering,
- graph/spatial models.

The project should not commit prematurely to any single ML algorithm.

Algorithm choice must be driven by data availability, latency, explainability, energy constraints and validation results.

Creativity is explicitly open here.

## 20. Explainability

AEIOS should eventually answer:

"Why did you classify this as an event?"

rather than:

"AI says event."

Possible explanation:

```text
Event confidence: 91%

Primary contributors:
  PM2.5 rapid increase       +0.31
  BME688 gas-feature change  +0.24
  MQ135 response change      +0.18
  CO₂ transition             +0.11

Sensor quality:
  PMS5003 0.96
  SCD41   0.94
  BME688  0.91
  MQ135   0.71

Reason:
Independent sensing modalities
changed within the same temporal
window.
```

This is much more useful for professional deployment.

## 21. Patent Awareness in Software Design

AEIOS software should be designed with the current patent strategy in mind.

The three major invention families under consideration are:

- Family A — Core Edge Intelligence: Cross-modal event confidence + conditional sensor activation + energy-aware sensing.
- Family B — Physical Node: Thermal and aerodynamic partitioning of the sensor enclosure.
- Family C — Distributed Intelligence: GPS-less, fixed-coordinate, confidence-weighted spatiotemporal event reconstruction.

The patent research explicitly identifies cross-modal event confidence and information-value-per-energy as the most strategically important intellectual-property directions.

Therefore:

When implementing the software, do not accidentally reduce AEIOS to a generic "read → upload → dashboard" system.

The implementation should preserve the ability to experimentally demonstrate the intended distinctive behavior.

## 22. What Is NOT the Core Invention

Do not treat the following as the primary intelligence:

- LoRa itself.
- ESP32 itself.
- Raspberry Pi itself.
- SQLite.
- Generic dashboarding.
- Generic AI.
- Generic anomaly detection.
- Generic adaptive sampling.
- Generic battery monitoring.
- Generic environmental sensor fusion.

These are supporting technologies.

The distinctive value is in their specific interaction.

## 23. Software Engineering Principles

All future code should follow these principles.

Principle 1 — Modular

Drivers, processing, communication and application logic must be separable.

Principle 2 — Testable

Every important algorithm should be runnable without physical hardware using simulated inputs.

Principle 3 — Observable

The system should expose diagnostics and internal decisions.

Principle 4 — Deterministic where possible

Embedded safety-critical control should not depend unnecessarily on opaque AI.

Principle 5 — AI where it adds value

AI should solve problems that benefit from inference, not replace straightforward engineering logic.

Principle 6 — Offline-first

The core sensing system should continue to operate locally.

Principle 7 — Version everything important

packets, database schema, firmware, model, configuration, calibration state.

Principle 8 — Never silently discard data

Invalid data should receive a quality state.

Principle 9 — Never fake accuracy

Sensor resolution != sensor accuracy.

Principle 10 — Hardware-aware software

Software must understand:

- sensor warm-up,
- heater state,
- power state,
- radio state,
- airflow constraints,
- thermal context.

## 24. Development Philosophy

The project should be developed incrementally.

Recommended sequence:

```text
Stage 1
Hardware simulation
      ↓
Stage 2
Sensor drivers
      ↓
Stage 3
Local acquisition
      ↓
Stage 4
Validation + quality
      ↓
Stage 5
Packet protocol
      ↓
Stage 6
LoRa
      ↓
Stage 7
Gateway
      ↓
Stage 8
Database
      ↓
Stage 9
Event engine
      ↓
Stage 10
Adaptive sensing
      ↓
Stage 11
AI
      ↓
Stage 12
Dashboard
      ↓
Stage 13
Integrated field testing
```

Do not build everything simultaneously.

## 25. Simulation First

Before hardware is fully available, AEIOS should support synthetic data.

Example:

```text
Normal environment
↓
stable PM
stable CO₂
stable gas

then

pollution event injected
↓
PM rises
BME gas rises
MQ response rises
CO₂ changes
↓
confidence should rise
↓
sampling rate should increase
↓
event packet should be emitted
```

Also simulate false events:

```text
MQ135 alone spikes
↓
other sensors stable
↓
confidence remains low
↓
no high-priority pollution event
```

This simulation layer will be critical to developing the intelligence safely.

## 26. Testing Philosophy

AEIOS testing must cover:

Sensor tests: valid readings, invalid readings, missing sensor, noise, drift, warm-up, condensation.

Firmware tests: boot, watchdog, I²C failure, UART failure, ADC limits, power transitions.

Radio tests: valid packet, CRC failure, duplicate packet, sequence gap, retry, weak RSSI/SNR, gateway unavailable.

AI tests: true event, false event, single-sensor anomaly, multi-sensor event, slow drift, abrupt event, noisy data.

Energy tests: normal battery, low battery, solar present, solar absent, prolonged event, MQ135 activation, radio burst.

Gateway tests: database unavailable, internet unavailable, gateway restart, duplicated packets, out-of-order packets, storage pressure.

## 27. Security and Safety

Even for a student prototype, the architecture should allow:

- authenticated configuration,
- packet integrity,
- firmware versioning,
- safe update procedure,
- no arbitrary remote code execution,
- bounded actuator/control behavior,
- watchdog recovery,
- safe power shutdown.

The dashboard must never be allowed to issue unrestricted hardware commands.

## 28. Creativity Is Deliberately Open

This file defines requirements and constraints, not a ceiling.

The coding agent may propose new mechanisms when they improve:

- detection,
- energy efficiency,
- reliability,
- explainability,
- scalability,
- scientific validity,
- maintainability,
- patent differentiation,
- deployment practicality.

Potential future ideas are explicitly open:

- learned sensing policies,
- Bayesian confidence models,
- graph neural networks for multi-node event propagation,
- active learning,
- uncertainty estimation,
- change-point detection,
- probabilistic sensor fusion,
- sensor-specific digital twins,
- adaptive calibration,
- self-diagnosis,
- energy prediction,
- event compression,
- learned packet prioritization,
- dynamic gateway-to-node policy distribution.

Any new idea must still be:

- technically defensible,
- testable,
- compatible with locked hardware unless hardware is explicitly reopened,
- documented,
- measurable.

## 29. Definition of "Done"

AEIOS software is not considered complete merely because the dashboard shows readings.

A meaningful V1 should be able to demonstrate:

```text
Sensors
  ↓
Validated measurement
  ↓
Quality assessment
  ↓
Cross-modal reasoning
  ↓
Event confidence
  ↓
Adaptive behavior
  ↓
Efficient LoRa packet
  ↓
Gateway validation
  ↓
Local persistence
  ↓
AI/event analysis
  ↓
Dashboard
```

and should survive:

sensor failure, radio loss, internet loss, gateway restart, battery stress, false sensor event, duplicate packet, corrupted packet.

## 30. Context Files To Follow

This is Context File 01 of 05.

Recommended context hierarchy:

```text
01 — MASTER PROJECT CONTEXT
     System identity, vision, constraints, locked decisions

02 — HARDWARE + EMBEDDED FIRMWARE CONTEXT
     Exact hardware, pins, sensor behavior, firmware architecture

03 — COMMUNICATION + GATEWAY + DATABASE CONTEXT
     LoRa protocol, packet schema, Raspberry Pi, SQLite, APIs

04 — AI + ADAPTIVE SENSING + PATENT-AWARE INTELLIGENCE CONTEXT
     Confidence engine, adaptive policy, VoI, anomaly detection,
     spatial intelligence, explainability

05 — DEVELOPMENT + TESTING + DEPLOYMENT CONTEXT
     Repository architecture, coding standards, simulation,
     testing, CI/CD, deployment, observability, future scaling
```

Every subsequent context file should reference this file rather than contradict it.

## 31. Agent Operating Rule

When an AI coding agent reads this file, it should behave as a senior embedded + AI + distributed-systems engineer, not merely as a code generator.

Before implementing a feature, the agent should ask internally:

- Does this fit AEIOS?
- Does it respect the locked hardware?
- Does it preserve modularity?
- Can it be tested?
- Can it run offline?
- Does it produce observable evidence?
- Does it accidentally destroy the adaptive/intelligent aspect?
- Does it unnecessarily couple components?
- Does it create a future migration problem?
- Does it preserve the patent-relevant architecture where appropriate?

The agent should prefer:

a correct, extensible architecture over the shortest code.

At the same time, it should avoid unnecessary abstraction for its own sake.

## 32. Final Mental Model

Think of AEIOS as:

A distributed cyber-physical environmental intelligence organism.

- The sensors are its perception.
- The ESP32 nodes are its reflexes.
- The confidence engine is its local reasoning.
- The adaptive sampler is its attention mechanism.
- The LoRa network is its nervous system.
- The Raspberry Pi gateway is its higher-level cognition.
- The database is its memory.
- The AI models are its learned patterns.
- The dashboard is its interface with humans.
- The feedback loop is what makes it adaptive.

This mental model is intentionally broader than a conventional IoT architecture and should guide future creative engineering decisions.

## Source Alignment

The original AEIOS proposal establishes the project around adaptive environmental sensing, edge AI, multi-node architecture, prediction, anomaly detection, adaptive sampling and decision support.

The proposal identifies the functional architecture as distributed environmental nodes, ESP32 controllers, a Raspberry Pi 5 gateway, LoRa communication, edge-based environmental intelligence and adaptive sensing.

The prototype blueprint expands those requirements into the detailed sensing-node architecture, including the PMS5003, SCD41, BME688, MQ135, ESP32, SX1278 and Raspberry Pi roles.
