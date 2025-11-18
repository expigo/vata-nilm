import pool from './db.js';
import { EventEmitter } from 'events';

/**
 * Alert Rules Engine
 * Evaluates alert rules and generates alerts
 */

export const alertEvents = new EventEmitter();

// In-memory cache for alert cooldowns
const alertCooldowns = new Map();

/**
 * Evaluate all enabled alert rules against current data
 */
export async function evaluateAlertRules(messageData) {
  const { timestamp, deviceId, siteType } = messageData;

  try {
    // Get all enabled alert rules
    const rulesQuery = `
      SELECT * FROM alert_rules
      WHERE enabled = true
        AND (site_type IS NULL OR site_type = 'ALL' OR site_type = $1)
        AND (device_id IS NULL OR device_id = $2);
    `;

    const rulesResult = await pool.query(rulesQuery, [siteType, deviceId]);
    const rules = rulesResult.rows;

    const triggeredAlerts = [];

    for (const rule of rules) {
      // Check if rule is in cooldown
      const cooldownKey = `${rule.id}_${deviceId}`;
      if (isInCooldown(cooldownKey, rule.cooldown_minutes)) {
        continue;
      }

      // Check time-based restrictions
      if (!isRuleActiveNow(rule)) {
        continue;
      }

      // Evaluate rule based on type
      let shouldTrigger = false;
      let alertData = {};

      switch (rule.rule_type) {
        case 'device_offline':
          shouldTrigger = await evaluateDeviceOffline(deviceId, rule.conditions, timestamp);
          alertData = { lastSeen: timestamp, timeoutSeconds: rule.conditions.timeout_seconds };
          break;

        case 'threshold':
          const thresholdResult = await evaluateThreshold(deviceId, rule.conditions, timestamp);
          shouldTrigger = thresholdResult.triggered;
          alertData = thresholdResult.data;
          break;

        case 'power_quality':
          const pqResult = await evaluatePowerQuality(deviceId, rule.conditions, timestamp);
          shouldTrigger = pqResult.triggered;
          alertData = pqResult.data;
          break;

        case 'energy':
          const energyResult = await evaluateEnergy(deviceId, rule.conditions, timestamp);
          shouldTrigger = energyResult.triggered;
          alertData = energyResult.data;
          break;

        case 'anomaly':
          shouldTrigger = await evaluateAnomaly(deviceId, rule.conditions, timestamp);
          break;

        default:
          console.warn(`Unknown rule type: ${rule.rule_type}`);
      }

      if (shouldTrigger) {
        // Check if alert already exists and is active
        const existingAlert = await getActiveAlert(rule.id, deviceId);

        if (!existingAlert) {
          // Create new alert
          const alert = await createAlert(rule, deviceId, siteType, timestamp, alertData);
          triggeredAlerts.push(alert);

          // Set cooldown
          setCooldown(cooldownKey, rule.cooldown_minutes);

          // Emit event for notification service
          alertEvents.emit('alertTriggered', alert);
        }
      } else if (rule.auto_resolve) {
        // Check if there's an active alert that should be resolved
        const existingAlert = await getActiveAlert(rule.id, deviceId);
        if (existingAlert && existingAlert.state === 'active') {
          await resolveAlert(existingAlert.id, 'Auto-resolved: condition cleared');
          alertEvents.emit('alertResolved', existingAlert);
        }
      }
    }

    return triggeredAlerts;
  } catch (error) {
    console.error('Error evaluating alert rules:', error.message);
    throw error;
  }
}

/**
 * Evaluate device offline rule
 */
async function evaluateDeviceOffline(deviceId, conditions, currentTimestamp) {
  const timeoutSeconds = conditions.timeout_seconds || 120;

  const query = `
    SELECT MAX(timestamp) as last_seen
    FROM mqtt_messages
    WHERE device_id = $1;
  `;

  const result = await pool.query(query, [deviceId]);
  const lastSeen = result.rows[0]?.last_seen;

  if (!lastSeen) return false;

  const secondsSinceLastSeen = (new Date(currentTimestamp) - new Date(lastSeen)) / 1000;
  return secondsSinceLastSeen > timeoutSeconds;
}

/**
 * Evaluate threshold rule
 */
