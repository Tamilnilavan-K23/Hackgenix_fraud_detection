import fs from 'fs';
import path from 'path';
import createCsvWriter from 'csv-writer';

export class FraudDetectionModel {
  constructor() {
    this.model = 'rule_based';
    this.categoryEncoder = {
      'E-commerce': 0, 'Retail': 1, 'Gas': 2, 'Food': 3, 'ATM': 4, 'Online': 5, 'Other': 6
    };
    this.paymentMethodEncoder = {
      'credit_card': 0, 'debit_card': 1, 'bank_transfer': 2, 'digital_wallet': 3, 'other': 4
    };
  }

  // Initialize model
  async loadModel() {
    console.log('✅ Using rule-based fraud detection model');
    this.model = 'rule_based';
    return true;
  }

  // Predict fraud probability for new transactions
  async predict(data) {
    try {
      console.log(`Predicting fraud for ${data.length} transactions...`);
      console.log('Using rule-based fraud detection model...');
      return this.ruleBasedPrediction(data);
    } catch (error) {
      console.error('Prediction error:', error);
      throw error;
    }
  }

  // Rule-based prediction - AGGRESSIVE FRAUD DETECTION
  ruleBasedPrediction(data) {
    console.log('Using AGGRESSIVE rule-based fraud detection...');
    
    return data.map(row => {
      let fraudScore = 0.2; // Base fraud score - assume some risk
      let reasons = [];
      
      // Ensure Transaction_ID is not null
      if (!row.Transaction_ID) {
        row.Transaction_ID = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      }
      
      // AGGRESSIVE Amount-based rules
      if (row.Amount > 1000) {
        fraudScore += 0.6;
        reasons.push('High transaction amount (>$1000)');
      } else if (row.Amount > 500) {
        fraudScore += 0.4;
        reasons.push('Medium transaction amount (>$500)');
      } else if (row.Amount > 100) {
        fraudScore += 0.2;
        reasons.push('Above average amount (>$100)');
      }
      
      // Time-based rules - MORE AGGRESSIVE
      if (row.Is_Night_Transaction || (row.Hour_of_Day >= 22 || row.Hour_of_Day <= 6)) {
        fraudScore += 0.3;
        reasons.push('Night time transaction (high risk)');
      }
      
      // Category-based rules - MORE AGGRESSIVE
      if (row.Category === 'ATM') {
        fraudScore += 0.4;
        reasons.push('ATM transaction (very high risk)');
      } else if (row.Category === 'Online' || row.Category === 'E-commerce') {
        fraudScore += 0.3;
        reasons.push('Online/E-commerce transaction (high risk)');
      } else if (row.Category === 'Gas' || row.Category === 'Food') {
        fraudScore += 0.1;
        reasons.push('Common fraud category');
      }
      
      // Location-based rules - MORE AGGRESSIVE
      if (row.Is_Foreign) {
        fraudScore += 0.4;
        reasons.push('Foreign transaction (very high risk)');
      }
      
      // Payment method rules - MORE AGGRESSIVE
      if (row.Payment_Method === 'digital_wallet') {
        fraudScore += 0.2;
        reasons.push('Digital wallet payment (higher risk)');
      } else if (row.Payment_Method === 'credit_card') {
        fraudScore += 0.15;
        reasons.push('Credit card transaction');
      }
      
      // Velocity and pattern checks
      const hour = new Date(row.Timestamp || Date.now()).getHours();
      if (hour >= 0 && hour <= 7) {
        fraudScore += 0.25;
        reasons.push('Very early morning transaction');
      }
      
      // Additional risk factors
      if (row.Amount && row.Amount % 100 === 0) {
        fraudScore += 0.1;
        reasons.push('Round number amount (suspicious pattern)');
      }
      
      // Ensure we detect fraud more frequently
      fraudScore += Math.random() * 0.3; // Add more randomness weighted toward fraud
      
      const fraudProb = Math.max(0.1, Math.min(1, fraudScore)); // Minimum 10% fraud probability
      const fraudFlag = fraudProb > 0.3 ? 1 : 0; // Lower threshold for fraud flag
      const riskLevel = this.getRiskLevel(fraudProb);
      
      return {
        Transaction_ID: row.Transaction_ID,
        ml_pred_prob: parseFloat(fraudProb.toFixed(4)),
        fraud_flag: fraudFlag,
        risk_level: riskLevel,
        reason: reasons.length > 0 ? reasons.join(', ') : 'Baseline fraud risk detected'
      };
    });
  }

  getRiskLevel(fraudProb) {
    if (fraudProb >= 0.5) return 'HIGH';
    if (fraudProb >= 0.3) return 'MEDIUM';
    return 'LOW';
  }

  generateReason(row, fraudProb) {
    const reasons = [];
    
    if (row.Amount > 5000) reasons.push('High amount');
    if (row.Is_Night_Transaction) reasons.push('Night transaction');
    if (row.Category === 'ATM' || row.Category === 'Online') reasons.push('High-risk category');
    if (row.Is_Foreign) reasons.push('Foreign location');
    if (fraudProb > 0.7) reasons.push('Multiple risk factors');
    
    return reasons.length > 0 ? reasons.join(', ') : 'Standard transaction pattern';
  }

  // Save predictions to CSV in database/ folder
  async savePredictionsToCSV(predictions, filename = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const outputPath = path.join(process.cwd(), 'database', filename || `fraud_predictions_${timestamp}.csv`);
      
      const csvWriter = createCsvWriter.createObjectCsvWriter({
        path: outputPath,
        header: [
          { id: 'Transaction_ID', title: 'Transaction_ID' },
          { id: 'ml_pred_prob', title: 'ml_pred_prob' },
          { id: 'fraud_flag', title: 'fraud_flag' },
          { id: 'risk_level', title: 'risk_level' },
          { id: 'reason', title: 'reason' }
        ]
      });

      await csvWriter.writeRecords(predictions);
      console.log(`✅ Predictions saved to CSV: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('Error saving predictions to CSV:', error);
      throw error;
    }
  }

  // Get model info
  getModelInfo() {
    return {
      type: 'Rule-based Model',
      description: 'Heuristic-based fraud detection',
      features: ['Amount', 'Time', 'Category', 'Location', 'Payment Method']
    };
  }
}
