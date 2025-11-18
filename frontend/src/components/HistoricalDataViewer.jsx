import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function HistoricalDataViewer() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('energy');
  const [timeRange, setTimeRange] = useState('24h');
  const [groupBy, setGroupBy] = useState('hour');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [deviceStats, setDeviceStats] = useState(null);

  useEffect(() => {
    loadData();
  }, [activeTab, timeRange, groupBy]);

  const getDateRange = () => {
    const end = new Date();
    const start = new Date();

    switch (timeRange) {
      case '24h':
        start.setHours(start.getHours() - 24);
        break;
      case '7d':
        start.setDate(start.getDate() - 7);
        break;
      case '30d':
        start.setDate(start.getDate() - 30);
        break;
      case '90d':
        start.setDate(start.getDate() - 90);
        break;
      default:
        start.setHours(start.getHours() - 24);
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  };

  const loadData = async () => {
    setLoading(true);
    const { startDate, endDate } = getDateRange();

    try {
      let endpoint = '';
      const params = new URLSearchParams({
        siteType: user.siteAccess,
        startDate,
        endDate,
        groupBy
      });

      switch (activeTab) {
        case 'energy':
          endpoint = 'energy';
          break;
        case 'power-quality':
          endpoint = 'power-quality';
          break;
        case 'anomalies':
          endpoint = 'anomalies';
          break;
        case 'alerts':
          endpoint = 'alerts';
          break;
        default:
          endpoint = 'energy';
      }

      const response = await fetch(`${API_URL}/api/historical/${endpoint}?${params}`, {
        credentials: 'include'
      });

      const result = await response.json();

      if (result.success) {
        setData(result.data);
      }

      // Load device stats
      if (activeTab === 'energy') {
        const statsResponse = await fetch(`${API_URL}/api/historical/device-stats?${params}`, {
          credentials: 'include'
        });
        const statsResult = await statsResponse.json();
        if (statsResult.success) {
          setDeviceStats(statsResult.data);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatChartData = () => {
    if (!data || data.length === 0) return [];

    return data.map(item => ({
      timestamp: new Date(item.period || item.date || item.timestamp).toLocaleString(),
      ...item
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Historical Data Analysis</h1>
        <p className="text-gray-600">View and analyze historical energy data for {user.siteAccess}</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Time Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>

          {/* Group By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Group By</label>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </div>

          {/* Refresh Button */}
          <div className="flex items-end">
            <button
              onClick={loadData}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('energy')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                activeTab === 'energy'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              ⚡ Energy Analysis
            </button>
            <button
              onClick={() => setActiveTab('power-quality')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                activeTab === 'power-quality'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              📊 Power Quality
            </button>
            <button
              onClick={() => setActiveTab('anomalies')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                activeTab === 'anomalies'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              ⚠️ Anomalies
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition ${
                activeTab === 'alerts'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              🔔 Alert History
            </button>
          </nav>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600">Loading data...</p>
            </div>
          ) : (
            <>
              {/* Energy Analysis Tab */}
              {activeTab === 'energy' && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-gray-800">Energy Consumption Analysis</h2>

                  {/* Device Stats Summary */}
                  {deviceStats && deviceStats.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {deviceStats.map((device) => (
                        <div key={device.device_id} className="bg-gray-50 rounded-lg p-4">
                          <h3 className="font-medium text-gray-800 mb-2">{device.device_id}</h3>
                          <div className="space-y-1 text-sm">
                            <p className="text-gray-600">
                              <span className="font-medium">Total Messages:</span> {device.total_messages}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Days Active:</span> {device.days_active}
                            </p>
                            <p className="text-gray-600">
                              <span className="font-medium">Last Seen:</span>{' '}
                              {new Date(device.last_seen).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Energy Chart */}
                  {data && data.length > 0 ? (
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={formatChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="timestamp" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="energy_consumed" stroke="#3b82f6" name="Energy (kWh)" />
                          <Line type="monotone" dataKey="avg_demand" stroke="#10b981" name="Avg Demand (kW)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No data available for the selected time range
                    </div>
                  )}
                </div>
              )}

              {/* Power Quality Tab */}
              {activeTab === 'power-quality' && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-gray-800">Power Quality Metrics</h2>

                  {data && data.length > 0 ? (
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={formatChartData()}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="timestamp" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="avg_power_factor" stroke="#8b5cf6" name="Power Factor" />
                          <Line type="monotone" dataKey="avg_voltage_imbalance" stroke="#ef4444" name="Voltage Imbalance %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No data available for the selected time range
                    </div>
                  )}
                </div>
              )}

              {/* Anomalies Tab */}
              {activeTab === 'anomalies' && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-gray-800">Anomaly Detection History</h2>

                  {data && data.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Deviation</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {data.map((anomaly, idx) => (
                            <tr key={idx}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {new Date(anomaly.date).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.anomaly_type}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  anomaly.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                  anomaly.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {anomaly.severity}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.device_id}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.anomaly_count}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {parseFloat(anomaly.avg_deviation).toFixed(2)}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No anomalies detected in the selected time range
                    </div>
                  )}
                </div>
              )}

              {/* Alerts Tab */}
              {activeTab === 'alerts' && (
                <div className="space-y-6">
                  <h2 className="text-lg font-semibold text-gray-800">Alert History</h2>

                  {data && data.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Device</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Count</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Response Time</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {data.map((alert, idx) => (
                            <tr key={idx}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {new Date(alert.date).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{alert.alert_type}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 text-xs font-medium rounded ${
                                  alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                                  alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-blue-100 text-blue-800'
                                }`}>
                                  {alert.severity}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{alert.state}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{alert.device_id}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{alert.alert_count}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {alert.avg_response_time_seconds ?
                                  `${Math.round(alert.avg_response_time_seconds / 60)} min` :
                                  'N/A'
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      No alerts in the selected time range
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