async function evaluateThreshold(deviceId, conditions, timestamp) {
  const { metric, operator, value, duration_seconds = 0, phase = 'any' } = conditions;

  // Build query based on metric
  let metricQuery = '';
  let metricIndex = null;

  switch (metric) {
    case 'voltage':
      metricIndex = phase === 'L1' ? 0 : phase === 'L2' ? 1 : phase === 'L3' ? 2 : null;
      break;
    case 'current':
      metricIndex = phase === 'L1' ? 3 : phase === 'L2' ? 4 : phase === 'L3' ? 5 : null;
      break;
    case 'power':
      metricIndex = phase === 'L1' ? 6 : phase === 'L2' ? 7 : phase === 'L3' ? 8 : null;
      break;
  }

  const query = `
    SELECT
      timestamp,
      device_id,
      raw_json
    FROM mqtt_messages
    WHERE device_id = $1
      AND timestamp >= $2 - INTERVAL '${duration_seconds} seconds'
      AND timestamp <= $2
    ORDER BY timestamp DESC;
  `;

  const result = await pool.query(query, [deviceId, timestamp]);

  if (result.rows.length === 0) {
    return { triggered: false, data: {} };
  }

  // Check if condition is met for the duration
  let allMeetCondition = true;
  let currentValue = null;

  for (const row of result.rows) {
    const data = row.raw_json['NMID_1-18'];
    if (!data) {
      allMeetCondition = false;
      break;
    }

    if (phase === 'any') {
      // Check all three phases
      const indices = metric === 'voltage' ? [0, 1, 2] :
                      metric === 'current' ? [3, 4, 5] : [6, 7, 8];

      const meetsConditionAny = indices.some(idx => {
        const val = data[idx];
        currentValue = currentValue || val;
        return compareValue(val, operator, value);
      });

      if (!meetsConditionAny) {
        allMeetCondition = false;
        break;
      }
    } else {
      // Check specific phase
      const val = data[metricIndex];
      currentValue = val;
      if (!compareValue(val, operator, value)) {
        allMeetCondition = false;
        break;
      }
    }
  }

  return {
    triggered: allMeetCondition,
    data: {
      metric,
      phase,
      currentValue,
      thresholdValue: value,
      operator
    }
  };
}

/**
 * Evaluate power quality rule
 */
async function evaluatePowerQuality(deviceId, conditions, timestamp) {
  const { metric, operator, value, duration_seconds = 0 } = conditions;

  const query = `
    SELECT *
    FROM power_quality_metrics
    WHERE device_id = $1
      AND timestamp >= $2 - INTERVAL '${duration_seconds} seconds'
      AND timestamp <= $2
    ORDER BY timestamp DESC;
  `;

  const result = await pool.query(query, [deviceId, timestamp]);

  if (result.rows.length === 0) {
    return { triggered: false, data: {} };
  }

  let allMeetCondition = true;
  let currentValue = null;

  for (const row of result.rows) {
    const val = row[metric];
    currentValue = currentValue || val;

    if (!compareValue(val, operator, value)) {
      allMeetCondition = false;
      break;
    }
  }

  return {
    triggered: allMeetCondition,
    data: {
      metric,
      currentValue,
      thresholdValue: value,
      operator
    }
  };
}

/**
 * Evaluate energy rule
 */
async function evaluateEnergy(deviceId, conditions, timestamp) {
  const { metric, operator, value, period = '24h' } = conditions;

  const query = `
    SELECT *
    FROM energy_consumption
    WHERE device_id = $1
      AND timestamp >= $2 - INTERVAL '${period}'
      AND timestamp <= $2
    ORDER BY timestamp DESC
    LIMIT 1;
  `;

  const result = await pool.query(query, [deviceId, timestamp]);

  if (result.rows.length === 0) {
    return { triggered: false, data: {} };
  }

  const row = result.rows[0];
  const currentValue = row[metric];

  return {
    triggered: compareValue(currentValue, operator, value),
    data: {
      metric,
      currentValue,
      thresholdValue: value,
      operator,
      period
    }
  };
}

/**
 * Evaluate anomaly rule
 */
