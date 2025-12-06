import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { cache, CacheKeys } from '../config/redis';
import { AuthRequest } from '../types';
import { createApiError } from '../utils/errors';
import httpStatus from 'http-status';
import { logger } from '../config/logger';

// Rate limit configuration
const rateLimitConfig = {
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
};

// Create custom store using Redis
class RedisStore {
  private prefix: string;

  constructor(prefix: string = 'rate_limit') {
    this.prefix = prefix;
  }

  async increment(key: string): Promise<{ totalHits: number; timeToExpire: number }> {
    const redisKey = `${this.prefix}:${key}`;

    try {
      // Use pipeline for atomic operations
      const pipeline = cache.client.pipeline();
      pipeline.incr(redisKey);
      pipeline.ttl(redisKey);

      const results = await pipeline.exec();

      if (!results || results.length !== 2) {
        throw new Error('Pipeline execution failed');
      }

      const totalHits = results[0][1] as number;
      let ttl = results[1][1] as number;

      // Set TTL if this is the first hit
      if (totalHits === 1 && ttl === -1) {
        await cache.expire(redisKey, Math.ceil(rateLimitConfig.windowMs / 1000));
        ttl = Math.ceil(rateLimitConfig.windowMs / 1000);
      }

      const timeToExpire = ttl > 0 ? ttl * 1000 : 0; // Convert to milliseconds

      return { totalHits, timeToExpire };
    } catch (error) {
      logger.error('Redis rate limit store error', error);
      // Fallback to allowing the request if Redis fails
      return { totalHits: 0, timeToExpire: 0 };
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      const redisKey = `${this.prefix}:${key}`;
      await cache.client.decr(redisKey);
    } catch (error) {
      logger.error('Redis rate limit decrement error', error);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      const redisKey = `${this.prefix}:${key}`;
      await cache.delete(redisKey);
    } catch (error) {
      logger.error('Redis rate limit reset error', error);
    }
  }
}

// Create Redis store instance
const redisStore = new RedisStore();

// Key generator functions
const keyGenerators = {
  /**
   * Generate key by IP address
   */
  ip: (req: Request): string => {
    return req.ip || req.socket.remoteAddress || 'unknown';
  },

  /**
   * Generate key by user ID (for authenticated requests)
   */
  user: (req: AuthRequest): string => {
    return req.user?.id || keyGenerators.ip(req);
  },

  /**
   * Generate key by API key
   */
  apiKey: (req: Request): string => {
    const apiKey = req.headers['x-api-key'] as string;
    return apiKey ? `api_${apiKey.substring(0, 8)}` : keyGenerators.ip(req);
  },

  /**
   * Generate combined key (IP + endpoint)
   */
  ipEndpoint: (req: Request): string => {
    const ip = keyGenerators.ip(req);
    const endpoint = req.route?.path || req.path;
    return `${ip}:${endpoint}`;
  },

  /**
   * Generate combined key (User + endpoint)
   */
  userEndpoint: (req: AuthRequest): string => {
    const userId = req.user?.id || keyGenerators.ip(req);
    const endpoint = req.route?.path || req.path;
    return `${userId}:${endpoint}`;
  },
};

/**
 * Custom rate limit middleware using Redis
 */
