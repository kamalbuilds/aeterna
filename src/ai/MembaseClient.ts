// AETERNA Membase MCP Client
// Production-level typed client for Membase MCP integration

import { z } from 'zod';
import {
  MembaseConfig,
  MembaseClient as IMembaseClient,
  SearchOptions,
  SearchResult
} from './types/index.js';
import { Logger } from './utils/Logger.js';
import { RetryManager } from './utils/RetryManager.js';
import { mcp__claude_flow__memory_usage } from '@anthropic-claude/mcp';

export interface MembaseClientConfig extends MembaseConfig {
  enableBatching?: boolean;
  batchSize?: number;
  flushInterval?: number;
  enableCompression?: boolean;
  cacheSize?: number;
  debugMode?: boolean;
}

export interface MembaseStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageLatency: number;
  cacheHitRate: number;
  lastOperationTimestamp: Date;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}

interface BatchOperation {
  operation: 'store' | 'retrieve' | 'delete';
  key: string;
  value?: any;
  ttl?: number;
  timestamp: Date;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

export class MembaseClient implements IMembaseClient {
  private config: MembaseClientConfig;
  private logger: Logger;
  private retryManager: RetryManager;
  private stats: MembaseStats;
  private cache: Map<string, { value: any; expiry: number }> = new Map();
  private batchQueue: BatchOperation[] = [];
  private batchTimer?: NodeJS.Timeout;

  constructor(config: MembaseClientConfig) {
    this.config = {
      serverUrl: config.serverUrl || 'mcp://claude-flow',
      apiKey: config.apiKey,
      namespace: config.namespace || 'default',
      retryAttempts: config.retryAttempts || 3,
      timeout: config.timeout || 30000,
      enableBatching: config.enableBatching !== false,
      batchSize: config.batchSize || 10,
      flushInterval: config.flushInterval || 1000,
      enableCompression: config.enableCompression || false,
      cacheSize: config.cacheSize || 1000,
      debugMode: config.debugMode || false
    };

    this.logger = new Logger('MembaseClient', {
      logLevel: config.debugMode ? 'debug' : 'info'
    });

    this.retryManager = new RetryManager({
      maxRetries: this.config.retryAttempts,
      baseDelay: 1000,
      maxDelay: 10000,
      shouldRetry: this.shouldRetryOperation.bind(this)
    });

    this.stats = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageLatency: 0,
      cacheHitRate: 0,
      lastOperationTimestamp: new Date(),
      connectionStatus: 'disconnected'
    };

    this.initializeClient();
    this.startBatchProcessor();

    this.logger.info('Membase client initialized', {
      namespace: this.config.namespace,
      enableBatching: this.config.enableBatching
    });
  }

  private async initializeClient(): Promise<void> {
    try {
      this.stats.connectionStatus = 'connecting';

      // Test connection
      await this.healthCheck();

      this.stats.connectionStatus = 'connected';
      this.logger.info('Membase client connected successfully');

    } catch (error) {
      this.stats.connectionStatus = 'disconnected';
      this.logger.error('Failed to initialize Membase client', { error });
    }
  }

  private shouldRetryOperation(error: any, attemptNumber: number): boolean {
    // Don't retry on authentication errors
    if (error?.code === 'AUTHENTICATION_ERROR') {
      return false;
    }

    // Don't retry on invalid requests
    if (error?.code === 'INVALID_REQUEST') {
      return false;
    }

    // Retry on network errors and timeouts
    if (error?.code === 'NETWORK_ERROR' || error?.code === 'TIMEOUT') {
      return true;
    }

    // Retry on server errors
    if (error?.code === 'SERVER_ERROR') {
      return attemptNumber < 2; // Only retry server errors twice
    }

    return false;
  }

  private startBatchProcessor(): void {
    if (!this.config.enableBatching) return;

    const processInterval = setInterval(() => {
      if (this.batchQueue.length > 0) {
        this.processBatch();
      }
    }, this.config.flushInterval);

    // Store interval reference for cleanup
    this.batchTimer = processInterval;
  }

  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.splice(0, this.config.batchSize);

    this.logger.debug('Processing batch', { batchSize: batch.length });

