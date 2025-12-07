/**
 * AETERNA Memory System
 * Membase MCP integration with strict TypeScript typing
 */

import { EventEmitter } from 'events';
import {
  MemoryEntry,
  MemoryMetadata,
  MemoryType,
  MemoryPriority,
  MemoryProvider,
  MemoryConfig,
  AsyncResult,
  AgentId,
  Serializable,
  Deserializable
} from '../types';
import {
  MemoryError,
  MemoryConnectionError,
  MemoryStorageError,
  MemoryRetrievalError,
  MemoryCapacityError,
  MemoryEncryptionError,
  ValidationError
} from '../errors';

interface MemorySearchOptions {
  readonly type?: MemoryType;
  readonly priority?: MemoryPriority;
  readonly tags?: readonly string[];
  readonly since?: Date;
  readonly until?: Date;
  readonly limit?: number;
  readonly offset?: number;
}

interface MemoryStats {
  readonly totalEntries: number;
  readonly totalSize: number;
  readonly capacityUsed: number;
  readonly entriesByType: Record<MemoryType, number>;
  readonly entriesByPriority: Record<MemoryPriority, number>;
  readonly oldestEntry?: Date;
  readonly newestEntry?: Date;
}

interface MemoryBackup {
  readonly id: string;
  readonly timestamp: Date;
  readonly agentId: AgentId;
  readonly entries: MemoryEntry[];
  readonly stats: MemoryStats;
  readonly checksum: string;
}

export class MemorySystem extends EventEmitter implements Serializable, Deserializable<MemorySystem> {
  private readonly _config: MemoryConfig;
  private readonly _agentId: AgentId;
  private readonly _entries: Map<string, MemoryEntry>;
  private readonly _typeIndex: Map<MemoryType, Set<string>>;
  private readonly _priorityIndex: Map<MemoryPriority, Set<string>>;
  private readonly _tagIndex: Map<string, Set<string>>;
  private _totalSize: number;
  private _isConnected: boolean;
  private _lastBackup?: Date;
  private readonly _encryptionEnabled: boolean;
  private readonly _compressionEnabled: boolean;

  constructor(config: MemoryConfig, agentId: AgentId) {
    super();
    this.setMaxListeners(20);

    this.validateConfiguration(config);

    this._config = config;
    this._agentId = agentId;
    this._entries = new Map();
    this._typeIndex = new Map();
    this._priorityIndex = new Map();
    this._tagIndex = new Map();
    this._totalSize = 0;
    this._isConnected = false;
    this._encryptionEnabled = config.encryptionEnabled;
    this._compressionEnabled = config.compressionEnabled;

    this.initializeIndexes();
  }

  // Public API
  public get config(): MemoryConfig {
    return this._config;
  }

  public get agentId(): AgentId {
    return this._agentId;
  }

  public get isConnected(): boolean {
    return this._isConnected;
  }

  public get totalSize(): number {
    return this._totalSize;
  }

  public get totalEntries(): number {
    return this._entries.size;
  }

  public get capacityUsed(): number {
    return this._config.capacity > 0 ? this._totalSize / this._config.capacity : 0;
  }

