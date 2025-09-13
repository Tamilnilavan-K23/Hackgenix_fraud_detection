import express from 'express';
import Transaction from '../models/Transaction.js';
import Alert from '../models/Alert.js';
import { protect, authorize } from '../middleware/auth.js';
import moment from 'moment';

const router = express.Router();

// @desc    Generate fraud detection report
// @route   GET /api/reports/fraud-detection
// @access  Private
router.get('/fraud-detection', protect, async (req, res, next) => {
  try {
    const { 
      startDate = moment().subtract(30, 'days').toISOString(),
      endDate = moment().toISOString(),
      format = 'json'
    } = req.query;

    const dateRange = {
      start: new Date(startDate),
      end: new Date(endDate)
    };

    // Get comprehensive fraud statistics
    const [transactionStats, alertStats, categoryBreakdown, timelineData] = await Promise.all([
      Transaction.getFraudStats(dateRange),
      Alert.getAlertStats(dateRange),
      getCategoryBreakdown(dateRange),
      getTimelineData(dateRange)
    ]);

    const report = {
      reportId: `FRAUD-RPT-${Date.now()}`,
      generatedAt: new Date(),
      period: { startDate, endDate },
      summary: {
        totalTransactions: transactionStats.totalTransactions,
        fraudulentTransactions: transactionStats.fraudCount,
        fraudRate: transactionStats.totalTransactions > 0 
          ? ((transactionStats.fraudCount / transactionStats.totalTransactions) * 100).toFixed(2)
          : 0,
        totalLoss: transactionStats.suspiciousAmount,
        averageFraudProbability: transactionStats.avgFraudProbability,
        totalAlerts: alertStats.totalAlerts,
        resolvedAlerts: alertStats.totalAlerts - alertStats.openAlerts
      },
      breakdown: {
        byCategory: categoryBreakdown,
        timeline: timelineData
      },
      recommendations: generateRecommendations(transactionStats, alertStats)
    };

    if (format === 'csv') {
      // Convert to CSV format
      const csvData = convertReportToCSV(report);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="fraud-report-${Date.now()}.csv"`);
      return res.send(csvData);
    }

    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Generate transaction volume report
// @route   GET /api/reports/transaction-volume
// @access  Private
router.get('/transaction-volume', protect, async (req, res, next) => {
  try {
    const { 
      startDate = moment().subtract(30, 'days').toISOString(),
      endDate = moment().toISOString(),
      groupBy = 'day'
    } = req.query;

    let groupStage;
    switch (groupBy) {
      case 'hour':
        groupStage = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' },
          hour: { $hour: '$timestamp' }
        };
        break;
      case 'day':
        groupStage = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
        break;
      case 'month':
        groupStage = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' }
        };
        break;
      default:
        groupStage = {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        };
    }

    const volumeData = await Transaction.aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: groupStage,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          fraudTransactions: {
            $sum: { $cond: [{ $eq: ['$fraudAnalysis.status', 'fraud'] }, 1, 0] }
          },
          suspiciousTransactions: {
            $sum: { $cond: [{ $eq: ['$fraudAnalysis.status', 'suspicious'] }, 1, 0] }
          },
          avgAmount: { $avg: '$amount' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.hour': 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        reportId: `VOL-RPT-${Date.now()}`,
        period: { startDate, endDate },
        groupBy,
        data: volumeData
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Generate risk assessment report
// @route   GET /api/reports/risk-assessment
// @access  Private
router.get('/risk-assessment', protect, async (req, res, next) => {
  try {
    const { 
      startDate = moment().subtract(30, 'days').toISOString(),
      endDate = moment().toISOString()
    } = req.query;

    const riskData = await Transaction.aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$fraudAnalysis.riskLevel',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          avgProbability: { $avg: '$fraudAnalysis.probability' },
          maxProbability: { $max: '$fraudAnalysis.probability' },
          minProbability: { $min: '$fraudAnalysis.probability' }
        }
      }
    ]);

    const merchantRisk = await Transaction.aggregate([
      {
        $match: {
          timestamp: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
          }
        }
      },
      {
        $group: {
          _id: '$merchant.name',
          totalTransactions: { $sum: 1 },
          fraudTransactions: {
            $sum: { $cond: [{ $ne: ['$fraudAnalysis.status', 'safe'] }, 1, 0] }
          },
          avgFraudProbability: { $avg: '$fraudAnalysis.probability' },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $addFields: {
          fraudRate: {
            $multiply: [
              { $divide: ['$fraudTransactions', '$totalTransactions'] },
              100
            ]
          }
        }
      },
      { $sort: { fraudRate: -1 } },
      { $limit: 20 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        reportId: `RISK-RPT-${Date.now()}`,
        period: { startDate, endDate },
        riskLevelBreakdown: riskData,
        topRiskyMerchants: merchantRisk,
        generatedAt: new Date()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to get category breakdown
async function getCategoryBreakdown(dateRange) {
  return await Transaction.aggregate([
    {
      $match: {
        timestamp: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      }
    },
    {
      $group: {
        _id: '$merchant.category',
        totalTransactions: { $sum: 1 },
        fraudTransactions: {
          $sum: { $cond: [{ $eq: ['$fraudAnalysis.status', 'fraud'] }, 1, 0] }
        },
        totalAmount: { $sum: '$amount' },
        avgFraudProbability: { $avg: '$fraudAnalysis.probability' }
      }
    },
    {
      $addFields: {
        fraudRate: {
          $multiply: [
            { $divide: ['$fraudTransactions', '$totalTransactions'] },
            100
          ]
        }
      }
    },
    { $sort: { fraudRate: -1 } }
  ]);
}

// Helper function to get timeline data
async function getTimelineData(dateRange) {
  return await Transaction.aggregate([
    {
      $match: {
        timestamp: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$timestamp' },
          month: { $month: '$timestamp' },
          day: { $dayOfMonth: '$timestamp' }
        },
        totalTransactions: { $sum: 1 },
        fraudTransactions: {
          $sum: { $cond: [{ $eq: ['$fraudAnalysis.status', 'fraud'] }, 1, 0] }
        },
        totalAmount: { $sum: '$amount' }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);
}

// Helper function to generate recommendations
function generateRecommendations(transactionStats, alertStats) {
  const recommendations = [];

  const fraudRate = transactionStats.totalTransactions > 0 
    ? (transactionStats.fraudCount / transactionStats.totalTransactions) * 100
    : 0;

  if (fraudRate > 5) {
    recommendations.push({
      priority: 'high',
      category: 'fraud_rate',
      message: 'Fraud rate is above 5%. Consider implementing stricter validation rules.',
      action: 'Review and update fraud detection thresholds'
    });
  }

  if (alertStats.openAlerts > 50) {
    recommendations.push({
      priority: 'medium',
      category: 'alert_backlog',
      message: 'High number of open alerts. Consider increasing analyst capacity.',
      action: 'Assign more analysts or implement automated resolution for low-risk alerts'
    });
  }

  if (transactionStats.avgFraudProbability > 30) {
    recommendations.push({
      priority: 'medium',
      category: 'risk_threshold',
      message: 'Average fraud probability is high. Review risk assessment model.',
      action: 'Calibrate fraud detection model parameters'
    });
  }

  return recommendations;
}

// Helper function to convert report to CSV
function convertReportToCSV(report) {
  const lines = [];
  
  // Header
  lines.push('Fraud Detection Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Period: ${report.period.startDate} to ${report.period.endDate}`);
  lines.push('');
  
  // Summary
  lines.push('Summary');
  lines.push('Metric,Value');
  lines.push(`Total Transactions,${report.summary.totalTransactions}`);
  lines.push(`Fraudulent Transactions,${report.summary.fraudulentTransactions}`);
  lines.push(`Fraud Rate,${report.summary.fraudRate}%`);
  lines.push(`Total Loss,$${report.summary.totalLoss}`);
  lines.push('');
  
  // Category breakdown
  lines.push('Category Breakdown');
  lines.push('Category,Total Transactions,Fraud Transactions,Fraud Rate');
  report.breakdown.byCategory.forEach(cat => {
    lines.push(`${cat._id},${cat.totalTransactions},${cat.fraudTransactions},${cat.fraudRate.toFixed(2)}%`);
  });
  
  return lines.join('\n');
}

export default router;
