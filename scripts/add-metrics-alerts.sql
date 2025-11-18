-- ============================================================================
-- Migration: Add Metrics Calculation and Alerts System
-- Description: Adds tables for calculated metrics, alert rules, and alerts
-- ============================================================================

-- ============================================================================
-- CALCULATED METRICS TABLES
-- ============================================================================

-- Table for storing calculated power quality metrics
CREATE TABLE IF NOT EXISTS power_quality_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,

  -- Power factor per phase (0.0 to 1.0)
  power_factor_l1 DECIMAL(5,4),
  power_factor_l2 DECIMAL(5,4),
  power_factor_l3 DECIMAL(5,4),
  power_factor_total DECIMAL(5,4),

  -- Apparent power (VA)
  apparent_power_l1 DECIMAL(10,2),
  apparent_power_l2 DECIMAL(10,2),
  apparent_power_l3 DECIMAL(10,2),
  apparent_power_total DECIMAL(10,2),

  -- Phase imbalance (percentage)
  voltage_imbalance DECIMAL(5,2),
  current_imbalance DECIMAL(5,2),
  power_imbalance DECIMAL(5,2),

  -- Voltage deviation from nominal (230V)
  voltage_deviation_l1 DECIMAL(5,2),
  voltage_deviation_l2 DECIMAL(5,2),
  voltage_deviation_l3 DECIMAL(5,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('power_quality_metrics', 'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Add retention policy (keep 30 days of metrics)
SELECT add_retention_policy('power_quality_metrics', INTERVAL '30 days', if_not_exists => TRUE);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pqm_device_time ON power_quality_metrics(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pqm_site_time ON power_quality_metrics(site_type, timestamp DESC);


-- Table for energy consumption tracking
CREATE TABLE IF NOT EXISTS energy_consumption (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,

  -- Energy consumption in kWh (accumulated)
  energy_kwh_l1 DECIMAL(12,3),
  energy_kwh_l2 DECIMAL(12,3),
  energy_kwh_l3 DECIMAL(12,3),
  energy_kwh_total DECIMAL(12,3),

  -- Demand (15-minute rolling average in kW)
  demand_kw_l1 DECIMAL(10,2),
  demand_kw_l2 DECIMAL(10,2),
  demand_kw_l3 DECIMAL(10,2),
  demand_kw_total DECIMAL(10,2),

  -- Peak demand tracking
  peak_demand_kw DECIMAL(10,2),
  peak_demand_timestamp TIMESTAMPTZ,

  -- Load factor (average / peak)
  load_factor DECIMAL(5,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('energy_consumption', 'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Add retention policy (keep 90 days)
SELECT add_retention_policy('energy_consumption', INTERVAL '90 days', if_not_exists => TRUE);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_energy_device_time ON energy_consumption(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_energy_site_time ON energy_consumption(site_type, timestamp DESC);


-- Table for anomaly detection results
CREATE TABLE IF NOT EXISTS anomaly_detections (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,

  -- Anomaly type
  anomaly_type VARCHAR(50) NOT NULL, -- 'voltage_spike', 'current_spike', 'power_drop', 'pattern_anomaly'

  -- Severity
  severity VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'

  -- Metrics at time of anomaly
  metric_name VARCHAR(50),
  metric_value DECIMAL(10,2),
  expected_value DECIMAL(10,2),
  deviation_percent DECIMAL(5,2),

  -- Context
  phase VARCHAR(10), -- 'L1', 'L2', 'L3', 'ALL'
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('anomaly_detections', 'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Add retention policy (keep 30 days)
SELECT add_retention_policy('anomaly_detections', INTERVAL '30 days', if_not_exists => TRUE);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_anomaly_device_time ON anomaly_detections(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_type_time ON anomaly_detections(anomaly_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_anomaly_severity ON anomaly_detections(severity, timestamp DESC);


-- ============================================================================
-- ALERT SYSTEM TABLES
-- ============================================================================

-- Alert rules table (user-configurable)
CREATE TABLE IF NOT EXISTS alert_rules (
  id SERIAL PRIMARY KEY,

  -- Rule identification
  name VARCHAR(200) NOT NULL,
  description TEXT,

  -- Rule type
  rule_type VARCHAR(50) NOT NULL, -- 'device_offline', 'threshold', 'power_quality', 'energy', 'anomaly'

  -- Targeting
  site_type VARCHAR(20), -- 'ALL', 'KROL', 'MOSIR', 'OTHER' (NULL = all)
  device_id VARCHAR(100), -- specific device (NULL = all devices in site)

  -- Condition configuration (stored as JSON)
  conditions JSONB NOT NULL,
  -- Example for threshold: {"metric": "voltage_l1", "operator": "gt", "value": 253, "duration_seconds": 30}
  -- Example for device_offline: {"timeout_seconds": 120}
  -- Example for power_quality: {"metric": "power_factor", "operator": "lt", "value": 0.85}

  -- Severity
  severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'

  -- Notification settings
  notify_websocket BOOLEAN DEFAULT true,
  notify_email BOOLEAN DEFAULT false,
  email_recipients TEXT[], -- array of email addresses

  -- Time-based rules
  active_hours_start TIME, -- NULL = always active
  active_hours_end TIME,
  active_days INTEGER[], -- array of day numbers (0=Sunday, 6=Saturday), NULL = all days

  -- Alert management
  cooldown_minutes INTEGER DEFAULT 15, -- minimum time between repeat alerts
  auto_resolve BOOLEAN DEFAULT true, -- auto-resolve when condition clears

  -- Rule status
  enabled BOOLEAN DEFAULT true,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100), -- for future user management

  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON alert_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled ON alert_rules(enabled) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_alert_rules_site ON alert_rules(site_type);


-- Active alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,

  -- Rule reference
  rule_id INTEGER REFERENCES alert_rules(id) ON DELETE SET NULL,
  rule_name VARCHAR(200) NOT NULL,

  -- Alert details
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,

  -- Context
  device_id VARCHAR(100),
  site_type VARCHAR(20),

  -- Message
  title VARCHAR(500) NOT NULL,
  message TEXT,

  -- Alert data (context for display)
  alert_data JSONB, -- stores relevant metrics, values, etc.

  -- State
  state VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'acknowledged', 'resolved', 'dismissed'

  -- Timestamps
  triggered_at TIMESTAMPTZ NOT NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Actions
  acknowledged_by VARCHAR(100),
  resolution_note TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_state ON alerts(state, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_rule ON alerts(rule_id, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity, triggered_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at DESC);


-- Alert history (audit trail)
CREATE TABLE IF NOT EXISTS alert_history (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,

  -- Action details
  action VARCHAR(50) NOT NULL, -- 'triggered', 'acknowledged', 'resolved', 'dismissed', 'escalated'
  previous_state VARCHAR(20),
  new_state VARCHAR(20),

  -- Actor
  performed_by VARCHAR(100),

  -- Notes
  note TEXT,

  -- Metadata
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_action ON alert_history(action, created_at DESC);


-- Notification log (track sent notifications)
CREATE TABLE IF NOT EXISTS notification_log (
  id SERIAL PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,

  -- Notification details
  notification_type VARCHAR(50) NOT NULL, -- 'websocket', 'email', 'sms', 'webhook'
  recipient VARCHAR(500),

  -- Status
  status VARCHAR(20) NOT NULL, -- 'sent', 'failed', 'pending'
  error_message TEXT,

  -- Metadata
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_alert ON notification_log(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log(status, created_at DESC);


-- ============================================================================
-- VIEWS FOR CONVENIENCE
-- ============================================================================

-- View for active alerts with rule details
CREATE OR REPLACE VIEW active_alerts_view AS
SELECT
  a.*,
  ar.rule_type,
  ar.conditions,
  ar.notify_websocket,
  ar.notify_email,
  ar.email_recipients
FROM alerts a
LEFT JOIN alert_rules ar ON a.rule_id = ar.id
WHERE a.state IN ('active', 'acknowledged')
ORDER BY a.triggered_at DESC;


-- View for latest metrics per device
CREATE OR REPLACE VIEW latest_metrics_view AS
SELECT DISTINCT ON (device_id)
  device_id,
  site_type,
  timestamp,
  power_factor_total,
  apparent_power_total,
  voltage_imbalance,
  current_imbalance,
  power_imbalance
FROM power_quality_metrics
ORDER BY device_id, timestamp DESC;


-- View for energy consumption summary
CREATE OR REPLACE VIEW energy_summary_view AS
SELECT
  site_type,
  device_id,
  MAX(timestamp) as last_update,
  MAX(energy_kwh_total) as total_energy_kwh,
  MAX(demand_kw_total) as current_demand_kw,
  MAX(peak_demand_kw) as peak_demand_kw,
  AVG(load_factor) as avg_load_factor
FROM energy_consumption
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY site_type, device_id;


-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update alert state
CREATE OR REPLACE FUNCTION update_alert_state(
  p_alert_id INTEGER,
  p_new_state VARCHAR(20),
  p_performed_by VARCHAR(100) DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_old_state VARCHAR(20);
BEGIN
  -- Get current state
  SELECT state INTO v_old_state FROM alerts WHERE id = p_alert_id;

  -- Update alert
  UPDATE alerts
  SET
    state = p_new_state,
    updated_at = NOW(),
    acknowledged_at = CASE WHEN p_new_state = 'acknowledged' THEN NOW() ELSE acknowledged_at END,
    resolved_at = CASE WHEN p_new_state = 'resolved' THEN NOW() ELSE resolved_at END,
    acknowledged_by = CASE WHEN p_new_state = 'acknowledged' THEN p_performed_by ELSE acknowledged_by END,
    resolution_note = CASE WHEN p_new_state = 'resolved' THEN p_note ELSE resolution_note END
  WHERE id = p_alert_id;

  -- Log to history
  INSERT INTO alert_history (alert_id, action, previous_state, new_state, performed_by, note)
  VALUES (p_alert_id, p_new_state, v_old_state, p_new_state, p_performed_by, p_note);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- DEFAULT ALERT RULES
-- ============================================================================

-- Insert default alert rules
INSERT INTO alert_rules (name, description, rule_type, severity, conditions, notify_websocket, notify_email, enabled)
VALUES
  -- Device health alerts
  ('Device Offline', 'Alert when device has not sent data for more than 2 minutes', 'device_offline', 'warning',
   '{"timeout_seconds": 120}'::jsonb, true, false, true),

  ('Device Critical Offline', 'Critical alert when device offline for more than 5 minutes', 'device_offline', 'critical',
   '{"timeout_seconds": 300}'::jsonb, true, true, true),

  -- Voltage threshold alerts
  ('High Voltage Warning', 'Voltage exceeds 253V (110% of nominal)', 'threshold', 'warning',
   '{"metric": "voltage", "operator": "gt", "value": 253, "duration_seconds": 30, "phase": "any"}'::jsonb, true, false, true),

  ('Low Voltage Warning', 'Voltage below 207V (90% of nominal)', 'threshold', 'warning',
   '{"metric": "voltage", "operator": "lt", "value": 207, "duration_seconds": 30, "phase": "any"}'::jsonb, true, false, true),

  ('Critical High Voltage', 'Voltage exceeds 265V (115% of nominal)', 'threshold', 'critical',
   '{"metric": "voltage", "operator": "gt", "value": 265, "duration_seconds": 10, "phase": "any"}'::jsonb, true, true, true),

  ('Critical Low Voltage', 'Voltage below 195V (85% of nominal)', 'threshold', 'critical',
   '{"metric": "voltage", "operator": "lt", "value": 195, "duration_seconds": 10, "phase": "any"}'::jsonb, true, true, true),

  -- Power quality alerts
  ('Poor Power Factor', 'Power factor below 0.85', 'power_quality', 'warning',
   '{"metric": "power_factor", "operator": "lt", "value": 0.85, "duration_seconds": 60}'::jsonb, true, false, true),

  ('High Phase Imbalance', 'Phase imbalance exceeds 20%', 'power_quality', 'warning',
   '{"metric": "voltage_imbalance", "operator": "gt", "value": 20, "duration_seconds": 60}'::jsonb, true, false, true),

  ('Critical Phase Imbalance', 'Phase imbalance exceeds 30%', 'power_quality', 'critical',
   '{"metric": "voltage_imbalance", "operator": "gt", "value": 30, "duration_seconds": 30}'::jsonb, true, true, true)

ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- SUMMARY
-- ============================================================================

-- Print summary
DO $$
BEGIN
  RAISE NOTICE '✅ Metrics and Alerts System Installed Successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  - power_quality_metrics (with 30-day retention)';
  RAISE NOTICE '  - energy_consumption (with 90-day retention)';
  RAISE NOTICE '  - anomaly_detections (with 30-day retention)';
  RAISE NOTICE '  - alert_rules (user-configurable rules)';
  RAISE NOTICE '  - alerts (active alerts)';
  RAISE NOTICE '  - alert_history (audit trail)';
  RAISE NOTICE '  - notification_log (notification tracking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views Created:';
  RAISE NOTICE '  - active_alerts_view';
  RAISE NOTICE '  - latest_metrics_view';
  RAISE NOTICE '  - energy_summary_view';
  RAISE NOTICE '';
  RAISE NOTICE 'Default Alert Rules: 9 rules inserted';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Implement metrics calculation service';
  RAISE NOTICE '  2. Implement alert evaluation engine';
  RAISE NOTICE '  3. Set up notification service';
END $$;
