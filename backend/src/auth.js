import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from './db.js';

/**
 * Authentication Service
 * Handles user authentication, session management, and access control
 */

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';
const SALT_ROUNDS = 10;

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
export function generateToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    siteAccess: user.site_access
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(user) {
  const payload = {
    id: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Create a new user
 */
export async function createUser(userData) {
  const {
    username,
    email,
    password,
    role = 'viewer',
    siteAccess,
    fullName,
    company,
    createdBy = null
  } = userData;

  // Validate required fields
  if (!username || !email || !password || !siteAccess) {
    throw new Error('Missing required fields: username, email, password, siteAccess');
  }

  // Validate site access
  const validSites = ['ALL', 'KROL', 'MOSIR', 'OTHER'];
  if (!validSites.includes(siteAccess)) {
    throw new Error(`Invalid site access. Must be one of: ${validSites.join(', ')}`);
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  const query = `
    INSERT INTO users (
      username, email, password_hash, role, site_access,
      full_name, company, created_by, is_verified
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
    RETURNING id, username, email, role, site_access, full_name, company, created_at;
  `;

  try {
    const result = await pool.query(query, [
      username,
      email,
      passwordHash,
      role,
      siteAccess,
      fullName,
      company,
      createdBy
    ]);

    // Create default preferences
    await createDefaultPreferences(result.rows[0].id);

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      if (error.constraint === 'users_username_key') {
        throw new Error('Username already exists');
      } else if (error.constraint === 'users_email_key') {
        throw new Error('Email already exists');
      }
    }
    throw error;
  }
}

/**
 * Create default user preferences
 */
async function createDefaultPreferences(userId) {
  const query = `
    INSERT INTO user_preferences (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING;
  `;

  await pool.query(query, [userId]);
}

/**
 * Authenticate user (login)
 */
export async function authenticateUser(username, password, ipAddress = null, userAgent = null) {
  const query = `
    SELECT id, username, email, password_hash, role, site_access,
           full_name, is_active, failed_login_attempts, locked_until
    FROM users
    WHERE username = $1 OR email = $1;
  `;

  const result = await pool.query(query, [username]);

  if (result.rows.length === 0) {
    throw new Error('Invalid username or password');
  }

  const user = result.rows[0];

  // Check if account is active
  if (!user.is_active) {
    throw new Error('Account is disabled. Please contact administrator.');
  }

  // Check if account is locked
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    throw new Error(`Account is locked. Try again in ${minutesLeft} minutes.`);
  }

  // Verify password
  const isValidPassword = await comparePassword(password, user.password_hash);

  if (!isValidPassword) {
    // Increment failed login attempts
    await incrementFailedLoginAttempts(user.id);
    throw new Error('Invalid username or password');
  }

  // Reset failed login attempts on successful login
  await resetFailedLoginAttempts(user.id, ipAddress);

  // Generate tokens
  const token = generateToken(user);
  const refreshToken = generateRefreshToken(user);

  // Create session
  const session = await createSession(user.id, token, refreshToken, ipAddress, userAgent);

  // Log activity
  await logActivity(user.id, 'login', null, null, { ipAddress, userAgent });

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      siteAccess: user.site_access,
      fullName: user.full_name
    },
    token,
    refreshToken,
    sessionId: session.id
  };
}

/**
 * Create session
 */
async function createSession(userId, token, refreshToken, ipAddress, userAgent) {
  const tokenHash = await bcrypt.hash(token, 5); // Lighter hash for tokens
  const refreshTokenHash = await bcrypt.hash(refreshToken, 5);

  // Calculate expiration times
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const query = `
    INSERT INTO sessions (
      user_id, token_hash, refresh_token_hash,
      ip_address, user_agent, expires_at, refresh_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id;
  `;

  const result = await pool.query(query, [
    userId,
    tokenHash,
    refreshTokenHash,
    ipAddress,
    userAgent,
    expiresAt,
    refreshExpiresAt
  ]);

  return result.rows[0];
}

/**
 * Increment failed login attempts
 */
async function incrementFailedLoginAttempts(userId) {
  const query = `
    UPDATE users
    SET failed_login_attempts = failed_login_attempts + 1,
        locked_until = CASE
          WHEN failed_login_attempts >= 4 THEN NOW() + INTERVAL '30 minutes'
          ELSE NULL
        END
    WHERE id = $1;
  `;

  await pool.query(query, [userId]);
}

/**
 * Reset failed login attempts
 */
async function resetFailedLoginAttempts(userId, ipAddress) {
  const query = `
    UPDATE users
    SET failed_login_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW(),
        last_login_ip = $2
    WHERE id = $1;
  `;

  await pool.query(query, [userId, ipAddress]);
}

/**
 * Logout user (revoke session)
 */
