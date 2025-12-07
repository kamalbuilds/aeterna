/**
 * AETERNA Error Classes
 * Comprehensive error handling with strict typing
 */

import { AgentId, EventType, NetworkType, AIProvider } from '../types';

// Base Error Classes
export abstract class AeternaError extends Error {
  public readonly code: string;
  public readonly timestamp: number;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    context: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.timestamp = Date.now();
    this.context = { ...context };

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }
}

// Agent Core Errors
export class AgentError extends AeternaError {
  constructor(message: string, code: string, agentId?: AgentId, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, agentId: agentId?.value });
  }
}

export class AgentLifecycleError extends AgentError {
  constructor(message: string, agentId: AgentId, currentState: string, targetState: string) {
    super(
      message,
      'AGENT_LIFECYCLE_ERROR',
      agentId,
      { currentState, targetState }
    );
  }
}

export class AgentInitializationError extends AgentError {
  constructor(message: string, agentId: AgentId, initStep: string) {
    super(
      message,
      'AGENT_INITIALIZATION_ERROR',
      agentId,
      { initStep }
    );
  }
}

export class AgentCapabilityError extends AgentError {
  constructor(message: string, agentId: AgentId, capability: string) {
    super(
      message,
      'AGENT_CAPABILITY_ERROR',
      agentId,
      { capability }
    );
  }
}

// Memory System Errors
export class MemoryError extends AeternaError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message, code, context);
  }
}

export class MemoryConnectionError extends MemoryError {
  constructor(message: string, provider: string) {
    super(message, 'MEMORY_CONNECTION_ERROR', { provider });
  }
}

export class MemoryStorageError extends MemoryError {
  constructor(message: string, key: string, operation: string) {
    super(message, 'MEMORY_STORAGE_ERROR', { key, operation });
  }
}

export class MemoryRetrievalError extends MemoryError {
  constructor(message: string, key: string) {
    super(message, 'MEMORY_RETRIEVAL_ERROR', { key });
  }
}

export class MemoryCapacityError extends MemoryError {
  constructor(message: string, currentSize: number, maxSize: number) {
    super(message, 'MEMORY_CAPACITY_ERROR', { currentSize, maxSize });
  }
}

export class MemoryEncryptionError extends MemoryError {
  constructor(message: string, operation: string) {
    super(message, 'MEMORY_ENCRYPTION_ERROR', { operation });
  }
}

// Economic System Errors
export class EconomicError extends AeternaError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message, code, context);
  }
}

export class WalletError extends EconomicError {
  constructor(message: string, code: string, network?: NetworkType, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, network });
  }
}

export class InsufficientFundsError extends WalletError {
  constructor(required: string, available: string, network: NetworkType) {
    super(
      `Insufficient funds: required ${required}, available ${available}`,
      'INSUFFICIENT_FUNDS',
      network,
      { required, available }
    );
  }
}

export class TransactionError extends WalletError {
  constructor(message: string, txHash?: string, network?: NetworkType) {
    super(message, 'TRANSACTION_ERROR', network, { txHash });
  }
}

export class MultiSigError extends WalletError {
  constructor(message: string, requiredSignatures: number, providedSignatures: number) {
    super(
      message,
      'MULTISIG_ERROR',
      undefined,
      { requiredSignatures, providedSignatures }
    );
  }
}

export class TradingError extends EconomicError {
  constructor(message: string, code: string, exchange?: string, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, exchange });
  }
}

export class SlippageExceededError extends TradingError {
  constructor(expected: number, actual: number, tolerance: number) {
    super(
      `Slippage exceeded tolerance: expected ${expected}%, actual ${actual}%, tolerance ${tolerance}%`,
      'SLIPPAGE_EXCEEDED',
      undefined,
      { expected, actual, tolerance }
    );
  }
}

// AI Intelligence Errors
export class AIError extends AeternaError {
  constructor(message: string, code: string, provider?: AIProvider, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, provider });
  }
}

export class AIProviderError extends AIError {
  constructor(message: string, provider: AIProvider, statusCode?: number) {
    super(message, 'AI_PROVIDER_ERROR', provider, { statusCode });
  }
}

export class AIRateLimitError extends AIError {
  constructor(message: string, provider: AIProvider, retryAfter: number) {
    super(message, 'AI_RATE_LIMIT_ERROR', provider, { retryAfter });
  }
}

export class AIOrchestrationError extends AIError {
  constructor(message: string, failedProviders: AIProvider[]) {
    super(message, 'AI_ORCHESTRATION_ERROR', undefined, { failedProviders });
  }
}

export class AIConsensusError extends AIError {
  constructor(message: string, responses: number, threshold: number) {
    super(
      message,
      'AI_CONSENSUS_ERROR',
      undefined,
      { responses, threshold }
    );
  }
}

// Blockchain Errors
export class BlockchainError extends AeternaError {
  constructor(message: string, code: string, network?: NetworkType, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, network });
  }
}

export class NetworkConnectionError extends BlockchainError {
  constructor(message: string, network: NetworkType, endpoint: string) {
    super(message, 'NETWORK_CONNECTION_ERROR', network, { endpoint });
  }
}

