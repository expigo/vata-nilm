import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
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
import {
  authenticateUser,
  logoutUser,
  verifySession,
  getUserById,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
  changePassword,
  getUserPreferences,
  updateUserPreferences,
  getAccessibleSites
} from './auth.js';
import {
  authenticate,
  requireRole,
  filterSiteAccess,
  optionalAuth,
  rateLimit
} from './authMiddleware.js';
import {
  getHistoricalData,
  getEnergyAnalysis,
  getPowerQualityAnalysis,
  getAnomaliesAnalysis,
  getAlertAnalysis,
  getDeviceStatistics,
  generateReport,
  saveReport,
  getSavedReports,
  getSavedReportById,
  deleteSavedReport,
  getComparisonData
} from './historical.js';
import pool from './db.js';

export function createAPIServer(port = 3001) {
  const app = express();

  // Middleware
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true
  }));
  app.use(express.json());
  app.use(cookieParser());
  
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

  // ============================================================================
  // AUTHENTICATION ENDPOINTS
  // ============================================================================

  // Login
  app.post('/api/auth/login', rateLimit(), async (req, res) => {
    try {
      const { username, password } = req.body;
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username and password are required'
        });
      }

      const authResult = await authenticateUser(username, password, ipAddress, userAgent);

      // Set HTTP-only cookie for token
      res.cookie('token', authResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      res.json({
        success: true,
        user: authResult.user,
        token: authResult.token,
        refreshToken: authResult.refreshToken
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({
        success: false,
        error: error.message
      });
    }
  });

  // Logout
  app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
      await logoutUser(req.user.id);
      res.clearCookie('token');

      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get current user
  app.get('/api/auth/me', authenticate, async (req, res) => {
    try {
      const user = await getUserById(req.user.id);
      const preferences = await getUserPreferences(req.user.id);

      res.json({
        success: true,
        user: {
          ...user,
          preferences
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Verify session (check if logged in)
  app.get('/api/auth/verify', optionalAuth, (req, res) => {
    if (req.user) {
      res.json({
        success: true,
        authenticated: true,
        user: req.user
      });
    } else {
      res.json({
        success: true,
        authenticated: false
      });
    }
  });

  // ============================================================================
  // USER MANAGEMENT ENDPOINTS (ADMIN ONLY)
  // ============================================================================

  // Get all users
  app.get('/api/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
      const users = await getAllUsers();

      res.json({
        success: true,
        count: users.length,
        users
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create user
  app.post('/api/users', authenticate, requireRole('admin'), async (req, res) => {
    try {
      const user = await createUser({
        ...req.body,
        createdBy: req.user.id
      });

      res.status(201).json({
        success: true,
        user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Update user
  app.put('/api/users/:userId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const { userId } = req.params;

      // Users can only update themselves unless they're admin
      if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own profile'
        });
      }

      const user = await updateUser(parseInt(userId), req.body);

      res.json({
        success: true,
        user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Change password
  app.post('/api/users/:userId/password', authenticate, async (req, res) => {
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;

      // Users can only change their own password
      if (req.user.id !== parseInt(userId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only change your own password'
        });
      }

      await changePassword(parseInt(userId), currentPassword, newPassword);

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  });

  // Delete user
  app.delete('/api/users/:userId', authenticate, requireRole('admin'), async (req, res) => {
    try {
      const { userId } = req.params;
      const deleted = await deleteUser(parseInt(userId));

      res.json({
        success: true,
        deleted
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get user preferences
  app.get('/api/users/:userId/preferences', authenticate, async (req, res) => {
    try {
      const { userId } = req.params;

      if (req.user.id !== parseInt(userId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own preferences'
        });
      }

      const preferences = await getUserPreferences(parseInt(userId));

      res.json({
        success: true,
        preferences
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Update user preferences
  app.put('/api/users/:userId/preferences', authenticate, async (req, res) => {
    try {
      const { userId } = req.params;

      if (req.user.id !== parseInt(userId)) {
        return res.status(403).json({
          success: false,
          error: 'You can only update your own preferences'
        });
      }

      const preferences = await updateUserPreferences(parseInt(userId), req.body);

      res.json({
        success: true,
        preferences
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // HISTORICAL DATA ENDPOINTS
  // ============================================================================

  // Get historical raw data
  app.get('/api/historical/data', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        limit: parseInt(req.query.limit) || 1000,
        offset: parseInt(req.query.offset) || 0
      };

      const data = await getHistoricalData(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get energy analysis
  app.get('/api/historical/energy', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        groupBy: req.query.groupBy || 'hour'
      };

      const data = await getEnergyAnalysis(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get power quality analysis
  app.get('/api/historical/power-quality', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        groupBy: req.query.groupBy || 'hour'
      };

      const data = await getPowerQualityAnalysis(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get anomalies analysis
  app.get('/api/historical/anomalies', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        severity: req.query.severity,
        anomalyType: req.query.anomalyType
      };

      const data = await getAnomaliesAnalysis(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get alert analysis
  app.get('/api/historical/alerts', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        severity: req.query.severity,
        state: req.query.state
      };

      const data = await getAlertAnalysis(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get device statistics
  app.get('/api/historical/device-stats', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const data = await getDeviceStatistics(filters);

      res.json({
        success: true,
        count: data.length,
        filters,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Generate report
  app.post('/api/historical/reports/generate', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const reportConfig = {
        ...req.body,
        siteType: req.body.siteType || req.user.siteAccess
      };

      const reportData = await generateReport(reportConfig);

      res.json({
        success: true,
        reportData
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Save report
  app.post('/api/historical/reports', authenticate, async (req, res) => {
    try {
      const { reportConfig, reportData } = req.body;

      const saved = await saveReport(req.user.id, reportConfig, reportData);

      res.json({
        success: true,
        report: saved
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get saved reports
  app.get('/api/historical/reports', authenticate, async (req, res) => {
    try {
      const reports = await getSavedReports(req.user.id);

      res.json({
        success: true,
        count: reports.length,
        reports
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get saved report by ID
  app.get('/api/historical/reports/:reportId', authenticate, async (req, res) => {
    try {
      const { reportId } = req.params;
      const report = await getSavedReportById(parseInt(reportId), req.user.id);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: 'Report not found or access denied'
        });
      }

      res.json({
        success: true,
        report
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Delete saved report
  app.delete('/api/historical/reports/:reportId', authenticate, async (req, res) => {
    try {
      const { reportId } = req.params;
      const deleted = await deleteSavedReport(parseInt(reportId), req.user.id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Report not found or access denied'
        });
      }

      res.json({
        success: true,
        deleted
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get comparison data
  app.get('/api/historical/comparison', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const filters = {
        siteType: req.query.siteType || req.user.siteAccess,
        deviceIds: req.query.deviceIds ? req.query.deviceIds.split(',') : null,
        currentStart: req.query.currentStart,
        currentEnd: req.query.currentEnd,
        previousStart: req.query.previousStart,
        previousEnd: req.query.previousEnd
      };

      const data = await getComparisonData(filters);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ============================================================================
  // PROTECTED DATA ENDPOINTS
  // ============================================================================

  // Get all devices (now protected)
  app.get('/api/devices', authenticate, filterSiteAccess, async (req, res) => {
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
  
  // Get latest data for a site type (now protected)
  app.get('/api/data/:siteType', authenticate, filterSiteAccess, async (req, res) => {
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
  // METRICS ENDPOINTS (PROTECTED)
  // ============================================================================

  // Get latest metrics for a device
  app.get('/api/metrics/device/:deviceId', authenticate, async (req, res) => {
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
  app.get('/api/metrics/history/:deviceId', authenticate, async (req, res) => {
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
  app.get('/api/metrics/summary/:siteType?', authenticate, filterSiteAccess, async (req, res) => {
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
  app.get('/api/metrics/energy/:siteType?', authenticate, filterSiteAccess, async (req, res) => {
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
  app.get('/api/metrics/anomalies/:deviceId?', authenticate, async (req, res) => {
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
  // ALERTS ENDPOINTS (PROTECTED)
  // ============================================================================

  // Get active alerts
  app.get('/api/alerts/active/:siteType?', authenticate, filterSiteAccess, async (req, res) => {
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
  app.get('/api/alerts/history', authenticate, filterSiteAccess, async (req, res) => {
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
  app.get('/api/alerts/statistics/:siteType?', authenticate, filterSiteAccess, async (req, res) => {
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
  app.post('/api/alerts/:alertId/acknowledge', authenticate, async (req, res) => {
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
  app.post('/api/alerts/:alertId/dismiss', authenticate, async (req, res) => {
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
  app.post('/api/alerts/:alertId/resolve', authenticate, async (req, res) => {
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
  app.get('/api/alerts/rules', authenticate, async (req, res) => {
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
  app.post('/api/alerts/rules', authenticate, requireRole('admin', 'manager'), async (req, res) => {
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
  app.put('/api/alerts/rules/:ruleId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
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
  app.delete('/api/alerts/rules/:ruleId', authenticate, requireRole('admin', 'manager'), async (req, res) => {
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

  // ============================================================================
  // NILM ENDPOINTS (Energy Disaggregation)
  // ============================================================================

  const nilm = await import('./nilm.js');

  // Check NILM service health
  app.get('/api/nilm/health', async (req, res) => {
    try {
      const health = await nilm.checkNILMServiceHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Real-time disaggregation
  app.post('/api/nilm/disaggregate/realtime', authenticate, async (req, res) => {
    try {
      const { reading, algorithms } = req.body;

      const results = await nilm.disaggregateRealtime(
        reading,
        algorithms,
        req.user.id
      );

      res.json({
        success: true,
        results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Historical disaggregation
  app.post('/api/nilm/disaggregate/historical', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const { deviceId, siteType, startTimestamp, endTimestamp, algorithms } = req.body;

      const job = await nilm.disaggregateHistorical(
        deviceId,
        siteType || req.user.siteAccess,
        startTimestamp,
        endTimestamp,
        algorithms,
        req.user.id
      );

      res.json({
        success: true,
        job
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get job status
  app.get('/api/nilm/jobs/:jobId', authenticate, async (req, res) => {
    try {
      const { jobId } = req.params;
      const status = await nilm.getJobStatus(jobId);

      res.json({
        success: true,
        status
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get appliances
  app.get('/api/nilm/appliances', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const { isGlobal } = req.query;
      const siteType = req.query.siteType || req.user.siteAccess;

      const result = await nilm.getAppliances(
        req.user.id,
        siteType,
        isGlobal === 'true'
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get appliance categories
  app.get('/api/nilm/appliances/categories', async (req, res) => {
    try {
      const result = await nilm.getApplianceCategories();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Create label
  app.post('/api/nilm/labels', authenticate, async (req, res) => {
    try {
      const labelData = {
        ...req.body,
        user_id: req.user.id
      };

      const result = await nilm.createLabel(labelData);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get user labels
  app.get('/api/nilm/labels', authenticate, async (req, res) => {
    try {
      const { deviceId, applianceId } = req.query;

      const result = await nilm.getUserLabels(
        req.user.id,
        deviceId,
        applianceId ? parseInt(applianceId) : null
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get models
  app.get('/api/nilm/models', authenticate, async (req, res) => {
    try {
      const { algorithm } = req.query;

      const result = await nilm.getModels(algorithm, req.user.id);
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Train model
  app.post('/api/nilm/models/train', authenticate, requireRole('admin', 'manager'), async (req, res) => {
    try {
      const trainingConfig = {
        ...req.body,
        user_id: req.user.id
      };

      const job = await nilm.trainModel(trainingConfig);
      res.json({
        success: true,
        job
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get appliance statistics
  app.get('/api/nilm/stats/appliances/:deviceId', authenticate, filterSiteAccess, async (req, res) => {
    try {
      const { deviceId } = req.params;
      const { days, algorithm } = req.query;
      const siteType = req.query.siteType || req.user.siteAccess;

      const result = await nilm.getApplianceStats(
        deviceId,
        siteType,
        days ? parseInt(days) : 30,
        algorithm
      );

      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get algorithm performance
  app.get('/api/nilm/stats/algorithms', authenticate, async (req, res) => {
    try {
      const result = await nilm.getAlgorithmPerformance();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Get available datasets
  app.get('/api/nilm/datasets', authenticate, async (req, res) => {
    try {
      const result = await nilm.getAvailableDatasets();
      res.json(result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // Download dataset
  app.post('/api/nilm/datasets/download', authenticate, requireRole('admin'), async (req, res) => {
    try {
      const { datasetName } = req.body;
      const result = await nilm.downloadDataset(datasetName);

      res.json({
        success: true,
        result
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
