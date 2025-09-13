import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { logger } from '../utils/logger.js';

class MLService {
  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:5001';
  }

  async processCSVFile(filePath) {
    try {
      logger.info(`Sending CSV file to ML service: ${filePath}`);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath));
      
      const response = await axios.post(`${this.mlServiceUrl}/process-csv`, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 300000, // 5 minutes timeout
      });
      
      logger.info('ML processing completed successfully');
      return response.data;
    } catch (error) {
      logger.error('ML service error:', error.message);
      throw new Error(`ML processing failed: ${error.message}`);
    }
  }

  async getMLStats() {
    try {
      const response = await axios.get(`${this.mlServiceUrl}/stats`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch ML stats:', error.message);
      throw error;
    }
  }

  async getMLTransactions(filters = {}) {
    try {
      const params = new URLSearchParams(filters);
      const response = await axios.get(`${this.mlServiceUrl}/transactions?${params}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch ML transactions:', error.message);
      throw error;
    }
  }

  async getMLAlerts(filters = {}) {
    try {
      const params = new URLSearchParams(filters);
      const response = await axios.get(`${this.mlServiceUrl}/alerts?${params}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to fetch ML alerts:', error.message);
      throw error;
    }
  }

  async searchMLTransactions(query, filters = {}) {
    try {
      const params = new URLSearchParams({ q: query, ...filters });
      const response = await axios.get(`${this.mlServiceUrl}/search?${params}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to search ML transactions:', error.message);
      throw error;
    }
  }

  async updateMLAlert(alertId, updates) {
    try {
      const response = await axios.patch(`${this.mlServiceUrl}/alerts/${alertId}`, updates);
      return response.data;
    } catch (error) {
      logger.error('Failed to update ML alert:', error.message);
      throw error;
    }
  }

  async checkMLServiceHealth() {
    try {
      const response = await axios.get(`${this.mlServiceUrl}/health`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      logger.warn('ML service health check failed:', error.message);
      return { status: 'UNAVAILABLE', error: error.message };
    }
  }
}

export const mlService = new MLService();
