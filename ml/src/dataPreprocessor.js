import fs from 'fs';
import csv from 'csv-parser';
import createCsvWriter from 'csv-writer';
import _ from 'lodash';

export class DataPreprocessor {
  constructor() {
    this.requiredColumns = [
      'Transaction_ID',
      'Amount',
      'Merchant',
      'Category',
      'User_ID',
      'Timestamp',
      'Location',
      'Payment_Method'
    ];
  }

  async preprocessCSV(inputFilePath, outputFilePath) {
    try {
      console.log(`Starting data preprocessing for file: ${inputFilePath}`);
      
      // Step 1: Read and parse CSV
      const rawData = await this.readCSV(inputFilePath);
      console.log(`Read ${rawData.length} rows from CSV`);

      // Step 2: Clean and validate data
      const cleanedData = this.cleanData(rawData);
      console.log(`After cleaning: ${cleanedData.length} rows remaining`);

      // Step 3: Feature engineering
      const processedData = this.engineerFeatures(cleanedData);
      console.log(`Feature engineering completed`);

      // Step 4: Write cleaned data to output file
      await this.writeCSV(processedData, outputFilePath);
      console.log(`Preprocessed data saved to: ${outputFilePath}`);

      return {
        success: true,
        originalRows: rawData.length,
        cleanedRows: processedData.length,
        outputPath: outputFilePath,
        data: processedData,
        stats: this.getPreprocessingStats(rawData, processedData)
      };
    } catch (error) {
      console.error('Data preprocessing error:', error);
      throw error;
    }
  }

