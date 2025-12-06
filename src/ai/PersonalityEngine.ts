// AETERNA Personality Engine
// Production-level personality system with typed evolution and adaptation

import { z } from 'zod';
import {
  PersonalityProfile,
  PersonalityTraits,
  PersonalityEvolution,
  CommunicationStyle,
  KnowledgeDomains,
  AdaptationSettings,
  ConversationContext,
  UserProfile,
  LearningEvent,
  PersonalityTraitsSchema
} from './types/index.js';
import { Logger } from './utils/Logger.js';
import { mcp__claude_flow__memory_usage } from '@anthropic-claude/mcp';

export interface PersonalityEngineConfig {
  enableAdaptation: boolean;
  adaptationSensitivity: number; // 0-1
  evolutionThreshold: number; // 0-1
  maxPersonalityVariations: number;
  persistenceEnabled: boolean;
  debugMode: boolean;
}

export interface PersonalityMetrics {
  totalAdaptations: number;
  evolutionEvents: number;
  averageUserSatisfaction: number;
  personalityStability: number;
  lastAdaptationTimestamp: Date;
  adaptationTriggers: Record<string, number>;
}

export class PersonalityEngine {
  private config: PersonalityEngineConfig;
  private currentProfile: PersonalityProfile;
  private baseProfile: PersonalityProfile;
  private personalityHistory: PersonalityEvolution[] = [];
  private logger: Logger;
  private metrics: PersonalityMetrics;

  constructor(config: PersonalityEngineConfig, initialProfile?: PersonalityProfile) {
    this.config = {
      enableAdaptation: config.enableAdaptation !== false,
      adaptationSensitivity: config.adaptationSensitivity || 0.3,
      evolutionThreshold: config.evolutionThreshold || 0.15,
      maxPersonalityVariations: config.maxPersonalityVariations || 10,
      persistenceEnabled: config.persistenceEnabled !== false,
      debugMode: config.debugMode || false
    };

    this.logger = new Logger('PersonalityEngine', {
      logLevel: config.debugMode ? 'debug' : 'info'
    });

    this.baseProfile = initialProfile || this.createDefaultProfile();
    this.currentProfile = this.cloneProfile(this.baseProfile);

    this.metrics = {
      totalAdaptations: 0,
      evolutionEvents: 0,
      averageUserSatisfaction: 0,
      personalityStability: 1.0,
      lastAdaptationTimestamp: new Date(),
      adaptationTriggers: {}
    };

    this.logger.info('Personality Engine initialized', {
      profileId: this.currentProfile.id,
      adaptationEnabled: this.config.enableAdaptation
    });
  }

  private createDefaultProfile(): PersonalityProfile {
    return {
      id: 'aeterna-default',
      name: 'AETERNA Base Personality',
      traits: {
        empathy: 0.8,
        humor: 0.6,
        formality: 0.4,
        curiosity: 0.9,
        assertiveness: 0.7,
        creativity: 0.8,
        analyticalThinking: 0.85,
        emotionalIntelligence: 0.75
      },
      communicationStyle: {
        responseLength: 'detailed',
        tonePreference: 'professional',
        useEmojis: false,
        askClarifyingQuestions: true,
        provideExamples: true,
        explainReasoning: true
      },
      knowledge: {
        technical: 0.95,
        creative: 0.8,
        analytical: 0.9,
        interpersonal: 0.75,
        domains: [
          'artificial_intelligence',
          'software_development',
          'machine_learning',
          'system_architecture',
          'data_analysis'
        ]
      },
      adaptationSettings: {
        learningRate: 0.1,
        adaptToUser: true,
        retainMemories: true,
        evolvePersonality: true,
        adaptationFrequency: 'weekly'
      },
      version: '1.0.0',
      lastUpdated: new Date()
    };
  }

  private cloneProfile(profile: PersonalityProfile): PersonalityProfile {
    return JSON.parse(JSON.stringify(profile));
  }

