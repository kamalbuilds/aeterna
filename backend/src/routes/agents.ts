import { Router } from 'express';
import { AuthRequest } from '../types';
import { db } from '../config/database';
import { cache, CacheKeys } from '../config/redis';
import { blockchain } from '../config/blockchain';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/auth';
import { rateLimiters } from '../middleware/rateLimiting';
import {
  validateBody,
  validateQuery,
  validateParams,
  validateAgentOwnership,
  agentSchemas,
  commonSchemas
} from '../middleware/validation';
import { domainErrors } from '../utils/errors';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get user's agents
 */
router.get('/',
  validateQuery(agentSchemas.query),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 10,
        sortBy = 'updatedAt',
        sortOrder = 'desc',
        type,
        status,
        isPublic,
        search
      } = req.query as any;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { ownerId: userId };

      if (type) where.type = type;
      if (status) where.status = status;
      if (isPublic !== undefined) where.isPublic = isPublic;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      // Get agents with caching
      const cacheKey = `agents:user:${userId}:${JSON.stringify({ page, limit, sortBy, sortOrder, where })}`;
      let result = await cache.get(cacheKey);

      if (!result) {
        const [agents, totalCount] = await Promise.all([
          db.agent.findMany({
            where,
            select: {
              id: true,
              name: true,
              description: true,
              type: true,
              status: true,
              capabilities: true,
              isPublic: true,
              tasksCompleted: true,
              successRate: true,
              lastActiveAt: true,
              createdAt: true,
              updatedAt: true,
              contractAddress: true,
              tokenId: true,
              _count: {
                select: { memories: true }
              }
            },
            skip,
            take: limit,
            orderBy: { [sortBy]: sortOrder }
          }),
          db.agent.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        result = {
          agents,
          meta: { total: totalCount, page, limit, totalPages }
        };

        // Cache for 5 minutes
        await cache.set(cacheKey, result, 5 * 60);
      }

      res.json({
        success: true,
        data: result.agents,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Create new agent
 */
router.post('/',
  rateLimiters.agent,
  validateBody(agentSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const agentData = req.body;

      // Check agent creation limit (e.g., 10 agents per user)
      const agentCount = await db.agent.count({
        where: { ownerId: userId }
      });

      if (agentCount >= 10) {
        throw domainErrors.agent.limitExceeded();
      }

      // Check if agent name already exists for this user
      const existingAgent = await db.agent.findFirst({
        where: {
          ownerId: userId,
          name: agentData.name
        }
      });

      if (existingAgent) {
        throw domainErrors.agent.nameExists();
      }

      // Create agent in database
      const agent = await db.agent.create({
        data: {
          ...agentData,
          ownerId: userId,
          status: 'INACTIVE', // Default status
        },
        include: {
          _count: {
            select: { memories: true }
          }
        }
      });

      // Create agent on blockchain if blockchain service is available
      let blockchainData = null;
      if (blockchain && process.env.NODE_ENV !== 'development') {
        try {
          const metadata = JSON.stringify({
            name: agent.name,
            description: agent.description,
            type: agent.type,
            capabilities: agent.capabilities,
            createdBy: userId,
          });

          const result = await blockchain.createAgent(agent.name, metadata);

          blockchainData = {
            contractAddress: process.env.SMART_CONTRACT_ADDRESS,
            tokenId: result.tokenId,
            txHash: result.txHash,
          };

          // Update agent with blockchain data
          await db.agent.update({
            where: { id: agent.id },
            data: {
              contractAddress: blockchainData.contractAddress,
              tokenId: blockchainData.tokenId,
              blockchainData: {
                txHash: blockchainData.txHash,
                gasUsed: result.gasUsed,
              }
            }
          });

          // Create blockchain transaction record
          await db.transaction.create({
            data: {
              type: 'AGENT_CREATION',
              status: 'CONFIRMED',
              txHash: result.txHash,
              agentId: agent.id,
              userId,
              data: { agentId: agent.id, tokenId: result.tokenId }
            }
          });

        } catch (blockchainError) {
          logger.error('Blockchain agent creation failed', blockchainError);
          // Don't fail the entire operation if blockchain fails
        }
      }

      // Clear cache
      await cache.delete(`agents:user:${userId}:*`);

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('agent_created', {
        agent: { ...agent, blockchainData },
        timestamp: new Date(),
      });

      logger.info('Agent created successfully', {
        agentId: agent.id,
        userId,
        blockchainData
      });

      res.status(201).json({
        success: true,
        message: 'Agent created successfully',
        data: { ...agent, blockchainData }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get specific agent
 */
router.get('/:id',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;

      // Try cache first
      let agent = await cache.get(CacheKeys.agent(agentId));

      if (!agent) {
        agent = await db.agent.findUnique({
          where: { id: agentId },
          include: {
            memories: {
              select: {
                id: true,
                type: true,
                importance: true,
                createdAt: true,
              },
              orderBy: { importance: 'desc' },
              take: 10,
            },
            transactions: {
              select: {
                id: true,
                type: true,
                status: true,
                txHash: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
            agentMetrics: {
              select: {
                cpuUsage: true,
                memoryUsage: true,
                responseTime: true,
                errorRate: true,
                throughput: true,
                recordedAt: true,
              },
              orderBy: { recordedAt: 'desc' },
              take: 24, // Last 24 hours
            },
            _count: {
              select: {
                memories: true,
                transactions: true,
              }
            }
          }
        });

        if (!agent) {
          throw domainErrors.agent.notFound();
        }

        // Cache for 10 minutes
        await cache.set(CacheKeys.agent(agentId), agent, 10 * 60);
      }

      // Check ownership or public access
      if (agent.ownerId !== userId && !agent.isPublic) {
        throw domainErrors.agent.notOwner();
      }

      // Get blockchain data if available
      let blockchainData = null;
      if (agent.tokenId && blockchain) {
        try {
          blockchainData = await blockchain.getAgent(agent.tokenId);
        } catch (error) {
          logger.warn('Failed to fetch blockchain data', { agentId, error });
        }
      }

      res.json({
        success: true,
        data: { ...agent, blockchainData }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update agent
 */
router.put('/:id',
  validateParams({ id: commonSchemas.id }),
  validateAgentOwnership,
  validateBody(agentSchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;
      const updates = req.body;

      const agent = await db.agent.update({
        where: { id: agentId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
        include: {
          _count: {
            select: { memories: true }
          }
        }
      });

      // Update on blockchain if tokenId exists
      if (agent.tokenId && blockchain && updates.configuration) {
        try {
          const metadata = JSON.stringify({
            name: agent.name,
            description: agent.description,
            type: agent.type,
            capabilities: agent.capabilities,
            configuration: agent.configuration,
            lastUpdated: new Date().toISOString(),
          });

          const result = await blockchain.updateAgent(agent.tokenId, metadata);

          // Create blockchain transaction record
          await db.transaction.create({
            data: {
              type: 'AGENT_UPDATE',
              status: 'CONFIRMED',
              txHash: result.txHash,
              agentId: agent.id,
              userId,
              data: { agentId: agent.id, updates }
            }
          });

        } catch (blockchainError) {
          logger.error('Blockchain agent update failed', blockchainError);
        }
      }

      // Clear caches
      await cache.delete(CacheKeys.agent(agentId));
      await cache.delete(`agents:user:${userId}:*`);

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('agent_updated', {
        agent,
        changes: updates,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Agent updated successfully',
        data: agent
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete agent
 */
router.delete('/:id',
  validateParams({ id: commonSchemas.id }),
  validateAgentOwnership,
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;

      // Get agent details before deletion
      const agent = await db.agent.findUnique({
        where: { id: agentId },
        select: { id: true, name: true, tokenId: true }
      });

      if (!agent) {
        throw domainErrors.agent.notFound();
      }

      // Delete agent (cascade will handle related records)
      await db.agent.delete({
        where: { id: agentId }
      });

      // Clear caches
      await cache.delete(CacheKeys.agent(agentId));
      await cache.delete(`agents:user:${userId}:*`);

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('agent_deleted', {
        agentId,
        agentName: agent.name,
        timestamp: new Date(),
      });

      logger.info('Agent deleted successfully', { agentId, userId });

      res.json({
        success: true,
        message: 'Agent deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get agent memories
 */
router.get('/:id/memories',
  validateParams({ id: commonSchemas.id }),
  validateQuery(commonSchemas.pagination),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;
      const { page = 1, limit = 20 } = req.query as any;
      const skip = (page - 1) * limit;

      // Verify agent access
      const agent = await db.agent.findUnique({
        where: { id: agentId },
        select: { ownerId: true, isPublic: true }
      });

      if (!agent) {
        throw domainErrors.agent.notFound();
      }

      if (agent.ownerId !== userId && !agent.isPublic) {
        throw domainErrors.agent.notOwner();
      }

      const [memories, totalCount] = await Promise.all([
        db.memory.findMany({
          where: { agentId },
          select: {
            id: true,
            content: true,
            type: true,
            importance: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
          skip,
          take: limit,
          orderBy: [
            { importance: 'desc' },
            { createdAt: 'desc' }
          ]
        }),
        db.memory.count({ where: { agentId } })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      res.json({
        success: true,
        data: memories,
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
 * Get agent metrics
 */
router.get('/:id/metrics',
  validateParams({ id: commonSchemas.id }),
  validateQuery({
    period: commonSchemas.id.optional(),
    ...commonSchemas.pagination
  }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;
      const { period = '24h' } = req.query as any;

      // Verify ownership
      const agent = await db.agent.findUnique({
        where: { id: agentId },
        select: { ownerId: true }
      });

      if (!agent) {
        throw domainErrors.agent.notFound();
      }

      if (agent.ownerId !== userId) {
        throw domainErrors.agent.notOwner();
      }

      // Calculate time range
      const timeMap: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      };

      const timeRange = timeMap[period] || timeMap['24h'];
      const startTime = new Date(Date.now() - timeRange);

      const metrics = await db.agentMetric.findMany({
        where: {
          agentId,
          recordedAt: { gte: startTime }
        },
        orderBy: { recordedAt: 'asc' }
      });

      // Calculate aggregated metrics
      const aggregated = {
        avgCpuUsage: metrics.reduce((sum, m) => sum + (m.cpuUsage || 0), 0) / (metrics.length || 1),
        avgMemoryUsage: metrics.reduce((sum, m) => sum + (m.memoryUsage || 0), 0) / (metrics.length || 1),
        avgResponseTime: metrics.reduce((sum, m) => sum + (m.responseTime || 0), 0) / (metrics.length || 1),
        avgErrorRate: metrics.reduce((sum, m) => sum + (m.errorRate || 0), 0) / (metrics.length || 1),
        totalThroughput: metrics.reduce((sum, m) => sum + (m.throughput || 0), 0),
        dataPoints: metrics.length,
      };

      res.json({
        success: true,
        data: {
          period,
          aggregated,
          timeSeries: metrics,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update agent status
 */
router.patch('/:id/status',
  validateParams({ id: commonSchemas.id }),
  validateAgentOwnership,
  validateBody({
    status: agentSchemas.update.extract(['status'])
  }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: agentId } = req.params;
      const userId = req.user!.id;
      const { status } = req.body;

      const agent = await db.agent.update({
        where: { id: agentId },
        data: {
          status,
          lastActiveAt: status === 'ACTIVE' ? new Date() : undefined,
        },
        select: {
          id: true,
          name: true,
          status: true,
          lastActiveAt: true,
        }
      });

      // Clear cache
      await cache.delete(CacheKeys.agent(agentId));

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('agent_status', {
        agentId: agent.id,
        status: agent.status,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Agent status updated successfully',
        data: agent
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get public agents
 */
router.get('/public/list',
  validateQuery(agentSchemas.query),
  async (req, res, next) => {
    try {
      const {
        page = 1,
        limit = 10,
        type,
        search,
        sortBy = 'updatedAt',
        sortOrder = 'desc'
      } = req.query as any;

      const skip = (page - 1) * limit;

      const where: any = { isPublic: true };
      if (type) where.type = type;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      const [agents, totalCount] = await Promise.all([
        db.agent.findMany({
          where,
          select: {
            id: true,
            name: true,
            description: true,
            type: true,
            capabilities: true,
            tasksCompleted: true,
            successRate: true,
            createdAt: true,
            owner: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
              }
            },
            _count: {
              select: { memories: true }
            }
          },
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder }
        }),
        db.agent.count({ where })
      ]);

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

export default router;