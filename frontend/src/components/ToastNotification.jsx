import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';

export function ToastNotification({ notification, onClose, duration = 8000 }) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300); // Wait for animation
  };

  const severityStyles = {
    critical: 'bg-red-600 border-red-700',
    warning: 'bg-yellow-600 border-yellow-700',
    info: 'bg-blue-600 border-blue-700'
  };

  const severityIcons = {
    critical: '🚨',
    warning: '⚠️',
    info: 'ℹ️'
  };

  const bgColor = severityStyles[notification.severity] || severityStyles.info;
  const icon = severityIcons[notification.severity] || severityIcons.info;

  return (
    <div
      className={`
        ${bgColor} text-white rounded-lg shadow-2xl border-2 p-4 mb-3 min-w-80 max-w-md
        transform transition-all duration-300 ease-out
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl flex-shrink-0">{icon}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="font-bold text-sm mb-1">{notification.title}</h4>
              {notification.message && (
                <p className="text-xs opacity-90 mb-2">{notification.message}</p>
              )}
            </div>

            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition-colors flex-shrink-0"
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

          <div className="flex items-center gap-3 text-xs opacity-75">
            <span>{notification.deviceId}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(notification.triggeredAt), { addSuffix: true })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-50 pointer-events-none">
      <div className="flex flex-col items-end pointer-events-auto">
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            notification={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </div>
  );
}