  public async adaptToInteraction(
    context: ConversationContext,
    userProfile: UserProfile,
    userFeedback?: {
      satisfaction: number; // 0-1
      specificFeedback?: string;
      preferredStyle?: Partial<CommunicationStyle>;
    }
  ): Promise<PersonalityEvolution | null> {
    if (!this.config.enableAdaptation) {
      return null;
    }

    const startTime = performance.now();
    this.logger.debug('Starting personality adaptation', {
      conversationId: context.id,
      userId: userProfile.id
    });

    try {
      // Analyze interaction for adaptation triggers
      const adaptationTriggers = this.analyzeAdaptationTriggers(context, userProfile, userFeedback);

      if (adaptationTriggers.length === 0) {
        this.logger.debug('No adaptation triggers found');
        return null;
      }

      // Calculate personality adjustments
      const proposedChanges = this.calculatePersonalityAdjustments(
        adaptationTriggers,
        context,
        userProfile
      );

      if (this.shouldApplyChanges(proposedChanges)) {
        const evolution = await this.evolvePersonality(proposedChanges, adaptationTriggers);

        // Update metrics
        this.updateAdaptationMetrics(evolution, userFeedback);

        // Persist changes if enabled
        if (this.config.persistenceEnabled) {
          await this.persistPersonality();
        }

        const endTime = performance.now();
        this.logger.info('Personality adaptation completed', {
          adaptationTime: endTime - startTime,
          changesApplied: proposedChanges.length,
          newVersion: this.currentProfile.version
        });

        return evolution;
      }

      return null;

    } catch (error) {
      this.logger.error('Personality adaptation failed', { error });
      return null;
    }
  }

  private analyzeAdaptationTriggers(
    context: ConversationContext,
    userProfile: UserProfile,
    userFeedback?: any
  ): Array<{
    trigger: string;
    strength: number;
    reason: string;
    data: any;
  }> {
    const triggers: Array<any> = [];

    // User satisfaction trigger
    if (userFeedback?.satisfaction !== undefined) {
      const satisfaction = userFeedback.satisfaction;
      if (satisfaction < 0.6) {
        triggers.push({
          trigger: 'low_satisfaction',
          strength: (0.6 - satisfaction) * 2, // 0-1
          reason: `User satisfaction below threshold: ${satisfaction}`,
          data: { satisfaction, feedback: userFeedback.specificFeedback }
        });
      }
    }

    // Communication style mismatch
    const styleMismatch = this.detectCommunicationMismatch(context, userProfile);
    if (styleMismatch.strength > 0.3) {
      triggers.push({
        trigger: 'communication_mismatch',
        strength: styleMismatch.strength,
        reason: styleMismatch.reason,
        data: styleMismatch.details
      });
    }

    // User expertise level adaptation
    const expertiseMismatch = this.detectExpertiseMismatch(context, userProfile);
    if (expertiseMismatch.strength > 0.3) {
      triggers.push({
        trigger: 'expertise_mismatch',
        strength: expertiseMismatch.strength,
        reason: expertiseMismatch.reason,
        data: expertiseMismatch.details
      });
    }

    // Emotional context adaptation
    const emotionalTrigger = this.analyzeEmotionalContext(context);
    if (emotionalTrigger.strength > 0.3) {
      triggers.push({
        trigger: 'emotional_adaptation',
        strength: emotionalTrigger.strength,
        reason: emotionalTrigger.reason,
        data: emotionalTrigger.details
      });
    }

    // Conversation pattern adaptation
    const patternTrigger = this.analyzeConversationPatterns(context, userProfile);
    if (patternTrigger.strength > 0.3) {
      triggers.push(patternTrigger);
    }

    return triggers.filter(t => t.strength > 0.2);
  }

