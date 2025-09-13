import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  alertId: {
    type: String,
    required: true,
    unique: true,
    default: () => `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: true,
    index: true
  },
  transactionId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['fraud_detected', 'high_risk', 'unusual_pattern', 'velocity_check', 'blacklist_match'],
    required: true
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  fraudProbability: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  amount: {
    type: Number,
    required: true
  },
  merchant: {
    type: String,
    required: true
  },
  triggers: [{
    rule: String,
    value: mongoose.Schema.Types.Mixed,
    threshold: mongoose.Schema.Types.Mixed,
    description: String
  }],
  status: {
    type: String,
    enum: ['open', 'investigating', 'resolved', 'false_positive'],
    default: 'open'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  priority: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  resolution: {
    action: {
      type: String,
      enum: ['approved', 'declined', 'blocked', 'flagged']
    },
    reason: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date
  },
  notifications: {
    emailSent: {
      type: Boolean,
      default: false
    },
    smsSet: {
      type: Boolean,
      default: false
    },
    webhookSent: {
      type: Boolean,
      default: false
    }
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    location: String,
    deviceFingerprint: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
alertSchema.index({ status: 1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ type: 1 });
alertSchema.index({ fraudProbability: -1 });
alertSchema.index({ createdAt: -1 });
alertSchema.index({ assignedTo: 1 });

// Virtual for age of alert
alertSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt.getTime();
});

// Method to check if alert is overdue
alertSchema.methods.isOverdue = function() {
  const hoursOld = this.age / (1000 * 60 * 60);
  const thresholds = {
    critical: 1,
    high: 4,
    medium: 24,
    low: 72
  };
  return hoursOld > thresholds[this.severity];
};

// Static method to get alert statistics
alertSchema.statics.getAlertStats = async function(dateRange = {}) {
  const matchStage = {};
  
  if (dateRange.start || dateRange.end) {
    matchStage.createdAt = {};
    if (dateRange.start) matchStage.createdAt.$gte = new Date(dateRange.start);
    if (dateRange.end) matchStage.createdAt.$lte = new Date(dateRange.end);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAlerts: { $sum: 1 },
        openAlerts: {
          $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
        },
        criticalAlerts: {
          $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
        },
        highAlerts: {
          $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] }
        },
        avgFraudProbability: { $avg: '$fraudProbability' },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);

  return stats[0] || {
    totalAlerts: 0,
    openAlerts: 0,
    criticalAlerts: 0,
    highAlerts: 0,
    avgFraudProbability: 0,
    totalAmount: 0
  };
};

export default mongoose.model('Alert', alertSchema);
