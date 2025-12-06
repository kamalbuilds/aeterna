import { Prisma } from '@prisma/client';

// Re-export Prisma types for convenience
export type PrismaClient = Prisma.PrismaClient;
export type PrismaTransaction = Prisma.TransactionClient;

// Database Connection Configuration
export interface DatabaseConfig {
  url: string;
  maxConnections: number;
  connectionTimeout: number;
  queryTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  logging: boolean;
  logLevel: 'info' | 'warn' | 'error';
}

// Query Options
export interface QueryOptions {
  include?: Record<string, boolean | object>;
  select?: Record<string, boolean>;
  where?: Record<string, any>;
  orderBy?: Record<string, 'asc' | 'desc'> | Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  skip?: number;
}

// Pagination Options
export interface DatabasePaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Pagination Result
export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Transaction Context
export interface TransactionContext {
  tx: PrismaTransaction;
  userId?: string;
  sessionId?: string;
  requestId?: string;
}

// Database Operations
export interface DatabaseRepository<T> {
  create(data: any, options?: QueryOptions): Promise<T>;
  findById(id: string, options?: QueryOptions): Promise<T | null>;
  findMany(options?: QueryOptions): Promise<T[]>;
  findFirst(options?: QueryOptions): Promise<T | null>;
  update(id: string, data: any, options?: QueryOptions): Promise<T>;
  delete(id: string): Promise<T>;
  count(options?: Omit<QueryOptions, 'include' | 'select' | 'orderBy' | 'take' | 'skip'>): Promise<number>;
  paginate(options: DatabasePaginationOptions & QueryOptions): Promise<PaginationResult<T>>;
}

// Audit Log Data
export interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// Database Health Check
export interface DatabaseHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  connections: {
    active: number;
    idle: number;
    total: number;
    max: number;
  };
  performance: {
    averageQueryTime: number;
    slowQueries: number;
    totalQueries: number;
  };
  errors: {
    connectionErrors: number;
    queryErrors: number;
    timeoutErrors: number;
  };
  uptime: number;
  timestamp: string;
}

// Migration Status
export interface MigrationStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';
  appliedAt?: string;
  error?: string;
  duration?: number;
}

// Database Metrics
export interface DatabaseMetrics {
  connections: {
    total: number;
    active: number;
    idle: number;
    waiting: number;
  };
  queries: {
    total: number;
    successful: number;
    failed: number;
    averageTime: number;
    slowQueries: number;
  };
  transactions: {
    total: number;
    committed: number;
    rolledBack: number;
    averageTime: number;
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
  };
  locks: {
    acquired: number;
    waiting: number;
    deadlocks: number;
  };
  timestamp: string;
}

// Seed Data Types
export interface SeedUser {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role: 'ADMIN' | 'USER' | 'DEVELOPER' | 'MODERATOR';
  verified: boolean;
}

export interface SeedAgent {
  name: string;
  type: 'RESEARCHER' | 'CODER' | 'ANALYST' | 'OPTIMIZER' | 'COORDINATOR' | 'CUSTOM';
  userId: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PAUSED' | 'ERROR' | 'MAINTENANCE';
  configuration?: Record<string, any>;
  capabilities?: string[];
}

export interface SeedTask {
  title: string;
  description?: string;
  agentId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';
  input?: Record<string, any>;
  output?: Record<string, any>;
}

// Database Event Types
export interface DatabaseEvent {
  type: 'create' | 'update' | 'delete';
  table: string;
  id: string;
  data?: Record<string, any>;
  oldData?: Record<string, any>;
  userId?: string;
  timestamp: string;
}

// Soft Delete Interface
export interface SoftDeletable {
  deletedAt?: Date | null;
  deletedBy?: string | null;
}

// Timestamped Interface
export interface Timestamped {
  createdAt: Date;
  updatedAt: Date;
}

// Versioned Interface
export interface Versioned {
  version: number;
  versionHistory?: Array<{
    version: number;
    changes: Record<string, any>;
    changedBy: string;
    changedAt: Date;
  }>;
}

// Full-Text Search
export interface SearchOptions {
  query: string;
  fields?: string[];
  fuzzy?: boolean;
  boost?: Record<string, number>;
  filters?: Record<string, any>;
  highlight?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult<T> {
  items: Array<T & {
    score?: number;
    highlights?: Record<string, string[]>;
  }>;
  total: number;
  facets?: Record<string, Array<{
    value: string;
    count: number;
  }>>;
  suggestions?: string[];
}

// Database Backup
export interface BackupInfo {
  id: string;
  type: 'full' | 'incremental';
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  size?: number;
  location: string;
  error?: string;
}

// Database Schema Information
export interface TableInfo {
  name: string;
  columns: Array<{
    name: string;
    type: string;
    nullable: boolean;
    default?: any;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: {
      table: string;
      column: string;
    };
  }>;
  indexes: Array<{
    name: string;
    columns: string[];
    unique: boolean;
    type: string;
  }>;
  rowCount: number;
  size: number;
}

// Query Performance
export interface QueryPerformance {
  query: string;
  duration: number;
  executionPlan?: any;
  rowsAffected: number;
  timestamp: string;
  parameters?: any[];
  error?: string;
}

// Connection Pool Status
export interface ConnectionPoolStatus {
  size: number;
  used: number;
  waiting: number;
  idle: number;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
  averageWaitTime: number;
  peakUsage: number;
}