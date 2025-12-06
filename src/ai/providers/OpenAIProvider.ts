// AETERNA OpenAI Provider
// Production-level TypeScript implementation with comprehensive error handling

import OpenAI from 'openai';
import { z } from 'zod';
import {
  AIProvider,
  AIResponse,
  AIStreamChunk,
  GenerationOptions,
  OpenAIConfig,
  OpenAIMessage,
  OpenAIResponse,
  AIError,
  DebugInfo,
  AICapability,
  FunctionCall,
  AIFunction
} from '../types/index.js';
import { Logger } from '../utils/Logger.js';
import { RateLimiter } from '../utils/RateLimiter.js';
import { RetryManager } from '../utils/RetryManager.js';

export class OpenAIProvider implements AIProvider {
  public readonly name = 'openai';
  public readonly version = '1.0.0';
  public readonly capabilities: AICapability[] = [
    {
      type: 'text-generation',
      description: 'Advanced text generation with GPT models',
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
      description: 'Native function calling with JSON schema validation',
      supports: { functions: true }
    },
    {
      type: 'reasoning',
      description: 'Step-by-step reasoning and problem solving',
      supports: { streaming: true }
    },
    {
      type: 'code-generation',
      description: 'Code generation, completion, and debugging',
      supports: { streaming: true, functions: true }
    },
    {
      type: 'multimodal',
      description: 'Vision and image understanding capabilities',
      supports: { vision: true }
    }
  ];

  private client: OpenAI;
  private config: OpenAIConfig;
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private retryManager: RetryManager;

