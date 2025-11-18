import { useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Hook for fetching device metrics
 */
export function useDeviceMetrics(deviceId) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    if (!deviceId) return;

    try {
      const response = await fetch(`${API_URL}/api/metrics/device/${deviceId}`);
      const data = await response.json();

      if (data.success) {
        setMetrics(data.metrics);
      }
    } catch (err) {
      console.error('Error fetching device metrics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  useEffect(() => {
    fetchMetrics();

    // Refresh every 15 seconds
    const interval = setInterval(fetchMetrics, 15000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return { metrics, loading, error, refresh: fetchMetrics };
}

/**
 * Hook for fetching metrics summary
 */
export function useMetricsSummary(siteType = 'ALL') {
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetch(`${API_URL}/api/metrics/summary/${siteType}`);
        const data = await response.json();

        if (data.success) {
          setSummary(data.data);
        }
      } catch (err) {
        console.error('Error fetching metrics summary:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();

    // Refresh every 30 seconds
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [siteType]);

  return { summary, loading };
}

/**
 * Hook for fetching energy data
 */
export function useEnergyData(siteType = 'ALL') {
  const [energyData, setEnergyData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEnergy = async () => {
      try {
        const response = await fetch(`${API_URL}/api/metrics/energy/${siteType}`);
        const data = await response.json();

        if (data.success) {
          setEnergyData(data.data);
        }
      } catch (err) {
        console.error('Error fetching energy data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEnergy();

    // Refresh every 30 seconds
    const interval = setInterval(fetchEnergy, 30000);
    return () => clearInterval(interval);
  }, [siteType]);

  return { energyData, loading };
}

/**
 * Hook for fetching anomalies
 */
export function useAnomalies(deviceId = null, hours = 24) {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAnomalies = async () => {
      try {
        const endpoint = deviceId
          ? `${API_URL}/api/metrics/anomalies/${deviceId}?hours=${hours}`
          : `${API_URL}/api/metrics/anomalies?hours=${hours}`;

        const response = await fetch(endpoint);
        const data = await response.json();

        if (data.success) {
          setAnomalies(data.data);
        }
      } catch (err) {
        console.error('Error fetching anomalies:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAnomalies();

    // Refresh every minute
    const interval = setInterval(fetchAnomalies, 60000);
    return () => clearInterval(interval);
  }, [deviceId, hours]);

  return { anomalies, loading };
}
