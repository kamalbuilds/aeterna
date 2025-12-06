import { Router } from 'express';
import { AuthRequest } from '../types';
import { db } from '../config/database';
import { cache, CacheKeys } from '../config/redis';
import { logger } from '../config/logger';
import { authenticate } from '../middleware/auth';
import { rateLimiters } from '../middleware/rateLimiting';
import {
  validateBody,
  validateQuery,
  validateParams,
  validateMemoryOwnership,
  memorySchemas,
  commonSchemas
} from '../middleware/validation';
import { domainErrors } from '../utils/errors';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get user's memories
 */
router.get('/',
  validateQuery(memorySchemas.query),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        agentId,
        type,
        importance,
        tags,
        search
      } = req.query as any;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { userId };

      if (agentId) {
        // Verify agent ownership
        const agent = await db.agent.findUnique({
          where: { id: agentId },
          select: { ownerId: true }
        });

        if (!agent || agent.ownerId !== userId) {
          throw domainErrors.agent.notOwner();
        }

        where.agentId = agentId;
      }

      if (type) where.type = type;
      if (importance) where.importance = { gte: importance };
      if (tags && Array.isArray(tags)) {
        where.tags = { hasSome: tags };
      }
      if (search) {
        where.OR = [
          { content: { contains: search, mode: 'insensitive' } },
          { tags: { hasSome: [search] } },
        ];
      }

      // Get memories with caching
      const cacheKey = CacheKeys.memoriesByAgent(agentId || `user:${userId}`);
      let result = await cache.get(cacheKey);

      if (!result || search || tags) {
        const [memories, totalCount] = await Promise.all([
          db.memory.findMany({
            where,
            include: {
              agent: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                }
              },
              parent: {
                select: {
                  id: true,
                  content: true,
                  type: true,
                }
              },
              children: {
                select: {
                  id: true,
                  content: true,
                  type: true,
                },
                take: 3, // Limit children shown
              },
              _count: {
                select: { children: true }
              }
            },
            skip,
            take: limit,
            orderBy: [
              { importance: sortOrder === 'asc' ? 'asc' : 'desc' },
              { [sortBy]: sortOrder }
            ]
          }),
          db.memory.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        result = {
          memories,
          meta: { total: totalCount, page, limit, totalPages }
        };

        // Cache for 3 minutes (shorter cache for frequently changing data)
        if (!search && !tags) {
          await cache.set(cacheKey, result, 3 * 60);
        }
      }

      res.json({
        success: true,
        data: result.memories,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Create new memory
 */
router.post('/',
  rateLimiters.memory,
  validateBody(memorySchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const memoryData = req.body;

      // Verify agent ownership
      const agent = await db.agent.findUnique({
        where: { id: memoryData.agentId },
        select: { ownerId: true, name: true }
      });

      if (!agent) {
        throw domainErrors.agent.notFound();
      }

      if (agent.ownerId !== userId) {
        throw domainErrors.agent.notOwner();
      }

      // Check memory limit per agent (e.g., 1000 memories per agent)
      const memoryCount = await db.memory.count({
        where: { agentId: memoryData.agentId }
      });

      if (memoryCount >= 1000) {
        throw domainErrors.memory.limitExceeded();
      }

      // Verify parent memory exists and belongs to same agent (if provided)
      if (memoryData.parentId) {
        const parentMemory = await db.memory.findUnique({
          where: { id: memoryData.parentId },
          select: { agentId: true, userId: true }
        });

        if (!parentMemory) {
          throw domainErrors.memory.parentNotFound();
        }

        if (parentMemory.agentId !== memoryData.agentId || parentMemory.userId !== userId) {
          throw domainErrors.memory.notOwner();
        }

        // Check for circular references (simplified check)
        if (memoryData.parentId === memoryData.agentId) {
          throw domainErrors.memory.circularReference();
        }
      }

      // Create memory
      const memory = await db.memory.create({
        data: {
          ...memoryData,
          userId,
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              type: true,
            }
          },
          parent: {
            select: {
              id: true,
              content: true,
              type: true,
            }
          }
        }
      });

      // Store memory on blockchain/IPFS if configured
      let ipfsHash = null;
      if (process.env.IPFS_ENABLED === 'true') {
        try {
          // TODO: Implement IPFS storage
          // ipfsHash = await storeOnIPFS(memory.content);
        } catch (ipfsError) {
          logger.error('IPFS storage failed', ipfsError);
        }
      }

      // Update memory with IPFS hash if stored
      if (ipfsHash) {
        await db.memory.update({
          where: { id: memory.id },
          data: { ipfsHash }
        });
      }

      // Clear caches
      await cache.delete(CacheKeys.memoriesByAgent(memoryData.agentId));
      await cache.delete(`memories:user:${userId}:*`);

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('memory_created', {
        memory,
        agentName: agent.name,
        timestamp: new Date(),
      });

      logger.info('Memory created successfully', {
        memoryId: memory.id,
        agentId: memoryData.agentId,
        userId,
        ipfsHash,
      });

      res.status(201).json({
        success: true,
        message: 'Memory created successfully',
        data: { ...memory, ipfsHash }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get specific memory
 */
router.get('/:id',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: memoryId } = req.params;
      const userId = req.user!.id;

      // Try cache first
      let memory = await cache.get(CacheKeys.memory(memoryId));

      if (!memory) {
        memory = await db.memory.findUnique({
          where: { id: memoryId },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                type: true,
                ownerId: true,
              }
            },
            parent: {
              select: {
                id: true,
                content: true,
                type: true,
                importance: true,
              }
            },
            children: {
              select: {
                id: true,
                content: true,
                type: true,
                importance: true,
                createdAt: true,
              },
              orderBy: [
                { importance: 'desc' },
                { createdAt: 'desc' }
              ]
            }
          }
        });

        if (!memory) {
          throw domainErrors.memory.notFound();
        }

        // Cache for 10 minutes
        await cache.set(CacheKeys.memory(memoryId), memory, 10 * 60);
      }

      // Check ownership
      if (memory.userId !== userId && memory.agent.ownerId !== userId) {
        throw domainErrors.memory.notOwner();
      }

      res.json({
        success: true,
        data: memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Update memory
 */
router.put('/:id',
  validateParams({ id: commonSchemas.id }),
  validateMemoryOwnership,
  validateBody(memorySchemas.update),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: memoryId } = req.params;
      const userId = req.user!.id;
      const updates = req.body;

      const memory = await db.memory.update({
        where: { id: memoryId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              type: true,
            }
          }
        }
      });

      // Clear caches
      await cache.delete(CacheKeys.memory(memoryId));
      await cache.delete(CacheKeys.memoriesByAgent(memory.agentId));

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('memory_updated', {
        memory,
        changes: updates,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Memory updated successfully',
        data: memory
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Delete memory
 */
router.delete('/:id',
  validateParams({ id: commonSchemas.id }),
  validateMemoryOwnership,
  async (req: AuthRequest, res, next) => {
    try {
      const { id: memoryId } = req.params;
      const userId = req.user!.id;

      // Get memory details before deletion
      const memory = await db.memory.findUnique({
        where: { id: memoryId },
        select: {
          id: true,
          content: true,
          agentId: true,
          parentId: true,
          ipfsHash: true,
          agent: { select: { name: true } }
        }
      });

      if (!memory) {
        throw domainErrors.memory.notFound();
      }

      // Update children to point to parent (or null)
      await db.memory.updateMany({
        where: { parentId: memoryId },
        data: { parentId: memory.parentId }
      });

      // Delete memory
      await db.memory.delete({
        where: { id: memoryId }
      });

      // Clear caches
      await cache.delete(CacheKeys.memory(memoryId));
      await cache.delete(CacheKeys.memoriesByAgent(memory.agentId));

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('memory_deleted', {
        memoryId,
        agentId: memory.agentId,
        agentName: memory.agent.name,
        timestamp: new Date(),
      });

      logger.info('Memory deleted successfully', {
        memoryId,
        agentId: memory.agentId,
        userId,
      });

      res.json({
        success: true,
        message: 'Memory deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Search memories
 */
router.get('/search/query',
  rateLimiters.search,
  validateQuery({
    q: commonSchemas.id.min(2).required(),
    agentId: commonSchemas.id.optional(),
    type: memorySchemas.create.extract(['type']).optional(),
    ...commonSchemas.pagination,
  }),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const {
        q: searchQuery,
        agentId,
        type,
        page = 1,
        limit = 20
      } = req.query as any;

      const skip = (page - 1) * limit;

      // Build search where clause
      const where: any = { userId };

      if (agentId) {
        // Verify agent ownership
        const agent = await db.agent.findUnique({
          where: { id: agentId },
          select: { ownerId: true }
        });

        if (!agent || agent.ownerId !== userId) {
          throw domainErrors.agent.notOwner();
        }

        where.agentId = agentId;
      }

      if (type) where.type = type;

      // Full-text search
      where.OR = [
        { content: { contains: searchQuery, mode: 'insensitive' } },
        { tags: { hasSome: [searchQuery] } },
      ];

      const [memories, totalCount] = await Promise.all([
        db.memory.findMany({
          where,
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                type: true,
              }
            }
          },
          skip,
          take: limit,
          orderBy: [
            { importance: 'desc' },
            { createdAt: 'desc' }
          ]
        }),
        db.memory.count({ where })
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      // Log search for analytics
      logger.info('Memory search performed', {
        userId,
        query: searchQuery,
        agentId,
        type,
        resultsCount: memories.length,
      });

      res.json({
        success: true,
        data: memories,
        meta: {
          total: totalCount,
          page,
          limit,
          totalPages,
          query: searchQuery,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get memories by tags
 */
router.get('/tags/:tag',
  validateParams({ tag: commonSchemas.id }),
  validateQuery(commonSchemas.pagination),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { tag } = req.params;
      const { page = 1, limit = 20 } = req.query as any;
      const skip = (page - 1) * limit;

      const [memories, totalCount] = await Promise.all([
        db.memory.findMany({
          where: {
            userId,
            tags: { has: tag }
          },
          include: {
            agent: {
              select: {
                id: true,
                name: true,
                type: true,
              }
            }
          },
          skip,
          take: limit,
          orderBy: [
            { importance: 'desc' },
            { createdAt: 'desc' }
          ]
        }),
        db.memory.count({
          where: {
            userId,
            tags: { has: tag }
          }
        })
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
          tag,
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get popular tags for user
 */
router.get('/tags/popular/list', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Get all tags from user's memories
    const memories = await db.memory.findMany({
      where: { userId },
      select: { tags: true }
    });

    // Count tag frequencies
    const tagCount: Record<string, number> = {};

    memories.forEach(memory => {
      memory.tags.forEach(tag => {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      });
    });

    // Sort by frequency and return top 20
    const popularTags = Object.entries(tagCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      success: true,
      data: popularTags
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get memory hierarchy (tree structure)
 */
router.get('/:id/hierarchy',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: memoryId } = req.params;
      const userId = req.user!.id;

      // Verify ownership
      const memory = await db.memory.findUnique({
        where: { id: memoryId },
        select: {
          userId: true,
          agent: { select: { ownerId: true } }
        }
      });

      if (!memory) {
        throw domainErrors.memory.notFound();
      }

      if (memory.userId !== userId && memory.agent.ownerId !== userId) {
        throw domainErrors.memory.notOwner();
      }

      // Build memory hierarchy (simplified - could be optimized for deep trees)
      const buildHierarchy = async (rootId: string): Promise<any> => {
        const node = await db.memory.findUnique({
          where: { id: rootId },
          include: {
            children: {
              select: {
                id: true,
                content: true,
                type: true,
                importance: true,
                createdAt: true,
              },
              orderBy: { importance: 'desc' }
            }
          }
        });

        if (!node) return null;

        return {
          ...node,
          children: await Promise.all(
            node.children.map(child => buildHierarchy(child.id))
          )
        };
      };

      const hierarchy = await buildHierarchy(memoryId);

      res.json({
        success: true,
        data: hierarchy
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Bulk update memory importance
 */
router.patch('/bulk/importance',
  validateBody({
    memoryIds: commonSchemas.id.array().min(1).required(),
    importance: memorySchemas.create.extract(['importance']).required(),
  }),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { memoryIds, importance } = req.body;

      // Verify ownership of all memories
      const memories = await db.memory.findMany({
        where: {
          id: { in: memoryIds },
          userId
        },
        select: { id: true, agentId: true }
      });

      if (memories.length !== memoryIds.length) {
        throw domainErrors.memory.notOwner();
      }

      // Update all memories
      await db.memory.updateMany({
        where: {
          id: { in: memoryIds },
          userId
        },
        data: { importance }
      });

      // Clear caches for affected agents
      const agentIds = [...new Set(memories.map(m => m.agentId))];
      await Promise.all(
        agentIds.map(agentId => cache.delete(CacheKeys.memoriesByAgent(agentId)))
      );

      res.json({
        success: true,
        message: `Updated importance for ${memories.length} memories`,
        data: { updated: memories.length, importance }
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;