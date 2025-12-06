import { z } from 'zod';
import type { User, Session, ApiKey } from '../types/generated';

// Authentication Schemas
export const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(3, 'Username must be at least 3 characters').max(20),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
});

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
});

export const VerifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const CreateApiKeySchema = z.object({
  name: z.string().min(1, 'API key name is required'),
  permissions: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

// Type Definitions
export type RegisterRequest = z.infer<typeof RegisterSchema>;
export type LoginRequest = z.infer<typeof LoginSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;
export type ChangePasswordRequest = z.infer<typeof ChangePasswordSchema>;
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordSchema>;
export type VerifyEmailRequest = z.infer<typeof VerifyEmailSchema>;
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeySchema>;

// Response Types
export interface AuthResponse {
  user: Omit<User, 'password'>;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  session: Session;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string;
  permissions?: string[];
  expiresAt?: string;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  verified: boolean;
  role: string;
  createdAt: string;
  updatedAt: string;
  profile?: {
    bio?: string;
    website?: string;
    location?: string;
    preferences?: Record<string, any>;
    settings?: Record<string, any>;
  };
}

// JWT Payload
export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
  iat: number;
  exp: number;
}

// API Key Payload
export interface ApiKeyPayload {
  keyId: string;
  userId: string;
  permissions: string[];
  iat: number;
  exp?: number;
}

// Permission System
export enum Permission {
  // User permissions
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',

  // Agent permissions
  AGENT_READ = 'agent:read',
  AGENT_WRITE = 'agent:write',
  AGENT_DELETE = 'agent:delete',
  AGENT_EXECUTE = 'agent:execute',

  // Task permissions
  TASK_READ = 'task:read',
  TASK_WRITE = 'task:write',
  TASK_DELETE = 'task:delete',
  TASK_EXECUTE = 'task:execute',

  // Admin permissions
  ADMIN_USERS = 'admin:users',
  ADMIN_SYSTEM = 'admin:system',
  ADMIN_METRICS = 'admin:metrics',

  // API permissions
  API_READ = 'api:read',
  API_WRITE = 'api:write',
}

// Role-based permissions
export const RolePermissions: Record<string, Permission[]> = {
  ADMIN: Object.values(Permission),
  DEVELOPER: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.AGENT_READ,
    Permission.AGENT_WRITE,
    Permission.AGENT_EXECUTE,
    Permission.TASK_READ,
    Permission.TASK_WRITE,
    Permission.TASK_EXECUTE,
    Permission.API_READ,
    Permission.API_WRITE,
  ],
  USER: [
    Permission.USER_READ,
    Permission.USER_WRITE,
    Permission.AGENT_READ,
    Permission.AGENT_WRITE,
    Permission.TASK_READ,
    Permission.TASK_WRITE,
    Permission.API_READ,
  ],
  MODERATOR: [
    Permission.USER_READ,
    Permission.AGENT_READ,
    Permission.TASK_READ,
    Permission.API_READ,
  ],
};

// Session Management
export interface SessionInfo {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

// Two-Factor Authentication (future enhancement)
export interface TwoFactorAuth {
  enabled: boolean;
  secret?: string;
  backupCodes?: string[];
  lastUsed?: string;
}

// OAuth Provider Types (future enhancement)
export interface OAuthProvider {
  provider: 'google' | 'github' | 'discord';
  providerId: string;
  email: string;
  name: string;
  avatar?: string;
}

// Password Policy
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxAge: number; // days
  history: number; // number of previous passwords to remember
}

export const DefaultPasswordPolicy: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  maxAge: 90,
  history: 5,
};