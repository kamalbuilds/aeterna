import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { User, Session, ApiKey } from '../types/generated';
import type { JwtPayload, ApiKeyPayload } from './auth.types';
import type { AuthenticatedRequest, TypedResponse } from './api.types';

// Middleware Function Type
export type Middleware = (
  req: AuthenticatedRequest,
  res: TypedResponse,
  next: NextFunction
) => void | Promise<void>;

// Authentication Middleware Types
export interface AuthenticationOptions {
  required: boolean;
  allowApiKey: boolean;
  skipPaths?: string[];
  customVerification?: (token: string) => Promise<JwtPayload | null>;
}

export interface AuthenticationResult {
  success: boolean;
  user?: User;
  session?: Session;
  apiKey?: ApiKey;
  payload?: JwtPayload | ApiKeyPayload;
  error?: string;
}

// Authorization Middleware Types
export interface AuthorizationOptions {
  permissions?: string[];
  roles?: string[];
  resource?: string;
  resourceId?: string;
  customCheck?: (user: User, req: AuthenticatedRequest) => Promise<boolean>;
}

// Validation Middleware Types
export interface ValidationOptions {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
  headers?: z.ZodSchema;
  files?: FileValidationOptions;
  customValidators?: Array<(req: AuthenticatedRequest) => Promise<ValidationResult>>;
}

export interface FileValidationOptions {
  maxSize?: number;
  allowedTypes?: string[];
  maxFiles?: number;
  required?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{
    field: string;
    message: string;
    value?: any;
  }>;
}

// Rate Limiting Middleware Types
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  keyGenerator?: (req: AuthenticatedRequest) => string;
  skipIf?: (req: AuthenticatedRequest) => boolean;
  onLimitReached?: (req: AuthenticatedRequest, res: TypedResponse) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInDuration: boolean;
}

// CORS Middleware Types
export interface CorsOptions {
  origin: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
  preflightContinue?: boolean;
  optionsSuccessStatus?: number;
}

// Logging Middleware Types
export interface LoggingOptions {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'combined' | 'common' | 'short' | 'tiny' | 'dev' | 'json';
  skip?: (req: AuthenticatedRequest, res: TypedResponse) => boolean;
  includeBody?: boolean;
  includeHeaders?: boolean;
  includeQuery?: boolean;
  maxBodySize?: number;
  sensitiveFields?: string[];
}

export interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  requestId?: string;
  body?: any;
  query?: any;
  headers?: Record<string, string>;
  error?: string;
}

// Request Transformation Middleware
export interface TransformOptions {
  lowercase?: string[];
  uppercase?: string[];
  trim?: string[];
  sanitize?: string[];
  defaults?: Record<string, any>;
  customTransforms?: Array<{
    field: string;
    transform: (value: any) => any;
  }>;
}

// Security Middleware Types
export interface SecurityOptions {
  helmet?: {
    contentSecurityPolicy?: boolean;
    hsts?: boolean;
    noSniff?: boolean;
    frameguard?: boolean;
    xssFilter?: boolean;
  };
  rateLimit?: RateLimitOptions;
  ipWhitelist?: string[];
  ipBlacklist?: string[];
  userAgentBlacklist?: RegExp[];
  requireHttps?: boolean;
  apiKeyRequired?: boolean;
}

// Cache Middleware Types
export interface CacheOptions {
  ttl: number; // seconds
  keyGenerator?: (req: AuthenticatedRequest) => string;
  condition?: (req: AuthenticatedRequest) => boolean;
  invalidatePatterns?: string[];
  compress?: boolean;
  headers?: boolean;
  vary?: string[];
}

export interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  headers?: Record<string, string>;
}

// Compression Middleware Types
export interface CompressionOptions {
  level?: number; // 1-9
  threshold?: number; // bytes
  filter?: (req: AuthenticatedRequest, res: TypedResponse) => boolean;
  chunkSize?: number;
  windowBits?: number;
  memLevel?: number;
}

// Request ID Middleware
export interface RequestIdOptions {
  generator?: () => string;
  headerName?: string;
  attributeName?: string;
  setResponseHeader?: boolean;
}

// Error Handling Middleware Types
export interface ErrorHandlingOptions {
  includeStack?: boolean;
  logErrors?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  customHandler?: (error: Error, req: AuthenticatedRequest, res: TypedResponse) => void;
  notifyExternal?: boolean;
  sensitiveFields?: string[];
}

// Health Check Middleware
export interface HealthCheckOptions {
  path?: string;
  checks?: Array<{
    name: string;
    check: () => Promise<{ status: 'ok' | 'error'; details?: any }>;
  }>;
  includeDetails?: boolean;
  timeout?: number;
}

// API Versioning Middleware
export interface VersioningOptions {
  strategy: 'header' | 'query' | 'path' | 'subdomain';
  headerName?: string;
  queryParam?: string;
  pathPrefix?: string;
  defaultVersion?: string;
  supportedVersions?: string[];
}

// Webhook Verification Middleware
export interface WebhookOptions {
  secret: string;
  algorithm?: 'sha1' | 'sha256';
  headerName?: string;
  prefix?: string;
  encoding?: 'hex' | 'base64';
}

// Pagination Middleware Types
export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  limitParam?: string;
  pageParam?: string;
  offsetParam?: string;
  includeTotal?: boolean;
  includePages?: boolean;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  offset: number;
  total?: number;
  totalPages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

// Context Middleware Types
export interface ContextOptions {
  timeout?: number;
  maxRequestSize?: number;
  includeUserAgent?: boolean;
  includeIpAddress?: boolean;
  includeTimestamp?: boolean;
  customContext?: (req: AuthenticatedRequest) => Record<string, any>;
}

export interface RequestContext {
  requestId: string;
  timestamp: string;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  sessionId?: string;
  custom?: Record<string, any>;
}

// Metrics Middleware Types
export interface MetricsOptions {
  collectAll?: boolean;
  customMetrics?: Array<{
    name: string;
    type: 'counter' | 'histogram' | 'gauge';
    description: string;
    labels?: string[];
    collector: (req: AuthenticatedRequest, res: TypedResponse) => number;
  }>;
  excludePaths?: string[];
  buckets?: number[];
}

export interface RequestMetrics {
  method: string;
  route: string;
  statusCode: number;
  responseTime: number;
  requestSize: number;
  responseSize: number;
  timestamp: string;
  userId?: string;
  userAgent?: string;
}

// Maintenance Mode Middleware
export interface MaintenanceOptions {
  enabled: boolean;
  message?: string;
  statusCode?: number;
  allowedIPs?: string[];
  allowedUsers?: string[];
  estimatedTime?: string;
  bypassHeader?: string;
}

// API Documentation Middleware
export interface DocumentationOptions {
  path?: string;
  title?: string;
  version?: string;
  description?: string;
  contact?: {
    name: string;
    email: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
  customCss?: string;
}

// File Upload Middleware Types
export interface FileUploadOptions {
  destination?: string;
  filename?: (req: AuthenticatedRequest, file: Express.Multer.File) => string;
  fileFilter?: (req: AuthenticatedRequest, file: Express.Multer.File) => boolean;
  limits?: {
    fileSize?: number;
    files?: number;
    fields?: number;
  };
  preservePath?: boolean;
}

// Response Time Middleware
export interface ResponseTimeOptions {
  digits?: number;
  header?: boolean;
  suffix?: boolean;
}

// Slow Request Detection
export interface SlowRequestOptions {
  threshold: number; // milliseconds
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  includeStack?: boolean;
  notify?: (req: AuthenticatedRequest, duration: number) => void;
}