async function evaluateAnomaly(deviceId, conditions, timestamp) {
  const { severity = 'warning', anomaly_type = null } = conditions;

  const query = `
    SELECT COUNT(*) as count
    FROM anomaly_detections
    WHERE device_id = $1
      AND timestamp = $2
      ${anomaly_type ? `AND anomaly_type = '${anomaly_type}'` : ''}
      ${severity !== 'info' ? `AND severity IN ('${severity}', 'critical')` : ''};
  `;

  const result = await pool.query(query, [deviceId, timestamp]);
  return result.rows[0]?.count > 0;
}

/**
 * Compare values based on operator
 */
function compareValue(actual, operator, expected) {
  switch (operator) {
    case 'gt': return actual > expected;
    case 'gte': return actual >= expected;
    case 'lt': return actual < expected;
    case 'lte': return actual <= expected;
    case 'eq': return actual === expected;
    case 'ne': return actual !== expected;
    default: return false;
  }
}

/**
 * Check if rule is active based on time restrictions
 */
function isRuleActiveNow(rule) {
  if (!rule.active_hours_start && !rule.active_hours_end && !rule.active_days) {
    return true; // Always active
  }

  const now = new Date();

  // Check day of week
  if (rule.active_days && rule.active_days.length > 0) {
    const currentDay = now.getDay();
    if (!rule.active_days.includes(currentDay)) {
      return false;
    }
  }

  // Check time of day
  if (rule.active_hours_start && rule.active_hours_end) {
    const currentTime = now.toTimeString().substring(0, 5);
    if (currentTime < rule.active_hours_start || currentTime > rule.active_hours_end) {
      return false;
    }
  }

  return true;
}

/**
 * Cooldown management
 */
function isInCooldown(key, cooldownMinutes) {
  const lastTrigger = alertCooldowns.get(key);
  if (!lastTrigger) return false;

  const minutesSinceTrigger = (Date.now() - lastTrigger) / (1000 * 60);
  return minutesSinceTrigger < cooldownMinutes;
}

function setCooldown(key, cooldownMinutes) {
  alertCooldowns.set(key, Date.now());

  // Clear cooldown after duration
  setTimeout(() => {
    alertCooldowns.delete(key);
  }, cooldownMinutes * 60 * 1000);
}

/**
 * Get active alert for a rule and device
 */
async function getActiveAlert(ruleId, deviceId) {
  const query = `
    SELECT * FROM alerts
    WHERE rule_id = $1
      AND device_id = $2
      AND state IN ('active', 'acknowledged')
    ORDER BY triggered_at DESC
    LIMIT 1;
  `;

  const result = await pool.query(query, [ruleId, deviceId]);
  return result.rows[0] || null;
}

/**
 * Create a new alert
 */
