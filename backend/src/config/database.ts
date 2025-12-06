import { PrismaClient } from '@prisma/client';
import { logger } from './logger';

// Global variable to store Prisma client instance
declare global {
  var __prisma: PrismaClient | undefined;
}

// Prisma client configuration
const createPrismaClient = () => {
  return new PrismaClient({
    log: [
      {
        emit: 'event',
        level: 'query',
      },
      {
        emit: 'event',
        level: 'error',
      },
      {
        emit: 'event',
        level: 'info',
      },
      {
        emit: 'event',
        level: 'warn',
      },
    ],
    errorFormat: 'pretty',
  });
};

// Database connection instance
export const db = globalThis.__prisma || createPrismaClient();

// Prevent multiple instances in development
if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = db;
}

// Enhanced logging for database events
db.$on('query', (e) => {
  logger.debug('Database Query', {
    query: e.query,
    params: e.params,
    duration: e.duration,
    timestamp: e.timestamp,
  });
});

db.$on('error', (e) => {
  logger.error('Database Error', {
    message: e.message,
    timestamp: e.timestamp,
  });
});

db.$on('info', (e) => {
  logger.info('Database Info', {
    message: e.message,
    timestamp: e.timestamp,
  });
});

db.$on('warn', (e) => {
  logger.warn('Database Warning', {
    message: e.message,
    timestamp: e.timestamp,
  });
});

// Database health check
export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', error);
    return false;
  }
};

// Graceful shutdown
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await db.$disconnect();
    logger.info('Database connection closed gracefully');
  } catch (error) {
    logger.error('Error during database disconnect', error);
  }
};

// Connection retry with exponential backoff
export const connectWithRetry = async (maxRetries = 5, delay = 1000): Promise<void> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await db.$connect();
      logger.info('Database connected successfully');
      return;
    } catch (error) {
      logger.error(`Database connection attempt ${i + 1} failed`, error);

      if (i === maxRetries - 1) {
        throw new Error('Failed to connect to database after maximum retries');
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, i);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

// Transaction helper with retry logic
export const executeWithRetry = async <T>(
  operation: (client: PrismaClient) => Promise<T>,
  maxRetries = 3
): Promise<T> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation(db);
    } catch (error: any) {
      // Retry on connection errors or deadlocks
      if (
        (error.code === 'P2034' || error.code === 'P2028' || error.code === 'P1001') &&
        i < maxRetries - 1
      ) {
        logger.warn(`Database operation failed, retrying... (${i + 1}/${maxRetries})`, error);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Should not reach here');
};

export default db;