import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { logger } from '../src/config/logger';

const prisma = new PrismaClient();

async function main() {
  logger.info('Starting database seed...');

  // Create test users
  const hashedPassword = await bcrypt.hash('password123', 12);

  // Admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@aeterna.ai' },
    update: {},
    create: {
      email: 'admin@aeterna.ai',
      username: 'admin',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      isVerified: true,
      walletAddress: '0x1234567890123456789012345678901234567890',
    },
  });

  // Test user
  const testUser = await prisma.user.upsert({
    where: { email: 'test@aeterna.ai' },
    update: {},
    create: {
      email: 'test@aeterna.ai',
      username: 'testuser',
      passwordHash: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      bio: 'A test user for AETERNA development',
      isVerified: true,
    },
  });

  logger.info('Created users:', {
    admin: adminUser.id,
    test: testUser.id,
  });

  // Create test agents
  const autonomousAgent = await prisma.agent.create({
    data: {
      name: 'Autonomous Assistant',
      description: 'An autonomous AI agent that helps with various tasks',
      type: 'AUTONOMOUS',
      status: 'ACTIVE',
      capabilities: ['text_processing', 'task_automation', 'data_analysis'],
      configuration: {
        maxMemories: 1000,
        learningRate: 0.01,
        responseTimeout: 30000,
      },
      ownerId: testUser.id,
      isPublic: true,
      tasksCompleted: 42,
      successRate: 0.87,
      lastActiveAt: new Date(),
    },
  });

  const collaborativeAgent = await prisma.agent.create({
    data: {
      name: 'Collaborative Helper',
      description: 'A collaborative agent that works well with other agents',
      type: 'COLLABORATIVE',
      status: 'INACTIVE',
      capabilities: ['communication', 'coordination', 'planning'],
      configuration: {
        maxConnections: 5,
        sharingEnabled: true,
      },
      ownerId: testUser.id,
      isPublic: false,
      tasksCompleted: 15,
      successRate: 0.92,
    },
  });

  const specializedAgent = await prisma.agent.create({
    data: {
      name: 'Data Analyst',
      description: 'Specialized agent for data analysis and visualization',
      type: 'SPECIALIZED',
      status: 'ACTIVE',
      capabilities: ['data_analysis', 'visualization', 'statistics', 'machine_learning'],
      configuration: {
        modelTypes: ['regression', 'classification', 'clustering'],
        maxDataSize: 1000000,
      },
      ownerId: adminUser.id,
      isPublic: true,
      tasksCompleted: 128,
      successRate: 0.94,
      lastActiveAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
  });

  logger.info('Created agents:', {
    autonomous: autonomousAgent.id,
    collaborative: collaborativeAgent.id,
    specialized: specializedAgent.id,
  });

  // Create test memories
  const memories = [
    {
      content: 'User prefers concise responses with bullet points',
      type: 'PREFERENCE' as const,
      importance: 0.8,
      tags: ['user_preference', 'communication'],
      agentId: autonomousAgent.id,
      userId: testUser.id,
    },
    {
      content: 'Successfully completed data visualization task using Python matplotlib',
      type: 'EXPERIENCE' as const,
      importance: 0.9,
      tags: ['python', 'visualization', 'success'],
      agentId: specializedAgent.id,
      userId: adminUser.id,
    },
    {
      content: 'Machine learning model: Random Forest with 94% accuracy on customer data',
      type: 'KNOWLEDGE' as const,
      importance: 0.95,
      tags: ['machine_learning', 'random_forest', 'accuracy'],
      agentId: specializedAgent.id,
      userId: adminUser.id,
    },
    {
      content: 'Goal: Improve response time to under 2 seconds for all queries',
      type: 'GOAL' as const,
      importance: 0.7,
      tags: ['performance', 'response_time', 'optimization'],
      agentId: autonomousAgent.id,
      userId: testUser.id,
    },
    {
      content: 'Context: Working on customer service automation project',
      type: 'CONTEXT' as const,
      importance: 0.6,
      tags: ['project', 'customer_service', 'automation'],
      agentId: collaborativeAgent.id,
      userId: testUser.id,
    },
  ];

  const createdMemories = await Promise.all(
    memories.map(memory => prisma.memory.create({ data: memory }))
  );

  logger.info(`Created ${createdMemories.length} memories`);

  // Create memory hierarchy (parent-child relationships)
  await prisma.memory.update({
    where: { id: createdMemories[4].id }, // Context memory
    data: { parentId: createdMemories[1].id }, // Child of experience memory
  });

  // Create test transactions
  const transactions = [
    {
      type: 'AGENT_CREATION' as const,
      status: 'CONFIRMED' as const,
      agentId: autonomousAgent.id,
      userId: testUser.id,
      data: { agentId: autonomousAgent.id, type: 'AUTONOMOUS' },
      txHash: '0xabcd1234567890abcd1234567890abcd1234567890abcd1234567890abcd1234',
      gasUsed: BigInt(21000),
      confirmations: 12,
    },
    {
      type: 'MEMORY_STORE' as const,
      status: 'CONFIRMED' as const,
      agentId: specializedAgent.id,
      userId: adminUser.id,
      data: { memoryId: createdMemories[2].id, type: 'KNOWLEDGE' },
      txHash: '0xefgh5678901234efgh5678901234efgh5678901234efgh5678901234efgh5678',
      gasUsed: BigInt(45000),
      confirmations: 8,
    },
    {
      type: 'TOKEN_TRANSFER' as const,
      status: 'PENDING' as const,
      userId: testUser.id,
      value: '0.1',
      toAddress: '0x9876543210987654321098765432109876543210',
      data: { amount: '0.1', purpose: 'agent_reward' },
    },
  ];

  const createdTransactions = await Promise.all(
    transactions.map(transaction => prisma.transaction.create({ data: transaction }))
  );

  logger.info(`Created ${createdTransactions.length} transactions`);

  // Create agent metrics
  const now = new Date();
  const metricsData = [];

  // Generate metrics for the last 24 hours
  for (let i = 0; i < 24; i++) {
    const timestamp = new Date(now.getTime() - i * 60 * 60 * 1000);

    metricsData.push({
      agentId: autonomousAgent.id,
      cpuUsage: 0.3 + Math.random() * 0.4, // 30-70%
      memoryUsage: 0.4 + Math.random() * 0.3, // 40-70%
      responseTime: 500 + Math.random() * 1000, // 500-1500ms
      errorRate: Math.random() * 0.05, // 0-5%
      throughput: Math.floor(50 + Math.random() * 50), // 50-100 ops/min
      taskSuccess: Math.random() > 0.1, // 90% success rate
      userSatisfaction: 0.7 + Math.random() * 0.3, // 70-100%
      recordedAt: timestamp,
    });

    metricsData.push({
      agentId: specializedAgent.id,
      cpuUsage: 0.2 + Math.random() * 0.3, // 20-50%
      memoryUsage: 0.5 + Math.random() * 0.4, // 50-90%
      responseTime: 800 + Math.random() * 700, // 800-1500ms
      errorRate: Math.random() * 0.03, // 0-3%
      throughput: Math.floor(20 + Math.random() * 30), // 20-50 ops/min
      taskSuccess: Math.random() > 0.06, // 94% success rate
      userSatisfaction: 0.8 + Math.random() * 0.2, // 80-100%
      recordedAt: timestamp,
    });
  }

  await Promise.all(
    metricsData.map(metrics => prisma.agentMetric.create({ data: metrics }))
  );

  logger.info(`Created ${metricsData.length} agent metrics`);

  // Create API keys
  const apiKeyHash = await bcrypt.hash('aeterna_test_key_1234567890', 1);

  await prisma.apiKey.create({
    data: {
      name: 'Test API Key',
      keyHash: apiKeyHash,
      prefix: 'ak_test_',
      permissions: ['agents:read', 'memories:read', 'memories:write'],
      userId: testUser.id,
      rateLimit: 1000,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    },
  });

  // Create audit logs
  const auditLogs = [
    {
      action: 'user_login',
      entityType: 'user',
      entityId: testUser.id,
      userId: testUser.id,
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      details: { loginMethod: 'password' },
      timestamp: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    },
    {
      action: 'agent_created',
      entityType: 'agent',
      entityId: autonomousAgent.id,
      userId: testUser.id,
      ipAddress: '192.168.1.100',
      details: { agentType: 'AUTONOMOUS', agentName: autonomousAgent.name },
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      action: 'memory_created',
      entityType: 'memory',
      entityId: createdMemories[0].id,
      userId: testUser.id,
      details: { memoryType: 'PREFERENCE', agentId: autonomousAgent.id },
      timestamp: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
    },
  ];

  await Promise.all(
    auditLogs.map(log => prisma.auditLog.create({ data: log }))
  );

  logger.info(`Created ${auditLogs.length} audit log entries`);

  // Create sessions
  await prisma.session.create({
    data: {
      sessionToken: 'test_session_token_1234567890',
      userId: testUser.id,
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      lastAccessedAt: new Date(),
    },
  });

  logger.info('Database seed completed successfully!');
}

main()
  .catch((e) => {
    logger.error('Database seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });