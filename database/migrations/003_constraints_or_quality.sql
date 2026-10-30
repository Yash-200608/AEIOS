-- Quality / de-dup constraints. Invalid radio rows remain insertable (quarantine).
-- Trusted non-duplicate frames are unique on (wire_id, sequence, message_type).

CREATE UNIQUE INDEX IF NOT EXISTS idx_radio_trusted_unique
    ON radio_packets (wire_id, sequence, message_type)
    WHERE schema_valid = 1
      AND duplicate = 0
      AND wire_id IS NOT NULL
      AND sequence IS NOT NULL
      AND message_type IS NOT NULL;

-- Upgrade path from pre-split 001_initial.sql. Migrator ignores duplicate-column errors.

ALTER TABLE nodes ADD COLUMN hardware_revision TEXT;
ALTER TABLE nodes ADD COLUMN firmware_version TEXT;
ALTER TABLE nodes ADD COLUMN config_version TEXT;
ALTER TABLE nodes ADD COLUMN status TEXT;
ALTER TABLE nodes ADD COLUMN last_seen INTEGER;
ALTER TABLE nodes ADD COLUMN last_sequence INTEGER;
ALTER TABLE sensor_readings ADD COLUMN firmware_version TEXT;
ALTER TABLE sensor_readings ADD COLUMN config_version TEXT;
ALTER TABLE sensor_readings ADD COLUMN sensor_quality REAL;

UPDATE nodes SET status = 'UNKNOWN' WHERE status IS NULL;
