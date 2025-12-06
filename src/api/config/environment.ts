import { z } from 'zod';
import { config } from 'dotenv';
import { EnvironmentSchema, type Environment, type ApiConfig } from '../types/api.types';

// Load environment variables
config();

/**
 * Validate and parse environment variables
 */
export function validateEnvironment(): Environment {
  try {
    return EnvironmentSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      throw new Error(`Invalid environment configuration:\n${missingVars.join('\n')}`);
    }
    throw error;
  }
}

/**
 * Get validated environment configuration
 */
export const env = validateEnvironment();

/**
 * Create API configuration from environment
 */
export function createApiConfig(): ApiConfig {
  return {
    port: env.PORT,
    host: '0.0.0.0',
    nodeEnv: env.NODE_ENV,
    apiVersion: env.API_VERSION,
    enableSwagger: env.ENABLE_SWAGGER,
    enableMetrics: env.ENABLE_METRICS,
    cors: {
      origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
      credentials: true,
    },
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    },
    upload: {
      maxFileSize: env.MAX_FILE_SIZE,
      allowedTypes: env.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
      destination: env.UPLOAD_PATH,
    },
    jwt: {
      secret: env.JWT_SECRET,
      expiresIn: env.JWT_EXPIRES_IN,
      refreshSecret: env.REFRESH_TOKEN_SECRET,
      refreshExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
    },
    database: {
      url: env.DATABASE_URL,
    },
    websocket: {
      port: env.WS_PORT,
      corsOrigin: env.WS_CORS_ORIGIN,
    },
    redis: env.REDIS_HOST ? {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT || 6379,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    } : undefined,
  };
}

/**
 * API configuration instance
 */
export const apiConfig = createApiConfig();

/**
 * Check if running in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Check if running in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Check if running in test environment
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Get database URL for the current environment
 */
export function getDatabaseUrl(): string {
  return env.DATABASE_URL;
}

/**
 * Get JWT configuration
 */
export function getJwtConfig() {
  return {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.REFRESH_TOKEN_SECRET,
    refreshExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  };
}

/**
 * Get upload configuration
 */
export function getUploadConfig() {
  return {
    maxFileSize: env.MAX_FILE_SIZE,
    allowedTypes: env.ALLOWED_FILE_TYPES.split(',').map(type => type.trim()),
    destination: env.UPLOAD_PATH,
  };
}

/**
 * Get CORS configuration
 */
export function getCorsConfig() {
  return {
    origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
    credentials: true,
  };
}

/**
 * Get rate limiting configuration
 */
export function getRateLimitConfig() {
  return {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  };
}

/**
 * Get Redis configuration (if available)
 */
export function getRedisConfig() {
  if (!env.REDIS_HOST) {
    return null;
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT || 6379,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
  };
}

/**
 * Get WebSocket configuration
 */
export function getWebSocketConfig() {
  return {
    port: env.WS_PORT,
    corsOrigin: env.WS_CORS_ORIGIN,
  };
}