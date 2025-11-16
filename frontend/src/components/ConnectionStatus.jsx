export function ConnectionStatus({ isConnected, error }) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-2 rounded-lg flex items-center gap-2">
        <span className="text-xl">❌</span>
        <span className="text-sm font-medium">Connection Error: {error}</span>
      </div>
    );
  }

  return (
    <div className={`border px-4 py-2 rounded-lg flex items-center gap-2 ${
      isConnected 
        ? 'bg-green-50 border-green-200 text-green-800' 
        : 'bg-yellow-50 border-yellow-200 text-yellow-800'
    }`}>
      <span className="text-xl">{isConnected ? '🟢' : '🟡'}</span>
      <span className="text-sm font-medium">
        {isConnected ? 'Connected' : 'Connecting...'}
      </span>
    </div>
  );
}
