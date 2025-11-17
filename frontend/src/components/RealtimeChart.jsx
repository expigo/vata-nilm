import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format } from 'date-fns';

export function RealtimeChart({ messages, deviceId, metric = 'power' }) {
  const filteredMessages = deviceId 
    ? messages.filter(msg => (msg.device_id || msg.deviceId) === deviceId)
    : messages;

  // Take last 30 messages for better visibility
  const chartData = filteredMessages
    .slice(0, 30)
    .reverse()
    .map(msg => {
      const data = msg.raw_json || msg.data || {};
      const timestamp = new Date(msg.timestamp);
      
      let values = {};
      
      if (metric === 'power') {
        const power = data['NMID_1-18']?.slice(6, 9) || [0, 0, 0];
        values = {
          L1: power[0],
          L2: power[1],
          L3: power[2],
          total: power[0] + power[1] + power[2]
        };
      } else if (metric === 'voltage') {
        const voltage = data['NMID_1-18']?.slice(0, 3) || [0, 0, 0];
        values = {
          L1: voltage[0],
          L2: voltage[1],
          L3: voltage[2]
        };
      } else if (metric === 'current') {
        const current = data['NMID_1-18']?.slice(3, 6) || [0, 0, 0];
        values = {
          L1: current[0],
          L2: current[1],
          L3: current[2]
        };
      }
      
      return {
        time: format(timestamp, 'HH:mm:ss'),
        timestamp: timestamp.getTime(),
        ...values
      };
    });

  const metricConfig = {
    power: {
      title: 'Power (W)',
      lines: ['L1', 'L2', 'L3', 'total'],
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
      labels: ['L1', 'L2', 'L3', 'Total']
    },
    voltage: {
      title: 'Voltage (V)',
      lines: ['L1', 'L2', 'L3'],
      colors: ['#3b82f6', '#10b981', '#f59e0b'],
      labels: ['L1', 'L2', 'L3']
    },
    current: {
      title: 'Current (A)',
      lines: ['L1', 'L2', 'L3'],
      colors: ['#3b82f6', '#10b981', '#f59e0b'],
      labels: ['L1', 'L2', 'L3']
    }
  };

  const config = metricConfig[metric];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {config.title} - Real-time
        {deviceId && <span className="text-sm font-normal text-gray-500 ml-2">({deviceId})</span>}
      </h3>
      
      {chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-500">
          Waiting for data...
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="time" 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              stroke="#6b7280"
              style={{ fontSize: '12px' }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '13px'
              }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '10px' }}
            />
            {config.lines.map((line, index) => (
              <Line
                key={line}
                name={config.labels[index]}
                type="monotone"
                dataKey={line}
                stroke={config.colors[index]}
                strokeWidth={2}
                dot={{ fill: config.colors[index], r: 4 }}
                activeDot={{ r: 6 }}
                animationDuration={300}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      
      <p className="text-xs text-gray-500 mt-2 text-center">
        Last 30 data points • Updates in real-time
      </p>
    </div>
  );
}
