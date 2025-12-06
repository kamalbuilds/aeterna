import { Router, Request, Response } from 'express';
import { db, checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { blockchain } from '../config/blockchain';
import { logger } from '../config/logger';
import httpStatus from 'http-status';

const router = Router();

/**
 * Basic health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Quick health check - just return basic info
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      responseTime: Date.now() - startTime,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        external: Math.round(process.memoryUsage().external / 1024 / 1024),
      },
      cpu: process.cpuUsage(),
    };

    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    logger.error('Health check failed', error);

    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Detailed health check with service dependencies
 */
router.get('/detailed', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check all services in parallel
    const [
      databaseHealth,
      redisHealth,
      blockchainHealth
    ] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkRedisHealth(),
      blockchain ? blockchain.checkHealth() : Promise.resolve(false)
    ]);

    // Extract results
    const dbStatus = databaseHealth.status === 'fulfilled' ? databaseHealth.value : false;
    const redisStatus = redisHealth.status === 'fulfilled' ? redisHealth.value : false;
    const blockchainStatus = blockchainHealth.status === 'fulfilled' ? blockchainHealth.value : false;

    // Calculate overall status
    const criticalServices = [dbStatus];
    const isHealthy = criticalServices.every(status => status);
    const overallStatus = isHealthy ? 'healthy' : 'degraded';

    // Get additional system info
    const responseTime = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',

      services: {
        database: {
          status: dbStatus ? 'up' : 'down',
          healthy: dbStatus,
          responseTime: databaseHealth.status === 'fulfilled' ? responseTime : null,
        },
        redis: {
          status: redisStatus ? 'up' : 'down',
          healthy: redisStatus,
          responseTime: redisHealth.status === 'fulfilled' ? responseTime : null,
        },
        blockchain: {
          status: blockchainStatus ? 'up' : 'down',
          healthy: blockchainStatus,
          enabled: !!blockchain,
          responseTime: blockchainHealth.status === 'fulfilled' ? responseTime : null,
        },
      },

      system: {
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        process: {
          pid: process.pid,
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
      },
    };

    // Set appropriate status code
    const statusCode = isHealthy ? httpStatus.OK : httpStatus.SERVICE_UNAVAILABLE;

    res.status(statusCode).json({
      success: isHealthy,
      data: health
    });

  } catch (error) {
    logger.error('Detailed health check failed', error);

    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'unhealthy',
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Database-specific health check
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Test database connection and basic query
    const isHealthy = await checkDatabaseHealth();

    if (!isHealthy) {
      throw new Error('Database connection failed');
    }

    // Get database stats
    const stats = await Promise.allSettled([
      db.user.count(),
      db.agent.count(),
      db.memory.count(),
      db.transaction.count(),
    ]);

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
        stats: {
          users: stats[0].status === 'fulfilled' ? stats[0].value : null,
          agents: stats[1].status === 'fulfilled' ? stats[1].value : null,
          memories: stats[2].status === 'fulfilled' ? stats[2].value : null,
          transactions: stats[3].status === 'fulfilled' ? stats[3].value : null,
        }
      }
    });

  } catch (error) {
    logger.error('Database health check failed', error);

    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'unhealthy',
      error: 'Database health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Redis-specific health check
 */
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    const isHealthy = await checkRedisHealth();

    if (!isHealthy) {
      throw new Error('Redis connection failed');
    }

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        status: 'healthy',
        responseTime,
        timestamp: new Date().toISOString(),
      }
    });

  } catch (error) {
    logger.error('Redis health check failed', error);

    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'unhealthy',
      error: 'Redis health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Blockchain-specific health check
 */
router.get('/blockchain', async (req: Request, res: Response) => {
  try {
    if (!blockchain) {
      res.json({
        success: true,
        data: {
          status: 'disabled',
          enabled: false,
          timestamp: new Date().toISOString(),
        }
      });
      return;
    }

    const startTime = Date.now();

    const isHealthy = await blockchain.checkHealth();

    if (!isHealthy) {
      throw new Error('Blockchain connection failed');
    }

    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        status: 'healthy',
        enabled: true,
        responseTime,
        timestamp: new Date().toISOString(),
      }
    });

  } catch (error) {
    logger.error('Blockchain health check failed', error);

    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'unhealthy',
      error: 'Blockchain health check failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Readiness probe (for Kubernetes/Docker)
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check critical services only
    const dbHealth = await checkDatabaseHealth();

    if (!dbHealth) {
      throw new Error('Critical services not ready');
    }

    res.json({
      success: true,
      status: 'ready',
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    res.status(httpStatus.SERVICE_UNAVAILABLE).json({
      success: false,
      status: 'not_ready',
      error: 'Services not ready',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Liveness probe (for Kubernetes/Docker)
 */
router.get('/live', (req: Request, res: Response) => {
  // Simple liveness check - just return OK if process is running
  res.json({
    success: true,
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * Version information
 */
router.get('/version', (req: Request, res: Response) => {
  const packageJson = require('../../package.json');

  res.json({
    success: true,
    data: {
      name: packageJson.name,
      version: packageJson.version,
      description: packageJson.description,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      environment: process.env.NODE_ENV || 'development',
      startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      uptime: process.uptime(),
    }
  });
});

/**
 * System metrics
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Get request counts from cache (if available)
    let requestCounts = null;
    try {
      // This would be implemented with proper metrics collection
      requestCounts = {
        total: 0,
        successful: 0,
        failed: 0,
        last24h: 0,
      };
    } catch (error) {
      // Ignore cache errors for metrics
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),

      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
        heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },

      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },

      process: {
        pid: process.pid,
        version: process.version,
        platform: process.platform,
        arch: process.arch,
      },

      requests: requestCounts,
    };

    res.json({
      success: true,
      data: metrics
    });

  } catch (error) {
    logger.error('Metrics collection failed', error);

    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to collect metrics',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;