import { formatDistanceToNow } from 'date-fns';

export function DeviceCard({ deviceId, siteType, timestamp, data }) {
  const timeAgo = timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 'unknown';
  
  const getStatus = () => {
    if (!timestamp) return 'offline';
    const secondsAgo = (Date.now() - new Date(timestamp)) / 1000;
    if (secondsAgo < 10) return 'online';
    if (secondsAgo < 60) return 'warning';
    return 'offline';
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