async function createAlert(rule, deviceId, siteType, timestamp, alertData) {
  const title = generateAlertTitle(rule, alertData);
  const message = generateAlertMessage(rule, alertData);

  const query = `
    INSERT INTO alerts (
      rule_id, rule_name, alert_type, severity,
      device_id, site_type, title, message, alert_data, triggered_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *;
  `;

  const result = await pool.query(query, [
    rule.id,
    rule.name,
    rule.rule_type,
    rule.severity,
    deviceId,
    siteType,
    title,
    message,
    alertData,
    timestamp
  ]);

  const alert = result.rows[0];

  // Log to history
  await logAlertHistory(alert.id, 'triggered', null, 'active', 'system', 'Alert triggered by rule evaluation');

  return alert;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId, note = null, performedBy = 'system') {
  const query = `
    UPDATE alerts
    SET state = 'resolved', resolved_at = NOW(), resolution_note = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [alertId, note]);
  const alert = result.rows[0];

  if (alert) {
    await logAlertHistory(alertId, 'resolved', 'active', 'resolved', performedBy, note);
  }

  return alert;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId, acknowledgedBy, note = null) {
  const query = `
    UPDATE alerts
    SET state = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [alertId, acknowledgedBy]);
  const alert = result.rows[0];

  if (alert) {
    await logAlertHistory(alertId, 'acknowledged', 'active', 'acknowledged', acknowledgedBy, note);
  }

  return alert;
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(alertId, dismissedBy, note = null) {
  const query = `
    UPDATE alerts
    SET state = 'dismissed', updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;

  const result = await pool.query(query, [alertId]);
  const alert = result.rows[0];

  if (alert) {
    await logAlertHistory(alertId, 'dismissed', alert.state, 'dismissed', dismissedBy, note);
  }

  return alert;
}

/**
 * Log alert history
 */
async function logAlertHistory(alertId, action, previousState, newState, performedBy, note) {
  const query = `
    INSERT INTO alert_history (alert_id, action, previous_state, new_state, performed_by, note)
    VALUES ($1, $2, $3, $4, $5, $6);
  `;

  await pool.query(query, [alertId, action, previousState, newState, performedBy, note]);
}

/**
 * Generate alert title
 */
function generateAlertTitle(rule, alertData) {
  switch (rule.rule_type) {
    case 'device_offline':
      return `Device Offline: ${rule.name}`;

    case 'threshold':
      return `${rule.name}: ${alertData.metric} ${alertData.operator} ${alertData.thresholdValue}`;

    case 'power_quality':
      return `Power Quality Alert: ${rule.name}`;

    case 'energy':
      return `Energy Alert: ${rule.name}`;

    case 'anomaly':
      return `Anomaly Detected: ${rule.name}`;

    default:
      return rule.name;
  }
}

/**
 * Generate alert message
 */
function generateAlertMessage(rule, alertData) {
  switch (rule.rule_type) {
    case 'device_offline':
      return `Device has not sent data for ${alertData.timeoutSeconds} seconds.`;

    case 'threshold':
      return `${alertData.metric} on phase ${alertData.phase} is ${alertData.currentValue?.toFixed(2)} (threshold: ${alertData.operator} ${alertData.thresholdValue})`;

    case 'power_quality':
      return `${alertData.metric} is ${alertData.currentValue?.toFixed(4)} (threshold: ${alertData.operator} ${alertData.thresholdValue})`;

    case 'energy':
      return `${alertData.metric} is ${alertData.currentValue?.toFixed(2)} over ${alertData.period} (threshold: ${alertData.operator} ${alertData.thresholdValue})`;

    case 'anomaly':
      return `Anomaly detected in device behavior.`;

    default:
      return rule.description || 'Alert triggered';
  }
}

/**
 * Get active alerts
 */
export async function getActiveAlerts(siteType = 'ALL', limit = 50) {
  let query = `
    SELECT * FROM active_alerts_view
  `;

  const params = [];

  if (siteType !== 'ALL') {
    query += ' WHERE site_type = $1';
    params.push(siteType);
  }

  query += ` ORDER BY triggered_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get alert history
 */
export async function getAlertHistory(filters = {}, limit = 100) {
  let query = 'SELECT * FROM alerts WHERE 1=1';
  const params = [];
  let paramCount = 1;

  if (filters.deviceId) {
    query += ` AND device_id = $${paramCount++}`;
    params.push(filters.deviceId);
  }

  if (filters.siteType && filters.siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(filters.siteType);
  }

  if (filters.severity) {
    query += ` AND severity = $${paramCount++}`;
    params.push(filters.severity);
  }

  if (filters.state) {
    query += ` AND state = $${paramCount++}`;
    params.push(filters.state);
  }

  if (filters.startDate) {
    query += ` AND triggered_at >= $${paramCount++}`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ` AND triggered_at <= $${paramCount++}`;
    params.push(filters.endDate);
  }

  query += ` ORDER BY triggered_at DESC LIMIT $${paramCount}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get alert statistics
 */
export async function getAlertStatistics(siteType = 'ALL', hours = 24) {
  const query = `
    SELECT
      COUNT(*) as total_alerts,
      COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
      COUNT(*) FILTER (WHERE severity = 'warning') as warning_count,
      COUNT(*) FILTER (WHERE severity = 'info') as info_count,
      COUNT(*) FILTER (WHERE state = 'active') as active_count,
      COUNT(*) FILTER (WHERE state = 'acknowledged') as acknowledged_count,
      COUNT(*) FILTER (WHERE state = 'resolved') as resolved_count,
      COUNT(DISTINCT device_id) as affected_devices
    FROM alerts
    WHERE triggered_at > NOW() - INTERVAL '${hours} hours'
      ${siteType !== 'ALL' ? `AND site_type = '${siteType}'` : ''};
  `;

  const result = await pool.query(query);
  return result.rows[0];
}
