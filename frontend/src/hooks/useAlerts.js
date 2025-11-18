import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Hook for managing alerts
 */
export function useAlerts(siteType = 'ALL') {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [alertStats, setAlertStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch active alerts
  const fetchActiveAlerts = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/active/${siteType}`);
      const data = await response.json();

      if (data.success) {
        setActiveAlerts(data.data);
      }
    } catch (err) {
      console.error('Error fetching active alerts:', err);
      setError(err.message);
    }
  }, [siteType]);

  // Fetch alert statistics
  const fetchAlertStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/statistics/${siteType}`);
      const data = await response.json();

      if (data.success) {
        setAlertStats(data.data);
      }
    } catch (err) {
      console.error('Error fetching alert stats:', err);
    }
  }, [siteType]);

  // Acknowledge alert
  const acknowledgeAlert = async (alertId, acknowledgedBy, note) => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acknowledgedBy, note })
      });

      const data = await response.json();

      if (data.success) {
        // Update local state
        setActiveAlerts(prev =>
          prev.map(alert =>
            alert.id === alertId ? { ...alert, state: 'acknowledged' } : alert
          )
        );
        return data.alert;
      }
    } catch (err) {
      console.error('Error acknowledging alert:', err);
      throw err;
    }
  };

  // Dismiss alert
  const dismissAlert = async (alertId, dismissedBy, note) => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissedBy, note })
      });

      const data = await response.json();

      if (data.success) {
        // Remove from active alerts
        setActiveAlerts(prev => prev.filter(alert => alert.id !== alertId));
        return data.alert;
      }
    } catch (err) {
      console.error('Error dismissing alert:', err);
      throw err;
    }
  };

  // Resolve alert
  const resolveAlert = async (alertId, performedBy, note) => {
    try {
      const response = await fetch(`${API_URL}/api/alerts/${alertId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ performedBy, note })
      });

      const data = await response.json();

      if (data.success) {
        // Remove from active alerts
        setActiveAlerts(prev => prev.filter(alert => alert.id !== alertId));
        return data.alert;
      }
    } catch (err) {
      console.error('Error resolving alert:', err);
      throw err;
    }
  };

  // Initial fetch
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchActiveAlerts(), fetchAlertStats()]);
      setLoading(false);
    };

    fetchData();

    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchActiveAlerts, fetchAlertStats]);

  return {
    activeAlerts,
    alertStats,
    loading,
    error,
    acknowledgeAlert,
    dismissAlert,
    resolveAlert,
    refresh: fetchActiveAlerts
  };
}

/**
 * Hook for fetching alert history
 */
export function useAlertHistory(filters = {}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`${API_URL}/api/alerts/history?${params}`);
        const data = await response.json();

        if (data.success) {
          setHistory(data.data);
        }
      } catch (err) {
        console.error('Error fetching alert history:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [JSON.stringify(filters)]);

  return { history, loading };
}
