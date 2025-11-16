import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Create connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'nilm_data',
  user: process.env.DB_USER || process.env.USER,
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected database error:', err);
  process.exit(-1);
});

// Device categorization function
export function categorizeDevice(deviceId) {
  if (!deviceId) return 'OTHER';
  
  const id = deviceId.toLowerCase();
  
  // KROL devices (including siemonska_deye PV installation)
  if (id.includes('krol') || id.includes('siemonska_deye')) {
    return 'KROL';
  }
  
  // MOSIR devices
  if (id.includes('mosir')) {
    return 'MOSIR';
  }
  
  return 'OTHER';
}

// Insert MQTT message into database
export async function insertMessage(messageData) {
  const { timestamp, deviceId, siteType, topic, rawJson } = messageData;
  
  const query = `
    INSERT INTO mqtt_messages (timestamp, device_id, site_type, topic, raw_json)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (timestamp, device_id) DO NOTHING
    RETURNING *;
  `;
  
  try {
    const result = await pool.query(query, [
      timestamp,
      deviceId,
      siteType,
      topic,
      rawJson
    ]);
    return result.rows[0];
  } catch (error) {
    console.error('Error inserting message:', error.message);
    throw error;
  }
}

// Get latest messages for a site type
export async function getLatestMessages(siteType = 'ALL', limit = 50) {
  let query = `
    SELECT 
      timestamp,
      device_id,
      site_type,
      raw_json,
      created_at
    FROM mqtt_messages
  `;
  
  const params = [];
  
  if (siteType !== 'ALL') {
    query += ' WHERE site_type = $1';
    params.push(siteType);
  }
  
  query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Error fetching latest messages:', error.message);
    throw error;
  }
}

// Get list of all known devices
export async function getDeviceList() {
  const query = `
    SELECT DISTINCT
      device_id,
      site_type,
      MAX(timestamp) as last_seen
    FROM mqtt_messages
    GROUP BY device_id, site_type
    ORDER BY site_type, device_id;
  `;
  
  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (error) {
    console.error('Error fetching device list:', error.message);
    throw error;
  }
}

// Test database connection
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now, version() as version');
    console.log('✅ Database connection test successful');
    console.log('   Server time:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
}

export default pool;
