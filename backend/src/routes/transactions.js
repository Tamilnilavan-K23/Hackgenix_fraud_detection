import express from 'express';
import Transaction from '../models/Transaction.js';
import { protect, apiKeyAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// @desc    Get all transactions with filtering and pagination
// @route   GET /api/transactions
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      riskLevel,
      merchant,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (status) {
      query['fraudAnalysis.status'] = status;
    }

    if (riskLevel) {
      query['fraudAnalysis.riskLevel'] = riskLevel;
    }

    if (merchant) {
      query['merchant.name'] = { $regex: merchant, $options: 'i' };
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    if (minAmount || maxAmount) {
      query.amount = {};
      if (minAmount) query.amount.$gte = parseFloat(minAmount);
      if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
    }

    if (search) {
      query.$or = [
        { transactionId: { $regex: search, $options: 'i' } },
        { 'merchant.name': { $regex: search, $options: 'i' } },
        { 'user.email': { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('reviewedBy', 'firstName lastName email'),
      Transaction.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single transaction
// @route   GET /api/transactions/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('reviewedBy', 'firstName lastName email');

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create new transaction (for API integration)
// @route   POST /api/transactions
// @access  Private (API Key)
router.post('/', apiKeyAuth, async (req, res, next) => {
  try {
    const {
      transactionId,
      amount,
      currency = 'USD',
      merchant,
      user,
      paymentMethod,
      location,
      deviceInfo,
      timestamp = new Date()
    } = req.body;

    // Check if transaction already exists
    const existingTransaction = await Transaction.findOne({ transactionId });
    if (existingTransaction) {
      return res.status(400).json({
        success: false,
        message: 'Transaction with this ID already exists'
      });
    }

    // Simple fraud detection algorithm (in production, this would be more sophisticated)
    const fraudProbability = calculateFraudProbability({
      amount,
      merchant,
      user,
      location,
      timestamp
    });

    const riskLevel = fraudProbability >= 80 ? 'high' : 
                     fraudProbability >= 50 ? 'medium' : 'low';

    const status = fraudProbability >= 90 ? 'fraud' :
                   fraudProbability >= 70 ? 'suspicious' : 'safe';

    const transaction = await Transaction.create({
      transactionId,
      amount,
      currency,
      merchant,
      user,
      paymentMethod,
      location,
      deviceInfo,
      timestamp,
      fraudAnalysis: {
        probability: fraudProbability,
        riskLevel,
        status,
        factors: generateFraudFactors({ amount, merchant, user, location }),
        confidence: Math.random() * 0.3 + 0.7 // 0.7 to 1.0
      }
    });

    // Emit real-time update
    const io = req.app.get('io');
    io.emit('newTransaction', {
      id: transaction._id,
      transactionId: transaction.transactionId,
      amount: transaction.amount,
      merchant: transaction.merchant.name,
      fraudProbability: transaction.fraudAnalysis.probability,
      riskLevel: transaction.fraudAnalysis.riskLevel,
      timestamp: transaction.timestamp
    });

    logger.info(`New transaction created: ${transactionId} with ${fraudProbability}% fraud probability`);

    res.status(201).json({
      success: true,
      data: {
        transactionId: transaction.transactionId,
        fraudProbability: transaction.fraudAnalysis.probability,
        riskLevel: transaction.fraudAnalysis.riskLevel,
        status: transaction.fraudAnalysis.status,
        factors: transaction.fraudAnalysis.factors
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update transaction status (for manual review)
// @route   PUT /api/transactions/:id/status
// @access  Private
router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const { status, notes } = req.body;

    if (!['safe', 'suspicious', 'fraud'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be safe, suspicious, or fraud'
      });
    }

    const transaction = await Transaction.findById(req.params.id);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    transaction.fraudAnalysis.status = status;
    transaction.reviewedBy = req.user._id;
    transaction.reviewedAt = new Date();
    if (notes) transaction.notes = notes;

    await transaction.save();

    logger.info(`Transaction ${transaction.transactionId} status updated to ${status} by ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: transaction
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Bulk analyze transactions
// @route   POST /api/transactions/analyze
// @access  Private
router.post('/analyze', protect, async (req, res, next) => {
  try {
    const { transactions } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of transactions to analyze'
      });
    }

    const results = [];

    for (const txnData of transactions) {
      const fraudProbability = calculateFraudProbability(txnData);
      const riskLevel = fraudProbability >= 80 ? 'high' : 
                       fraudProbability >= 50 ? 'medium' : 'low';
      const status = fraudProbability >= 90 ? 'fraud' :
                     fraudProbability >= 70 ? 'suspicious' : 'safe';

      results.push({
        ...txnData,
        fraudAnalysis: {
          probability: fraudProbability,
          riskLevel,
          status,
          factors: generateFraudFactors(txnData)
        }
      });
    }

    res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to calculate fraud probability
function calculateFraudProbability({ amount, merchant, user, location, timestamp }) {
  let probability = 0;

  // Amount-based risk
  if (amount > 10000) probability += 30;
  else if (amount > 5000) probability += 20;
  else if (amount > 1000) probability += 10;

  // Time-based risk (late night transactions)
  const hour = new Date(timestamp).getHours();
  if (hour >= 23 || hour <= 5) probability += 15;

  // Merchant category risk
  const highRiskCategories = ['ATM', 'Online', 'Gas'];
  if (highRiskCategories.includes(merchant?.category)) probability += 10;

  // Location risk (simplified)
  if (location?.country && location.country !== 'US') probability += 20;

  // Add some randomness to simulate ML model uncertainty
  probability += Math.random() * 20;

  return Math.min(Math.round(probability), 100);
}

// Helper function to generate fraud factors
function generateFraudFactors({ amount, merchant, user, location }) {
  const factors = [];

  if (amount > 5000) {
    factors.push({
      factor: 'high_amount',
      weight: 0.3,
      description: 'Transaction amount is unusually high'
    });
  }

  if (merchant?.category === 'ATM') {
    factors.push({
      factor: 'atm_transaction',
      weight: 0.2,
      description: 'ATM transactions have higher fraud risk'
    });
  }

  if (location?.country && location.country !== 'US') {
    factors.push({
      factor: 'foreign_transaction',
      weight: 0.25,
      description: 'Transaction from foreign location'
    });
  }

  return factors;
}

export default router;
