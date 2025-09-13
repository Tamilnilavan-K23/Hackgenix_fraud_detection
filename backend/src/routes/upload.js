import express from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import fs from 'fs';
import path from 'path';
import { protect } from '../middleware/auth.js';
import Transaction from '../models/Transaction.js';
import { logger } from '../utils/logger.js';
import { mlService } from '../services/mlService.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.csv', '.json'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and JSON files are allowed'), false);
    }
  }
});

// @desc    Upload and process CSV file with ML fraud detection
// @route   POST /api/upload
// @access  Private
router.post('/', protect, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    // Only process CSV files with ML service
    if (fileExtension !== '.csv') {
      // Clean up file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(400).json({
        success: false,
        message: 'Only CSV files are supported for ML processing'
      });
    }

    try {
      logger.info(`Processing CSV file with ML service: ${req.file.originalname}`);
      
      // Send file to ML service for processing
      const mlResult = await mlService.processCSVFile(filePath);
      
      logger.info(`ML processing completed: ${mlResult.predictions.totalPredictions} predictions generated`);

      // Emit real-time update
      const io = req.app.get('io');
      if (io) {
        io.emit('fraudAnalysisComplete', {
          filename: req.file.originalname,
          totalTransactions: mlResult.predictions.totalPredictions,
          fraudulentTransactions: mlResult.predictions.fraudulentTransactions,
          highRiskTransactions: mlResult.predictions.highRiskTransactions,
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        success: true,
        message: `CSV processed successfully with ML fraud detection`,
        data: {
          filename: req.file.originalname,
          preprocessing: mlResult.preprocessing,
          predictions: mlResult.predictions,
          database: mlResult.database
        }
      });

    } catch (mlError) {
      logger.error('ML processing error:', mlError);
      return res.status(500).json({
        success: false,
        message: 'ML processing failed: ' + mlError.message
      });
    } finally {
      // Clean up uploaded file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    next(error);
  }
});

