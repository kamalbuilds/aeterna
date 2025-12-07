/**
 * AETERNA Core Types
 * Comprehensive type definitions for the AETERNA Agent system
 */

// Base Agent Types
export interface AgentId {
  readonly value: string;
  readonly timestamp: number;
  readonly network: NetworkType;
}

export interface AgentMetadata {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly tags: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly capabilities: readonly AgentCapability[];
}

export enum AgentState {
  INITIALIZING = 'initializing',
  ACTIVE = 'active',
  IDLE = 'idle',
  SUSPENDED = 'suspended',
  TERMINATING = 'terminating',
  TERMINATED = 'terminated',
  ERROR = 'error'
}

export enum AgentCapability {
  LEARNING = 'learning',
  TRADING = 'trading',
  COMMUNICATION = 'communication',
  GOVERNANCE = 'governance',
  ANALYSIS = 'analysis',
  EXECUTION = 'execution',
  MEMORY_MANAGEMENT = 'memory_management',
  CROSS_CHAIN = 'cross_chain'
}

// Memory System Types
export interface MemoryEntry<T = unknown> {
  readonly key: string;
  readonly value: T;
  readonly timestamp: number;
  readonly ttl?: number;
  readonly metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  readonly type: MemoryType;
  readonly priority: MemoryPriority;
  readonly source: string;
  readonly tags: readonly string[];
  readonly encrypted: boolean;
}

export enum MemoryType {
  EXPERIENCE = 'experience',
  KNOWLEDGE = 'knowledge',
  CONTEXT = 'context',
  CONFIGURATION = 'configuration',
  STATE = 'state',
  TRANSACTION = 'transaction'
}

export enum MemoryPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

// Economic System Types
export interface WalletConfig {
  readonly networkConfigs: Record<NetworkType, NetworkConfig>;
  readonly multiSigConfig: MultiSigConfig;
  readonly tradingConfig: TradingConfig;
  readonly securitySettings: SecuritySettings;
}

export interface NetworkConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly name: string;
  readonly currency: string;
  readonly blockExplorer: string;
  readonly gasSettings: GasSettings;
}

export interface MultiSigConfig {
  readonly threshold: number;
  readonly signers: readonly string[];
  readonly contractAddress?: string;
  readonly deploymentConfig?: DeploymentConfig;
}

export interface TradingConfig {
  readonly enabledExchanges: readonly ExchangeType[];
  readonly slippageTolerance: number;
  readonly maxGasPrice: string;
  readonly tradingLimits: TradingLimits;
}

export interface GasSettings {
  readonly gasPrice: string;
  readonly gasLimit: string;
  readonly maxFeePerGas?: string;
  readonly maxPriorityFeePerGas?: string;
}

export enum NetworkType {
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  BASE = 'base',
  AVALANCHE = 'avalanche'
}

export enum ExchangeType {
  UNISWAP_V3 = 'uniswap_v3',
  SUSHISWAP = 'sushiswap',
  CURVE = 'curve',
  BALANCER = 'balancer'
}

// AI Intelligence Types
export interface AIConfig {
  readonly providers: Record<AIProvider, ProviderConfig>;
  readonly orchestrationConfig: OrchestrationConfig;
  readonly learningConfig: LearningConfig;
}

export interface ProviderConfig {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly model: string;
  readonly parameters: AIParameters;
  readonly rateLimits: RateLimits;
}

export interface OrchestrationConfig {
  readonly primaryProvider: AIProvider;
  readonly fallbackProviders: readonly AIProvider[];
  readonly routingRules: RoutingRule[];
  readonly consensusThreshold: number;
}

export enum AIProvider {
  CLAUDE_35_SONNET = 'claude_35_sonnet',
  GPT_4 = 'gpt_4',
  GEMINI_PRO = 'gemini_pro'
}

// Event System Types
export interface AgentEvent<T = unknown> {
  readonly id: string;
  readonly type: EventType;
  readonly agentId: AgentId;
  readonly timestamp: number;
  readonly data: T;
  readonly metadata: EventMetadata;
}

export enum EventType {
  LIFECYCLE = 'lifecycle',
  MEMORY = 'memory',
  ECONOMIC = 'economic',
  AI = 'ai',
  BLOCKCHAIN = 'blockchain',
  ERROR = 'error'
}

