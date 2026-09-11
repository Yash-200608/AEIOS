-- AEIOS v1 SQLite schema (ADR-014).
-- Trusted observations are separate from radio_packets.
-- sampling_decisions is mandatory.
-- provenance: SIMULATED | LIVE — never mix silently.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

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
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
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
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE')),
    UNIQUE (wire_id, sequence)
);

CREATE TABLE IF NOT EXISTS sensor_states (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER NOT NULL REFERENCES nodes(wire_id),
    timestamp INTEGER NOT NULL,
    sensor TEXT NOT NULL,
    state TEXT NOT NULL,
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
    status TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS sampling_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wire_id INTEGER NOT NULL REFERENCES nodes(wire_id),
    timestamp INTEGER NOT NULL,
    previous_mode TEXT NOT NULL,
    new_mode TEXT NOT NULL,
    trigger TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
    expected_information_gain REAL NOT NULL,
    estimated_energy_cost REAL NOT NULL,
    selected_sensor TEXT,
    provenance TEXT NOT NULL DEFAULT 'SIMULATED'
        CHECK (provenance IN ('SIMULATED', 'LIVE'))
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

CREATE INDEX IF NOT EXISTS idx_readings_node_time
    ON sensor_readings (wire_id, measurement_time);
CREATE INDEX IF NOT EXISTS idx_events_node_start
    ON events (wire_id, started_at);
CREATE INDEX IF NOT EXISTS idx_radio_node_seq
    ON radio_packets (wire_id, sequence);
CREATE INDEX IF NOT EXISTS idx_sampling_node_time
    ON sampling_decisions (wire_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_time
    ON system_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_states_node_time
    ON sensor_states (wire_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_power_node_time
    ON power_state (wire_id, timestamp);
