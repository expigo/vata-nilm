import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SiteTabs } from './components/SiteTabs';
import { DeviceCard } from './components/DeviceCard';
import { ConnectionStatus } from './components/ConnectionStatus';
import { RealtimeChart } from './components/RealtimeChart';
import { ChartSelector } from './components/ChartSelector';
import { InfoPanel } from './components/InfoPanel';
import { DebugPanel } from './components/DebugPanel';
import { AlertNotificationPanel } from './components/AlertNotificationPanel';
import { ToastContainer } from './components/ToastNotification';
import { MetricsPanel } from './components/MetricsPanel';

function App() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [activeView, setActiveView] = useState('devices'); // 'devices' or 'metrics'
  const [toasts, setToasts] = useState([]);
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';

  // Handle alert notifications from WebSocket
  const handleAlert = useCallback((alertData) => {
    // Add to toast notifications
    const toast = {
      id: `alert-${Date.now()}-${Math.random()}`,
      ...alertData
    };

    setToasts(prev => [...prev, toast]);

    // Play sound for critical alerts
    if (alertData.severity === 'critical') {
      playAlertSound();
    }
  }, []);

  const { isConnected, messages, error, subscribe } = useWebSocket(wsUrl, {
    onAlert: handleAlert
  });

  useEffect(() => {
    subscribe(activeTab);
    setSelectedDevice('');
  }, [activeTab, subscribe]);

  const removeToast = useCallback((toastId) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  const playAlertSound = () => {
    // Simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (err) {
      console.error('Failed to play alert sound:', err);
    }
  };

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
                Real-time energy monitoring & alerts
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ConnectionStatus isConnected={isConnected} error={error} />
              <AlertNotificationPanel siteType={activeTab} />
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SiteTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* View Switcher */}
        <div className="mb-6 flex items-center gap-4">
          <div className="flex-1 flex gap-4">
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

          {/* View Tabs */}
          <div className="flex bg-white rounded-lg border border-gray-200 p-1">
            <button
              onClick={() => setActiveView('devices')}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                activeView === 'devices'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              📊 Devices
            </button>
            <button
              onClick={() => setActiveView('metrics')}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                activeView === 'metrics'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              ⚡ Metrics & Alerts
            </button>
          </div>
        </div>

        {activeView === 'devices' && <InfoPanel />}

        {/* Devices View */}
        {activeView === 'devices' && (
          <>
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
          </>
        )}

        {/* Metrics & Alerts View */}
        {activeView === 'metrics' && (
          <MetricsPanel siteType={activeTab} />
        )}
      </main>

      {/* Debug Panel - shows memory usage */}
      <DebugPanel messageCount={messages.length} deviceCount={devices.length} />
    </div>
  );
}

export default App;
