import express from 'express';
import cors from 'cors';
import { getDeviceList, getLatestMessages } from './db.js';
import { getStats as getMqttStats } from './mqtt.js';
import { getConnectedClients } from './websocket.js';
import { getLatestMetrics, getMetricsHistory } from './metrics.js';
import {
  getActiveAlerts,
  getAlertHistory,
  getAlertStatistics,
  acknowledgeAlert,
  dismissAlert,
  resolveAlert
} from './alerts.js';
import pool from './db.js';

export function createAPIServer(port = 3001) {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mqtt: getMqttStats(),
      websocket: {
        connectedClients: getConnectedClients()
      }
    });
  });
  
  // Get all devices
  app.get('/api/devices', async (req, res) => {
    try {
      const devices = await getDeviceList();
      res.json({
        success: true,
        count: devices.length,
        devices
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
  
  // Get latest data for a site type
  app.get('/api/data/:siteType', async (req, res) => {
    try {
      const { siteType } = req.params;
      const limit = parseInt(req.query.limit) || 50;

      const messages = await getLatestMessages(siteType, limit);

      res.json({
        success: true,
        siteType,
        count: messages.length,
        data: messages
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // METRICS ENDPOINTS
  // ============================================================================

  // Get latest metrics for a device
  app.get('/api/metrics/device/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;
      const metrics = await getLatestMetrics(deviceId);

      res.json({
        success: true,
        deviceId,
        metrics
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get metrics history for a device
  app.get('/api/metrics/history/:deviceId', async (req, res) => {
    try {
      const { deviceId } = req.params;
      const hours = parseInt(req.query.hours) || 24;
      const limit = parseInt(req.query.limit) || 100;

      const history = await getMetricsHistory(deviceId, hours, limit);

      res.json({
        success: true,
        deviceId,
        hours,
        count: history.length,
        data: history
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get metrics summary for all devices
  app.get('/api/metrics/summary/:siteType?', async (req, res) => {
    try {
      const siteType = req.params.siteType || 'ALL';

      const query = `
        SELECT * FROM latest_metrics_view
        ${siteType !== 'ALL' ? "WHERE site_type = $1" : ''}
        ORDER BY device_id;
      `;

      const result = await pool.query(query, siteType !== 'ALL' ? [siteType] : []);

      res.json({
        success: true,
        siteType,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get energy summary
  app.get('/api/metrics/energy/:siteType?', async (req, res) => {
    try {
      const siteType = req.params.siteType || 'ALL';

      const query = `
        SELECT * FROM energy_summary_view
        ${siteType !== 'ALL' ? "WHERE site_type = $1" : ''}
        ORDER BY device_id;
      `;

      const result = await pool.query(query, siteType !== 'ALL' ? [siteType] : []);

      res.json({
        success: true,
        siteType,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get anomalies
  app.get('/api/metrics/anomalies/:deviceId?', async (req, res) => {
    try {
      const deviceId = req.params.deviceId;
      const hours = parseInt(req.query.hours) || 24;
      const severity = req.query.severity;

      let query = `
        SELECT * FROM anomaly_detections
        WHERE timestamp > NOW() - INTERVAL '${hours} hours'
      `;

      const params = [];
      let paramCount = 1;

      if (deviceId) {
        query += ` AND device_id = $${paramCount++}`;
        params.push(deviceId);
      }

      if (severity) {
        query += ` AND severity = $${paramCount++}`;
        params.push(severity);
      }

      query += ` ORDER BY timestamp DESC LIMIT 200;`;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        hours,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // ALERTS ENDPOINTS
  // ============================================================================

  // Get active alerts
  app.get('/api/alerts/active/:siteType?', async (req, res) => {
    try {
      const siteType = req.params.siteType || 'ALL';
      const limit = parseInt(req.query.limit) || 50;

      const alerts = await getActiveAlerts(siteType, limit);

      res.json({
        success: true,
        siteType,
        count: alerts.length,
        data: alerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get alert history
  app.get('/api/alerts/history', async (req, res) => {
    try {
      const filters = {
        deviceId: req.query.deviceId,
        siteType: req.query.siteType || 'ALL',
        severity: req.query.severity,
        state: req.query.state,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const limit = parseInt(req.query.limit) || 100;

      const alerts = await getAlertHistory(filters, limit);

      res.json({
        success: true,
        count: alerts.length,
        filters,
        data: alerts
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get alert statistics
  app.get('/api/alerts/statistics/:siteType?', async (req, res) => {
    try {
      const siteType = req.params.siteType || 'ALL';
      const hours = parseInt(req.query.hours) || 24;

      const stats = await getAlertStatistics(siteType, hours);

      res.json({
        success: true,
        siteType,
        hours,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Acknowledge alert
  app.post('/api/alerts/:alertId/acknowledge', async (req, res) => {
    try {
      const { alertId } = req.params;
      const { acknowledgedBy, note } = req.body;

      const alert = await acknowledgeAlert(parseInt(alertId), acknowledgedBy, note);

      res.json({
        success: true,
        alert
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Dismiss alert
  app.post('/api/alerts/:alertId/dismiss', async (req, res) => {
    try {
      const { alertId } = req.params;
      const { dismissedBy, note } = req.body;

      const alert = await dismissAlert(parseInt(alertId), dismissedBy, note);

      res.json({
        success: true,
        alert
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Resolve alert
  app.post('/api/alerts/:alertId/resolve', async (req, res) => {
    try {
      const { alertId } = req.params;
      const { note, performedBy } = req.body;

      const alert = await resolveAlert(parseInt(alertId), note, performedBy);

      res.json({
        success: true,
        alert
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get alert rules
  app.get('/api/alerts/rules', async (req, res) => {
    try {
      const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : null;

      let query = 'SELECT * FROM alert_rules';
      const params = [];

      if (enabled !== null) {
        query += ' WHERE enabled = $1';
        params.push(enabled);
      }

      query += ' ORDER BY name;';

      const result = await pool.query(query, params);

      res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create alert rule
  app.post('/api/alerts/rules', async (req, res) => {
    try {
      const {
        name,
        description,
        rule_type,
        site_type,
        device_id,
        conditions,
        severity,
        notify_websocket,
        notify_email,
        email_recipients,
        active_hours_start,
        active_hours_end,
        active_days,
        cooldown_minutes,
        auto_resolve,
        enabled
      } = req.body;

      const query = `
        INSERT INTO alert_rules (
          name, description, rule_type, site_type, device_id, conditions,
          severity, notify_websocket, notify_email, email_recipients,
          active_hours_start, active_hours_end, active_days,
          cooldown_minutes, auto_resolve, enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *;
      `;

      const result = await pool.query(query, [
        name, description, rule_type, site_type, device_id, conditions,
        severity, notify_websocket, notify_email, email_recipients,
        active_hours_start, active_hours_end, active_days,
        cooldown_minutes, auto_resolve, enabled
      ]);

      res.json({
        success: true,
        rule: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Update alert rule
  app.put('/api/alerts/rules/:ruleId', async (req, res) => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;

      const setClauses = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        setClauses.push(`${key} = $${paramCount++}`);
        values.push(value);
      }

      setClauses.push(`updated_at = NOW()`);

      values.push(ruleId);

      const query = `
        UPDATE alert_rules
        SET ${setClauses.join(', ')}
        WHERE id = $${paramCount}
        RETURNING *;
      `;

      const result = await pool.query(query, values);

      res.json({
        success: true,
        rule: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Delete alert rule
  app.delete('/api/alerts/rules/:ruleId', async (req, res) => {
    try {
      const { ruleId } = req.params;

      const query = 'DELETE FROM alert_rules WHERE id = $1 RETURNING *;';
      const result = await pool.query(query, [ruleId]);

      res.json({
        success: true,
        deleted: result.rows[0]
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Start server
  const server = app.listen(port, () => {
    console.log(`🚀 REST API server listening on port ${port}`);
  });
  
  return server;
}
