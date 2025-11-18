-- ============================================================================
-- NILM (Non-Intrusive Load Monitoring) Database Schema
-- ============================================================================

-- Appliance Types and Metadata
-- ============================================================================

-- Standard appliance categories
CREATE TABLE IF NOT EXISTS appliance_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(50), -- emoji or icon name
  color VARCHAR(20), -- hex color for UI
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common appliance categories
INSERT INTO appliance_categories (name, description, icon, color) VALUES
  ('HVAC', 'Heating, Ventilation, and Air Conditioning', '❄️', '#3b82f6'),
  ('Refrigerator', 'Refrigerators and Freezers', '🧊', '#10b981'),
  ('Washing Machine', 'Washing Machines and Dryers', '🧺', '#8b5cf6'),
  ('Dishwasher', 'Dishwashers', '🍽️', '#f59e0b'),
  ('Lighting', 'Lights and Lamps', '💡', '#fbbf24'),
  ('Electronics', 'TVs, Computers, etc.', '📺', '#6366f1'),
  ('Kitchen', 'Ovens, Microwaves, Kettles, etc.', '🍳', '#ef4444'),
  ('Water Heater', 'Electric Water Heaters', '🚿', '#ec4899'),
  ('Motor', 'Generic Motors and Pumps', '⚙️', '#64748b'),
  ('Other', 'Uncategorized Appliances', '❓', '#94a3b8')
ON CONFLICT (name) DO NOTHING;

