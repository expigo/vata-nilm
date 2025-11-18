import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useAlerts } from '../hooks/useAlerts';

export function AlertNotificationPanel({ siteType }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const { activeAlerts, alertStats, acknowledgeAlert, dismissAlert } = useAlerts(siteType);

  const criticalCount = activeAlerts.filter(a => a.severity === 'critical').length;
  const warningCount = activeAlerts.filter(a => a.severity === 'warning').length;

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId, 'user', 'Acknowledged via UI');
      setSelectedAlert(null);
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const handleDismiss = async (alertId) => {
    try {
      await dismissAlert(alertId, 'user', 'Dismissed via UI');
      setSelectedAlert(null);
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge */}
        {activeAlerts.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {activeAlerts.length > 9 ? '9+' : activeAlerts.length}
          </span>
        )}

        {/* Pulsing indicator for critical alerts */}
        {criticalCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          ></div>

          {/* Panel */}
          <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[600px] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-lg">Active Alerts</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              {/* Stats */}
              {alertStats && (
                <div className="flex gap-3 text-sm">
                  {alertStats.critical_count > 0 && (
                    <div className="flex items-center gap-1 text-red-600">
                      <span className="font-bold">{alertStats.critical_count}</span>
                      <span>Critical</span>
                    </div>
                  )}
                  {alertStats.warning_count > 0 && (
                    <div className="flex items-center gap-1 text-yellow-600">
                      <span className="font-bold">{alertStats.warning_count}</span>
                      <span>Warning</span>
                    </div>
                  )}
                  {alertStats.info_count > 0 && (
                    <div className="flex items-center gap-1 text-blue-600">
                      <span className="font-bold">{alertStats.info_count}</span>
                      <span>Info</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Alerts List */}
            <div className="overflow-y-auto flex-1">
              {activeAlerts.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <svg
                    className="w-16 h-16 mx-auto mb-3 text-gray-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <p className="font-medium">No active alerts</p>
                  <p className="text-sm">All systems operating normally</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeAlerts.map((alert) => (
                    <AlertItem
                      key={alert.id}
                      alert={alert}
                      onSelect={setSelectedAlert}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onAcknowledge={handleAcknowledge}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  );
}

function AlertItem({ alert, onSelect }) {
  const severityColors = {
    critical: 'border-l-red-600 bg-red-50',
    warning: 'border-l-yellow-600 bg-yellow-50',
    info: 'border-l-blue-600 bg-blue-50'
  };

  const severityIcons = {
    critical: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const stateColors = {
    active: 'bg-red-100 text-red-800',
    acknowledged: 'bg-blue-100 text-blue-800'
  };

  return (
    <div
      onClick={() => onSelect(alert)}
      className={`
        p-3 border-l-4 cursor-pointer transition-all hover:shadow-md
        ${severityColors[alert.severity] || severityColors.info}
      `}
    >
      <div className="flex items-start gap-2">
        <span className="text-xl flex-shrink-0">
          {severityIcons[alert.severity] || severityIcons.info}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-semibold text-sm text-gray-900 line-clamp-2">
              {alert.title}
            </h4>
            <span
              className={`
                text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0
                ${stateColors[alert.state] || 'bg-gray-100 text-gray-800'}
              `}
            >
              {alert.state}
            </span>
          </div>

          <p className="text-xs text-gray-600 mb-2 line-clamp-2">
            {alert.message}
          </p>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">{alert.device_id}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertDetailsModal({ alert, onClose, onAcknowledge, onDismiss }) {
  const severityColors = {
    critical: 'text-red-600 bg-red-50 border-red-200',
    warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    info: 'text-blue-600 bg-blue-50 border-blue-200'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Alert Details
              </h2>
              <span
                className={`
                  inline-block px-3 py-1 rounded-full text-sm font-bold uppercase border-2
                  ${severityColors[alert.severity] || severityColors.info}
                `}
              >
                {alert.severity}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                {alert.title}
              </h3>
              <p className="text-gray-700">{alert.message}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Device</label>
                <p className="font-mono text-sm">{alert.device_id}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Site</label>
                <p className="text-sm">{alert.site_type}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Alert Type</label>
                <p className="text-sm">{alert.alert_type}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">State</label>
                <p className="text-sm capitalize">{alert.state}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Triggered At</label>
                <p className="text-sm">
                  {new Date(alert.triggered_at).toLocaleString()}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-500">Time Ago</label>
                <p className="text-sm">
                  {formatDistanceToNow(new Date(alert.triggered_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            {alert.alert_data && (
              <div>
                <label className="text-sm font-medium text-gray-500 mb-2 block">
                  Alert Data
                </label>
                <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(alert.alert_data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex gap-3">
          {alert.state === 'active' && (
            <>
              <button
                onClick={() => onAcknowledge(alert.id)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Acknowledge
              </button>
              <button
                onClick={() => onDismiss(alert.id)}
                className="flex-1 px-4 py-2 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                Dismiss
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white text-gray-700 font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
