/**
 * NILM Service Integration
 * Proxy endpoints to Python NILM microservice
 */

import fetch from 'node-fetch';

const NILM_SERVICE_URL = process.env.NILM_SERVICE_URL || 'http://localhost:8000';

// ============================================================================
// Helper Functions
// ============================================================================

async function proxyToNILM(endpoint, method = 'GET', body = null) {
  const url = `${NILM_SERVICE_URL}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || 'NILM service error');
  }

  return data;
}

// ============================================================================
// Real-time Disaggregation
// ============================================================================

export async function disaggregateRealtime(reading, algorithms, userId) {
  /**
   * Perform real-time disaggregation on a power reading
   *
   * @param {Object} reading - Power reading data
   * @param {Array<string>} algorithms - Algorithms to use (e.g., ['Seq2Point', 'CO'])
   * @param {number} userId - User ID for user-specific models
   * @returns {Promise<Array>} Disaggregation results
   */
  try {
    const results = await proxyToNILM('/api/disaggregate/realtime', 'POST', {
      reading,
      algorithms: algorithms || ['Seq2Point'],
      user_id: userId
    });

    return results;
  } catch (error) {
    console.error('Real-time disaggregation error:', error);
    throw error;
  }
}

// ============================================================================
// Historical Disaggregation
// ============================================================================

export async function disaggregateHistorical(
  deviceId,
  siteType,
  startTimestamp,
  endTimestamp,
  algorithms,
  userId
) {
  /**
   * Start a batch disaggregation job for historical data
   *
   * @returns {Promise<Object>} Job info with job_id
   */
  try {
    const job = await proxyToNILM('/api/disaggregate/historical', 'POST', {
      device_id: deviceId,
      site_type: siteType,
      start_timestamp: startTimestamp,
      end_timestamp: endTimestamp,
      algorithms: algorithms || ['Seq2Point'],
      user_id: userId
    });

    return job;
  } catch (error) {
    console.error('Historical disaggregation error:', error);
    throw error;
  }
}

export async function getJobStatus(jobId) {
  /**
   * Get status of a disaggregation job
   */
  try {
    const status = await proxyToNILM(`/api/disaggregate/job/${jobId}`);
    return status;
  } catch (error) {
    console.error('Get job status error:', error);
    throw error;
  }
}

// ============================================================================
// Appliance Management
// ============================================================================

export async function getAppliances(userId, siteType, isGlobal = false) {
  /**
   * Get appliances (global or user-specific)
   */
  try {
    const params = new URLSearchParams();
    if (userId !== null && userId !== undefined) params.append('user_id', userId);
    if (siteType) params.append('site_type', siteType);
    if (isGlobal) params.append('is_global', 'true');

    const result = await proxyToNILM(`/api/appliances?${params.toString()}`);
    return result;
  } catch (error) {
    console.error('Get appliances error:', error);
    throw error;
  }
}

export async function getApplianceCategories() {
  /**
   * Get all appliance categories
   */
  try {
    const result = await proxyToNILM('/api/appliances/categories');
    return result;
  } catch (error) {
    console.error('Get categories error:', error);
    throw error;
  }
}

// ============================================================================
// Labeling
// ============================================================================

export async function createLabel(labelData) {
  /**
   * Create an appliance label (ground truth)
   */
  try {
    const result = await proxyToNILM('/api/labels', 'POST', labelData);
    return result;
  } catch (error) {
    console.error('Create label error:', error);
    throw error;
  }
}

export async function getUserLabels(userId, deviceId = null, applianceId = null) {
  /**
   * Get labels created by a user
   */
  try {
    const params = new URLSearchParams();
    if (deviceId) params.append('device_id', deviceId);
    if (applianceId) params.append('appliance_id', applianceId);

    const result = await proxyToNILM(`/api/labels/${userId}?${params.toString()}`);
    return result;
  } catch (error) {
    console.error('Get labels error:', error);
    throw error;
  }
}

// ============================================================================
// Models
// ============================================================================

export async function getModels(algorithm = null, userId = null) {
  /**
   * Get available NILM models
   */
  try {
    const params = new URLSearchParams();
    if (algorithm) params.append('algorithm', algorithm);
    if (userId !== null) params.append('user_id', userId);

    const result = await proxyToNILM(`/api/models?${params.toString()}`);
    return result;
  } catch (error) {
    console.error('Get models error:', error);
    throw error;
  }
}

export async function trainModel(trainingConfig) {
  /**
   * Start a model training job
   *
   * @param {Object} trainingConfig
   * @param {string} trainingConfig.algorithm - Algorithm name
   * @param {string} trainingConfig.dataset_name - Dataset (REDD, UK-DALE, etc.)
   * @param {number} trainingConfig.user_id - User ID
   * @param {Array<number>} trainingConfig.appliance_ids - Appliances to train
   * @param {number} trainingConfig.epochs - Training epochs
   * @param {number} trainingConfig.batch_size - Batch size
   */
  try {
    const job = await proxyToNILM('/api/models/train', 'POST', trainingConfig);
    return job;
  } catch (error) {
    console.error('Train model error:', error);
    throw error;
  }
}

// ============================================================================
// Statistics
// ============================================================================

export async function getApplianceStats(deviceId, siteType, days = 30, algorithm = null) {
  /**
   * Get appliance usage statistics
   */
  try {
    const params = new URLSearchParams({
      site_type: siteType,
      days: days.toString()
    });
    if (algorithm) params.append('algorithm', algorithm);

    const result = await proxyToNILM(`/api/stats/appliances/${deviceId}?${params.toString()}`);
    return result;
  } catch (error) {
    console.error('Get appliance stats error:', error);
    throw error;
  }
}

export async function getAlgorithmPerformance() {
  /**
   * Compare performance of different algorithms
   */
  try {
    const result = await proxyToNILM('/api/stats/algorithms');
    return result;
  } catch (error) {
    console.error('Get algorithm performance error:', error);
    throw error;
  }
}

// ============================================================================
// Datasets
// ============================================================================

export async function getAvailableDatasets() {
  /**
   * Get list of available datasets
   */
  try {
    const result = await proxyToNILM('/api/datasets');
    return result;
  } catch (error) {
    console.error('Get datasets error:', error);
    throw error;
  }
}

export async function downloadDataset(datasetName) {
  /**
   * Download a public dataset
   */
  try {
    const result = await proxyToNILM('/api/datasets/download', 'POST', {
      dataset_name: datasetName
    });
    return result;
  } catch (error) {
    console.error('Download dataset error:', error);
    throw error;
  }
}

// ============================================================================
// Health Check
// ============================================================================

export async function checkNILMServiceHealth() {
  /**
   * Check if NILM service is running
   */
  try {
    const result = await proxyToNILM('/health');
    return result;
  } catch (error) {
    console.error('NILM service health check failed:', error);
    return { status: 'unhealthy', error: error.message };
  }
}
