import { z } from 'zod';

// WebSocket Event Types
export enum WebSocketEventType {
  // Connection events
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  AUTHENTICATE = 'authenticate',
  AUTHENTICATED = 'authenticated',

  // Agent events
  AGENT_STATUS_CHANGED = 'agent:status_changed',
  AGENT_CREATED = 'agent:created',
  AGENT_UPDATED = 'agent:updated',
  AGENT_DELETED = 'agent:deleted',
  AGENT_EXECUTION_STARTED = 'agent:execution_started',
  AGENT_EXECUTION_COMPLETED = 'agent:execution_completed',
  AGENT_EXECUTION_FAILED = 'agent:execution_failed',

  // Task events
  TASK_STATUS_CHANGED = 'task:status_changed',
  TASK_CREATED = 'task:created',
  TASK_UPDATED = 'task:updated',
  TASK_STARTED = 'task:started',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',
  TASK_CANCELLED = 'task:cancelled',
  TASK_PROGRESS_UPDATED = 'task:progress_updated',

  // System events
  SYSTEM_HEALTH_UPDATE = 'system:health_update',
  SYSTEM_MAINTENANCE = 'system:maintenance',
  SYSTEM_ALERT = 'system:alert',

  // User events
  USER_SESSION_EXPIRED = 'user:session_expired',
  USER_PROFILE_UPDATED = 'user:profile_updated',

  // Real-time data
  METRICS_UPDATE = 'metrics:update',
  LOG_ENTRY = 'log:entry',

  // Custom events
  CUSTOM_EVENT = 'custom:event',
}

// WebSocket Message Schema
export const WebSocketMessageSchema = z.object({
  type: z.nativeEnum(WebSocketEventType),
  data: z.any(),
  timestamp: z.string().datetime(),
  id: z.string().optional(),
  correlationId: z.string().optional(),
  userId: z.string().optional(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
});

// Authentication Schema
export const WebSocketAuthSchema = z.object({
  token: z.string().min(1, 'Authentication token is required'),
  type: z.enum(['bearer', 'api_key']).default('bearer'),
});

// Subscription Schema
export const WebSocketSubscriptionSchema = z.object({
  events: z.array(z.nativeEnum(WebSocketEventType)),
  filters: z.object({
    agentIds: z.array(z.string()).optional(),
    taskIds: z.array(z.string()).optional(),
    userId: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  }).optional(),
});

// Type Definitions
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;
export type WebSocketAuth = z.infer<typeof WebSocketAuthSchema>;
export type WebSocketSubscription = z.infer<typeof WebSocketSubscriptionSchema>;

// WebSocket Client Interface
export interface WebSocketClient {
  id: string;
  userId?: string;
  sessionId?: string;
  authenticated: boolean;
  connectedAt: string;
  lastActivity: string;
  subscriptions: WebSocketEventType[];
  filters: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

// WebSocket Server Configuration
export interface WebSocketConfig {
  port: number;
  cors: {
    origin: string | string[];
    credentials: boolean;
  };
  authentication: {
    required: boolean;
    timeout: number;
  };
  rateLimit: {
    points: number;
    duration: number;
  };
  compression: boolean;
  heartbeat: {
    interval: number;
    timeout: number;
  };
}

// Event Payload Types
export interface AgentStatusChangedPayload {
  agentId: string;
  agentName: string;
  oldStatus: string;
  newStatus: string;
  timestamp: string;
  reason?: string;
}

export interface AgentExecutionPayload {
  executionId: string;
  agentId: string;
  agentName: string;
  taskId?: string;
  taskTitle?: string;
  status: string;
  timestamp: string;
  duration?: number;
  error?: string;
  result?: any;
}

export interface TaskStatusChangedPayload {
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentName: string;
  oldStatus: string;
  newStatus: string;
  progress: number;
  timestamp: string;
}

export interface TaskProgressPayload {
  taskId: string;
  taskTitle: string;
  agentId: string;
  progress: number;
  message?: string;
  timestamp: string;
  estimatedCompletion?: string;
}

export interface SystemHealthPayload {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, 'up' | 'down' | 'degraded'>;
  metrics: {
    memoryUsage: number;
    cpuUsage: number;
    diskUsage: number;
    activeConnections: number;
    requestsPerMinute: number;
  };
  timestamp: string;
}

export interface SystemAlertPayload {
  id: string;
  type: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  component?: string;
  timestamp: string;
  acknowledged: boolean;
  autoResolve: boolean;
}

export interface MetricsUpdatePayload {
  type: 'real_time' | 'batch';
  metrics: {
    agents: {
      total: number;
      active: number;
      executing: number;
    };
    tasks: {
      total: number;
      pending: number;
      running: number;
      completed: number;
      failed: number;
    };
    system: {
      memoryUsage: number;
      cpuUsage: number;
      requestsPerMinute: number;
      errorRate: number;
    };
  };
  timestamp: string;
}

export interface LogEntryPayload {
  id: string;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  source: string;
  agentId?: string;
  taskId?: string;
  executionId?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

// WebSocket Room Management
export interface WebSocketRoom {
  name: string;
  clients: string[];
  maxClients?: number;
  private: boolean;
  createdAt: string;
  lastActivity: string;
  metadata?: Record<string, any>;
}

// WebSocket Message Queue
export interface WebSocketMessageQueue {
  userId: string;
  messages: Array<{
    message: WebSocketMessage;
    retries: number;
    nextRetry?: string;
  }>;
  maxSize: number;
  ttl: number;
}

// WebSocket Broadcasting
export interface BroadcastOptions {
  rooms?: string[];
  users?: string[];
  agents?: string[];
  exclude?: string[];
  filters?: Record<string, any>;
  persistent?: boolean;
  ttl?: number;
}

// WebSocket Event Handlers
export type WebSocketEventHandler = (
  client: WebSocketClient,
  message: WebSocketMessage
) => Promise<void> | void;

export interface WebSocketEventHandlers {
  [WebSocketEventType.CONNECT]: (client: WebSocketClient) => Promise<void> | void;
  [WebSocketEventType.DISCONNECT]: (client: WebSocketClient, reason: string) => Promise<void> | void;
  [WebSocketEventType.AUTHENTICATE]: (client: WebSocketClient, auth: WebSocketAuth) => Promise<boolean>;
  [key: string]: WebSocketEventHandler;
}

// WebSocket Middleware
export type WebSocketMiddleware = (
  client: WebSocketClient,
  message: WebSocketMessage,
  next: () => void
) => void;

// WebSocket Statistics
export interface WebSocketStats {
  totalConnections: number;
  activeConnections: number;
  authenticatedConnections: number;
  totalMessages: number;
  messagesPerSecond: number;
  averageLatency: number;
  errorRate: number;
  uptime: number;
  roomStats: Record<string, {
    clients: number;
    messages: number;
  }>;
  eventStats: Record<string, {
    count: number;
    frequency: number;
  }>;
}

// WebSocket Error Types
export enum WebSocketErrorCode {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  RATE_LIMITED = 'RATE_LIMITED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
}

export interface WebSocketError {
  code: WebSocketErrorCode;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Real-time Notifications
export interface NotificationPayload {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  actions?: Array<{
    label: string;
    action: string;
    url?: string;
  }>;
  metadata?: Record<string, any>;
  timestamp: string;
  expiresAt?: string;
  priority: 'low' | 'normal' | 'high';
  persistent: boolean;
}