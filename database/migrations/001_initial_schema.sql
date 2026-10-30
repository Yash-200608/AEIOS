-- AEIOS v1 initial schema (ADR-014).
-- wire_id is the AMP uint16 node identity (node_id in CF03).
-- display_id is the human alias (e.g. NODE-03). No GPS/GNSS columns.
-- sampling_decisions is created in 004. Trusted readings ≠ radio_packets.

CREATE TABLE IF NOT EXISTS nodes (
    wire_id INTEGER PRIMARY KEY
        CHECK (wire_id >= 1 AND wire_id <= 65534 AND wire_id != 2),
    display_id TEXT NOT NULL UNIQUE,
    name TEXT,
    site TEXT,
    pos_x REAL,
    pos_y REAL,
    latitude REAL,
    longitude REAL,
    hardware_revision TEXT,
    firmware_version TEXT,
    config_version TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    status TEXT NOT NULL DEFAULT 'UNKNOWN'
        CHECK (status IN ('UNKNOWN', 'ONLINE', 'OFFLINE', 'DEGRADED', 'DISABLED')),
    last_seen INTEGER,
    last_sequence INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER NOT NULL REFERENCES nodes(wire_id),
    sequence INTEGER NOT NULL,
    sample_id INTEGER,
    measurement_time INTEGER NOT NULL,
    received_at INTEGER NOT NULL,
    pm1 REAL,
    pm25 REAL,
    pm10 REAL,
    co2 REAL,
    temperature REAL,
    humidity REAL,
    pressure REAL,
    bme688_gas_feature REAL,
    mq135_raw REAL,
    mq135_index REAL,
    quality_flags INTEGER NOT NULL DEFAULT 0,
    sensor_quality REAL
        CHECK (sensor_quality IS NULL OR (sensor_quality >= 0.0 AND sensor_quality <= 1.0)),
    confidence REAL
        CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0)),
    operating_mode TEXT,
    sampling_interval_s REAL,
    firmware_version TEXT,
    config_version TEXT,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE')),
    UNIQUE (wire_id, sequence)
);

CREATE TABLE IF NOT EXISTS sensor_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER NOT NULL REFERENCES nodes(wire_id),
    timestamp INTEGER NOT NULL,
    sensor TEXT NOT NULL,
    state TEXT NOT NULL
        CHECK (state IN ('VALID', 'WARMING', 'CALIBRATING', 'STALE', 'SENSOR_FAULT', 'DEGRADED')),
    quality REAL CHECK (quality IS NULL OR (quality >= 0.0 AND quality <= 1.0)),
    heater_state TEXT,
    warmup_age_s REAL,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
);

CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER REFERENCES nodes(wire_id),
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    environment_event_confidence REAL
        CHECK (environment_event_confidence IS NULL
               OR (environment_event_confidence >= 0.0 AND environment_event_confidence <= 1.0)),
    sensor_fault_confidence REAL
        CHECK (sensor_fault_confidence IS NULL
               OR (sensor_fault_confidence >= 0.0 AND sensor_fault_confidence <= 1.0)),
    uncertain_confidence REAL
        CHECK (uncertain_confidence IS NULL
               OR (uncertain_confidence >= 0.0 AND uncertain_confidence <= 1.0)),
    event_confidence REAL
        CHECK (event_confidence IS NULL
               OR (event_confidence >= 0.0 AND event_confidence <= 1.0)),
    status TEXT NOT NULL
        CHECK (status IN (
            'CANDIDATE', 'CONFIRMING', 'CONFIRMED', 'ACTIVE',
            'RESOLVING', 'RESOLVED', 'REJECTED'
        )),
    evidence_json TEXT NOT NULL,
    regional INTEGER NOT NULL DEFAULT 0 CHECK (regional IN (0, 1)),
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
);

CREATE TABLE IF NOT EXISTS event_features (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
    feature_name TEXT NOT NULL,
    feature_value REAL,
    contribution REAL
);

CREATE TABLE IF NOT EXISTS radio_packets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at INTEGER NOT NULL,
    wire_id INTEGER,
    sequence INTEGER,
    message_type INTEGER,
    protocol_version INTEGER,
    rssi REAL,
    snr REAL,
    crc_valid INTEGER NOT NULL CHECK (crc_valid IN (0, 1)),
    mac_valid INTEGER NOT NULL CHECK (mac_valid IN (0, 1)),
    schema_valid INTEGER NOT NULL CHECK (schema_valid IN (0, 1)),
    duplicate INTEGER NOT NULL CHECK (duplicate IN (0, 1)),
    raw_payload BLOB,
    drop_reason TEXT,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
);

CREATE TABLE IF NOT EXISTS power_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER NOT NULL REFERENCES nodes(wire_id),
    timestamp INTEGER NOT NULL,
    battery_voltage REAL,
    battery_soc REAL CHECK (battery_soc IS NULL OR (battery_soc >= 0.0 AND battery_soc <= 1.0)),
    battery_state TEXT,
    solar_state TEXT,
    energy_consumed_j REAL,
    operating_mode TEXT,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
);

CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    component TEXT NOT NULL,
    level TEXT NOT NULL,
    code TEXT,
    message TEXT,
    wire_id INTEGER,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
);
