-- Query indexes (ADR-014 / CF03 §49). Sampling-decision index is in 004.

CREATE INDEX IF NOT EXISTS idx_readings_node_time
    ON sensor_readings (wire_id, measurement_time);
CREATE INDEX IF NOT EXISTS idx_events_node_start
    ON events (wire_id, started_at);
CREATE INDEX IF NOT EXISTS idx_radio_node_seq
    ON radio_packets (wire_id, sequence);
CREATE INDEX IF NOT EXISTS idx_logs_time
    ON system_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_states_node_time
    ON sensor_states (wire_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_power_node_time
    ON power_state (wire_id, timestamp);
