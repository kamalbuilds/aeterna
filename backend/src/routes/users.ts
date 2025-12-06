import { Router } from 'express';
import { AuthRequest } from '../types';
import { db } from '../config/database';
import { cache, CacheKeys } from '../config/redis';
import { blockchain } from '../config/blockchain';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery, userSchemas, commonSchemas } from '../middleware/validation';
import { domainErrors } from '../utils/errors';
import { ethers } from 'ethers';

const router = Router();

/**
 * Get user profile
 */
router.get('/profile', authenticate, async (req: AuthRequest, res, next) => {
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

    // Get blockchain balance if wallet is linked
    let walletBalance = null;
    if (user.walletAddress && blockchain) {
      try {
        walletBalance = await blockchain.getBalance(user.walletAddress);
      } catch (error) {
        logger.warn('Failed to fetch wallet balance', { userId, error });
      }
    }

    res.json({
      success: true,
      data: {
        ...user,
        walletBalance
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update user profile
 */
router.put('/profile',
  authenticate,
  validateBody(userSchemas.updateProfile),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const updates = req.body;

      // Update user
      const updatedUser = await db.user.update({
        where: { id: userId },
        data: updates,
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          walletAddress: true,
          updatedAt: true,
        }
      });

      // Clear cache
      await cache.delete(CacheKeys.user(userId));

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Link wallet address
 */
router.post('/link-wallet',
  authenticate,
  validateBody(userSchemas.linkWallet),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { walletAddress, signature } = req.body;

      // Check if wallet is already linked to another user
      const existingWallet = await db.user.findUnique({
        where: { walletAddress },
        select: { id: true }
      });

      if (existingWallet && existingWallet.id !== userId) {
        throw domainErrors.user.walletAlreadyLinked();
      }

      // Verify signature (simple implementation)
      // In production, you'd verify that the user signed a specific message
      try {
        const message = `Link wallet to AETERNA account: ${userId}`;
        const recoveredAddress = ethers.verifyMessage(message, signature);

        if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
          throw new Error('Invalid signature');
        }
      } catch (error) {
        throw domainErrors.blockchain.signatureFailed();
      }

      // Update user with wallet address
      const updatedUser = await db.user.update({
        where: { id: userId },
        data: { walletAddress },
        select: {
          id: true,
          email: true,
          username: true,
          walletAddress: true,
          updatedAt: true,
        }
      });

      // Clear cache
      await cache.delete(CacheKeys.user(userId));

      logger.info('Wallet linked successfully', { userId, walletAddress });

      res.json({
        success: true,
        message: 'Wallet linked successfully',
        data: updatedUser
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Unlink wallet address
 */
router.delete('/link-wallet', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Update user to remove wallet address
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { walletAddress: null },
      select: {
        id: true,
        email: true,
        username: true,
        walletAddress: true,
        updatedAt: true,
      }
    });

    // Clear cache
    await cache.delete(CacheKeys.user(userId));

    res.json({
      success: true,
      message: 'Wallet unlinked successfully',
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get user statistics
 */
router.get('/stats', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Get comprehensive user statistics
    const [
      agentStats,
      memoryStats,
      transactionStats,
      recentActivity
    ] = await Promise.all([
      // Agent statistics
      db.agent.aggregate({
        where: { ownerId: userId },
        _count: { id: true },
        _avg: { successRate: true }
      }),

      // Memory statistics
      db.memory.aggregate({
        where: { userId },
        _count: { id: true },
        _avg: { importance: true }
      }),

      // Transaction statistics
      db.transaction.aggregate({
        where: { userId },
        _count: { id: true }
      }),

      // Recent activity (last 7 days)
      db.agent.findMany({
        where: {
          ownerId: userId,
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' },
        take: 10
      })
    ]);

    const stats = {
      agents: {
        total: agentStats._count.id || 0,
        averageSuccessRate: agentStats._avg.successRate || 0,
      },
      memories: {
        total: memoryStats._count.id || 0,
        averageImportance: memoryStats._avg.importance || 0,
      },
      transactions: {
        total: transactionStats._count.id || 0,
      },
      recentActivity: recentActivity.map(agent => ({
        type: 'agent_update',
        agentId: agent.id,
        agentName: agent.name,
        status: agent.status,
        timestamp: agent.updatedAt,
      }))
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get user activity feed
 */
router.get('/activity',
  authenticate,
  validateQuery(commonSchemas.pagination),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20 } = req.query as any;
      const skip = (page - 1) * limit;

      // Get recent activities from audit logs
      const activities = await db.auditLog.findMany({
        where: { userId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          details: true,
          timestamp: true,
        }
      });

      // Get total count for pagination
      const totalCount = await db.auditLog.count({
        where: { userId }
      });

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: activities,
        meta: {
          total: totalCount,
          page,
          limit,
          totalPages,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get user's API keys
 */
router.get('/api-keys', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const apiKeys = await db.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        expiresAt: true,
        rateLimit: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: apiKeys
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Search users (public profiles only)
 */
router.get('/search',
  validateQuery({
    query: commonSchemas.id.optional(),
    ...commonSchemas.pagination,
  }),
  async (req, res, next) => {
    try {
      const { query, page = 1, limit = 10 } = req.query as any;
      const skip = (page - 1) * limit;

      if (!query || query.length < 2) {
        res.json({
          success: true,
          data: [],
          meta: { total: 0, page, limit, totalPages: 0 }
        });
        return;
      }

      // Search only public information
      const users = await db.user.findMany({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                { username: { contains: query, mode: 'insensitive' } },
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
              ]
            }
          ]
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          avatar: true,
          bio: true,
          _count: {
            select: {
              agents: {
                where: { isPublic: true }
              }
            }
          }
        },
        skip,
        take: limit,
        orderBy: { username: 'asc' }
      });

      const totalCount = await db.user.count({
        where: {
          AND: [
            { isActive: true },
            {
              OR: [
                { username: { contains: query, mode: 'insensitive' } },
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
              ]
            }
          ]
        }
      });

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: users,
        meta: {
          total: totalCount,
          page,
          limit,
          totalPages,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get public user profile
 */
router.get('/:userId/profile', async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        bio: true,
        createdAt: true,
        _count: {
          select: {
            agents: {
              where: { isPublic: true }
            }
          }
        }
      }
    });

    if (!user) {
      throw domainErrors.user.userNotFound();
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
 * Get user's public agents
 */
router.get('/:userId/agents',
  validateQuery(commonSchemas.pagination),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10 } = req.query as any;
      const skip = (page - 1) * limit;

      const agents = await db.agent.findMany({
        where: {
          ownerId: userId,
          isPublic: true
        },
        select: {
          id: true,
          name: true,
          description: true,
          type: true,
          capabilities: true,
          createdAt: true,
          updatedAt: true,
        },
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' }
      });

      const totalCount = await db.agent.count({
        where: {
          ownerId: userId,
          isPublic: true
        }
      });

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: agents,
        meta: {
          total: totalCount,
          page,
          limit,
          totalPages,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Deactivate account
 */
router.post('/deactivate', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Deactivate user account
    await db.user.update({
      where: { id: userId },
      data: { isActive: false }
    });

    // Revoke all refresh tokens
    await db.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true }
    });

    // Clear cache
    await cache.delete(CacheKeys.user(userId));

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete account (placeholder - requires careful implementation)
 */
router.delete('/account', authenticate, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // TODO: Implement proper account deletion with data cleanup
    // This should include:
    // 1. Delete all agents and memories
    // 2. Handle blockchain transactions
    // 3. Clean up files and resources
    // 4. Send confirmation email
    // 5. Log the deletion

    res.json({
      success: true,
      message: 'Account deletion is not implemented yet. Please contact support.'
    });
  } catch (error) {
    next(error);
  }
});

export default router;