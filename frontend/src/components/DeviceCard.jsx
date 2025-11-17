import { formatDistanceToNow } from 'date-fns';

export function DeviceCard({ deviceId, siteType, timestamp, data }) {
  const timeAgo = timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 'unknown';
  
  const getStatus = () => {
    if (!timestamp) return 'offline';
    const secondsAgo = (Date.now() - new Date(timestamp)) / 1000;
    
    // More forgiving thresholds for devices with delays
    if (secondsAgo < 30) return 'online';      // Green: <30 seconds
    if (secondsAgo < 120) return 'warning';    // Yellow: 30s-2min
    return 'offline';                           // Red: >2 minutes
  };

  const status = getStatus();
  
  const statusColors = {
    online: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    offline: 'bg-red-100 text-red-800 border-red-200'
  };

  const statusIcons = {
    online: '🟢',
    warning: '🟡',
    offline: '🔴'
  };

  const voltage = data?.['NMID_1-18']?.slice(0, 3) || [0, 0, 0];
  const current = data?.['NMID_1-18']?.slice(3, 6) || [0, 0, 0];
  const power = data?.['NMID_1-18']?.slice(6, 9) || [0, 0, 0];
  
  // Calculate totals
  const totalPower = power[0] + power[1] + power[2];
  const avgVoltage = (voltage[0] + voltage[1] + voltage[2]) / 3;
  const totalCurrent = current[0] + current[1] + current[2];

  return (
    <div className={`border-2 rounded-lg p-4 ${statusColors[status]} transition-all hover:shadow-md`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-lg">{deviceId}</h3>
          <p className="text-xs text-gray-600">{siteType}</p>
        </div>
        <div className="text-2xl">{statusIcons[status]}</div>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        Updated {timeAgo}
      </p>

      {/* Summary Stats */}
      <div className="mb-3 p-2 bg-white bg-opacity-50 rounded">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <p className="font-medium text-gray-600">Total Power</p>
            <p className="text-lg font-bold">{totalPower.toFixed(0)} W</p>
          </div>
          <div>
            <p className="font-medium text-gray-600">Avg Voltage</p>
            <p className="text-lg font-bold">{avgVoltage.toFixed(0)} V</p>
          </div>
          <div>
            <p className="font-medium text-gray-600">Total Current</p>
            <p className="text-lg font-bold">{totalCurrent.toFixed(1)} A</p>
          </div>
        </div>
      </div>

      {/* Detailed Metrics */}
      <div className="space-y-2 text-sm">
        <div>
          <p className="font-medium text-gray-700">Voltage (V)</p>
          <p className="text-xs font-mono">
            L1: {voltage[0]?.toFixed(1)} | L2: {voltage[1]?.toFixed(1)} | L3: {voltage[2]?.toFixed(1)}
          </p>
        </div>
        
        <div>
          <p className="font-medium text-gray-700">Current (A)</p>
          <p className="text-xs font-mono">
            L1: {current[0]?.toFixed(2)} | L2: {current[1]?.toFixed(2)} | L3: {current[2]?.toFixed(2)}
          </p>
        </div>
        
        <div>
          <p className="font-medium text-gray-700">Power (W)</p>
          <p className="text-xs font-mono">
            L1: {power[0]?.toFixed(0)} | L2: {power[1]?.toFixed(0)} | L3: {power[2]?.toFixed(0)}
          </p>
        </div>
      </div>
    </div>
  );
}
