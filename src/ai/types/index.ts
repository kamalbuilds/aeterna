// AETERNA AI System Type Definitions
// Production-level TypeScript interfaces for all AI integrations

import { z } from 'zod';

// ====== Base AI Types ======
export interface AIProvider {
  name: string;
  version: string;
  capabilities: AICapability[];
  generateResponse(prompt: string, options?: GenerationOptions): Promise<AIResponse>;
  streamResponse?(prompt: string, options?: GenerationOptions): AsyncIterableIterator<AIStreamChunk>;
}

export interface AICapability {
  type: 'text-generation' | 'function-calling' | 'code-generation' | 'reasoning' | 'multimodal';
  description: string;
  maxTokens?: number;
  supports?: {
    streaming?: boolean;
    functions?: boolean;
    vision?: boolean;
    audio?: boolean;
  };
}

// ====== API Response Types ======
export interface AIResponse {
  id: string;
  content: string;
  metadata: {
    model: string;
    provider: string;
    tokensUsed: number;
    responseTime: number;
    finishReason: 'completed' | 'length' | 'function_call' | 'content_filter';
    confidence?: number;
  };
  functionCalls?: FunctionCall[];
  error?: AIError;
}

export interface AIStreamChunk {
  id: string;
  delta: string;
  isComplete: boolean;
  metadata?: Partial<AIResponse['metadata']>;
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
  result?: any;
}

export interface AIError {
  code: string;
  message: string;
  type: 'rate_limit' | 'invalid_request' | 'server_error' | 'timeout' | 'authentication';
  retryable: boolean;
  retryAfter?: number;
}

// ====== Generation Options ======
export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  stream?: boolean;
  functions?: AIFunction[];
  systemPrompt?: string;
  conversationId?: string;
  userId?: string;
}

export interface AIFunction {
  name: string;
  description: string;
  parameters: z.ZodSchema<any>;
  required?: boolean;
}

// ====== Provider-Specific Types ======

// Claude/Anthropic Types
export interface ClaudeConfig {
  apiKey: string;
  baseURL?: string;
  model: 'claude-3-opus-20240229' | 'claude-3-sonnet-20240229' | 'claude-3-haiku-20240307';
  maxTokens: number;
  timeout?: number;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

export interface ClaudeContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// OpenAI Types
export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model: 'gpt-4' | 'gpt-4-turbo' | 'gpt-3.5-turbo' | 'gpt-4o';
  maxTokens: number;
  timeout?: number;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface OpenAIResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: 'stop' | 'length' | 'function_call' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ====== Decision Engine Types ======
export interface DecisionContext {
  userId: string;
  conversationId: string;
  currentMessage: string;
  history: ConversationMessage[];
  userProfile: UserProfile;
  sessionState: SessionState;
  availableActions: string[];
  timestamp: Date;
}

export interface DecisionResult {
  action: string;
  confidence: number;
  reasoning: string;
  parameters?: Record<string, any>;
  alternativeActions?: Array<{
    action: string;
    confidence: number;
    reason: string;
  }>;
  metadata: {
    processingTime: number;
    rulesApplied: string[];
    factorsConsidered: string[];
  };
}

export interface DecisionRule {
  id: string;
  name: string;
  description: string;
  conditions: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches_regex';
    value: any;
  }>;
  action: string;
  priority: number;
  confidence: number;
  isActive: boolean;
}

// ====== Personality Engine Types ======
export interface PersonalityProfile {
  id: string;
  name: string;
  traits: PersonalityTraits;
  communicationStyle: CommunicationStyle;
  knowledge: KnowledgeDomains;
  adaptationSettings: AdaptationSettings;
  version: string;
  lastUpdated: Date;
}

export interface PersonalityTraits {
  empathy: number; // 0-1
  humor: number; // 0-1
  formality: number; // 0-1
  curiosity: number; // 0-1
  assertiveness: number; // 0-1
  creativity: number; // 0-1
  analyticalThinking: number; // 0-1
  emotionalIntelligence: number; // 0-1
}

export interface CommunicationStyle {
  responseLength: 'concise' | 'moderate' | 'detailed';
  tonePreference: 'professional' | 'casual' | 'friendly' | 'formal';
  useEmojis: boolean;
  askClarifyingQuestions: boolean;
  provideExamples: boolean;
  explainReasoning: boolean;
}

