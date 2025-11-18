import nodemailer from 'nodemailer';
import pool from './db.js';
import { alertEvents } from './alerts.js';
import { EventEmitter } from 'events';

/**
 * Notification Service
 * Handles WebSocket and Email notifications for alerts
 */

export const notificationEvents = new EventEmitter();

// Email transporter (configure with your SMTP settings)
let emailTransporter = null;

/**
 * Initialize notification service
 */
export function initializeNotificationService() {
  // Configure email transporter
  if (process.env.SMTP_HOST) {
    emailTransporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    console.log('✅ Email notification service initialized');
  } else {
    console.log('⚠️  Email notifications disabled (no SMTP configuration)');
  }

  // Listen for alert events
  alertEvents.on('alertTriggered', handleAlertTriggered);
  alertEvents.on('alertResolved', handleAlertResolved);

  console.log('✅ Notification service initialized');
}

/**
 * Handle alert triggered event
 */
async function handleAlertTriggered(alert) {
  console.log(`🔔 Alert triggered: ${alert.title} (ID: ${alert.id})`);

  // Get rule details to check notification settings
  const ruleQuery = `
    SELECT notify_websocket, notify_email, email_recipients
    FROM alert_rules
    WHERE id = $1;
  `;

  try {
    const ruleResult = await pool.query(ruleQuery, [alert.rule_id]);
    const rule = ruleResult.rows[0];

    if (!rule) {
      console.warn('Rule not found for alert:', alert.id);
      return;
    }

    // Send WebSocket notification
    if (rule.notify_websocket) {
      await sendWebSocketNotification(alert);
    }

    // Send email notification
    if (rule.notify_email && rule.email_recipients && rule.email_recipients.length > 0) {
      await sendEmailNotification(alert, rule.email_recipients);
    }
  } catch (error) {
    console.error('Error handling alert trigger:', error.message);
  }
}

/**
 * Handle alert resolved event
 */
async function handleAlertResolved(alert) {
  console.log(`✅ Alert resolved: ${alert.title} (ID: ${alert.id})`);

  // Send WebSocket notification for resolution
  await sendWebSocketNotification({
    ...alert,
    notificationType: 'alert_resolved'
  });
}

/**
 * Send WebSocket notification
 */
