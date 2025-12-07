import { z } from 'zod';
import type { Task, TaskDependency } from '../types/generated';

// Task Creation Schema
export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required').max(200),
  description: z.string().max(1000).optional(),
  agentId: z.string().min(1, 'Agent ID is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL']).default('MEDIUM'),
  input: z.record(z.any()).optional(),
  dependencies: z.array(z.string()).optional(),
  schedule: z.object({
    type: z.enum(['immediate', 'delayed', 'recurring']).default('immediate'),
    delay: z.number().optional(),
    cron: z.string().optional(),
    timezone: z.string().optional(),
  }).optional(),
  timeout: z.number().min(1000).max(3600000).optional(), // 1 second to 1 hour
  retryPolicy: z.object({
    maxAttempts: z.number().min(1).max(10).default(3),
    backoffMultiplier: z.number().min(1).max(10).default(2),
    initialDelay: z.number().min(100).max(60000).default(1000),
  }).optional(),
});

// Task Update Schema
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL']).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED']).optional(),
  input: z.record(z.any()).optional(),
});

// Task Search Schema
export const TaskSearchSchema = z.object({
  agentId: z.string().optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT', 'CRITICAL']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['createdAt', 'updatedAt', 'priority', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Bulk Task Operations
export const BulkTaskOperationSchema = z.object({
  taskIds: z.array(z.string()).min(1, 'At least one task ID is required'),
  operation: z.enum(['cancel', 'pause', 'resume', 'retry', 'delete']),
  reason: z.string().optional(),
});

// Type Definitions
export type CreateTaskRequest = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskRequest = z.infer<typeof UpdateTaskSchema>;
export type TaskSearchRequest = z.infer<typeof TaskSearchSchema>;
export type BulkTaskOperationRequest = z.infer<typeof BulkTaskOperationSchema>;

// Task Response Types
export interface TaskResponse {
  id: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL';
  progress: number;
  input?: Record<string, any>;
  output?: Record<string, any>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  agent: {
    id: string;
    name: string;
    type: string;
  };
  execution?: TaskExecution;
  dependencies?: TaskDependencyInfo[];
  schedule?: TaskSchedule;
  metrics?: TaskMetrics;
}

export interface TaskListResponse {
  tasks: TaskResponse[];
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAgent: Record<string, number>;
}

// Task Execution Details
export interface TaskExecution {
  id: string;
  taskId: string;
  agentId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';
  startedAt: string;
  completedAt?: string;
  duration?: number;
  resources: {
    memoryUsed: number;
    cpuUsed: number;
    networkCalls: number;
  };
  metrics: {
    inputProcessingTime: number;
    outputGenerationTime: number;
    totalProcessingTime: number;
    cacheHits: number;
    cacheMisses: number;
  };
  logs: TaskExecutionLog[];
  error?: {
    type: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export interface TaskExecutionLog {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: Record<string, any>;
}

// Task Dependencies
export interface TaskDependencyInfo {
  id: string;
  parentTaskId: string;
  childTaskId: string;
  dependencyType: string;
  parentTask: {
    id: string;
    title: string;
    status: string;
  };
  childTask: {
    id: string;
    title: string;
    status: string;
  };
}

// Task Scheduling
export interface TaskSchedule {
  type: 'immediate' | 'delayed' | 'recurring';
  delay?: number;
  cron?: string;
  timezone?: string;
  nextRun?: string;
  lastRun?: string;
  totalRuns?: number;
  maxRuns?: number;
}

// Task Metrics
export interface TaskMetrics {
  totalExecutionTime: number;
  averageExecutionTime: number;
  successRate: number;
  failureRate: number;
  retryCount: number;
  memoryPeak: number;
  cpuPeak: number;
  throughput: number; // tasks per hour
  queueTime: number; // time spent waiting to execute
}

// Task Queue Management
export interface TaskQueue {
  id: string;
  name: string;
  priority: number;
  concurrency: number;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  processing: boolean;
}

export interface TaskQueueStats {
  totalQueues: number;
  totalTasks: number;
  activeTasks: number;
  waitingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageWaitTime: number;
  averageProcessingTime: number;
  throughput: number;
  errorRate: number;
}

// Task Templates
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  defaultInput: Record<string, any>;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  defaultPriority: string;
  estimatedDuration: number;
  category: string;
  tags: string[];
  version: string;
  author: string;
  usage: {
    totalUses: number;
    successRate: number;
    averageRating: number;
  };
}

// Task Workflow
export interface TaskWorkflow {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: TaskWorkflowStep[];
  triggers: TaskWorkflowTrigger[];
  variables: Record<string, any>;
  settings: {
    timeout: number;
    retryPolicy: {
      maxAttempts: number;
      backoffMultiplier: number;
      initialDelay: number;
    };
    parallelExecution: boolean;
    failureHandling: 'stop' | 'continue' | 'retry';
  };
}

export interface TaskWorkflowStep {
  id: string;
  name: string;
  type: 'task' | 'condition' | 'loop' | 'parallel' | 'wait';
  config: Record<string, any>;
  dependencies: string[];
  condition?: string;
  onSuccess?: string[];
  onFailure?: string[];
}

export interface TaskWorkflowTrigger {
  type: 'manual' | 'schedule' | 'event' | 'webhook';
  config: Record<string, any>;
  enabled: boolean;
}

// Task Batch Processing
export interface TaskBatch {
  id: string;
  name: string;
  description?: string;
  tasks: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startedAt?: string;
  completedAt?: string;
  results: TaskBatchResult[];
  settings: {
    concurrency: number;
    failureThreshold: number;
    continueOnFailure: boolean;
  };
}

export interface TaskBatchResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  duration?: number;
  startedAt?: string;
  completedAt?: string;
}

// Task Analytics
export interface TaskAnalytics {
  period: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  averageExecutionTime: number;
  totalExecutionTime: number;
  successRate: number;
  failureRate: number;
  topAgents: Array<{
    agentId: string;
    agentName: string;
    taskCount: number;
    successRate: number;
  }>;
  tasksByPriority: Record<string, number>;
  tasksByStatus: Record<string, number>;
  executionTimeDistribution: Array<{
    bucket: string;
    count: number;
  }>;
  errorCategories: Array<{
    category: string;
    count: number;
    percentage: number;
  }>;
}