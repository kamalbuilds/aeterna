import Redis from 'ioredis';
import { logger } from './logger';

// Redis configuration interface
interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  retryDelayOnFailover: number;
  maxRetriesPerRequest: number;
  enableReadyCheck: boolean;
  lazyConnect: boolean;
}

// Default Redis configuration
const defaultConfig: RedisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: 'aeterna:',
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
};

// Create Redis instance
export const redis = new Redis(defaultConfig);

// Cache service class
export class CacheService {
  private client: Redis;

  constructor(client: Redis) {
    this.client = client;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      const serializedValue = JSON.stringify(value);

      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, serializedValue);
      } else {
        await this.client.set(key, serializedValue);
      }

      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  /**
   * Increment counter
   */
  async increment(key: string, amount = 1): Promise<number> {
    try {
      return await this.client.incrby(key, amount);
    } catch (error) {
      logger.error('Cache increment error', { key, error });
      throw error;
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error', { key, error });
      return false;
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.client.mget(keys);
      return values.map(value => value ? JSON.parse(value) : null);
    } catch (error) {
      logger.error('Cache mget error', { keys, error });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs
   */
  async mset(keyValuePairs: Record<string, any>, ttlSeconds?: number): Promise<boolean> {
    try {
      const serializedPairs: Record<string, string> = {};

      for (const [key, value] of Object.entries(keyValuePairs)) {
        serializedPairs[key] = JSON.stringify(value);
      }

      if (ttlSeconds) {
        // Use pipeline for atomic operation with TTL
        const pipeline = this.client.pipeline();
        pipeline.mset(serializedPairs);

        for (const key of Object.keys(serializedPairs)) {
          pipeline.expire(key, ttlSeconds);
        }

        await pipeline.exec();
      } else {
        await this.client.mset(serializedPairs);
      }

      return true;
    } catch (error) {
      logger.error('Cache mset error', { keys: Object.keys(keyValuePairs), error });
      return false;
    }
  }

  /**
   * Get keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Cache keys error', { pattern, error });
      return [];
    }
  }

  /**
   * Flush cache namespace
   */
  async flush(pattern: string = '*'): Promise<boolean> {
    try {
      const keys = await this.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      return true;
    } catch (error) {
      logger.error('Cache flush error', { pattern, error });
      return false;
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<Record<string, any>> {
    try {
      const info = await this.client.info('memory');
      const dbsize = await this.client.dbsize();

      return {
        connected: this.client.status === 'ready',
        keyCount: dbsize,
        memoryInfo: info,
        uptime: await this.client.info('server'),
      };
    } catch (error) {
      logger.error('Cache stats error', error);
      return { connected: false, error: error.message };
    }
  }
}

// Create cache service instance
export const cache = new CacheService(redis);

// Cache key generators
export const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userByEmail: (email: string) => `user:email:${email}`,
  agent: (id: string) => `agent:${id}`,
  agentsByUser: (userId: string) => `user:${userId}:agents`,
  memory: (id: string) => `memory:${id}`,
  memoriesByAgent: (agentId: string) => `agent:${agentId}:memories`,
  transaction: (id: string) => `transaction:${id}`,
  session: (sessionToken: string) => `session:${sessionToken}`,
  rateLimit: (ip: string, endpoint: string) => `rateLimit:${ip}:${endpoint}`,
  apiKey: (keyHash: string) => `apiKey:${keyHash}`,
  agentMetrics: (agentId: string) => `metrics:agent:${agentId}`,
  blockchainTx: (txHash: string) => `blockchain:tx:${txHash}`,
};

// Redis health check
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', error);
    return false;
  }
};

// Event handlers
redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis ready for operations');
});

redis.on('error', (error) => {
  logger.error('Redis connection error', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (ms) => {
  logger.info(`Redis reconnecting in ${ms}ms`);
});

// Graceful shutdown
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.disconnect();
    logger.info('Redis connection closed gracefully');
  } catch (error) {
    logger.error('Error during Redis disconnect', error);
  }
};

export default redis;