import { useState, useEffect } from 'react';

export function DebugPanel({ messageCount, deviceCount }) {
  const [memoryInfo, setMemoryInfo] = useState(null);

  useEffect(() => {
    const updateMemory = () => {
      if (performance.memory) {
        setMemoryInfo({
          used: (performance.memory.usedJSHeapSize / 1048576).toFixed(2),
          total: (performance.memory.totalJSHeapSize / 1048576).toFixed(2),
          limit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2)
        });
      }
    };

    updateMemory();
    const interval = setInterval(updateMemory, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-xs rounded-lg p-3 shadow-lg opacity-75 hover:opacity-100 transition-opacity">
      <h4 className="font-semibold mb-2">Debug Info</h4>
      <div className="space-y-1">
        <p>Messages: {messageCount}</p>
        <p>Devices: {deviceCount}</p>
        {memoryInfo && (
          <>
            <p>Memory: {memoryInfo.used} / {memoryInfo.total} MB</p>
            <p className="text-xs text-gray-400">Limit: {memoryInfo.limit} MB</p>
          </>
        )}
      </div>
    </div>
  );
}
