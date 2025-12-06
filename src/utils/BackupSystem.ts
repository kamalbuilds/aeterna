/**
 * AETERNA Backup System
 * Typed serialization and restoration with strict TypeScript typing
 */

import { EventEmitter } from 'events';
import { createHash } from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import {
  AsyncResult,
  AgentId,
  Serializable,
  Deserializable
} from '../types';
import {
  SystemError,
  ValidationError
} from '../errors';

interface BackupMetadata {
  readonly id: string;
  readonly agentId: AgentId;
  readonly timestamp: Date;
  readonly version: string;
  readonly description?: string;
  readonly size: number;
  readonly compressed: boolean;
  readonly encrypted: boolean;
  readonly checksum: string;
  readonly components: readonly string[];
}

interface SystemBackup<T = Record<string, unknown>> {
  readonly metadata: BackupMetadata;
  readonly data: T;
}

interface BackupComponent {
  readonly name: string;
  readonly serializer: Serializable;
  readonly priority: BackupPriority;
  readonly dependencies: readonly string[];
}

enum BackupPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3
}

interface RestoreOptions {
  readonly validateChecksum: boolean;
  readonly allowPartialRestore: boolean;
  readonly skipDependencyCheck: boolean;
  readonly components?: readonly string[];
}

interface BackupSchedule {
  readonly enabled: boolean;
  readonly interval: number; // in milliseconds
  readonly maxBackups: number;
  readonly retentionDays: number;
  readonly compressionEnabled: boolean;
  readonly encryptionEnabled: boolean;
}

interface BackupStorage {
  readonly provider: StorageProvider;
  readonly location: string;
  readonly credentials?: StorageCredentials;
  readonly maxSize: number;
  readonly redundancy: boolean;
}

enum StorageProvider {
  LOCAL = 'local',
  S3 = 's3',
  IPFS = 'ipfs',
  ARWEAVE = 'arweave'
}

interface StorageCredentials {
  readonly accessKey?: string;
  readonly secretKey?: string;
  readonly region?: string;
  readonly endpoint?: string;
}

interface RestorePoint {
  readonly id: string;
  readonly backup: SystemBackup;
  readonly createdAt: Date;
  readonly verified: boolean;
  readonly restorable: boolean;
  readonly issues: readonly string[];
}

export class BackupSystem extends EventEmitter {
  private readonly _agentId: AgentId;
  private readonly _components: Map<string, BackupComponent>;
  private readonly _backups: Map<string, SystemBackup>;
  private readonly _restorePoints: Map<string, RestorePoint>;
  private readonly _schedule: BackupSchedule;
  private readonly _storage: BackupStorage;
  private _isInitialized: boolean;
  private _scheduleInterval?: NodeJS.Timeout;
  private _encryptionKey?: string;

  constructor(
    agentId: AgentId,
    schedule: BackupSchedule,
    storage: BackupStorage,
    encryptionKey?: string
  ) {
    super();
    this.setMaxListeners(20);

    this.validateConfiguration(schedule, storage);

    this._agentId = agentId;
    this._components = new Map();
    this._backups = new Map();
    this._restorePoints = new Map();
    this._schedule = schedule;
    this._storage = storage;
    this._isInitialized = false;
    this._encryptionKey = encryptionKey;
  }

  // Public API
  public get agentId(): AgentId {
    return this._agentId;
  }

  public get isInitialized(): boolean {
    return this._isInitialized;
  }

  public get components(): readonly string[] {
    return Array.from(this._components.keys());
  }

  public get schedule(): BackupSchedule {
    return this._schedule;
  }

  public get storage(): BackupStorage {
    return this._storage;
  }

  // Initialization
  public async initialize(): AsyncResult<void> {
    if (this._isInitialized) {
      return { success: true };
    }

    try {
      // Initialize storage provider
      await this.initializeStorage();

      // Load existing backups
      await this.loadExistingBackups();

      // Start scheduled backups if enabled
      if (this._schedule.enabled) {
        this.startScheduledBackups();
      }

      this._isInitialized = true;
      this.emit('initialized', { agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_INIT_ERROR', 'backup_system')
      };
    }
  }

  public async shutdown(): AsyncResult<void> {
    try {
      // Stop scheduled backups
      if (this._scheduleInterval) {
        clearInterval(this._scheduleInterval);
      }

      // Cleanup storage connections
      await this.cleanupStorage();

      this._isInitialized = false;
      this.emit('shutdown', { agentId: this._agentId });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_SHUTDOWN_ERROR', 'backup_system')
      };
    }
  }

