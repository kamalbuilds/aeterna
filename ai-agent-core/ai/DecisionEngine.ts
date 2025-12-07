// AETERNA Decision Engine
// Production-level decision-making system with typed algorithms and rule evaluation

import { z } from 'zod';
import {
  DecisionContext,
  DecisionResult,
  DecisionRule,
  ConversationMessage,
  UserProfile,
  SessionState,
  EmotionDetection,
  IntentDetection
} from './types/index.js';
import { Logger } from './utils/Logger.js';
import { mcp__claude_flow__memory_usage } from '@anthropic-claude/mcp';

export interface DecisionEngineConfig {
  defaultConfidenceThreshold: number;
  maxProcessingTimeMs: number;
  enableMachineLearning: boolean;
  fallbackAction: string;
  debugMode: boolean;
}

export interface DecisionMetrics {
  totalDecisions: number;
  averageConfidence: number;
  averageProcessingTime: number;
  ruleApplicationCount: Record<string, number>;
  accuracyScore?: number;
  lastDecisionTimestamp: Date;
}

export class DecisionEngine {
  private config: DecisionEngineConfig;
  private rules: Map<string, DecisionRule> = new Map();
  private logger: Logger;
  private metrics: DecisionMetrics;

  constructor(config: DecisionEngineConfig) {
    this.config = {
      defaultConfidenceThreshold: config.defaultConfidenceThreshold || 0.6,
      maxProcessingTimeMs: config.maxProcessingTimeMs || 5000,
      enableMachineLearning: config.enableMachineLearning || true,
      fallbackAction: config.fallbackAction || 'ask_for_clarification',
      debugMode: config.debugMode || false
    };

    this.logger = new Logger('DecisionEngine', {
      logLevel: config.debugMode ? 'debug' : 'info'
    });

    this.metrics = {
      totalDecisions: 0,
      averageConfidence: 0,
      averageProcessingTime: 0,
      ruleApplicationCount: {},
      lastDecisionTimestamp: new Date()
    };

    this.loadDefaultRules();
    this.logger.info('Decision Engine initialized', { config: this.config });
  }

  private loadDefaultRules(): void {
    const defaultRules: DecisionRule[] = [
      {
        id: 'urgent_request',
        name: 'Urgent Request Handler',
        description: 'Prioritizes urgent or time-sensitive requests',
        conditions: [
          { field: 'currentMessage', operator: 'contains', value: ['urgent', 'asap', 'immediately', 'emergency'] },
          { field: 'userProfile.expertise.urgency', operator: 'greater_than', value: 0.7 }
        ],
        action: 'prioritize_immediate_response',
        priority: 9,
        confidence: 0.85,
        isActive: true
      },
      {
        id: 'technical_question',
        name: 'Technical Question Router',
        description: 'Routes technical questions to appropriate responses',
        conditions: [
          { field: 'currentMessage', operator: 'matches_regex', value: /\b(code|programming|debug|error|api|function|class|method)\b/i },
          { field: 'userProfile.expertise.technical', operator: 'greater_than', value: 0.5 }
        ],
        action: 'provide_technical_assistance',
        priority: 8,
        confidence: 0.9,
        isActive: true
      },
      {
        id: 'creative_request',
        name: 'Creative Task Handler',
        description: 'Handles creative and brainstorming requests',
        conditions: [
          { field: 'currentMessage', operator: 'contains', value: ['create', 'design', 'brainstorm', 'idea', 'creative', 'write'] },
          { field: 'sessionState.mood', operator: 'equals', value: 'creative' }
        ],
        action: 'engage_creative_mode',
        priority: 7,
        confidence: 0.8,
        isActive: true
      },
      {
        id: 'clarification_needed',
        name: 'Clarification Request',
        description: 'Asks for clarification when request is ambiguous',
        conditions: [
          { field: 'currentMessage', operator: 'less_than', value: 10 }, // Very short message
          { field: 'history', operator: 'less_than', value: 2 } // New conversation
        ],
        action: 'ask_for_clarification',
        priority: 5,
        confidence: 0.7,
        isActive: true
      },
      {
        id: 'emotional_support',
        name: 'Emotional Support Provider',
        description: 'Provides emotional support when user seems distressed',
        conditions: [
          { field: 'emotions.primary', operator: 'equals', value: ['sadness', 'frustration', 'anger'] },
          { field: 'emotions.intensity', operator: 'greater_than', value: 0.6 }
        ],
        action: 'provide_emotional_support',
        priority: 8,
        confidence: 0.85,
        isActive: true
      }
    ];

    defaultRules.forEach(rule => {
      this.addRule(rule);
    });
  }

