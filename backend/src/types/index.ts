import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// Extend Express Request type to include user
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    walletAddress?: string;
  };
}

// JWT Payload interface
export interface TokenPayload extends JwtPayload {
  id: string;
  email: string;
  username: string;
  walletAddress?: string;
  type: 'access' | 'refresh';
}

// API Response wrapper
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

// Pagination interface
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Agent types
export interface CreateAgentRequest {
  name: string;
  description?: string;
  type: 'AUTONOMOUS' | 'COLLABORATIVE' | 'SPECIALIZED' | 'LEARNING';
  capabilities: string[];
  configuration?: Record<string, any>;
  isPublic?: boolean;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  capabilities?: string[];
  configuration?: Record<string, any>;
  isPublic?: boolean;
  status?: 'ACTIVE' | 'INACTIVE' | 'BUSY' | 'ERROR' | 'MAINTENANCE';
}

// Memory types
export interface CreateMemoryRequest {
  content: string;
  type: 'EXPERIENCE' | 'KNOWLEDGE' | 'SKILL' | 'PREFERENCE' | 'CONTEXT' | 'GOAL';
  importance?: number;
  tags?: string[];
  metadata?: Record<string, any>;
  parentId?: string;
  agentId: string;
}

export interface UpdateMemoryRequest {
  content?: string;
  importance?: number;
  tags?: string[];
  metadata?: Record<string, any>;
}

// Transaction types
export interface CreateTransactionRequest {
  type: 'AGENT_CREATION' | 'AGENT_UPDATE' | 'MEMORY_STORE' | 'TOKEN_TRANSFER' | 'CONTRACT_INTERACTION' | 'PAYMENT';
  agentId?: string;
  data?: Record<string, any>;
  value?: string;
  toAddress?: string;
}

// User types
export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  bio?: string;
  avatar?: string;
}

// WebSocket event types
export interface WSMessage {
  type: 'agent_status' | 'memory_update' | 'transaction_update' | 'notification';
  data: any;
  agentId?: string;
  userId?: string;
  timestamp: Date;
}

// Blockchain types
export interface BlockchainConfig {
  rpcUrl: string;
  privateKey: string;
  network: string;
  contractAddress?: string;
}

// Error types
export interface ApiError {
  status: number;
  message: string;
  code?: string;
  details?: any;
}

// Cache types
export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

// File upload types
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

// Metrics types
export interface AgentMetrics {
  cpuUsage?: number;
  memoryUsage?: number;
  responseTime?: number;
  errorRate?: number;
  throughput?: number;
  taskSuccess?: boolean;
  userSatisfaction?: number;
}

// Search types
export interface SearchParams {
  query?: string;
  filters?: Record<string, any>;
  facets?: string[];
  highlight?: boolean;
}

// Rate limiting types
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipIf?: (req: Request) => boolean;
}

// Validation types
export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Health check types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    database: 'up' | 'down';
    redis: 'up' | 'down';
    blockchain: 'up' | 'down';
  };
  uptime: number;
  version: string;
}