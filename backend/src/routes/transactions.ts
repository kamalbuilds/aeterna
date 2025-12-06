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
  transactionSchemas,
  commonSchemas
} from '../middleware/validation';
import { domainErrors } from '../utils/errors';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Get user's transactions
 */
router.get('/',
  validateQuery(transactionSchemas.query),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        type,
        status,
        agentId
      } = req.query as any;

      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = { userId };

      if (type) where.type = type;
      if (status) where.status = status;
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

      // Get transactions with caching
      const cacheKey = `transactions:user:${userId}:${JSON.stringify({ page, limit, where })}`;
      let result = await cache.get(cacheKey);

      if (!result) {
        const [transactions, totalCount] = await Promise.all([
          db.transaction.findMany({
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
            orderBy: { [sortBy]: sortOrder }
          }),
          db.transaction.count({ where })
        ]);

        const totalPages = Math.ceil(totalCount / limit);

        result = {
          transactions,
          meta: { total: totalCount, page, limit, totalPages }
        };

        // Cache for 2 minutes (transactions change frequently)
        await cache.set(cacheKey, result, 2 * 60);
      }

      res.json({
        success: true,
        data: result.transactions,
        meta: result.meta
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Create new transaction
 */
router.post('/',
  rateLimiters.blockchain,
  validateBody(transactionSchemas.create),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const transactionData = req.body;

      // Verify agent ownership if agentId is provided
      if (transactionData.agentId) {
        const agent = await db.agent.findUnique({
          where: { id: transactionData.agentId },
          select: { ownerId: true, name: true }
        });

        if (!agent) {
          throw domainErrors.agent.notFound();
        }

        if (agent.ownerId !== userId) {
          throw domainErrors.agent.notOwner();
        }
      }

      // Create transaction record
      const transaction = await db.transaction.create({
        data: {
          ...transactionData,
          userId,
          status: 'PENDING',
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

      // Execute blockchain transaction if blockchain service is available
      let blockchainResult = null;
      if (blockchain && transactionData.toAddress) {
        try {
          switch (transactionData.type) {
            case 'TOKEN_TRANSFER':
              if (!transactionData.value) {
                throw domainErrors.transaction.invalidAmount();
              }

              blockchainResult = await blockchain.sendTransaction(
                transactionData.toAddress,
                transactionData.value
              );
              break;

            case 'CONTRACT_INTERACTION':
              // Handle smart contract interactions
              if (transactionData.agentId && blockchain.contract) {
                // Example: Update agent on blockchain
                const agentData = await db.agent.findUnique({
                  where: { id: transactionData.agentId },
                  select: { name: true, tokenId: true }
                });

                if (agentData?.tokenId) {
                  const metadata = JSON.stringify(transactionData.data || {});
                  blockchainResult = await blockchain.updateAgent(agentData.tokenId, metadata);
                }
              }
              break;

            default:
              logger.warn('Unsupported blockchain transaction type', {
                type: transactionData.type,
                transactionId: transaction.id
              });
          }

          if (blockchainResult) {
            // Update transaction with blockchain data
            await db.transaction.update({
              where: { id: transaction.id },
              data: {
                txHash: blockchainResult.txHash,
                status: 'CONFIRMED',
                gasUsed: BigInt(blockchainResult.gasUsed),
              }
            });

            // Refresh transaction data
            const updatedTransaction = await db.transaction.findUnique({
              where: { id: transaction.id },
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

            transaction.txHash = blockchainResult.txHash;
            transaction.status = 'CONFIRMED';
            transaction.gasUsed = BigInt(blockchainResult.gasUsed);
          }

        } catch (blockchainError: any) {
          logger.error('Blockchain transaction failed', {
            transactionId: transaction.id,
            error: blockchainError.message
          });

          // Update transaction with error
          await db.transaction.update({
            where: { id: transaction.id },
            data: {
              status: 'FAILED',
              errorMessage: blockchainError.message,
            }
          });

          transaction.status = 'FAILED';
          transaction.errorMessage = blockchainError.message;
        }
      }

      // Clear cache
      await cache.delete(`transactions:user:${userId}:*`);

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('transaction_created', {
        transaction,
        blockchainResult,
        timestamp: new Date(),
      });

      logger.info('Transaction created successfully', {
        transactionId: transaction.id,
        type: transactionData.type,
        userId,
        txHash: blockchainResult?.txHash,
      });

      res.status(201).json({
        success: true,
        message: 'Transaction created successfully',
        data: {
          ...transaction,
          blockchainResult
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get specific transaction
 */
router.get('/:id',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: transactionId } = req.params;
      const userId = req.user!.id;

      // Try cache first
      let transaction = await cache.get(CacheKeys.transaction(transactionId));

      if (!transaction) {
        transaction = await db.transaction.findUnique({
          where: { id: transactionId },
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

        if (!transaction) {
          throw domainErrors.transaction.notFound();
        }

        // Cache for 5 minutes
        await cache.set(CacheKeys.transaction(transactionId), transaction, 5 * 60);
      }

      // Check ownership
      if (transaction.userId !== userId) {
        throw domainErrors.transaction.notOwner();
      }

      // Get latest blockchain data if transaction hash exists
      let blockchainData = null;
      if (transaction.txHash && blockchain) {
        try {
          blockchainData = await blockchain.getTransaction(transaction.txHash);

          // Update confirmations if they've increased
          if (blockchainData.confirmations > transaction.confirmations) {
            await db.transaction.update({
              where: { id: transactionId },
              data: { confirmations: blockchainData.confirmations }
            });

            transaction.confirmations = blockchainData.confirmations;
          }
        } catch (error) {
          logger.warn('Failed to fetch blockchain data', { transactionId, error });
        }
      }

      res.json({
        success: true,
        data: {
          ...transaction,
          blockchainData
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Cancel pending transaction
 */
router.patch('/:id/cancel',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: transactionId } = req.params;
      const userId = req.user!.id;

      const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          userId: true,
          status: true,
          txHash: true,
        }
      });

      if (!transaction) {
        throw domainErrors.transaction.notFound();
      }

      if (transaction.userId !== userId) {
        throw domainErrors.transaction.notOwner();
      }

      if (transaction.status !== 'PENDING') {
        throw domainErrors.transaction.alreadyConfirmed();
      }

      // Update transaction status
      const updatedTransaction = await db.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'CANCELLED',
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

      // Clear cache
      await cache.delete(CacheKeys.transaction(transactionId));

      // Emit WebSocket event
      req.app.locals.io.to(`user:${userId}`).emit('transaction_cancelled', {
        transactionId,
        timestamp: new Date(),
      });

      res.json({
        success: true,
        message: 'Transaction cancelled successfully',
        data: updatedTransaction
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get transaction statistics
 */
router.get('/stats/summary', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const [
      totalTransactions,
      transactionsByStatus,
      transactionsByType,
      recentTransactions
    ] = await Promise.all([
      // Total transaction count
      db.transaction.count({ where: { userId } }),

      // Group by status
      db.transaction.groupBy({
        by: ['status'],
        where: { userId },
        _count: { id: true }
      }),

      // Group by type
      db.transaction.groupBy({
        by: ['type'],
        where: { userId },
        _count: { id: true }
      }),

      // Recent transactions (last 7 days)
      db.transaction.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    const stats = {
      total: totalTransactions,
      recentWeek: recentTransactions,
      byStatus: transactionsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
      byType: transactionsByType.reduce((acc, item) => {
        acc[item.type] = item._count.id;
        return acc;
      }, {} as Record<string, number>),
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
 * Get pending transactions
 */
router.get('/pending/list', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    const pendingTransactions = await db.transaction.findMany({
      where: {
        userId,
        status: 'PENDING'
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
      orderBy: { createdAt: 'desc' },
      take: 50 // Limit to 50 pending transactions
    });

    res.json({
      success: true,
      data: pendingTransactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Retry failed transaction
 */
router.post('/:id/retry',
  validateParams({ id: commonSchemas.id }),
  async (req: AuthRequest, res, next) => {
    try {
      const { id: transactionId } = req.params;
      const userId = req.user!.id;

      const transaction = await db.transaction.findUnique({
        where: { id: transactionId },
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

      if (!transaction) {
        throw domainErrors.transaction.notFound();
      }

      if (transaction.userId !== userId) {
        throw domainErrors.transaction.notOwner();
      }

      if (transaction.status !== 'FAILED') {
        res.status(400).json({
          success: false,
          error: 'Only failed transactions can be retried'
        });
        return;
      }

      // Reset transaction to pending
      await db.transaction.update({
        where: { id: transactionId },
        data: {
          status: 'PENDING',
          errorMessage: null,
          txHash: null,
          gasUsed: null,
          confirmations: 0,
          updatedAt: new Date(),
        }
      });

      // TODO: Implement actual retry logic based on transaction type

      res.json({
        success: true,
        message: 'Transaction retry initiated',
        data: {
          transactionId,
          status: 'PENDING'
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Get gas price estimation
 */
router.get('/gas/estimate', async (req: AuthRequest, res, next) => {
  try {
    if (!blockchain) {
      res.json({
        success: false,
        error: 'Blockchain service not available'
      });
      return;
    }

    const gasPrice = await blockchain.getGasPrice();

    res.json({
      success: true,
      data: {
        gasPrice: gasPrice.toString(),
        gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(2),
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get wallet balance
 */
router.get('/wallet/balance', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user!.id;

    // Get user's wallet address
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true }
    });

    if (!user?.walletAddress) {
      res.json({
        success: false,
        error: 'No wallet linked to account'
      });
      return;
    }

    if (!blockchain) {
      res.json({
        success: false,
        error: 'Blockchain service not available'
      });
      return;
    }

    const balance = await blockchain.getBalance(user.walletAddress);

    res.json({
      success: true,
      data: {
        walletAddress: user.walletAddress,
        balance,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Export transactions (CSV format)
 */
router.get('/export/csv',
  validateQuery({
    startDate: commonSchemas.id.optional(),
    endDate: commonSchemas.id.optional(),
    type: transactionSchemas.create.extract(['type']).optional(),
  }),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, type } = req.query as any;

      const where: any = { userId };

      if (type) where.type = type;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate);
        if (endDate) where.createdAt.lte = new Date(endDate);
      }

      const transactions = await db.transaction.findMany({
        where,
        include: {
          agent: {
            select: {
              name: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Generate CSV
      const csvHeader = 'ID,Type,Status,Agent,Amount,Hash,Gas Used,Created At,Updated At\n';
      const csvRows = transactions.map(tx => [
        tx.id,
        tx.type,
        tx.status,
        tx.agent?.name || 'N/A',
        tx.value || 'N/A',
        tx.txHash || 'N/A',
        tx.gasUsed?.toString() || 'N/A',
        tx.createdAt.toISOString(),
        tx.updatedAt.toISOString(),
      ].join(',')).join('\n');

      const csv = csvHeader + csvRows;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

export default router;