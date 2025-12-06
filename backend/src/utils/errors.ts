import httpStatus from 'http-status';
import { ApiError } from '../types';

/**
 * Custom API Error class
 */
export class CustomApiError extends Error {
  public status: number;
  public code?: string;
  public details?: any;

  constructor(status: number, message: string, code?: string, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomApiError);
    }
  }
}

/**
 * Create API error
 */
export const createApiError = (
  status: number,
  message: string,
  code?: string,
  details?: any
): CustomApiError => {
  return new CustomApiError(status, message, code, details);
};

/**
 * Predefined error creators
 */
export const errors = {
  // 400 Bad Request
  badRequest: (message: string = 'Bad Request', details?: any) =>
    createApiError(httpStatus.BAD_REQUEST, message, 'BAD_REQUEST', details),

  // 401 Unauthorized
  unauthorized: (message: string = 'Unauthorized', details?: any) =>
    createApiError(httpStatus.UNAUTHORIZED, message, 'UNAUTHORIZED', details),

  // 403 Forbidden
  forbidden: (message: string = 'Forbidden', details?: any) =>
    createApiError(httpStatus.FORBIDDEN, message, 'FORBIDDEN', details),

  // 404 Not Found
  notFound: (message: string = 'Not Found', details?: any) =>
    createApiError(httpStatus.NOT_FOUND, message, 'NOT_FOUND', details),

  // 409 Conflict
  conflict: (message: string = 'Conflict', details?: any) =>
    createApiError(httpStatus.CONFLICT, message, 'CONFLICT', details),

  // 422 Unprocessable Entity
  unprocessableEntity: (message: string = 'Unprocessable Entity', details?: any) =>
    createApiError(httpStatus.UNPROCESSABLE_ENTITY, message, 'UNPROCESSABLE_ENTITY', details),

  // 429 Too Many Requests
  tooManyRequests: (message: string = 'Too Many Requests', details?: any) =>
    createApiError(httpStatus.TOO_MANY_REQUESTS, message, 'TOO_MANY_REQUESTS', details),

  // 500 Internal Server Error
  internal: (message: string = 'Internal Server Error', details?: any) =>
    createApiError(httpStatus.INTERNAL_SERVER_ERROR, message, 'INTERNAL_SERVER_ERROR', details),

  // 503 Service Unavailable
  serviceUnavailable: (message: string = 'Service Unavailable', details?: any) =>
    createApiError(httpStatus.SERVICE_UNAVAILABLE, message, 'SERVICE_UNAVAILABLE', details),
};

/**
 * Domain-specific error creators
 */