export const createRateLimit = (options: {
  windowMs: number;
  maxRequests: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
  onLimitReached?: (req: Request, res: Response) => void;
}) => {
  return async (req: Request, res: Response, next: Function): Promise<void> => {
    try {
      // Skip if condition is met
      if (options.skipIf && options.skipIf(req)) {
        return next();
      }

      const key = options.keyGenerator ? options.keyGenerator(req) : keyGenerators.ip(req);
      const { totalHits, timeToExpire } = await redisStore.increment(key);

      // Set response headers
      res.set({
        'X-RateLimit-Limit': options.maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, options.maxRequests - totalHits).toString(),
        'X-RateLimit-Reset': new Date(Date.now() + timeToExpire).toISOString(),
      });

      if (totalHits > options.maxRequests) {
        const error = createApiError(
          httpStatus.TOO_MANY_REQUESTS,
          options.message || 'Too many requests'
        );

        // Call custom handler if provided
        if (options.onLimitReached) {
          options.onLimitReached(req, res);
        }

        logger.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl,
          totalHits,
          limit: options.maxRequests,
        });

        throw error;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Predefined rate limiters
export const rateLimiters = {
  /**
   * General API rate limiting
   */
  general: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    message: 'Too many requests from this IP, please try again later.',
    keyGenerator: keyGenerators.ip,
  }),

  /**
   * Strict rate limiting for authentication endpoints
   */
  auth: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later.',
    keyGenerator: (req) => `auth:${keyGenerators.ip(req)}`,
  }),

  /**
   * User-specific rate limiting for authenticated endpoints
   */
  user: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 1000,
    message: 'Too many requests for this user, please try again later.',
    keyGenerator: keyGenerators.user,
    skipIf: (req) => !(req as AuthRequest).user, // Skip for unauthenticated requests
  }),

  /**
   * API key rate limiting
   */
  apiKey: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10000,
    message: 'API key rate limit exceeded.',
    keyGenerator: keyGenerators.apiKey,
    skipIf: (req) => !req.headers['x-api-key'],
  }),

  /**
   * File upload rate limiting
   */
  upload: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
    message: 'Too many file uploads, please try again later.',
    keyGenerator: (req) => `upload:${keyGenerators.user(req as AuthRequest)}`,
  }),

  /**
   * Blockchain transaction rate limiting
   */
  blockchain: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 50,
    message: 'Too many blockchain transactions, please try again later.',
    keyGenerator: (req) => `blockchain:${keyGenerators.user(req as AuthRequest)}`,
  }),

  /**
   * Memory creation rate limiting
   */
  memory: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 500,
    message: 'Too many memory creations, please try again later.',
    keyGenerator: (req) => `memory:${keyGenerators.user(req as AuthRequest)}`,
  }),

  /**
   * Agent creation rate limiting
   */
  agent: createRateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    maxRequests: 10,
    message: 'Too many agent creations, please try again tomorrow.',
    keyGenerator: (req) => `agent:${keyGenerators.user(req as AuthRequest)}`,
  }),

  /**
   * Search rate limiting
   */
  search: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
    message: 'Too many search requests, please slow down.',
    keyGenerator: (req) => `search:${keyGenerators.user(req as AuthRequest)}`,
  }),
};

/**
 * Dynamic rate limiting based on user tier
 */
export const createTieredRateLimit = (baseLimits: {
  windowMs: number;
  free: number;
  premium: number;
  enterprise: number;
}) => {
  return createRateLimit({
    windowMs: baseLimits.windowMs,
    maxRequests: baseLimits.free, // Default to free tier
    keyGenerator: keyGenerators.user,
    // TODO: Implement tier-based limiting when user tiers are added
  });
};

/**
 * Burst rate limiting (short window, low limit)
 */
export const burstRateLimit = createRateLimit({
  windowMs: 1000, // 1 second
  maxRequests: 5,
  message: 'Too many requests in a short time, please slow down.',
  keyGenerator: keyGenerators.ip,
});

/**
 * WebSocket rate limiting helper
 */
export const checkWebSocketRateLimit = async (
  key: string,
  windowMs: number = 60000,
  maxRequests: number = 60
): Promise<boolean> => {
  try {
    const redisKey = `ws_rate_limit:${key}`;
    const current = await cache.increment(redisKey);

    if (current === 1) {
      await cache.expire(redisKey, Math.ceil(windowMs / 1000));
    }

    return current <= maxRequests;
  } catch (error) {
    logger.error('WebSocket rate limit check error', error);
    return true; // Allow if Redis check fails
  }
};

/**
 * Rate limit bypass for trusted IPs
 */
export const createBypassRateLimit = (trustedIPs: string[] = []) => {
  return (req: Request, res: Response, next: Function): void => {
    const clientIP = req.ip || req.socket.remoteAddress;

    if (trustedIPs.includes(clientIP || '')) {
      return next();
    }

    // Apply normal rate limiting
    rateLimiters.general(req, res, next);
  };
};

/**
 * Admin rate limiting (higher limits)
 */
export const adminRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000,
  message: 'Admin rate limit exceeded.',
  keyGenerator: (req) => `admin:${keyGenerators.user(req as AuthRequest)}`,
});

export default {
  createRateLimit,
  rateLimiters,
  createTieredRateLimit,
  burstRateLimit,
  checkWebSocketRateLimit,
  createBypassRateLimit,
  adminRateLimit,
};