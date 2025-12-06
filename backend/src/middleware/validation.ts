import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { AuthRequest } from '../types';
import { createApiError } from '../utils/errors';
import httpStatus from 'http-status';

// Common validation schemas
export const commonSchemas = {
  id: Joi.string().min(1).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  walletAddress: Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/),
  pagination: {
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  },
};

// User validation schemas
export const userSchemas = {
  register: Joi.object({
    email: commonSchemas.email,
    username: commonSchemas.username,
    password: commonSchemas.password,
    firstName: Joi.string().min(1).max(50).optional(),
    lastName: Joi.string().min(1).max(50).optional(),
  }),

  login: Joi.object({
    email: commonSchemas.email,
    password: Joi.string().required(),
  }),

  updateProfile: Joi.object({
    firstName: Joi.string().min(1).max(50).optional(),
    lastName: Joi.string().min(1).max(50).optional(),
    bio: Joi.string().max(500).optional(),
    avatar: Joi.string().uri().optional(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: commonSchemas.password,
  }),

  linkWallet: Joi.object({
    walletAddress: commonSchemas.walletAddress,
    signature: Joi.string().required(),
  }),
};

// Agent validation schemas
export const agentSchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    description: Joi.string().max(500).optional(),
    type: Joi.string().valid('AUTONOMOUS', 'COLLABORATIVE', 'SPECIALIZED', 'LEARNING').required(),
    capabilities: Joi.array().items(Joi.string().min(1)).min(1).required(),
    configuration: Joi.object().optional(),
    isPublic: Joi.boolean().default(false),
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    description: Joi.string().max(500).optional(),
    capabilities: Joi.array().items(Joi.string().min(1)).optional(),
    configuration: Joi.object().optional(),
    isPublic: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BUSY', 'ERROR', 'MAINTENANCE').optional(),
  }),

  query: Joi.object({
    ...commonSchemas.pagination,
    type: Joi.string().valid('AUTONOMOUS', 'COLLABORATIVE', 'SPECIALIZED', 'LEARNING').optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE', 'BUSY', 'ERROR', 'MAINTENANCE').optional(),
    isPublic: Joi.boolean().optional(),
    search: Joi.string().optional(),
  }),
};

// Memory validation schemas
export const memorySchemas = {
  create: Joi.object({
    content: Joi.string().min(1).max(10000).required(),
    type: Joi.string().valid('EXPERIENCE', 'KNOWLEDGE', 'SKILL', 'PREFERENCE', 'CONTEXT', 'GOAL').required(),
    importance: Joi.number().min(0).max(1).default(0.5),
    tags: Joi.array().items(Joi.string().min(1)).optional(),
    metadata: Joi.object().optional(),
    parentId: Joi.string().optional(),
    agentId: commonSchemas.id,
  }),

  update: Joi.object({
    content: Joi.string().min(1).max(10000).optional(),
    importance: Joi.number().min(0).max(1).optional(),
    tags: Joi.array().items(Joi.string().min(1)).optional(),
    metadata: Joi.object().optional(),
  }),

  query: Joi.object({
    ...commonSchemas.pagination,
    agentId: Joi.string().optional(),
    type: Joi.string().valid('EXPERIENCE', 'KNOWLEDGE', 'SKILL', 'PREFERENCE', 'CONTEXT', 'GOAL').optional(),
    importance: Joi.number().min(0).max(1).optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    search: Joi.string().optional(),
  }),
};

// Transaction validation schemas
export const transactionSchemas = {
  create: Joi.object({
    type: Joi.string().valid('AGENT_CREATION', 'AGENT_UPDATE', 'MEMORY_STORE', 'TOKEN_TRANSFER', 'CONTRACT_INTERACTION', 'PAYMENT').required(),
    agentId: Joi.string().optional(),
    data: Joi.object().optional(),
    value: Joi.string().optional(),
    toAddress: commonSchemas.walletAddress.optional(),
  }),

  query: Joi.object({
    ...commonSchemas.pagination,
    type: Joi.string().valid('AGENT_CREATION', 'AGENT_UPDATE', 'MEMORY_STORE', 'TOKEN_TRANSFER', 'CONTRACT_INTERACTION', 'PAYMENT').optional(),
    status: Joi.string().valid('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED').optional(),
    agentId: Joi.string().optional(),
  }),
};

