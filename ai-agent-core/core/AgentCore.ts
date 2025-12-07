/**
 * AETERNA Agent Core
 * Complete lifecycle management with strict TypeScript typing
 */

import { EventEmitter } from 'events';
import {
  AgentId,
  AgentMetadata,
  AgentState,
  AgentCapability,
  AeternaConfig,
  Result,
  AsyncResult,
  AgentEvent,
  EventType,
  EventPriority,
  Serializable,
  Deserializable
} from '../types';
import {
  AgentError,
  AgentLifecycleError,
  AgentInitializationError,
  AgentCapabilityError,
  ValidationError,
  SystemError
} from '../errors';

interface StateTransition {
  readonly from: AgentState;
  readonly to: AgentState;
  readonly action: string;
  readonly timestamp: number;
}

interface HealthCheck {
  readonly component: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly message?: string;
  readonly timestamp: number;
}

export class AgentCore extends EventEmitter implements Serializable, Deserializable<AgentCore> {
  private readonly _id: AgentId;
  private readonly _metadata: AgentMetadata;
  private readonly _config: AeternaConfig;
  private _state: AgentState;
  private readonly _stateHistory: StateTransition[];
  private readonly _healthChecks: Map<string, HealthCheck>;
  private _initializationPromise?: Promise<void>;
  private _shutdownPromise?: Promise<void>;
  private readonly _capabilities: Set<AgentCapability>;
  private readonly _startTime: Date;
  private _lastHeartbeat: Date;
  private readonly _restartCount: number;
  private readonly _maxRestarts: number;

  constructor(config: AeternaConfig) {
    super();
    this.setMaxListeners(50); // Increase for complex agent interactions

    // Validate configuration
    this.validateConfiguration(config);

    this._config = config;
    this._id = this.generateAgentId();
    this._metadata = this.createMetadata();
    this._state = AgentState.INITIALIZING;
    this._stateHistory = [];
    this._healthChecks = new Map();
    this._capabilities = new Set(config.agent.metadata.capabilities);
    this._startTime = new Date();
    this._lastHeartbeat = new Date();
    this._restartCount = 0;
    this._maxRestarts = config.agent.lifecycle.maxRestarts;

    // Set up error handling
    this.setupErrorHandling();

    // Record initial state transition
    this.recordStateTransition(AgentState.INITIALIZING, 'create');
  }

  // Public API
  public get id(): AgentId {
    return this._id;
  }

  public get metadata(): AgentMetadata {
    return this._metadata;
  }

  public get state(): AgentState {
    return this._state;
  }

  public get capabilities(): readonly AgentCapability[] {
    return Array.from(this._capabilities);
  }

  public get config(): AeternaConfig {
    return this._config;
  }

  public get startTime(): Date {
    return this._startTime;
  }

  public get lastHeartbeat(): Date {
    return this._lastHeartbeat;
  }

  public get restartCount(): number {
    return this._restartCount;
  }

  public get uptime(): number {
    return Date.now() - this._startTime.getTime();
  }

  public get stateHistory(): readonly StateTransition[] {
    return [...this._stateHistory];
  }

  // Lifecycle Management
  public async initialize(): AsyncResult<void> {
    if (this._state !== AgentState.INITIALIZING) {
      return {
        success: false,
        error: new AgentLifecycleError(
          'Agent is not in initializing state',
          this._id,
          this._state,
          AgentState.INITIALIZING
        )
      };
    }

    if (this._initializationPromise) {
      try {
        await this._initializationPromise;
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new AgentError(String(error), 'INITIALIZATION_ERROR', this._id)
        };
      }
    }

    this._initializationPromise = this.performInitialization();

