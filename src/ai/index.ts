// AETERNA AI System - Main Export Module
// Production-level TypeScript AI integration hub

// Core AI Providers
export { ClaudeProvider } from './providers/ClaudeProvider.js';
export { OpenAIProvider } from './providers/OpenAIProvider.js';

// Core AI Engines
export { DecisionEngine } from './DecisionEngine.js';
export { PersonalityEngine } from './PersonalityEngine.js';
export { ContextManager } from './ContextManager.js';
export { LearningEngine } from './LearningEngine.js';

// Memory and Storage
export { MembaseClient } from './MembaseClient.js';

// Utilities
export { Logger } from './utils/Logger.js';
export { RateLimiter } from './utils/RateLimiter.js';
export { RetryManager } from './utils/RetryManager.js';

// Type Definitions - Re-export all types for easy access
export type {
  // Provider Types
  AIProvider,
  AIResponse,
  AIStreamChunk,
  GenerationOptions,
  ClaudeConfig,
  OpenAIConfig,
  AICapability,
  FunctionCall,
  AIFunction,
  AIError,

  // Decision Engine Types
  DecisionContext,
  DecisionResult,
  DecisionRule,

  // Personality Engine Types
  PersonalityProfile,
  PersonalityTraits,
  PersonalityEvolution,
  CommunicationStyle,
  KnowledgeDomains,
  AdaptationSettings,

  // Context Management Types
  ConversationContext,
  ConversationMessage,
  ConversationMetadata,
  SessionState,
  UserProfile,
  UserPreferences,

  // Learning Engine Types
  LearningEvent,
  Memory,
  LearningPattern,
  AdaptationSuggestion,
  MemoryMetadata,

  // Emotion and Intent Types
  EmotionDetection,
  IntentDetection,
  EmotionType,
  IntentType,

  // Membase Types
  MembaseConfig,
  MembaseClient as IMembaseClient,
  SearchOptions,
  SearchResult,

  // Utility Types
  LogLevel,
  LogEntry,
  DebugInfo,
  AISystemHealth,
  ProviderHealth,
  EngineHealth,

  // Validation Schemas
  PersonalityTraitsSchema,
  GenerationOptionsSchema,
  MemorySchema
} from './types/index.js';

// Configuration interfaces for easy setup
export interface AETERNAConfig {
  providers: {
    claude?: {
      apiKey: string;
      model?: 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307';
      maxTokens?: number;
    };
    openai?: {
      apiKey: string;
      model?: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | 'gpt-4o';
      maxTokens?: number;
    };
  };
  engines: {
    decision?: {
      enableMachineLearning?: boolean;
      defaultConfidenceThreshold?: number;
      debugMode?: boolean;
    };
    personality?: {
      enableAdaptation?: boolean;
      adaptationSensitivity?: number;
      evolutionThreshold?: number;
      debugMode?: boolean;
    };
    context?: {
      maxConversationHistory?: number;
      autoSummarization?: boolean;
      enableEmotionTracking?: boolean;
      debugMode?: boolean;
    };
    learning?: {
      enableContinuousLearning?: boolean;
      memoryRetentionDays?: number;
      learningRate?: number;
      debugMode?: boolean;
    };
  };
  membase?: {
    namespace?: string;
    retryAttempts?: number;
    enableBatching?: boolean;
    debugMode?: boolean;
  };
  debugging?: {
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    enablePerformanceTracking?: boolean;
    enableMemoryTracking?: boolean;
  };
}

// Main AETERNA AI System Class
export class AETERNA {
  private providers: Map<string, any> = new Map();
  private engines: {
    decision?: DecisionEngine;
    personality?: PersonalityEngine;
    context?: ContextManager;
    learning?: LearningEngine;
  } = {};
  private membaseClient?: MembaseClient;
  private logger: Logger;

