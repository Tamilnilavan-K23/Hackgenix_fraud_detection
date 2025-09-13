import express from 'express';
import Transaction from '../models/Transaction.js';
import Alert from '../models/Alert.js';
import { protect } from '../middleware/auth.js';
import moment from 'moment';

const router = express.Router();

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
router.get('/stats', protect, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    let startDate;
    switch (period) {
      case '7d':
        startDate = moment().subtract(7, 'days').toDate();
        break;
      case '30d':
        startDate = moment().subtract(30, 'days').toDate();
        break;
      case '90d':
        startDate = moment().subtract(90, 'days').toDate();
        break;
      default:
        startDate = moment().subtract(30, 'days').toDate();
    }

    // Get transaction statistics
    const transactionStats = await Transaction.getFraudStats({
      start: startDate,
      end: new Date()
    });

    // Get alert statistics
    const alertStats = await Alert.getAlertStats({
      start: startDate,
      end: new Date()
    });

    // Calculate fraud percentage
    const fraudPercentage = transactionStats.totalTransactions > 0 
      ? Math.round((transactionStats.fraudCount / transactionStats.totalTransactions) * 100)
      : 0;

    const stats = {
      totalTransactions: transactionStats.totalTransactions,
      suspiciousTransactions: transactionStats.suspiciousCount,
      suspiciousAmount: transactionStats.suspiciousAmount,
      fraudPercentage,
      totalAlerts: alertStats.totalAlerts,
      openAlerts: alertStats.openAlerts,
      criticalAlerts: alertStats.criticalAlerts,
      avgFraudProbability: Math.round(transactionStats.avgFraudProbability || 0),
      period
    };

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get fraud trend data for charts
// @route   GET /api/dashboard/fraud-trend
// @access  Private
router.get('/fraud-trend', protect, async (req, res, next) => {
  try {
    const { period = '6m' } = req.query;
    
    let groupBy, dateFormat, subtractAmount, subtractUnit;
    
    switch (period) {
      case '7d':
        groupBy = { $dayOfYear: '$timestamp' };
        dateFormat = 'MMM DD';
        subtractAmount = 7;
        subtractUnit = 'days';
        break;
      case '30d':
        groupBy = { $dayOfMonth: '$timestamp' };
        dateFormat = 'MMM DD';
        subtractAmount = 30;
        subtractUnit = 'days';
        break;
      case '6m':
        groupBy = { $month: '$timestamp' };
        dateFormat = 'MMM';
        subtractAmount = 6;
        subtractUnit = 'months';
        break;
      default:
        groupBy = { $month: '$timestamp' };
        dateFormat = 'MMM';
        subtractAmount = 6;
        subtractUnit = 'months';
    }

    const startDate = moment().subtract(subtractAmount, subtractUnit).toDate();

    const trendData = await Transaction.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: groupBy,
          totalCount: { $sum: 1 },
          fraudCount: {
            $sum: {
              $cond: [{ $eq: ['$fraudAnalysis.status', 'fraud'] }, 1, 0]
            }
          },
          suspiciousCount: {
            $sum: {
              $cond: [{ $ne: ['$fraudAnalysis.status', 'safe'] }, 1, 0]
            }
          },
          avgFraudProbability: { $avg: '$fraudAnalysis.probability' }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Format the data for frontend consumption
    const formattedData = trendData.map(item => ({
      period: moment().month(item._id - 1).format(dateFormat),
      totalCount: item.totalCount,
      fraudCount: item.fraudCount,
      suspiciousCount: item.suspiciousCount,
      avgFraudProbability: Math.round(item.avgFraudProbability || 0)
    }));

    res.status(200).json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get fraud distribution by category
// @route   GET /api/dashboard/fraud-distribution
// @access  Private
router.get('/fraud-distribution', protect, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    
    let startDate;
    switch (period) {
      case '7d':
        startDate = moment().subtract(7, 'days').toDate();
        break;
      case '30d':
        startDate = moment().subtract(30, 'days').toDate();
        break;
      case '90d':
        startDate = moment().subtract(90, 'days').toDate();
        break;
      default:
        startDate = moment().subtract(30, 'days').toDate();
    }

    const distributionData = await Transaction.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          'fraudAnalysis.status': { $ne: 'safe' }
        }
      },
      {
        $group: {
          _id: '$merchant.category',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgFraudProbability: { $avg: '$fraudAnalysis.probability' }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Add colors for chart visualization
    const colors = [
      'hsl(0, 70%, 50%)',
      'hsl(30, 70%, 50%)',
      'hsl(60, 70%, 50%)',
      'hsl(120, 70%, 50%)',
      'hsl(180, 70%, 50%)',
      'hsl(240, 70%, 50%)',
      'hsl(300, 70%, 50%)'
    ];

    const formattedData = distributionData.map((item, index) => ({
      category: item._id || 'Other',
      count: item.count,
      totalAmount: item.totalAmount,
      avgFraudProbability: Math.round(item.avgFraudProbability || 0),
      fill: colors[index % colors.length]
    }));

    res.status(200).json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get recent activity
// @route   GET /api/dashboard/recent-activity
// @access  Private
router.get('/recent-activity', protect, async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;

    // Get recent high-risk transactions
    const recentTransactions = await Transaction.find({
      'fraudAnalysis.probability': { $gte: 70 }
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .select('transactionId amount merchant.name fraudAnalysis timestamp');

    // Get recent alerts
    const recentAlerts = await Alert.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .select('alertId title severity status createdAt');

    const activity = [
      ...recentTransactions.map(t => ({
        id: t.transactionId,
        type: 'transaction',
        title: `High-risk transaction detected`,
        description: `${t.merchant.name} - $${t.amount.toLocaleString()}`,
        severity: t.fraudAnalysis.probability >= 90 ? 'critical' : 'high',
        timestamp: t.timestamp
      })),
      ...recentAlerts.map(a => ({
        id: a.alertId,
        type: 'alert',
        title: a.title,
        description: `Alert ${a.status}`,
        severity: a.severity,
        timestamp: a.createdAt
      }))
    ]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    next(error);
  }
});

export default router;