  private detectCommunicationMismatch(
    context: ConversationContext,
    userProfile: UserProfile
  ): { strength: number; reason: string; details: any } {
    const userPreferences = userProfile.preferences;
    const currentStyle = this.currentProfile.communicationStyle;

    let mismatchScore = 0;
    const mismatches: string[] = [];

    // Check response length preference
    if (userPreferences.responseFormat === 'text' && currentStyle.responseLength === 'detailed') {
      mismatchScore += 0.3;
      mismatches.push('response_length');
    }

    // Check formality mismatch
    if (userPreferences.communicationStyle === 'casual' && currentStyle.tonePreference === 'formal') {
      mismatchScore += 0.4;
      mismatches.push('formality');
    }

    if (userPreferences.communicationStyle === 'direct' && currentStyle.explainReasoning) {
      mismatchScore += 0.2;
      mismatches.push('directness');
    }

    return {
      strength: Math.min(1, mismatchScore),
      reason: `Communication style mismatch: ${mismatches.join(', ')}`,
      details: { mismatches, userPrefs: userPreferences, currentStyle }
    };
  }

  private detectExpertiseMismatch(
    context: ConversationContext,
    userProfile: UserProfile
  ): { strength: number; reason: string; details: any } {
    const messages = context.messages.slice(-5); // Recent messages
    let technicalContentRatio = 0;
    let userTechnicalLevel = userProfile.expertise.technical || 0.5;

    // Analyze technical content in conversation
    messages.forEach(msg => {
      const technicalTerms = (msg.content.match(/\b(api|function|class|method|algorithm|database|server|code|programming|debug)\b/gi) || []).length;
      const totalWords = msg.content.split(/\s+/).length;
      if (totalWords > 0) {
        technicalContentRatio += technicalTerms / totalWords;
      }
    });

    technicalContentRatio /= Math.max(1, messages.length);

    // Calculate mismatch
    const expectedTechnicalRatio = userTechnicalLevel;
    const mismatchStrength = Math.abs(technicalContentRatio - expectedTechnicalRatio);

    return {
      strength: Math.min(1, mismatchStrength * 2),
      reason: `Technical level mismatch: current=${technicalContentRatio.toFixed(2)}, expected=${expectedTechnicalRatio.toFixed(2)}`,
      details: {
        currentTechnicalRatio: technicalContentRatio,
        userTechnicalLevel,
        mismatch: mismatchStrength
      }
    };
  }

  private analyzeEmotionalContext(context: ConversationContext): {
    strength: number;
    reason: string;
    details: any;
  } {
    const recentMessages = context.messages.slice(-3);
    const emotions = recentMessages
      .map(msg => msg.metadata?.emotions)
      .filter(Boolean);

    if (emotions.length === 0) {
      return { strength: 0, reason: 'No emotional context detected', details: {} };
    }

    // Check for emotional intensity that might require adaptation
    const highIntensityEmotions = emotions.filter(emotion => emotion.intensity > 0.6);

    if (highIntensityEmotions.length > 0) {
      const primaryEmotion = highIntensityEmotions[0].primary;
      const needsEmpathy = ['sadness', 'frustration', 'anger', 'fear'].includes(primaryEmotion);

      if (needsEmpathy && this.currentProfile.traits.empathy < 0.7) {
        return {
          strength: 0.8,
          reason: `High emotional intensity detected (${primaryEmotion}), requires increased empathy`,
          details: { emotions: highIntensityEmotions, primaryEmotion }
        };
      }
    }

    return { strength: 0, reason: 'No emotional adaptation needed', details: { emotions } };
  }

  private analyzeConversationPatterns(
    context: ConversationContext,
    userProfile: UserProfile
  ): { trigger: string; strength: number; reason: string; data: any } {
    // Analyze patterns like question frequency, response preferences, etc.
    const messages = context.messages;
    const userMessages = messages.filter(msg => msg.role === 'user');

    if (userMessages.length < 3) {
      return { trigger: 'pattern_analysis', strength: 0, reason: 'Insufficient data', data: {} };
    }

    const questionRatio = userMessages.filter(msg => msg.content.includes('?')).length / userMessages.length;
    const avgMessageLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length;

    // If user asks many short questions, adapt to be more concise
    if (questionRatio > 0.7 && avgMessageLength < 50) {
      return {
        trigger: 'conversation_pattern',
        strength: 0.6,
        reason: 'User prefers short, quick exchanges',
        data: { questionRatio, avgMessageLength, pattern: 'quick_exchange' }
      };
    }

    // If user writes long messages, adapt to be more detailed
    if (avgMessageLength > 200) {
      return {
        trigger: 'conversation_pattern',
        strength: 0.5,
        reason: 'User prefers detailed discussions',
        data: { questionRatio, avgMessageLength, pattern: 'detailed_discussion' }
      };
    }

    return { trigger: 'pattern_analysis', strength: 0, reason: 'No significant patterns', data: {} };
  }