export interface EventMetadata {
  readonly source: string;
  readonly priority: EventPriority;
  readonly persistent: boolean;
}

export enum EventPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

// Utility Types
export interface Result<T, E = Error> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: E;
}

export interface AsyncResult<T, E = Error> extends Promise<Result<T, E>> {}

export interface Serializable {
  serialize(): string;
}

export interface Deserializable<T> {
  deserialize(data: string): T;
}

// Configuration Types
export interface AeternaConfig {
  readonly agent: AgentConfig;
  readonly memory: MemoryConfig;
  readonly economic: EconomicConfig;
  readonly ai: AIConfig;
  readonly blockchain: BlockchainConfig;
  readonly security: SecurityConfig;
}

export interface AgentConfig {
  readonly id: string;
  readonly metadata: Omit<AgentMetadata, 'createdAt' | 'updatedAt'>;
  readonly lifecycle: LifecycleConfig;
  readonly persistence: PersistenceConfig;
}

export interface MemoryConfig {
  readonly provider: MemoryProvider;
  readonly capacity: number;
  readonly ttlDefault: number;
  readonly encryptionEnabled: boolean;
  readonly compressionEnabled: boolean;
}

export enum MemoryProvider {
  MEMBASE_MCP = 'membase_mcp',
  REDIS = 'redis',
  IPFS = 'ipfs'
}

// Additional supporting types
export interface LifecycleConfig {
  readonly autoStart: boolean;
  readonly maxRestarts: number;
  readonly healthCheckInterval: number;
  readonly gracefulShutdownTimeout: number;
}

export interface PersistenceConfig {
  readonly enabled: boolean;
  readonly backupInterval: number;
  readonly retentionPeriod: number;
  readonly storageLocation: string;
}

export interface SecuritySettings {
  readonly encryptionKey: string;
  readonly allowedOrigins: readonly string[];
  readonly rateLimit: number;
  readonly requireSignature: boolean;
}

export interface TradingLimits {
  readonly maxTradeSize: string;
  readonly dailyLimit: string;
  readonly minBalance: string;
}

export interface DeploymentConfig {
  readonly factoryAddress: string;
  readonly initCode: string;
  readonly salt: string;
}

export interface AIParameters {
  readonly temperature: number;
  readonly maxTokens: number;
  readonly topP: number;
  readonly frequencyPenalty: number;
  readonly presencePenalty: number;
}

export interface RateLimits {
  readonly requestsPerMinute: number;
  readonly tokensPerMinute: number;
  readonly concurrentRequests: number;
}

export interface RoutingRule {
  readonly condition: string;
  readonly provider: AIProvider;
  readonly priority: number;
}

export interface LearningConfig {
  readonly enabled: boolean;
  readonly modelPath: string;
  readonly batchSize: number;
  readonly learningRate: number;
}

export interface EconomicConfig extends WalletConfig {
  readonly defaultNetwork: NetworkType;
  readonly autoTrading: boolean;
  readonly riskManagement: RiskManagementConfig;
}

export interface RiskManagementConfig {
  readonly maxLossPerTrade: number;
  readonly maxDailyLoss: number;
  readonly stopLossThreshold: number;
  readonly takeProfitThreshold: number;
}

export interface BlockchainConfig {
  readonly networks: Record<NetworkType, NetworkConfig>;
  readonly defaultNetwork: NetworkType;
  readonly eventListening: EventListeningConfig;
}

export interface EventListeningConfig {
  readonly enabled: boolean;
  readonly blockRange: number;
  readonly retryAttempts: number;
  readonly backoffMultiplier: number;
}

export interface SecurityConfig {
  readonly keyManagement: KeyManagementConfig;
  readonly encryption: EncryptionConfig;
  readonly audit: AuditConfig;
}

export interface KeyManagementConfig {
  readonly provider: KeyProvider;
  readonly rotationInterval: number;
  readonly backupEnabled: boolean;
}

export enum KeyProvider {
  LOCAL = 'local',
  AWS_KMS = 'aws_kms',
  AZURE_KEY_VAULT = 'azure_key_vault',
  HASHICORP_VAULT = 'hashicorp_vault'
}

export interface EncryptionConfig {
  readonly algorithm: string;
  readonly keySize: number;
  readonly saltSize: number;
}

export interface AuditConfig {
  readonly enabled: boolean;
  readonly logLevel: LogLevel;
  readonly retention: number;
}

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace'
}