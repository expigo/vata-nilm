export function ChartSelector({ selectedMetric, onMetricChange, selectedDevice, onDeviceChange, devices, activeTab }) {
  const metrics = [
    { value: 'power', label: 'Power (W)' },
    { value: 'voltage', label: 'Voltage (V)' },
    { value: 'current', label: 'Current (A)' }
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
      <div className="flex flex-wrap gap-4 items-center">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Metric
          </label>
          <div className="flex gap-2">
            {metrics.map(metric => (
              <button
                key={metric.value}
                onClick={() => onMetricChange(metric.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedMetric === metric.value
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Device Filter
            <span className="text-xs text-gray-500 ml-2">
              (Showing {activeTab} devices)
            </span>
          </label>
          <select
            value={selectedDevice}
            onChange={(e) => onDeviceChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All {activeTab} Devices (Combined)</option>
            {devices.map(device => (
              <option key={device} value={device}>
                {device}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
