import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  currency: {
    type: String,
    default: 'USD',
    uppercase: true
  },
  merchant: {
    name: {
      type: String,
      required: [true, 'Merchant name is required']
    },
    category: {
      type: String,
      enum: ['E-commerce', 'Retail', 'Gas', 'Food', 'ATM', 'Online', 'Other'],
      default: 'Other'
    },
    location: {
      type: String
    }
  },
  user: {
    userId: {
      type: String,
      required: true,
      index: true
    },
    email: String,
    name: String
  },
  paymentMethod: {
    type: {
      type: String,
      enum: ['credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'],
      required: true
    },
    last4: String,
    brand: String
  },
  fraudAnalysis: {
    probability: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      required: true
    },
    status: {
      type: String,
      enum: ['safe', 'suspicious', 'fraud', 'pending'],
      default: 'pending'
    },
    factors: [{
      factor: String,
      weight: Number,
      description: String
    }],
    modelVersion: {
      type: String,
      default: '1.0'
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  location: {
    country: String,
    city: String,
    coordinates: {
      lat: Number,
      lng: Number
    },
    ipAddress: String
  },
  deviceInfo: {
    userAgent: String,
    deviceId: String,
    fingerprint: String
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  processedAt: {
    type: Date,
    default: Date.now
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: Date,
  notes: String,
  tags: [String]
}, {
  timestamps: true
});

// Indexes for better query performance
transactionSchema.index({ 'fraudAnalysis.probability': -1 });
transactionSchema.index({ 'fraudAnalysis.status': 1 });
transactionSchema.index({ 'fraudAnalysis.riskLevel': 1 });
transactionSchema.index({ timestamp: -1 });
transactionSchema.index({ amount: -1 });
transactionSchema.index({ 'merchant.category': 1 });

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  return `${this.currency} ${this.amount.toLocaleString()}`;
});

// Method to determine risk level based on probability
transactionSchema.methods.calculateRiskLevel = function() {
  if (this.fraudAnalysis.probability >= 80) return 'high';
  if (this.fraudAnalysis.probability >= 50) return 'medium';
  return 'low';
};

// Static method to get fraud statistics
transactionSchema.statics.getFraudStats = async function(dateRange = {}) {
  const matchStage = {};
  
  if (dateRange.start || dateRange.end) {
    matchStage.timestamp = {};
    if (dateRange.start) matchStage.timestamp.$gte = new Date(dateRange.start);
    if (dateRange.end) matchStage.timestamp.$lte = new Date(dateRange.end);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        suspiciousCount: {
          $sum: {
            $cond: [{ $ne: ['$fraudAnalysis.status', 'safe'] }, 1, 0]
          }
        },
        suspiciousAmount: {
          $sum: {
            $cond: [{ $ne: ['$fraudAnalysis.status', 'safe'] }, '$amount', 0]
          }
        },
        fraudCount: {
          $sum: {
            $cond: [{ $eq: ['$fraudAnalysis.status', 'fraud'] }, 1, 0]
          }
        },
        avgFraudProbability: { $avg: '$fraudAnalysis.probability' }
      }
    }
  ]);

  return stats[0] || {
    totalTransactions: 0,
    totalAmount: 0,
    suspiciousCount: 0,
    suspiciousAmount: 0,
    fraudCount: 0,
    avgFraudProbability: 0
  };
};

export default mongoose.model('Transaction', transactionSchema);