-- Appliance signatures (learned from datasets or user labeling)
CREATE TABLE IF NOT EXISTS appliances (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL for global/pre-trained
  site_type VARCHAR(20), -- KROL, MOSIR, OTHER, or NULL for global
  device_id VARCHAR(100), -- specific meter/device
  category_id INTEGER REFERENCES appliance_categories(id),

  -- Appliance info
  name VARCHAR(200) NOT NULL, -- e.g., "Living Room AC", "Kitchen Fridge"
  brand VARCHAR(100),
  model VARCHAR(100),

  -- Power signature characteristics
  nominal_power DECIMAL(10, 2), -- average power in watts
  min_power DECIMAL(10, 2),
  max_power DECIMAL(10, 2),
  standby_power DECIMAL(10, 2),

  -- Advanced signatures (stored as JSON for flexibility)
  signature_features JSONB, -- {power_factor, harmonics, transient, etc.}

  -- Training metadata
  trained_on_dataset VARCHAR(100), -- REDD, UK-DALE, USER_LABELED, etc.
  training_samples INTEGER DEFAULT 0,
  confidence_score DECIMAL(5, 4), -- model confidence 0-1

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_global BOOLEAN DEFAULT false, -- global pre-trained signature

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (user_id, site_type, device_id, name)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_appliances_user_site ON appliances(user_id, site_type);
CREATE INDEX IF NOT EXISTS idx_appliances_device ON appliances(device_id);
CREATE INDEX IF NOT EXISTS idx_appliances_global ON appliances(is_global) WHERE is_global = true;

-- Disaggregation Results (time-series)
-- ============================================================================

-- Real-time disaggregation results
CREATE TABLE IF NOT EXISTS disaggregation_results (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,

  -- Which appliance and algorithm
  appliance_id INTEGER REFERENCES appliances(id) ON DELETE CASCADE,
  algorithm VARCHAR(50) NOT NULL, -- CO, FHMM, Seq2Point, Seq2Seq, BERT4NILM

  -- Disaggregated power
  power_watts DECIMAL(10, 2) NOT NULL,
  energy_kwh DECIMAL(12, 6), -- cumulative energy

  -- State estimation
  state VARCHAR(20), -- ON, OFF, STANDBY, etc.
  state_confidence DECIMAL(5, 4), -- 0-1

  -- Metadata
  processing_time_ms INTEGER, -- inference time
  model_version VARCHAR(50),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('disaggregation_results', 'timestamp',
  if_not_exists => TRUE,
  chunk_time_interval => INTERVAL '1 day'
);

-- Add retention policy (keep disaggregation results for 90 days)
SELECT add_retention_policy('disaggregation_results', INTERVAL '90 days', if_not_exists => TRUE);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_disagg_device_time ON disaggregation_results(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_disagg_appliance_time ON disaggregation_results(appliance_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_disagg_site_time ON disaggregation_results(site_type, timestamp DESC);

-- User Labels (ground truth for training)
-- ============================================================================

CREATE TABLE IF NOT EXISTS appliance_labels (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(100) NOT NULL,
  site_type VARCHAR(20) NOT NULL,
  appliance_id INTEGER REFERENCES appliances(id) ON DELETE CASCADE,

  -- Time range of the labeled event
  start_timestamp TIMESTAMPTZ NOT NULL,
  end_timestamp TIMESTAMPTZ NOT NULL,

  -- Label details
  state VARCHAR(20) NOT NULL, -- ON, OFF, CYCLE_START, CYCLE_END
  power_watts DECIMAL(10, 2),
  notes TEXT,

  -- Quality
  confidence VARCHAR(20) DEFAULT 'certain', -- certain, probable, guess
  verified BOOLEAN DEFAULT false, -- verified by another user or algorithm

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_labels_user_device ON appliance_labels(user_id, device_id);
CREATE INDEX IF NOT EXISTS idx_labels_appliance ON appliance_labels(appliance_id);
CREATE INDEX IF NOT EXISTS idx_labels_time_range ON appliance_labels(start_timestamp, end_timestamp);

-- NILM Models Metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS nilm_models (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL for global models

  -- Model info
  name VARCHAR(200) NOT NULL,
  algorithm VARCHAR(50) NOT NULL, -- CO, FHMM, Seq2Point, Seq2Seq, BERT4NILM
  version VARCHAR(50),
  description TEXT,

  -- Training info
  trained_on_dataset VARCHAR(100), -- REDD, UK-DALE, USER_DATA, MIXED
  training_samples INTEGER,
  training_duration_seconds INTEGER,

  -- Performance metrics
  accuracy DECIMAL(5, 4), -- 0-1
  precision_score DECIMAL(5, 4),
  recall_score DECIMAL(5, 4),
  f1_score DECIMAL(5, 4),
  mae DECIMAL(10, 2), -- mean absolute error in watts

  -- Appliances this model can detect
  appliance_ids INTEGER[], -- array of appliance IDs

  -- Model file storage
  model_path VARCHAR(500), -- file path or S3 URL
  model_size_mb DECIMAL(10, 2),

  -- Configuration
  hyperparameters JSONB, -- model-specific config

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_models_user ON nilm_models(user_id);
CREATE INDEX IF NOT EXISTS idx_models_algorithm ON nilm_models(algorithm);

-- Disaggregation Jobs (for batch processing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS disaggregation_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  -- Job configuration
  job_type VARCHAR(20) NOT NULL, -- REAL_TIME, HISTORICAL, TRAINING
  algorithm VARCHAR(50) NOT NULL,
  model_id INTEGER REFERENCES nilm_models(id) ON DELETE SET NULL,

  -- Data range
  device_id VARCHAR(100),
  site_type VARCHAR(20),
  start_timestamp TIMESTAMPTZ,
  end_timestamp TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) DEFAULT 'pending', -- pending, running, completed, failed
  progress INTEGER DEFAULT 0, -- 0-100

  -- Results
  total_samples INTEGER,
  processed_samples INTEGER,
  error_message TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON disaggregation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON disaggregation_jobs(created_at DESC);

-- Aggregated Views for Quick Queries
-- ============================================================================

-- Daily appliance energy consumption
CREATE VIEW IF NOT EXISTS daily_appliance_energy AS
SELECT
  date_trunc('day', timestamp) as day,
  device_id,
  site_type,
  appliance_id,
  algorithm,
  SUM(energy_kwh) as total_energy_kwh,
  AVG(power_watts) as avg_power_watts,
  MAX(power_watts) as max_power_watts,
  COUNT(*) as sample_count
FROM disaggregation_results
WHERE timestamp > NOW() - INTERVAL '90 days'
GROUP BY day, device_id, site_type, appliance_id, algorithm
ORDER BY day DESC;

-- Appliance usage statistics
CREATE VIEW IF NOT EXISTS appliance_usage_stats AS
SELECT
  a.id as appliance_id,
  a.name as appliance_name,
  a.category_id,
  ac.name as category_name,
  a.site_type,
  a.device_id,
  COUNT(DISTINCT dr.id) as total_detections,
  SUM(dr.energy_kwh) as total_energy_kwh,
  AVG(dr.power_watts) as avg_power_watts,
  MAX(dr.power_watts) as max_power_watts,
  MIN(dr.timestamp) as first_seen,
  MAX(dr.timestamp) as last_seen
FROM appliances a
JOIN appliance_categories ac ON a.category_id = ac.id
LEFT JOIN disaggregation_results dr ON a.id = dr.appliance_id
WHERE dr.timestamp > NOW() - INTERVAL '30 days' OR dr.timestamp IS NULL
GROUP BY a.id, a.name, a.category_id, ac.name, a.site_type, a.device_id;

-- Algorithm performance comparison
CREATE VIEW IF NOT EXISTS algorithm_performance AS
SELECT
  algorithm,
  COUNT(DISTINCT appliance_id) as appliances_detected,
  COUNT(*) as total_predictions,
  AVG(state_confidence) as avg_confidence,
  AVG(processing_time_ms) as avg_processing_time_ms,
  date_trunc('hour', timestamp) as hour
FROM disaggregation_results
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY algorithm, hour
ORDER BY hour DESC, algorithm;

-- User labeling activity
CREATE VIEW IF NOT EXISTS user_labeling_stats AS
SELECT
  u.id as user_id,
  u.username,
  COUNT(DISTINCT al.appliance_id) as labeled_appliances,
  COUNT(*) as total_labels,
  SUM(CASE WHEN al.verified THEN 1 ELSE 0 END) as verified_labels,
  MIN(al.created_at) as first_label,
  MAX(al.created_at) as last_label
FROM users u
LEFT JOIN appliance_labels al ON u.id = al.user_id
GROUP BY u.id, u.username;

-- ============================================================================
-- Sample Data - Common Pre-trained Appliances (Global Signatures)
-- ============================================================================

-- These are typical signatures from REDD/UK-DALE datasets
-- Real signatures will be loaded from the Python service

INSERT INTO appliances (
  user_id, site_type, device_id, category_id, name,
  nominal_power, min_power, max_power, standby_power,
  signature_features, trained_on_dataset, is_global, confidence_score
) VALUES
  -- HVAC
  (NULL, NULL, NULL, 1, 'Central Air Conditioner', 3500, 3000, 4500, 50,
   '{"power_factor": 0.85, "startup_current_spike": 1.8, "cyclic": true}',
   'REDD', true, 0.92),

  -- Refrigerator
  (NULL, NULL, NULL, 2, 'Standard Refrigerator', 150, 80, 250, 5,
   '{"power_factor": 0.78, "cyclic": true, "cycle_duration_minutes": 20}',
   'UK-DALE', true, 0.88),

  -- Washing Machine
  (NULL, NULL, NULL, 3, 'Washing Machine', 500, 100, 2200, 3,
   '{"power_factor": 0.82, "multi_state": true, "heating_element": true}',
   'REDD', true, 0.85),

  -- Dishwasher
  (NULL, NULL, NULL, 4, 'Dishwasher', 1200, 50, 2500, 2,
   '{"power_factor": 0.80, "heating_element": true, "pump": true}',
   'UK-DALE', true, 0.83),

  -- Lighting
  (NULL, NULL, NULL, 5, 'LED Lighting', 15, 5, 60, 0,
   '{"power_factor": 0.95, "instant_on": true, "resistive": true}',
   'REDD', true, 0.95),

  (NULL, NULL, NULL, 5, 'Incandescent Lighting', 60, 40, 100, 0,
   '{"power_factor": 1.0, "instant_on": true, "resistive": true}',
   'REDD', true, 0.98),

  -- Electronics
  (NULL, NULL, NULL, 6, 'Television', 150, 50, 300, 5,
   '{"power_factor": 0.90, "constant_load": true}',
   'UK-DALE', true, 0.87),

  (NULL, NULL, NULL, 6, 'Desktop Computer', 200, 80, 400, 10,
   '{"power_factor": 0.88, "variable_load": true}',
   'REDD', true, 0.84),

  -- Kitchen
  (NULL, NULL, NULL, 7, 'Microwave Oven', 1200, 100, 1500, 3,
   '{"power_factor": 0.92, "instant_on": true, "high_power": true}',
   'UK-DALE', true, 0.91),

  (NULL, NULL, NULL, 7, 'Electric Kettle', 2000, 1800, 2200, 0,
   '{"power_factor": 0.98, "resistive": true, "short_duration": true}',
   'REDD', true, 0.94),

  -- Water Heater
  (NULL, NULL, NULL, 8, 'Electric Water Heater', 4500, 4000, 5000, 0,
   '{"power_factor": 0.99, "resistive": true, "cyclic": true}',
   'UK-DALE', true, 0.89)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
DROP TRIGGER IF EXISTS update_appliances_updated_at ON appliances;
CREATE TRIGGER update_appliances_updated_at
  BEFORE UPDATE ON appliances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_appliance_labels_updated_at ON appliance_labels;
CREATE TRIGGER update_appliance_labels_updated_at
  BEFORE UPDATE ON appliance_labels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_nilm_models_updated_at ON nilm_models;
CREATE TRIGGER update_nilm_models_updated_at
  BEFORE UPDATE ON nilm_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Permissions (Optional - adjust as needed)
-- ============================================================================

-- Grant access to application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_app_user;

-- ============================================================================
-- End of NILM Database Schema
-- ============================================================================

COMMENT ON TABLE appliances IS 'Appliance signatures and metadata';
COMMENT ON TABLE disaggregation_results IS 'Time-series disaggregated power consumption per appliance';
COMMENT ON TABLE appliance_labels IS 'User-provided ground truth labels for training';
COMMENT ON TABLE nilm_models IS 'Trained NILM models metadata and performance metrics';
COMMENT ON TABLE disaggregation_jobs IS 'Batch disaggregation job queue and status';