  async readCSV(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (error) => reject(error));
    });
  }

  cleanData(data) {
    return data
      .filter(row => this.isValidRow(row))
      .map(row => this.cleanRow(row))
      .filter(row => row !== null);
  }

  isValidRow(row) {
    // Check for required fields
    const hasTransactionId = row.Transaction_ID || row.TransactionID || row.transaction_id || row.id;
    const hasAmount = row.Amount || row.amount;
    
    return hasTransactionId && hasAmount && !this.isEmpty(hasAmount);
  }

  cleanRow(row) {
    try {
      // Normalize column names
      const cleanedRow = {
        Transaction_ID: this.normalizeTransactionId(row),
        Amount: this.normalizeAmount(row),
        Merchant: this.normalizeMerchant(row),
        Category: this.normalizeCategory(row),
        User_ID: this.normalizeUserId(row),
        Timestamp: this.normalizeTimestamp(row),
        Location: this.normalizeLocation(row),
        Payment_Method: this.normalizePaymentMethod(row)
      };

      // Validate cleaned row
      if (!cleanedRow.Transaction_ID || !cleanedRow.Amount) {
        return null;
      }

      return cleanedRow;
    } catch (error) {
      console.warn(`Error cleaning row: ${error.message}`);
      return null;
    }
  }

  normalizeTransactionId(row) {
    // Ensure we always have a valid Transaction_ID
    const id = row.Transaction_ID || row.TransactionID || row.transaction_id || row.id;
    if (id && id.toString().trim() !== '' && id !== 'null' && id !== 'undefined') {
      return id.toString().trim();
    }
    // Generate unique ID with timestamp and random component
    return `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }

  normalizeAmount(row) {
    const amount = row.Amount || row.amount || row.AMOUNT;
    if (this.isEmpty(amount)) return null;
    
    const numAmount = parseFloat(String(amount).replace(/[,$]/g, ''));
    return isNaN(numAmount) || numAmount <= 0 ? null : numAmount;
  }

  normalizeMerchant(row) {
    return row.Merchant || row.merchant || row.MERCHANT || row.merchant_name || 'Unknown Merchant';
  }

  normalizeCategory(row) {
    const category = row.Category || row.category || row.CATEGORY || row.merchant_category;
    const validCategories = ['E-commerce', 'Retail', 'Gas', 'Food', 'ATM', 'Online', 'Other'];
    
    if (!category) return 'Other';
    
    // Try to match with valid categories
    const matchedCategory = validCategories.find(cat => 
      cat.toLowerCase() === category.toLowerCase()
    );
    
    return matchedCategory || 'Other';
  }

  normalizeUserId(row) {
    return row.User_ID || row.UserID || row.user_id || row.customer_id || `USER-${Math.floor(Math.random() * 10000)}`;
  }

  normalizeTimestamp(row) {
    const timestamp = row.Timestamp || row.timestamp || row.date || row.Date || row.transaction_date;
    
    if (!timestamp) {
      return new Date().toISOString();
    }

    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  normalizeLocation(row) {
    return row.Location || row.location || row.LOCATION || row.city || 'Unknown';
  }

  normalizePaymentMethod(row) {
    const method = row.Payment_Method || row.payment_method || row.PaymentMethod || row.card_type;
    const validMethods = ['credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'];
    
    if (!method) return 'credit_card';
    
    const normalizedMethod = method.toLowerCase().replace(/[^a-z]/g, '_');
    return validMethods.includes(normalizedMethod) ? normalizedMethod : 'other';
  }

  engineerFeatures(data) {
    return data.map(row => {
      // Add derived features for ML model
      const engineeredRow = { ...row };

      // Hour of day feature
      const hour = new Date(row.Timestamp).getHours();
      engineeredRow.Hour_of_Day = hour;
      engineeredRow.Is_Night_Transaction = hour >= 22 || hour <= 6 ? 1 : 0;

      // Amount-based features
      engineeredRow.Is_High_Amount = row.Amount > 1000 ? 1 : 0;
      engineeredRow.Amount_Log = Math.log(row.Amount + 1);

      // Category encoding
      engineeredRow.Category_Risk_Score = this.getCategoryRiskScore(row.Category);

      // Location-based features
      engineeredRow.Is_Foreign = row.Location && !row.Location.toLowerCase().includes('us') ? 1 : 0;

      return engineeredRow;
    });
  }

  getCategoryRiskScore(category) {
    const riskScores = {
      'ATM': 0.8,
      'Online': 0.7,
      'Gas': 0.6,
      'E-commerce': 0.5,
      'Food': 0.3,
      'Retail': 0.4,
      'Other': 0.5
    };
    
    return riskScores[category] || 0.5;
  }

  async writeCSV(data, outputPath) {
    if (data.length === 0) {
      throw new Error('No data to write');
    }

    const csvWriter = createCsvWriter.createObjectCsvWriter({
      path: outputPath,
      header: Object.keys(data[0]).map(key => ({ id: key, title: key }))
    });

    await csvWriter.writeRecords(data);
  }

  isEmpty(value) {
    return value === null || 
           value === undefined || 
           value === '' || 
           (typeof value === 'string' && value.trim() === '') ||
           value === 'null' ||
           value === 'NULL' ||
           value === 'N/A' ||
           value === 'n/a';
  }

  // Get preprocessing statistics
  getPreprocessingStats(originalData, cleanedData) {
    return {
      originalRows: originalData.length,
      cleanedRows: cleanedData.length,
      removedRows: originalData.length - cleanedData.length,
      removalRate: ((originalData.length - cleanedData.length) / originalData.length * 100).toFixed(2) + '%',
      columns: Object.keys(cleanedData[0] || {}),
      dataQuality: {
        completeness: (cleanedData.length / originalData.length * 100).toFixed(2) + '%',
        avgAmount: cleanedData.reduce((sum, row) => sum + row.Amount, 0) / cleanedData.length,
        categories: [...new Set(cleanedData.map(row => row.Category))],
        timeRange: {
          earliest: Math.min(...cleanedData.map(row => new Date(row.Timestamp).getTime())),
          latest: Math.max(...cleanedData.map(row => new Date(row.Timestamp).getTime()))
        }
      }
    };
  }
}
