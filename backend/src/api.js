import express from 'express';
import cors from 'cors';
import { getDeviceList, getLatestMessages } from './db.js';
import { getStats as getMqttStats } from './mqtt.js';
import { getConnectedClients } from './websocket.js';

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
  
  // Start server
  const server = app.listen(port, () => {
    console.log(`🚀 REST API server listening on port ${port}`);
  });
  
  return server;
}