  constructor(config: OpenAIConfig) {
    this.config = this.validateConfig(config);
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      timeout: this.config.timeout || 30000,
    });

    this.logger = new Logger('OpenAIProvider');
    this.rateLimiter = new RateLimiter({
      requestsPerMinute: 500,
      requestsPerHour: 10000,
      tokensPerMinute: 80000
    });
    this.retryManager = new RetryManager({
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    });

    this.logger.info('OpenAI provider initialized', {
      model: this.config.model,
      maxTokens: this.config.maxTokens
    });
  }

  private validateConfig(config: OpenAIConfig): OpenAIConfig {
    const schema = z.object({
      apiKey: z.string().min(1),
      baseURL: z.string().url().optional(),
      model: z.enum(['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-4o']),
      maxTokens: z.number().min(1).max(4096),
      timeout: z.number().min(1000).max(300000).optional(),
    });

    const result = schema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid OpenAI configuration: ${result.error.message}`);
    }

    return result.data;
  }

  public async generateResponse(
    prompt: string,
    options: GenerationOptions = {}
  ): Promise<AIResponse> {
    const startTime = performance.now();
    const debugInfo: Partial<DebugInfo> = {
      component: 'OpenAIProvider',
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

      // Prepare function definitions if provided
      const tools = options.functions ? this.prepareFunctions(options.functions) : undefined;

      // Make API call with retry logic
      const response = await this.retryManager.execute(async () => {
        return await this.client.chat.completions.create({
          model: this.config.model,
          messages,
          max_tokens: options.maxTokens || this.config.maxTokens,
          temperature: options.temperature || 0.7,
          top_p: options.topP,
          stop: options.stopSequences,
          tools,
          tool_choice: tools ? 'auto' : undefined,
          stream: false,
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
      const tools = options.functions ? this.prepareFunctions(options.functions) : undefined;

      const stream = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature || 0.7,
        top_p: options.topP,
        stop: options.stopSequences,
        tools,
        tool_choice: tools ? 'auto' : undefined,
        stream: true,
      });

      let chunkCount = 0;
      let totalTokens = 0;
      let functionCallData: any = {};

      for await (const chunk of stream) {
        chunkCount++;

        if (chunk.choices[0]?.delta?.content) {
          const streamChunk: AIStreamChunk = {
            id: chunk.id || `chunk-${chunkCount}`,
            delta: chunk.choices[0].delta.content,
            isComplete: false,
            metadata: {
              model: this.config.model,
              provider: this.name
            }
          };

          yield streamChunk;
        }

        // Handle function calls in streaming
        if (chunk.choices[0]?.delta?.tool_calls) {
          const toolCall = chunk.choices[0].delta.tool_calls[0];
          if (toolCall.function) {
            if (!functionCallData[toolCall.index]) {
              functionCallData[toolCall.index] = {
                name: '',
                arguments: ''
              };
            }

            if (toolCall.function.name) {
              functionCallData[toolCall.index].name += toolCall.function.name;
            }
            if (toolCall.function.arguments) {
              functionCallData[toolCall.index].arguments += toolCall.function.arguments;
            }
          }
        }

        if (chunk.choices[0]?.finish_reason) {
          const finalChunk: AIStreamChunk = {
            id: chunk.id || `chunk-final`,
            delta: '',
            isComplete: true,
            metadata: {
              model: this.config.model,
              provider: this.name,
              tokensUsed: totalTokens,
              responseTime: performance.now() - startTime,
              finishReason: this.mapFinishReason(chunk.choices[0].finish_reason)
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

  private prepareMessages(prompt: string, options: GenerationOptions): OpenAIMessage[] {
    const messages: OpenAIMessage[] = [];

    // Add system message if provided
    if (options.systemPrompt) {
      messages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }

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

  private prepareFunctions(functions: AIFunction[]): any[] {
    return functions.map(func => ({
      type: 'function',
      function: {
        name: func.name,
        description: func.description,
        parameters: this.zodToJsonSchema(func.parameters)
      }
    }));
  }

  private zodToJsonSchema(schema: z.ZodSchema<any>): any {
    // Simple Zod to JSON Schema conversion
    // In production, use a proper conversion library like zod-to-json-schema
    try {
      const description = schema._def.description || '';

      if (schema instanceof z.ZodObject) {
        const shape = schema._def.shape();
        const properties: any = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          if (value instanceof z.ZodString) {
            properties[key] = { type: 'string' };
          } else if (value instanceof z.ZodNumber) {
            properties[key] = { type: 'number' };
          } else if (value instanceof z.ZodBoolean) {
            properties[key] = { type: 'boolean' };
          } else if (value instanceof z.ZodArray) {
            properties[key] = { type: 'array', items: { type: 'string' } };
          } else {
            properties[key] = { type: 'string' }; // Default fallback
          }

          if (!(value instanceof z.ZodOptional)) {
            required.push(key);
          }
        }

        return {
          type: 'object',
          properties,
          required,
          description
        };
      }

      return { type: 'string', description };
    } catch (error) {
      this.logger.warn('Failed to convert Zod schema to JSON Schema', { error });
      return { type: 'string' };
    }
  }

  private validateGenerationOptions(options: GenerationOptions): void {
    const schema = z.object({
      maxTokens: z.number().min(1).max(4096).optional(),
      temperature: z.number().min(0).max(2).optional(),
      topP: z.number().min(0).max(1).optional(),
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

  private transformResponse(response: OpenAIResponse, responseTime: number): AIResponse {
    const choice = response.choices[0];
    const content = choice.message.content || '';

    // Handle function calls
    const functionCalls: FunctionCall[] = [];
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type === 'function') {
          functionCalls.push({
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments || '{}')
          });
        }
      }
    }

    return {
      id: response.id,
      content,
      metadata: {
        model: response.model,
        provider: this.name,
        tokensUsed: response.usage.total_tokens,
        responseTime,
        finishReason: this.mapFinishReason(choice.finish_reason),
        confidence: this.calculateConfidence(content, choice.finish_reason)
      },
      functionCalls: functionCalls.length > 0 ? functionCalls : undefined
    };
  }

  private mapFinishReason(finishReason: string | null): AIResponse['metadata']['finishReason'] {
    switch (finishReason) {
      case 'stop':
        return 'completed';
      case 'length':
        return 'length';
      case 'function_call':
      case 'tool_calls':
        return 'function_call';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'completed';
    }
  }

  private calculateConfidence(content: string, finishReason: string | null): number {
    // Simple confidence calculation based on content quality and completion
    let confidence = 0.8; // Base confidence

    if (finishReason === 'stop') confidence += 0.1;
    if (content.length > 50) confidence += 0.05;
    if (content.includes('I\'m not sure') || content.includes('I don\'t know')) confidence -= 0.2;
    if (content.includes('However') || content.includes('Therefore')) confidence += 0.05;

    return Math.max(0, Math.min(1, confidence));
  }

  private handleError(error: any): AIError {
    this.logger.error('OpenAI API error', { error });

    // Handle OpenAI-specific errors
    if (error?.status === 429) {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded. Please try again later.',
        type: 'rate_limit',
        retryable: true,
        retryAfter: this.extractRetryAfter(error) || 60
      };
    }

    if (error?.status === 401) {
      return {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid API key or authentication failed.',
        type: 'authentication',
        retryable: false
      };
    }

    if (error?.status === 400) {
      return {
        code: 'INVALID_REQUEST',
        message: error.message || 'Invalid request parameters.',
        type: 'invalid_request',
        retryable: false
      };
    }

    if (error?.status >= 500) {
      return {
        code: 'SERVER_ERROR',
        message: 'Server error. Please try again.',
        type: 'server_error',
        retryable: true,
        retryAfter: 30
      };
    }

    if (error?.code === 'ENOTFOUND' || error?.code === 'ECONNREFUSED') {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network connection failed.',
        type: 'server_error',
        retryable: true,
        retryAfter: 10
      };
    }

    if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') {
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
      message: error?.message || 'An unknown error occurred.',
      type: 'server_error',
      retryable: false
    };
  }

  private extractRetryAfter(error: any): number | undefined {
    // Extract retry-after header if available
    const retryAfter = error?.response?.headers?.['retry-after'];
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
    this.logger.info('Disposing OpenAI provider');
    // Cleanup resources if needed
  }
}