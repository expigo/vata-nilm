import pool from './db.js';

/**
 * Metrics Calculation Service
 * Calculates power quality metrics, energy consumption, and detects anomalies
 */

const NOMINAL_VOLTAGE = 230; // Nominal voltage in V
const NOMINAL_FREQUENCY = 50; // Nominal frequency in Hz

/**
 * Calculate power quality metrics from raw MQTT data
 */
export async function calculatePowerQualityMetrics(messageData) {
  const { timestamp, deviceId, siteType, rawJson } = messageData;

  // Extract three-phase data
  const data = rawJson['NMID_1-18'];
  if (!data || data.length < 9) {
    console.warn('Insufficient data for power quality calculation');
    return null;
  }

  const voltage = data.slice(0, 3);
  const current = data.slice(3, 6);
  const power = data.slice(6, 9); // Real power in W

  // Calculate apparent power (S = V × I)
  const apparentPower = [
    voltage[0] * current[0],
    voltage[1] * current[1],
    voltage[2] * current[2]
  ];
  const apparentPowerTotal = apparentPower[0] + apparentPower[1] + apparentPower[2];

  // Calculate power factor (PF = P / S)
  const powerFactor = [
    apparentPower[0] > 0 ? Math.abs(power[0] / apparentPower[0]) : 0,
    apparentPower[1] > 0 ? Math.abs(power[1] / apparentPower[1]) : 0,
    apparentPower[2] > 0 ? Math.abs(power[2] / apparentPower[2]) : 0
  ];
  const totalRealPower = power[0] + power[1] + power[2];
  const powerFactorTotal = apparentPowerTotal > 0 ? Math.abs(totalRealPower / apparentPowerTotal) : 0;

  // Calculate phase imbalances
  const voltageAvg = (voltage[0] + voltage[1] + voltage[2]) / 3;
  const currentAvg = (current[0] + current[1] + current[2]) / 3;
  const powerAvg = (power[0] + power[1] + power[2]) / 3;

  const voltageImbalance = calculateImbalance(voltage, voltageAvg);
  const currentImbalance = calculateImbalance(current, currentAvg);
  const powerImbalance = calculateImbalance(power, powerAvg);

  // Calculate voltage deviation from nominal
  const voltageDeviation = [
    ((voltage[0] - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE) * 100,
    ((voltage[1] - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE) * 100,
    ((voltage[2] - NOMINAL_VOLTAGE) / NOMINAL_VOLTAGE) * 100
  ];

  // Insert into database
  const query = `
    INSERT INTO power_quality_metrics (
      timestamp, device_id, site_type,
      power_factor_l1, power_factor_l2, power_factor_l3, power_factor_total,
      apparent_power_l1, apparent_power_l2, apparent_power_l3, apparent_power_total,
      voltage_imbalance, current_imbalance, power_imbalance,
      voltage_deviation_l1, voltage_deviation_l2, voltage_deviation_l3
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING *;
  `;

  try {
    const result = await pool.query(query, [
      timestamp, deviceId, siteType,
      powerFactor[0], powerFactor[1], powerFactor[2], powerFactorTotal,
      apparentPower[0], apparentPower[1], apparentPower[2], apparentPowerTotal,
      voltageImbalance, currentImbalance, powerImbalance,
      voltageDeviation[0], voltageDeviation[1], voltageDeviation[2]
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error inserting power quality metrics:', error.message);
    throw error;
  }
}

/**
 * Calculate phase imbalance percentage
 * Formula: (max deviation from average / average) × 100
 */
function calculateImbalance(phases, average) {
  if (average === 0) return 0;

  const maxDeviation = Math.max(
    Math.abs(phases[0] - average),
    Math.abs(phases[1] - average),
    Math.abs(phases[2] - average)
  );

  return (maxDeviation / average) * 100;
}

/**
 * Calculate energy consumption
 * Integrates power over time to calculate kWh
 */
export async function calculateEnergyConsumption(messageData) {
  const { timestamp, deviceId, siteType, rawJson } = messageData;

  const data = rawJson['NMID_1-18'];
  if (!data || data.length < 9) {
    return null;
  }

  const power = data.slice(6, 9); // Power in W
  const totalPower = power[0] + power[1] + power[2];

  // Get the last energy record for this device
  const lastRecordQuery = `
    SELECT * FROM energy_consumption
    WHERE device_id = $1
    ORDER BY timestamp DESC
    LIMIT 1;
  `;

  try {
    const lastRecord = await pool.query(lastRecordQuery, [deviceId]);

    let energyKwh = [0, 0, 0];
    let energyKwhTotal = 0;
    let peakDemandKw = 0;
    let peakDemandTimestamp = timestamp;

    if (lastRecord.rows.length > 0) {
      const last = lastRecord.rows[0];
      const timeDiffHours = (new Date(timestamp) - new Date(last.timestamp)) / (1000 * 60 * 60);

      // Calculate incremental energy (E = P × t)
      energyKwh = [
        (last.energy_kwh_l1 || 0) + (power[0] / 1000) * timeDiffHours,
        (last.energy_kwh_l2 || 0) + (power[1] / 1000) * timeDiffHours,
        (last.energy_kwh_l3 || 0) + (power[2] / 1000) * timeDiffHours
      ];
      energyKwhTotal = energyKwh[0] + energyKwh[1] + energyKwh[2];

      // Track peak demand
      const currentDemandKw = totalPower / 1000;
      peakDemandKw = Math.max(last.peak_demand_kw || 0, currentDemandKw);
      peakDemandTimestamp = currentDemandKw > (last.peak_demand_kw || 0) ? timestamp : last.peak_demand_timestamp;
    } else {
      // First record for this device
      peakDemandKw = totalPower / 1000;
    }

    // Calculate 15-minute rolling demand (simple moving average)
    const demandQuery = `
      SELECT AVG((raw_json->'NMID_1-18'->>6)::numeric +
                 (raw_json->'NMID_1-18'->>7)::numeric +
                 (raw_json->'NMID_1-18'->>8)::numeric) / 1000 as avg_kw
      FROM mqtt_messages
      WHERE device_id = $1
        AND timestamp > $2 - INTERVAL '15 minutes'
        AND timestamp <= $2;
    `;

    const demandResult = await pool.query(demandQuery, [deviceId, timestamp]);
    const demandKwTotal = demandResult.rows[0]?.avg_kw || (totalPower / 1000);

    // Calculate load factor (average / peak)
    const loadFactor = peakDemandKw > 0 ? demandKwTotal / peakDemandKw : 0;

    // Insert into database
    const insertQuery = `
      INSERT INTO energy_consumption (
        timestamp, device_id, site_type,
        energy_kwh_l1, energy_kwh_l2, energy_kwh_l3, energy_kwh_total,
        demand_kw_l1, demand_kw_l2, demand_kw_l3, demand_kw_total,
        peak_demand_kw, peak_demand_timestamp, load_factor
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      timestamp, deviceId, siteType,
      energyKwh[0], energyKwh[1], energyKwh[2], energyKwhTotal,
      power[0] / 1000, power[1] / 1000, power[2] / 1000, demandKwTotal,
      peakDemandKw, peakDemandTimestamp, loadFactor
    ]);

    return result.rows[0];
  } catch (error) {
    console.error('Error calculating energy consumption:', error.message);
    throw error;
  }
}

/**
 * Detect anomalies in the data
 */
export async function detectAnomalies(messageData) {
  const { timestamp, deviceId, siteType, rawJson } = messageData;

  const data = rawJson['NMID_1-18'];
  if (!data || data.length < 9) {
    return [];
  }

  const voltage = data.slice(0, 3);
  const current = data.slice(3, 6);
  const power = data.slice(6, 9);

  const anomalies = [];

  // Get historical averages for this device (last 24 hours)
  const historicalQuery = `
    SELECT
      AVG((raw_json->'NMID_1-18'->>0)::numeric) as avg_v_l1,
      AVG((raw_json->'NMID_1-18'->>1)::numeric) as avg_v_l2,
      AVG((raw_json->'NMID_1-18'->>2)::numeric) as avg_v_l3,
      AVG((raw_json->'NMID_1-18'->>3)::numeric) as avg_i_l1,
      AVG((raw_json->'NMID_1-18'->>4)::numeric) as avg_i_l2,
      AVG((raw_json->'NMID_1-18'->>5)::numeric) as avg_i_l3,
      AVG((raw_json->'NMID_1-18'->>6)::numeric) as avg_p_l1,
      AVG((raw_json->'NMID_1-18'->>7)::numeric) as avg_p_l2,
      AVG((raw_json->'NMID_1-18'->>8)::numeric) as avg_p_l3,
      STDDEV((raw_json->'NMID_1-18'->>0)::numeric) as stddev_v_l1,
      STDDEV((raw_json->'NMID_1-18'->>1)::numeric) as stddev_v_l2,
      STDDEV((raw_json->'NMID_1-18'->>2)::numeric) as stddev_v_l3,
      STDDEV((raw_json->'NMID_1-18'->>3)::numeric) as stddev_i_l1,
      STDDEV((raw_json->'NMID_1-18'->>4)::numeric) as stddev_i_l2,
      STDDEV((raw_json->'NMID_1-18'->>5)::numeric) as stddev_i_l3,
      STDDEV((raw_json->'NMID_1-18'->>6)::numeric) as stddev_p_l1,
      STDDEV((raw_json->'NMID_1-18'->>7)::numeric) as stddev_p_l2,
      STDDEV((raw_json->'NMID_1-18'->>8)::numeric) as stddev_p_l3
    FROM mqtt_messages
    WHERE device_id = $1
      AND timestamp > $2 - INTERVAL '24 hours'
      AND timestamp < $2;
  `;

  try {
    const historical = await pool.query(historicalQuery, [deviceId, timestamp]);
    const hist = historical.rows[0];

    if (!hist || hist.avg_v_l1 === null) {
      // Not enough historical data
      return [];
    }

    // Voltage spike detection (> 3 standard deviations)
    const voltageThreshold = 3;
    for (let i = 0; i < 3; i++) {
      const phase = ['L1', 'L2', 'L3'][i];
      const avgKey = `avg_v_${phase.toLowerCase()}`;
      const stddevKey = `stddev_v_${phase.toLowerCase()}`;

      const avg = parseFloat(hist[avgKey]);
      const stddev = parseFloat(hist[stddevKey]) || 0;

      if (stddev > 0 && Math.abs(voltage[i] - avg) > voltageThreshold * stddev) {
        const deviation = ((voltage[i] - avg) / avg) * 100;
        anomalies.push({
          timestamp,
          deviceId,
          siteType,
          anomalyType: voltage[i] > avg ? 'voltage_spike' : 'voltage_drop',
          severity: Math.abs(deviation) > 15 ? 'critical' : 'warning',
          metricName: `voltage_${phase}`,
          metricValue: voltage[i],
          expectedValue: avg,
          deviationPercent: deviation,
          phase,
          description: `Voltage on ${phase} deviated ${deviation.toFixed(1)}% from normal (${voltage[i].toFixed(1)}V vs ${avg.toFixed(1)}V expected)`
        });
      }
    }

    // Current spike detection
    const currentThreshold = 3;
    for (let i = 0; i < 3; i++) {
      const phase = ['L1', 'L2', 'L3'][i];
      const avgKey = `avg_i_${phase.toLowerCase()}`;
      const stddevKey = `stddev_i_${phase.toLowerCase()}`;

      const avg = parseFloat(hist[avgKey]);
      const stddev = parseFloat(hist[stddevKey]) || 0;

      if (stddev > 0 && current[i] > avg + currentThreshold * stddev) {
        const deviation = ((current[i] - avg) / avg) * 100;
        anomalies.push({
          timestamp,
          deviceId,
          siteType,
          anomalyType: 'current_spike',
          severity: deviation > 100 ? 'critical' : 'warning',
          metricName: `current_${phase}`,
          metricValue: current[i],
          expectedValue: avg,
          deviationPercent: deviation,
          phase,
          description: `Current on ${phase} spiked ${deviation.toFixed(1)}% above normal (${current[i].toFixed(2)}A vs ${avg.toFixed(2)}A expected)`
        });
      }
    }

    // Power drop detection
    const powerThreshold = 3;
    const totalPower = power[0] + power[1] + power[2];
    const avgTotalPower = parseFloat(hist.avg_p_l1) + parseFloat(hist.avg_p_l2) + parseFloat(hist.avg_p_l3);
    const stddevTotalPower = Math.sqrt(
      Math.pow(parseFloat(hist.stddev_p_l1) || 0, 2) +
      Math.pow(parseFloat(hist.stddev_p_l2) || 0, 2) +
      Math.pow(parseFloat(hist.stddev_p_l3) || 0, 2)
    );

    if (stddevTotalPower > 0 && totalPower < avgTotalPower - powerThreshold * stddevTotalPower) {
      const deviation = ((totalPower - avgTotalPower) / avgTotalPower) * 100;
      anomalies.push({
        timestamp,
        deviceId,
        siteType,
        anomalyType: 'power_drop',
        severity: Math.abs(deviation) > 50 ? 'critical' : 'warning',
        metricName: 'total_power',
        metricValue: totalPower,
        expectedValue: avgTotalPower,
        deviationPercent: deviation,
        phase: 'ALL',
        description: `Total power dropped ${Math.abs(deviation).toFixed(1)}% below normal (${totalPower.toFixed(0)}W vs ${avgTotalPower.toFixed(0)}W expected)`
      });
    }

    // Insert anomalies into database
    if (anomalies.length > 0) {
      const insertQuery = `
        INSERT INTO anomaly_detections (
          timestamp, device_id, site_type, anomaly_type, severity,
          metric_name, metric_value, expected_value, deviation_percent,
          phase, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
      `;

      for (const anomaly of anomalies) {
        await pool.query(insertQuery, [
          anomaly.timestamp, anomaly.deviceId, anomaly.siteType,
          anomaly.anomalyType, anomaly.severity, anomaly.metricName,
          anomaly.metricValue, anomaly.expectedValue, anomaly.deviationPercent,
          anomaly.phase, anomaly.description
        ]);
      }
    }

    return anomalies;
  } catch (error) {
    console.error('Error detecting anomalies:', error.message);
    return [];
  }
}

/**
 * Process all metrics for a new message
 */
export async function processMetrics(messageData) {
  try {
    const [powerQuality, energy, anomalies] = await Promise.all([
      calculatePowerQualityMetrics(messageData),
      calculateEnergyConsumption(messageData),
      detectAnomalies(messageData)
    ]);

    return {
      powerQuality,
      energy,
      anomalies,
      anomalyCount: anomalies.length
    };
  } catch (error) {
    console.error('Error processing metrics:', error.message);
    throw error;
  }
}

/**
 * Get latest metrics for a device
 */
export async function getLatestMetrics(deviceId) {
  const query = `
    SELECT
      pq.*,
      ec.energy_kwh_total,
      ec.demand_kw_total,
      ec.peak_demand_kw,
      ec.load_factor
    FROM power_quality_metrics pq
    LEFT JOIN energy_consumption ec ON
      pq.device_id = ec.device_id AND
      pq.timestamp = ec.timestamp
    WHERE pq.device_id = $1
    ORDER BY pq.timestamp DESC
    LIMIT 1;
  `;

  try {
    const result = await pool.query(query, [deviceId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching latest metrics:', error.message);
    throw error;
  }
}

/**
 * Get metrics history for a device
 */
export async function getMetricsHistory(deviceId, hours = 24, limit = 100) {
  const query = `
    SELECT
      pq.timestamp,
      pq.power_factor_total,
      pq.apparent_power_total,
      pq.voltage_imbalance,
      pq.current_imbalance,
      pq.power_imbalance,
      ec.energy_kwh_total,
      ec.demand_kw_total
    FROM power_quality_metrics pq
    LEFT JOIN energy_consumption ec ON
      pq.device_id = ec.device_id AND
      pq.timestamp = ec.timestamp
    WHERE pq.device_id = $1
      AND pq.timestamp > NOW() - INTERVAL '${hours} hours'
    ORDER BY pq.timestamp DESC
    LIMIT $2;
  `;

  try {
    const result = await pool.query(query, [deviceId, limit]);
    return result.rows;
  } catch (error) {
    console.error('Error fetching metrics history:', error.message);
    throw error;
  }
}
