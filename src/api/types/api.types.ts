import { Request, Response } from 'express';
import { z } from 'zod';
import type { User, Agent, Task, Session } from '../types/generated';

// Extend Express Request with custom properties
export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: Session;
  agent?: Agent;
  requestId?: string;
  startTime?: number;
}

// Extend Express Response with custom methods
export interface TypedResponse<T = any> extends Response {
  success: (data?: T, message?: string) => Response;
  error: (message: string, statusCode?: number, details?: any) => Response;
  paginated: (data: T[], meta: any) => Response;
}

// Route Handler Type
export type RouteHandler<
  TRequest = any,
  TResponse = any
> = (
  req: AuthenticatedRequest & { body: TRequest },
  res: TypedResponse<TResponse>
) => Promise<Response> | Response;

// Async Route Handler
export type AsyncRouteHandler<TRequest = any, TResponse = any> = (
  req: AuthenticatedRequest & { body: TRequest },
  res: TypedResponse<TResponse>
) => Promise<Response>;

// Middleware Type
export type MiddlewareFunction = (
  req: AuthenticatedRequest,
  res: TypedResponse,
  next: Function
) => void | Promise<void>;

// API Configuration
export interface ApiConfig {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  apiVersion: string;
  enableSwagger: boolean;
  enableMetrics: boolean;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  upload: {
    maxFileSize: number;
    allowedTypes: string[];
    destination: string;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  database: {
    url: string;
  };
  websocket: {
    port: number;
    corsOrigin: string;
  };
  redis?: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
}

// Environment Variables Schema
export const EnvironmentSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_VERSION: z.string().default('v1'),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REFRESH_TOKEN_SECRET: z.string(),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('30d'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MAX_FILE_SIZE: z.coerce.number().default(10485760),
  UPLOAD_PATH: z.string().default('./uploads'),
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/gif,application/pdf,text/plain'),
  WS_PORT: z.coerce.number().default(3002),
  WS_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  LOG_FILE: z.string().default('./logs/api.log'),
  ENABLE_SWAGGER: z.coerce.boolean().default(true),
  ENABLE_METRICS: z.coerce.boolean().default(true),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

// Health Check Response
export interface HealthCheck {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis?: 'connected' | 'disconnected' | 'error';
    websocket: 'active' | 'inactive' | 'error';
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    activeConnections: number;
  };
}

// API Metrics
export interface ApiMetrics {
  requestsTotal: number;
  requestsPerSecond: number;
  averageResponseTime: number;
  errorRate: number;
  activeUsers: number;
  activeAgents: number;
  activeTasks: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  timestamp: string;
}

// File Upload Types
export interface FileUploadOptions {
  maxSize: number;
  allowedTypes: string[];
  destination: string;
  filename?: (req: Request, file: Express.Multer.File) => string;
}

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  metadata?: Record<string, any>;
}

// WebSocket Event Types
export interface WebSocketEvent {
  type: string;
  data: any;
  timestamp: string;
  userId?: string;
  agentId?: string;
  sessionId?: string;
}

// Rate Limiting
export interface RateLimitInfo {
  totalHits: number;
  totalTime: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInDuration: boolean;
}

// Audit Log
export interface AuditLogEntry {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}