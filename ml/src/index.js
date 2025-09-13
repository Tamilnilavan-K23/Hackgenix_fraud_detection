import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { DataPreprocessor } from './dataPreprocessor.js';
import { FraudDetectionModel } from './fraudDetectionModel.js';
import { DatabaseService } from './databaseService.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.ML_PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Initialize services
const preprocessor = new DataPreprocessor();
const fraudModel = new FraudDetectionModel();
const dbService = new DatabaseService();

// Routes

// Root route
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to Detectra ML Service',
    tagline: 'No Panic, Just Magic',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      processCSV: '/process-csv',
      stats: '/stats',
      transactions: '/transactions',
      alerts: '/alerts',
      search: '/search'
    },
    model: fraudModel.getModelInfo()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Detectra ML Service',
    tagline: 'No Panic, Just Magic',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    model: fraudModel.getModelInfo()
  });
});

// Process uploaded CSV file
app.post('/process-csv', upload.single('file'), async (req, res) => {
  let inputPath = null;
  let outputPath = null;
  
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded' 
      });
    }

    console.log(`Processing file: ${req.file.filename}`);
    
    inputPath = req.file.path;
    outputPath = path.join(uploadsDir, `cleaned-${req.file.filename}`);
    
    // Step 1: Preprocess the data
    console.log('Step 1: Preprocessing data...');
    const preprocessResult = await preprocessor.preprocessCSV(inputPath, outputPath);
    
    // Step 2: Run fraud detection
    console.log('Step 2: Running fraud detection...');
    const predictions = await fraudModel.predict(preprocessResult.data);
    
    // Step 3: Save predictions to CSV in database/ folder
    console.log('Step 3: Saving predictions to CSV...');
    const csvPath = await fraudModel.savePredictionsToCSV(predictions);
    console.log(`Results saved to: ${csvPath}`);
    
    // Step 4: Save to MongoDB database
    console.log('Step 4: Saving to MongoDB...');
    const dbResult = await dbService.saveTransactions(predictions);
    
    console.log('✅ Pipeline completed successfully');
    
    res.json({
      success: true,
      message: 'CSV processed successfully with ML fraud detection',
      preprocessing: {
        originalRows: preprocessResult.originalRows,
        cleanedRows: preprocessResult.cleanedRows,
        stats: preprocessResult.stats
      },
      predictions: {
        totalPredictions: predictions.length,
        fraudulentTransactions: predictions.filter(p => p.fraud_flag === 1).length,
        highRiskTransactions: predictions.filter(p => p.risk_level === 'HIGH').length
      },
      database: dbResult,
      csvPath: csvPath,
      results: predictions // Add fraud results for frontend display
    });
    
  } catch (error) {
    console.error('❌ CSV processing error:', error);
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to process CSV', 
      details: error.message,
      fallback: 'Pipeline failed but system remains stable'
    });
  } finally {
    // Clean up uploaded files
    try {
      if (inputPath && fs.existsSync(inputPath)) {
        fs.unlinkSync(inputPath);
        console.log('Cleaned up input file');
      }
      if (outputPath && fs.existsSync(outputPath)) {
        fs.unlinkSync(outputPath);
        console.log('Cleaned up output file');
      }
    } catch (cleanupError) {
      console.warn('File cleanup warning:', cleanupError.message);
    }
  }
});

// Get transaction statistics
app.get('/stats', async (req, res) => {
  try {
    const stats = await dbService.getTransactionStats();
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Get transactions with optional filters
app.get('/transactions', async (req, res) => {
  try {
    const { risk_level, fraud_flag, limit = 100 } = req.query;
    
    const filter = {};
    if (risk_level) filter.risk_level = risk_level;
    if (fraud_flag !== undefined) filter.fraud_flag = parseInt(fraud_flag);
    
    const transactions = await dbService.getTransactions(filter, parseInt(limit));
    res.json(transactions);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Get alerts
app.get('/alerts', async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    
    const filter = {};
    if (status) filter.status = status;
    
    const alerts = await dbService.getAlerts(filter, parseInt(limit));
    res.json(alerts);
  } catch (error) {
    console.error('Alerts fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// Search transactions
app.get('/search', async (req, res) => {
  try {
    const { q, risk_level, fraud_flag } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    
    const filters = {};
    if (risk_level) filters.risk_level = risk_level;
    if (fraud_flag !== undefined) filters.fraud_flag = parseInt(fraud_flag);
    
    const results = await dbService.searchTransactions(q, filters);
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// Update alert status
app.patch('/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const success = await dbService.updateAlert(id, updates);
    
    if (success) {
      res.json({ success: true, message: 'Alert updated successfully' });
    } else {
      res.status(404).json({ error: 'Alert not found' });
    }
  } catch (error) {
    console.error('Alert update error:', error);
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

// Train model endpoint (for future use)
app.post('/train', async (req, res) => {
  try {
    const { trainingData } = req.body;
    
    if (!trainingData || !Array.isArray(trainingData)) {
      return res.status(400).json({ error: 'Training data is required' });
    }
    
    const result = await fraudModel.trainModel(trainingData);
    res.json(result);
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({ error: 'Model training failed' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
  try {
    // Initialize database connection and create indexes
    await dbService.connect();
    console.log('Connected to MongoDB');
    await dbService.createIndexes();
    console.log('Database indexes created successfully');
    app.listen(PORT, () => {
      console.log(`Detectra ML Service running on port ${PORT}`);
      console.log(`✨ No Panic, Just Magic`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down ML service...');
  await dbService.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down ML service...');
  await dbService.disconnect();
  process.exit(0);
});

startServer();