// API Key validation schemas
export const apiKeySchemas = {
  create: Joi.object({
    name: Joi.string().min(1).max(100).required(),
    permissions: Joi.array().items(Joi.string()).required(),
    expiresAt: Joi.date().greater('now').optional(),
    rateLimit: Joi.number().integer().min(1).max(10000).optional(),
  }),

  update: Joi.object({
    name: Joi.string().min(1).max(100).optional(),
    isActive: Joi.boolean().optional(),
    rateLimit: Joi.number().integer().min(1).max(10000).optional(),
  }),
};

/**
 * Generic validation middleware
 */
export const validate = (schema: Joi.Schema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        const errorMessage = error.details
          .map((detail) => detail.message.replace(/"/g, ''))
          .join(', ');

        throw createApiError(httpStatus.BAD_REQUEST, `Validation error: ${errorMessage}`);
      }

      // Replace the original data with validated and sanitized data
      req[source] = value;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema: Joi.Schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
export const validateQuery = (schema: Joi.Schema) => validate(schema, 'query');

/**
 * Validate URL parameters
 */
export const validateParams = (schema: Joi.Schema) => validate(schema, 'params');

/**
 * Validate agent ownership
 */
export const validateAgentOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: agentId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
    }

    const agent = await req.app.locals.db.agent.findUnique({
      where: { id: agentId },
      select: { ownerId: true },
    });

    if (!agent) {
      throw createApiError(httpStatus.NOT_FOUND, 'Agent not found');
    }

    if (agent.ownerId !== userId) {
      throw createApiError(httpStatus.FORBIDDEN, 'Access denied: You do not own this agent');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate memory ownership (through agent ownership)
 */
export const validateMemoryOwnership = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: memoryId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      throw createApiError(httpStatus.UNAUTHORIZED, 'Authentication required');
    }

    const memory = await req.app.locals.db.memory.findUnique({
      where: { id: memoryId },
      include: { agent: { select: { ownerId: true } } },
    });

    if (!memory) {
      throw createApiError(httpStatus.NOT_FOUND, 'Memory not found');
    }

    if (memory.userId !== userId && memory.agent.ownerId !== userId) {
      throw createApiError(httpStatus.FORBIDDEN, 'Access denied: You do not own this memory');
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Validate file upload
 */
export const validateFileUpload = (options: {
  maxSize?: number;
  allowedTypes?: string[];
  required?: boolean;
}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const file = req.file;

      if (options.required && !file) {
        throw createApiError(httpStatus.BAD_REQUEST, 'File upload required');
      }

      if (!file) {
        return next(); // No file uploaded, but not required
      }

      // Check file size
      const maxSize = options.maxSize || parseInt(process.env.MAX_FILE_SIZE || '5242880'); // 5MB default
      if (file.size > maxSize) {
        throw createApiError(
          httpStatus.BAD_REQUEST,
          `File too large. Maximum size: ${Math.round(maxSize / 1024 / 1024)}MB`
        );
      }

      // Check file type
      if (options.allowedTypes && !options.allowedTypes.includes(file.mimetype)) {
        throw createApiError(
          httpStatus.BAD_REQUEST,
          `Invalid file type. Allowed types: ${options.allowedTypes.join(', ')}`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Sanitize input data
 */
export const sanitize = {
  /**
   * Sanitize string input
   */
  string: (input: any): string => {
    if (typeof input !== 'string') {
      return String(input || '');
    }

    return input
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers
  },

  /**
   * Sanitize HTML input (basic)
   */
  html: (input: any): string => {
    if (typeof input !== 'string') {
      return String(input || '');
    }

    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  },

  /**
   * Sanitize JSON input
   */
  json: (input: any): any => {
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        return sanitize.object(parsed);
      } catch {
        return {};
      }
    }
    return sanitize.object(input);
  },

  /**
   * Sanitize object recursively
   */
  object: (input: any): any => {
    if (input === null || typeof input !== 'object') {
      return typeof input === 'string' ? sanitize.string(input) : input;
    }

    if (Array.isArray(input)) {
      return input.map(item => sanitize.object(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = sanitize.string(key);
      sanitized[sanitizedKey] = sanitize.object(value);
    }

    return sanitized;
  },
};

export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateAgentOwnership,
  validateMemoryOwnership,
  validateFileUpload,
  sanitize,
  userSchemas,
  agentSchemas,
  memorySchemas,
  transactionSchemas,
  apiKeySchemas,
  commonSchemas,
};