async function sendWebSocketNotification(alert) {
  try {
    // Emit event that will be picked up by WebSocket server
    notificationEvents.emit('newNotification', {
      type: alert.notificationType || 'alert_triggered',
      alertId: alert.id,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      deviceId: alert.device_id,
      siteType: alert.site_type,
      triggeredAt: alert.triggered_at,
      alertData: alert.alert_data,
      state: alert.state
    });

    // Log notification
    await logNotification(alert.id, 'websocket', null, 'sent');

    console.log(`📢 WebSocket notification sent for alert ${alert.id}`);
  } catch (error) {
    console.error('Error sending WebSocket notification:', error.message);
    await logNotification(alert.id, 'websocket', null, 'failed', error.message);
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(alert, recipients) {
  if (!emailTransporter) {
    console.warn('Email transporter not configured, skipping email notification');
    return;
  }

  try {
    const emailHtml = generateEmailHtml(alert);
    const emailText = generateEmailText(alert);

    const mailOptions = {
      from: process.env.SMTP_FROM || 'VATA NILM Dashboard <noreply@vata-nilm.local>',
      to: recipients.join(', '),
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      text: emailText,
      html: emailHtml,
    };

    const info = await emailTransporter.sendMail(mailOptions);

    console.log(`📧 Email sent to ${recipients.length} recipient(s): ${info.messageId}`);

    // Log each recipient
    for (const recipient of recipients) {
      await logNotification(alert.id, 'email', recipient, 'sent');
    }
  } catch (error) {
    console.error('Error sending email notification:', error.message);

    for (const recipient of recipients) {
      await logNotification(alert.id, 'email', recipient, 'failed', error.message);
    }
  }
}

/**
 * Generate email HTML
 */
function generateEmailHtml(alert) {
  const severityColors = {
    critical: '#dc2626',
    warning: '#f59e0b',
    info: '#3b82f6'
  };

  const severityColor = severityColors[alert.severity] || '#6b7280';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${alert.title}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: ${severityColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">⚠️ Alert Notification</h1>
  </div>

  <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: ${severityColor};">${alert.title}</h2>

    <div style="background-color: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <p style="margin: 0 0 10px 0;"><strong>Severity:</strong> <span style="color: ${severityColor}; text-transform: uppercase; font-weight: bold;">${alert.severity}</span></p>
      <p style="margin: 0 0 10px 0;"><strong>Device:</strong> ${alert.device_id}</p>
      <p style="margin: 0 0 10px 0;"><strong>Site:</strong> ${alert.site_type}</p>
      <p style="margin: 0;"><strong>Triggered At:</strong> ${new Date(alert.triggered_at).toLocaleString()}</p>
    </div>

    <div style="background-color: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <h3 style="margin-top: 0;">Details</h3>
      <p style="margin: 0;">${alert.message}</p>
    </div>

    ${alert.alert_data ? `
    <div style="background-color: white; padding: 15px; border-radius: 6px; margin-bottom: 15px;">
      <h3 style="margin-top: 0;">Additional Information</h3>
      <pre style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px;">${JSON.stringify(alert.alert_data, null, 2)}</pre>
    </div>
    ` : ''}

    <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 14px;">
      <p>This is an automated notification from VATA NILM Dashboard.</p>
      <p>Alert ID: ${alert.id}</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generate email plain text
 */
function generateEmailText(alert) {
  let text = `
ALERT NOTIFICATION
==================

Title: ${alert.title}
Severity: ${alert.severity.toUpperCase()}
Device: ${alert.device_id}
Site: ${alert.site_type}
Triggered At: ${new Date(alert.triggered_at).toLocaleString()}

Details
-------
${alert.message}
`;

  if (alert.alert_data) {
    text += `\n\nAdditional Information\n----------------------\n${JSON.stringify(alert.alert_data, null, 2)}`;
  }

  text += `\n\n---\nThis is an automated notification from VATA NILM Dashboard.
Alert ID: ${alert.id}`;

  return text.trim();
}

/**
 * Log notification to database
 */
async function logNotification(alertId, notificationType, recipient, status, errorMessage = null) {
  const query = `
    INSERT INTO notification_log (alert_id, notification_type, recipient, status, error_message, sent_at)
    VALUES ($1, $2, $3, $4, $5, $6);
  `;

  try {
    await pool.query(query, [
      alertId,
      notificationType,
      recipient,
      status,
      errorMessage,
      status === 'sent' ? new Date() : null
    ]);
  } catch (error) {
    console.error('Error logging notification:', error.message);
  }
}

/**
 * Test email configuration
 */
export async function testEmailConfiguration(testRecipient) {
  if (!emailTransporter) {
    throw new Error('Email transporter not configured');
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || 'VATA NILM Dashboard <noreply@vata-nilm.local>',
    to: testRecipient,
    subject: 'VATA NILM Dashboard - Email Test',
    text: 'This is a test email from VATA NILM Dashboard. If you received this, email notifications are working correctly!',
    html: `
      <h1>Email Test</h1>
      <p>This is a test email from VATA NILM Dashboard.</p>
      <p>If you received this, email notifications are working correctly!</p>
      <p><em>Sent at: ${new Date().toLocaleString()}</em></p>
    `
  };

  const info = await emailTransporter.sendMail(mailOptions);
  console.log('Test email sent:', info.messageId);

  return {
    success: true,
    messageId: info.messageId,
    recipient: testRecipient
  };
}

/**
 * Get notification statistics
 */
export async function getNotificationStatistics(hours = 24) {
  const query = `
    SELECT
      notification_type,
      status,
      COUNT(*) as count
    FROM notification_log
    WHERE created_at > NOW() - INTERVAL '${hours} hours'
    GROUP BY notification_type, status;
  `;

  const result = await pool.query(query);
  return result.rows;
}

/**
 * Get failed notifications
 */
export async function getFailedNotifications(limit = 50) {
  const query = `
    SELECT
      nl.*,
      a.title as alert_title,
      a.severity
    FROM notification_log nl
    JOIN alerts a ON nl.alert_id = a.id
    WHERE nl.status = 'failed'
    ORDER BY nl.created_at DESC
    LIMIT $1;
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

/**
 * Retry failed notification
 */
export async function retryFailedNotification(notificationLogId) {
  const query = `
    SELECT
      nl.*,
      a.*
    FROM notification_log nl
    JOIN alerts a ON nl.alert_id = a.id
    WHERE nl.id = $1;
  `;

  const result = await pool.query(query, [notificationLogId]);
  const notification = result.rows[0];

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (notification.notification_type === 'email') {
    const ruleQuery = `SELECT email_recipients FROM alert_rules WHERE id = $1`;
    const ruleResult = await pool.query(ruleQuery, [notification.rule_id]);
    const recipients = ruleResult.rows[0]?.email_recipients || [];

    await sendEmailNotification(notification, recipients);
  } else if (notification.notification_type === 'websocket') {
    await sendWebSocketNotification(notification);
  }

  return { success: true };
}