  private calculatePersonalityAdjustments(
    triggers: Array<any>,
    context: ConversationContext,
    userProfile: UserProfile
  ): Array<{
    trait: keyof PersonalityTraits | 'communicationStyle';
    currentValue: any;
    proposedValue: any;
    reason: string;
    confidence: number;
  }> {
    const adjustments: Array<any> = [];

    triggers.forEach(trigger => {
      switch (trigger.trigger) {
        case 'low_satisfaction':
          // Increase empathy and reduce assertiveness
          adjustments.push({
            trait: 'empathy',
            currentValue: this.currentProfile.traits.empathy,
            proposedValue: Math.min(1, this.currentProfile.traits.empathy + 0.1),
            reason: 'Increasing empathy due to low user satisfaction',
            confidence: trigger.strength
          });
          adjustments.push({
            trait: 'assertiveness',
            currentValue: this.currentProfile.traits.assertiveness,
            proposedValue: Math.max(0, this.currentProfile.traits.assertiveness - 0.1),
            reason: 'Reducing assertiveness due to low user satisfaction',
            confidence: trigger.strength * 0.8
          });
          break;

        case 'communication_mismatch':
          if (trigger.data.mismatches.includes('formality')) {
            adjustments.push({
              trait: 'formality',
              currentValue: this.currentProfile.traits.formality,
              proposedValue: userProfile.personality.communicationPreference === 'casual' ?
                Math.max(0, this.currentProfile.traits.formality - 0.2) :
                Math.min(1, this.currentProfile.traits.formality + 0.2),
              reason: 'Adjusting formality to match user preference',
              confidence: trigger.strength
            });
          }
          break;

        case 'expertise_mismatch':
          adjustments.push({
            trait: 'analyticalThinking',
            currentValue: this.currentProfile.traits.analyticalThinking,
            proposedValue: this.adjustValueTowardsTarget(
              this.currentProfile.traits.analyticalThinking,
              userProfile.expertise.technical || 0.5,
              0.1
            ),
            reason: 'Adjusting analytical thinking to match user expertise',
            confidence: trigger.strength
          });
          break;

        case 'emotional_adaptation':
          adjustments.push({
            trait: 'empathy',
            currentValue: this.currentProfile.traits.empathy,
            proposedValue: Math.min(1, this.currentProfile.traits.empathy + 0.15),
            reason: 'Increasing empathy for emotional support',
            confidence: trigger.strength
          });
          adjustments.push({
            trait: 'emotionalIntelligence',
            currentValue: this.currentProfile.traits.emotionalIntelligence,
            proposedValue: Math.min(1, this.currentProfile.traits.emotionalIntelligence + 0.1),
            reason: 'Enhancing emotional intelligence',
            confidence: trigger.strength * 0.9
          });
          break;

        case 'conversation_pattern':
          if (trigger.data.pattern === 'quick_exchange') {
            adjustments.push({
              trait: 'communicationStyle',
              currentValue: this.currentProfile.communicationStyle.responseLength,
              proposedValue: 'concise',
              reason: 'Adapting to quick exchange pattern',
              confidence: trigger.strength
            });
          } else if (trigger.data.pattern === 'detailed_discussion') {
            adjustments.push({
              trait: 'communicationStyle',
              currentValue: this.currentProfile.communicationStyle.responseLength,
              proposedValue: 'detailed',
              reason: 'Adapting to detailed discussion pattern',
              confidence: trigger.strength
            });
          }
          break;
      }
    });

    return adjustments.filter(adj => adj.confidence > 0.3);
  }

