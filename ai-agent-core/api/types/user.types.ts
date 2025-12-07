import { z } from 'zod';
import type { User, UserProfile } from '../types/generated';

// User Update Schema
export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  avatar: z.string().url().optional(),
});

// User Profile Update Schema
export const UpdateUserProfileSchema = z.object({
  bio: z.string().max(500).optional(),
  website: z.string().url().optional(),
  location: z.string().max(100).optional(),
  preferences: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
});

// User Search Schema
export const UserSearchSchema = z.object({
  query: z.string().min(1).max(100),
  role: z.enum(['ADMIN', 'USER', 'DEVELOPER', 'MODERATOR']).optional(),
  verified: z.boolean().optional(),
  limit: z.number().min(1).max(50).default(20),
  offset: z.number().min(0).default(0),
});

// Type Definitions
export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;
export type UpdateUserProfileRequest = z.infer<typeof UpdateUserProfileSchema>;
export type UserSearchRequest = z.infer<typeof UserSearchSchema>;

// User Response Types
export interface UserResponse {
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
  profile?: UserProfileResponse;
  stats?: UserStats;
}

export interface UserProfileResponse {
  id: string;
  bio?: string;
  website?: string;
  location?: string;
  preferences?: Record<string, any>;
  settings?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface UserStats {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalExecutions: number;
  averageExecutionTime: number;
  totalUploadSize: number;
  lastActivity: string;
  joinedDaysAgo: number;
  agentsByType: Record<string, number>;
  tasksByStatus: Record<string, number>;
  executionsByMonth: Array<{
    month: string;
    count: number;
  }>;
}

export interface UserListResponse {
  users: UserResponse[];
  total: number;
  verified: number;
  unverified: number;
  byRole: Record<string, number>;
}

// User Activity
export interface UserActivity {
  id: string;
  userId: string;
  type: 'login' | 'logout' | 'agent_created' | 'agent_executed' | 'task_completed' | 'profile_updated';
  description: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

// User Preferences
export interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    push: boolean;
    desktop: boolean;
    types: {
      taskCompleted: boolean;
      agentError: boolean;
      systemMaintenance: boolean;
      newFeatures: boolean;
      security: boolean;
    };
  };
  dashboard: {
    defaultView: 'agents' | 'tasks' | 'metrics';
    refreshInterval: number;
    showTutorial: boolean;
  };
  privacy: {
    profilePublic: boolean;
    statsPublic: boolean;
    allowAnalytics: boolean;
  };
}

// User Settings
export interface UserSettings {
  api: {
    defaultTimeout: number;
    maxConcurrency: number;
    rateLimitOverride?: number;
  };
  security: {
    sessionTimeout: number;
    requireMfa: boolean;
    allowedIpAddresses?: string[];
  };
  development: {
    enableDebugMode: boolean;
    defaultAgentType: string;
    autoSaveInterval: number;
  };
  integrations: {
    github?: {
      enabled: boolean;
      token?: string;
      repositories: string[];
    };
    slack?: {
      enabled: boolean;
      webhook?: string;
      channels: string[];
    };
    discord?: {
      enabled: boolean;
      webhook?: string;
      channels: string[];
    };
  };
}

// Default User Preferences
export const DefaultUserPreferences: UserPreferences = {
  theme: 'auto',
  language: 'en',
  timezone: 'UTC',
  notifications: {
    email: true,
    push: true,
    desktop: false,
    types: {
      taskCompleted: true,
      agentError: true,
      systemMaintenance: true,
      newFeatures: false,
      security: true,
    },
  },
  dashboard: {
    defaultView: 'agents',
    refreshInterval: 30000, // 30 seconds
    showTutorial: true,
  },
  privacy: {
    profilePublic: false,
    statsPublic: false,
    allowAnalytics: true,
  },
};

// Default User Settings
export const DefaultUserSettings: UserSettings = {
  api: {
    defaultTimeout: 300000, // 5 minutes
    maxConcurrency: 3,
  },
  security: {
    sessionTimeout: 3600000, // 1 hour
    requireMfa: false,
  },
  development: {
    enableDebugMode: false,
    defaultAgentType: 'RESEARCHER',
    autoSaveInterval: 60000, // 1 minute
  },
  integrations: {},
};

// User Role Definitions
export interface UserRole {
  name: string;
  displayName: string;
  description: string;
  permissions: string[];
  limits: {
    maxAgents: number;
    maxConcurrentExecutions: number;
    maxUploadSize: number;
    rateLimit: number;
    features: string[];
  };
}

export const UserRoleDefinitions: Record<string, UserRole> = {
  ADMIN: {
    name: 'ADMIN',
    displayName: 'Administrator',
    description: 'Full system access with administrative privileges',
    permissions: ['*'],
    limits: {
      maxAgents: -1, // unlimited
      maxConcurrentExecutions: -1, // unlimited
      maxUploadSize: -1, // unlimited
      rateLimit: -1, // unlimited
      features: ['*'],
    },
  },
  DEVELOPER: {
    name: 'DEVELOPER',
    displayName: 'Developer',
    description: 'Advanced user with development and deployment capabilities',
    permissions: [
      'agent:create', 'agent:read', 'agent:update', 'agent:delete', 'agent:execute',
      'task:create', 'task:read', 'task:update', 'task:delete', 'task:execute',
      'user:read', 'user:update',
      'api:read', 'api:write',
    ],
    limits: {
      maxAgents: 50,
      maxConcurrentExecutions: 10,
      maxUploadSize: 104857600, // 100MB
      rateLimit: 1000, // requests per hour
      features: ['advanced_analytics', 'custom_agents', 'webhooks', 'api_keys'],
    },
  },
  USER: {
    name: 'USER',
    displayName: 'User',
    description: 'Standard user with basic agent and task capabilities',
    permissions: [
      'agent:create', 'agent:read', 'agent:update', 'agent:delete', 'agent:execute',
      'task:create', 'task:read', 'task:update', 'task:delete',
      'user:read', 'user:update',
      'api:read',
    ],
    limits: {
      maxAgents: 10,
      maxConcurrentExecutions: 3,
      maxUploadSize: 10485760, // 10MB
      rateLimit: 100, // requests per hour
      features: ['basic_analytics', 'predefined_agents'],
    },
  },
  MODERATOR: {
    name: 'MODERATOR',
    displayName: 'Moderator',
    description: 'Limited administrative access for content moderation',
    permissions: [
      'agent:read', 'task:read', 'user:read',
      'api:read',
    ],
    limits: {
      maxAgents: 5,
      maxConcurrentExecutions: 2,
      maxUploadSize: 5242880, // 5MB
      rateLimit: 200, // requests per hour
      features: ['basic_analytics', 'user_management'],
    },
  },
};

// User Verification
export interface UserVerification {
  email: {
    verified: boolean;
    token?: string;
    expiresAt?: string;
    verifiedAt?: string;
  };
  phone?: {
    number: string;
    verified: boolean;
    token?: string;
    expiresAt?: string;
    verifiedAt?: string;
  };
  identity?: {
    verified: boolean;
    provider: string;
    providerId: string;
    verifiedAt?: string;
  };
}

// User Billing (future enhancement)
export interface UserBilling {
  plan: 'free' | 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'trialing';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  usage: {
    agentExecutions: number;
    storageUsed: number;
    apiCalls: number;
    bandwidth: number;
  };
  limits: {
    maxExecutions: number;
    maxStorage: number;
    maxApiCalls: number;
    maxBandwidth: number;
  };
}