export class ContractError extends BlockchainError {
  constructor(message: string, contractAddress: string, network: NetworkType, method?: string) {
    super(
      message,
      'CONTRACT_ERROR',
      network,
      { contractAddress, method }
    );
  }
}

export class GasEstimationError extends BlockchainError {
  constructor(message: string, network: NetworkType, gasLimit?: string) {
    super(message, 'GAS_ESTIMATION_ERROR', network, { gasLimit });
  }
}

export class ChainReorgError extends BlockchainError {
  constructor(message: string, network: NetworkType, blockNumber: number) {
    super(message, 'CHAIN_REORG_ERROR', network, { blockNumber });
  }
}

// Configuration Errors
export class ConfigurationError extends AeternaError {
  constructor(message: string, configSection: string, field?: string) {
    super(
      message,
      'CONFIGURATION_ERROR',
      { configSection, field }
    );
  }
}

export class ValidationError extends AeternaError {
  constructor(message: string, field: string, value: unknown, constraint: string) {
    super(
      message,
      'VALIDATION_ERROR',
      { field, value, constraint }
    );
  }
}

// Security Errors
export class SecurityError extends AeternaError {
  constructor(message: string, code: string, context: Record<string, unknown> = {}) {
    super(message, code, context);
  }
}

export class EncryptionError extends SecurityError {
  constructor(message: string, operation: string) {
    super(message, 'ENCRYPTION_ERROR', { operation });
  }
}

export class AuthenticationError extends SecurityError {
  constructor(message: string, source: string) {
    super(message, 'AUTHENTICATION_ERROR', { source });
  }
}

export class AuthorizationError extends SecurityError {
  constructor(message: string, requiredPermission: string, currentPermissions: string[]) {
    super(
      message,
      'AUTHORIZATION_ERROR',
      { requiredPermission, currentPermissions }
    );
  }
}

// Event System Errors
export class EventError extends AeternaError {
  constructor(message: string, code: string, eventType?: EventType, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, eventType });
  }
}

export class EventHandlingError extends EventError {
  constructor(message: string, eventType: EventType, handlerName: string) {
    super(
      message,
      'EVENT_HANDLING_ERROR',
      eventType,
      { handlerName }
    );
  }
}

// System Errors
export class SystemError extends AeternaError {
  constructor(message: string, code: string, component: string, context: Record<string, unknown> = {}) {
    super(message, code, { ...context, component });
  }
}

export class ResourceExhaustionError extends SystemError {
  constructor(message: string, resource: string, limit: number, current: number) {
    super(
      message,
      'RESOURCE_EXHAUSTION',
      'system',
      { resource, limit, current }
    );
  }
}

export class TimeoutError extends SystemError {
  constructor(message: string, operation: string, timeout: number) {
    super(
      message,
      'TIMEOUT_ERROR',
      'system',
      { operation, timeout }
    );
  }
}

// Error Factory
export class ErrorFactory {
  static createFromType(
    errorType: string,
    message: string,
    context: Record<string, unknown> = {}
  ): AeternaError {
    switch (errorType) {
      case 'agent':
        return new AgentError(message, 'AGENT_ERROR', undefined, context);
      case 'memory':
        return new MemoryError(message, 'MEMORY_ERROR', context);
      case 'economic':
        return new EconomicError(message, 'ECONOMIC_ERROR', context);
      case 'ai':
        return new AIError(message, 'AI_ERROR', undefined, context);
      case 'blockchain':
        return new BlockchainError(message, 'BLOCKCHAIN_ERROR', undefined, context);
      case 'security':
        return new SecurityError(message, 'SECURITY_ERROR', context);
      case 'event':
        return new EventError(message, 'EVENT_ERROR', undefined, context);
      case 'system':
        return new SystemError(message, 'SYSTEM_ERROR', 'unknown', context);
      default:
        return new AeternaError(message, 'UNKNOWN_ERROR', context) as AeternaError;
    }
  }
}

// Error Utilities
export class ErrorUtils {
  static isRetryable(error: Error): boolean {
    if (error instanceof AIRateLimitError) return true;
    if (error instanceof NetworkConnectionError) return true;
    if (error instanceof TimeoutError) return true;
    if (error instanceof GasEstimationError) return true;

    return false;
  }

  static getRetryDelay(error: Error, attempt: number): number {
    if (error instanceof AIRateLimitError) {
      return error.context.retryAfter as number * 1000;
    }

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 0.1 * baseDelay;
    return baseDelay + jitter;
  }

  static extractErrorInfo(error: unknown): {
    message: string;
    code: string;
    context: Record<string, unknown>;
  } {
    if (error instanceof AeternaError) {
      return {
        message: error.message,
        code: error.code,
        context: error.context
      };
    }

    if (error instanceof Error) {
      return {
        message: error.message,
        code: 'UNKNOWN_ERROR',
        context: { originalError: error.name }
      };
    }

    return {
      message: String(error),
      code: 'UNKNOWN_ERROR',
      context: {}
    };
  }
}