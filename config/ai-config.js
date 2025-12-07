// AI Configuration for AETERNA Intelligence System
export const AI_CONFIG = {
  // Primary AI Provider (Claude-3.5 Sonnet)
  primary: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 30000,
    retries: 3
  },

  // Fallback AI Provider (GPT-4)
  fallback: {
    provider: 'openai',
    model: 'gpt-4-turbo-preview',
    apiKey: process.env.OPENAI_API_KEY || '',
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 30000,
    retries: 2
  },

  // Decision Making Parameters
  decisionMaking: {
    riskThreshold: 0.3,
    confidenceThreshold: 0.8,
    maxDecisionTime: 5000,
    contextWindowSize: 8000,
    enableRiskAssessment: true,
    enableMultiModelConsensus: true
  },

  // Personality Evolution
  personality: {
    baseTraits: {
      curiosity: 0.8,
      empathy: 0.7,
      logic: 0.9,
      creativity: 0.6,
      caution: 0.5,
      adaptability: 0.8
    },
    evolutionRate: 0.01,
    maxTraitValue: 1.0,
    minTraitValue: 0.1,
    evolutionEnabled: true
  },

  // Learning System
  learning: {
    enabled: true,
    learningRate: 0.05,
    memoryRetentionDays: 365,
    adaptationThreshold: 0.6,
    feedbackWeight: 0.3,
    experienceWeight: 0.7
  },

  // Context Management
  context: {
    maxContextLength: 16000,
    contextDecayFactor: 0.95,
    priorityThreshold: 0.4,
    summaryLength: 500,
    enableSemanticCompression: true
  },

  // Memory System
  memory: {
    vectorDimension: 1536,
    similarityThreshold: 0.75,
    maxMemoryEntries: 100000,
    indexingBatchSize: 100,
    enableEmbeddings: true,
    embeddingModel: 'text-embedding-ada-002'
  },

  // Validation & Testing
  validation: {
    enableRealTimeValidation: true,
    validationStrategies: ['consistency', 'accuracy', 'safety'],
    testMode: process.env.NODE_ENV === 'test',
    logLevel: process.env.LOG_LEVEL || 'info'
  },

  // Performance Monitoring
  monitoring: {
    enableMetrics: true,
    responseTimeThreshold: 2000,
    errorRateThreshold: 0.05,
    healthCheckInterval: 60000
  }
};

// Environment-specific overrides
if (process.env.NODE_ENV === 'development') {
  AI_CONFIG.primary.temperature = 0.8;
  AI_CONFIG.validation.logLevel = 'debug';
}

if (process.env.NODE_ENV === 'production') {
  AI_CONFIG.primary.temperature = 0.6;
  AI_CONFIG.validation.logLevel = 'warn';
  AI_CONFIG.decisionMaking.riskThreshold = 0.2;
}

export default AI_CONFIG;