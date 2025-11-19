import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function ManualLabeling({ deviceId, siteType }) {
  const { user } = useAuth();
  const [historicalData, setHistoricalData] = useState([]);
  const [appliances, setAppliances] = useState([]);
  const [categories, setCategories] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);

  // Selection state
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Label form state
  const [showLabelForm, setShowLabelForm] = useState(false);
  const [selectedAppliance, setSelectedAppliance] = useState('');
  const [selectedState, setSelectedState] = useState('ON');
  const [estimatedPower, setEstimatedPower] = useState('');
  const [notes, setNotes] = useState('');
  const [confidence, setConfidence] = useState('certain');

  // Time range for data
  const [timeRange, setTimeRange] = useState(24); // hours

  useEffect(() => {
    loadAppliances();
    loadCategories();
    loadHistoricalData();
    loadLabels();
  }, [deviceId, siteType, timeRange]);

  const loadHistoricalData = async () => {
    if (!deviceId) return;

    setLoading(true);

    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - timeRange * 60 * 60 * 1000);

      const params = new URLSearchParams({
        siteType,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        limit: '1000'
      });

      const response = await fetch(
        `${API_URL}/api/historical/data?${params}`,
        {
          credentials: 'include'
        }
      );

      const data = await response.json();

      if (data.success && data.data) {
        const chartData = data.data
          .filter(d => d.device_id === deviceId)
          .map(d => ({
            timestamp: new Date(d.timestamp).getTime(),
            timestampStr: new Date(d.timestamp).toLocaleString(),
            power: d.power_total || 0
          }));

        setHistoricalData(chartData);
      }
    } catch (error) {
      console.error('Error loading historical data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAppliances = async () => {
    try {
      const params = new URLSearchParams({
        siteType,
        isGlobal: 'false'
      });

      const response = await fetch(
        `${API_URL}/api/nilm/appliances?${params}`,
        {
          credentials: 'include'
        }
      );

      const data = await response.json();

      if (data.success) {
        setAppliances(data.appliances || []);
      }
    } catch (error) {
      console.error('Error loading appliances:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/nilm/appliances/categories`,
        {
          credentials: 'include'
        }
      );

      const data = await response.json();

      if (data.success) {
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadLabels = async () => {
    try {
      const params = new URLSearchParams({
        deviceId
      });

      const response = await fetch(
        `${API_URL}/api/nilm/labels?${params}`,
        {
          credentials: 'include'
        }
      );

      const data = await response.json();

      if (data.success) {
        setLabels(data.labels || []);
      }
    } catch (error) {
      console.error('Error loading labels:', error);
    }
  };

  const handleMouseDown = (e) => {
    if (e && e.activeLabel !== undefined) {
      setIsSelecting(true);
      setSelectionStart(historicalData[e.activeLabel].timestamp);
      setSelectionEnd(null);
    }
  };

  const handleMouseMove = (e) => {
    if (isSelecting && e && e.activeLabel !== undefined) {
      setSelectionEnd(historicalData[e.activeLabel].timestamp);
    }
  };

  const handleMouseUp = () => {
    if (isSelecting && selectionStart && selectionEnd) {
      setIsSelecting(false);
      setShowLabelForm(true);

      // Calculate average power in selection
      const start = Math.min(selectionStart, selectionEnd);
      const end = Math.max(selectionStart, selectionEnd);

      const selectedData = historicalData.filter(
        d => d.timestamp >= start && d.timestamp <= end
      );

      if (selectedData.length > 0) {
        const avgPower = selectedData.reduce((sum, d) => sum + d.power, 0) / selectedData.length;
        setEstimatedPower(Math.round(avgPower).toString());
      }
    }
  };

  const handleSubmitLabel = async (e) => {
    e.preventDefault();

    if (!selectedAppliance || !selectionStart || !selectionEnd) {
      alert('Please select an appliance and time range');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/nilm/labels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          device_id: deviceId,
          site_type: siteType,
          appliance_id: parseInt(selectedAppliance),
          start_timestamp: new Date(Math.min(selectionStart, selectionEnd)).toISOString(),
          end_timestamp: new Date(Math.max(selectionStart, selectionEnd)).toISOString(),
          state: selectedState,
          power_watts: estimatedPower ? parseFloat(estimatedPower) : null,
          notes,
          confidence
        })
      });

      const data = await response.json();

      if (data.success) {
        alert('Label created successfully!');
        resetForm();
        loadLabels();
      } else {
        alert('Error creating label: ' + data.error);
      }
    } catch (error) {
      console.error('Error creating label:', error);
      alert('Error creating label');
    }
  };

  const resetForm = () => {
    setShowLabelForm(false);
    setSelectionStart(null);
    setSelectionEnd(null);
    setSelectedAppliance('');
    setSelectedState('ON');
    setEstimatedPower('');
    setNotes('');
    setConfidence('certain');
  };

  const getSelectionRange = () => {
    if (!selectionStart || !selectionEnd) return null;
    return {
      left: Math.min(selectionStart, selectionEnd),
      right: Math.max(selectionStart, selectionEnd)
    };
  };

  const selectionRange = getSelectionRange();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Manual Labeling</h2>
            <p className="text-sm text-gray-600 mt-1">
              Label events to improve disaggregation accuracy
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Time Range:</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={6}>Last 6 Hours</option>
              <option value={24}>Last 24 Hours</option>
              <option value={72}>Last 3 Days</option>
              <option value={168}>Last Week</option>
            </select>

            <button
              onClick={loadHistoricalData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to Label:</h3>
        <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
          <li>Click and drag on the chart to select a time range</li>
          <li>Choose the appliance that was active during this period</li>
          <li>Select the state (ON/OFF/STANDBY) and confirm estimated power</li>
          <li>Add optional notes and submit the label</li>
        </ol>
      </div>

      {/* Power Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Power Consumption ({loading ? 'Loading...' : `${historicalData.length} samples`})
        </h3>

        {historicalData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={historicalData}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestampStr"
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis label={{ value: 'Power (W)', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="power"
                stroke="#3b82f6"
                dot={false}
                strokeWidth={2}
              />
              {selectionRange && (
                <ReferenceArea
                  x1={historicalData.find(d => d.timestamp >= selectionRange.left)?.timestampStr}
                  x2={historicalData.find(d => d.timestamp <= selectionRange.right)?.timestampStr}
                  strokeOpacity={0.3}
                  fill="#3b82f6"
                  fillOpacity={0.3}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">
            {loading ? 'Loading data...' : 'No data available'}
          </div>
        )}
      </div>

      {/* Label Form Modal */}
      {showLabelForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Create Label</h3>

            <form onSubmit={handleSubmitLabel} className="space-y-4">
              {/* Time Range Display */}
              <div className="p-3 bg-gray-50 rounded text-sm">
                <div className="font-medium text-gray-700">Selected Time Range:</div>
                <div className="text-gray-600">
                  {new Date(Math.min(selectionStart, selectionEnd)).toLocaleString()}
                  {' → '}
                  {new Date(Math.max(selectionStart, selectionEnd)).toLocaleString()}
                </div>
              </div>

              {/* Appliance Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appliance *
                </label>
                <select
                  value={selectedAppliance}
                  onChange={(e) => setSelectedAppliance(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Select an appliance...</option>
                  {appliances.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name} ({app.category_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* State Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  State *
                </label>
                <select
                  value={selectedState}
                  onChange={(e) => setSelectedState(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="ON">ON</option>
                  <option value="OFF">OFF</option>
                  <option value="STANDBY">STANDBY</option>
                  <option value="CYCLE_START">CYCLE_START</option>
                  <option value="CYCLE_END">CYCLE_END</option>
                </select>
              </div>

              {/* Power Estimation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Estimated Power (W)
                </label>
                <input
                  type="number"
                  value={estimatedPower}
                  onChange={(e) => setEstimatedPower(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Auto-calculated from selection"
                />
              </div>

              {/* Confidence */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confidence
                </label>
                <select
                  value={confidence}
                  onChange={(e) => setConfidence(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="certain">Certain</option>
                  <option value="probable">Probable</option>
                  <option value="guess">Guess</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Additional information about this event..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
                >
                  Create Label
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recent Labels */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          Your Labels ({labels.length})
        </h3>

        {labels.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Appliance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Time Range
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    State
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Power
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Confidence
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {labels.slice(0, 10).map((label) => (
                  <tr key={label.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {label.appliance_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(label.start_timestamp).toLocaleString()}
                      <br />
                      <span className="text-xs text-gray-500">
                        to {new Date(label.end_timestamp).toLocaleString()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                        {label.state}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {label.power_watts ? `${Math.round(label.power_watts)} W` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {label.confidence}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {label.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No labels created yet. Start by selecting a time range on the chart above.
          </div>
        )}
      </div>
    </div>
  );
}
