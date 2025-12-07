/**
 * AETERNA Intelligence Engine
 * Claude-3.5 + GPT-4 orchestration with strict TypeScript typing
 */

import { EventEmitter } from 'events';
import {
  AIConfig,
  AIProvider,
  ProviderConfig,
  OrchestrationConfig,
  LearningConfig,
  AIParameters,
  RateLimits,
  RoutingRule,
  AsyncResult,
  AgentId,
  Serializable,
  Deserializable
} from '../types';
import {
  AIError,
  AIProviderError,
  AIRateLimitError,
  AIOrchestrationError,
  AIConsensusError,
  ValidationError,
  TimeoutError
} from '../errors';

interface AIRequest {
  readonly id: string;
  readonly prompt: string;
  readonly parameters: AIParameters;
  readonly context?: AIContext;
  readonly metadata: RequestMetadata;
  readonly timestamp: Date;
}

interface AIResponse {
  readonly requestId: string;
  readonly provider: AIProvider;
  readonly content: string;
  readonly usage: TokenUsage;
  readonly confidence: number;
  readonly reasoning?: string;
  readonly metadata: ResponseMetadata;
  readonly timestamp: Date;
  readonly processingTime: number;
}

interface AIContext {
  readonly conversationId?: string;
  readonly previousMessages: Message[];
  readonly systemPrompt?: string;
  readonly tools?: Tool[];
  readonly constraints?: string[];
}

interface Message {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: Date;
}

interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

interface RequestMetadata {
  readonly priority: RequestPriority;
  readonly timeout: number;
  readonly retryAttempts: number;
  readonly requireConsensus: boolean;
  readonly consensusThreshold: number;
}

interface ResponseMetadata {
  readonly model: string;
  readonly temperature: number;
  readonly stopReason: string;
  readonly safety: SafetyCheck;
}

interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

interface SafetyCheck {
  readonly flagged: boolean;
  readonly categories: string[];
  readonly scores: Record<string, number>;
}

enum RequestPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  CRITICAL = 3
}

interface ConsensusResult {
  readonly responses: AIResponse[];
  readonly consensusReached: boolean;
  readonly finalResponse: string;
  readonly confidence: number;
  readonly agreementScore: number;
  readonly reasoning: string;
}

interface LearningSession {
  readonly id: string;
  readonly agentId: AgentId;
  readonly startTime: Date;
  readonly endTime?: Date;
  readonly interactions: AIRequest[];
  readonly outcomes: LearningOutcome[];
  readonly insights: string[];
  readonly modelUpdates: ModelUpdate[];
}

interface LearningOutcome {
  readonly requestId: string;
  readonly success: boolean;
  readonly feedback: string;
  readonly score: number;
  readonly improvements: string[];
}

interface ModelUpdate {
  readonly timestamp: Date;
  readonly provider: AIProvider;
  readonly updateType: UpdateType;
  readonly parameters: Record<string, unknown>;
  readonly performance: PerformanceMetrics;
}

enum UpdateType {
  PARAMETER_TUNING = 'parameter_tuning',
  PROMPT_OPTIMIZATION = 'prompt_optimization',
  CONTEXT_ENHANCEMENT = 'context_enhancement',
  ROUTING_ADJUSTMENT = 'routing_adjustment'
}

interface PerformanceMetrics {
  readonly accuracy: number;
  readonly latency: number;
  readonly throughput: number;
  readonly errorRate: number;
  readonly satisfactionScore: number;
}

export class IntelligenceEngine extends EventEmitter implements Serializable, Deserializable<IntelligenceEngine> {
  private readonly _config: AIConfig;
  private readonly _agentId: AgentId;
  private readonly _providers: Map<AIProvider, ProviderInstance>;
  private readonly _requestQueue: Map<RequestPriority, AIRequest[]>;
  private readonly _activeRequests: Map<string, AIRequest>;
  private readonly _responseCache: Map<string, AIResponse>;
  private readonly _learningSession?: LearningSession;
  private readonly _performanceMetrics: Map<AIProvider, PerformanceMetrics>;
  private _isInitialized: boolean;
  private _totalRequests: number;
  private _totalTokens: number;

