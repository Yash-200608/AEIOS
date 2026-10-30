-- Mandatory AEIOS adaptive-sensing trace (ADR-014). Confidence is [0, 1].

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

CREATE INDEX IF NOT EXISTS idx_sampling_node_time
    ON sampling_decisions (wire_id, timestamp);
