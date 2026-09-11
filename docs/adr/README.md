# Architecture Decision Records

Each ADR records a major AEIOS decision. Changing a decided ADR requires a design review and an updated review-history entry. Numbers are never reused ([VERSIONING.md](../VERSIONING.md)).

Accepted ADRs 001–008 are immutable except status and review-history appends.

| ID | Title | Status |
|----|-------|--------|
| [ADR-001](ADR-001-hierarchical-edge-intelligence.md) | Hierarchical Edge Intelligence | Accepted (TinyML ban; see ADR-017) |
| [ADR-002](ADR-002-esp-idf-sole-firmware.md) | ESP-IDF as sole firmware framework | Accepted |
| [ADR-003](ADR-003-no-lora-firmware-ota.md) | No firmware OTA over LoRa | Accepted |
| [ADR-004](ADR-004-offline-first-maps.md) | Offline-first gateway with preloaded maps | Accepted |
| [ADR-005](ADR-005-scd41-co2-sensor.md) | SCD41 as CO₂ sensor | Accepted; MQ135 clause superseded by ADR-011 |
| [ADR-006](ADR-006-binary-lora-protocol.md) | Binary LoRa packet protocol | Accepted — AMP v1 frozen |
| [ADR-007](ADR-007-gps-installation-mode.md) | GPS used only during installation | **Superseded by ADR-010** |
| [ADR-008](ADR-008-driver-shutdown.md) | Driver ops include shutdown() | Accepted |
| [ADR-009](ADR-009-sx1278-433-star-amp-codec.md) | SX1278 433 MHz star; AMP codec retained | Accepted |
| [ADR-010](ADR-010-gps-removed.md) | GPS/GNSS removed from deployed nodes | Accepted |
| [ADR-011](ADR-011-mq135-gas-response.md) | MQ135 duty-cycled gas-response feature | Accepted |
| [ADR-012](ADR-012-bme688.md) | BME688 environmental / gas-feature sensor | Accepted |
| [ADR-013](ADR-013-hw-node-r2-pinmap.md) | HW-NODE-r2 pin map and bring-up | Accepted |
| [ADR-014](ADR-014-sqlite-v1-repository.md) | SQLite v1 + repository abstraction | Accepted |
| [ADR-015](ADR-015-mqtt-not-core.md) | MQTT not on core v1 ingest path | Accepted |
| [ADR-016](ADR-016-compose-dev-systemd-field.md) | Compose for dev; systemd on Pi | Accepted |
| [ADR-017](ADR-017-on-node-policy-shap.md) | On-node deterministic policy; SHAP when models deploy | Accepted |

Pending edits to frozen Gate A–C / FAS text: [CONTROLLED_DOC_CHANGE_QUEUE.md](CONTROLLED_DOC_CHANGE_QUEUE.md).

## ADR template

- Context  
- Decision  
- Alternatives considered  
- Rationale  
- Consequences  
- Review history  
