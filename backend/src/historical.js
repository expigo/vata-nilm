import pool from './db.js';

/**
 * Historical Data Analysis Service
 * Provides comprehensive historical data queries and analytics
 */

/**
 * Get historical raw data
 */
export async function getHistoricalData(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate,
    limit = 1000,
    offset = 0
  } = filters;

  let query = `
    SELECT
      timestamp,
      device_id,
      site_type,
      raw_json,
      created_at
    FROM mqtt_messages
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  // Filter by site type
  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  // Filter by device IDs
  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++})`;
    params.push(deviceIds);
  }

  // Filter by date range
  if (startDate) {
    query += ` AND timestamp >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND timestamp <= $${paramCount++}`;
    params.push(endDate);
  }

  query += ` ORDER BY timestamp DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get energy consumption analysis
 */
export async function getEnergyAnalysis(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate,
    groupBy = 'hour' // 'hour', 'day', 'week', 'month'
  } = filters;

  const timeGrouping = {
    hour: "date_trunc('hour', timestamp)",
    day: "date_trunc('day', timestamp)",
    week: "date_trunc('week', timestamp)",
    month: "date_trunc('month', timestamp)"
  };

  let query = `
    SELECT
      ${timeGrouping[groupBy]} as period,
      device_id,
      site_type,
      AVG(energy_kwh_total) as avg_energy,
      MAX(energy_kwh_total) - MIN(energy_kwh_total) as energy_consumed,
      AVG(demand_kw_total) as avg_demand,
      MAX(peak_demand_kw) as peak_demand,
      AVG(load_factor) as avg_load_factor,
      COUNT(*) as data_points
    FROM energy_consumption
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++}`;
    params.push(deviceIds);
  }

  if (startDate) {
    query += ` AND timestamp >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND timestamp <= $${paramCount++}`;
    params.push(endDate);
  }

  query += ` GROUP BY period, device_id, site_type ORDER BY period DESC, device_id`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get power quality analysis
 */
export async function getPowerQualityAnalysis(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate,
    groupBy = 'hour'
  } = filters;

  const timeGrouping = {
    hour: "date_trunc('hour', timestamp)",
    day: "date_trunc('day', timestamp)",
    week: "date_trunc('week', timestamp)",
    month: "date_trunc('month', timestamp)"
  };

  let query = `
    SELECT
      ${timeGrouping[groupBy]} as period,
      device_id,
      site_type,
      AVG(power_factor_total) as avg_power_factor,
      MIN(power_factor_total) as min_power_factor,
      AVG(voltage_imbalance) as avg_voltage_imbalance,
      MAX(voltage_imbalance) as max_voltage_imbalance,
      AVG(current_imbalance) as avg_current_imbalance,
      MAX(current_imbalance) as max_current_imbalance,
      AVG(power_imbalance) as avg_power_imbalance,
      COUNT(*) as data_points
    FROM power_quality_metrics
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++})`;
    params.push(deviceIds);
  }

  if (startDate) {
    query += ` AND timestamp >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND timestamp <= $${paramCount++}`;
    params.push(endDate);
  }

  query += ` GROUP BY period, device_id, site_type ORDER BY period DESC, device_id`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get anomalies analysis
 */
export async function getAnomaliesAnalysis(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate,
    severity = null,
    anomalyType = null
  } = filters;

  let query = `
    SELECT
      DATE(timestamp) as date,
      anomaly_type,
      severity,
      device_id,
      site_type,
      COUNT(*) as anomaly_count,
      AVG(deviation_percent) as avg_deviation
    FROM anomaly_detections
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++})`;
    params.push(deviceIds);
  }

  if (startDate) {
    query += ` AND timestamp >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND timestamp <= $${paramCount++}`;
    params.push(endDate);
  }

  if (severity) {
    query += ` AND severity = $${paramCount++}`;
    params.push(severity);
  }

  if (anomalyType) {
    query += ` AND anomaly_type = $${paramCount++}`;
    params.push(anomalyType);
  }

  query += ` GROUP BY date, anomaly_type, severity, device_id, site_type ORDER BY date DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get alert history analysis
 */
export async function getAlertAnalysis(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate,
    severity = null,
    state = null
  } = filters;

  let query = `
    SELECT
      DATE(triggered_at) as date,
      alert_type,
      severity,
      state,
      device_id,
      site_type,
      COUNT(*) as alert_count,
      AVG(EXTRACT(EPOCH FROM (COALESCE(acknowledged_at, resolved_at, NOW()) - triggered_at))) as avg_response_time_seconds
    FROM alerts
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++})`;
    params.push(deviceIds);
  }

  if (startDate) {
    query += ` AND triggered_at >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND triggered_at <= $${paramCount++}`;
    params.push(endDate);
  }

  if (severity) {
    query += ` AND severity = $${paramCount++}`;
    params.push(severity);
  }

  if (state) {
    query += ` AND state = $${paramCount++}`;
    params.push(state);
  }

  query += ` GROUP BY date, alert_type, severity, state, device_id, site_type ORDER BY date DESC`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get device statistics
 */