  constructor(private config: AETERNAConfig) {
    this.logger = new Logger('AETERNA', {
      logLevel: config.debugging?.logLevel || 'info'
    });

    this.logger.info('Initializing AETERNA AI System', {
      providersCount: Object.keys(config.providers).length,
      enginesCount: Object.keys(config.engines || {}).length
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Initialize providers
      await this.initializeProviders();

      // Initialize Membase if configured
      if (this.config.membase) {
        await this.initializeMembase();
      }

      // Initialize engines
      await this.initializeEngines();

      this.logger.info('AETERNA AI System initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize AETERNA AI System', { error });
      throw error;
    }
  }

  private async initializeProviders(): Promise<void> {
    const { providers } = this.config;

    if (providers.claude) {
      const claudeProvider = new ClaudeProvider({
        apiKey: providers.claude.apiKey,
        model: providers.claude.model || 'claude-3-sonnet-20240229',
        maxTokens: providers.claude.maxTokens || 2048
      });
      this.providers.set('claude', claudeProvider);
      this.logger.info('Claude provider initialized');
    }

    if (providers.openai) {
      const openaiProvider = new OpenAIProvider({
        apiKey: providers.openai.apiKey,
        model: providers.openai.model || 'gpt-4',
        maxTokens: providers.openai.maxTokens || 2048
      });
      this.providers.set('openai', openaiProvider);
      this.logger.info('OpenAI provider initialized');
    }
  }

  private async initializeMembase(): Promise<void> {
    this.membaseClient = new MembaseClient({
      serverUrl: 'mcp://claude-flow',
      namespace: this.config.membase?.namespace || 'aeterna',
      retryAttempts: this.config.membase?.retryAttempts || 3,
      timeout: 30000,
      enableBatching: this.config.membase?.enableBatching !== false,
      debugMode: this.config.membase?.debugMode || false
    });

    this.logger.info('Membase client initialized');
  }

  private async initializeEngines(): Promise<void> {
    const { engines } = this.config;

    if (engines?.decision) {
      this.engines.decision = new DecisionEngine({
        defaultConfidenceThreshold: engines.decision.defaultConfidenceThreshold || 0.6,
        maxProcessingTimeMs: 5000,
        enableMachineLearning: engines.decision.enableMachineLearning !== false,
        fallbackAction: 'ask_for_clarification',
        debugMode: engines.decision.debugMode || false
      });
      this.logger.info('Decision Engine initialized');
    }

    if (engines?.personality) {
      this.engines.personality = new PersonalityEngine({
        enableAdaptation: engines.personality.enableAdaptation !== false,
        adaptationSensitivity: engines.personality.adaptationSensitivity || 0.3,
        evolutionThreshold: engines.personality.evolutionThreshold || 0.15,
        maxPersonalityVariations: 10,
        persistenceEnabled: true,
        debugMode: engines.personality.debugMode || false
      });
      this.logger.info('Personality Engine initialized');
    }

    if (engines?.context) {
      this.engines.context = new ContextManager({
        maxConversationHistory: engines.context.maxConversationHistory || 100,
        autoSummarization: engines.context.autoSummarization !== false,
        summarizationThreshold: 50,
        persistenceEnabled: true,
        contextExpirationHours: 24,
        enableEmotionTracking: engines.context.enableEmotionTracking !== false,
        enableIntentDetection: true,
        debugMode: engines.context.debugMode || false
      });
      this.logger.info('Context Manager initialized');
    }

    if (engines?.learning) {
      this.engines.learning = new LearningEngine({
        enableContinuousLearning: engines.learning.enableContinuousLearning !== false,
        memoryRetentionDays: engines.learning.memoryRetentionDays || 365,
        learningRate: engines.learning.learningRate || 0.1,
        patternDetectionThreshold: 0.7,
        maxMemoriesPerUser: 1000,
        enableAutoAdaptation: true,
        confidenceThreshold: 0.8,
        debugMode: engines.learning.debugMode || false
      });
      this.logger.info('Learning Engine initialized');
    }
  }

  // Public API Methods

  public getProvider(name: string): any {
    return this.providers.get(name);
  }

  public getEngine<T>(name: keyof typeof this.engines): T | undefined {
    return this.engines[name] as T;
  }

  public getMembaseClient(): MembaseClient | undefined {
    return this.membaseClient;
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    providers: Record<string, any>;
    engines: Record<string, any>;
    membase?: any;
  }> {
    const results = {
      status: 'healthy' as const,
      providers: {} as Record<string, any>,
      engines: {} as Record<string, any>,
      membase: undefined as any
    };

    try {
      // Check providers
      for (const [name, provider] of this.providers.entries()) {
        if (provider.healthCheck) {
          results.providers[name] = await provider.healthCheck();
        } else {
          results.providers[name] = { status: 'healthy' };
        }
      }

      // Check engines
      for (const [name, engine] of Object.entries(this.engines)) {
        if (engine && engine.healthCheck) {
          results.engines[name] = await engine.healthCheck();
        } else if (engine) {
          results.engines[name] = { status: 'healthy' };
        }
      }

      // Check Membase
      if (this.membaseClient) {
        results.membase = await this.membaseClient.healthCheck();
      }

      // Determine overall status
      const allHealthStatuses = [
        ...Object.values(results.providers).map(p => p.status),
        ...Object.values(results.engines).map(e => e.status),
        ...(results.membase ? [results.membase.status] : [])
      ];

      if (allHealthStatuses.some(status => status === 'unhealthy')) {
        results.status = 'unhealthy';
      } else if (allHealthStatuses.some(status => status === 'degraded')) {
        results.status = 'degraded';
      }

      return results;

    } catch (error) {
      this.logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        providers: {},
        engines: {},
        membase: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }

  public getMetrics(): {
    providers: Record<string, any>;
    engines: Record<string, any>;
    membase?: any;
  } {
    return {
      providers: Object.fromEntries(
        Array.from(this.providers.entries()).map(([name, provider]) => [
          name,
          provider.getMetrics ? provider.getMetrics() : {}
        ])
      ),
      engines: Object.fromEntries(
        Object.entries(this.engines).map(([name, engine]) => [
          name,
          engine && engine.getMetrics ? engine.getMetrics() : {}
        ])
      ),
      membase: this.membaseClient?.getStats()
    };
  }

  public async dispose(): Promise<void> {
    this.logger.info('Disposing AETERNA AI System');

    // Dispose providers
    for (const [name, provider] of this.providers.entries()) {
      try {
        if (provider.dispose) {
          await provider.dispose();
        }
        this.logger.debug(`Provider ${name} disposed`);
      } catch (error) {
        this.logger.warn(`Failed to dispose provider ${name}`, { error });
      }
    }

    // Dispose engines
    for (const [name, engine] of Object.entries(this.engines)) {
      try {
        if (engine && engine.dispose) {
          await engine.dispose();
        }
        this.logger.debug(`Engine ${name} disposed`);
      } catch (error) {
        this.logger.warn(`Failed to dispose engine ${name}`, { error });
      }
    }

    // Dispose Membase
    if (this.membaseClient) {
      try {
        await this.membaseClient.dispose();
        this.logger.debug('Membase client disposed');
      } catch (error) {
        this.logger.warn('Failed to dispose Membase client', { error });
      }
    }

    this.logger.info('AETERNA AI System disposed successfully');
  }
}

// Factory function for easy initialization
export async function createAETERNA(config: AETERNAConfig): Promise<AETERNA> {
  const aeterna = new AETERNA(config);
  await aeterna.initialize();
  return aeterna;
}

// Default export for convenience
export default AETERNA;