export async function logoutUser(userId, sessionId = null) {
  let query;
  let params;

  if (sessionId) {
    query = `
      UPDATE sessions
      SET is_active = false, revoked_at = NOW(), revoked_reason = 'user_logout'
      WHERE id = $1 AND user_id = $2
      RETURNING id;
    `;
    params = [sessionId, userId];
  } else {
    // Revoke all sessions for user
    query = `
      UPDATE sessions
      SET is_active = false, revoked_at = NOW(), revoked_reason = 'user_logout_all'
      WHERE user_id = $1 AND is_active = true
      RETURNING id;
    `;
    params = [userId];
  }

  const result = await pool.query(query, params);

  // Log activity
  await logActivity(userId, 'logout', null, null, {
    sessionId,
    revokedCount: result.rowCount
  });

  return { success: true, revokedSessions: result.rowCount };
}

/**
 * Verify user session
 */
export async function verifySession(token) {
  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  // Check if user still exists and is active
  const userQuery = `
    SELECT id, username, email, role, site_access, full_name, is_active
    FROM users
    WHERE id = $1;
  `;

  const userResult = await pool.query(userQuery, [decoded.id]);

  if (userResult.rows.length === 0 || !userResult.rows[0].is_active) {
    return null;
  }

  return {
    id: decoded.id,
    username: decoded.username,
    email: decoded.email,
    role: decoded.role,
    siteAccess: decoded.siteAccess
  };
}

/**
 * Get user by ID
 */
export async function getUserById(userId) {
  const query = `
    SELECT
      id, username, email, role, site_access,
      full_name, company, is_active, is_verified,
      last_login_at, created_at
    FROM users
    WHERE id = $1;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers() {
  const query = `
    SELECT
      id, username, email, role, site_access,
      full_name, company, is_active, is_verified,
      last_login_at, created_at
    FROM users
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Update user
 */
export async function updateUser(userId, updates) {
  const allowedFields = ['email', 'role', 'site_access', 'full_name', 'company', 'is_active'];
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramCount++}`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(userId);

  const query = `
    UPDATE users
    SET ${setClauses.join(', ')}, updated_at = NOW()
    WHERE id = $${paramCount}
    RETURNING id, username, email, role, site_access, full_name, company, is_active;
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Change user password
 */
export async function changePassword(userId, currentPassword, newPassword) {
  // Get current password hash
  const query = `SELECT password_hash FROM users WHERE id = $1`;
  const result = await pool.query(query, [userId]);

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  // Verify current password
  const isValid = await comparePassword(currentPassword, result.rows[0].password_hash);
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  // Hash new password
  const newPasswordHash = await hashPassword(newPassword);

  // Update password
  const updateQuery = `
    UPDATE users
    SET password_hash = $1, password_changed_at = NOW(), require_password_change = false
    WHERE id = $2;
  `;

  await pool.query(updateQuery, [newPasswordHash, userId]);

  // Revoke all sessions (force re-login)
  await logoutUser(userId);

  return { success: true };
}

/**
 * Delete user
 */
export async function deleteUser(userId) {
  const query = `DELETE FROM users WHERE id = $1 RETURNING username`;
  const result = await pool.query(query, [userId]);
  return result.rows[0];
}

/**
 * Log user activity
 */
export async function logActivity(userId, activityType, entityType = null, entityId = null, details = null, ipAddress = null, userAgent = null) {
  const query = `
    INSERT INTO user_activity_log (
      user_id, activity_type, entity_type, entity_id,
      details, ip_address, user_agent
    ) VALUES ($1, $2, $3, $4, $5, $6, $7);
  `;

  await pool.query(query, [
    userId,
    activityType,
    entityType,
    entityId,
    details ? JSON.stringify(details) : null,
    ipAddress,
    userAgent
  ]);
}

/**
 * Get user preferences
 */
export async function getUserPreferences(userId) {
  const query = `SELECT * FROM user_preferences WHERE user_id = $1`;
  const result = await pool.query(query, [userId]);

  if (result.rows.length === 0) {
    // Create default preferences if they don't exist
    await createDefaultPreferences(userId);
    return await getUserPreferences(userId);
  }

  return result.rows[0];
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(userId, preferences) {
  const allowedFields = [
    'theme', 'language', 'timezone', 'default_site_view', 'default_dashboard_view',
    'email_notifications', 'email_digest_frequency', 'alert_severity_threshold',
    'sound_notifications', 'sound_critical_only', 'date_format', 'time_format',
    'metric_units', 'preferences_json'
  ];

  const setClauses = [];
  const values = [];
  let paramCount = 1;

  for (const [key, value] of Object.entries(preferences)) {
    if (allowedFields.includes(key)) {
      setClauses.push(`${key} = $${paramCount++}`);
      values.push(key === 'preferences_json' ? JSON.stringify(value) : value);
    }
  }

  if (setClauses.length === 0) {
    return await getUserPreferences(userId);
  }

  values.push(userId);

  const query = `
    UPDATE user_preferences
    SET ${setClauses.join(', ')}
    WHERE user_id = $${paramCount}
    RETURNING *;
  `;

  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Check if user has access to site
 */
export function hasAccess(user, siteType) {
  if (user.role === 'admin' || user.siteAccess === 'ALL') {
    return true;
  }

  return user.siteAccess === siteType;
}

/**
 * Get accessible sites for user
 */
export function getAccessibleSites(user) {
  if (user.role === 'admin' || user.siteAccess === 'ALL') {
    return ['ALL', 'KROL', 'MOSIR', 'OTHER'];
  }

  return [user.siteAccess];
}