    try {
      await this._initializationPromise;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'INITIALIZATION_ERROR', this._id)
      };
    }
  }

  public async activate(): AsyncResult<void> {
    if (this._state !== AgentState.IDLE) {
      return {
        success: false,
        error: new AgentLifecycleError(
          'Agent must be in idle state to activate',
          this._id,
          this._state,
          AgentState.ACTIVE
        )
      };
    }

    try {
      await this.transitionToState(AgentState.ACTIVE, 'activate');
      this.startHeartbeat();
      this.emit('activated', { agentId: this._id, timestamp: Date.now() });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'ACTIVATION_ERROR', this._id)
      };
    }
  }

  public async suspend(): AsyncResult<void> {
    if (this._state !== AgentState.ACTIVE) {
      return {
        success: false,
        error: new AgentLifecycleError(
          'Agent must be active to suspend',
          this._id,
          this._state,
          AgentState.SUSPENDED
        )
      };
    }

    try {
      await this.transitionToState(AgentState.SUSPENDED, 'suspend');
      this.stopHeartbeat();
      this.emit('suspended', { agentId: this._id, timestamp: Date.now() });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'SUSPENSION_ERROR', this._id)
      };
    }
  }

  public async resume(): AsyncResult<void> {
    if (this._state !== AgentState.SUSPENDED) {
      return {
        success: false,
        error: new AgentLifecycleError(
          'Agent must be suspended to resume',
          this._id,
          this._state,
          AgentState.ACTIVE
        )
      };
    }

    try {
      await this.transitionToState(AgentState.ACTIVE, 'resume');
      this.startHeartbeat();
      this.emit('resumed', { agentId: this._id, timestamp: Date.now() });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'RESUME_ERROR', this._id)
      };
    }
  }

  public async shutdown(graceful: boolean = true): AsyncResult<void> {
    if (this._state === AgentState.TERMINATED || this._state === AgentState.TERMINATING) {
      return { success: true };
    }

    if (this._shutdownPromise) {
      try {
        await this._shutdownPromise;
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error : new AgentError(String(error), 'SHUTDOWN_ERROR', this._id)
        };
      }
    }

    this._shutdownPromise = this.performShutdown(graceful);

    try {
      await this._shutdownPromise;
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'SHUTDOWN_ERROR', this._id)
      };
    }
  }

  public async restart(): AsyncResult<void> {
    if (this._restartCount >= this._maxRestarts) {
      return {
        success: false,
        error: new SystemError(
          `Maximum restart count (${this._maxRestarts}) exceeded`,
          'MAX_RESTARTS_EXCEEDED',
          'agent_core',
          { restartCount: this._restartCount, maxRestarts: this._maxRestarts }
        )
      };
    }

    try {
      // Graceful shutdown first
      const shutdownResult = await this.shutdown(true);
      if (!shutdownResult.success) {
        throw shutdownResult.error;
      }

      // Wait a moment for cleanup
      await this.sleep(1000);

      // Reinitialize
      this._state = AgentState.INITIALIZING;
      this._initializationPromise = undefined;
      this._shutdownPromise = undefined;

      const initResult = await this.initialize();
      if (!initResult.success) {
        throw initResult.error;
      }

      const activateResult = await this.activate();
      if (!activateResult.success) {
        throw activateResult.error;
      }

      (this as any)._restartCount += 1;
      this.emit('restarted', { agentId: this._id, restartCount: this._restartCount, timestamp: Date.now() });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentError(String(error), 'RESTART_ERROR', this._id)
      };
    }
  }

  // Health Management
  public async healthCheck(): AsyncResult<Map<string, HealthCheck>> {
    try {
      const checks = new Map<string, HealthCheck>();

      // Check agent state
      checks.set('agent_state', {
        component: 'agent_state',
        status: this.isHealthyState() ? 'healthy' : 'unhealthy',
        message: `Current state: ${this._state}`,
        timestamp: Date.now()
      });

      // Check heartbeat
      const heartbeatAge = Date.now() - this._lastHeartbeat.getTime();
      checks.set('heartbeat', {
        component: 'heartbeat',
        status: heartbeatAge < 30000 ? 'healthy' : 'degraded',
        message: `Last heartbeat: ${heartbeatAge}ms ago`,
        timestamp: Date.now()
      });

      // Check capabilities
      const capabilityStatus = this._capabilities.size > 0 ? 'healthy' : 'degraded';
      checks.set('capabilities', {
        component: 'capabilities',
        status: capabilityStatus,
        message: `${this._capabilities.size} capabilities active`,
        timestamp: Date.now()
      });

      // Store health checks
      for (const [key, check] of checks) {
        this._healthChecks.set(key, check);
      }

      return { success: true, data: checks };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'HEALTH_CHECK_ERROR', 'agent_core')
      };
    }
  }

  public getHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    const checks = Array.from(this._healthChecks.values());
    if (checks.length === 0) return 'unhealthy';

    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;

    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  // Capability Management
  public hasCapability(capability: AgentCapability): boolean {
    return this._capabilities.has(capability);
  }

  public async addCapability(capability: AgentCapability): AsyncResult<void> {
    if (this._capabilities.has(capability)) {
      return { success: true }; // Already has capability
    }

    try {
      // Validate capability can be added
      if (!this.canAddCapability(capability)) {
        throw new AgentCapabilityError(
          `Cannot add capability ${capability} in current state`,
          this._id,
          capability
        );
      }

      this._capabilities.add(capability);
      this.emit('capability_added', {
        agentId: this._id,
        capability,
        timestamp: Date.now()
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentCapabilityError(String(error), this._id, capability)
      };
    }
  }

  public async removeCapability(capability: AgentCapability): AsyncResult<void> {
    if (!this._capabilities.has(capability)) {
      return { success: true }; // Doesn't have capability
    }

    try {
      this._capabilities.delete(capability);
      this.emit('capability_removed', {
        agentId: this._id,
        capability,
        timestamp: Date.now()
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AgentCapabilityError(String(error), this._id, capability)
      };
    }
  }

  // Event Management
  public emitAgentEvent<T>(type: EventType, data: T, priority: EventPriority = EventPriority.MEDIUM): void {
    const event: AgentEvent<T> = {
      id: this.generateEventId(),
      type,
      agentId: this._id,
      timestamp: Date.now(),
      data,
      metadata: {
        source: 'agent_core',
        priority,
        persistent: priority <= EventPriority.HIGH
      }
    };

    this.emit('agent_event', event);
    this.emit(type, event);
  }

  // Serialization
  public serialize(): string {
    const serializable = {
      id: this._id,
      metadata: this._metadata,
      state: this._state,
      stateHistory: this._stateHistory,
      capabilities: Array.from(this._capabilities),
      startTime: this._startTime.toISOString(),
      lastHeartbeat: this._lastHeartbeat.toISOString(),
      restartCount: this._restartCount,
      healthChecks: Array.from(this._healthChecks.entries())
    };

    return JSON.stringify(serializable);
  }

  public deserialize(data: string): AgentCore {
    // This is a static method conceptually - should be called on class
    throw new Error('Use AgentCore.fromSerialized() instead');
  }

  public static fromSerialized(data: string, config: AeternaConfig): AgentCore {
    const parsed = JSON.parse(data);

    // Create new agent with provided config
    const agent = new AgentCore(config);

    // Restore state
    (agent as any)._state = parsed.state;
    (agent as any)._stateHistory = parsed.stateHistory;
    (agent as any)._restartCount = parsed.restartCount;
    (agent as any)._lastHeartbeat = new Date(parsed.lastHeartbeat);

    // Restore capabilities
    agent._capabilities.clear();
    for (const capability of parsed.capabilities) {
      agent._capabilities.add(capability);
    }

    // Restore health checks
    for (const [key, check] of parsed.healthChecks) {
      agent._healthChecks.set(key, check);
    }

    return agent;
  }

  // Private Methods
  private async performInitialization(): Promise<void> {
    try {
      // Initialize subsystems
      await this.initializeSubsystems();

      // Run initial health check
      const healthResult = await this.healthCheck();
      if (!healthResult.success) {
        throw healthResult.error;
      }

      // Transition to idle state
      await this.transitionToState(AgentState.IDLE, 'initialize');

      this.emit('initialized', { agentId: this._id, timestamp: Date.now() });
    } catch (error) {
      await this.transitionToState(AgentState.ERROR, 'initialization_failed');
      throw error instanceof Error ? error : new AgentInitializationError(String(error), this._id, 'unknown');
    }
  }

  private async performShutdown(graceful: boolean): Promise<void> {
    try {
      await this.transitionToState(AgentState.TERMINATING, 'shutdown');

      if (graceful) {
        // Allow time for cleanup
        const timeout = this._config.agent.lifecycle.gracefulShutdownTimeout;
        await Promise.race([
          this.cleanupResources(),
          this.sleep(timeout)
        ]);
      }

      this.stopHeartbeat();
      this.removeAllListeners();

      await this.transitionToState(AgentState.TERMINATED, 'shutdown_complete');

      this.emit('terminated', { agentId: this._id, timestamp: Date.now() });
    } catch (error) {
      await this.transitionToState(AgentState.ERROR, 'shutdown_failed');
      throw error instanceof Error ? error : new SystemError(String(error), 'SHUTDOWN_ERROR', 'agent_core');
    }
  }

  private async initializeSubsystems(): Promise<void> {
    // This would initialize memory, AI, blockchain, etc.
    // For now, just simulate initialization
    await this.sleep(100);
  }

  private async cleanupResources(): Promise<void> {
    // Cleanup any resources
    await this.sleep(100);
  }

  private async transitionToState(newState: AgentState, action: string): Promise<void> {
    if (!this.isValidTransition(this._state, newState)) {
      throw new AgentLifecycleError(
        `Invalid state transition from ${this._state} to ${newState}`,
        this._id,
        this._state,
        newState
      );
    }

    const oldState = this._state;
    this._state = newState;

    this.recordStateTransition(newState, action);
    this.emitAgentEvent(EventType.LIFECYCLE, {
      from: oldState,
      to: newState,
      action,
      agentId: this._id
    }, EventPriority.HIGH);
  }

  private recordStateTransition(to: AgentState, action: string): void {
    const transition: StateTransition = {
      from: this._state === to ? AgentState.INITIALIZING : this._state,
      to,
      action,
      timestamp: Date.now()
    };

    this._stateHistory.push(transition);

    // Keep only last 100 transitions
    if (this._stateHistory.length > 100) {
      this._stateHistory.shift();
    }
  }

  private isValidTransition(from: AgentState, to: AgentState): boolean {
    const validTransitions: Record<AgentState, AgentState[]> = {
      [AgentState.INITIALIZING]: [AgentState.IDLE, AgentState.ERROR, AgentState.TERMINATED],
      [AgentState.IDLE]: [AgentState.ACTIVE, AgentState.SUSPENDED, AgentState.TERMINATING],
      [AgentState.ACTIVE]: [AgentState.IDLE, AgentState.SUSPENDED, AgentState.TERMINATING, AgentState.ERROR],
      [AgentState.SUSPENDED]: [AgentState.ACTIVE, AgentState.IDLE, AgentState.TERMINATING],
      [AgentState.ERROR]: [AgentState.INITIALIZING, AgentState.TERMINATING, AgentState.TERMINATED],
      [AgentState.TERMINATING]: [AgentState.TERMINATED],
      [AgentState.TERMINATED]: [] // No transitions from terminated state
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  private isHealthyState(): boolean {
    return [AgentState.IDLE, AgentState.ACTIVE].includes(this._state);
  }

  private canAddCapability(capability: AgentCapability): boolean {
    // Can't add capabilities when terminated or terminating
    return ![AgentState.TERMINATED, AgentState.TERMINATING].includes(this._state);
  }

  private startHeartbeat(): void {
    // Update heartbeat every 10 seconds
    const interval = setInterval(() => {
      this._lastHeartbeat = new Date();
      this.emit('heartbeat', { agentId: this._id, timestamp: Date.now() });
    }, 10000);

    this.once('terminated', () => clearInterval(interval));
    this.once('suspended', () => clearInterval(interval));
  }

  private stopHeartbeat(): void {
    // Heartbeat will be stopped by event listeners
  }

  private generateAgentId(): AgentId {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return {
      value: `agent_${timestamp}_${random}`,
      timestamp,
      network: this._config.economic.defaultNetwork
    };
  }

  private createMetadata(): AgentMetadata {
    const now = new Date();
    return {
      ...this._config.agent.metadata,
      createdAt: now,
      updatedAt: now
    };
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private validateConfiguration(config: AeternaConfig): void {
    if (!config) {
      throw new ValidationError('Configuration is required', 'config', config, 'not_null');
    }

    if (!config.agent) {
      throw new ValidationError('Agent configuration is required', 'config.agent', config.agent, 'not_null');
    }

    if (!config.agent.metadata) {
      throw new ValidationError('Agent metadata is required', 'config.agent.metadata', config.agent.metadata, 'not_null');
    }

    if (!config.agent.metadata.name || config.agent.metadata.name.trim() === '') {
      throw new ValidationError('Agent name is required', 'config.agent.metadata.name', config.agent.metadata.name, 'not_empty');
    }

    if (!config.agent.lifecycle) {
      throw new ValidationError('Lifecycle configuration is required', 'config.agent.lifecycle', config.agent.lifecycle, 'not_null');
    }

    if (config.agent.lifecycle.maxRestarts < 0) {
      throw new ValidationError('Max restarts must be non-negative', 'config.agent.lifecycle.maxRestarts', config.agent.lifecycle.maxRestarts, 'gte_0');
    }
  }

  private setupErrorHandling(): void {
    this.on('error', (error) => {
      this.emitAgentEvent(EventType.ERROR, { error: error.message }, EventPriority.CRITICAL);
    });

    process.on('uncaughtException', (error) => {
      this.emitAgentEvent(EventType.ERROR, {
        error: error.message,
        type: 'uncaughtException'
      }, EventPriority.CRITICAL);
    });

    process.on('unhandledRejection', (reason) => {
      this.emitAgentEvent(EventType.ERROR, {
        error: String(reason),
        type: 'unhandledRejection'
      }, EventPriority.CRITICAL);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}