import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { Server } from 'socket.io';
import { createServer } from 'http';
import dotenv from 'dotenv';
import 'express-async-errors';

// Import configurations
import { db, connectWithRetry, disconnectDatabase } from './config/database';
import { redis, disconnectRedis, checkRedisHealth } from './config/redis';
import { blockchain } from './config/blockchain';
import { logger, morganStream, loggers } from './config/logger';

// Import middleware
import { rateLimiters } from './middleware/rateLimiting';
import { CustomApiError, convertToApiError, formatErrorResponse } from './utils/errors';

// Import routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import agentRoutes from './routes/agents';
import memoryRoutes from './routes/memories';
import transactionRoutes from './routes/transactions';
import healthRoutes from './routes/health';

// Import services
import { initializeWebSocket } from './services/websocket';

// Load environment variables
dotenv.config();

// Create Express app
const app: Express = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
});

// Environment configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_VERSION = process.env.API_VERSION || 'v1';

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Make database and io available to routes
app.locals.db = db;
app.locals.io = io;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// HTTP request logging
app.use(morgan('combined', { stream: morganStream }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic rate limiting
app.use(rateLimiters.general);

// Health check endpoint (before auth)
app.use('/health', healthRoutes);

// API routes with versioning
app.use(`/api/${API_VERSION}/auth`, rateLimiters.auth, authRoutes);
app.use(`/api/${API_VERSION}/users`, userRoutes);
app.use(`/api/${API_VERSION}/agents`, agentRoutes);
app.use(`/api/${API_VERSION}/memories`, memoryRoutes);
app.use(`/api/${API_VERSION}/transactions`, transactionRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AETERNA Backend API',
    version: API_VERSION,
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    docs: `/api/${API_VERSION}/docs`,
  });
});

// API documentation endpoint
app.get(`/api/${API_VERSION}/docs`, (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AETERNA API Documentation',
    version: API_VERSION,
    endpoints: {
      auth: {
        'POST /api/v1/auth/register': 'Register new user',
        'POST /api/v1/auth/login': 'Login user',
        'POST /api/v1/auth/logout': 'Logout user',
        'POST /api/v1/auth/refresh': 'Refresh access token',
      },
      users: {
        'GET /api/v1/users/profile': 'Get user profile',
        'PUT /api/v1/users/profile': 'Update user profile',
        'POST /api/v1/users/link-wallet': 'Link wallet address',
      },
      agents: {
        'GET /api/v1/agents': 'List user agents',
        'POST /api/v1/agents': 'Create new agent',
        'GET /api/v1/agents/:id': 'Get agent details',
        'PUT /api/v1/agents/:id': 'Update agent',
        'DELETE /api/v1/agents/:id': 'Delete agent',
      },
      memories: {
        'GET /api/v1/memories': 'List memories',
        'POST /api/v1/memories': 'Create memory',
        'GET /api/v1/memories/:id': 'Get memory details',
        'PUT /api/v1/memories/:id': 'Update memory',
        'DELETE /api/v1/memories/:id': 'Delete memory',
      },
      transactions: {
        'GET /api/v1/transactions': 'List transactions',
        'POST /api/v1/transactions': 'Create transaction',
        'GET /api/v1/transactions/:id': 'Get transaction details',
      },
      health: {
        'GET /health': 'System health check',
        'GET /health/detailed': 'Detailed health status',
      },
    },
    websocket: {
      endpoint: '/socket.io',
      events: ['agent_status', 'memory_update', 'transaction_update', 'notification'],
    },
  });
});

// 404 handler for unknown routes
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    suggestions: [
      `GET /api/${API_VERSION}/docs`,
      'Check the API documentation for available endpoints',
    ],
  });
});

// Global error handler
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  // Convert unknown errors to API errors
  const apiError = convertToApiError(error);

  // Log error
  loggers.api.error(apiError, req.method, req.originalUrl, (req as any).user?.id);

  // Send error response
  const errorResponse = formatErrorResponse(apiError);

  // Don't leak error details in production
  if (NODE_ENV === 'production' && apiError.status >= 500) {
    errorResponse.message = 'Internal server error';
    delete errorResponse.details;
  }

  res.status(apiError.status).json({
    success: false,
    error: errorResponse.message,
    code: errorResponse.code,
    ...(errorResponse.details && { details: errorResponse.details }),
    timestamp: new Date().toISOString(),
  });
});

// Initialize services
const initializeServices = async (): Promise<void> => {
  try {
    // Connect to database with retry
    await connectWithRetry();
    logger.info('Database connection established');

    // Check Redis health
    const redisHealthy = await checkRedisHealth();
    if (redisHealthy) {
      logger.info('Redis connection established');
    } else {
      logger.warn('Redis connection failed - continuing without cache');
    }

    // Check blockchain connection
    if (blockchain) {
      const blockchainHealthy = await blockchain.checkHealth();
      if (blockchainHealthy) {
        logger.info('Blockchain connection established');

        // Start listening to blockchain events
        await blockchain.listenToEvents((event) => {
          logger.info('Blockchain event received', event);

          // Emit to WebSocket clients
          io.emit('blockchain_event', event);
        });
      } else {
        logger.warn('Blockchain connection failed - continuing without blockchain features');
      }
    } else {
      logger.warn('Blockchain service not configured');
    }

    // Initialize WebSocket handlers
    initializeWebSocket(io, db);
    logger.info('WebSocket server initialized');

  } catch (error) {
    logger.error('Service initialization failed', error);
    throw error;
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}, starting graceful shutdown`);

  // Stop accepting new connections
  httpServer.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Disconnect from services
      if (blockchain) {
        await blockchain.stopListening();
      }

      await disconnectDatabase();
      await disconnectRedis();

      logger.info('All services disconnected, exiting');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forceful shutdown due to timeout');
    process.exit(1);
  }, 30000); // 30 seconds timeout
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
  gracefulShutdown('unhandledRejection');
});

// Start server
const startServer = async (): Promise<void> => {
  try {
    // Initialize all services
    await initializeServices();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`🚀 AETERNA Backend API server started`, {
        port: PORT,
        environment: NODE_ENV,
        version: API_VERSION,
        pid: process.pid,
        timestamp: new Date().toISOString(),
      });

      logger.info('API Documentation available at:', `http://localhost:${PORT}/api/${API_VERSION}/docs`);
      logger.info('Health check available at:', `http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Server startup failed', error);
    process.exit(1);
  }
};

// Start the server
if (require.main === module) {
  startServer();
}

export { app, httpServer, io };
export default app;