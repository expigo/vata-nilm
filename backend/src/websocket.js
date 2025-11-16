import { WebSocketServer } from 'ws';
import { mqttEvents } from './mqtt.js';
import { getLatestMessages } from './db.js';

let wss = null;
const clients = new Map(); // Track clients and their subscriptions

export function createWebSocketServer(port = 3002) {
  wss = new WebSocketServer({ port });
  
  console.log(`🔌 WebSocket server listening on port ${port}`);
  
  wss.on('connection', handleConnection);
  
  // Listen for new MQTT messages and broadcast
  mqttEvents.on('newMessage', broadcastMessage);
  
  return wss;
}

async function handleConnection(ws) {
  const clientId = Math.random().toString(36).substring(7);
  
  // Store client with default subscription (ALL)
  clients.set(ws, { id: clientId, subscription: 'ALL' });
  
  console.log(`✅ WebSocket client connected: ${clientId}`);
  
  // Send initial data (last 50 messages)
  try {
    const initialData = await getLatestMessages('ALL', 50);
    ws.send(JSON.stringify({
      type: 'initial_state',
      data: initialData,
      count: initialData.length
    }));
  } catch (error) {
    console.error('Error sending initial state:', error.message);
  }
  
  // Handle incoming messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      handleClientMessage(ws, data);
    } catch (error) {
      console.error('Error parsing client message:', error.message);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    const client = clients.get(ws);
    console.log(`👋 WebSocket client disconnected: ${client?.id || 'unknown'}`);
    clients.delete(ws);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
}

function handleClientMessage(ws, data) {
  const client = clients.get(ws);
  
  switch (data.type) {
    case 'subscribe':
      // Update client subscription (ALL, KROL, MOSIR)
      const siteType = data.siteType || 'ALL';
      client.subscription = siteType;
      console.log(`📡 Client ${client.id} subscribed to: ${siteType}`);
      
      // Send latest messages for this subscription
      getLatestMessages(siteType, 50)
        .then(messages => {
          ws.send(JSON.stringify({
            type: 'subscription_update',
            siteType,
            data: messages,
            count: messages.length
          }));
        })
        .catch(error => {
          console.error('Error fetching messages for subscription:', error);
        });
      break;
      
    case 'ping':
      // Respond to ping with pong
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
      
    default:
      console.log(`Unknown message type from client ${client.id}:`, data.type);
  }
}

function broadcastMessage(messageData) {
  const { siteType, deviceId, timestamp, rawJson } = messageData;
  
  // Prepare broadcast message
  const broadcastData = {
    type: 'new_message',
    siteType,
    deviceId,
    timestamp,
    data: rawJson
  };
  
  // Send to all connected clients with matching subscription
  let sentCount = 0;
  clients.forEach((client, ws) => {
    if (ws.readyState === ws.OPEN) {
      // Send if client is subscribed to ALL or matching site type
      if (client.subscription === 'ALL' || client.subscription === siteType) {
        ws.send(JSON.stringify(broadcastData));
        sentCount++;
      }
    }
  });
  
  if (sentCount > 0) {
    // Log occasionally
    if (Math.random() < 0.1) { // 10% of messages
      console.log(`📤 Broadcast message to ${sentCount} client(s)`);
    }
  }
}

export function getConnectedClients() {
  return clients.size;
}

export function closeWebSocketServer() {
  if (wss) {
    wss.close();
    console.log('👋 WebSocket server closed');
  }
}