  private adjustValueTowardsTarget(current: number, target: number, maxChange: number): number {
    const difference = target - current;
    const change = Math.sign(difference) * Math.min(Math.abs(difference), maxChange);
    return Math.max(0, Math.min(1, current + change));
  }

  private shouldApplyChanges(proposedChanges: Array<any>): boolean {
    if (proposedChanges.length === 0) return false;

    // Calculate overall change magnitude
    const totalChange = proposedChanges.reduce((sum, change) => {
      if (typeof change.currentValue === 'number' && typeof change.proposedValue === 'number') {
        return sum + Math.abs(change.proposedValue - change.currentValue);
      }
      return sum + 0.1; // For non-numeric changes
    }, 0);

    // Only apply if change is significant but not too dramatic
    return totalChange > this.config.evolutionThreshold && totalChange < 1.0;
  }

  private async evolvePersonality(
    proposedChanges: Array<any>,
    triggers: Array<any>
  ): Promise<PersonalityEvolution> {
    const previousTraits = { ...this.currentProfile.traits };

    // Apply trait changes
    proposedChanges.forEach(change => {
      if (change.trait in this.currentProfile.traits) {
        (this.currentProfile.traits as any)[change.trait] = change.proposedValue;
      } else if (change.trait === 'communicationStyle') {
        // Handle communication style changes
        if (change.currentValue === this.currentProfile.communicationStyle.responseLength) {
          this.currentProfile.communicationStyle.responseLength = change.proposedValue;
        }
      }
    });

    // Create evolution record
    const evolution: PersonalityEvolution = {
      previousTraits,
      currentTraits: { ...this.currentProfile.traits },
      changes: proposedChanges.map(change => ({
        trait: change.trait,
        oldValue: change.currentValue,
        newValue: change.proposedValue,
        reason: change.reason,
        timestamp: new Date()
      })),
      triggers: triggers.map(t => t.trigger)
    };

    // Update personality metadata
    this.currentProfile.version = this.generateNewVersion(this.currentProfile.version);
    this.currentProfile.lastUpdated = new Date();

    // Store in history
    this.personalityHistory.push(evolution);

    // Limit history size
    if (this.personalityHistory.length > this.config.maxPersonalityVariations) {
      this.personalityHistory = this.personalityHistory.slice(-this.config.maxPersonalityVariations);
    }

    this.logger.info('Personality evolved', {
      version: this.currentProfile.version,
      changesApplied: proposedChanges.length,
      triggers: triggers.map(t => t.trigger)
    });

    return evolution;
  }

