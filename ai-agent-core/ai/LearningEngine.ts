// AETERNA Learning Engine
// Production-level learning system with typed memory integration and pattern recognition

import { z } from 'zod';
import {
  LearningEvent,
  Memory,
  LearningPattern,
  AdaptationSuggestion,
  UserProfile,
  ConversationContext,
  MemoryMetadata,
  MemorySchema
} from './types/index.js';
import { Logger } from './utils/Logger.js';
import { mcp__claude_flow__memory_usage } from '@anthropic-claude/mcp';

export interface LearningEngineConfig {
  enableContinuousLearning: boolean;
  memoryRetentionDays: number;
  learningRate: number; // 0-1
  patternDetectionThreshold: number; // 0-1
  maxMemoriesPerUser: number;
  enableAutoAdaptation: boolean;
  confidenceThreshold: number; // 0-1
  debugMode: boolean;
}

export interface LearningEngineMetrics {
  totalLearningEvents: number;
  memoriesStored: number;
  patternsDetected: number;
  adaptationSuggestions: number;
  averageConfidence: number;
  learningAccuracy: number;
  lastLearningEvent: Date;
  memoryRetention: number;
}

export class LearningEngine {
  private config: LearningEngineConfig;
  private logger: Logger;
  private metrics: LearningEngineMetrics;
  private activePatterns: Map<string, LearningPattern> = new Map();
  private recentEvents: LearningEvent[] = [];

  constructor(config: LearningEngineConfig) {
    this.config = {
      enableContinuousLearning: config.enableContinuousLearning !== false,
      memoryRetentionDays: config.memoryRetentionDays || 365,
      learningRate: config.learningRate || 0.1,
      patternDetectionThreshold: config.patternDetectionThreshold || 0.7,
      maxMemoriesPerUser: config.maxMemoriesPerUser || 1000,
      enableAutoAdaptation: config.enableAutoAdaptation !== false,
      confidenceThreshold: config.confidenceThreshold || 0.8,
      debugMode: config.debugMode || false
    };

    this.logger = new Logger('LearningEngine', {
      logLevel: config.debugMode ? 'debug' : 'info'
    });

    this.metrics = {
      totalLearningEvents: 0,
      memoriesStored: 0,
      patternsDetected: 0,
      adaptationSuggestions: 0,
      averageConfidence: 0,
      learningAccuracy: 0,
      lastLearningEvent: new Date(),
      memoryRetention: 1.0
    };

    this.logger.info('Learning Engine initialized', { config: this.config });
  }

  public async processLearningEvent(
    event: Omit<LearningEvent, 'id' | 'timestamp'>,
    context?: ConversationContext
  ): Promise<{
    memoriesCreated: Memory[];
    patternsDetected: LearningPattern[];
    adaptationSuggestions: AdaptationSuggestion[];
  }> {
    if (!this.config.enableContinuousLearning) {
      return { memoriesCreated: [], patternsDetected: [], adaptationSuggestions: [] };
    }

    const startTime = performance.now();

    try {
      // Create full learning event
      const fullEvent: LearningEvent = {
        ...event,
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date()
      };

      this.logger.debug('Processing learning event', {
        eventId: fullEvent.id,
        type: fullEvent.type,
        userId: fullEvent.userId
      });

      // Store the event
      this.recentEvents.push(fullEvent);
      this.recentEvents = this.recentEvents.slice(-100); // Keep last 100 events

      // Extract and store memories
      const memories = await this.extractMemories(fullEvent, context);

      // Detect patterns
      const patterns = await this.detectPatterns(fullEvent, context);

      // Generate adaptation suggestions
      const suggestions = await this.generateAdaptationSuggestions(fullEvent, memories, patterns);

      // Update metrics
      this.updateLearningMetrics(fullEvent, memories, patterns, suggestions);

      const processingTime = performance.now() - startTime;

      this.logger.info('Learning event processed', {
        eventId: fullEvent.id,
        memoriesCreated: memories.length,
        patternsDetected: patterns.length,
        suggestions: suggestions.length,
        processingTime
      });

      return {
        memoriesCreated: memories,
        patternsDetected: patterns,
        adaptationSuggestions: suggestions
      };

    } catch (error) {
      this.logger.error('Failed to process learning event', { error, event });
      return { memoriesCreated: [], patternsDetected: [], adaptationSuggestions: [] };
    }
  }

