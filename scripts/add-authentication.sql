-- ============================================================================
-- Migration: Add Authentication and User Management
-- Description: Adds tables for users, sessions, and user activity tracking
-- ============================================================================

-- ============================================================================
-- USER MANAGEMENT TABLES
-- ============================================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,

  -- User role and permissions
  role VARCHAR(20) NOT NULL DEFAULT 'viewer', -- 'admin', 'manager', 'viewer'
  site_access VARCHAR(20) NOT NULL, -- 'ALL', 'KROL', 'MOSIR', 'OTHER'

  -- User profile
  full_name VARCHAR(255),
  company VARCHAR(100),

  -- Account status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMPTZ,

  -- Security
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  last_login_ip VARCHAR(45),

  -- Password management
  password_changed_at TIMESTAMPTZ DEFAULT NOW(),
  require_password_change BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT valid_role CHECK (role IN ('admin', 'manager', 'viewer')),
  CONSTRAINT valid_site_access CHECK (site_access IN ('ALL', 'KROL', 'MOSIR', 'OTHER'))
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_site_access ON users(site_access);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active) WHERE is_active = true;


-- Sessions table (for JWT token management and session tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Session token
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  refresh_token_hash VARCHAR(255) UNIQUE,

  -- Session info
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_info JSONB,

  -- Expiration
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ,

  -- Session status
  is_active BOOLEAN DEFAULT true,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(255),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at) WHERE is_active = true;


-- User activity log
CREATE TABLE IF NOT EXISTS user_activity_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,

  -- Activity details
  activity_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'view', 'acknowledge_alert', 'create_rule', etc.
  entity_type VARCHAR(50), -- 'alert', 'rule', 'device', 'report', etc.
  entity_id INTEGER,

  -- Request details
  ip_address VARCHAR(45),
  user_agent TEXT,

  -- Activity data
  details JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for activity log
CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON user_activity_log(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_created ON user_activity_log(created_at DESC);


-- ============================================================================
-- HISTORICAL DATA ANALYSIS TABLES
-- ============================================================================

-- Saved reports/analysis
CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Report details
  report_name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50) NOT NULL, -- 'energy_analysis', 'power_quality', 'anomaly_report', 'custom'
  description TEXT,

  -- Report configuration
  site_type VARCHAR(20) NOT NULL,
  device_ids TEXT[], -- Array of device IDs
  date_range_start TIMESTAMPTZ,
  date_range_end TIMESTAMPTZ,
  metrics JSONB, -- Configuration for which metrics to include
  filters JSONB, -- Additional filters

  -- Report data (cached)
  report_data JSONB,
  generated_at TIMESTAMPTZ,

  -- Sharing
  is_public BOOLEAN DEFAULT false,
  shared_with INTEGER[], -- Array of user IDs

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for saved reports
CREATE INDEX IF NOT EXISTS idx_reports_user ON saved_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_type ON saved_reports(report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_site ON saved_reports(site_type);


-- User preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Display preferences
  theme VARCHAR(20) DEFAULT 'light', -- 'light', 'dark', 'auto'
  language VARCHAR(10) DEFAULT 'en',
  timezone VARCHAR(50) DEFAULT 'UTC',

  -- Dashboard preferences
  default_site_view VARCHAR(20), -- Default site to view on login
  default_dashboard_view VARCHAR(20) DEFAULT 'devices', -- 'devices', 'metrics', 'historical'

  -- Notification preferences
  email_notifications BOOLEAN DEFAULT true,
  email_digest_frequency VARCHAR(20) DEFAULT 'daily', -- 'realtime', 'hourly', 'daily', 'weekly', 'never'
  alert_severity_threshold VARCHAR(20) DEFAULT 'warning', -- Minimum severity to notify about

  -- Alert sound preferences
  sound_notifications BOOLEAN DEFAULT true,
  sound_critical_only BOOLEAN DEFAULT true,

  -- Data display preferences
  date_format VARCHAR(20) DEFAULT 'YYYY-MM-DD',
  time_format VARCHAR(10) DEFAULT '24h', -- '12h', '24h'
  metric_units VARCHAR(20) DEFAULT 'metric', -- 'metric', 'imperial'

  -- Advanced preferences
  preferences_json JSONB, -- For additional custom preferences

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for saved_reports table
DROP TRIGGER IF EXISTS update_reports_updated_at ON saved_reports;
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_preferences table
DROP TRIGGER IF EXISTS update_preferences_updated_at ON user_preferences;
CREATE TRIGGER update_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- Function to log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
  p_user_id INTEGER,
  p_activity_type VARCHAR(50),
  p_entity_type VARCHAR(50) DEFAULT NULL,
  p_entity_id INTEGER DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address VARCHAR(45) DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO user_activity_log (
    user_id, activity_type, entity_type, entity_id,
    details, ip_address, user_agent
  ) VALUES (
    p_user_id, p_activity_type, p_entity_type, p_entity_id,
    p_details, p_ip_address, p_user_agent
  );
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- VIEWS
-- ============================================================================

-- Active users view
CREATE OR REPLACE VIEW active_users_view AS
SELECT
  id,
  username,
  email,
  full_name,
  role,
  site_access,
  last_login_at,
  created_at
FROM users
WHERE is_active = true
ORDER BY username;


-- User sessions view
CREATE OR REPLACE VIEW user_sessions_view AS
SELECT
  s.id as session_id,
  u.username,
  u.email,
  u.site_access,
  s.ip_address,
  s.created_at as session_start,
  s.last_activity_at,
  s.expires_at,
  s.is_active
FROM sessions s
JOIN users u ON s.user_id = u.id
WHERE s.is_active = true
ORDER BY s.last_activity_at DESC;


-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default admin user (password: 'admin123' - CHANGE IN PRODUCTION!)
-- Password hash is for 'admin123' - this should be changed immediately after setup
INSERT INTO users (username, email, password_hash, role, site_access, full_name, is_verified)
VALUES
  ('admin', 'admin@vata-nilm.local', '$2b$10$YourHashHere', 'admin', 'ALL', 'System Administrator', true)
ON CONFLICT (username) DO NOTHING;

-- Note: The password hash above is a placeholder.
-- You'll need to generate proper hashes when creating users via the API


-- ============================================================================
-- CLEANUP AND MAINTENANCE FUNCTIONS
-- ============================================================================

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sessions
  WHERE expires_at < NOW() AND is_active = false;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- Function to clean up old activity logs (older than 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM user_activity_log
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- SUMMARY
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Authentication System Installed Successfully';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  - users (user accounts and profiles)';
  RAISE NOTICE '  - sessions (JWT session management)';
  RAISE NOTICE '  - user_activity_log (activity tracking)';
  RAISE NOTICE '  - saved_reports (historical analysis reports)';
  RAISE NOTICE '  - user_preferences (user settings)';
  RAISE NOTICE '';
  RAISE NOTICE 'Views Created:';
  RAISE NOTICE '  - active_users_view';
  RAISE NOTICE '  - user_sessions_view';
  RAISE NOTICE '';
  RAISE NOTICE 'Functions Created:';
  RAISE NOTICE '  - log_user_activity()';
  RAISE NOTICE '  - cleanup_expired_sessions()';
  RAISE NOTICE '  - cleanup_old_activity_logs()';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Create KROL and MOSIR users via API';
  RAISE NOTICE '  2. Install bcrypt and jsonwebtoken npm packages';
  RAISE NOTICE '  3. Configure JWT_SECRET in .env';
  RAISE NOTICE '  4. Implement authentication middleware';
END $$;
