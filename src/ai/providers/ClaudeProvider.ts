// AETERNA Claude/Anthropic Provider
// Production-level TypeScript implementation with comprehensive error handling

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  AIProvider,
  AIResponse,
  AIStreamChunk,
  GenerationOptions,
  ClaudeConfig,
  ClaudeMessage,
  ClaudeResponse,
  AIError,
  DebugInfo,
  AICapability
} from '../types/index.js';
import { Logger } from '../utils/Logger.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { RetryManager } from '../utils/RetryManager.js';

export class ClaudeProvider implements AIProvider {
  public readonly name = 'claude';
  public readonly version = '1.0.0';
  public readonly capabilities: AICapability[] = [
    {
      type: 'text-generation',
      description: 'High-quality text generation with advanced reasoning',
      maxTokens: 4096,
      supports: {
        streaming: true,
        functions: true,
        vision: true,
        audio: false
      }
    },
    {
      type: 'function-calling',
      description: 'Structured function calling with parameter validation',
      supports: { functions: true }
    },
    {
      type: 'reasoning',
      description: 'Advanced reasoning and problem-solving capabilities',
      supports: { streaming: true }
    },
    {
      type: 'code-generation',
      description: 'Code generation and debugging across multiple languages',
      supports: { streaming: true }
    }
  ];

  private client: Anthropic;
  private config: ClaudeConfig;
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private retryManager: RetryManager;

