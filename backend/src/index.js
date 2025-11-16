import dotenv from 'dotenv';
import { testConnection } from './db.js';
import { connectMQTT, disconnectMQTT } from './mqtt.js';
import { createWebSocketServer, closeWebSocketServer } from './websocket.js';
import { createAPIServer } from './api.js';

dotenv.config();

console.log('🚀 Starting Tryvata NILM Backend...\n');

// Test database connection
console.log('1️⃣ Testing database connection...');
const dbConnected = await testConnection();

if (!dbConnected) {
  console.error('❌ Failed to connect to database. Exiting.');
  process.exit(1);
}

// Start MQTT subscriber
console.log('\n2️⃣ Starting MQTT subscriber...');
const mqttClient = connectMQTT();

// Start WebSocket server
console.log('\n3️⃣ Starting WebSocket server...');
const wsPort = parseInt(process.env.WS_PORT) || 3002;
createWebSocketServer(wsPort);

// Start REST API server
console.log('\n4️⃣ Starting REST API server...');
const apiPort = parseInt(process.env.API_PORT) || 3001;
createAPIServer(apiPort);

console.log('\n✅ All services started successfully!');
console.log('\n📊 System Info:');
console.log(`   - REST API: http://localhost:${apiPort}`);
console.log(`   - WebSocket: ws://localhost:${wsPort}`);
console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('\n👉 Press Ctrl+C to stop\n');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  disconnectMQTT();
  closeWebSocketServer();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  disconnectMQTT();
  closeWebSocketServer();
  process.exit(0);
});