export interface KnowledgeDomains {
  technical: number; // 0-1 expertise level
  creative: number;
  analytical: number;
  interpersonal: number;
  domains: string[]; // Specific knowledge areas
}

export interface AdaptationSettings {
  learningRate: number; // 0-1
  adaptToUser: boolean;
  retainMemories: boolean;
  evolvePersonality: boolean;
  adaptationFrequency: 'never' | 'weekly' | 'monthly' | 'quarterly';
}

export interface PersonalityEvolution {
  previousTraits: PersonalityTraits;
  currentTraits: PersonalityTraits;
  changes: Array<{
    trait: keyof PersonalityTraits;
    oldValue: number;
    newValue: number;
    reason: string;
    timestamp: Date;
  }>;
  triggers: string[];
}

// ====== Context Management Types ======
export interface ConversationContext {
  id: string;
  userId: string;
  messages: ConversationMessage[];
  metadata: ConversationMetadata;
  state: SessionState;
  summary?: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata: {
    tokensUsed?: number;
    responseTime?: number;
    confidence?: number;
    emotions?: EmotionDetection;
    intent?: IntentDetection;
  };
}

export interface ConversationMetadata {
  topic?: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  complexity: 'low' | 'medium' | 'high';
  userSatisfaction?: number; // 0-1
  goalAchieved?: boolean;
  followUpNeeded?: boolean;
}

export interface SessionState {
  currentGoal?: string;
  userPreferences: UserPreferences;
  contextVariables: Record<string, any>;
  activeMemories: string[];
  mood?: 'helpful' | 'casual' | 'focused' | 'creative';
}

export interface UserProfile {
  id: string;
  preferences: UserPreferences;
  history: InteractionHistory;
  personality: UserPersonalityProfile;
  goals: string[];
  expertise: Record<string, number>; // domain -> level (0-1)
}

export interface UserPreferences {
  communicationStyle: 'direct' | 'detailed' | 'conversational';
  responseFormat: 'text' | 'structured' | 'code-heavy';
  preferredLanguage: string;
  timezone: string;
  notificationSettings: NotificationSettings;
}

export interface NotificationSettings {
  reminders: boolean;
  updates: boolean;
  insights: boolean;
  frequency: 'immediate' | 'hourly' | 'daily' | 'weekly';
}

export interface InteractionHistory {
  totalConversations: number;
  averageSessionLength: number;
  commonTopics: string[];
  satisfactionRatings: number[];
  preferredTimes: string[];
  deviceUsage: Record<string, number>;
}

export interface UserPersonalityProfile {
  communicationPreference: 'formal' | 'casual' | 'technical';
  learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
  decisionMaking: 'analytical' | 'intuitive' | 'collaborative';
  informationProcessing: 'sequential' | 'random' | 'global' | 'concrete';
}

// ====== Learning Engine Types ======
export interface LearningEvent {
  id: string;
  type: 'interaction' | 'feedback' | 'correction' | 'preference' | 'success' | 'failure';
  userId: string;
  conversationId: string;
  content: any;
  timestamp: Date;
  importance: number; // 0-1
  verified: boolean;
  tags: string[];
}

export interface Memory {
  id: string;
  type: 'fact' | 'preference' | 'pattern' | 'relationship' | 'experience';
  content: string;
  userId?: string;
  strength: number; // 0-1
  lastAccessed: Date;
  accessCount: number;
  associations: string[]; // IDs of related memories
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  source: string;
  confidence: number; // 0-1
  verified: boolean;
  category: string;
  subcategory?: string;
  keywords: string[];
  emotionalValence: number; // -1 to 1
}

export interface LearningPattern {
  id: string;
  pattern: string;
  frequency: number;
  contexts: string[];
  outcomes: string[];
  confidence: number;
  lastObserved: Date;
}

export interface AdaptationSuggestion {
  type: 'personality' | 'behavior' | 'response_style' | 'knowledge';
  suggestion: string;
  evidence: string[];
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  implementation: 'immediate' | 'gradual' | 'user_approval';
}

// ====== Emotion and Intent Detection ======
export interface EmotionDetection {
  primary: EmotionType;
  secondary?: EmotionType;
  intensity: number; // 0-1
  confidence: number; // 0-1
  indicators: string[];
}

export type EmotionType =
  | 'joy' | 'sadness' | 'anger' | 'fear' | 'surprise' | 'disgust'
  | 'excitement' | 'frustration' | 'curiosity' | 'confusion'
  | 'satisfaction' | 'disappointment' | 'neutral';