  private async extractMemories(
    event: LearningEvent,
    context?: ConversationContext
  ): Promise<Memory[]> {
    const memories: Memory[] = [];

    try {
      switch (event.type) {
        case 'interaction':
          memories.push(...await this.extractInteractionMemories(event, context));
          break;

        case 'feedback':
          memories.push(...await this.extractFeedbackMemories(event));
          break;

        case 'correction':
          memories.push(...await this.extractCorrectionMemories(event));
          break;

        case 'preference':
          memories.push(...await this.extractPreferenceMemories(event));
          break;

        case 'success':
          memories.push(...await this.extractSuccessMemories(event));
          break;

        case 'failure':
          memories.push(...await this.extractFailureMemories(event));
          break;
      }

      // Store memories
      for (const memory of memories) {
        await this.storeMemory(memory);
      }

      return memories;

    } catch (error) {
      this.logger.warn('Failed to extract memories', { error, eventId: event.id });
      return [];
    }
  }

  private async extractInteractionMemories(
    event: LearningEvent,
    context?: ConversationContext
  ): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (typeof event.content === 'string') {
      // Extract factual information
      const facts = this.extractFacts(event.content);
      for (const fact of facts) {
        memories.push(this.createMemory('fact', fact, event.userId, 0.6));
      }

      // Extract user preferences from interaction
      const preferences = this.extractPreferencesFromText(event.content);
      for (const pref of preferences) {
        memories.push(this.createMemory('preference', pref, event.userId, 0.7));
      }
    }

    // Extract relationship memories if context available
    if (context) {
      const relationships = this.extractRelationships(context, event);
      for (const rel of relationships) {
        memories.push(this.createMemory('relationship', rel, event.userId, 0.5));
      }
    }

