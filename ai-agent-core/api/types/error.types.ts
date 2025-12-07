// Custom Error Classes
export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, any>;
  public readonly field?: string;
  public readonly timestamp: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, any>,
    field?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.field = field;
    this.timestamp = new Date().toISOString();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      field: this.field,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

export class ValidationError extends ApiError {
  constructor(
    message: string,
    field?: string,
    details?: Record<string, any>
  ) {
    super(message, 'VALIDATION_ERROR', 422, details, field);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(
    message: string = 'Authentication failed',
    details?: Record<string, any>
  ) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(
    message: string = 'Access forbidden',
    details?: Record<string, any>
  ) {
    super(message, 'AUTHORIZATION_ERROR', 403, details);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(
    resource: string,
    id?: string,
    details?: Record<string, any>
  ) {
    const message = id
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;

    super(message, 'NOT_FOUND_ERROR', 404, details);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends ApiError {
  constructor(
    message: string,
    details?: Record<string, any>
  ) {
    super(message, 'CONFLICT_ERROR', 409, details);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends ApiError {
  constructor(
    message: string = 'Rate limit exceeded',
    retryAfter?: number,
    details?: Record<string, any>
  ) {
    super(message, 'RATE_LIMIT_ERROR', 429, {
      ...details,
      retryAfter,
    });
    this.name = 'RateLimitError';
  }
}

export class DatabaseError extends ApiError {
  constructor(
    message: string,
    originalError?: Error,
    details?: Record<string, any>
  ) {
    super(message, 'DATABASE_ERROR', 500, {
      ...details,
      originalError: originalError?.message,
    });
    this.name = 'DatabaseError';
  }
}

export class ExternalServiceError extends ApiError {
  constructor(
    service: string,
    message: string,
    statusCode?: number,
    details?: Record<string, any>
  ) {
    super(
      `External service error (${service}): ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      statusCode || 502,
      { ...details, service }
    );
    this.name = 'ExternalServiceError';
  }
}

export class AgentError extends ApiError {
  constructor(
    agentId: string,
    message: string,
    executionId?: string,
    details?: Record<string, any>
  ) {
    super(message, 'AGENT_ERROR', 500, {
      ...details,
      agentId,
      executionId,
    });
    this.name = 'AgentError';
  }
}

export class TaskError extends ApiError {
  constructor(
    taskId: string,
    message: string,
    agentId?: string,
    details?: Record<string, any>
  ) {
    super(message, 'TASK_ERROR', 500, {
      ...details,
      taskId,
      agentId,
    });
    this.name = 'TaskError';
  }
}

export class FileUploadError extends ApiError {
  constructor(
    message: string,
    filename?: string,
    details?: Record<string, any>
  ) {
    super(message, 'FILE_UPLOAD_ERROR', 400, {
      ...details,
      filename,
    });
    this.name = 'FileUploadError';
  }
}

export class WebSocketError extends ApiError {
  constructor(
    message: string,
    clientId?: string,
    details?: Record<string, any>
  ) {
    super(message, 'WEBSOCKET_ERROR', 500, {
      ...details,
      clientId,
    });
    this.name = 'WebSocketError';
  }
}

// Error Code Constants
export const ErrorCodes = {
  // General
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Authentication & Authorization
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',

  // Resources
  NOT_FOUND_ERROR: 'NOT_FOUND_ERROR',
  CONFLICT_ERROR: 'CONFLICT_ERROR',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',

  // Rate Limiting
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',

  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATABASE_CONNECTION_ERROR: 'DATABASE_CONNECTION_ERROR',
  DATABASE_TIMEOUT: 'DATABASE_TIMEOUT',

  // External Services
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // Agent & Task Specific
  AGENT_ERROR: 'AGENT_ERROR',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  TASK_ERROR: 'TASK_ERROR',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_EXECUTION_FAILED: 'TASK_EXECUTION_FAILED',
  TASK_CANCELLED: 'TASK_CANCELLED',

  // File Upload
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  FILE_SIZE_EXCEEDED: 'FILE_SIZE_EXCEEDED',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',

  // WebSocket
  WEBSOCKET_ERROR: 'WEBSOCKET_ERROR',
  WEBSOCKET_AUTHENTICATION_FAILED: 'WEBSOCKET_AUTHENTICATION_FAILED',
  WEBSOCKET_CONNECTION_FAILED: 'WEBSOCKET_CONNECTION_FAILED',

  // Business Logic
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
  DEPENDENCY_ERROR: 'DEPENDENCY_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// Error Severity Levels
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

// Error Categories
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  CONFLICT = 'conflict',
  RATE_LIMIT = 'rate_limit',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  AGENT = 'agent',
  TASK = 'task',
  FILE_UPLOAD = 'file_upload',
  WEBSOCKET = 'websocket',
  SYSTEM = 'system',
  BUSINESS_LOGIC = 'business_logic',
}

// Error Context Interface
export interface ErrorContext {
  userId?: string;
  agentId?: string;
  taskId?: string;
  executionId?: string;
  requestId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  endpoint?: string;
  method?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Error Handler Interface
export interface ErrorHandler {
  canHandle(error: Error): boolean;
  handle(error: Error, context?: ErrorContext): Promise<ApiError>;
}

// Error Mapping for common errors
export const ErrorMapping: Record<string, {
  statusCode: number;
  code: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
}> = {
  'P2002': {
    statusCode: 409,
    code: ErrorCodes.DUPLICATE_RESOURCE,
    category: ErrorCategory.CONFLICT,
    severity: ErrorSeverity.MEDIUM,
  },
  'P2025': {
    statusCode: 404,
    code: ErrorCodes.NOT_FOUND_ERROR,
    category: ErrorCategory.NOT_FOUND,
    severity: ErrorSeverity.LOW,
  },
  'P1001': {
    statusCode: 503,
    code: ErrorCodes.DATABASE_CONNECTION_ERROR,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.HIGH,
  },
  'P1008': {
    statusCode: 408,
    code: ErrorCodes.DATABASE_TIMEOUT,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
  },
  'ENOTFOUND': {
    statusCode: 502,
    code: ErrorCodes.EXTERNAL_SERVICE_ERROR,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.MEDIUM,
  },
  'ECONNREFUSED': {
    statusCode: 502,
    code: ErrorCodes.SERVICE_UNAVAILABLE,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.HIGH,
  },
  'ETIMEDOUT': {
    statusCode: 408,
    code: ErrorCodes.TIMEOUT_ERROR,
    category: ErrorCategory.EXTERNAL_SERVICE,
    severity: ErrorSeverity.MEDIUM,
  },
};

// Error Factory Functions
export function createValidationError(
  field: string,
  message: string,
  value?: any
): ValidationError {
  return new ValidationError(message, field, { value });
}

export function createNotFoundError(
  resource: string,
  id?: string
): NotFoundError {
  return new NotFoundError(resource, id);
}

export function createConflictError(
  resource: string,
  conflict: string
): ConflictError {
  return new ConflictError(`${resource} ${conflict}`);
}

export function createAuthenticationError(
  reason?: string
): AuthenticationError {
  return new AuthenticationError(
    reason || 'Authentication required',
    { reason }
  );
}

export function createAuthorizationError(
  action: string,
  resource: string
): AuthorizationError {
  return new AuthorizationError(
    `Insufficient permissions to ${action} ${resource}`,
    { action, resource }
  );
}

export function createRateLimitError(
  limit: number,
  window: string,
  retryAfter?: number
): RateLimitError {
  return new RateLimitError(
    `Rate limit exceeded: ${limit} requests per ${window}`,
    retryAfter,
    { limit, window }
  );
}