export async function getDeviceStatistics(filters = {}) {
  const {
    siteType = 'ALL',
    deviceIds = null,
    startDate,
    endDate
  } = filters;

  let query = `
    SELECT
      device_id,
      site_type,
      COUNT(DISTINCT DATE(timestamp)) as days_active,
      COUNT(*) as total_messages,
      MIN(timestamp) as first_seen,
      MAX(timestamp) as last_seen,
      AVG(EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (PARTITION BY device_id ORDER BY timestamp)))) as avg_interval_seconds
    FROM mqtt_messages
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (siteType !== 'ALL') {
    query += ` AND site_type = $${paramCount++}`;
    params.push(siteType);
  }

  if (deviceIds && deviceIds.length > 0) {
    query += ` AND device_id = ANY($${paramCount++})`;
    params.push(deviceIds);
  }

  if (startDate) {
    query += ` AND timestamp >= $${paramCount++}`;
    params.push(startDate);
  }

  if (endDate) {
    query += ` AND timestamp <= $${paramCount++}`;
    params.push(endDate);
  }

  query += ` GROUP BY device_id, site_type ORDER BY device_id`;

  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Generate comprehensive report
 */
export async function generateReport(reportConfig) {
  const {
    reportType,
    siteType,
    deviceIds,
    startDate,
    endDate
  } = reportConfig;

  const filters = { siteType, deviceIds, startDate, endDate };

  let reportData = {};

  switch (reportType) {
    case 'energy_analysis':
      reportData = {
        summary: await getEnergyAnalysis({ ...filters, groupBy: 'day' }),
        hourly: await getEnergyAnalysis({ ...filters, groupBy: 'hour' }),
        deviceStats: await getDeviceStatistics(filters)
      };
      break;

    case 'power_quality':
      reportData = {
        summary: await getPowerQualityAnalysis({ ...filters, groupBy: 'day' }),
        hourly: await getPowerQualityAnalysis({ ...filters, groupBy: 'hour' }),
        anomalies: await getAnomaliesAnalysis(filters)
      };
      break;

    case 'anomaly_report':
      reportData = {
        anomalies: await getAnomaliesAnalysis(filters),
        byType: await getAnomaliesAnalysis({ ...filters, groupBy: 'type' }),
        bySeverity: await getAnomaliesAnalysis({ ...filters, groupBy: 'severity' })
      };
      break;

    case 'custom':
    default:
      reportData = {
        energy: await getEnergyAnalysis({ ...filters, groupBy: 'day' }),
        powerQuality: await getPowerQualityAnalysis({ ...filters, groupBy: 'day' }),
        anomalies: await getAnomaliesAnalysis(filters),
        alerts: await getAlertAnalysis(filters),
        deviceStats: await getDeviceStatistics(filters)
      };
  }

  return reportData;
}

/**
 * Save report
 */
export async function saveReport(userId, reportConfig, reportData) {
  const {
    reportName,
    reportType,
    description,
    siteType,
    deviceIds,
    startDate,
    endDate,
    metrics,
    filters
  } = reportConfig;

  const query = `
    INSERT INTO saved_reports (
      user_id, report_name, report_type, description,
      site_type, device_ids, date_range_start, date_range_end,
      metrics, filters, report_data, generated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
    RETURNING *;
  `;

  const result = await pool.query(query, [
    userId,
    reportName,
    reportType,
    description,
    siteType,
    deviceIds,
    startDate,
    endDate,
    JSON.stringify(metrics || {}),
    JSON.stringify(filters || {}),
    JSON.stringify(reportData)
  ]);

  return result.rows[0];
}

/**
 * Get saved reports for user
 */
export async function getSavedReports(userId) {
  const query = `
    SELECT
      id, report_name, report_type, description,
      site_type, date_range_start, date_range_end,
      generated_at, created_at, is_public
    FROM saved_reports
    WHERE user_id = $1 OR is_public = true
    ORDER BY created_at DESC;
  `;

  const result = await pool.query(query, [userId]);
  return result.rows;
}

/**
 * Get saved report by ID
 */
export async function getSavedReportById(reportId, userId) {
  const query = `
    SELECT * FROM saved_reports
    WHERE id = $1 AND (user_id = $2 OR is_public = true);
  `;

  const result = await pool.query(query, [reportId, userId]);
  return result.rows[0];
}

/**
 * Delete saved report
 */
export async function deleteSavedReport(reportId, userId) {
  const query = `
    DELETE FROM saved_reports
    WHERE id = $1 AND user_id = $2
    RETURNING report_name;
  `;

  const result = await pool.query(query, [reportId, userId]);
  return result.rows[0];
}

/**
 * Get comparison data (compare periods)
 */
export async function getComparisonData(filters) {
  const {
    siteType,
    deviceIds,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd
  } = filters;

  const currentData = await getEnergyAnalysis({
    siteType,
    deviceIds,
    startDate: currentStart,
    endDate: currentEnd,
    groupBy: 'day'
  });

  const previousData = await getEnergyAnalysis({
    siteType,
    deviceIds,
    startDate: previousStart,
    endDate: previousEnd,
    groupBy: 'day'
  });

  return {
    current: currentData,
    previous: previousData,
    comparison: calculateComparison(currentData, previousData)
  };
}

/**
 * Calculate comparison metrics
 */
function calculateComparison(current, previous) {
  const currentTotal = current.reduce((sum, d) => sum + (parseFloat(d.energy_consumed) || 0), 0);
  const previousTotal = previous.reduce((sum, d) => sum + (parseFloat(d.energy_consumed) || 0), 0);

  const change = currentTotal - previousTotal;
  const percentChange = previousTotal > 0 ? (change / previousTotal) * 100 : 0;

  return {
    currentTotal,
    previousTotal,
    change,
    percentChange,
    trend: percentChange > 0 ? 'increase' : percentChange < 0 ? 'decrease' : 'stable'
  };
}
