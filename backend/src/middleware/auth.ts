import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { AuthRequest, TokenPayload } from '../types';
import { db } from '../config/database';
import { cache, CacheKeys } from '../config/redis';
import { logger, loggers } from '../config/logger';
import { createApiError } from '../utils/errors';
import httpStatus from 'http-status';

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback-refresh-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

/**
 * Generate access and refresh tokens
 */
export const generateTokens = async (userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> => {
  try {
    // Get user data
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        walletAddress: true,
      },
    });

    if (!user) {
      throw createApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    // Create token payload
    const tokenPayload: Omit<TokenPayload, 'iat' | 'exp' | 'type'> = {
      id: user.id,
      email: user.email,
      username: user.username,
      walletAddress: user.walletAddress || undefined,
    };

    // Generate access token
    const accessToken = jwt.sign(
      { ...tokenPayload, type: 'access' },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      { ...tokenPayload, type: 'refresh' },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    // Store refresh token in database
    await db.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Cache user data
    await cache.set(CacheKeys.user(user.id), user, 15 * 60); // 15 minutes

    loggers.auth.tokenRefresh(user.id);

    return { accessToken, refreshToken };
  } catch (error) {
    logger.error('Token generation failed', error);
    throw error;
  }
};

/**
 * Verify JWT token
 */
export const verifyToken = (token: string, secret: string): TokenPayload => {
  try {
    return jwt.verify(token, secret) as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Token expired');
    }
    throw createApiError(httpStatus.UNAUTHORIZED, 'Token verification failed');
  }
};

/**
 * Authentication middleware
 */
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Access token required');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = verifyToken(token, JWT_SECRET);

    if (payload.type !== 'access') {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
    }

    // Check cache first
    let user = await cache.get(CacheKeys.user(payload.id));

    if (!user) {
      // Fetch user from database
      user = await db.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          username: true,
          walletAddress: true,
          isActive: true,
          isVerified: true,
        },
      });

      if (!user) {
        throw createApiError(httpStatus.UNAUTHORIZED, 'User not found');
      }

      // Cache user data
      await cache.set(CacheKeys.user(payload.id), user, 15 * 60);
    }

    if (!user.isActive) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Account deactivated');
    }

    // Update last login time
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      walletAddress: user.walletAddress || undefined,
    };

    loggers.api.request(req.method, req.originalUrl, user.id, req.ip);

    next();
  } catch (error) {
    loggers.auth.failed('', req.ip, (error as Error).message);
    next(error);
  }
};

/**
 * Optional authentication middleware (for public endpoints that can benefit from user context)
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without user context
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyToken(token, JWT_SECRET);

      if (payload.type === 'access') {
        // Check cache first
        let user = await cache.get(CacheKeys.user(payload.id));

        if (!user) {
          user = await db.user.findUnique({
            where: { id: payload.id },
            select: {
              id: true,
              email: true,
              username: true,
              walletAddress: true,
              isActive: true,
            },
          });

          if (user && user.isActive) {
            await cache.set(CacheKeys.user(payload.id), user, 15 * 60);
            req.user = {
              id: user.id,
              email: user.email,
              username: user.username,
              walletAddress: user.walletAddress || undefined,
            };
          }
        } else if (user.isActive) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            walletAddress: user.walletAddress || undefined,
          };
        }
      }
    } catch (error) {
      // Ignore token errors for optional auth
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh token middleware
 */
export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw createApiError(httpStatus.BAD_REQUEST, 'Refresh token required');
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken, JWT_REFRESH_SECRET);

    if (payload.type !== 'refresh') {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid token type');
    }

    // Check if refresh token exists and is not revoked
    const storedToken = await db.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!storedToken || storedToken.isRevoked || storedToken.expiresAt < new Date()) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid or expired refresh token');
    }

    // Generate new tokens
    const tokens = await generateTokens(payload.id);

    // Revoke old refresh token
    await db.refreshToken.update({
      where: { id: storedToken.id },
      data: { isRevoked: true },
    });

    res.json({
      success: true,
      data: tokens,
      message: 'Tokens refreshed successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout middleware
 */
export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    const userId = req.user?.id;

    // Revoke refresh token if provided
    if (refreshToken) {
      await db.refreshToken.updateMany({
        where: {
          token: refreshToken,
          isRevoked: false,
        },
        data: { isRevoked: true },
      });
    }

    // Clear user cache
    if (userId) {
      await cache.delete(CacheKeys.user(userId));
      loggers.auth.logout(userId, req.ip);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Hash password
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '12');
  return bcrypt.hash(password, saltRounds);
};

/**
 * Verify password
 */
export const verifyPassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

/**
 * Role-based authorization middleware
 */
export const authorize = (...roles: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw createApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
      }

      // For now, we don't have roles in the schema, so all authenticated users are authorized
      // This can be extended when roles are added to the User model
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * API Key authentication middleware
 */
export const authenticateApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'API key required');
    }

    // Extract prefix and hash
    if (apiKey.length < 16) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid API key format');
    }

    const prefix = apiKey.substring(0, 8);
    const keyHash = await bcrypt.hash(apiKey, 1); // Simple hash for comparison

    // Check cache first
    let apiKeyData = await cache.get(CacheKeys.apiKey(keyHash));

    if (!apiKeyData) {
      // Find API key by prefix (more efficient than hashing every key)
      const storedKey = await db.apiKey.findUnique({
        where: { prefix },
      });

      if (!storedKey || !storedKey.isActive) {
        throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid API key');
      }

      // Verify the full key
      const isValid = await bcrypt.compare(apiKey, storedKey.keyHash);
      if (!isValid) {
        throw createApiError(httpStatus.UNAUTHORIZED, 'Invalid API key');
      }

      if (storedKey.expiresAt && storedKey.expiresAt < new Date()) {
        throw createApiError(httpStatus.UNAUTHORIZED, 'API key expired');
      }

      apiKeyData = storedKey;
      await cache.set(CacheKeys.apiKey(keyHash), apiKeyData, 60 * 60); // Cache for 1 hour
    }

    // Update last used timestamp
    await db.apiKey.update({
      where: { id: apiKeyData.id },
      data: { lastUsedAt: new Date() },
    });

    // Rate limiting for API keys
    if (apiKeyData.rateLimit) {
      const usageKey = `api_key_usage:${prefix}:${Math.floor(Date.now() / (60 * 60 * 1000))}`;
      const usage = await cache.increment(usageKey);

      if (usage === 1) {
        await cache.expire(usageKey, 60 * 60); // 1 hour TTL
      }

      if (usage > apiKeyData.rateLimit) {
        throw createApiError(httpStatus.TOO_MANY_REQUESTS, 'API key rate limit exceeded');
      }
    }

    // Set user context for API key
    req.user = {
      id: apiKeyData.userId,
      email: '', // API keys don't need email context
      username: `api_key_${prefix}`,
    };

    next();
  } catch (error) {
    next(error);
  }
};

export default {
  authenticate,
  optionalAuthenticate,
  refreshToken,
  logout,
  generateTokens,
  verifyToken,
  hashPassword,
  verifyPassword,
  authorize,
  authenticateApiKey,
};