import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { insertMessage, categorizeDevice } from './db.js';

dotenv.config();

let client = null;
let messageCount = 0;
let errorCount = 0;

// Event emitter for broadcasting to WebSocket
import { EventEmitter } from 'events';
export const mqttEvents = new EventEmitter();

// Connect to MQTT broker
export function connectMQTT() {
  const options = {
    host: process.env.MQTT_HOST || 'localhost',
    port: parseInt(process.env.MQTT_PORT) || 1883,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `tryvata_subscriber_${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
  };

  console.log(`🔌 Connecting to MQTT broker at ${options.host}:${options.port}...`);
  console.log(`   Username: ${options.username}`);
  console.log(`   Client ID: ${options.clientId}`);
  
  client = mqtt.connect(options);

  // Connection successful
  client.on('connect', () => {
    console.log('✅ Connected to MQTT broker');
    
    // Subscribe to all topics
    const topic = process.env.MQTT_TOPIC || 'samalinux/#';
    console.log(`📡 Subscribing to topic: "${topic}"`);
    
    client.subscribe(topic, (err) => {
      if (err) {
        console.error('❌ Failed to subscribe to topic:', topic, err);
      } else {
        console.log(`✅ Successfully subscribed to: ${topic}`);
        console.log('⏳ Waiting for messages...');
      }
    });
  });

  // Receive messages
  client.on('message', (topic, message) => {
    console.log(`📨 Received message on topic: ${topic}`);
    handleMessage(topic, message);
  });

  // Connection errors
  client.on('error', (err) => {
    console.error('❌ MQTT connection error:', err.message);
    errorCount++;
  });

  // Reconnecting
  client.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT broker...');
  });

  // Disconnected
  client.on('close', () => {
    console.log('⚠️  MQTT connection closed');
  });

  return client;
}

// Handle incoming MQTT message
async function handleMessage(topic, message) {
  try {
    console.log(`🔍 Processing message from topic: ${topic}`);
    
    // Parse JSON message
    const messageStr = message.toString();
    console.log(`   Message length: ${messageStr.length} bytes`);
    
    const payload = JSON.parse(messageStr);
    console.log(`   Parsed JSON successfully`);
    
    // Extract device ID
    const deviceId = payload.NMID_SYSID || 'unknown';
    console.log(`   Device ID: ${deviceId}`);
    
    // Categorize device
    const siteType = categorizeDevice(deviceId);
    console.log(`   Site Type: ${siteType}`);
    
    // Parse timestamp
    const timestamp = new Date(payload.FILE_datetime || Date.now());
    
    // Prepare message data
    const messageData = {
      timestamp,
      deviceId,
      siteType,
      topic,
      rawJson: payload
    };
    
    // Insert into database
    console.log(`   💾 Inserting into database...`);
    await insertMessage(messageData);
    
    messageCount++;
    console.log(`✅ Message #${messageCount} processed successfully`);
    
    // Emit event for WebSocket broadcasting
    mqttEvents.emit('newMessage', messageData);
    
  } catch (error) {
    errorCount++;
    console.error('❌ Error processing message:', error.message);
    console.error('   Stack:', error.stack);
    
    // Log message details
    console.error('   Topic:', topic);
    console.error('   Message preview:', message.toString().substring(0, 200));
  }
}

// Disconnect from MQTT
export function disconnectMQTT() {
  if (client) {
    client.end();
    console.log('👋 Disconnected from MQTT broker');
  }
}

// Get statistics
export function getStats() {
  return {
    messageCount,
    errorCount,
    connected: client && client.connected
  };
}
