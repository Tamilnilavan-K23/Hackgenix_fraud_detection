import express from 'express';
import Alert from '../models/Alert.js';
import Transaction from '../models/Transaction.js';
import { protect, authorize } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// @desc    Get all alerts with filtering and pagination
// @route   GET /api/alerts
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      status,
      severity,
      type,
      assignedTo,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};

    if (status) query.status = status;
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (assignedTo) query.assignedTo = assignedTo;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [alerts, total] = await Promise.all([
      Alert.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .populate('transaction', 'transactionId amount merchant.name')
        .populate('assignedTo', 'firstName lastName email')
        .populate('resolution.resolvedBy', 'firstName lastName email'),
      Alert.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: alerts,
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

// @desc    Get single alert
// @route   GET /api/alerts/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const alert = await Alert.findById(req.params.id)
      .populate('transaction')
      .populate('assignedTo', 'firstName lastName email')
      .populate('resolution.resolvedBy', 'firstName lastName email');

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create new alert
// @route   POST /api/alerts
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    const {
      transactionId,
      type,
      severity,
      title,
      description,
      triggers = []
    } = req.body;

    // Find the transaction
    const transaction = await Transaction.findOne({ transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    // Create alert
    const alert = await Alert.create({
      transaction: transaction._id,
      transactionId,
      type,
      severity,
      title,
      description,
      fraudProbability: transaction.fraudAnalysis.probability,
      amount: transaction.amount,
      merchant: transaction.merchant.name,
      triggers,
      metadata: {
        ipAddress: transaction.location?.ipAddress,
        userAgent: transaction.deviceInfo?.userAgent,
        location: transaction.location?.city,
        deviceFingerprint: transaction.deviceInfo?.fingerprint
      }
    });

    // Emit real-time alert
    const io = req.app.get('io');
    io.emit('newAlert', {
      id: alert._id,
      alertId: alert.alertId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      transactionId: alert.transactionId,
      amount: alert.amount,
      fraudProbability: alert.fraudProbability
    });

    logger.info(`New alert created: ${alert.alertId} for transaction ${transactionId}`);

    res.status(201).json({
      success: true,
      data: alert
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update alert status
// @route   PUT /api/alerts/:id/status
// @access  Private
router.put('/:id/status', protect, async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!['open', 'investigating', 'resolved', 'false_positive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    alert.status = status;
    await alert.save();

    logger.info(`Alert ${alert.alertId} status updated to ${status} by ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Assign alert to user
// @route   PUT /api/alerts/:id/assign
// @access  Private
router.put('/:id/assign', protect, authorize('admin', 'analyst'), async (req, res, next) => {
  try {
    const { assignedTo } = req.body;

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    alert.assignedTo = assignedTo;
    await alert.save();

    await alert.populate('assignedTo', 'firstName lastName email');

    logger.info(`Alert ${alert.alertId} assigned to ${alert.assignedTo?.email} by ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Resolve alert
// @route   PUT /api/alerts/:id/resolve
// @access  Private
router.put('/:id/resolve', protect, async (req, res, next) => {
  try {
    const { action, reason } = req.body;

    if (!['approved', 'declined', 'blocked', 'flagged'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resolution action'
      });
    }

    const alert = await Alert.findById(req.params.id);

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    alert.status = 'resolved';
    alert.resolution = {
      action,
      reason,
      resolvedBy: req.user._id,
      resolvedAt: new Date()
    };

    await alert.save();

    logger.info(`Alert ${alert.alertId} resolved with action ${action} by ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get alert statistics
// @route   GET /api/alerts/stats
// @access  Private
router.get('/stats', protect, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const stats = await Alert.getAlertStats({
      start: startDate,
      end: new Date()
    });

    // Get overdue alerts
    const overdueAlerts = await Alert.find({
      status: { $in: ['open', 'investigating'] },
      createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24 hours
    }).countDocuments();

    res.status(200).json({
      success: true,
      data: {
        ...stats,
        overdueAlerts,
        period
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Bulk update alerts
// @route   PUT /api/alerts/bulk
// @access  Private
router.put('/bulk', protect, authorize('admin', 'analyst'), async (req, res, next) => {
  try {
    const { alertIds, action, data } = req.body;

    if (!Array.isArray(alertIds) || alertIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Alert IDs array is required'
      });
    }

    let updateData = {};

    switch (action) {
      case 'assign':
        updateData.assignedTo = data.assignedTo;
        break;
      case 'status':
        updateData.status = data.status;
        break;
      case 'resolve':
        updateData.status = 'resolved';
        updateData.resolution = {
          action: data.action,
          reason: data.reason,
          resolvedBy: req.user._id,
          resolvedAt: new Date()
        };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid bulk action'
        });
    }

    const result = await Alert.updateMany(
      { _id: { $in: alertIds } },
      updateData
    );

    logger.info(`Bulk alert update: ${result.modifiedCount} alerts updated with action ${action} by ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} alerts updated successfully`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
