export function InfoPanel() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
        <span>ℹ️</span>
        Dashboard Guide
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <h4 className="font-medium text-blue-800 mb-2">Power Phases (L1, L2, L3)</h4>
          <p className="text-blue-700">
            Three-phase electrical system. Each line (L1, L2, L3) carries ~230V at different phases. 
            <strong className="block mt-1">Total Power = L1 + L2 + L3</strong>
            <strong className="block mt-1">Avg Voltage = (L1 + L2 + L3) / 3</strong>
          </p>
        </div>
        
        <div>
          <h4 className="font-medium text-blue-800 mb-2">Device Status Colors</h4>
          <div className="space-y-1 text-blue-700">
            <p><span className="text-lg">🟢</span> <strong>Green:</strong> Updated within last 30 seconds (Active)</p>
            <p><span className="text-lg">🟡</span> <strong>Yellow:</strong> Updated 30s-2min ago (Delayed)</p>
            <p><span className="text-lg">🔴</span> <strong>Red:</strong> No update for &gt;2 minutes (Offline)</p>
          </div>
        </div>
      </div>
      
      <div className="mt-3 pt-3 border-t border-blue-300">
        <p className="text-xs text-blue-600">
          <strong>Note:</strong> Some devices (like MOSIR_lodowisko) send data at longer intervals (~1-2 minutes). 
          Yellow status is normal for these devices.
        </p>
      </div>
    </div>
  );
}
