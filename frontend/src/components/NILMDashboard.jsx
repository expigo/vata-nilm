import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export function NILMDashboard({ deviceId, siteType, latestReading }) {
  const [activeAlgorithm, setActiveAlgorithm] = useState('Seq2Point');
  const [disaggregation, setDisaggregation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [autoUpdate, setAutoUpdate] = useState(true);

  const algorithms = [
    { value: 'Seq2Point', label: 'Seq2Point (CNN)', description: 'Fast & Accurate' },
    { value: 'CO', label: 'Combinatorial Optimization', description: 'Fastest' },
    { value: 'FHMM', label: 'Factorial HMM', description: 'Probabilistic' },
    { value: 'Seq2Seq', label: 'Seq2Seq (LSTM)', description: 'High Accuracy' },
    { value: 'BERT4NILM', label: 'BERT4NILM', description: 'Best Accuracy' }
  ];

  useEffect(() => {
    if (autoUpdate && latestReading && latestReading.power_total > 0) {
      disaggregate();
    }
  }, [latestReading, activeAlgorithm, autoUpdate]);

  const disaggregate = async () => {
    if (!latestReading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/nilm/disaggregate/realtime`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          reading: {
            timestamp: latestReading.timestamp,
            device_id: deviceId,
            site_type: siteType,
            voltage_l1: latestReading.voltage_l1 || 230,
            voltage_l2: latestReading.voltage_l2 || 230,
            voltage_l3: latestReading.voltage_l3 || 230,
            current_l1: latestReading.current_l1 || 0,
            current_l2: latestReading.current_l2 || 0,
            current_l3: latestReading.current_l3 || 0,
            power_l1: latestReading.power_l1 || 0,
            power_l2: latestReading.power_l2 || 0,
            power_l3: latestReading.power_l3 || 0,
            power_total: latestReading.power_total
          },
          algorithms: [activeAlgorithm]
        })
      });

      const data = await response.json();

      if (data.success && data.results && data.results.length > 0) {
        setDisaggregation(data.results[0]);
      } else {
        setError('No disaggregation results');
      }
    } catch (err) {
      console.error('Disaggregation error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const prepareChartData = () => {
    if (!disaggregation || !disaggregation.appliances) return [];

    const data = disaggregation.appliances.map(app => ({
      name: app.appliance_name,
      value: app.power_watts,
      category: app.category
    }));

    // Add unassigned power if significant
    if (disaggregation.unassigned_power > 50) {
      data.push({
        name: 'Other/Unknown',
        value: disaggregation.unassigned_power,
        category: 'Unknown'
      });
    }

    return data;
  };

  const chartData = prepareChartData();
  const totalPower = disaggregation?.total_power || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Energy Disaggregation</h2>
            <p className="text-sm text-gray-600 mt-1">
              Real-time appliance-level power breakdown
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={autoUpdate}
                onChange={(e) => setAutoUpdate(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              Auto-update
            </label>

            <button
              onClick={disaggregate}
              disabled={loading || !latestReading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analyze Now
                </>
              )}
            </button>
          </div>
        </div>

        {/* Algorithm Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Algorithm
          </label>
          <div className="grid grid-cols-5 gap-2">
            {algorithms.map((algo) => (
              <button
                key={algo.value}
                onClick={() => setActiveAlgorithm(algo.value)}
                className={`p-3 rounded-lg border-2 transition ${
                  activeAlgorithm === algo.value
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-medium text-gray-800">{algo.label}</div>
                <div className="text-xs text-gray-500 mt-1">{algo.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">Error: {error}</p>
        </div>
      )}

      {/* Results */}
      {disaggregation && (
        <div className="grid grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Power Distribution</h3>

            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => `${value.toFixed(0)} W`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-gray-500">
                No appliances detected
              </div>
            )}

            <div className="mt-4 p-3 bg-gray-50 rounded">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Power:</span>
                <span className="font-bold text-gray-900">{totalPower.toFixed(0)} W</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">Processing Time:</span>
                <span className="text-gray-700">{disaggregation.processing_time_ms?.toFixed(1)} ms</span>
              </div>
            </div>
          </div>

          {/* Appliance List */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Detected Appliances</h3>

            <div className="space-y-3">
              {disaggregation.appliances && disaggregation.appliances.length > 0 ? (
                disaggregation.appliances.map((appliance, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      ></div>
                      <div>
                        <div className="font-medium text-gray-900">{appliance.appliance_name}</div>
                        <div className="text-xs text-gray-500">{appliance.category}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-gray-900">{appliance.power_watts.toFixed(0)} W</div>
                      <div className="text-xs text-gray-500">
                        {appliance.state}
                        {' • '}
                        {(appliance.confidence * 100).toFixed(0)}% confident
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No appliances detected
                </div>
              )}

              {/* Unassigned Power */}
              {disaggregation.unassigned_power > 50 && (
                <div className="flex items-center justify-between p-3 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-gray-400"></div>
                    <div>
                      <div className="font-medium text-gray-700">Other/Unknown</div>
                      <div className="text-xs text-gray-500">Unassigned power</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-gray-700">
                      {disaggregation.unassigned_power.toFixed(0)} W
                    </div>
                    <div className="text-xs text-gray-500">
                      {((disaggregation.unassigned_power / totalPower) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Data */}
      {!disaggregation && !loading && !error && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <div className="text-6xl mb-4">⚡</div>
          <h3 className="text-xl font-semibold text-gray-800 mb-2">
            Ready to Analyze
          </h3>
          <p className="text-gray-600">
            Click "Analyze Now" or enable auto-update to see appliance breakdown
          </p>
        </div>
      )}
    </div>
  );
}
