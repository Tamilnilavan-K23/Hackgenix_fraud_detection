import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const apiKeySchema = new mongoose.Schema({
  keyId: {
    type: String,
    required: true,
    default: () => `fs_${uuidv4().replace(/-/g, '')}`
  },
  name: {
    type: String,
    required: [true, 'API key name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  hashedKey: {
    type: String,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permissions: [{
    type: String,
    enum: ['read', 'write', 'admin'],
    default: ['read']
  }],
  usage: {
    totalRequests: {
      type: Number,
      default: 0
    },
    lastUsed: Date,
    monthlyRequests: {
      type: Number,
      default: 0
    },
    monthlyLimit: {
      type: Number,
      default: 10000
    }
  },
  restrictions: {
    ipWhitelist: [String],
    allowedEndpoints: [String],
    rateLimit: {
      requests: {
        type: Number,
        default: 100
      },
      window: {
        type: Number,
        default: 3600000 // 1 hour in milliseconds
      }
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
  },
  lastRotated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
apiKeySchema.index({ keyId: 1 }, { unique: true });
apiKeySchema.index({ owner: 1 });
apiKeySchema.index({ isActive: 1 });
apiKeySchema.index({ expiresAt: 1 });

// Method to check if key is expired
apiKeySchema.methods.isExpired = function() {
  return this.expiresAt && this.expiresAt < new Date();
};

// Method to increment usage
apiKeySchema.methods.incrementUsage = async function() {
  this.usage.totalRequests += 1;
  this.usage.monthlyRequests += 1;
  this.usage.lastUsed = new Date();
  await this.save();
};

// Method to check rate limit
apiKeySchema.methods.checkRateLimit = function() {
  // This would typically be implemented with Redis or similar
  // For now, we'll use a simple in-memory approach
  return this.usage.monthlyRequests < this.usage.monthlyLimit;
};

// Static method to reset monthly usage (to be called by a cron job)
apiKeySchema.statics.resetMonthlyUsage = async function() {
  await this.updateMany({}, { 'usage.monthlyRequests': 0 });
};

export default mongoose.model('ApiKey', apiKeySchema);
