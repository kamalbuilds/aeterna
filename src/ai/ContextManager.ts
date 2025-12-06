// AETERNA Context Manager
// Production-level conversation state management with typed memory integration

import { z } from 'zod';
import {
  ConversationContext,
  ConversationMessage,
  ConversationMetadata,
  SessionState,
  UserProfile,
  UserPreferences,
  EmotionDetection,
  IntentDetection
} from './types/index.js';
import { Logger } from './utils/Logger.js';
import { mcp__claude_flow__memory_usage } from '@anthropic-claude/mcp';

export interface ContextManagerConfig {
  maxConversationHistory: number;
  autoSummarization: boolean;
  summarizationThreshold: number;
  persistenceEnabled: boolean;
  contextExpirationHours: number;
  enableEmotionTracking: boolean;
  enableIntentDetection: boolean;
  debugMode: boolean;
}

export interface ContextManagerMetrics {
  activeConversations: number;
  totalContextSwitches: number;
  averageConversationLength: number;
  memoryUsage: number;
  summariesGenerated: number;
  lastCleanupTimestamp: Date;
}

export class ContextManager {
  private config: ContextManagerConfig;
  private activeContexts: Map<string, ConversationContext> = new Map();
  private contextCache: Map<string, { context: ConversationContext; lastAccess: Date }> = new Map();
  private logger: Logger;
  private metrics: ContextManagerMetrics;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: ContextManagerConfig) {
    this.config = {
      maxConversationHistory: config.maxConversationHistory || 100,
      autoSummarization: config.autoSummarization !== false,
      summarizationThreshold: config.summarizationThreshold || 50,
      persistenceEnabled: config.persistenceEnabled !== false,
      contextExpirationHours: config.contextExpirationHours || 24,
      enableEmotionTracking: config.enableEmotionTracking !== false,
      enableIntentDetection: config.enableIntentDetection !== false,
      debugMode: config.debugMode || false
    };

    this.logger = new Logger('ContextManager', {
      logLevel: config.debugMode ? 'debug' : 'info'
    });

    this.metrics = {
      activeConversations: 0,
      totalContextSwitches: 0,
      averageConversationLength: 0,
      memoryUsage: 0,
      summariesGenerated: 0,
      lastCleanupTimestamp: new Date()
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, 60 * 60 * 1000); // Every hour

    this.logger.info('Context Manager initialized', { config: this.config });
  }

  public async getOrCreateContext(
    conversationId: string,
    userId: string,
    userProfile?: UserProfile
  ): Promise<ConversationContext> {
    try {
      // Check active contexts first
      let context = this.activeContexts.get(conversationId);

      if (context) {
        this.logger.debug('Retrieved active context', { conversationId, userId });
        return context;
      }

      // Check cache
      const cached = this.contextCache.get(conversationId);
      if (cached) {
        this.activeContexts.set(conversationId, cached.context);
        cached.lastAccess = new Date();
        this.logger.debug('Retrieved cached context', { conversationId, userId });
        return cached.context;
      }

      // Try to load from persistent storage
      context = await this.loadContext(conversationId);

      if (context) {
        this.activeContexts.set(conversationId, context);
        this.logger.debug('Loaded context from storage', { conversationId, userId });
        return context;
      }

      // Create new context
      context = this.createNewContext(conversationId, userId, userProfile);
      this.activeContexts.set(conversationId, context);
      this.metrics.activeConversations++;

      this.logger.info('Created new context', { conversationId, userId });

      return context;

    } catch (error) {
      this.logger.error('Failed to get or create context', { error, conversationId, userId });
      throw error;
    }
  }

  private createNewContext(
    conversationId: string,
    userId: string,
    userProfile?: UserProfile
  ): ConversationContext {
    const now = new Date();

    return {
      id: conversationId,
      userId,
      messages: [],
      metadata: {
        sentiment: 'neutral',
        complexity: 'low',
        userSatisfaction: undefined,
        goalAchieved: false,
        followUpNeeded: false
      },
      state: {
        currentGoal: undefined,
        userPreferences: userProfile?.preferences || this.getDefaultPreferences(),
        contextVariables: {},
        activeMemories: [],
        mood: 'helpful'
      },
      tags: [],
      createdAt: now,
      updatedAt: now
    };
  }

  private getDefaultPreferences(): UserPreferences {
    return {
      communicationStyle: 'conversational',
      responseFormat: 'text',
      preferredLanguage: 'en',
      timezone: 'UTC',
      notificationSettings: {
        reminders: true,
        updates: true,
        insights: false,
        frequency: 'daily'
      }
    };
  }

  public async addMessage(
    conversationId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): Promise<ConversationMessage> {
    try {
      const context = this.activeContexts.get(conversationId);
      if (!context) {
        throw new Error(`Context not found: ${conversationId}`);
      }

      // Create message with metadata
      const fullMessage: ConversationMessage = {
        ...message,
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        metadata: {
          ...message.metadata,
          emotions: this.config.enableEmotionTracking ?
            await this.detectEmotions(message.content) : undefined,
          intent: this.config.enableIntentDetection ?
            await this.detectIntent(message.content) : undefined
        }
      };

      // Add to context
      context.messages.push(fullMessage);
      context.updatedAt = new Date();

      // Trim history if needed
      if (context.messages.length > this.config.maxConversationHistory) {
        await this.trimConversationHistory(context);
      }

      // Update metadata
      await this.updateConversationMetadata(context, fullMessage);

      // Auto-summarize if needed
      if (this.config.autoSummarization &&
          context.messages.length >= this.config.summarizationThreshold &&
          !context.summary) {
        await this.generateSummary(context);
      }

      // Persist if enabled
      if (this.config.persistenceEnabled) {
        await this.persistContext(context);
      }

      this.logger.debug('Message added to context', {
        conversationId,
        messageId: fullMessage.id,
        role: fullMessage.role
      });

      return fullMessage;

    } catch (error) {
      this.logger.error('Failed to add message', { error, conversationId });
      throw error;
    }
  }

  private async detectEmotions(content: string): Promise<EmotionDetection> {
    // Simplified emotion detection - in production, use proper NLP
    const emotionPatterns = {
      joy: /\b(happy|excited|great|awesome|love|fantastic|wonderful|amazing)\b/gi,
      sadness: /\b(sad|disappointed|down|upset|depressed|crying|hurt)\b/gi,
      anger: /\b(angry|furious|mad|annoyed|frustrated|irritated|outraged)\b/gi,
      fear: /\b(scared|afraid|worried|anxious|nervous|terrified|panic)\b/gi,
      surprise: /\b(surprised|shocked|amazed|unexpected|wow|incredible)\b/gi,
      disgust: /\b(disgusted|awful|terrible|horrible|gross|revolting)\b/gi
    };

    const matches: Array<{ emotion: keyof typeof emotionPatterns; count: number }> = [];

    for (const [emotion, pattern] of Object.entries(emotionPatterns)) {
      const emotionMatches = content.match(pattern);
      if (emotionMatches) {
        matches.push({ emotion: emotion as keyof typeof emotionPatterns, count: emotionMatches.length });
      }
    }

    if (matches.length === 0) {
      return {
        primary: 'neutral',
        intensity: 0.3,
        confidence: 0.6,
        indicators: []
      };
    }

    matches.sort((a, b) => b.count - a.count);
    const primary = matches[0];

    return {
      primary: primary.emotion as any,
      secondary: matches[1]?.emotion as any,
      intensity: Math.min(1, primary.count * 0.4),
      confidence: Math.min(1, primary.count * 0.3 + 0.4),
      indicators: [`${primary.count} ${primary.emotion} indicators`]
    };
  }

  private async detectIntent(content: string): Promise<IntentDetection> {
    // Simplified intent detection
    const intentPatterns = {
      question: /\?|^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)/i,
      request: /^(please|could you|would you|can you|help me|i need|i want|make|create)/i,
      instruction: /^(do|create|make|build|write|generate|show|explain|tell me|give me)/i,
      complaint: /^(this doesn't|this isn't|i can't|problem|issue|bug|error|not working)/i,
      compliment: /^(thank|thanks|great|good|excellent|perfect|love|appreciate)/i,
      information_seeking: /^(tell me about|what is|explain|describe|information)/i
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(content)) {
        return {
          primary: intent as any,
          confidence: 0.8,
          parameters: this.extractIntentParameters(content, intent),
          requiresClarification: content.length < 10
        };
      }
    }

    return {
      primary: 'information_seeking',
      confidence: 0.5,
      parameters: {},
      requiresClarification: true
    };
  }

  private extractIntentParameters(content: string, intent: string): Record<string, any> {
    const parameters: Record<string, any> = {};

    // Extract simple parameters based on intent
    switch (intent) {
      case 'question':
        parameters.questionType = content.startsWith('what') ? 'what' :
                                 content.startsWith('how') ? 'how' :
                                 content.startsWith('why') ? 'why' : 'general';
        break;

      case 'request':
        parameters.urgency = /urgent|asap|immediately/.test(content) ? 'high' : 'medium';
        break;

      case 'complaint':
        parameters.severity = /critical|serious|major/.test(content) ? 'high' : 'medium';
        break;
    }

    return parameters;
  }

  private async trimConversationHistory(context: ConversationContext): Promise<void> {
    const messagesToRemove = context.messages.length - this.config.maxConversationHistory;

    if (messagesToRemove > 0) {
      // Remove oldest messages but keep system messages
      const systemMessages = context.messages.filter(msg => msg.role === 'system');
      const otherMessages = context.messages.filter(msg => msg.role !== 'system');

      // Remove from other messages
      const remainingMessages = otherMessages.slice(messagesToRemove);
      context.messages = [...systemMessages, ...remainingMessages];

      this.logger.debug('Trimmed conversation history', {
        conversationId: context.id,
        removedMessages: messagesToRemove
      });
    }
  }

  private async updateConversationMetadata(
    context: ConversationContext,
    message: ConversationMessage
  ): Promise<void> {
    // Update complexity based on message content
    if (message.content.length > 500 || /\b(complex|complicated|algorithm|architecture|system)\b/i.test(message.content)) {
      context.metadata.complexity = 'high';
    } else if (message.content.length > 100) {
      context.metadata.complexity = 'medium';
    }

    // Update sentiment based on emotions
    if (message.metadata.emotions) {
      const emotion = message.metadata.emotions.primary;
      if (['joy', 'excitement'].includes(emotion)) {
        context.metadata.sentiment = 'positive';
      } else if (['sadness', 'anger', 'fear', 'disgust'].includes(emotion)) {
        context.metadata.sentiment = 'negative';
      }
    }

    // Extract and update tags
    const newTags = this.extractTags(message.content);
    context.tags = [...new Set([...context.tags, ...newTags])].slice(0, 10); // Limit tags

    // Update goal detection
    if (message.role === 'user' && !context.state.currentGoal) {
      const goal = this.detectGoal(message.content);
      if (goal) {
        context.state.currentGoal = goal;
      }
    }
  }

  private extractTags(content: string): string[] {
    const tags: string[] = [];

    // Technology tags
    const techTerms = content.match(/\b(javascript|python|react|nodejs|api|database|sql|cloud|aws|docker)\b/gi);
    if (techTerms) {
      tags.push(...techTerms.map(term => term.toLowerCase()));
    }

    // Topic tags
    if (/\b(help|question|problem)\b/i.test(content)) tags.push('help');
    if (/\b(bug|error|issue)\b/i.test(content)) tags.push('troubleshooting');
    if (/\b(learn|tutorial|explain)\b/i.test(content)) tags.push('learning');
    if (/\b(create|build|develop)\b/i.test(content)) tags.push('development');

    return [...new Set(tags)].slice(0, 5);
  }

  private detectGoal(content: string): string | undefined {
    const goalPatterns = [
      { pattern: /i want to (create|build|make) (.+)/i, template: 'Create $2' },
      { pattern: /help me (with|understand) (.+)/i, template: 'Get help with $2' },
      { pattern: /i need to (learn|understand) (.+)/i, template: 'Learn about $2' },
      { pattern: /how (do i|can i) (.+)/i, template: 'Learn how to $2' }
    ];

    for (const { pattern, template } of goalPatterns) {
      const match = content.match(pattern);
      if (match) {
        return template.replace('$2', match[2]?.trim() || 'something');
      }
    }

    return undefined;
  }

  private async generateSummary(context: ConversationContext): Promise<void> {
    try {
      // Simple summarization - in production, use proper summarization
      const recentMessages = context.messages.slice(-10);
      const topics = new Set<string>();
      const keyPoints: string[] = [];

      recentMessages.forEach(msg => {
        // Extract topics
        const words = msg.content.toLowerCase().split(/\s+/);
        words.forEach(word => {
          if (word.length > 5 && !['should', 'would', 'could', 'might'].includes(word)) {
            topics.add(word);
          }
        });

        // Extract key points (questions, conclusions, decisions)
        if (msg.content.includes('?')) {
          keyPoints.push(`Question: ${msg.content.slice(0, 100)}...`);
        }
        if (/\b(decided|concluded|solution|answer)\b/i.test(msg.content)) {
          keyPoints.push(`Key point: ${msg.content.slice(0, 100)}...`);
        }
      });

      context.summary = {
        topics: Array.from(topics).slice(0, 5).join(', '),
        keyPoints: keyPoints.slice(0, 3),
        messageCount: recentMessages.length,
        timespan: `${recentMessages[0]?.timestamp.toISOString()} to ${recentMessages[recentMessages.length - 1]?.timestamp.toISOString()}`
      };

      this.metrics.summariesGenerated++;

      this.logger.debug('Generated conversation summary', {
        conversationId: context.id,
        topics: context.summary.topics
      });

    } catch (error) {
      this.logger.warn('Failed to generate summary', { error, conversationId: context.id });
    }
  }

  public async updateSessionState(
    conversationId: string,
    stateUpdates: Partial<SessionState>
  ): Promise<void> {
    const context = this.activeContexts.get(conversationId);
    if (!context) {
      throw new Error(`Context not found: ${conversationId}`);
    }

    context.state = { ...context.state, ...stateUpdates };
    context.updatedAt = new Date();

    if (this.config.persistenceEnabled) {
      await this.persistContext(context);
    }

    this.logger.debug('Session state updated', { conversationId, updates: Object.keys(stateUpdates) });
  }

  public async getRelevantMemories(
    conversationId: string,
    query: string,
    limit: number = 5
  ): Promise<any[]> {
    try {
      const result = await mcp__claude_flow__memory_usage({
        action: 'search',
        key: query,
        namespace: `conversation_${conversationId}`
      });

      return (result.memories || []).slice(0, limit);

    } catch (error) {
      this.logger.debug('Failed to retrieve memories', { error, conversationId });
      return [];
    }
  }

  public async storeMemory(
    conversationId: string,
    key: string,
    value: any,
    importance: number = 0.5
  ): Promise<void> {
    try {
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: `${key}_${Date.now()}`,
        value: JSON.stringify({ data: value, importance, timestamp: new Date() }),
        namespace: `conversation_${conversationId}`
      });

      // Update context active memories
      const context = this.activeContexts.get(conversationId);
      if (context) {
        context.state.activeMemories.push(key);
        // Keep only recent memories active
        if (context.state.activeMemories.length > 10) {
          context.state.activeMemories = context.state.activeMemories.slice(-10);
        }
      }

    } catch (error) {
      this.logger.warn('Failed to store memory', { error, conversationId, key });
    }
  }

  private async loadContext(conversationId: string): Promise<ConversationContext | null> {
    try {
      const result = await mcp__claude_flow__memory_usage({
        action: 'retrieve',
        key: `context_${conversationId}`,
        namespace: 'conversations'
      });

      if (result.value) {
        const data = JSON.parse(result.value);
        return data as ConversationContext;
      }

      return null;

    } catch (error) {
      this.logger.debug('Failed to load context', { error, conversationId });
      return null;
    }
  }

  private async persistContext(context: ConversationContext): Promise<void> {
    try {
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: `context_${context.id}`,
        value: JSON.stringify(context),
        namespace: 'conversations'
      });

    } catch (error) {
      this.logger.warn('Failed to persist context', { error, conversationId: context.id });
    }
  }

  private performCleanup(): void {
    try {
      const now = new Date();
      const expirationMs = this.config.contextExpirationHours * 60 * 60 * 1000;

      // Clean expired contexts from cache
      for (const [id, cached] of this.contextCache.entries()) {
        if (now.getTime() - cached.lastAccess.getTime() > expirationMs) {
          this.contextCache.delete(id);
        }
      }

      // Move inactive contexts to cache
      for (const [id, context] of this.activeContexts.entries()) {
        if (now.getTime() - context.updatedAt.getTime() > 60 * 60 * 1000) { // 1 hour
          this.contextCache.set(id, { context, lastAccess: context.updatedAt });
          this.activeContexts.delete(id);
          this.metrics.activeConversations--;
        }
      }

      this.metrics.lastCleanupTimestamp = now;

      this.logger.debug('Performed context cleanup', {
        activeContexts: this.activeContexts.size,
        cachedContexts: this.contextCache.size
      });

    } catch (error) {
      this.logger.warn('Context cleanup failed', { error });
    }
  }

  // Public API methods

  public getActiveContexts(): string[] {
    return Array.from(this.activeContexts.keys());
  }

  public async switchContext(conversationId: string): Promise<ConversationContext> {
    this.metrics.totalContextSwitches++;
    return this.getOrCreateContext(conversationId, 'unknown'); // Would need userId in real implementation
  }

  public getMetrics(): ContextManagerMetrics {
    this.metrics.memoryUsage = process.memoryUsage().heapUsed;
    return { ...this.metrics };
  }

  public async healthCheck(): Promise<{ status: string; activeContexts: number; error?: string }> {
    try {
      return {
        status: 'healthy',
        activeContexts: this.activeContexts.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        activeContexts: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async dispose(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Persist all active contexts
    if (this.config.persistenceEnabled) {
      const persistPromises = Array.from(this.activeContexts.values()).map(context =>
        this.persistContext(context)
      );
      await Promise.allSettled(persistPromises);
    }

    this.activeContexts.clear();
    this.contextCache.clear();

    this.logger.info('Context Manager disposed');
  }
}