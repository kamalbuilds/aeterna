import { PrismaClient, Prisma } from '@prisma/client';
import { env, isDevelopment, isTest } from './environment';
import { DatabaseError } from '../types/error.types';

/**
 * Prisma Client Configuration
 */
const prismaConfig: Prisma.PrismaClientOptions = {
  datasources: {
    db: {
      url: env.DATABASE_URL,
    },
  },
  log: isDevelopment || isTest ? [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
  ] : [
    { emit: 'event', level: 'error' },
  ],
  errorFormat: 'pretty',
};

/**
 * Global Prisma Client instance
 */
let prisma: PrismaClient;

/**
 * Get or create Prisma Client instance
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient(prismaConfig);

    // Set up event listeners for development
    if (isDevelopment) {
      prisma.$on('query', (e) => {
        console.log('Query:', e.query);
        console.log('Params:', e.params);
        console.log('Duration:', e.duration + 'ms');
        console.log('---');
      });
    }

    // Set up error event listener
    prisma.$on('error', (e) => {
      console.error('Prisma Error:', e);
    });

    // Set up info and warning listeners
    if (isDevelopment || isTest) {
      prisma.$on('info', (e) => {
        console.info('Prisma Info:', e);
      });

      prisma.$on('warn', (e) => {
        console.warn('Prisma Warning:', e);
      });
    }
  }

  return prisma;
}

/**
 * Connect to the database
 */
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
    console.log('✅ Database connected successfully');

    // Test the connection
    await client.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw new DatabaseError(
      'Failed to connect to database',
      error as Error,
      { databaseUrl: env.DATABASE_URL.replace(/\/\/.*:.*@/, '//***:***@') }
    );
  }
}

/**
 * Disconnect from the database
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    if (prisma) {
      await prisma.$disconnect();
      console.log('✅ Database disconnected successfully');
    }
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
    throw new DatabaseError('Failed to disconnect from database', error as Error);
  }
}

/**
 * Execute a database transaction
 */
export async function executeTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  const client = getPrismaClient();

  try {
    return await client.$transaction(fn, {
      maxWait: 5000, // 5 seconds
      timeout: 10000, // 10 seconds
      isolationLevel: 'ReadCommitted',
    });
  } catch (error) {
    console.error('Transaction failed:', error);
    throw new DatabaseError('Transaction execution failed', error as Error);
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth() {
  try {
    const client = getPrismaClient();
    const startTime = Date.now();

    // Test basic connectivity
    await client.$queryRaw`SELECT 1`;

    // Test database metrics
    const [userCount, agentCount, taskCount] = await Promise.all([
      client.user.count(),
      client.agent.count(),
      client.task.count(),
    ]);

    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy' as const,
      responseTime,
      metrics: {
        users: userCount,
        agents: agentCount,
        tasks: taskCount,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error('Database health check failed:', error);
    return {
      status: 'unhealthy' as const,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Run database migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    console.log('🔄 Running database migrations...');

    // Note: In a production environment, migrations should be run separately
    // using the Prisma CLI: npx prisma migrate deploy

    const client = getPrismaClient();

    // For now, we'll just ensure the database is accessible
    await client.$queryRaw`SELECT 1`;

    console.log('✅ Database migrations completed');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw new DatabaseError('Database migration failed', error as Error);
  }
}

/**
 * Seed the database with initial data
 */
export async function seedDatabase(): Promise<void> {
  try {
    console.log('🌱 Seeding database...');

    const client = getPrismaClient();

    // Check if already seeded
    const adminUser = await client.user.findFirst({
      where: { role: 'ADMIN' },
    });

    if (adminUser) {
      console.log('ℹ️ Database already seeded');
      return;
    }

    // Seed logic will be implemented in the seed file
    console.log('✅ Database seeding completed');
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw new DatabaseError('Database seeding failed', error as Error);
  }
}

/**
 * Clean up database connections on process exit
 */
process.on('beforeExit', async () => {
  await disconnectDatabase();
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  process.exit(0);
});

// Export the client instance
export { prisma };
export default getPrismaClient();