    return memories;
  }

  private async extractFeedbackMemories(event: LearningEvent): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (event.content && typeof event.content === 'object') {
      const feedback = event.content as any;

      // Store feedback as preference memory
      if (feedback.rating !== undefined) {
        memories.push(this.createMemory(
          'preference',
          `Rating: ${feedback.rating}/5 - ${feedback.comment || 'No comment'}`,
          event.userId,
          Math.min(1, feedback.rating / 5)
        ));
      }

      // Extract specific preferences from feedback
      if (feedback.specificFeedback) {
        const prefs = this.extractPreferencesFromText(feedback.specificFeedback);
        for (const pref of prefs) {
          memories.push(this.createMemory('preference', pref, event.userId, 0.8));
        }
      }
    }

    return memories;
  }

  private async extractCorrectionMemories(event: LearningEvent): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (event.content && typeof event.content === 'object') {
      const correction = event.content as any;

      // Store the correction as a high-importance fact
      memories.push(this.createMemory(
        'fact',
        `Correction: ${correction.incorrect} -> ${correction.correct}`,
        event.userId,
        0.9
      ));

      // Store the context of the correction
      if (correction.context) {
        memories.push(this.createMemory(
          'experience',
          `Context for correction: ${correction.context}`,
          event.userId,
          0.7
        ));
      }
    }

    return memories;
  }

  private async extractPreferenceMemories(event: LearningEvent): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (event.content) {
      const prefText = typeof event.content === 'string' ? event.content : JSON.stringify(event.content);
      memories.push(this.createMemory('preference', prefText, event.userId, 0.8));
    }

    return memories;
  }

  private async extractSuccessMemories(event: LearningEvent): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (event.content && typeof event.content === 'object') {
      const success = event.content as any;

      // Store successful approach
      memories.push(this.createMemory(
        'experience',
        `Success: ${success.approach} led to ${success.outcome}`,
        event.userId,
        0.8
      ));

      // Store successful patterns
      if (success.patterns) {
        for (const pattern of success.patterns) {
          memories.push(this.createMemory('pattern', pattern, event.userId, 0.7));
        }
      }
    }

    return memories;
  }

  private async extractFailureMemories(event: LearningEvent): Promise<Memory[]> {
    const memories: Memory[] = [];

    if (event.content && typeof event.content === 'object') {
      const failure = event.content as any;

      // Store failure to avoid repeating
      memories.push(this.createMemory(
        'experience',
        `Failure: ${failure.approach} led to ${failure.outcome}`,
        event.userId,
        0.9
      ));

      // Store lessons learned
      if (failure.lessonsLearned) {
        for (const lesson of failure.lessonsLearned) {
          memories.push(this.createMemory('fact', lesson, event.userId, 0.8));
        }
      }
    }

    return memories;
  }

  private extractFacts(text: string): string[] {
    const facts: string[] = [];

    // Extract definitions (simple pattern matching)
    const definitions = text.match(/(.+) is (.+?)(?:\.|$)/g);
    if (definitions) {
      facts.push(...definitions.slice(0, 3)); // Limit to avoid spam
    }

    // Extract statements with high confidence indicators
    const confident = text.match(/(definitely|certainly|always|never) (.+?)(?:\.|$)/gi);
    if (confident) {
      facts.push(...confident.slice(0, 2));
    }

    // Extract numeric facts
    const numeric = text.match(/(.+) (?:is|are|costs?|weighs?|measures?) (\d+(?:\.\d+)?(?:%|kg|m|USD|EUR)?)/g);
    if (numeric) {
      facts.push(...numeric.slice(0, 2));
    }

    return facts.filter(fact => fact.length > 10 && fact.length < 200);
  }

  private extractPreferencesFromText(text: string): string[] {
    const preferences: string[] = [];

    // Extract explicit preferences
    const explicit = text.match(/i (?:prefer|like|want|need|hate|dislike) (.+?)(?:\.|$|,)/gi);
    if (explicit) {
      preferences.push(...explicit.slice(0, 3));
    }

    // Extract implicit preferences from emotional language
    if (/\b(love|adore|fantastic|amazing|perfect)\b/i.test(text)) {
      preferences.push(`User expresses strong positive sentiment: ${text.slice(0, 100)}`);
    }

    if (/\b(hate|terrible|awful|annoying|frustrating)\b/i.test(text)) {
      preferences.push(`User expresses strong negative sentiment: ${text.slice(0, 100)}`);
    }

    return preferences.filter(pref => pref.length > 10);
  }

  private extractRelationships(context: ConversationContext, event: LearningEvent): string[] {
    const relationships: string[] = [];

    // Extract mentioned people, tools, technologies
    const mentions = context.messages.map(msg => msg.content).join(' ').match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g);

    if (mentions) {
      const uniqueMentions = [...new Set(mentions)].slice(0, 5);
      relationships.push(...uniqueMentions.map(mention => `User interacts with: ${mention}`));
    }

    return relationships;
  }

  private createMemory(
    type: Memory['type'],
    content: string,
    userId?: string,
    strength: number = 0.5
  ): Memory {
    const now = new Date();

    return {
      id: `mem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content: content.slice(0, 500), // Limit content length
      userId,
      strength,
      lastAccessed: now,
      accessCount: 1,
      associations: [],
      metadata: {
        source: 'learning_engine',
        confidence: strength,
        verified: false,
        category: this.categorizeMemory(content),
        keywords: this.extractKeywords(content),
        emotionalValence: this.calculateEmotionalValence(content)
      }
    };
  }

  private categorizeMemory(content: string): string {
    const categories = {
      'technology': /\b(code|programming|api|database|server|software|app|web|mobile)\b/i,
      'preference': /\b(prefer|like|want|need|style|format|way)\b/i,
      'factual': /\b(is|are|was|were|definition|means|equals)\b/i,
      'emotional': /\b(feel|emotion|mood|happy|sad|angry|excited)\b/i,
      'behavioral': /\b(always|usually|often|sometimes|never|tends to)\b/i
    };

    for (const [category, pattern] of Object.entries(categories)) {
      if (pattern.test(content)) {
        return category;
      }
    }

    return 'general';
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - in production, use proper NLP
    const words = content.toLowerCase().split(/\s+/);
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);

    return words
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 5);
  }

  private calculateEmotionalValence(content: string): number {
    const positive = ['good', 'great', 'excellent', 'amazing', 'perfect', 'love', 'like', 'happy', 'excited'];
    const negative = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'sad', 'angry', 'frustrated', 'disappointed'];

    const words = content.toLowerCase().split(/\s+/);
    let score = 0;

    words.forEach(word => {
      if (positive.includes(word)) score += 1;
      if (negative.includes(word)) score -= 1;
    });

    return Math.max(-1, Math.min(1, score / Math.max(1, words.length * 0.1)));
  }

  private async storeMemory(memory: Memory): Promise<void> {
    try {
      // Validate memory
      const result = MemorySchema.safeParse(memory);
      if (!result.success) {
        this.logger.warn('Invalid memory structure', { error: result.error.message, memoryId: memory.id });
        return;
      }

      // Store in memory system
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: memory.id,
        value: JSON.stringify(memory),
        namespace: memory.userId ? `user_${memory.userId}_memories` : 'global_memories'
      });

      this.metrics.memoriesStored++;

      this.logger.debug('Memory stored', {
        memoryId: memory.id,
        type: memory.type,
        userId: memory.userId
      });

    } catch (error) {
      this.logger.warn('Failed to store memory', { error, memoryId: memory.id });
    }
  }

  private async detectPatterns(
    event: LearningEvent,
    context?: ConversationContext
  ): Promise<LearningPattern[]> {
    const patterns: LearningPattern[] = [];

    try {
      // Detect temporal patterns
      const temporalPatterns = this.detectTemporalPatterns(event);
      patterns.push(...temporalPatterns);

      // Detect behavioral patterns
      const behavioralPatterns = this.detectBehavioralPatterns(event);
      patterns.push(...behavioralPatterns);

      // Detect content patterns
      const contentPatterns = this.detectContentPatterns(event, context);
      patterns.push(...contentPatterns);

      // Update active patterns
      for (const pattern of patterns) {
        if (pattern.confidence >= this.config.patternDetectionThreshold) {
          this.activePatterns.set(pattern.id, pattern);
          this.metrics.patternsDetected++;
        }
      }

      this.logger.debug('Patterns detected', {
        eventId: event.id,
        patternsCount: patterns.length
      });

      return patterns;

    } catch (error) {
      this.logger.warn('Pattern detection failed', { error, eventId: event.id });
      return [];
    }
  }

  private detectTemporalPatterns(event: LearningEvent): LearningPattern[] {
    // Analyze timing patterns in recent events
    const patterns: LearningPattern[] = [];
    const recentUserEvents = this.recentEvents.filter(e => e.userId === event.userId);

    if (recentUserEvents.length > 5) {
      // Check for time-based patterns
      const hours = recentUserEvents.map(e => e.timestamp.getHours());
      const mostCommonHour = this.findMostCommon(hours);

      if (mostCommonHour !== null) {
        patterns.push({
          id: `temporal_${event.userId}_${mostCommonHour}`,
          pattern: `User typically active around ${mostCommonHour}:00`,
          frequency: hours.filter(h => h === mostCommonHour).length / hours.length,
          contexts: [`hour_${mostCommonHour}`],
          outcomes: ['increased_engagement'],
          confidence: Math.min(0.9, hours.filter(h => h === mostCommonHour).length / hours.length),
          lastObserved: new Date()
        });
      }
    }

    return patterns;
  }

  private detectBehavioralPatterns(event: LearningEvent): LearningPattern[] {
    const patterns: LearningPattern[] = [];
    const userEvents = this.recentEvents.filter(e => e.userId === event.userId);

    if (userEvents.length > 3) {
      // Detect feedback patterns
      const feedbackEvents = userEvents.filter(e => e.type === 'feedback');
      if (feedbackEvents.length >= 2) {
        const ratings = feedbackEvents
          .map(e => (e.content as any)?.rating)
          .filter(r => r !== undefined);

        if (ratings.length >= 2) {
          const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
          const pattern = avgRating > 4 ? 'high_satisfaction' : avgRating < 3 ? 'low_satisfaction' : 'moderate_satisfaction';

          patterns.push({
            id: `behavior_${event.userId}_feedback`,
            pattern: `User shows ${pattern} pattern`,
            frequency: ratings.length / userEvents.length,
            contexts: ['feedback', 'user_satisfaction'],
            outcomes: [pattern],
            confidence: Math.min(0.8, ratings.length / 5),
            lastObserved: new Date()
          });
        }
      }

      // Detect interaction patterns
      const interactionTypes = userEvents.map(e => e.type);
      const typeFrequency = this.calculateFrequency(interactionTypes);

      for (const [type, freq] of Object.entries(typeFrequency)) {
        if (freq > 0.3) {
          patterns.push({
            id: `behavior_${event.userId}_${type}`,
            pattern: `User frequently engages in ${type} interactions`,
            frequency: freq,
            contexts: [type],
            outcomes: ['consistent_engagement'],
            confidence: Math.min(0.8, freq),
            lastObserved: new Date()
          });
        }
      }
    }

    return patterns;
  }

  private detectContentPatterns(event: LearningEvent, context?: ConversationContext): LearningPattern[] {
    const patterns: LearningPattern[] = [];

    if (context && event.content) {
      const allMessages = context.messages.map(m => m.content).join(' ');
      const topics = this.extractTopics(allMessages);

      // Detect topic preferences
      for (const topic of topics) {
        if (topic.frequency > 0.2) {
          patterns.push({
            id: `content_${event.userId}_${topic.name}`,
            pattern: `User frequently discusses ${topic.name}`,
            frequency: topic.frequency,
            contexts: ['topic_preference', topic.name],
            outcomes: ['engaged_discussion'],
            confidence: Math.min(0.8, topic.frequency),
            lastObserved: new Date()
          });
        }
      }
    }

    return patterns;
  }

  private findMostCommon<T>(array: T[]): T | null {
    if (array.length === 0) return null;

    const frequency: Record<string, number> = {};
    array.forEach(item => {
      const key = String(item);
      frequency[key] = (frequency[key] || 0) + 1;
    });

    const mostCommon = Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)[0];

    return mostCommon ? array.find(item => String(item) === mostCommon[0]) || null : null;
  }

  private calculateFrequency(array: string[]): Record<string, number> {
    const frequency: Record<string, number> = {};
    array.forEach(item => {
      frequency[item] = (frequency[item] || 0) + 1;
    });

    const total = array.length;
    for (const key in frequency) {
      frequency[key] = frequency[key] / total;
    }

    return frequency;
  }

  private extractTopics(text: string): Array<{ name: string; frequency: number }> {
    // Simple topic extraction - in production, use proper topic modeling
    const topicKeywords = {
      'technology': ['code', 'programming', 'software', 'app', 'api', 'database'],
      'learning': ['learn', 'study', 'understand', 'explain', 'teach', 'tutorial'],
      'problem_solving': ['problem', 'issue', 'solve', 'fix', 'debug', 'error'],
      'creativity': ['create', 'design', 'build', 'make', 'art', 'creative'],
      'data': ['data', 'analysis', 'statistics', 'metrics', 'analytics', 'visualization']
    };

    const words = text.toLowerCase().split(/\s+/);
    const topics: Array<{ name: string; frequency: number }> = [];

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matchCount = words.filter(word => keywords.includes(word)).length;
      const frequency = matchCount / words.length;

      if (frequency > 0.005) { // At least 0.5% of words
        topics.push({ name: topic, frequency });
      }
    }

    return topics.sort((a, b) => b.frequency - a.frequency);
  }

  private async generateAdaptationSuggestions(
    event: LearningEvent,
    memories: Memory[],
    patterns: LearningPattern[]
  ): Promise<AdaptationSuggestion[]> {
    const suggestions: AdaptationSuggestion[] = [];

    try {
      // Generate suggestions based on patterns
      for (const pattern of patterns) {
        if (pattern.confidence >= this.config.confidenceThreshold) {
          const suggestion = this.createAdaptationSuggestion(pattern, event);
          if (suggestion) {
            suggestions.push(suggestion);
          }
        }
      }

      // Generate suggestions based on memories
      const recentMemories = memories.filter(m => m.strength > 0.7);
      for (const memory of recentMemories) {
        const suggestion = this.createMemoryBasedSuggestion(memory, event);
        if (suggestion) {
          suggestions.push(suggestion);
        }
      }

      this.metrics.adaptationSuggestions += suggestions.length;

      return suggestions;

    } catch (error) {
      this.logger.warn('Failed to generate adaptation suggestions', { error, eventId: event.id });
      return [];
    }
  }

  private createAdaptationSuggestion(
    pattern: LearningPattern,
    event: LearningEvent
  ): AdaptationSuggestion | null {
    if (pattern.pattern.includes('high_satisfaction')) {
      return {
        type: 'behavior',
        suggestion: 'Maintain current communication style - user shows high satisfaction',
        evidence: [pattern.pattern],
        confidence: pattern.confidence,
        impact: 'medium',
        implementation: 'immediate'
      };
    }

    if (pattern.pattern.includes('low_satisfaction')) {
      return {
        type: 'personality',
        suggestion: 'Increase empathy and adjust communication style',
        evidence: [pattern.pattern],
        confidence: pattern.confidence,
        impact: 'high',
        implementation: 'gradual'
      };
    }

    if (pattern.pattern.includes('frequently discusses')) {
      const topic = pattern.contexts.find(c => c !== 'topic_preference');
      return {
        type: 'knowledge',
        suggestion: `Enhance knowledge in ${topic} area based on user interest`,
        evidence: [pattern.pattern],
        confidence: pattern.confidence,
        impact: 'medium',
        implementation: 'gradual'
      };
    }

    return null;
  }

  private createMemoryBasedSuggestion(
    memory: Memory,
    event: LearningEvent
  ): AdaptationSuggestion | null {
    if (memory.type === 'preference' && memory.strength > 0.8) {
      return {
        type: 'response_style',
        suggestion: `Adapt to user preference: ${memory.content.slice(0, 100)}`,
        evidence: [memory.content],
        confidence: memory.strength,
        impact: 'medium',
        implementation: 'immediate'
      };
    }

    if (memory.type === 'fact' && memory.metadata.emotionalValence < -0.5) {
      return {
        type: 'behavior',
        suggestion: 'Be more sensitive to negative experiences',
        evidence: [memory.content],
        confidence: memory.strength * 0.8,
        impact: 'low',
        implementation: 'immediate'
      };
    }

    return null;
  }

  private updateLearningMetrics(
    event: LearningEvent,
    memories: Memory[],
    patterns: LearningPattern[],
    suggestions: AdaptationSuggestion[]
  ): void {
    this.metrics.totalLearningEvents++;
    this.metrics.lastLearningEvent = new Date();

    // Update average confidence
    const allConfidences = [
      ...memories.map(m => m.strength),
      ...patterns.map(p => p.confidence),
      ...suggestions.map(s => s.confidence)
    ];

    if (allConfidences.length > 0) {
      const avgConfidence = allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length;
      this.metrics.averageConfidence =
        (this.metrics.averageConfidence * (this.metrics.totalLearningEvents - 1) + avgConfidence) /
        this.metrics.totalLearningEvents;
    }

    // Update learning accuracy (simplified - in production, track actual outcomes)
    if (event.verified) {
      this.metrics.learningAccuracy = Math.min(1, this.metrics.learningAccuracy + 0.01);
    }
  }

  // Public API methods

  public async retrieveMemories(
    userId: string,
    query?: string,
    type?: Memory['type'],
    limit: number = 10
  ): Promise<Memory[]> {
    try {
      let searchKey = query || 'all';
      if (type) searchKey += `_type_${type}`;

      const result = await mcp__claude_flow__memory_usage({
        action: 'search',
        key: searchKey,
        namespace: `user_${userId}_memories`
      });

      const memories = (result.memories || [])
        .map((m: any) => JSON.parse(m))
        .filter((m: Memory) => !type || m.type === type)
        .slice(0, limit);

      // Update access count and last accessed
      for (const memory of memories) {
        memory.accessCount++;
        memory.lastAccessed = new Date();
        await this.storeMemory(memory); // Update in storage
      }

      return memories;

    } catch (error) {
      this.logger.warn('Failed to retrieve memories', { error, userId, query });
      return [];
    }
  }

  public getActivePatterns(): LearningPattern[] {
    return Array.from(this.activePatterns.values());
  }

  public async generateLearningInsights(userId: string): Promise<{
    memoryStats: { total: number; byType: Record<string, number>; strongMemories: number };
    patterns: LearningPattern[];
    suggestions: AdaptationSuggestion[];
    learningTrends: string[];
  }> {
    try {
      const memories = await this.retrieveMemories(userId, undefined, undefined, 100);
      const userPatterns = this.getActivePatterns().filter(p => p.contexts.includes(`user_${userId}`));

      // Calculate memory stats
      const byType: Record<string, number> = {};
      memories.forEach(m => {
        byType[m.type] = (byType[m.type] || 0) + 1;
      });

      const strongMemories = memories.filter(m => m.strength > 0.7).length;

      // Generate learning trends
      const trends = this.analyzeLearningTrends(memories, userPatterns);

      // Generate current suggestions
      const suggestions = await this.generateCurrentSuggestions(memories, userPatterns);

      return {
        memoryStats: {
          total: memories.length,
          byType,
          strongMemories
        },
        patterns: userPatterns,
        suggestions,
        learningTrends: trends
      };

    } catch (error) {
      this.logger.error('Failed to generate learning insights', { error, userId });
      throw error;
    }
  }

  private analyzeLearningTrends(memories: Memory[], patterns: LearningPattern[]): string[] {
    const trends: string[] = [];

    // Analyze memory growth
    if (memories.length > 20) {
      trends.push('Strong memory accumulation - learning effectively');
    }

    // Analyze memory strength distribution
    const strongCount = memories.filter(m => m.strength > 0.7).length;
    const weakCount = memories.filter(m => m.strength < 0.4).length;

    if (strongCount > weakCount) {
      trends.push('High-quality memory formation - good retention');
    }

    // Analyze pattern evolution
    const recentPatterns = patterns.filter(p =>
      new Date().getTime() - p.lastObserved.getTime() < 7 * 24 * 60 * 60 * 1000 // Last week
    );

    if (recentPatterns.length > 2) {
      trends.push('Active pattern formation - adapting well to preferences');
    }

    return trends;
  }

  private async generateCurrentSuggestions(
    memories: Memory[],
    patterns: LearningPattern[]
  ): Promise<AdaptationSuggestion[]> {
    const suggestions: AdaptationSuggestion[] = [];

    // Suggestions based on memory analysis
    const preferenceMemories = memories.filter(m => m.type === 'preference' && m.strength > 0.6);
    if (preferenceMemories.length > 0) {
      suggestions.push({
        type: 'response_style',
        suggestion: 'Apply learned user preferences consistently',
        evidence: preferenceMemories.map(m => m.content.slice(0, 50)),
        confidence: 0.8,
        impact: 'medium',
        implementation: 'immediate'
      });
    }

    // Suggestions based on patterns
    const strongPatterns = patterns.filter(p => p.confidence > 0.8);
    if (strongPatterns.length > 0) {
      suggestions.push({
        type: 'behavior',
        suggestion: 'Continue reinforcing successful interaction patterns',
        evidence: strongPatterns.map(p => p.pattern),
        confidence: 0.8,
        impact: 'medium',
        implementation: 'gradual'
      });
    }

    return suggestions;
  }

  public getMetrics(): LearningEngineMetrics {
    return { ...this.metrics };
  }

  public async healthCheck(): Promise<{ status: string; memoriesStored: number; patternsActive: number; error?: string }> {
    try {
      return {
        status: 'healthy',
        memoriesStored: this.metrics.memoriesStored,
        patternsActive: this.activePatterns.size
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        memoriesStored: 0,
        patternsActive: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async dispose(): Promise<void> {
    this.activePatterns.clear();
    this.recentEvents = [];
    this.logger.info('Learning Engine disposed');
  }
}