  // Component Management
  public registerComponent(component: BackupComponent): AsyncResult<void> {
    try {
      this.validateComponent(component);

      // Check for circular dependencies
      if (this.hasCircularDependencies(component)) {
        throw new ValidationError(
          'Component has circular dependencies',
          'component.dependencies',
          component.dependencies,
          'no_circular_deps'
        );
      }

      this._components.set(component.name, component);

      this.emit('component_registered', {
        componentName: component.name,
        priority: component.priority,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'COMPONENT_REGISTRATION_ERROR', 'backup_system')
      };
    }
  }

  public unregisterComponent(componentName: string): AsyncResult<void> {
    try {
      if (!this._components.has(componentName)) {
        throw new ValidationError('Component not found', 'componentName', componentName, 'exists');
      }

      // Check if other components depend on this one
      const dependents = this.findDependents(componentName);
      if (dependents.length > 0) {
        throw new ValidationError(
          `Cannot remove component ${componentName} - other components depend on it: ${dependents.join(', ')}`,
          'componentName',
          componentName,
          'no_dependents'
        );
      }

      this._components.delete(componentName);

      this.emit('component_unregistered', {
        componentName,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'COMPONENT_UNREGISTRATION_ERROR', 'backup_system')
      };
    }
  }

  // Backup Operations
  public async createBackup(
    description?: string,
    components?: readonly string[]
  ): AsyncResult<SystemBackup> {
    try {
      if (!this._isInitialized) {
        throw new SystemError('Backup system not initialized', 'NOT_INITIALIZED', 'backup_system');
      }

      // Determine components to back up
      const targetComponents = components || Array.from(this._components.keys());
      this.validateComponentList(targetComponents);

      // Sort components by priority and dependencies
      const sortedComponents = this.sortComponentsByDependencies(targetComponents);

      // Serialize all components
      const serializedData: Record<string, string> = {};
      for (const componentName of sortedComponents) {
        const component = this._components.get(componentName);
        if (component) {
          try {
            serializedData[componentName] = component.serializer.serialize();
          } catch (error) {
            throw new SystemError(
              `Failed to serialize component ${componentName}: ${error}`,
              'SERIALIZATION_ERROR',
              'backup_system'
            );
          }
        }
      }

      // Create backup metadata
      const metadata = this.createBackupMetadata(description, targetComponents, serializedData);

      // Create system backup
      const backup: SystemBackup = {
        metadata,
        data: serializedData
      };

      // Process backup (compress, encrypt, etc.)
      const processedBackup = await this.processBackup(backup);

      // Store backup
      await this.storeBackup(processedBackup);

      // Cache backup locally
      this._backups.set(metadata.id, processedBackup);

      // Cleanup old backups if needed
      await this.cleanupOldBackups();

      this.emit('backup_created', {
        backupId: metadata.id,
        components: targetComponents,
        size: metadata.size,
        agentId: this._agentId
      });

      return { success: true, data: processedBackup };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_CREATION_ERROR', 'backup_system')
      };
    }
  }

  public async restoreBackup(
    backupId: string,
    options: RestoreOptions = {
      validateChecksum: true,
      allowPartialRestore: false,
      skipDependencyCheck: false
    }
  ): AsyncResult<void> {
    try {
      if (!this._isInitialized) {
        throw new SystemError('Backup system not initialized', 'NOT_INITIALIZED', 'backup_system');
      }

      // Load backup
      const backup = await this.loadBackup(backupId);
      if (!backup) {
        throw new SystemError(`Backup ${backupId} not found`, 'BACKUP_NOT_FOUND', 'backup_system');
      }

      // Validate backup integrity
      if (options.validateChecksum && !this.validateBackupIntegrity(backup)) {
        throw new SystemError('Backup integrity check failed', 'INTEGRITY_CHECK_FAILED', 'backup_system');
      }

      // Determine components to restore
      const targetComponents = options.components || backup.metadata.components;

      // Check component dependencies
      if (!options.skipDependencyCheck) {
        const missingDeps = this.checkDependencies(targetComponents);
        if (missingDeps.length > 0 && !options.allowPartialRestore) {
          throw new SystemError(
            `Missing dependencies: ${missingDeps.join(', ')}`,
            'MISSING_DEPENDENCIES',
            'backup_system'
          );
        }
      }

      // Sort components by dependencies for proper restore order
      const sortedComponents = this.sortComponentsByDependencies(targetComponents);

      // Restore components
      const restoredComponents: string[] = [];
      const failedComponents: Array<{ name: string; error: string }> = [];

      for (const componentName of sortedComponents) {
        try {
          const component = this._components.get(componentName);
          const serializedData = backup.data[componentName];

          if (component && serializedData) {
            // Restore component from serialized data
            await this.restoreComponent(component, serializedData);
            restoredComponents.push(componentName);
          } else if (!options.allowPartialRestore) {
            throw new SystemError(`Component ${componentName} data not found in backup`, 'COMPONENT_DATA_NOT_FOUND', 'backup_system');
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          failedComponents.push({ name: componentName, error: errorMsg });

          if (!options.allowPartialRestore) {
            throw error;
          }
        }
      }

      this.emit('backup_restored', {
        backupId,
        restoredComponents,
        failedComponents,
        agentId: this._agentId
      });

      if (failedComponents.length > 0 && !options.allowPartialRestore) {
        throw new SystemError(
          `Failed to restore components: ${failedComponents.map(f => f.name).join(', ')}`,
          'PARTIAL_RESTORE_FAILED',
          'backup_system'
        );
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_RESTORE_ERROR', 'backup_system')
      };
    }
  }

  public async listBackups(): AsyncResult<BackupMetadata[]> {
    try {
      const backupList = await this.loadBackupList();
      return { success: true, data: backupList };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_LIST_ERROR', 'backup_system')
      };
    }
  }

  public async deleteBackup(backupId: string): AsyncResult<void> {
    try {
      if (!this._backups.has(backupId)) {
        throw new SystemError(`Backup ${backupId} not found`, 'BACKUP_NOT_FOUND', 'backup_system');
      }

      // Delete from storage
      await this.deleteFromStorage(backupId);

      // Remove from local cache
      this._backups.delete(backupId);

      this.emit('backup_deleted', {
        backupId,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'BACKUP_DELETION_ERROR', 'backup_system')
      };
    }
  }

  // Restore Point Management
  public async createRestorePoint(description?: string): AsyncResult<RestorePoint> {
    try {
      const backupResult = await this.createBackup(description);
      if (!backupResult.success || !backupResult.data) {
        throw backupResult.error || new SystemError('Failed to create backup for restore point', 'RESTORE_POINT_ERROR', 'backup_system');
      }

      const restorePoint: RestorePoint = {
        id: `rp_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        backup: backupResult.data,
        createdAt: new Date(),
        verified: true,
        restorable: true,
        issues: []
      };

      this._restorePoints.set(restorePoint.id, restorePoint);

      this.emit('restore_point_created', {
        restorePointId: restorePoint.id,
        backupId: backupResult.data.metadata.id,
        agentId: this._agentId
      });

      return { success: true, data: restorePoint };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'RESTORE_POINT_CREATION_ERROR', 'backup_system')
      };
    }
  }

  public async restoreToPoint(restorePointId: string): AsyncResult<void> {
    try {
      const restorePoint = this._restorePoints.get(restorePointId);
      if (!restorePoint) {
        throw new SystemError(`Restore point ${restorePointId} not found`, 'RESTORE_POINT_NOT_FOUND', 'backup_system');
      }

      if (!restorePoint.restorable) {
        throw new SystemError('Restore point is not restorable', 'RESTORE_POINT_NOT_RESTORABLE', 'backup_system');
      }

      const restoreResult = await this.restoreBackup(restorePoint.backup.metadata.id);
      if (!restoreResult.success) {
        throw restoreResult.error || new SystemError('Failed to restore from restore point', 'RESTORE_POINT_RESTORE_ERROR', 'backup_system');
      }

      this.emit('restored_to_point', {
        restorePointId,
        backupId: restorePoint.backup.metadata.id,
        agentId: this._agentId
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new SystemError(String(error), 'RESTORE_POINT_RESTORE_ERROR', 'backup_system')
      };
    }
  }

  // Private Methods
  private validateConfiguration(schedule: BackupSchedule, storage: BackupStorage): void {
    if (schedule.interval < 60000) { // Minimum 1 minute
      throw new ValidationError('Backup interval must be at least 1 minute', 'schedule.interval', schedule.interval, 'gte_60000');
    }

    if (schedule.maxBackups < 1) {
      throw new ValidationError('Maximum backups must be at least 1', 'schedule.maxBackups', schedule.maxBackups, 'gte_1');
    }

    if (!storage.location) {
      throw new ValidationError('Storage location is required', 'storage.location', storage.location, 'not_empty');
    }

    if (storage.maxSize <= 0) {
      throw new ValidationError('Storage max size must be positive', 'storage.maxSize', storage.maxSize, 'positive');
    }
  }

  private validateComponent(component: BackupComponent): void {
    if (!component.name || component.name.trim() === '') {
      throw new ValidationError('Component name is required', 'component.name', component.name, 'not_empty');
    }

    if (!component.serializer) {
      throw new ValidationError('Component serializer is required', 'component.serializer', component.serializer, 'not_null');
    }

    if (typeof component.serializer.serialize !== 'function') {
      throw new ValidationError('Component serializer must have serialize method', 'component.serializer.serialize', component.serializer.serialize, 'function');
    }
  }

  private validateComponentList(components: readonly string[]): void {
    for (const componentName of components) {
      if (!this._components.has(componentName)) {
        throw new ValidationError(`Component ${componentName} not registered`, 'componentName', componentName, 'registered');
      }
    }
  }

  private hasCircularDependencies(component: BackupComponent): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCircular = (name: string): boolean => {
      if (recursionStack.has(name)) {
        return true;
      }

      if (visited.has(name)) {
        return false;
      }

      visited.add(name);
      recursionStack.add(name);

      const comp = this._components.get(name) || component;
      for (const dep of comp.dependencies) {
        if (hasCircular(dep)) {
          return true;
        }
      }

      recursionStack.delete(name);
      return false;
    };

    return hasCircular(component.name);
  }

  private findDependents(componentName: string): string[] {
    const dependents: string[] = [];
    for (const [name, component] of this._components) {
      if (component.dependencies.includes(componentName)) {
        dependents.push(name);
      }
    }
    return dependents;
  }

  private sortComponentsByDependencies(componentNames: readonly string[]): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (name: string): void => {
      if (visiting.has(name)) {
        throw new SystemError(`Circular dependency detected involving ${name}`, 'CIRCULAR_DEPENDENCY', 'backup_system');
      }

      if (visited.has(name)) {
        return;
      }

      visiting.add(name);

      const component = this._components.get(name);
      if (component) {
        for (const dep of component.dependencies) {
          if (componentNames.includes(dep)) {
            visit(dep);
          }
        }
      }

      visiting.delete(name);
      visited.add(name);
      sorted.push(name);
    };

    for (const name of componentNames) {
      visit(name);
    }

    return sorted;
  }

  private checkDependencies(componentNames: readonly string[]): string[] {
    const missing: string[] = [];
    for (const name of componentNames) {
      const component = this._components.get(name);
      if (component) {
        for (const dep of component.dependencies) {
          if (!componentNames.includes(dep) && !this._components.has(dep)) {
            missing.push(dep);
          }
        }
      }
    }
    return Array.from(new Set(missing));
  }

  private createBackupMetadata(
    description: string | undefined,
    components: readonly string[],
    serializedData: Record<string, string>
  ): BackupMetadata {
    const dataString = JSON.stringify(serializedData);
    const size = Buffer.byteLength(dataString, 'utf8');
    const checksum = createHash('sha256').update(dataString).digest('hex');

    return {
      id: `backup_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      agentId: this._agentId,
      timestamp: new Date(),
      version: '1.0.0',
      description,
      size,
      compressed: this._schedule.compressionEnabled,
      encrypted: this._schedule.encryptionEnabled,
      checksum,
      components
    };
  }

  private async processBackup(backup: SystemBackup): Promise<SystemBackup> {
    let processedData = backup.data;

    // Compress if enabled
    if (this._schedule.compressionEnabled) {
      processedData = await this.compressBackupData(processedData);
    }

    // Encrypt if enabled
    if (this._schedule.encryptionEnabled && this._encryptionKey) {
      processedData = await this.encryptBackupData(processedData);
    }

    return {
      ...backup,
      data: processedData
    };
  }

  private async compressBackupData(data: Record<string, string>): Promise<Record<string, string>> {
    const compressed: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      const buffer = Buffer.from(value, 'utf8');
      const compressedBuffer = gzipSync(buffer);
      compressed[key] = compressedBuffer.toString('base64');
    }
    return compressed;
  }

  private async encryptBackupData(data: Record<string, string>): Promise<Record<string, string>> {
    // Simple encryption implementation - in production, use proper encryption
    const encrypted: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      encrypted[key] = Buffer.from(value).toString('base64');
    }
    return encrypted;
  }

  private validateBackupIntegrity(backup: SystemBackup): boolean {
    const dataString = JSON.stringify(backup.data);
    const calculatedChecksum = createHash('sha256').update(dataString).digest('hex');
    return calculatedChecksum === backup.metadata.checksum;
  }

  private async restoreComponent(component: BackupComponent, serializedData: string): Promise<void> {
    // In a real implementation, this would restore the component state
    // For now, we'll just validate that the serialized data can be used
    if (typeof component.serializer.deserialize === 'function') {
      component.serializer.deserialize(serializedData);
    }
  }

  private startScheduledBackups(): void {
    this._scheduleInterval = setInterval(async () => {
      try {
        await this.createBackup('Scheduled backup');
      } catch (error) {
        this.emit('scheduled_backup_error', {
          error: error instanceof Error ? error.message : String(error),
          agentId: this._agentId
        });
      }
    }, this._schedule.interval);
  }

  private async initializeStorage(): Promise<void> {
    // Initialize storage provider based on type
    switch (this._storage.provider) {
      case StorageProvider.LOCAL:
        await this.initializeLocalStorage();
        break;
      case StorageProvider.S3:
        await this.initializeS3Storage();
        break;
      case StorageProvider.IPFS:
        await this.initializeIpfsStorage();
        break;
      case StorageProvider.ARWEAVE:
        await this.initializeArweaveStorage();
        break;
      default:
        throw new SystemError(`Unsupported storage provider: ${this._storage.provider}`, 'UNSUPPORTED_STORAGE', 'backup_system');
    }
  }

  private async initializeLocalStorage(): Promise<void> {
    // Initialize local storage
    await this.sleep(100);
  }

  private async initializeS3Storage(): Promise<void> {
    // Initialize S3 storage
    await this.sleep(100);
  }

  private async initializeIpfsStorage(): Promise<void> {
    // Initialize IPFS storage
    await this.sleep(100);
  }

  private async initializeArweaveStorage(): Promise<void> {
    // Initialize Arweave storage
    await this.sleep(100);
  }

  private async cleanupStorage(): Promise<void> {
    // Cleanup storage connections
    await this.sleep(50);
  }

  private async loadExistingBackups(): Promise<void> {
    // Load existing backups from storage
    await this.sleep(100);
  }

  private async loadBackupList(): Promise<BackupMetadata[]> {
    // Load backup metadata list
    return Array.from(this._backups.values()).map(backup => backup.metadata);
  }

  private async loadBackup(backupId: string): Promise<SystemBackup | null> {
    return this._backups.get(backupId) || null;
  }

  private async storeBackup(backup: SystemBackup): Promise<void> {
    // Store backup in configured storage
    await this.sleep(100);
  }

  private async deleteFromStorage(backupId: string): Promise<void> {
    // Delete backup from storage
    await this.sleep(50);
  }

  private async cleanupOldBackups(): Promise<void> {
    if (this._backups.size <= this._schedule.maxBackups) {
      return;
    }

    // Sort backups by timestamp (oldest first)
    const sortedBackups = Array.from(this._backups.entries())
      .sort(([, a], [, b]) => a.metadata.timestamp.getTime() - b.metadata.timestamp.getTime());

    // Remove oldest backups exceeding the limit
    const toRemove = sortedBackups.slice(0, this._backups.size - this._schedule.maxBackups);

    for (const [backupId] of toRemove) {
      await this.deleteBackup(backupId);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}