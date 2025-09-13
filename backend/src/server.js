import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';

// Import routes
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import transactionRoutes from './routes/transactions.js';
import uploadRoutes from './routes/upload.js';
import apiKeyRoutes from './routes/apiKeys.js';
import alertRoutes from './routes/alerts.js';
import reportRoutes from './routes/reports.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

// Import database connection
import { connectDB } from './config/database.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:8080",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.'
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(limiter);
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:8080",
    "http://localhost:5173",
    "http://localhost:3000"
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    service: 'Detectra Backend API',
    tagline: 'No Panic, Just Magic',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/reports', reportRoutes);

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Make io available to routes
app.set('io', io);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Error handling middleware
app.use(errorHandler);

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Detectra Backend Server running on port ${PORT}`);
  logger.info(`✨ No Panic, Just Magic`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || "http://localhost:8080"}`);
  logger.info(`📦 MongoDB Connected: ${process.env.MONGODB_URI ? 'Remote' : 'localhost'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
  });
});

export default app;
