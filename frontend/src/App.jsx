import { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SiteTabs } from './components/SiteTabs';
import { DeviceCard } from './components/DeviceCard';
import { ConnectionStatus } from './components/ConnectionStatus';
import { RealtimeChart } from './components/RealtimeChart';
import { ChartSelector } from './components/ChartSelector';
import { InfoPanel } from './components/InfoPanel';
import { DebugPanel } from './components/DebugPanel';

function App() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [selectedDevice, setSelectedDevice] = useState('');
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';
  
  const { isConnected, messages, error, subscribe } = useWebSocket(wsUrl);

  useEffect(() => {
    subscribe(activeTab);
    setSelectedDevice('');
  }, [activeTab, subscribe]);

  const { devices, deviceIds } = useMemo(() => {
    const deviceMap = new Map();
    
    const filteredMessages = messages.filter(msg => {
      const siteType = msg.site_type || msg.siteType;
      if (activeTab === 'ALL') return true;
      return siteType === activeTab;
    });
    
    filteredMessages.forEach(msg => {
      const deviceId = msg.device_id || msg.deviceId;
      if (!deviceMap.has(deviceId) || new Date(msg.timestamp) > new Date(deviceMap.get(deviceId).timestamp)) {
        deviceMap.set(deviceId, msg);
      }
    });

    const sortedDevices = Array.from(deviceMap.values()).sort((a, b) => {
      const idA = a.device_id || a.deviceId;
      const idB = b.device_id || b.deviceId;
      return idA.localeCompare(idB);
    });

    const ids = sortedDevices.map(d => d.device_id || d.deviceId);

    return { devices: sortedDevices, deviceIds: ids };
  }, [messages, activeTab]);

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

        <InfoPanel />

        <ChartSelector
          selectedMetric={selectedMetric}
          onMetricChange={setSelectedMetric}
          selectedDevice={selectedDevice}
          onDeviceChange={setSelectedDevice}
          devices={deviceIds}
          activeTab={activeTab}
        />

        <RealtimeChart
          messages={messages}
          deviceId={selectedDevice}
          metric={selectedMetric}
        />

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Device Status</h2>
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
        </div>
      </main>

      {/* Debug Panel - shows memory usage */}
      <DebugPanel messageCount={messages.length} deviceCount={devices.length} />
    </div>
  );
}

export default App;