  constructor(config: AIConfig, agentId: AgentId) {
    super();
    this.setMaxListeners(40);

    this.validateConfiguration(config);

    this._config = config;
    this._agentId = agentId;
    this._providers = new Map();
    this._requestQueue = new Map();
    this._activeRequests = new Map();
    this._responseCache = new Map();
    this._performanceMetrics = new Map();
    this._isInitialized = false;
    this._totalRequests = 0;
    this._totalTokens = 0;

    this.initializeQueues();
  }

  // Public API
  public get config(): AIConfig {
    return this._config;
  }

  public get agentId(): AgentId {
    return this._agentId;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get totalRequests(): number {
    return this._totalRequests;
  }

  public get totalTokens(): number {
    return this._totalTokens;
  }

  public get availableProviders(): readonly AIProvider[] {
    return Array.from(this._providers.keys());
  }

  // Initialization
  public async initialize(): AsyncResult<void> {
    if (this._isInitialized) {
      return { success: true };
    }

    try {
      // Initialize all configured providers
      for (const [provider, config] of Object.entries(this._config.providers)) {
        await this.initializeProvider(provider as AIProvider, config);
      }

      // Start request processing
      this.startRequestProcessor();

      // Initialize learning if enabled
      if (this._config.learningConfig.enabled) {
        await this.initializeLearning();
      }

      this._isInitialized = true;
      this.emit('initialized', { agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'AI_INIT_ERROR')
      };
    }
  }

  // Core AI Operations
  public async generateResponse(
    prompt: string,
    options: {
      provider?: AIProvider;
      parameters?: Partial<AIParameters>;
      context?: AIContext;
      priority?: RequestPriority;
      timeout?: number;
      requireConsensus?: boolean;
    } = {}
  ): AsyncResult<AIResponse> {
    try {
      if (!this._isInitialized) {
        throw new AIError('Intelligence Engine not initialized', 'NOT_INITIALIZED');
      }

      const request = this.createAIRequest(prompt, options);
      this._totalRequests++;

      // Add to queue based on priority
      const priority = options.priority || RequestPriority.MEDIUM;
      this._requestQueue.get(priority)!.push(request);

      this.emit('request_queued', {
        requestId: request.id,
        priority,
        queueSize: this._requestQueue.get(priority)!.length,
        agentId: this._agentId
      });

      // Wait for response
      return this.waitForResponse(request.id, options.timeout || 30000);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'GENERATE_RESPONSE_ERROR')
      };
    }
  }

  public async generateConsensus(
    prompt: string,
    providers: AIProvider[],
    parameters?: Partial<AIParameters>,
    context?: AIContext
  ): AsyncResult<ConsensusResult> {
    try {
      if (!this._isInitialized) {
        throw new AIError('Intelligence Engine not initialized', 'NOT_INITIALIZED');
      }

      // Validate providers
      for (const provider of providers) {
        if (!this._providers.has(provider)) {
          throw new AIProviderError(`Provider ${provider} not available`, provider);
        }
      }

      // Generate responses from multiple providers
      const responses: AIResponse[] = [];
      const promises = providers.map(provider =>
        this.generateSingleResponse(prompt, provider, parameters, context)
      );

      const results = await Promise.allSettled(promises);

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success && result.value.data) {
          responses.push(result.value.data);
        }
      }

      if (responses.length === 0) {
        throw new AIOrchestrationError('No successful responses from any provider', providers);
      }

      // Calculate consensus
      const consensus = this.calculateConsensus(responses);

      if (!consensus.consensusReached && responses.length < this._config.orchestrationConfig.consensusThreshold) {
        throw new AIConsensusError(
          'Insufficient responses for consensus',
          responses.length,
          this._config.orchestrationConfig.consensusThreshold
        );
      }

      this.emit('consensus_generated', {
        responsesCount: responses.length,
        consensusReached: consensus.consensusReached,
        confidence: consensus.confidence,
        agentId: this._agentId
      });

      return { success: true, data: consensus };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIOrchestrationError(String(error), providers)
      };
    }
  }

  public async optimizePrompt(
    originalPrompt: string,
    targetOutcome: string,
    iterations: number = 5
  ): AsyncResult<{ optimizedPrompt: string; improvementScore: number; iterations: number }> {
    try {
      let currentPrompt = originalPrompt;
      let bestPrompt = originalPrompt;
      let bestScore = 0;
      let actualIterations = 0;

      for (let i = 0; i < iterations; i++) {
        actualIterations++;

        // Generate optimization suggestions
        const optimizationPrompt = this.createOptimizationPrompt(currentPrompt, targetOutcome);
        const optimizationResult = await this.generateResponse(optimizationPrompt, {
          provider: this._config.orchestrationConfig.primaryProvider,
          priority: RequestPriority.HIGH
        });

        if (!optimizationResult.success || !optimizationResult.data) {
          continue;
        }

        // Extract optimized prompt from response
        const optimizedPrompt = this.extractOptimizedPrompt(optimizationResult.data.content);

        // Test optimized prompt
        const testResult = await this.generateResponse(optimizedPrompt, {
          provider: this._config.orchestrationConfig.primaryProvider
        });

        if (!testResult.success || !testResult.data) {
          continue;
        }

        // Calculate improvement score
        const score = this.calculatePromptScore(testResult.data, targetOutcome);

        if (score > bestScore) {
          bestScore = score;
          bestPrompt = optimizedPrompt;
        }

        currentPrompt = optimizedPrompt;

        // Early termination if score is high enough
        if (bestScore > 0.9) {
          break;
        }
      }

      this.emit('prompt_optimized', {
        originalPrompt,
        optimizedPrompt: bestPrompt,
        improvementScore: bestScore,
        iterations: actualIterations,
        agentId: this._agentId
      });

      return {
        success: true,
        data: {
          optimizedPrompt: bestPrompt,
          improvementScore: bestScore,
          iterations: actualIterations
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'PROMPT_OPTIMIZATION_ERROR')
      };
    }
  }

  // Learning and Adaptation
  public async startLearningSession(): AsyncResult<string> {
    try {
      if (!this._config.learningConfig.enabled) {
        throw new AIError('Learning is not enabled', 'LEARNING_DISABLED');
      }

      const sessionId = `learn_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      const learningSession: LearningSession = {
        id: sessionId,
        agentId: this._agentId,
        startTime: new Date(),
        interactions: [],
        outcomes: [],
        insights: [],
        modelUpdates: []
      };

      (this as any)._learningSession = learningSession;

      this.emit('learning_session_started', {
        sessionId,
        agentId: this._agentId
      });

      return { success: true, data: sessionId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'LEARNING_SESSION_ERROR')
      };
    }
  }

  public async recordLearningOutcome(
    requestId: string,
    success: boolean,
    feedback: string,
    score: number
  ): AsyncResult<void> {
    try {
      if (!this._learningSession) {
        throw new AIError('No active learning session', 'NO_LEARNING_SESSION');
      }

      const outcome: LearningOutcome = {
        requestId,
        success,
        feedback,
        score,
        improvements: this.generateImprovementSuggestions(feedback, score)
      };

      this._learningSession.outcomes.push(outcome);

      // Apply learning if enough outcomes collected
      if (this._learningSession.outcomes.length >= this._config.learningConfig.batchSize) {
        await this.applyLearning();
      }

      this.emit('learning_outcome_recorded', {
        requestId,
        success,
        score,
        sessionId: this._learningSession.id,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'LEARNING_OUTCOME_ERROR')
      };
    }
  }

  // Performance Monitoring
  public async getPerformanceMetrics(provider?: AIProvider): AsyncResult<Record<AIProvider, PerformanceMetrics> | PerformanceMetrics> {
    try {
      if (provider) {
        const metrics = this._performanceMetrics.get(provider);
        if (!metrics) {
          throw new AIProviderError(`No metrics available for provider ${provider}`, provider);
        }
        return { success: true, data: metrics };
      }

      const allMetrics: Record<AIProvider, PerformanceMetrics> = {} as Record<AIProvider, PerformanceMetrics>;
      for (const [prov, metrics] of this._performanceMetrics) {
        allMetrics[prov] = metrics;
      }

      return { success: true, data: allMetrics };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIError(String(error), 'METRICS_ERROR')
      };
    }
  }

  public async optimizeOrchestration(): AsyncResult<OrchestrationConfig> {
    try {
      const metrics = await this.getPerformanceMetrics();
      if (!metrics.success || !metrics.data) {
        throw metrics.error || new AIError('Failed to get performance metrics', 'METRICS_ERROR');
      }

      const allMetrics = metrics.data as Record<AIProvider, PerformanceMetrics>;

      // Find best performing provider
      let bestProvider = this._config.orchestrationConfig.primaryProvider;
      let bestScore = 0;

      for (const [provider, metric] of Object.entries(allMetrics)) {
        const score = this.calculateProviderScore(metric);
        if (score > bestScore) {
          bestScore = score;
          bestProvider = provider as AIProvider;
        }
      }

      // Optimize routing rules
      const optimizedRules = this.optimizeRoutingRules(allMetrics);

      const optimizedConfig: OrchestrationConfig = {
        ...this._config.orchestrationConfig,
        primaryProvider: bestProvider,
        routingRules: optimizedRules
      };

      this.emit('orchestration_optimized', {
        newPrimaryProvider: bestProvider,
        rulesCount: optimizedRules.length,
        agentId: this._agentId
      });

      return { success: true, data: optimizedConfig };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIOrchestrationError(String(error), [])
      };
    }
  }

  // Serialization
  public serialize(): string {
    const serializable = {
      agentId: this._agentId,
      config: this._config,
      totalRequests: this._totalRequests,
      totalTokens: this._totalTokens,
      performanceMetrics: Array.from(this._performanceMetrics.entries()),
      learningSession: this._learningSession,
      isInitialized: this._isInitialized
    };

    return JSON.stringify(serializable);
  }

  public deserialize(data: string): IntelligenceEngine {
    throw new Error('Use IntelligenceEngine.fromSerialized() instead');
  }

  public static fromSerialized(data: string): IntelligenceEngine {
    const parsed = JSON.parse(data);

    const engine = new IntelligenceEngine(parsed.config, parsed.agentId);

    // Restore state
    (engine as any)._totalRequests = parsed.totalRequests;
    (engine as any)._totalTokens = parsed.totalTokens;
    (engine as any)._isInitialized = parsed.isInitialized;
    (engine as any)._learningSession = parsed.learningSession;

    // Restore performance metrics
    for (const [provider, metrics] of parsed.performanceMetrics) {
      engine._performanceMetrics.set(provider, metrics);
    }

    return engine;
  }

  // Private Methods
  private async initializeProvider(provider: AIProvider, config: ProviderConfig): Promise<void> {
    try {
      // Create provider instance
      const instance = await this.createProviderInstance(provider, config);

      // Test connection
      await this.testProviderConnection(instance);

      this._providers.set(provider, instance);

      // Initialize performance metrics
      this._performanceMetrics.set(provider, {
        accuracy: 0,
        latency: 0,
        throughput: 0,
        errorRate: 0,
        satisfactionScore: 0
      });

      this.emit('provider_initialized', { provider, agentId: this._agentId });
    } catch (error) {
      throw new AIProviderError(
        `Failed to initialize provider ${provider}: ${error}`,
        provider
      );
    }
  }

  private async createProviderInstance(provider: AIProvider, config: ProviderConfig): Promise<ProviderInstance> {
    switch (provider) {
      case AIProvider.CLAUDE_35_SONNET:
        return this.createClaudeInstance(config);
      case AIProvider.GPT_4:
        return this.createOpenAIInstance(config);
      case AIProvider.GEMINI_PRO:
        return this.createGeminiInstance(config);
      default:
        throw new AIProviderError(`Unsupported provider: ${provider}`, provider);
    }
  }

  private async createClaudeInstance(config: ProviderConfig): Promise<ProviderInstance> {
    // Create Claude instance (would use actual Anthropic SDK)
    return {
      provider: AIProvider.CLAUDE_35_SONNET,
      config,
      client: {}, // Actual Claude client would go here
      isConnected: true,
      lastPing: new Date()
    };
  }

  private async createOpenAIInstance(config: ProviderConfig): Promise<ProviderInstance> {
    // Create OpenAI instance (would use actual OpenAI SDK)
    return {
      provider: AIProvider.GPT_4,
      config,
      client: {}, // Actual OpenAI client would go here
      isConnected: true,
      lastPing: new Date()
    };
  }

  private async createGeminiInstance(config: ProviderConfig): Promise<ProviderInstance> {
    // Create Gemini instance (would use actual Google AI SDK)
    return {
      provider: AIProvider.GEMINI_PRO,
      config,
      client: {}, // Actual Gemini client would go here
      isConnected: true,
      lastPing: new Date()
    };
  }

  private async testProviderConnection(instance: ProviderInstance): Promise<void> {
    // Test provider connection with a simple request
    await this.sleep(100); // Simulate connection test
  }

  private initializeQueues(): void {
    for (const priority of Object.values(RequestPriority)) {
      if (typeof priority === 'number') {
        this._requestQueue.set(priority, []);
      }
    }
  }

  private createAIRequest(
    prompt: string,
    options: {
      provider?: AIProvider;
      parameters?: Partial<AIParameters>;
      context?: AIContext;
      priority?: RequestPriority;
      timeout?: number;
      requireConsensus?: boolean;
    }
  ): AIRequest {
    const defaultParameters: AIParameters = {
      temperature: 0.7,
      maxTokens: 1000,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0
    };

    return {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      prompt,
      parameters: { ...defaultParameters, ...options.parameters },
      context: options.context,
      metadata: {
        priority: options.priority || RequestPriority.MEDIUM,
        timeout: options.timeout || 30000,
        retryAttempts: 3,
        requireConsensus: options.requireConsensus || false,
        consensusThreshold: this._config.orchestrationConfig.consensusThreshold
      },
      timestamp: new Date()
    };
  }

  private startRequestProcessor(): void {
    // Process requests from queues in priority order
    setInterval(() => {
      this.processRequestQueue();
    }, 100); // Process every 100ms
  }

  private async processRequestQueue(): Promise<void> {
    // Process in priority order (highest first)
    const priorities = [RequestPriority.CRITICAL, RequestPriority.HIGH, RequestPriority.MEDIUM, RequestPriority.LOW];

    for (const priority of priorities) {
      const queue = this._requestQueue.get(priority)!;
      if (queue.length === 0) continue;

      const request = queue.shift()!;
      this._activeRequests.set(request.id, request);

      // Process request asynchronously
      this.processRequest(request).catch(error => {
        this.emit('request_error', {
          requestId: request.id,
          error: error instanceof Error ? error.message : String(error),
          agentId: this._agentId
        });
      });

      // Process one request per cycle to avoid overwhelming providers
      break;
    }
  }

  private async processRequest(request: AIRequest): Promise<void> {
    try {
      const startTime = Date.now();

      // Select provider based on routing rules or use primary
      const provider = this.selectProvider(request);
      const response = await this.generateSingleResponse(
        request.prompt,
        provider,
        request.parameters,
        request.context
      );

      const processingTime = Date.now() - startTime;

      if (response.success && response.data) {
        const finalResponse: AIResponse = {
          ...response.data,
          requestId: request.id,
          processingTime
        };

        this._responseCache.set(request.id, finalResponse);
        this._totalTokens += finalResponse.usage.totalTokens;

        // Update performance metrics
        this.updatePerformanceMetrics(provider, finalResponse, true);

        this.emit('request_completed', {
          requestId: request.id,
          provider,
          processingTime,
          agentId: this._agentId
        });
      } else {
        throw response.error || new AIError('Unknown error in response generation', 'UNKNOWN_ERROR');
      }
    } catch (error) {
      this.emit('request_failed', {
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error),
        agentId: this._agentId
      });
    } finally {
      this._activeRequests.delete(request.id);
    }
  }

  private async generateSingleResponse(
    prompt: string,
    provider: AIProvider,
    parameters?: Partial<AIParameters>,
    context?: AIContext
  ): AsyncResult<AIResponse> {
    try {
      const instance = this._providers.get(provider);
      if (!instance) {
        throw new AIProviderError(`Provider ${provider} not available`, provider);
      }

      // Check rate limits
      if (!this.checkRateLimit(provider)) {
        throw new AIRateLimitError('Rate limit exceeded', provider, 60);
      }

      // Simulate API call (would use actual provider SDKs)
      await this.sleep(Math.random() * 1000 + 500); // Simulate network latency

      const response: AIResponse = {
        requestId: '',
        provider,
        content: `AI response from ${provider} for prompt: ${prompt.substring(0, 50)}...`,
        usage: {
          promptTokens: Math.floor(prompt.length / 4),
          completionTokens: Math.floor(Math.random() * 200 + 50),
          totalTokens: 0
        },
        confidence: Math.random() * 0.3 + 0.7, // 0.7 to 1.0
        metadata: {
          model: instance.config.model,
          temperature: parameters?.temperature || 0.7,
          stopReason: 'max_tokens',
          safety: {
            flagged: false,
            categories: [],
            scores: {}
          }
        },
        timestamp: new Date(),
        processingTime: 0
      };

      response.usage.totalTokens = response.usage.promptTokens + response.usage.completionTokens;

      return { success: true, data: response };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new AIProviderError(String(error), provider)
      };
    }
  }

  private selectProvider(request: AIRequest): AIProvider {
    // Apply routing rules
    for (const rule of this._config.orchestrationConfig.routingRules) {
      if (this.evaluateRoutingRule(rule, request)) {
        return rule.provider;
      }
    }

    // Use primary provider as fallback
    return this._config.orchestrationConfig.primaryProvider;
  }

  private evaluateRoutingRule(rule: RoutingRule, request: AIRequest): boolean {
    // Implement rule evaluation logic
    // This could check prompt content, priority, parameters, etc.
    return false; // Simplified implementation
  }

  private checkRateLimit(provider: AIProvider): boolean {
    // Implement rate limiting logic
    return true; // Simplified implementation
  }

  private calculateConsensus(responses: AIResponse[]): ConsensusResult {
    if (responses.length === 0) {
      return {
        responses: [],
        consensusReached: false,
        finalResponse: '',
        confidence: 0,
        agreementScore: 0,
        reasoning: 'No responses to analyze'
      };
    }

    // Simple consensus based on response similarity and confidence
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

    // For simplification, use the response with highest confidence
    const bestResponse = responses.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    const agreementScore = this.calculateAgreementScore(responses);
    const consensusReached = agreementScore >= 0.7 && avgConfidence >= 0.8;

    return {
      responses,
      consensusReached,
      finalResponse: bestResponse.content,
      confidence: avgConfidence,
      agreementScore,
      reasoning: `Consensus based on ${responses.length} responses with ${agreementScore.toFixed(2)} agreement`
    };
  }

  private calculateAgreementScore(responses: AIResponse[]): number {
    if (responses.length <= 1) return 1.0;

    // Simple similarity calculation based on content length and keywords
    const lengths = responses.map(r => r.content.length);
    const avgLength = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const lengthVariance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;

    // Lower variance = higher agreement
    return Math.max(0, 1 - (lengthVariance / (avgLength * avgLength)));
  }

  private async waitForResponse(requestId: string, timeout: number): Promise<AsyncResult<AIResponse>> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve({
          success: false,
          error: new TimeoutError('Request timeout', 'ai_request', timeout)
        });
      }, timeout);

      const checkResponse = () => {
        const response = this._responseCache.get(requestId);
        if (response) {
          clearTimeout(timeoutId);
          this._responseCache.delete(requestId);
          resolve({ success: true, data: response });
          return;
        }

        setTimeout(checkResponse, 100);
      };

      checkResponse();
    });
  }

  private updatePerformanceMetrics(provider: AIProvider, response: AIResponse, success: boolean): void {
    const current = this._performanceMetrics.get(provider);
    if (!current) return;

    // Update metrics (simplified calculation)
    const updated: PerformanceMetrics = {
      accuracy: success ? Math.min(1.0, current.accuracy + 0.01) : Math.max(0, current.accuracy - 0.01),
      latency: (current.latency + response.processingTime) / 2,
      throughput: current.throughput + 1,
      errorRate: success ? Math.max(0, current.errorRate - 0.01) : current.errorRate + 0.01,
      satisfactionScore: (current.satisfactionScore + response.confidence) / 2
    };

    this._performanceMetrics.set(provider, updated);
  }

  private async initializeLearning(): Promise<void> {
    // Initialize learning components
    await this.sleep(100);
  }

  private async applyLearning(): Promise<void> {
    if (!this._learningSession) return;

    // Analyze outcomes and generate insights
    const insights = this.generateInsights(this._learningSession.outcomes);
    this._learningSession.insights.push(...insights);

    // Apply parameter updates
    const updates = this.generateModelUpdates(this._learningSession.outcomes);
    this._learningSession.modelUpdates.push(...updates);

    this.emit('learning_applied', {
      sessionId: this._learningSession.id,
      insightsCount: insights.length,
      updatesCount: updates.length,
      agentId: this._agentId
    });
  }

  private generateInsights(outcomes: LearningOutcome[]): string[] {
    // Generate insights from learning outcomes
    const insights: string[] = [];
    const successRate = outcomes.filter(o => o.success).length / outcomes.length;

    if (successRate < 0.7) {
      insights.push('Low success rate detected - review prompt engineering strategies');
    }

    return insights;
  }

  private generateModelUpdates(outcomes: LearningOutcome[]): ModelUpdate[] {
    // Generate model parameter updates
    return [];
  }

  private generateImprovementSuggestions(feedback: string, score: number): string[] {
    const suggestions: string[] = [];

    if (score < 0.5) {
      suggestions.push('Consider revising prompt structure');
      suggestions.push('Review context and parameters');
    }

    return suggestions;
  }

  private createOptimizationPrompt(currentPrompt: string, targetOutcome: string): string {
    return `Optimize this prompt to better achieve the target outcome:

Current prompt: "${currentPrompt}"
Target outcome: "${targetOutcome}"

Provide an improved version that is more likely to produce the desired result.`;
  }

  private extractOptimizedPrompt(content: string): string {
    // Extract optimized prompt from AI response
    // This would use more sophisticated parsing in production
    return content.trim();
  }

  private calculatePromptScore(response: AIResponse, targetOutcome: string): number {
    // Calculate how well the response matches the target outcome
    // This would use more sophisticated evaluation in production
    return response.confidence;
  }

  private calculateProviderScore(metrics: PerformanceMetrics): number {
    // Weighted score combining all metrics
    return (
      metrics.accuracy * 0.3 +
      (1 - metrics.errorRate) * 0.2 +
      metrics.satisfactionScore * 0.3 +
      (metrics.latency < 1000 ? 0.2 : 0) // Bonus for low latency
    );
  }

  private optimizeRoutingRules(allMetrics: Record<AIProvider, PerformanceMetrics>): RoutingRule[] {
    // Generate optimized routing rules based on performance
    const rules: RoutingRule[] = [];

    // Example: Route high-priority requests to best performing provider
    const sortedProviders = Object.entries(allMetrics)
      .sort(([, a], [, b]) => this.calculateProviderScore(b) - this.calculateProviderScore(a))
      .map(([provider]) => provider as AIProvider);

    if (sortedProviders.length > 0) {
      rules.push({
        condition: 'priority === "high"',
        provider: sortedProviders[0],
        priority: 1
      });
    }

    return rules;
  }

  private validateConfiguration(config: AIConfig): void {
    if (!config) {
      throw new ValidationError('AI configuration is required', 'config', config, 'not_null');
    }

    if (!config.providers || Object.keys(config.providers).length === 0) {
      throw new ValidationError('At least one AI provider must be configured', 'config.providers', config.providers, 'not_empty');
    }

    if (!config.orchestrationConfig.primaryProvider) {
      throw new ValidationError('Primary provider must be specified', 'config.orchestrationConfig.primaryProvider', config.orchestrationConfig.primaryProvider, 'not_null');
    }

    if (config.orchestrationConfig.consensusThreshold < 1) {
      throw new ValidationError('Consensus threshold must be at least 1', 'config.orchestrationConfig.consensusThreshold', config.orchestrationConfig.consensusThreshold, 'gte_1');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Supporting interfaces
interface ProviderInstance {
  readonly provider: AIProvider;
  readonly config: ProviderConfig;
  readonly client: unknown; // Provider-specific client
  readonly isConnected: boolean;
  readonly lastPing: Date;
}