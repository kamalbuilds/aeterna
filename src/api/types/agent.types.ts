import { z } from 'zod';
import type { Agent, Task, AgentMemory, AgentExecution, AgentLog } from '../types/generated';

// Agent Creation Schema
export const CreateAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(100),
  type: z.enum(['RESEARCHER', 'CODER', 'ANALYST', 'OPTIMIZER', 'COORDINATOR', 'CUSTOM']),
  version: z.string().default('1.0.0'),
  configuration: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  capabilities: z.array(z.string()).optional(),
});

// Agent Update Schema
export const UpdateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PAUSED', 'ERROR', 'MAINTENANCE']).optional(),
  configuration: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  capabilities: z.array(z.string()).optional(),
});

// Agent Execution Schema
export const ExecuteAgentSchema = z.object({
  taskId: z.string().optional(),
  input: z.record(z.any()).optional(),
  timeout: z.number().min(1).max(3600000).optional(), // max 1 hour
  resources: z.object({
    maxMemory: z.number().optional(),
    maxCpu: z.number().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL']).optional(),
  }).optional(),
});

// Agent Memory Schema
export const SetMemorySchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  tags: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const GetMemorySchema = z.object({
  key: z.string().optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).optional(),
});

// Type Definitions
export type CreateAgentRequest = z.infer<typeof CreateAgentSchema>;
export type UpdateAgentRequest = z.infer<typeof UpdateAgentSchema>;
export type ExecuteAgentRequest = z.infer<typeof ExecuteAgentSchema>;
export type SetMemoryRequest = z.infer<typeof SetMemorySchema>;
export type GetMemoryRequest = z.infer<typeof GetMemorySchema>;

// Agent Response Types
export interface AgentResponse {
  id: string;
  name: string;
  type: string;
  version: string;
  status: string;
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
  capabilities?: string[];
  performance?: AgentPerformance;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  user: {
    id: string;
    username: string;
  };
}

export interface AgentListResponse {
  agents: AgentResponse[];
  total: number;
  active: number;
  inactive: number;
  error: number;
}

// Agent Performance Metrics
export interface AgentPerformance {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  totalUptime: number;
  lastExecutionTime?: string;
  memoryUsage: {
    current: number;
    average: number;
    peak: number;
  };
  cpuUsage: {
    current: number;
    average: number;
    peak: number;
  };
  errorRate: number;
  throughput: number; // tasks per minute
}

// Agent Execution Response
export interface AgentExecutionResponse {
  id: string;
  agentId: string;
  taskId?: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  resources?: {
    memoryUsed: number;
    cpuUsed: number;
    priority: string;
  };
  metrics?: {
    inputSize: number;
    outputSize: number;
    networkCalls: number;
    cacheHits: number;
    cacheMisses: number;
  };
  error?: string;
  result?: any;
}

// Agent Memory Response
export interface AgentMemoryResponse {
  id: string;
  agentId: string;
  key: string;
  value: any;
  tags: string[];
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Agent Log Response
export interface AgentLogResponse {
  id: string;
  agentId: string;
  executionId?: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

// Agent Capabilities
export interface AgentCapability {
  name: string;
  description: string;
  type: 'INPUT' | 'OUTPUT' | 'PROCESSING' | 'INTEGRATION';
  parameters?: Record<string, {
    type: string;
    description: string;
    required: boolean;
    default?: any;
  }>;
  examples?: Array<{
    input: any;
    output: any;
    description: string;
  }>;
}

// Predefined Agent Types
export const AgentTypeDefinitions: Record<string, {
  description: string;
  capabilities: string[];
  defaultConfiguration: Record<string, any>;
}> = {
  RESEARCHER: {
    description: 'Specialized in data collection, analysis, and research tasks',
    capabilities: [
      'web-scraping',
      'data-analysis',
      'document-processing',
      'api-integration',
      'knowledge-extraction'
    ],
    defaultConfiguration: {
      maxConcurrency: 3,
      timeout: 300000, // 5 minutes
      retryAttempts: 3,
      cacheResults: true,
    },
  },
  CODER: {
    description: 'Specialized in code generation, analysis, and software development',
    capabilities: [
      'code-generation',
      'code-analysis',
      'testing',
      'debugging',
      'refactoring',
      'documentation'
    ],
    defaultConfiguration: {
      maxConcurrency: 2,
      timeout: 600000, // 10 minutes
      retryAttempts: 2,
      cacheResults: false,
    },
  },
  ANALYST: {
    description: 'Specialized in data analysis, pattern recognition, and insights',
    capabilities: [
      'data-analysis',
      'pattern-recognition',
      'statistical-analysis',
      'visualization',
      'reporting'
    ],
    defaultConfiguration: {
      maxConcurrency: 4,
      timeout: 300000, // 5 minutes
      retryAttempts: 3,
      cacheResults: true,
    },
  },
  OPTIMIZER: {
    description: 'Specialized in performance optimization and resource management',
    capabilities: [
      'performance-optimization',
      'resource-management',
      'cost-analysis',
      'efficiency-improvement',
      'monitoring'
    ],
    defaultConfiguration: {
      maxConcurrency: 2,
      timeout: 900000, // 15 minutes
      retryAttempts: 1,
      cacheResults: true,
    },
  },
  COORDINATOR: {
    description: 'Specialized in task coordination, workflow management, and orchestration',
    capabilities: [
      'task-coordination',
      'workflow-management',
      'resource-allocation',
      'monitoring',
      'communication'
    ],
    defaultConfiguration: {
      maxConcurrency: 5,
      timeout: 120000, // 2 minutes
      retryAttempts: 5,
      cacheResults: false,
    },
  },
  CUSTOM: {
    description: 'Custom agent with user-defined capabilities and configuration',
    capabilities: [],
    defaultConfiguration: {
      maxConcurrency: 1,
      timeout: 300000, // 5 minutes
      retryAttempts: 3,
      cacheResults: false,
    },
  },
};

// Agent Health Check
export interface AgentHealthCheck {
  agentId: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  lastHeartbeat: string;
  activeExecutions: number;
  queuedTasks: number;
  errors: Array<{
    timestamp: string;
    error: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
}

// Agent Communication
export interface AgentMessage {
  from: string;
  to: string;
  type: 'request' | 'response' | 'notification' | 'command';
  payload: any;
  timestamp: string;
  correlationId?: string;
}

// Agent Registry
export interface AgentRegistryEntry {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy' | 'error';
  lastSeen: string;
  metadata: Record<string, any>;
}