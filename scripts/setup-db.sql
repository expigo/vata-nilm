-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Create main table for MQTT messages
CREATE TABLE IF NOT EXISTS mqtt_messages (
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,  -- 'KROL', 'MOSIR', 'OTHER'
  topic VARCHAR(200),
  raw_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (timestamp, device_id)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('mqtt_messages', 'timestamp', 
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Add retention policy (auto-delete data older than 7 days)
SELECT add_retention_policy('mqtt_messages', INTERVAL '7 days', if_not_exists => TRUE);

-- Create indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_device_site ON mqtt_messages(device_id, site_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_site_time ON mqtt_messages(site_type, timestamp DESC);

-- Create a view for latest device status
CREATE OR REPLACE VIEW latest_devices AS
SELECT DISTINCT ON (device_id)
  device_id,
  site_type,
  timestamp,
  raw_json,
  created_at
FROM mqtt_messages
ORDER BY device_id, timestamp DESC;
