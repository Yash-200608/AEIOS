# AEIOS simulation laboratory

Hardware-independent digital twin for AEIOS. **No ESP32, sensors, SX1278, or Raspberry Pi is required.**

All numeric outputs are **SIMULATION RESULT**, not field-validated accuracy, LoRa range, or energy savings (C-19 / MVN).

## Pipeline

```text
Synthetic environment → virtual sensors → node policy → AMP v1
    → virtual SX1278 → gateway ingest → SQLite → event engine → snapshot
```

Virtual drivers (`VirtualPMS5003`, `VirtualSCD41`, `VirtualBME688`, `VirtualMQ135`, `VirtualLoRaMedium`) implement the same observation/radio contracts as future real drivers. The gateway, schema, event engine, and snapshot do not depend on the virtual implementations.

PMS5003 protocol tests go **environment → UART bytes → `gateway.pms` parser**. Do not bypass the parser.

AMP frames use the frozen Protocol Version 1 codec (`gateway.amp`), matching `firmware/host_tests/golden_ref.py`.

## Run

```bash
python -m simulation.run --scenario multimodal_event --duration 3600 --nodes 4 --seed 42
```

Writes `aeios_dev.db` by default (override with `--db` or `AEIOS_DB_PATH`; never a baked-in production path) and `simulation/output/`.

Inspect the file with `python -m database.inspect`.

Policies: `FIXED_RATE`, `BATTERY_AWARE`, `THRESHOLD_ADAPTIVE`, `CROSS_MODAL_ADAPTIVE`, `INFORMATION_ENERGY`.

Scenarios: see `simulation/scenarios/catalog.py` (`normal`, `particulate_event`, `gas_event`, `co2_event`, `multimodal_event`, `mq135_only_spike`, …).

## Tests

```bash
python -m unittest discover -s gateway/tests -v
python -m unittest discover -s database/tests -v
python -m unittest discover -s simulation/tests -v
```

Same seed + scenario + `SIMULATION_VERSION` is intended to be reproducible.
