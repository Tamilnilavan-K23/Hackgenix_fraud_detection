import express from 'express';
import bcrypt from 'bcryptjs';
import ApiKey from '../models/ApiKey.js';
import { protect, authorize } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// @desc    Get all API keys for user
// @route   GET /api/api-keys
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const apiKeys = await ApiKey.find({ 
      owner: req.user._id,
      isActive: true 
    }).select('-hashedKey');

    res.status(200).json({
      success: true,
      data: apiKeys
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Generate new API key
// @route   POST /api/api-keys
// @access  Private
router.post('/', protect, async (req, res, next) => {
  try {
    const { name, permissions = ['read'], restrictions = {} } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'API key name is required'
      });
    }

    // Generate the actual API key
    const keyValue = `fs_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
    
    // Hash the key for storage
    const salt = await bcrypt.genSalt(12);
    const hashedKey = await bcrypt.hash(keyValue, salt);

    const apiKey = await ApiKey.create({
      name,
      hashedKey,
      owner: req.user._id,
      permissions,
      restrictions: {
        rateLimit: {
          requests: restrictions.rateLimit?.requests || 100,
          window: restrictions.rateLimit?.window || 3600000
        },
        ipWhitelist: restrictions.ipWhitelist || [],
        allowedEndpoints: restrictions.allowedEndpoints || []
      }
    });

    // Add API key reference to user
    req.user.apiKeys.push(apiKey._id);
    await req.user.save();

    logger.info(`New API key generated: ${name} for user ${req.user.email}`);

    res.status(201).json({
      success: true,
      message: 'API key generated successfully',
      data: {
        keyId: apiKey.keyId,
        key: keyValue, // Only returned once during creation
        name: apiKey.name,
        permissions: apiKey.permissions,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get API key details
// @route   GET /api/api-keys/:keyId
// @access  Private
router.get('/:keyId', protect, async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOne({
      keyId: req.params.keyId,
      owner: req.user._id
    }).select('-hashedKey');

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    res.status(200).json({
      success: true,
      data: apiKey
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update API key
// @route   PUT /api/api-keys/:keyId
// @access  Private
router.put('/:keyId', protect, async (req, res, next) => {
  try {
    const { name, permissions, restrictions } = req.body;

    const apiKey = await ApiKey.findOne({
      keyId: req.params.keyId,
      owner: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    if (name) apiKey.name = name;
    if (permissions) apiKey.permissions = permissions;
    if (restrictions) {
      apiKey.restrictions = { ...apiKey.restrictions, ...restrictions };
    }

    await apiKey.save();

    logger.info(`API key updated: ${apiKey.keyId} by user ${req.user.email}`);

    res.status(200).json({
      success: true,
      data: apiKey
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Deactivate API key
// @route   DELETE /api/api-keys/:keyId
// @access  Private
router.delete('/:keyId', protect, async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOne({
      keyId: req.params.keyId,
      owner: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    apiKey.isActive = false;
    await apiKey.save();

    logger.info(`API key deactivated: ${apiKey.keyId} by user ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'API key deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Rotate API key
// @route   POST /api/api-keys/:keyId/rotate
// @access  Private
router.post('/:keyId/rotate', protect, async (req, res, next) => {
  try {
    const apiKey = await ApiKey.findOne({
      keyId: req.params.keyId,
      owner: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // Generate new key value
    const newKeyValue = `fs_${Date.now()}_${Math.random().toString(36).substr(2, 32)}`;
    
    // Hash the new key
    const salt = await bcrypt.genSalt(12);
    const hashedKey = await bcrypt.hash(newKeyValue, salt);

    // Update the API key
    apiKey.hashedKey = hashedKey;
    apiKey.lastRotated = new Date();
    await apiKey.save();

    logger.info(`API key rotated: ${apiKey.keyId} by user ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        keyId: apiKey.keyId,
        key: newKeyValue, // Only returned once during rotation
        lastRotated: apiKey.lastRotated
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get API key usage statistics
// @route   GET /api/api-keys/:keyId/usage
// @access  Private
router.get('/:keyId/usage', protect, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;

    const apiKey = await ApiKey.findOne({
      keyId: req.params.keyId,
      owner: req.user._id
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        message: 'API key not found'
      });
    }

    // In a production environment, you would fetch detailed usage statistics
    // from a time-series database or analytics service
    const usageStats = {
      totalRequests: apiKey.usage.totalRequests,
      monthlyRequests: apiKey.usage.monthlyRequests,
      monthlyLimit: apiKey.usage.monthlyLimit,
      lastUsed: apiKey.usage.lastUsed,
      remainingRequests: apiKey.usage.monthlyLimit - apiKey.usage.monthlyRequests,
      usagePercentage: Math.round((apiKey.usage.monthlyRequests / apiKey.usage.monthlyLimit) * 100)
    };

    res.status(200).json({
      success: true,
      data: usageStats
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all API keys (Admin only)
// @route   GET /api/api-keys/admin/all
// @access  Private (Admin)
router.get('/admin/all', protect, authorize('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, isActive } = req.query;

    const query = {};
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [apiKeys, total] = await Promise.all([
      ApiKey.find(query)
        .populate('owner', 'firstName lastName email')
        .select('-hashedKey')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ApiKey.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      data: apiKeys,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