    try {
      // Group operations by type for efficiency
      const storeOps = batch.filter(op => op.operation === 'store');
      const retrieveOps = batch.filter(op => op.operation === 'retrieve');
      const deleteOps = batch.filter(op => op.operation === 'delete');

      // Process store operations
      if (storeOps.length > 0) {
        await this.processBatchStore(storeOps);
      }

      // Process retrieve operations
      if (retrieveOps.length > 0) {
        await this.processBatchRetrieve(retrieveOps);
      }

      // Process delete operations
      if (deleteOps.length > 0) {
        await this.processBatchDelete(deleteOps);
      }

    } catch (error) {
      this.logger.error('Batch processing failed', { error, batchSize: batch.length });

      // Reject all operations in the batch
      batch.forEach(op => {
        op.reject(new Error(`Batch operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      });
    }
  }

  private async processBatchStore(operations: BatchOperation[]): Promise<void> {
    const promises = operations.map(async (op) => {
      try {
        const result = await this.performStoreOperation(op.key, op.value, op.ttl);
        op.resolve(result);
      } catch (error) {
        op.reject(error as Error);
      }
    });

    await Promise.allSettled(promises);
  }

  private async processBatchRetrieve(operations: BatchOperation[]): Promise<void> {
    const promises = operations.map(async (op) => {
      try {
        const result = await this.performRetrieveOperation(op.key);
        op.resolve(result);
      } catch (error) {
        op.reject(error as Error);
      }
    });

    await Promise.allSettled(promises);
  }

  private async processBatchDelete(operations: BatchOperation[]): Promise<void> {
    const promises = operations.map(async (op) => {
      try {
        const result = await this.performDeleteOperation(op.key);
        op.resolve(result);
      } catch (error) {
        op.reject(error as Error);
      }
    });

    await Promise.allSettled(promises);
  }

  public async store(key: string, value: any, ttl?: number): Promise<void> {
    const startTime = performance.now();

    try {
      this.validateKey(key);

      if (this.config.enableBatching) {
        return this.addToBatch('store', key, value, ttl);
      }

      await this.performStoreOperation(key, value, ttl);
      this.updateCacheAfterStore(key, value, ttl);
      this.updateStats(startTime, true);

    } catch (error) {
      this.updateStats(startTime, false);
      this.logger.error('Store operation failed', { error, key });
      throw error;
    }
  }

  private async performStoreOperation(key: string, value: any, ttl?: number): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    const serializedValue = this.serializeValue(value);

    return this.retryManager.execute(async () => {
      await mcp__claude_flow__memory_usage({
        action: 'store',
        key: namespacedKey,
        value: serializedValue,
        namespace: this.config.namespace,
        ttl
      });
    });
  }

  public async retrieve(key: string): Promise<any> {
    const startTime = performance.now();

    try {
      this.validateKey(key);

      // Check cache first
      const cached = this.getCachedValue(key);
      if (cached !== null) {
        this.stats.cacheHitRate = (this.stats.cacheHitRate + 1) / 2; // Simple running average
        this.updateStats(startTime, true);
        return cached;
      }

      if (this.config.enableBatching) {
        return this.addToBatch('retrieve', key);
      }

      const result = await this.performRetrieveOperation(key);
      this.updateCacheAfterRetrieve(key, result);
      this.updateStats(startTime, true);
      return result;

    } catch (error) {
      this.updateStats(startTime, false);
      this.logger.error('Retrieve operation failed', { error, key });
      throw error;
    }
  }

  private async performRetrieveOperation(key: string): Promise<any> {
    const namespacedKey = this.getNamespacedKey(key);

    return this.retryManager.execute(async () => {
      const result = await mcp__claude_flow__memory_usage({
        action: 'retrieve',
        key: namespacedKey,
        namespace: this.config.namespace
      });

      if (result.value === undefined || result.value === null) {
        return null;
      }

      return this.deserializeValue(result.value);
    });
  }

  public async delete(key: string): Promise<boolean> {
    const startTime = performance.now();

    try {
      this.validateKey(key);

      if (this.config.enableBatching) {
        return this.addToBatch('delete', key);
      }

      const result = await this.performDeleteOperation(key);
      this.removeCachedValue(key);
      this.updateStats(startTime, true);
      return result;

    } catch (error) {
      this.updateStats(startTime, false);
      this.logger.error('Delete operation failed', { error, key });
      throw error;
    }
  }

  private async performDeleteOperation(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);

    return this.retryManager.execute(async () => {
      await mcp__claude_flow__memory_usage({
        action: 'delete',
        key: namespacedKey,
        namespace: this.config.namespace
      });

      return true; // MCP doesn't return boolean, assume success if no error
    });
  }

  public async list(pattern?: string): Promise<string[]> {
    const startTime = performance.now();

    try {
      const result = await this.retryManager.execute(async () => {
        return await mcp__claude_flow__memory_usage({
          action: 'list',
          key: pattern || '',
          namespace: this.config.namespace
        });
      });

      this.updateStats(startTime, true);
      return result.keys || [];

    } catch (error) {
      this.updateStats(startTime, false);
      this.logger.error('List operation failed', { error, pattern });
      throw error;
    }
  }

  public async exists(key: string): Promise<boolean> {
    const startTime = performance.now();

    try {
      this.validateKey(key);

      // Check cache first
      if (this.cache.has(key)) {
        const cached = this.cache.get(key)!;
        if (cached.expiry > Date.now()) {
          this.updateStats(startTime, true);
          return true;
        }
      }

      const result = await this.retrieve(key);
      return result !== null;

    } catch (error) {
      this.updateStats(startTime, false);
      return false;
    }
  }

  public async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const startTime = performance.now();

    try {
      const result = await this.retryManager.execute(async () => {
        return await mcp__claude_flow__memory_usage({
          action: 'search',
          key: query,
          namespace: this.config.namespace
        });
      });

      this.updateStats(startTime, true);

      // Transform MCP result to SearchResult format
      const searchResults: SearchResult[] = (result.memories || []).map((memory: any, index: number) => ({
        key: memory.id || `result_${index}`,
        value: this.deserializeValue(memory.data || memory),
        score: memory.score || 1.0,
        metadata: memory.metadata || {}
      }));

      // Apply options
      let filteredResults = searchResults;

      if (options.threshold) {
        filteredResults = filteredResults.filter(r => r.score >= options.threshold!);
      }

      if (options.offset) {
        filteredResults = filteredResults.slice(options.offset);
      }

      if (options.limit) {
        filteredResults = filteredResults.slice(0, options.limit);
      }

      return filteredResults;

    } catch (error) {
      this.updateStats(startTime, false);
      this.logger.error('Search operation failed', { error, query });
      throw error;
    }
  }

  private addToBatch(operation: BatchOperation['operation'], key: string, value?: any, ttl?: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.batchQueue.push({
        operation,
        key,
        value,
        ttl,
        timestamp: new Date(),
        resolve,
        reject
      });

      // Flush if batch is full
      if (this.batchQueue.length >= this.config.batchSize!) {
        this.processBatch();
      }
    });
  }

  private validateKey(key: string): void {
    const schema = z.string().min(1).max(250);
    const result = schema.safeParse(key);

    if (!result.success) {
      throw new Error(`Invalid key: ${result.error.message}`);
    }

    if (key.includes('\n') || key.includes('\r')) {
      throw new Error('Key cannot contain newline characters');
    }
  }

  private getNamespacedKey(key: string): string {
    return `${this.config.namespace}:${key}`;
  }

  private serializeValue(value: any): string {
    try {
      if (typeof value === 'string') {
        return value;
      }

      const serialized = JSON.stringify(value);

      if (this.config.enableCompression && serialized.length > 1000) {
        // In production, you'd use actual compression
        return `compressed:${serialized}`;
      }

      return serialized;

    } catch (error) {
      throw new Error(`Failed to serialize value: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private deserializeValue(value: string): any {
    try {
      if (typeof value !== 'string') {
        return value;
      }

      if (value.startsWith('compressed:')) {
        // In production, you'd use actual decompression
        return JSON.parse(value.slice(11));
      }

      // Try to parse as JSON
      try {
        return JSON.parse(value);
      } catch {
        // Return as string if not valid JSON
        return value;
      }

    } catch (error) {
      this.logger.warn('Failed to deserialize value', { error, value: value.slice(0, 100) });
      return value;
    }
  }

  private getCachedValue(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (cached.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return cached.value;
  }

  private updateCacheAfterStore(key: string, value: any, ttl?: number): void {
    if (this.cache.size >= this.config.cacheSize!) {
      this.evictOldestCacheEntry();
    }

    const expiry = ttl ? Date.now() + (ttl * 1000) : Date.now() + (60 * 60 * 1000); // Default 1 hour
    this.cache.set(key, { value, expiry });
  }

  private updateCacheAfterRetrieve(key: string, value: any): void {
    if (value !== null) {
      this.updateCacheAfterStore(key, value);
    }
  }

  private removeCachedValue(key: string): void {
    this.cache.delete(key);
  }

  private evictOldestCacheEntry(): void {
    // Simple LRU eviction - remove first entry
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  private updateStats(startTime: number, success: boolean): void {
    const latency = performance.now() - startTime;

    this.stats.totalOperations++;
    this.stats.lastOperationTimestamp = new Date();

    if (success) {
      this.stats.successfulOperations++;
    } else {
      this.stats.failedOperations++;
    }

    // Update average latency
    this.stats.averageLatency =
      (this.stats.averageLatency * (this.stats.totalOperations - 1) + latency) / this.stats.totalOperations;
  }

  public async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    cacheStatus: string;
    error?: string;
  }> {
    const startTime = performance.now();

    try {
      // Test basic functionality
      const testKey = `health_check_${Date.now()}`;
      const testValue = { timestamp: new Date(), test: true };

      await this.store(testKey, testValue, 60); // 1 minute TTL
      const retrieved = await this.retrieve(testKey);
      await this.delete(testKey);

      const latency = performance.now() - startTime;

      if (!retrieved || retrieved.test !== true) {
        return {
          status: 'degraded',
          latency,
          cacheStatus: this.getCacheStatus(),
          error: 'Data integrity check failed'
        };
      }

      return {
        status: 'healthy',
        latency,
        cacheStatus: this.getCacheStatus()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        latency: performance.now() - startTime,
        cacheStatus: this.getCacheStatus(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private getCacheStatus(): string {
    return `${this.cache.size}/${this.config.cacheSize} entries`;
  }

  public getStats(): MembaseStats {
    return { ...this.stats };
  }

  public clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }

  public updateConfig(updates: Partial<MembaseClientConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('Config updated', { updates: Object.keys(updates) });
  }

  public async flush(): Promise<void> {
    if (this.batchQueue.length > 0) {
      await this.processBatch();
    }
  }

  public async dispose(): Promise<void> {
    // Clear batch timer
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }

    // Process remaining batches
    await this.flush();

    // Clear cache
    this.clearCache();

    this.stats.connectionStatus = 'disconnected';
    this.logger.info('Membase client disposed');
  }
}