export interface IntentDetection {
  primary: IntentType;
  secondary?: IntentType;
  confidence: number; // 0-1
  parameters: Record<string, any>;
  requiresClarification: boolean;
}

export type IntentType =
  | 'question' | 'request' | 'complaint' | 'compliment' | 'instruction'
  | 'information_seeking' | 'problem_solving' | 'creative_task'
  | 'social_interaction' | 'goal_setting' | 'feedback';

// ====== Membase MCP Integration Types ======
export interface MembaseConfig {
  serverUrl: string;
  apiKey?: string;
  namespace: string;
  retryAttempts: number;
  timeout: number;
}

export interface MembaseClient {
  store(key: string, value: any, ttl?: number): Promise<void>;
  retrieve(key: string): Promise<any>;
  delete(key: string): Promise<boolean>;
  list(pattern?: string): Promise<string[]>;
  exists(key: string): Promise<boolean>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  fuzzy?: boolean;
  threshold?: number;
}

export interface SearchResult {
  key: string;
  value: any;
  score: number;
  metadata?: Record<string, any>;
}

// ====== Error Handling and Debugging ======
export interface DebugInfo {
  timestamp: Date;
  component: string;
  operation: string;
  input?: any;
  output?: any;
  error?: Error;
  performance: {
    startTime: number;
    endTime: number;
    duration: number;
    memoryUsage?: number;
  };
  context?: Record<string, any>;
}

export interface AISystemHealth {
  providers: Record<string, ProviderHealth>;
  engines: Record<string, EngineHealth>;
  overall: 'healthy' | 'degraded' | 'critical';
  lastCheck: Date;
  uptime: number;
}

export interface ProviderHealth {
  status: 'online' | 'offline' | 'degraded';
  responseTime: number;
  errorRate: number;
  lastSuccessfulCall: Date;
  rateLimitStatus?: {
    remaining: number;
    resetTime: Date;
  };
}

export interface EngineHealth {
  status: 'active' | 'inactive' | 'error';
  memoryUsage: number;
  cacheHitRate: number;
  averageProcessingTime: number;
  errorCount: number;
}

// ====== Configuration Types ======
export interface AISystemConfig {
  providers: {
    claude: ClaudeConfig;
    openai: OpenAIConfig;
  };
  engines: {
    decision: DecisionEngineConfig;
    personality: PersonalityEngineConfig;
    learning: LearningEngineConfig;
  };
  membase: MembaseConfig;
  debugging: DebuggingConfig;
}

export interface DecisionEngineConfig {
  defaultRules: DecisionRule[];
  confidenceThreshold: number;
  maxProcessingTime: number;
  fallbackAction: string;
}

export interface PersonalityEngineConfig {
  defaultProfile: PersonalityProfile;
  adaptationEnabled: boolean;
  evolutionThreshold: number;
  maxPersonalities: number;
}

export interface LearningEngineConfig {
  memoryRetentionDays: number;
  learningEnabled: boolean;
  autoAdaptation: boolean;
  memoryCapacity: number;
}

export interface DebuggingConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logToFile: boolean;
  logToConsole: boolean;
  enablePerformanceTracking: boolean;
  enableMemoryTracking: boolean;
}

// ====== Validation Schemas ======
export const PersonalityTraitsSchema = z.object({
  empathy: z.number().min(0).max(1),
  humor: z.number().min(0).max(1),
  formality: z.number().min(0).max(1),
  curiosity: z.number().min(0).max(1),
  assertiveness: z.number().min(0).max(1),
  creativity: z.number().min(0).max(1),
  analyticalThinking: z.number().min(0).max(1),
  emotionalIntelligence: z.number().min(0).max(1),
});

export const GenerationOptionsSchema = z.object({
  maxTokens: z.number().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().min(1).optional(),
  stopSequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  conversationId: z.string().optional(),
  userId: z.string().optional(),
});

export const MemorySchema = z.object({
  id: z.string(),
  type: z.enum(['fact', 'preference', 'pattern', 'relationship', 'experience']),
  content: z.string(),
  userId: z.string().optional(),
  strength: z.number().min(0).max(1),
  lastAccessed: z.date(),
  accessCount: z.number().min(0),
  associations: z.array(z.string()),
});

// Export all types for easy importing
export * from './index';