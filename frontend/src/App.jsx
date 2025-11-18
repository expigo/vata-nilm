import { useState, useEffect, useMemo, useCallback } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/LoginPage';
import { UserProfilePage } from './components/UserProfilePage';
import { HistoricalDataViewer } from './components/HistoricalDataViewer';
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

function DashboardApp() {
  const { user, loading, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard'); // 'dashboard', 'profile', 'historical'
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedMetric, setSelectedMetric] = useState('power');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [activeView, setActiveView] = useState('devices');
  const [toasts, setToasts] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3002';

  // Set active tab based on user's site access
  useEffect(() => {
    if (user && user.siteAccess !== 'ALL') {
      setActiveTab(user.siteAccess);
    }
  }, [user]);

  const handleAlert = useCallback((alertData) => {
    const toast = {
      id: `alert-${Date.now()}-${Math.random()}`,
      ...alertData
    };

    setToasts(prev => [...prev, toast]);

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

  const handleLogout = async () => {
    await logout();
    setCurrentPage('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Tryvata NILM Dashboard
                </h1>
                <p className="text-sm text-gray-500 mt-1">
                  Real-time energy monitoring & alerts
                </p>
              </div>

              {/* Navigation */}
              <nav className="flex gap-2 ml-8">
                <button
                  onClick={() => setCurrentPage('dashboard')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                    currentPage === 'dashboard'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📊 Dashboard
                </button>
                <button
                  onClick={() => setCurrentPage('historical')}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition ${
                    currentPage === 'historical'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  📈 Historical Data
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <ConnectionStatus isConnected={isConnected} error={error} />
              <AlertNotificationPanel siteType={activeTab} />

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{user.username}</span>
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowUserMenu(false)}></div>
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-900">{user.full_name || user.username}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                            {user.role}
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                            {user.siteAccess}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setCurrentPage('profile');
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile Settings
                      </button>
                      <button
                        onClick={() => {
                          handleLogout();
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Profile Page */}
        {currentPage === 'profile' && <UserProfilePage />}

        {/* Historical Data Page */}
        {currentPage === 'historical' && <HistoricalDataViewer />}

        {/* Dashboard Page */}
        {currentPage === 'dashboard' && (
          <>
            <SiteTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              allowedSites={user.siteAccess === 'ALL' ? ['ALL', 'KROL', 'MOSIR', 'OTHER'] : [user.siteAccess]}
            />

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

            {activeView === 'metrics' && (
              <MetricsPanel siteType={activeTab} />
            )}
          </>
        )}
      </main>

      <DebugPanel messageCount={messages.length} deviceCount={devices.length} />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <DashboardApp />
    </AuthProvider>
  );
}

export default App;
