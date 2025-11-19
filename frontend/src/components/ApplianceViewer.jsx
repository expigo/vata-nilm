import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ApplianceViewer({ deviceId, siteType }) {
  const [appliances, setAppliances] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState(30);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState('Seq2Point');
  const [view, setView] = useState('stats'); // 'stats' or 'appliances'

  useEffect(() => {
    loadAppliances();
    loadStats();
  }, [deviceId, siteType, timeRange, selectedAlgorithm]);

  const loadAppliances = async () => {
    try {
      const params = new URLSearchParams({
        siteType,
        isGlobal: 'false'
      });

      const response = await fetch(`${API_URL}/api/nilm/appliances?${params}`, {
        credentials: 'include'
      });

      const data = await response.json();

      if (data.success) {
        setAppliances(data.appliances || []);
      }
    } catch (error) {
      console.error('Error loading appliances:', error);
    }
  };

  const loadStats = async () => {
    if (!deviceId) return;

    setLoading(true);

    try {
      const params = new URLSearchParams({
        days: timeRange.toString(),
        algorithm: selectedAlgorithm
      });

      const response = await fetch(
        `${API_URL}/api/nilm/stats/appliances/${deviceId}?${params}`,
        {
          credentials: 'include'
        }
      );

      const data = await response.json();

      if (data.success) {
        setStats(data.stats || []);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'HVAC': '❄️',
      'Refrigerator': '🧊',
      'Washing Machine': '🧺',
      'Dishwasher': '🍽️',
      'Lighting': '💡',
      'Electronics': '📺',
      'Kitchen': '🍳',
      'Water Heater': '🚿',
      'Motor': '⚙️',
      'Other': '❓'
    };
    return icons[category] || '⚡';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Appliance Statistics</h2>
            <p className="text-sm text-gray-600 mt-1">
              Usage patterns and energy consumption
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setView('stats')}
                className={`px-4 py-2 rounded font-medium text-sm transition ${
                  view === 'stats'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Usage Stats
              </button>
              <button
                onClick={() => setView('appliances')}
                className={`px-4 py-2 rounded font-medium text-sm transition ${
                  view === 'appliances'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                All Appliances
              </button>
            </div>

            {/* Time Range Selector */}
            {view === 'stats' && (
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(parseInt(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
                <option value={90}>Last 90 Days</option>
              </select>
            )}
          </div>
        </div>

        {/* Algorithm Selector */}
        {view === 'stats' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Algorithm
            </label>
            <select
              value={selectedAlgorithm}
              onChange={(e) => setSelectedAlgorithm(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="Seq2Point">Seq2Point (CNN)</option>
              <option value="CO">Combinatorial Optimization</option>
              <option value="FHMM">Factorial HMM</option>
              <option value="Seq2Seq">Seq2Seq (LSTM)</option>
              <option value="BERT4NILM">BERT4NILM</option>
            </select>
          </div>
        )}
      </div>

      {/* Usage Statistics View */}
      {view === 'stats' && (
        <>
          {loading ? (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-gray-600">Loading statistics...</p>
            </div>
          ) : stats.length > 0 ? (
            <>
              {/* Energy Chart */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Energy Consumption by Appliance
                </h3>

                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={stats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="appliance_name" angle={-45} textAnchor="end" height={100} />
                    <YAxis label={{ value: 'Energy (kWh)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total_energy_kwh" fill="#3b82f6" name="Total Energy (kWh)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Stats Table */}
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">
                  Detailed Statistics
                </h3>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Appliance
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Energy
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Power
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Max Power
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Detections
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Seen
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stats.map((stat) => (
                        <tr key={stat.appliance_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <span className="text-2xl">{getCategoryIcon(stat.category_name)}</span>
                              <span className="font-medium text-gray-900">{stat.appliance_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {stat.category_name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {stat.total_energy_kwh ? parseFloat(stat.total_energy_kwh).toFixed(2) : '0.00'} kWh
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {stat.avg_power_watts ? parseFloat(stat.avg_power_watts).toFixed(0) : '0'} W
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {stat.max_power_watts ? parseFloat(stat.max_power_watts).toFixed(0) : '0'} W
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {stat.detection_count || 0}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {stat.last_seen ? new Date(stat.last_seen).toLocaleString() : 'Never'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-lg shadow-sm p-12 text-center">
              <div className="text-6xl mb-4">📊</div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                No Data Available
              </h3>
              <p className="text-gray-600">
                No appliance usage data for the selected time period
              </p>
            </div>
          )}
        </>
      )}

      {/* All Appliances View */}
      {view === 'appliances' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {appliances.map((appliance) => (
            <div
              key={appliance.id}
              className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getCategoryIcon(appliance.category_name)}</span>
                  <div>
                    <h3 className="font-semibold text-gray-900">{appliance.name}</h3>
                    <p className="text-xs text-gray-500">{appliance.category_name}</p>
                  </div>
                </div>

                {appliance.is_global && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                    Global
                  </span>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Nominal Power:</span>
                  <span className="font-medium text-gray-900">
                    {appliance.nominal_power ? Math.round(appliance.nominal_power) : '0'} W
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-gray-600">Standby Power:</span>
                  <span className="text-gray-700">
                    {appliance.standby_power ? Math.round(appliance.standby_power) : '0'} W
                  </span>
                </div>

                {appliance.trained_on_dataset && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Trained On:</span>
                    <span className="text-gray-700">{appliance.trained_on_dataset}</span>
                  </div>
                )}

                {appliance.confidence_score && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-medium text-green-600">
                      {(appliance.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>

              {appliance.brand && (
                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
                  <span className="font-medium">Brand:</span> {appliance.brand}
                  {appliance.model && ` • Model: ${appliance.model}`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