  // Connection Management
  public async connect(): AsyncResult<void> {
    if (this._isConnected) {
      return { success: true };
    }

    try {
      // Initialize MCP connection based on provider
      switch (this._config.provider) {
        case MemoryProvider.MEMBASE_MCP:
          await this.connectMembaseMCP();
          break;
        case MemoryProvider.REDIS:
          await this.connectRedis();
          break;
        case MemoryProvider.IPFS:
          await this.connectIPFS();
          break;
        default:
          throw new MemoryConnectionError(
            `Unsupported memory provider: ${this._config.provider}`,
            this._config.provider
          );
      }

      this._isConnected = true;
      this.emit('connected', { agentId: this._agentId, provider: this._config.provider });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryConnectionError(String(error), this._config.provider)
      };
    }
  }

  public async disconnect(): AsyncResult<void> {
    if (!this._isConnected) {
      return { success: true };
    }

    try {
      // Close connections and cleanup
      await this.cleanupConnections();

      this._isConnected = false;
      this.emit('disconnected', { agentId: this._agentId, provider: this._config.provider });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryConnectionError(String(error), this._config.provider)
      };
    }
  }

  // Memory Operations
  public async store<T>(
    key: string,
    value: T,
    metadata: Partial<MemoryMetadata> = {},
    ttl?: number
  ): AsyncResult<void> {
    try {
      this.validateKey(key);

      if (!this._isConnected) {
        throw new MemoryConnectionError(
          'Memory system is not connected',
          this._config.provider
        );
      }

      // Check capacity before storing
      const estimatedSize = this.estimateSize(value);
      if (this._config.capacity > 0 && this._totalSize + estimatedSize > this._config.capacity) {
        // Try to free space by removing expired/low priority entries
        await this.freeSpace(estimatedSize);

        if (this._totalSize + estimatedSize > this._config.capacity) {
          throw new MemoryCapacityError(
            'Insufficient memory capacity',
            this._totalSize + estimatedSize,
            this._config.capacity
          );
        }
      }

      const entry = await this.createMemoryEntry(key, value, metadata, ttl);

      // Encrypt if enabled
      let processedEntry = entry;
      if (this._encryptionEnabled) {
        processedEntry = await this.encryptEntry(entry);
      }

      // Compress if enabled
      if (this._compressionEnabled) {
        processedEntry = await this.compressEntry(processedEntry);
      }

      // Store in provider
      await this.storeInProvider(processedEntry);

      // Update local indexes
      this.updateIndexes(key, entry);
      this._entries.set(key, entry);
      this._totalSize += estimatedSize;

      this.emit('stored', {
        key,
        type: entry.metadata.type,
        size: estimatedSize,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryStorageError(String(error), key, 'store')
      };
    }
  }

  public async retrieve<T>(key: string): AsyncResult<T | undefined> {
    try {
      this.validateKey(key);

      if (!this._isConnected) {
        throw new MemoryConnectionError(
          'Memory system is not connected',
          this._config.provider
        );
      }

      // Try local cache first
      const localEntry = this._entries.get(key);
      if (localEntry && !this.isExpired(localEntry)) {
        return { success: true, data: localEntry.value as T };
      }

      // Retrieve from provider
      const entry = await this.retrieveFromProvider<T>(key);
      if (!entry) {
        return { success: true, data: undefined };
      }

      // Check if expired
      if (this.isExpired(entry)) {
        await this.delete(key);
        return { success: true, data: undefined };
      }

      // Decrypt if needed
      let processedEntry = entry;
      if (this._encryptionEnabled) {
        processedEntry = await this.decryptEntry(processedEntry);
      }

      // Decompress if needed
      if (this._compressionEnabled) {
        processedEntry = await this.decompressEntry(processedEntry);
      }

      // Update local cache
      this._entries.set(key, processedEntry);

      this.emit('retrieved', {
        key,
        type: processedEntry.metadata.type,
        agentId: this._agentId
      });

      return { success: true, data: processedEntry.value as T };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryRetrievalError(String(error), key)
      };
    }
  }

  public async delete(key: string): AsyncResult<boolean> {
    try {
      this.validateKey(key);

      if (!this._isConnected) {
        throw new MemoryConnectionError(
          'Memory system is not connected',
          this._config.provider
        );
      }

      const entry = this._entries.get(key);
      const deleted = await this.deleteFromProvider(key);

      if (deleted && entry) {
        this.removeFromIndexes(key, entry);
        this._entries.delete(key);
        this._totalSize -= this.estimateSize(entry.value);

        this.emit('deleted', {
          key,
          type: entry.metadata.type,
          agentId: this._agentId
        });
      }

      return { success: true, data: deleted };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryStorageError(String(error), key, 'delete')
      };
    }
  }

  public async search<T>(options: MemorySearchOptions): AsyncResult<MemoryEntry<T>[]> {
    try {
      if (!this._isConnected) {
        throw new MemoryConnectionError(
          'Memory system is not connected',
          this._config.provider
        );
      }

      let candidateKeys = new Set<string>();

      // Filter by type
      if (options.type) {
        const typeKeys = this._typeIndex.get(options.type) || new Set();
        candidateKeys = new Set(typeKeys);
      } else {
        candidateKeys = new Set(this._entries.keys());
      }

      // Filter by priority
      if (options.priority) {
        const priorityKeys = this._priorityIndex.get(options.priority) || new Set();
        candidateKeys = new Set([...candidateKeys].filter(key => priorityKeys.has(key)));
      }

      // Filter by tags
      if (options.tags && options.tags.length > 0) {
        for (const tag of options.tags) {
          const tagKeys = this._tagIndex.get(tag) || new Set();
          candidateKeys = new Set([...candidateKeys].filter(key => tagKeys.has(key)));
        }
      }

      // Get entries and apply additional filters
      const entries: MemoryEntry<T>[] = [];
      for (const key of candidateKeys) {
        const entry = this._entries.get(key);
        if (!entry || this.isExpired(entry)) continue;

        // Apply time filters
        if (options.since && entry.timestamp < options.since.getTime()) continue;
        if (options.until && entry.timestamp > options.until.getTime()) continue;

        entries.push(entry as MemoryEntry<T>);
      }

      // Sort by timestamp (newest first)
      entries.sort((a, b) => b.timestamp - a.timestamp);

      // Apply pagination
      const start = options.offset || 0;
      const end = options.limit ? start + options.limit : entries.length;
      const paginatedEntries = entries.slice(start, end);

      return { success: true, data: paginatedEntries };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'MEMORY_SEARCH_ERROR')
      };
    }
  }

  public async getStats(): AsyncResult<MemoryStats> {
    try {
      const entriesByType: Record<MemoryType, number> = {
        [MemoryType.EXPERIENCE]: 0,
        [MemoryType.KNOWLEDGE]: 0,
        [MemoryType.CONTEXT]: 0,
        [MemoryType.CONFIGURATION]: 0,
        [MemoryType.STATE]: 0,
        [MemoryType.TRANSACTION]: 0
      };

      const entriesByPriority: Record<MemoryPriority, number> = {
        [MemoryPriority.CRITICAL]: 0,
        [MemoryPriority.HIGH]: 0,
        [MemoryPriority.MEDIUM]: 0,
        [MemoryPriority.LOW]: 0
      };

      let oldestEntry: Date | undefined;
      let newestEntry: Date | undefined;

      for (const entry of this._entries.values()) {
        if (this.isExpired(entry)) continue;

        entriesByType[entry.metadata.type]++;
        entriesByPriority[entry.metadata.priority]++;

        const entryDate = new Date(entry.timestamp);
        if (!oldestEntry || entryDate < oldestEntry) {
          oldestEntry = entryDate;
        }
        if (!newestEntry || entryDate > newestEntry) {
          newestEntry = entryDate;
        }
      }

      const stats: MemoryStats = {
        totalEntries: this._entries.size,
        totalSize: this._totalSize,
        capacityUsed: this.capacityUsed,
        entriesByType,
        entriesByPriority,
        oldestEntry,
        newestEntry
      };

      return { success: true, data: stats };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'MEMORY_STATS_ERROR')
      };
    }
  }

  // Backup and Restoration
  public async createBackup(): AsyncResult<MemoryBackup> {
    try {
      const statsResult = await this.getStats();
      if (!statsResult.success) {
        throw statsResult.error;
      }

      const entries = Array.from(this._entries.values())
        .filter(entry => !this.isExpired(entry));

      const backup: MemoryBackup = {
        id: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        timestamp: new Date(),
        agentId: this._agentId,
        entries,
        stats: statsResult.data!,
        checksum: this.calculateChecksum(entries)
      };

      this._lastBackup = backup.timestamp;
      this.emit('backup_created', { backupId: backup.id, agentId: this._agentId });

      return { success: true, data: backup };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'BACKUP_ERROR')
      };
    }
  }

  public async restoreFromBackup(backup: MemoryBackup): AsyncResult<void> {
    try {
      // Verify backup integrity
      const calculatedChecksum = this.calculateChecksum(backup.entries);
      if (calculatedChecksum !== backup.checksum) {
        throw new MemoryError(
          'Backup checksum mismatch - data may be corrupted',
          'BACKUP_INTEGRITY_ERROR'
        );
      }

      // Clear current memory
      await this.clear();

      // Restore entries
      for (const entry of backup.entries) {
        this._entries.set(entry.key, entry);
        this.updateIndexes(entry.key, entry);
        this._totalSize += this.estimateSize(entry.value);
      }

      this.emit('backup_restored', { backupId: backup.id, agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'RESTORE_ERROR')
      };
    }
  }

  // Utility Methods
  public async clear(): AsyncResult<void> {
    try {
      if (!this._isConnected) {
        throw new MemoryConnectionError(
          'Memory system is not connected',
          this._config.provider
        );
      }

      await this.clearProvider();
      this._entries.clear();
      this.initializeIndexes();
      this._totalSize = 0;

      this.emit('cleared', { agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'CLEAR_ERROR')
      };
    }
  }

  public async cleanup(): AsyncResult<number> {
    try {
      let removedCount = 0;
      const expiredKeys: string[] = [];

      // Find expired entries
      for (const [key, entry] of this._entries) {
        if (this.isExpired(entry)) {
          expiredKeys.push(key);
        }
      }

      // Remove expired entries
      for (const key of expiredKeys) {
        const deleteResult = await this.delete(key);
        if (deleteResult.success && deleteResult.data) {
          removedCount++;
        }
      }

      this.emit('cleanup_completed', {
        removedCount,
        agentId: this._agentId
      });

      return { success: true, data: removedCount };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new MemoryError(String(error), 'CLEANUP_ERROR')
      };
    }
  }

  // Serialization
  public serialize(): string {
    const serializable = {
      agentId: this._agentId,
      config: this._config,
      entries: Array.from(this._entries.entries()),
      totalSize: this._totalSize,
      lastBackup: this._lastBackup?.toISOString()
    };

    return JSON.stringify(serializable);
  }

  public deserialize(data: string): MemorySystem {
    throw new Error('Use MemorySystem.fromSerialized() instead');
  }

  public static fromSerialized(data: string): MemorySystem {
    const parsed = JSON.parse(data);

    const memory = new MemorySystem(parsed.config, parsed.agentId);

    // Restore entries
    for (const [key, entry] of parsed.entries) {
      memory._entries.set(key, entry);
      memory.updateIndexes(key, entry);
    }

    (memory as any)._totalSize = parsed.totalSize;
    (memory as any)._lastBackup = parsed.lastBackup ? new Date(parsed.lastBackup) : undefined;

    return memory;
  }

  // Private Methods
  private async createMemoryEntry<T>(
    key: string,
    value: T,
    metadata: Partial<MemoryMetadata>,
    ttl?: number
  ): Promise<MemoryEntry<T>> {
    const now = Date.now();
    const effectiveTtl = ttl ?? this._config.ttlDefault;

    return {
      key,
      value,
      timestamp: now,
      ttl: effectiveTtl > 0 ? effectiveTtl : undefined,
      metadata: {
        type: metadata.type || MemoryType.EXPERIENCE,
        priority: metadata.priority || MemoryPriority.MEDIUM,
        source: metadata.source || 'agent_memory',
        tags: metadata.tags || [],
        encrypted: this._encryptionEnabled && (metadata.encrypted ?? true)
      }
    };
  }

  private isExpired(entry: MemoryEntry): boolean {
    if (!entry.ttl) return false;
    return Date.now() > (entry.timestamp + entry.ttl);
  }

  private estimateSize(value: unknown): number {
    return JSON.stringify(value).length * 2; // Rough estimate in bytes
  }

  private updateIndexes(key: string, entry: MemoryEntry): void {
    // Type index
    if (!this._typeIndex.has(entry.metadata.type)) {
      this._typeIndex.set(entry.metadata.type, new Set());
    }
    this._typeIndex.get(entry.metadata.type)!.add(key);

    // Priority index
    if (!this._priorityIndex.has(entry.metadata.priority)) {
      this._priorityIndex.set(entry.metadata.priority, new Set());
    }
    this._priorityIndex.get(entry.metadata.priority)!.add(key);

    // Tag index
    for (const tag of entry.metadata.tags) {
      if (!this._tagIndex.has(tag)) {
        this._tagIndex.set(tag, new Set());
      }
      this._tagIndex.get(tag)!.add(key);
    }
  }

  private removeFromIndexes(key: string, entry: MemoryEntry): void {
    this._typeIndex.get(entry.metadata.type)?.delete(key);
    this._priorityIndex.get(entry.metadata.priority)?.delete(key);

    for (const tag of entry.metadata.tags) {
      this._tagIndex.get(tag)?.delete(key);
    }
  }

  private initializeIndexes(): void {
    this._typeIndex.clear();
    this._priorityIndex.clear();
    this._tagIndex.clear();
  }

  private async freeSpace(requiredSize: number): Promise<void> {
    // Remove expired entries first
    await this.cleanup();

    if (this._totalSize + requiredSize <= this._config.capacity) {
      return;
    }

    // Remove low priority entries
    const lowPriorityEntries = Array.from(this._entries.entries())
      .filter(([, entry]) => entry.metadata.priority === MemoryPriority.LOW)
      .sort(([, a], [, b]) => a.timestamp - b.timestamp); // Oldest first

    for (const [key] of lowPriorityEntries) {
      await this.delete(key);
      if (this._totalSize + requiredSize <= this._config.capacity) {
        return;
      }
    }

    // If still not enough space, remove medium priority entries
    const mediumPriorityEntries = Array.from(this._entries.entries())
      .filter(([, entry]) => entry.metadata.priority === MemoryPriority.MEDIUM)
      .sort(([, a], [, b]) => a.timestamp - b.timestamp);

    for (const [key] of mediumPriorityEntries) {
      await this.delete(key);
      if (this._totalSize + requiredSize <= this._config.capacity) {
        return;
      }
    }
  }

  private calculateChecksum(entries: MemoryEntry[]): string {
    const data = JSON.stringify(entries.map(e => ({ key: e.key, value: e.value, timestamp: e.timestamp })));
    // Simple checksum - in production, use crypto.createHash
    return Buffer.from(data).toString('base64');
  }

  private validateKey(key: string): void {
    if (!key || key.trim() === '') {
      throw new ValidationError('Memory key cannot be empty', 'key', key, 'not_empty');
    }

    if (key.length > 255) {
      throw new ValidationError('Memory key too long', 'key', key, 'max_length_255');
    }
  }

  private validateConfiguration(config: MemoryConfig): void {
    if (!config) {
      throw new ValidationError('Memory configuration is required', 'config', config, 'not_null');
    }

    if (config.capacity < 0) {
      throw new ValidationError('Memory capacity must be non-negative', 'config.capacity', config.capacity, 'gte_0');
    }

    if (config.ttlDefault < 0) {
      throw new ValidationError('Default TTL must be non-negative', 'config.ttlDefault', config.ttlDefault, 'gte_0');
    }
  }

  // Provider-specific implementations (to be extended based on actual MCP integration)
  private async connectMembaseMCP(): Promise<void> {
    // Implement actual Membase MCP connection
    // This would use the MCP protocol to connect to Membase
    await this.sleep(100); // Simulate connection
  }

  private async connectRedis(): Promise<void> {
    // Implement Redis connection
    await this.sleep(100);
  }

  private async connectIPFS(): Promise<void> {
    // Implement IPFS connection
    await this.sleep(100);
  }

  private async cleanupConnections(): Promise<void> {
    // Cleanup provider connections
    await this.sleep(50);
  }

  private async storeInProvider(entry: MemoryEntry): Promise<void> {
    // Provider-specific storage implementation
    await this.sleep(10);
  }

  private async retrieveFromProvider<T>(key: string): Promise<MemoryEntry<T> | undefined> {
    // Provider-specific retrieval implementation
    await this.sleep(10);
    return this._entries.get(key) as MemoryEntry<T> | undefined;
  }

  private async deleteFromProvider(key: string): Promise<boolean> {
    // Provider-specific deletion implementation
    await this.sleep(10);
    return true;
  }

  private async clearProvider(): Promise<void> {
    // Provider-specific clear implementation
    await this.sleep(50);
  }

  private async encryptEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    // Implement encryption logic
    return entry; // For now, return as-is
  }

  private async decryptEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    // Implement decryption logic
    return entry; // For now, return as-is
  }

  private async compressEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    // Implement compression logic
    return entry; // For now, return as-is
  }

  private async decompressEntry(entry: MemoryEntry): Promise<MemoryEntry> {
    // Implement decompression logic
    return entry; // For now, return as-is
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}