// @desc    Process uploaded data for fraud detection
// @route   POST /api/upload/analyze
// @access  Private
router.post('/analyze', protect, async (req, res, next) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data provided for analysis'
      });
    }

    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const record = data[i];
        
        // Generate unique transaction ID if not provided
        const transactionId = record.transactionId || 
          `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

        // Calculate fraud probability
        const fraudProbability = calculateFraudProbability(record);
        const riskLevel = fraudProbability >= 80 ? 'high' : 
                         fraudProbability >= 50 ? 'medium' : 'low';
        const status = fraudProbability >= 90 ? 'fraud' :
                       fraudProbability >= 70 ? 'suspicious' : 'safe';

        const analyzedRecord = {
          transactionId,
          amount: parseFloat(record.amount) || 0,
          currency: record.currency || 'USD',
          merchant: {
            name: record.merchant || record.merchantName || 'Unknown',
            category: record.category || record.merchantCategory || 'Other',
            location: record.location || record.merchantLocation
          },
          user: {
            userId: record.userId || record.customerId || `USER-${i}`,
            email: record.email || record.userEmail,
            name: record.userName || record.customerName
          },
          paymentMethod: {
            type: record.paymentType || 'credit_card',
            last4: record.cardLast4,
            brand: record.cardBrand
          },
          timestamp: record.timestamp ? new Date(record.timestamp) : new Date(),
          fraudAnalysis: {
            probability: fraudProbability,
            riskLevel,
            status,
            factors: generateFraudFactors(record),
            confidence: Math.random() * 0.3 + 0.7
          }
        };

        results.push(analyzedRecord);

      } catch (recordError) {
        errors.push({
          index: i,
          error: recordError.message,
          record: data[i]
        });
      }
    }

    // Emit real-time update for batch processing
    const io = req.app.get('io');
    io.emit('batchAnalysisComplete', {
      totalRecords: data.length,
      successfulRecords: results.length,
      errors: errors.length,
      highRiskCount: results.filter(r => r.fraudAnalysis.riskLevel === 'high').length
    });

    logger.info(`Batch analysis completed: ${results.length} successful, ${errors.length} errors`);

    res.status(200).json({
      success: true,
      message: `Analysis completed. ${results.length} records processed successfully.`,
      data: {
        results,
        errors,
        summary: {
          totalRecords: data.length,
          successfulRecords: results.length,
          errorRecords: errors.length,
          highRiskCount: results.filter(r => r.fraudAnalysis.riskLevel === 'high').length,
          mediumRiskCount: results.filter(r => r.fraudAnalysis.riskLevel === 'medium').length,
          lowRiskCount: results.filter(r => r.fraudAnalysis.riskLevel === 'low').length
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Save analyzed data to database
// @route   POST /api/upload/save
// @access  Private
router.post('/save', protect, async (req, res, next) => {
  try {
    const { data } = req.body;

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No data provided to save'
      });
    }

    const savedTransactions = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      try {
        const record = data[i];
        
        // Check if transaction already exists
        const existingTransaction = await Transaction.findOne({ 
          transactionId: record.transactionId 
        });

        if (existingTransaction) {
          errors.push({
            index: i,
            error: 'Transaction already exists',
            transactionId: record.transactionId
          });
          continue;
        }

        const transaction = await Transaction.create(record);
        savedTransactions.push(transaction);

      } catch (saveError) {
        errors.push({
          index: i,
          error: saveError.message,
          transactionId: data[i].transactionId
        });
      }
    }

    logger.info(`Batch save completed: ${savedTransactions.length} saved, ${errors.length} errors`);

    res.status(200).json({
      success: true,
      message: `${savedTransactions.length} transactions saved successfully.`,
      data: {
        savedCount: savedTransactions.length,
        errorCount: errors.length,
        errors: errors.slice(0, 10) // Limit error details
      }
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to parse CSV file
function parseCSVFile(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Helper function to parse JSON file
function parseJSONFile(filePath) {
  return new Promise((resolve, reject) => {
    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const jsonData = JSON.parse(fileContent);
      
      if (Array.isArray(jsonData)) {
        resolve(jsonData);
      } else if (jsonData.data && Array.isArray(jsonData.data)) {
        resolve(jsonData.data);
      } else {
        resolve([jsonData]);
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Helper function to validate transaction data
function validateTransactionData(data) {
  return data.filter(record => {
    // Basic validation - ensure required fields exist
    return record && (record.amount || record.Amount) && 
           (record.merchant || record.merchantName || record.Merchant);
  }).map(record => {
    // Normalize field names
    return {
      transactionId: record.transactionId || record.TransactionId || record.id,
      amount: record.amount || record.Amount,
      merchant: record.merchant || record.merchantName || record.Merchant,
      category: record.category || record.Category || record.merchantCategory,
      timestamp: record.timestamp || record.Timestamp || record.date || record.Date,
      userId: record.userId || record.UserId || record.customerId,
      email: record.email || record.Email || record.userEmail,
      paymentType: record.paymentType || record.PaymentType || 'credit_card',
      location: record.location || record.Location
    };
  });
}

// Helper function to calculate fraud probability (same as in transactions.js)
function calculateFraudProbability({ amount, merchant, category, location, timestamp }) {
  let probability = 0;

  const numAmount = parseFloat(amount) || 0;

  // Amount-based risk
  if (numAmount > 10000) probability += 30;
  else if (numAmount > 5000) probability += 20;
  else if (numAmount > 1000) probability += 10;

  // Time-based risk
  if (timestamp) {
    const hour = new Date(timestamp).getHours();
    if (hour >= 23 || hour <= 5) probability += 15;
  }

  // Merchant category risk
  const highRiskCategories = ['ATM', 'Online', 'Gas'];
  if (highRiskCategories.includes(category)) probability += 10;

  // Location risk
  if (location && typeof location === 'string' && !location.toLowerCase().includes('us')) {
    probability += 20;
  }

  // Add randomness
  probability += Math.random() * 20;

  return Math.min(Math.round(probability), 100);
}

// Helper function to generate fraud factors
function generateFraudFactors(record) {
  const factors = [];
  const amount = parseFloat(record.amount) || 0;

  if (amount > 5000) {
    factors.push({
      factor: 'high_amount',
      weight: 0.3,
      description: 'Transaction amount is unusually high'
    });
  }

  if (record.category === 'ATM') {
    factors.push({
      factor: 'atm_transaction',
      weight: 0.2,
      description: 'ATM transactions have higher fraud risk'
    });
  }

  if (record.location && !record.location.toLowerCase().includes('us')) {
    factors.push({
      factor: 'foreign_transaction',
      weight: 0.25,
      description: 'Transaction from foreign location'
    });
  }

  return factors;
}

export default router;