export const domainErrors = {
  // User related errors
  user: {
    emailExists: () => errors.conflict('Email already exists'),
    usernameExists: () => errors.conflict('Username already exists'),
    invalidCredentials: () => errors.unauthorized('Invalid email or password'),
    accountDeactivated: () => errors.unauthorized('Account has been deactivated'),
    emailNotVerified: () => errors.unauthorized('Email address not verified'),
    userNotFound: () => errors.notFound('User not found'),
    invalidToken: () => errors.unauthorized('Invalid or expired token'),
    tokenExpired: () => errors.unauthorized('Token has expired'),
    refreshTokenInvalid: () => errors.unauthorized('Invalid refresh token'),
    walletAlreadyLinked: () => errors.conflict('Wallet already linked to another account'),
  },

  // Agent related errors
  agent: {
    notFound: () => errors.notFound('Agent not found'),
    notOwner: () => errors.forbidden('You do not own this agent'),
    nameExists: () => errors.conflict('Agent name already exists'),
    limitExceeded: () => errors.forbidden('Agent creation limit exceeded'),
    invalidStatus: () => errors.badRequest('Invalid agent status transition'),
    configurationInvalid: () => errors.unprocessableEntity('Invalid agent configuration'),
    capabilitiesRequired: () => errors.badRequest('At least one capability is required'),
    contractCreationFailed: () => errors.internal('Failed to create agent on blockchain'),
  },

  // Memory related errors
  memory: {
    notFound: () => errors.notFound('Memory not found'),
    notOwner: () => errors.forbidden('You do not own this memory'),
    parentNotFound: () => errors.badRequest('Parent memory not found'),
    circularReference: () => errors.badRequest('Circular memory reference detected'),
    importanceTooHigh: () => errors.badRequest('Memory importance cannot exceed 1.0'),
    importanceTooLow: () => errors.badRequest('Memory importance cannot be negative'),
    contentTooLong: () => errors.badRequest('Memory content exceeds maximum length'),
    limitExceeded: () => errors.forbidden('Memory creation limit exceeded for this agent'),
  },

  // Transaction related errors
  transaction: {
    notFound: () => errors.notFound('Transaction not found'),
    notOwner: () => errors.forbidden('You do not own this transaction'),
    alreadyConfirmed: () => errors.conflict('Transaction already confirmed'),
    insufficientBalance: () => errors.badRequest('Insufficient balance'),
    invalidAmount: () => errors.badRequest('Invalid transaction amount'),
    gasEstimationFailed: () => errors.internal('Gas estimation failed'),
    transactionFailed: () => errors.internal('Transaction failed on blockchain'),
    networkError: () => errors.serviceUnavailable('Blockchain network error'),
  },

  // API Key related errors
  apiKey: {
    notFound: () => errors.notFound('API key not found'),
    invalid: () => errors.unauthorized('Invalid API key'),
    expired: () => errors.unauthorized('API key expired'),
    rateLimitExceeded: () => errors.tooManyRequests('API key rate limit exceeded'),
    limitExceeded: () => errors.forbidden('API key creation limit exceeded'),
    nameExists: () => errors.conflict('API key name already exists'),
  },

  // File upload related errors
  file: {
    tooLarge: (maxSize: string) => errors.badRequest(`File too large. Maximum size: ${maxSize}`),
    invalidType: (allowedTypes: string[]) =>
      errors.badRequest(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`),
    uploadFailed: () => errors.internal('File upload failed'),
    notFound: () => errors.notFound('File not found'),
    processingFailed: () => errors.internal('File processing failed'),
  },

  // Blockchain related errors
  blockchain: {
    connectionFailed: () => errors.serviceUnavailable('Blockchain connection failed'),
    invalidAddress: () => errors.badRequest('Invalid wallet address'),
    transactionTimeout: () => errors.serviceUnavailable('Transaction timeout'),
    insufficientGas: () => errors.badRequest('Insufficient gas for transaction'),
    contractNotFound: () => errors.notFound('Smart contract not found'),
    contractError: (error: string) => errors.internal(`Contract error: ${error}`),
    signatureFailed: () => errors.internal('Transaction signature failed'),
    networkMismatch: () => errors.badRequest('Network mismatch'),
  },

  // Cache related errors
  cache: {
    connectionFailed: () => errors.serviceUnavailable('Cache service unavailable'),
    operationFailed: () => errors.internal('Cache operation failed'),
    invalidKey: () => errors.badRequest('Invalid cache key'),
    serializationFailed: () => errors.internal('Data serialization failed'),
  },

  // Database related errors
  database: {
    connectionFailed: () => errors.serviceUnavailable('Database connection failed'),
    queryFailed: () => errors.internal('Database query failed'),
    constraintViolation: () => errors.conflict('Database constraint violation'),
    transactionFailed: () => errors.internal('Database transaction failed'),
    migrationFailed: () => errors.internal('Database migration failed'),
  },

  // WebSocket related errors
  websocket: {
    connectionFailed: () => errors.serviceUnavailable('WebSocket connection failed'),
    unauthorized: () => errors.unauthorized('WebSocket authentication required'),
    rateLimitExceeded: () => errors.tooManyRequests('WebSocket rate limit exceeded'),
    invalidMessage: () => errors.badRequest('Invalid WebSocket message format'),
    roomNotFound: () => errors.notFound('WebSocket room not found'),
  },

  // Search related errors
  search: {
    invalidQuery: () => errors.badRequest('Invalid search query'),
    tooManyResults: () => errors.badRequest('Search query returned too many results'),
    serviceUnavailable: () => errors.serviceUnavailable('Search service unavailable'),
    indexingFailed: () => errors.internal('Search indexing failed'),
  },

  // External service errors
  external: {
    openaiError: (error: string) => errors.serviceUnavailable(`OpenAI API error: ${error}`),
    anthropicError: (error: string) => errors.serviceUnavailable(`Anthropic API error: ${error}`),
    ipfsError: (error: string) => errors.serviceUnavailable(`IPFS error: ${error}`),
    webhookFailed: () => errors.internal('Webhook delivery failed'),
  },
};

/**
 * Error response formatter
 */
export const formatErrorResponse = (error: CustomApiError): ApiError => {
  return {
    status: error.status,
    message: error.message,
    code: error.code,
    details: error.details,
  };
};

/**
 * Check if error is operational (expected) vs programming error
 */
export const isOperationalError = (error: Error): boolean => {
  if (error instanceof CustomApiError) {
    return true;
  }

  // Known operational error patterns
  const operationalPatterns = [
    'ValidationError',
    'CastError',
    'JsonWebTokenError',
    'TokenExpiredError',
    'MulterError',
  ];

  return operationalPatterns.some(pattern => error.name.includes(pattern));
};

/**
 * Convert unknown error to API error
 */
export const convertToApiError = (error: any): CustomApiError => {
  // Already an API error
  if (error instanceof CustomApiError) {
    return error;
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return domainErrors.user.invalidToken();
  }
  if (error.name === 'TokenExpiredError') {
    return domainErrors.user.tokenExpired();
  }

  // Prisma errors
  if (error.code === 'P2002') {
    return errors.conflict('Unique constraint violation');
  }
  if (error.code === 'P2025') {
    return errors.notFound('Record not found');
  }
  if (error.code === 'P2003') {
    return errors.badRequest('Foreign key constraint failed');
  }

  // Multer errors
  if (error.name === 'MulterError') {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return domainErrors.file.tooLarge('specified limit');
    }
    return domainErrors.file.uploadFailed();
  }

  // Generic validation errors
  if (error.name === 'ValidationError') {
    return errors.badRequest('Validation failed', error.details);
  }

  // Network errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return errors.serviceUnavailable('External service unavailable');
  }

  // Default to internal server error
  return errors.internal('An unexpected error occurred');
};

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Get error severity based on status code
 */
export const getErrorSeverity = (status: number): ErrorSeverity => {
  if (status >= 500) {
    return ErrorSeverity.CRITICAL;
  }
  if (status >= 400) {
    return ErrorSeverity.MEDIUM;
  }
  return ErrorSeverity.LOW;
};

/**
 * Error tracking helper
 */
export const trackError = (error: CustomApiError, context?: Record<string, any>) => {
  const severity = getErrorSeverity(error.status);

  // Log error with context
  const logData = {
    error: {
      message: error.message,
      status: error.status,
      code: error.code,
      stack: error.stack,
    },
    context,
    severity,
    timestamp: new Date().toISOString(),
  };

  // TODO: Send to error tracking service (Sentry, etc.)
  console.error('Error tracked:', logData);
};

export default {
  CustomApiError,
  createApiError,
  errors,
  domainErrors,
  formatErrorResponse,
  isOperationalError,
  convertToApiError,
  ErrorSeverity,
  getErrorSeverity,
  trackError,
};