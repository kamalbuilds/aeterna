import { Router } from 'express';
import { AuthRequest } from '../types';
import { db } from '../config/database';
import { cache, CacheKeys } from '../config/redis';
import { logger, loggers } from '../config/logger';
import {
  authenticate,
  generateTokens,
  hashPassword,
  verifyPassword,
  refreshToken,
  logout
} from '../middleware/auth';
import { validateBody, userSchemas } from '../middleware/validation';
import { domainErrors } from '../utils/errors';
import httpStatus from 'http-status';

const router = Router();

/**
 * Register new user
 */
router.post('/register',
  validateBody(userSchemas.register),
  async (req, res, next) => {
    try {
      const { email, username, password, firstName, lastName } = req.body;

      // Check if user already exists
      const existingUser = await db.user.findFirst({
        where: {
          OR: [
            { email },
            { username }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw domainErrors.user.emailExists();
        }
        throw domainErrors.user.usernameExists();
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      const user = await db.user.create({
        data: {
          email,
          username,
          passwordHash,
          firstName: firstName || null,
          lastName: lastName || null,
        },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        }
      });

      // Generate tokens
      const tokens = await generateTokens(user.id);

      // Cache user data
      await cache.set(CacheKeys.user(user.id), user, 15 * 60);

      loggers.auth.login(user.id, req.ip);

      res.status(httpStatus.CREATED).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user,
          ...tokens
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Login user
 */
router.post('/login',
  validateBody(userSchemas.login),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await db.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          username: true,
          passwordHash: true,
          firstName: true,
          lastName: true,
          isActive: true,
          isVerified: true,
          walletAddress: true,
        }
      });

      if (!user) {
        loggers.auth.failed(email, req.ip, 'User not found');
        throw domainErrors.user.invalidCredentials();
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.passwordHash);
      if (!isValidPassword) {
        loggers.auth.failed(email, req.ip, 'Invalid password');
        throw domainErrors.user.invalidCredentials();
      }

      // Check if account is active
      if (!user.isActive) {
        throw domainErrors.user.accountDeactivated();
      }

      // Generate tokens
      const tokens = await generateTokens(user.id);

      // Update last login
      await db.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Cache user data
      const userData = {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        walletAddress: user.walletAddress,
        isActive: user.isActive,
        isVerified: user.isVerified,
      };
      await cache.set(CacheKeys.user(user.id), userData, 15 * 60);

      loggers.auth.login(user.id, req.ip);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user: userData,
          ...tokens
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Refresh access token
 */
router.post('/refresh', refreshToken);

/**
 * Logout user
 */
router.post('/logout', authenticate, logout);

/**
 * Get current user profile
 */
router.get('/me', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Try cache first
    let user = await cache.get(CacheKeys.user(userId));

    if (!user) {
      user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          walletAddress: true,
          isActive: true,
          isVerified: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
          _count: {
            select: {
              agents: true,
              memories: true,
              transactions: true,
            }
          }
        }
      });

      if (!user) {
        throw domainErrors.user.userNotFound();
      }

      // Cache for 15 minutes
      await cache.set(CacheKeys.user(userId), user, 15 * 60);
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Change user password
 */
router.post('/change-password',
  authenticate,
  validateBody(userSchemas.changePassword),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { currentPassword, newPassword } = req.body;

      // Get current user with password hash
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true }
      });

      if (!user) {
        throw domainErrors.user.userNotFound();
      }

      // Verify current password
      const isValidPassword = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValidPassword) {
        throw domainErrors.user.invalidCredentials();
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      await db.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash }
      });

      // Revoke all refresh tokens
      await db.refreshToken.updateMany({
        where: { userId },
        data: { isRevoked: true }
      });

      // Clear user cache
      await cache.delete(CacheKeys.user(userId));

      logger.info('Password changed successfully', { userId });

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Request password reset (placeholder)
 */
router.post('/forgot-password',
  validateBody(userSchemas.login.extract(['email'])),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      // Check if user exists
      const user = await db.user.findUnique({
        where: { email },
        select: { id: true }
      });

      // Always return success for security (don't leak user existence)
      res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });

      // Log the request
      if (user) {
        logger.info('Password reset requested', { userId: user.id, email });
        // TODO: Send password reset email
      } else {
        logger.warn('Password reset requested for non-existent email', { email });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Verify email (placeholder)
 */
router.post('/verify-email',
  async (req, res, next) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          error: 'Verification token required'
        });
        return;
      }

      // TODO: Implement email verification logic

      res.json({
        success: true,
        message: 'Email verification functionality not implemented yet'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Resend verification email (placeholder)
 */
router.post('/resend-verification',
  authenticate,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;

      // TODO: Implement resend verification email logic

      res.json({
        success: true,
        message: 'Verification email sent (not implemented yet)'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get user sessions
 */
router.get('/sessions', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const sessions = await db.session.findMany({
      where: {
        userId,
        isActive: true,
        expires: { gt: new Date() }
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        lastAccessedAt: true,
        createdAt: true,
        expires: true,
      },
      orderBy: { lastAccessedAt: 'desc' }
    });

    res.json({
      success: true,
      data: sessions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Revoke user session
 */
router.delete('/sessions/:sessionId', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;
    const { sessionId } = req.params;

    await db.session.updateMany({
      where: {
        id: sessionId,
        userId
      },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: 'Session revoked successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;