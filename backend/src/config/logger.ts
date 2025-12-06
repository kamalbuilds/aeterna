import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define log colors
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

// Add colors to winston
winston.addColors(logColors);

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta, null, 2)}`;
    }
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    })
  );
}

// File transports for production
if (process.env.NODE_ENV === 'production' || process.env.LOG_FILES === 'true') {
  const logDir = process.env.LOG_FILE_PATH || './logs';

  // Error log
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '30d',
      maxSize: '20m',
      format: logFormat,
    })
  );

  // Combined log
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m',
      format: logFormat,
    })
  );

  // HTTP log
  transports.push(
    new DailyRotateFile({
      filename: path.join(logDir, 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http',
      maxFiles: '7d',
      maxSize: '50m',
      format: logFormat,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels: logLevels,
  format: logFormat,
  transports,
  exitOnError: false,
});

// Stream for Morgan HTTP logging
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Structured logging helpers
export const loggers = {
  // Database operations
  database: {
    query: (query: string, duration?: number, params?: any) => {
      logger.debug('Database Query', { query, duration, params });
    },
    error: (error: any, operation?: string) => {
      logger.error('Database Error', { error: error.message, stack: error.stack, operation });
    },
    connection: (status: 'connected' | 'disconnected' | 'error', details?: any) => {
      logger.info('Database Connection', { status, details });
    },
  },

  // Cache operations
  cache: {
    hit: (key: string, ttl?: number) => {
      logger.debug('Cache Hit', { key, ttl });
    },
    miss: (key: string) => {
      logger.debug('Cache Miss', { key });
    },
    set: (key: string, ttl?: number) => {
      logger.debug('Cache Set', { key, ttl });
    },
    error: (error: any, operation: string, key?: string) => {
      logger.error('Cache Error', { error: error.message, operation, key });
    },
  },

  // Authentication
  auth: {
    login: (userId: string, ip?: string) => {
      logger.info('User Login', { userId, ip });
    },
    logout: (userId: string, ip?: string) => {
      logger.info('User Logout', { userId, ip });
    },
    failed: (email: string, ip?: string, reason?: string) => {
      logger.warn('Login Failed', { email, ip, reason });
    },
    tokenRefresh: (userId: string, ip?: string) => {
      logger.info('Token Refresh', { userId, ip });
    },
  },

  // API requests
  api: {
    request: (method: string, url: string, userId?: string, ip?: string) => {
      logger.http('API Request', { method, url, userId, ip });
    },
    response: (method: string, url: string, status: number, duration: number, userId?: string) => {
      logger.http('API Response', { method, url, status, duration, userId });
    },
    error: (error: any, method?: string, url?: string, userId?: string) => {
      logger.error('API Error', {
        error: error.message,
        stack: error.stack,
        method,
        url,
        userId,
      });
    },
  },

  // Blockchain operations
  blockchain: {
    transaction: (txHash: string, type: string, status: 'pending' | 'confirmed' | 'failed') => {
      logger.info('Blockchain Transaction', { txHash, type, status });
    },
    contract: (address: string, method: string, status: 'success' | 'failure', gasUsed?: string) => {
      logger.info('Contract Interaction', { address, method, status, gasUsed });
    },
    error: (error: any, operation: string, txHash?: string) => {
      logger.error('Blockchain Error', {
        error: error.message,
        stack: error.stack,
        operation,
        txHash,
      });
    },
  },

  // WebSocket
  websocket: {
    connect: (userId?: string, socketId?: string) => {
      logger.info('WebSocket Connect', { userId, socketId });
    },
    disconnect: (userId?: string, socketId?: string, reason?: string) => {
      logger.info('WebSocket Disconnect', { userId, socketId, reason });
    },
    message: (event: string, userId?: string, data?: any) => {
      logger.debug('WebSocket Message', { event, userId, data });
    },
    error: (error: any, userId?: string, socketId?: string) => {
      logger.error('WebSocket Error', {
        error: error.message,
        stack: error.stack,
        userId,
        socketId,
      });
    },
  },

  // Agent operations
  agent: {
    created: (agentId: string, userId: string, type: string) => {
      logger.info('Agent Created', { agentId, userId, type });
    },
    updated: (agentId: string, changes: any) => {
      logger.info('Agent Updated', { agentId, changes });
    },
    deleted: (agentId: string, userId: string) => {
      logger.info('Agent Deleted', { agentId, userId });
    },
    status: (agentId: string, status: string, previousStatus?: string) => {
      logger.info('Agent Status Change', { agentId, status, previousStatus });
    },
  },

  // Security
  security: {
    rateLimitExceeded: (ip: string, endpoint: string) => {
      logger.warn('Rate Limit Exceeded', { ip, endpoint });
    },
    invalidToken: (token: string, ip?: string) => {
      logger.warn('Invalid Token', { token: token.substring(0, 10) + '...', ip });
    },
    suspiciousActivity: (activity: string, userId?: string, ip?: string, details?: any) => {
      logger.warn('Suspicious Activity', { activity, userId, ip, details });
    },
  },

  // Performance
  performance: {
    slow: (operation: string, duration: number, threshold: number, details?: any) => {
      logger.warn('Slow Operation', { operation, duration, threshold, details });
    },
    metrics: (metrics: Record<string, any>) => {
      logger.info('Performance Metrics', metrics);
    },
  },
};

// Handle uncaught exceptions and unhandled rejections
if (process.env.NODE_ENV === 'production') {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
  });
}

export default logger;