  private generateNewVersion(currentVersion: string): string {
    const parts = currentVersion.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  private updateAdaptationMetrics(evolution: PersonalityEvolution, userFeedback?: any): void {
    this.metrics.totalAdaptations++;
    this.metrics.evolutionEvents++;
    this.metrics.lastAdaptationTimestamp = new Date();

    // Track triggers
    evolution.triggers.forEach(trigger => {
      this.metrics.adaptationTriggers[trigger] =
        (this.metrics.adaptationTriggers[trigger] || 0) + 1;
    });

    // Update satisfaction if provided
    if (userFeedback?.satisfaction !== undefined) {
      this.metrics.averageUserSatisfaction =
        (this.metrics.averageUserSatisfaction * (this.metrics.totalAdaptations - 1) + userFeedback.satisfaction) /
        this.metrics.totalAdaptations;
    }

    // Calculate personality stability
    const totalChangeMagnitude = evolution.changes.reduce((sum, change) => {
      return sum + Math.abs(change.newValue - change.oldValue);
    }, 0);

    this.metrics.personalityStability = Math.max(0, 1 - (totalChangeMagnitude / evolution.changes.length));
  }

  private async persistPersonality(): Promise<void> {
    try {
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: `personality_${this.currentProfile.id}`,
        value: JSON.stringify({
          profile: this.currentProfile,
          history: this.personalityHistory.slice(-5), // Keep recent history
          metrics: this.metrics
        }),
        namespace: 'personalities'
      });

      this.logger.debug('Personality persisted', { profileId: this.currentProfile.id });
    } catch (error) {
      this.logger.warn('Failed to persist personality', { error });
    }
  }

  // Public API methods

  public getCurrentPersonality(): PersonalityProfile {
    return this.cloneProfile(this.currentProfile);
  }

  public getPersonalityHistory(): PersonalityEvolution[] {
    return [...this.personalityHistory];
  }

  public async resetToBasePersonality(): Promise<void> {
    this.currentProfile = this.cloneProfile(this.baseProfile);
    this.personalityHistory = [];

    if (this.config.persistenceEnabled) {
      await this.persistPersonality();
    }

    this.logger.info('Personality reset to base', { profileId: this.baseProfile.id });
  }

  public async loadPersonality(profileId: string): Promise<boolean> {
    try {
      const result = await mcp__claude_flow__memory_usage({
        action: 'retrieve',
        key: `personality_${profileId}`,
        namespace: 'personalities'
      });

      if (result.value) {
        const data = JSON.parse(result.value);
        this.currentProfile = data.profile;
        this.personalityHistory = data.history || [];
        this.metrics = { ...this.metrics, ...data.metrics };

        this.logger.info('Personality loaded', { profileId });
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to load personality', { error, profileId });
      return false;
    }
  }

  public generatePersonalityInsights(): {
    dominantTraits: Array<{ trait: string; value: number }>;
    adaptationTrends: Array<{ trait: string; trend: 'increasing' | 'decreasing' | 'stable' }>;
    communicationProfile: string;
    strengths: string[];
    recommendedAdjustments?: string[];
  } {
    const traits = this.currentProfile.traits;

    // Find dominant traits
    const dominantTraits = Object.entries(traits)
      .map(([trait, value]) => ({ trait, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3);

    // Analyze adaptation trends
    const adaptationTrends: Array<{ trait: string; trend: 'increasing' | 'decreasing' | 'stable' }> = [];
    if (this.personalityHistory.length > 1) {
      const recent = this.personalityHistory.slice(-3);
      Object.keys(traits).forEach(trait => {
        const values = recent.map(h => h.currentTraits[trait as keyof PersonalityTraits]);
        const trend = this.calculateTrend(values);
        adaptationTrends.push({ trait, trend });
      });
    }

    // Generate communication profile
    const style = this.currentProfile.communicationStyle;
    const communicationProfile = `${style.tonePreference} ${style.responseLength} responses with ${
      style.explainReasoning ? 'detailed explanations' : 'concise answers'
    }`;

    // Identify strengths
    const strengths = dominantTraits.map(t => t.trait);

    return {
      dominantTraits,
      adaptationTrends,
      communicationProfile,
      strengths,
      recommendedAdjustments: this.generateRecommendations()
    };
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 2) return 'stable';

    const diff = values[values.length - 1] - values[0];
    const threshold = 0.05;

    if (diff > threshold) return 'increasing';
    if (diff < -threshold) return 'decreasing';
    return 'stable';
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const traits = this.currentProfile.traits;

    // Check for extreme values
    Object.entries(traits).forEach(([trait, value]) => {
      if (value < 0.3) {
        recommendations.push(`Consider increasing ${trait} for better user engagement`);
      } else if (value > 0.9) {
        recommendations.push(`${trait} is very high - ensure it doesn't overshadow other traits`);
      }
    });

    // Balance recommendations
    if (traits.analyticalThinking > 0.8 && traits.empathy < 0.6) {
      recommendations.push('Balance analytical thinking with more empathy');
    }

    if (traits.humor < 0.4 && traits.formality > 0.7) {
      recommendations.push('Consider adding some humor to reduce formality');
    }

    return recommendations.slice(0, 3); // Limit to top 3 recommendations
  }

  public getMetrics(): PersonalityMetrics {
    return { ...this.metrics };
  }

  public async healthCheck(): Promise<{ status: string; profileLoaded: boolean; error?: string }> {
    try {
      const isValid = PersonalityTraitsSchema.safeParse(this.currentProfile.traits).success;

      return {
        status: isValid ? 'healthy' : 'degraded',
        profileLoaded: !!this.currentProfile.id
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        profileLoaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}