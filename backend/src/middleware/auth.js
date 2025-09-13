import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import ApiKey from '../models/ApiKey.js';
import bcrypt from 'bcryptjs';

// Protect routes - JWT authentication
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Get user from token
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'No user found with this token'
        });
      }

      if (!req.user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User account is deactivated'
        });
      }

      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    next(error);
  }
};

// API Key authentication
export const apiKeyAuth = async (req, res, next) => {
  try {
    let apiKey;

    // Get API key from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      apiKey = req.headers.authorization.split(' ')[1];
    } else if (req.headers['x-api-key']) {
      apiKey = req.headers['x-api-key'];
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Find API key in database
    const keyRecord = await ApiKey.findOne({ keyId: apiKey }).populate('owner');

    if (!keyRecord) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
    }

    // Check if key is active
    if (!keyRecord.isActive) {
      return res.status(401).json({
        success: false,
        message: 'API key is deactivated'
      });
    }

    // Check if key is expired
    if (keyRecord.isExpired()) {
      return res.status(401).json({
        success: false,
        message: 'API key has expired'
      });
    }

    // Check rate limit
    if (!keyRecord.checkRateLimit()) {
      return res.status(429).json({
        success: false,
        message: 'API key rate limit exceeded'
      });
    }

    // Check IP whitelist if configured
    if (keyRecord.restrictions.ipWhitelist.length > 0) {
      const clientIP = req.ip || req.connection.remoteAddress;
      if (!keyRecord.restrictions.ipWhitelist.includes(clientIP)) {
        return res.status(403).json({
          success: false,
          message: 'IP address not whitelisted'
        });
      }
    }

    // Increment usage
    await keyRecord.incrementUsage();

    req.apiKey = keyRecord;
    req.user = keyRecord.owner;
    next();
  } catch (error) {
    next(error);
  }
};

// Role-based authorization
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to access this route`
      });
    }

    next();
  };
};

// Optional authentication (for public endpoints that can benefit from user context)
export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
      } catch (error) {
        // Token is invalid, but that's okay for optional auth
        req.user = null;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};
