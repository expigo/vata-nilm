import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SiteTabs } from './components/SiteTabs';
import { DeviceCard } from './components/DeviceCard';
import { ConnectionStatus } from './components/ConnectionStatus';

function App() {
  const [activeTab, setActiveTab] = useState('ALL');
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';
  
  const { isConnected, messages, error, subscribe } = useWebSocket(wsUrl);

  useEffect(() => {
    subscribe(activeTab);
  }, [activeTab, subscribe]);

  const deviceMap = new Map();
  messages.forEach(msg => {
    const deviceId = msg.device_id || msg.deviceId;
    if (!deviceMap.has(deviceId) || new Date(msg.timestamp) > new Date(deviceMap.get(deviceId).timestamp)) {
      deviceMap.set(deviceId, msg);
    }
  });

  const devices = Array.from(deviceMap.values());

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Tryvata NILM Dashboard
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Real-time energy monitoring
              </p>
            </div>
            <ConnectionStatus isConnected={isConnected} error={error} />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SiteTabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="mb-6 flex gap-4">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">Active Devices</p>
            <p className="text-2xl font-bold text-gray-900">{devices.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">Site Filter</p>
            <p className="text-2xl font-bold text-blue-600">{activeTab}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">Messages</p>
            <p className="text-2xl font-bold text-gray-900">{messages.length}</p>
          </div>
        </div>

        {devices.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-500">
              {isConnected ? 'Waiting for data...' : 'Connecting to server...'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.device_id || device.deviceId}
                deviceId={device.device_id || device.deviceId}
                siteType={device.site_type || device.siteType}
                timestamp={device.timestamp}
                data={device.raw_json || device.data}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