  constructor(config: ClaudeConfig) {
    this.config = this.validateConfig(config);
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: this.config.timeout || 30000,
    });

    this.logger = new Logger('ClaudeProvider');
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 60,
      requestsPerHour: 3000,
      tokensPerMinute: 40000
    });
    this.retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });

    this.logger.info('Claude provider initialized', {
      model: this.config.model,
      maxTokens: this.config.maxTokens
    });
  }

  private validateConfig(config: ClaudeConfig): ClaudeConfig {
    const schema = z.object({
      apiKey: z.string().min(1),
      baseURL: z.string().url().optional(),
      model: z.enum(['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307']),
      maxTokens: z.number().min(1).max(4096),
      timeout: z.number().min(1000).max(300000).optional(),
    });

    const result = schema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid Claude configuration: ${result.error.message}`);
    }

    return result.data;
  }

  public async generateResponse(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const debugInfo: Partial<DebugInfo> = {
      component: 'ClaudeProvider',
      operation: 'generateResponse',
      timestamp: new Date(),
      input: { prompt, options }
    };

    try {
      // Rate limiting check
      await this.rateLimiter.waitForAvailability();

      // Validate inputs
      this.validateGenerationOptions(options);

      // Prepare messages
      const messages = this.prepareMessages(prompt, options);

      // Make API call with retry logic
      const response = await this.retryManager.execute(async () => {
        return await this.client.messages.create({
          model: this.config.model,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || 0.7,
          top_p: options.topP,
          top_k: options.topK,
          stop_sequences: options.stopSequences,
          messages,
          system: options.systemPrompt,
        });
      });

      const endTime = performance.now();
      const aiResponse = this.transformResponse(response, endTime - startTime);

      // Update rate limiter
      this.rateLimiter.recordRequest(aiResponse.metadata.tokensUsed);

      // Log success
      debugInfo.output = aiResponse;
      debugInfo.performance = {
        startTime,
        endTime,
        duration: endTime - startTime
      };
      this.logger.debug('Response generated successfully', debugInfo);

      return aiResponse;

    } catch (error) {
      const endTime = performance.now();
      const aiError = this.handleError(error);

      debugInfo.error = error as Error;
      debugInfo.performance = {
        startTime,
        endTime,
        duration: endTime - startTime
      };
      this.logger.error('Failed to generate response', debugInfo);

      return {
        id: `error-${Date.now()}`,
        content: '',
        metadata: {
          model: this.config.model,
          provider: this.name,
          tokensUsed: 0,
          responseTime: endTime - startTime,
          finishReason: 'content_filter'
        },
        error: aiError
      };
    }
  }

  public async* streamResponse(
    prompt: string,
    options: GenerationOptions = {}
  ): AsyncIterableIterator<AIStreamChunk> {
    const startTime = performance.now();

    try {
      await this.rateLimiter.waitForAvailability();
      this.validateGenerationOptions(options);

      const messages = this.prepareMessages(prompt, options);
      const stream = await this.client.messages.stream({
        model: this.config.model,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || 0.7,
        top_p: options.topP,
        top_k: options.topK,
        stop_sequences: options.stopSequences,
        messages,
        system: options.systemPrompt,
      });

      let chunkCount = 0;
      let totalTokens = 0;

      for await (const chunk of stream) {
        chunkCount++;

        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const streamChunk: AIStreamChunk = {
            id: `chunk-${chunkCount}`,
            delta: chunk.delta.text,
            isComplete: false,
            metadata: {
              model: this.config.model,
              provider: this.name
            }
          };

          yield streamChunk;
        }

        if (chunk.type === 'message_stop') {
          const finalChunk: AIStreamChunk = {
            id: `chunk-final`,
            delta: '',
            isComplete: true,
            metadata: {
              model: this.config.model,
              provider: this.name,
              tokensUsed: totalTokens,
              responseTime: performance.now() - startTime,
              finishReason: 'completed'
            }
          };

          yield finalChunk;
        }
      }

      this.rateLimiter.recordRequest(totalTokens);

    } catch (error) {
      const errorChunk: AIStreamChunk = {
        id: `error-chunk`,
        delta: '',
        isComplete: true,
        metadata: {
          model: this.config.model,
          provider: this.name,
          tokensUsed: 0,
          responseTime: performance.now() - startTime,
          finishReason: 'content_filter'
        }
      };

      this.logger.error('Streaming failed', { error, prompt, options });
      yield errorChunk;
    }
  }

  private prepareMessages(prompt: string, options: GenerationOptions): ClaudeMessage[] {
    const messages: ClaudeMessage[] = [];

    // Handle conversation context if provided
    if (options.conversationId) {
      // In a real implementation, you'd fetch conversation history
      // For now, we'll use the prompt as a single message
    }

    messages.push({
      role: 'user',
      content: prompt
    });

    return messages;
  }

  private validateGenerationOptions(options: GenerationOptions): void {
    const schema = z.object({
      maxTokens: z.number().min(1).max(4096).optional(),
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
      topK: z.number().min(1).max(40).optional(),
      stopSequences: z.array(z.string().max(64)).max(4).optional(),
      stream: z.boolean().optional(),
      systemPrompt: z.string().max(10000).optional(),
      conversationId: z.string().optional(),
      userId: z.string().optional(),
    });

    const result = schema.safeParse(options);
    if (!result.success) {
      throw new Error(`Invalid generation options: ${result.error.message}`);
    }
  }

  private transformResponse(response: ClaudeResponse, responseTime: number): AIResponse {
    const content = response.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    const finishReasonMap = {
      'end_turn': 'completed' as const,
      'max_tokens': 'length' as const,
      'stop_sequence': 'completed' as const,
    };

    return {
      id: response.id,
      content,
      metadata: {
        model: response.model,
        provider: this.name,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        responseTime,
        finishReason: finishReasonMap[response.stop_reason] || 'completed',
        confidence: this.calculateConfidence(content, response.stop_reason)
      }
    };
  }

  private calculateConfidence(content: string, stopReason: string): number {
    // Simple confidence calculation based on content quality and completion
    let confidence = 0.8; // Base confidence

    if (stopReason === 'end_turn') confidence += 0.1;
    if (content.length > 50) confidence += 0.05;
    if (content.includes('I\'m not sure') || content.includes('I don\'t know')) confidence -= 0.2;
    if (content.includes('However') || content.includes('Therefore')) confidence += 0.05;

    return Math.max(0, Math.min(1, confidence));
  }

  private handleError(error: any): AIError {
    this.logger.error('Claude API error', { error });

    // Handle Anthropic-specific errors
    if (error.status === 429) {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please try again later.',
        type: 'rate_limit',
        retryable: true,
        retryAfter: this.extractRetryAfter(error) || 60
      };
    }

    if (error.status === 401) {
      return {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid API key or authentication failed.',
        type: 'authentication',
        retryable: false
      };
    }

    if (error.status === 400) {
      return {
        code: 'INVALID_REQUEST',
        message: error.message || 'Invalid request parameters.',
        type: 'invalid_request',
        retryable: false
      };
    }

    if (error.status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: 'Server error. Please try again.',
        type: 'server_error',
        retryable: true,
        retryAfter: 30
      };
    }

    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed.',
        type: 'server_error',
        retryable: true,
        retryAfter: 10
      };
    }

    if (error.name === 'AbortError' || error.code === 'TIMEOUT') {
      return {
        code: 'TIMEOUT',
        message: 'Request timed out.',
        type: 'timeout',
        retryable: true,
        retryAfter: 5
      };
    }

    // Generic error
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred.',
      type: 'server_error',
      retryable: false
    };
  }

  private extractRetryAfter(error: any): number | undefined {
    // Extract retry-after header if available
    const retryAfter = error.response?.headers?.['retry-after'];
    if (retryAfter) {
      const parsed = parseInt(retryAfter, 10);
      return isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  public async healthCheck(): Promise<{ status: string; latency: number; error?: string }> {
    const startTime = performance.now();

    try {
      const response = await this.generateResponse('Hello, this is a health check.', {
        maxTokens: 50,
        temperature: 0
      });

      const latency = performance.now() - startTime;

      if (response.error) {
        return {
          status: 'unhealthy',
          latency,
          error: response.error.message
        };
      }

      return {
        status: 'healthy',
        latency
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        latency: performance.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public getMetrics() {
    return {
      provider: this.name,
      model: this.config.model,
      rateLimiter: this.rateLimiter.getStats(),
      retryManager: this.retryManager.getStats(),
      capabilities: this.capabilities
    };
  }

  public async dispose(): Promise<void> {
    this.logger.info('Disposing Claude provider');
    // Cleanup resources if needed
  }
}