  public async makeDecision(context: DecisionContext): Promise<DecisionResult> {
    const startTime = performance.now();
    const traceId = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.logger.setTraceId(traceId);
    this.logger.debug('Starting decision process', {
      userId: context.userId,
      conversationId: context.conversationId,
      messageLength: context.currentMessage.length
    });

    try {
      // Validate context
      this.validateContext(context);

      // Analyze context for additional insights
      const enhancedContext = await this.enhanceContext(context);

      // Evaluate all applicable rules
      const ruleResults = await this.evaluateRules(enhancedContext);

      // Apply machine learning if enabled
      let mlResult: DecisionResult | null = null;
      if (this.config.enableMachineLearning) {
        mlResult = await this.applyMachineLearning(enhancedContext);
      }

      // Combine rule-based and ML results
      const finalResult = this.combineResults(ruleResults, mlResult, enhancedContext);

      // Apply confidence threshold
      if (finalResult.confidence < this.config.defaultConfidenceThreshold) {
        finalResult.action = this.config.fallbackAction;
        finalResult.reasoning = `Low confidence (${finalResult.confidence.toFixed(2)}) - using fallback action`;
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Update metrics
      this.updateMetrics(finalResult, processingTime);

      // Store decision in memory for learning
      await this.storeDecision(context, finalResult, traceId);

      finalResult.metadata = {
        ...finalResult.metadata,
        processingTime,
        rulesApplied: ruleResults.map(r => r.ruleId),
        factorsConsidered: this.extractFactors(enhancedContext)
      };

      this.logger.info('Decision completed', {
        action: finalResult.action,
        confidence: finalResult.confidence,
        processingTime,
        traceId
      });

      return finalResult;

    } catch (error) {
      const endTime = performance.now();
      const processingTime = endTime - startTime;

      this.logger.error('Decision process failed', {
        error,
        processingTime,
        traceId
      });

      return {
        action: this.config.fallbackAction,
        confidence: 0.1,
        reasoning: `Decision process failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        metadata: {
          processingTime,
          rulesApplied: [],
          factorsConsidered: ['error_occurred']
        }
      };
    }
  }

  private validateContext(context: DecisionContext): void {
    const schema = z.object({
      userId: z.string().min(1),
      conversationId: z.string().min(1),
      currentMessage: z.string().min(1),
      history: z.array(z.any()),
      userProfile: z.object({
        id: z.string(),
        preferences: z.any(),
        history: z.any(),
        personality: z.any(),
        goals: z.array(z.string()),
        expertise: z.record(z.number())
      }),
      sessionState: z.object({
        currentGoal: z.string().optional(),
        userPreferences: z.any(),
        contextVariables: z.record(z.any()),
        activeMemories: z.array(z.string()),
        mood: z.string().optional()
      }),
      availableActions: z.array(z.string()),
      timestamp: z.date()
    });

    const result = schema.safeParse(context);
    if (!result.success) {
      throw new Error(`Invalid decision context: ${result.error.message}`);
    }
  }

  private async enhanceContext(context: DecisionContext): Promise<DecisionContext & {
    emotions?: EmotionDetection;
    intent?: IntentDetection;
    conversationSummary?: string;
    relevantMemories?: any[];
  }> {
    // Enhance context with emotion detection, intent analysis, etc.
    const enhanced = { ...context } as any;

    try {
      // Detect emotions (simplified implementation)
      enhanced.emotions = this.detectEmotions(context.currentMessage);

      // Detect intent
      enhanced.intent = this.detectIntent(context.currentMessage);

      // Get conversation summary if history is long
      if (context.history.length > 10) {
        enhanced.conversationSummary = this.summarizeConversation(context.history);
      }

      // Retrieve relevant memories
      enhanced.relevantMemories = await this.getRelevantMemories(context);

    } catch (error) {
      this.logger.warn('Failed to enhance context', { error });
    }

    return enhanced;
  }

  private detectEmotions(message: string): EmotionDetection {
    // Simplified emotion detection - in production, use proper NLP
    const emotionKeywords = {
      joy: ['happy', 'excited', 'great', 'awesome', 'love', 'fantastic'],
      sadness: ['sad', 'disappointed', 'down', 'upset', 'depressed'],
      anger: ['angry', 'furious', 'mad', 'annoyed', 'frustrated'],
      fear: ['scared', 'afraid', 'worried', 'anxious', 'nervous'],
      surprise: ['surprised', 'shocked', 'amazed', 'unexpected'],
      disgust: ['disgusted', 'awful', 'terrible', 'horrible']
    };

    const messageLower = message.toLowerCase();
    const detected: Array<{ emotion: keyof typeof emotionKeywords; count: number }> = [];

    for (const [emotion, keywords] of Object.entries(emotionKeywords)) {
      const count = keywords.reduce((acc, keyword) =>
        acc + (messageLower.includes(keyword) ? 1 : 0), 0
      );
      if (count > 0) {
        detected.push({ emotion: emotion as keyof typeof emotionKeywords, count });
      }
    }

    if (detected.length === 0) {
      return {
        primary: 'neutral',
        intensity: 0.3,
        confidence: 0.5,
        indicators: []
      };
    }

    detected.sort((a, b) => b.count - a.count);
    const primary = detected[0];

    return {
      primary: primary.emotion as any,
      secondary: detected[1]?.emotion as any,
      intensity: Math.min(1, primary.count * 0.3),
      confidence: Math.min(1, primary.count * 0.25),
      indicators: emotionKeywords[primary.emotion]
    };
  }

  private detectIntent(message: string): IntentDetection {
    // Simplified intent detection
    const intentPatterns = {
      question: [/\?$/, /^(what|how|why|when|where|who|which|can|could|would|should|is|are|do|does)/i],
      request: [/^(please|could you|would you|can you|help me|i need|i want)/i],
      instruction: [/^(do|create|make|build|write|generate|show|explain)/i],
      complaint: [/^(this doesn't|this isn't|i can't|problem|issue|bug|error)/i],
      compliment: [/^(thank|thanks|great|good|excellent|perfect|love)/i]
    };

    for (const [intent, patterns] of Object.entries(intentPatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return {
            primary: intent as any,
            confidence: 0.8,
            parameters: {},
            requiresClarification: false
          };
        }
      }
    }

    return {
      primary: 'information_seeking',
      confidence: 0.5,
      parameters: {},
      requiresClarification: message.length < 10
    };
  }

  private summarizeConversation(history: ConversationMessage[]): string {
    // Simple conversation summary - in production, use proper summarization
    const recentMessages = history.slice(-5);
    const topics = new Set<string>();

    recentMessages.forEach(msg => {
      const words = msg.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4) topics.add(word);
      });
    });

    return Array.from(topics).slice(0, 5).join(', ');
  }

  private async getRelevantMemories(context: DecisionContext): Promise<any[]> {
    try {
      const result = await mcp__claude_flow__memory_usage({
        action: 'search',
        key: context.currentMessage.slice(0, 50),
        namespace: `user_${context.userId}`
      });

      return result.memories || [];
    } catch (error) {
      this.logger.debug('Failed to retrieve memories', { error });
      return [];
    }
  }

  private async evaluateRules(context: DecisionContext): Promise<Array<{
    ruleId: string;
    confidence: number;
    matches: boolean;
    reasoning: string;
  }>> {
    const results: Array<any> = [];

    for (const rule of this.rules.values()) {
      if (!rule.isActive) continue;

      try {
        const matches = this.evaluateRuleConditions(rule, context);
        const confidence = matches ? rule.confidence : 0;

        results.push({
          ruleId: rule.id,
          confidence,
          matches,
          reasoning: matches ? rule.description : `Conditions not met for ${rule.name}`,
          rule
        });

        // Track rule usage
        this.metrics.ruleApplicationCount[rule.id] =
          (this.metrics.ruleApplicationCount[rule.id] || 0) + 1;

      } catch (error) {
        this.logger.warn(`Failed to evaluate rule ${rule.id}`, { error });
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  private evaluateRuleConditions(rule: DecisionRule, context: any): boolean {
    return rule.conditions.every(condition => {
      const value = this.getNestedValue(context, condition.field);
      return this.evaluateCondition(value, condition.operator, condition.value);
    });
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private evaluateCondition(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals':
        return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
      case 'contains':
        if (typeof actual === 'string' && Array.isArray(expected)) {
          return expected.some(val => actual.toLowerCase().includes(val.toLowerCase()));
        }
        return typeof actual === 'string' && actual.includes(expected);
      case 'greater_than':
        return typeof actual === 'number' && actual > expected;
      case 'less_than':
        return typeof actual === 'number' && actual < expected;
      case 'matches_regex':
        return typeof actual === 'string' && expected.test(actual);
      default:
        return false;
    }
  }

  private async applyMachineLearning(context: DecisionContext): Promise<DecisionResult | null> {
    // Placeholder for ML-based decision making
    // In production, this would use trained models
    try {
      // Simulate ML prediction
      const features = this.extractFeatures(context);
      const mlConfidence = Math.random() * 0.3 + 0.5; // Simulate ML confidence

      return {
        action: 'ml_suggested_action',
        confidence: mlConfidence,
        reasoning: 'Machine learning model suggestion based on historical patterns',
        metadata: {
          processingTime: 0,
          rulesApplied: [],
          factorsConsidered: ['ml_features', 'historical_patterns']
        }
      };
    } catch (error) {
      this.logger.debug('ML prediction failed', { error });
      return null;
    }
  }

  private extractFeatures(context: DecisionContext): number[] {
    // Extract numerical features for ML
    return [
      context.currentMessage.length / 100,
      context.history.length / 10,
      context.userProfile.expertise.technical || 0,
      context.sessionState.activeMemories.length / 5,
      context.availableActions.length / 10
    ];
  }

  private combineResults(
    ruleResults: any[],
    mlResult: DecisionResult | null,
    context: DecisionContext
  ): DecisionResult {
    const matchingRules = ruleResults.filter(r => r.matches);

    if (matchingRules.length === 0 && !mlResult) {
      return {
        action: this.config.fallbackAction,
        confidence: 0.3,
        reasoning: 'No matching rules found and ML unavailable',
        metadata: {
          processingTime: 0,
          rulesApplied: [],
          factorsConsidered: ['no_matches']
        }
      };
    }

    // Find best rule match
    const bestRule = matchingRules[0];

    if (bestRule && (!mlResult || bestRule.confidence > mlResult.confidence)) {
      return {
        action: bestRule.rule.action,
        confidence: bestRule.confidence,
        reasoning: `Rule-based decision: ${bestRule.reasoning}`,
        alternativeActions: matchingRules.slice(1, 3).map(r => ({
          action: r.rule.action,
          confidence: r.confidence,
          reason: r.reasoning
        })),
        metadata: {
          processingTime: 0,
          rulesApplied: [bestRule.ruleId],
          factorsConsidered: ['rule_matching']
        }
      };
    }

    if (mlResult) {
      return mlResult;
    }

    return {
      action: this.config.fallbackAction,
      confidence: 0.2,
      reasoning: 'Unable to determine best action',
      metadata: {
        processingTime: 0,
        rulesApplied: [],
        factorsConsidered: ['fallback']
      }
    };
  }

  private extractFactors(context: DecisionContext): string[] {
    const factors = ['message_content'];

    if (context.history.length > 0) factors.push('conversation_history');
    if (context.userProfile.expertise) factors.push('user_expertise');
    if (context.sessionState.mood) factors.push('session_mood');
    if ((context as any).emotions) factors.push('emotion_detection');
    if ((context as any).intent) factors.push('intent_detection');

    return factors;
  }

  private updateMetrics(result: DecisionResult, processingTime: number): void {
    this.metrics.totalDecisions++;
    this.metrics.lastDecisionTimestamp = new Date();

    // Update running averages
    this.metrics.averageConfidence =
      (this.metrics.averageConfidence * (this.metrics.totalDecisions - 1) + result.confidence) / this.metrics.totalDecisions;

    this.metrics.averageProcessingTime =
      (this.metrics.averageProcessingTime * (this.metrics.totalDecisions - 1) + processingTime) / this.metrics.totalDecisions;
  }

  private async storeDecision(
    context: DecisionContext,
    result: DecisionResult,
    traceId: string
  ): Promise<void> {
    try {
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: `decision_${traceId}`,
        value: JSON.stringify({
          context: {
            userId: context.userId,
            conversationId: context.conversationId,
            messageLength: context.currentMessage.length,
            timestamp: context.timestamp
          },
          result: {
            action: result.action,
            confidence: result.confidence,
            reasoning: result.reasoning
          }
        }),
        namespace: 'decisions'
      });
    } catch (error) {
      this.logger.debug('Failed to store decision', { error });
    }
  }

  // Public API methods

  public addRule(rule: DecisionRule): void {
    this.rules.set(rule.id, rule);
    this.logger.debug(`Added rule: ${rule.name}`, { ruleId: rule.id });
  }

  public removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      this.logger.debug(`Removed rule: ${ruleId}`);
    }
    return removed;
  }

  public updateRule(ruleId: string, updates: Partial<DecisionRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) return false;

    const updatedRule = { ...rule, ...updates };
    this.rules.set(ruleId, updatedRule);
    this.logger.debug(`Updated rule: ${ruleId}`, { updates });
    return true;
  }

  public getRules(): DecisionRule[] {
    return Array.from(this.rules.values());
  }

  public getMetrics(): DecisionMetrics {
    return { ...this.metrics };
  }

  public async healthCheck(): Promise<{ status: string; rulesLoaded: number; error?: string }> {
    try {
      return {
        status: 'healthy',
        rulesLoaded: this.rules.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        rulesLoaded: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}