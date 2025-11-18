import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useMetricsSummary, useEnergyData, useAnomalies } from '../hooks/useMetrics';
import { formatDistanceToNow } from 'date-fns';

export function MetricsPanel({ siteType }) {
  const { summary, loading: metricsLoading } = useMetricsSummary(siteType);
  const { energyData, loading: energyLoading } = useEnergyData(siteType);
  const { anomalies } = useAnomalies(null, 24);

  if (metricsLoading || energyLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Avg Power Factor"
          value={calculateAverage(summary, 'power_factor_total')}
          format={(v) => v.toFixed(3)}
          goodThreshold={0.85}
          icon="⚡"
          color="blue"
        />
        <SummaryCard
          title="Max Voltage Imbalance"
          value={calculateMax(summary, 'voltage_imbalance')}
          format={(v) => `${v.toFixed(1)}%`}
          goodThreshold={20}
          inverse
          icon="⚖️"
          color="yellow"
        />
        <SummaryCard
          title="Total Energy (24h)"
          value={calculateSum(energyData, 'total_energy_kwh')}
          format={(v) => `${v.toFixed(1)} kWh`}
          icon="🔋"
          color="green"
        />
        <SummaryCard
          title="Anomalies (24h)"
          value={anomalies.length}
          format={(v) => v}
          goodThreshold={0}
          inverse
          icon="🔍"
          color="red"
        />
      </div>

      {/* Power Quality Metrics */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Power Quality Metrics</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {summary.slice(0, 6).map((device) => (
            <PowerQualityCard key={device.device_id} device={device} />
          ))}
        </div>
      </div>

      {/* Energy Consumption */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Energy Consumption (Last 24h)</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {energyData.slice(0, 6).map((device) => (
            <EnergyCard key={device.device_id} device={device} />
          ))}
        </div>
      </div>

      {/* Recent Anomalies */}
      {anomalies.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Recent Anomalies ({anomalies.length})
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {anomalies.slice(0, 20).map((anomaly, idx) => (
              <AnomalyItem key={idx} anomaly={anomaly} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, format, goodThreshold, inverse, icon, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200'
  };

  const isGood = goodThreshold !== undefined
    ? inverse
      ? value <= goodThreshold
      : value >= goodThreshold
    : true;

  const statusColor = isGood ? 'text-green-600' : 'text-red-600';

  return (
    <div className={`rounded-lg p-4 border-2 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {goodThreshold !== undefined && (
          <span className={`text-xl ${statusColor}`}>
            {isGood ? '✓' : '⚠'}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-gray-600">{title}</div>
      <div className="text-2xl font-bold mt-1">
        {value !== null && value !== undefined ? format(value) : 'N/A'}
      </div>
    </div>
  );
}

function PowerQualityCard({ device }) {
  const powerFactorColor = device.power_factor_total >= 0.85 ? 'text-green-600' : 'text-red-600';
  const imbalanceColor = device.voltage_imbalance <= 20 ? 'text-green-600' : 'text-red-600';

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="font-mono text-sm font-bold text-gray-900 mb-3">
        {device.device_id}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">Power Factor</div>
          <div className={`text-lg font-bold ${powerFactorColor}`}>
            {device.power_factor_total?.toFixed(3) || 'N/A'}
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Apparent Power</div>
          <div className="text-lg font-bold text-blue-600">
            {device.apparent_power_total?.toFixed(0) || 'N/A'} VA
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Voltage Imbalance</div>
          <div className={`text-lg font-bold ${imbalanceColor}`}>
            {device.voltage_imbalance?.toFixed(1) || 'N/A'}%
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Current Imbalance</div>
          <div className="text-lg font-bold text-gray-700">
            {device.current_imbalance?.toFixed(1) || 'N/A'}%
          </div>
        </div>
      </div>

      <div className="mt-3 text-xs text-gray-500">
        Updated {formatDistanceToNow(new Date(device.timestamp), { addSuffix: true })}
      </div>
    </div>
  );
}

function EnergyCard({ device }) {
  const energyKwh = parseFloat(device.total_energy_kwh) || 0;
  const demandKw = parseFloat(device.current_demand_kw) || 0;
  const peakKw = parseFloat(device.peak_demand_kw) || 0;
  const loadFactor = parseFloat(device.avg_load_factor) || 0;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="font-mono text-sm font-bold text-gray-900 mb-3">
        {device.device_id}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">Energy Consumed</div>
          <div className="text-lg font-bold text-green-600">
            {energyKwh.toFixed(1)} kWh
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Current Demand</div>
          <div className="text-lg font-bold text-blue-600">
            {demandKw.toFixed(2)} kW
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Peak Demand</div>
          <div className="text-lg font-bold text-red-600">
            {peakKw.toFixed(2)} kW
          </div>
        </div>

        <div>
          <div className="text-xs text-gray-500 mb-1">Load Factor</div>
          <div className="text-lg font-bold text-gray-700">
            {loadFactor.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Mini Bar Chart */}
      <div className="mt-3 flex items-end gap-1 h-8">
        <div
          className="bg-blue-200 rounded-t"
          style={{ width: '33%', height: `${(demandKw / peakKw) * 100}%` }}
          title="Current Demand"
        ></div>
        <div
          className="bg-red-300 rounded-t"
          style={{ width: '33%', height: '100%' }}
          title="Peak Demand"
        ></div>
        <div
          className="bg-green-200 rounded-t"
          style={{ width: '33%', height: `${loadFactor * 100}%` }}
          title="Load Factor"
        ></div>
      </div>
    </div>
  );
}

function AnomalyItem({ anomaly }) {
  const severityColors = {
    critical: 'bg-red-100 border-red-300 text-red-800',
    warning: 'bg-yellow-100 border-yellow-300 text-yellow-800',
    info: 'bg-blue-100 border-blue-300 text-blue-800'
  };

  const typeIcons = {
    voltage_spike: '⚡',
    voltage_drop: '📉',
    current_spike: '🔌',
    power_drop: '📊',
    pattern_anomaly: '🔍'
  };

  return (
    <div
      className={`
        p-3 rounded-lg border-l-4
        ${severityColors[anomaly.severity] || severityColors.info}
      `}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl flex-shrink-0">
          {typeIcons[anomaly.anomaly_type] || '⚠️'}
        </span>

        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{anomaly.description}</h4>
              <div className="text-xs mt-1">
                <span className="font-mono">{anomaly.device_id}</span>
                <span className="mx-2">•</span>
                <span>{anomaly.phase}</span>
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-bold">
                {anomaly.metric_value?.toFixed(2)} {anomaly.metric_name?.includes('voltage') ? 'V' : anomaly.metric_name?.includes('current') ? 'A' : 'W'}
              </div>
              <div className="text-xs text-gray-600">
                Expected: {anomaly.expected_value?.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="text-xs text-gray-600 mt-2">
            {formatDistanceToNow(new Date(anomaly.timestamp), { addSuffix: true })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function calculateAverage(data, field) {
  if (!data || data.length === 0) return null;
  const sum = data.reduce((acc, item) => acc + (parseFloat(item[field]) || 0), 0);
  return sum / data.length;
}

function calculateMax(data, field) {
  if (!data || data.length === 0) return null;
  return Math.max(...data.map(item => parseFloat(item[field]) || 0));
}

function calculateSum(data, field) {
  if (!data || data.length === 0) return null;
  return data.reduce((acc, item) => acc + (parseFloat(item[field]) || 0), 0);
}
