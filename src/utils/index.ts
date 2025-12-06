/**
 * AETERNA Utility Functions
 * Production-grade helper functions and utilities
 */

import { AgentId, NetworkType, Result, AsyncResult } from '../types';
import { AeternaError, ErrorUtils } from '../errors';
import crypto from 'crypto';

/**
 * UUID generation for agent IDs
 */
export class IdGenerator {
  public static generateAgentId(network: NetworkType): AgentId {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16);
    const value = `aeterna_${network}_${timestamp}_${randomBytes.toString('hex')}`;

    return {
      value,
      timestamp,
      network
    };
  }

  public static generateEventId(): string {
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(8);
    return `event_${timestamp}_${randomBytes.toString('hex')}`;
  }

  public static generateTransactionId(): string {
    return `tx_${Date.now()}_${crypto.randomUUID()}`;
  }
}

/**
 * Type guards for runtime type checking
 */
export class TypeGuards {
  public static isAgentId(obj: unknown): obj is AgentId {
    return typeof obj === 'object' &&
           obj !== null &&
           'value' in obj &&
           'timestamp' in obj &&
           'network' in obj &&
           typeof (obj as any).value === 'string' &&
           typeof (obj as any).timestamp === 'number' &&
           Object.values(NetworkType).includes((obj as any).network);
  }

  public static isResult<T>(obj: unknown): obj is Result<T> {
    return typeof obj === 'object' &&
           obj !== null &&
           'success' in obj &&
           typeof (obj as any).success === 'boolean';
  }

  public static isError(obj: unknown): obj is Error {
    return obj instanceof Error;
  }

  public static isAeternaError(obj: unknown): obj is AeternaError {
    return obj instanceof AeternaError;
  }
}

/**
 * Async utilities for promise handling
 */
export class AsyncUtils {
  /**
   * Wraps async operations in Result pattern
   */
  public static async wrapAsync<T>(
    operation: () => Promise<T>
  ): Promise<Result<T, AeternaError>> {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error) {
      const aeternaError = error instanceof AeternaError
        ? error
        : new AeternaError(
            error instanceof Error ? error.message : String(error),
            'ASYNC_OPERATION_ERROR',
            { originalError: error }
          );

      return { success: false, error: aeternaError };
    }
  }

  /**
   * Retry mechanism with exponential backoff
   */
  public static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    initialDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) {
          throw lastError;
        }

        if (!ErrorUtils.isRetryable(lastError)) {
          throw lastError;
        }

        const delay = ErrorUtils.getRetryDelay(lastError, attempt);
        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Promise timeout wrapper
   */
  public static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new AeternaError(
            errorMessage || `Operation timed out after ${timeoutMs}ms`,
            'TIMEOUT_ERROR'
          )),
          timeoutMs
        )
      )
    ]);
  }

  /**
   * Delay utility
   */
  public static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parallel execution with concurrency limit
   */
  public static async parallelLimit<T, R>(
    items: T[],
    mapper: (item: T) => Promise<R>,
    concurrency: number = 5
  ): Promise<R[]> {
    const results: R[] = [];
    const executing: Promise<void>[] = [];

    for (const item of items) {
      const promise = mapper(item).then(result => {
        results.push(result);
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        // Remove completed promises
        for (let i = executing.length - 1; i >= 0; i--) {
          if (await Promise.race([executing[i].then(() => true), Promise.resolve(false)])) {
            executing.splice(i, 1);
          }
        }
      }
    }

    await Promise.all(executing);
    return results;
  }
}

/**
 * Configuration validation utilities
 */
export class ConfigValidator {
  public static validateRequired(
    config: Record<string, unknown>,
    requiredFields: string[],
    context: string = 'configuration'
  ): void {
    for (const field of requiredFields) {
      if (!(field in config) || config[field] === undefined || config[field] === null) {
        throw new AeternaError(
          `Required field '${field}' is missing`,
          'VALIDATION_ERROR',
          { context, field, config }
        );
      }
    }
  }

  public static validateNetwork(network: string): asserts network is NetworkType {
    if (!Object.values(NetworkType).includes(network as NetworkType)) {
      throw new AeternaError(
        `Invalid network type: ${network}`,
        'VALIDATION_ERROR',
        { validNetworks: Object.values(NetworkType) }
      );
    }
  }

  public static validateNumeric(
    value: unknown,
    field: string,
    options: {
      min?: number;
      max?: number;
      integer?: boolean;
    } = {}
  ): void {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new AeternaError(
        `Field '${field}' must be a number`,
        'VALIDATION_ERROR',
        { field, value, type: typeof value }
      );
    }

    if (options.integer && !Number.isInteger(value)) {
      throw new AeternaError(
        `Field '${field}' must be an integer`,
        'VALIDATION_ERROR',
        { field, value }
      );
    }

    if (options.min !== undefined && value < options.min) {
      throw new AeternaError(
        `Field '${field}' must be >= ${options.min}`,
        'VALIDATION_ERROR',
        { field, value, min: options.min }
      );
    }

    if (options.max !== undefined && value > options.max) {
      throw new AeternaError(
        `Field '${field}' must be <= ${options.max}`,
        'VALIDATION_ERROR',
        { field, value, max: options.max }
      );
    }
  }
}

/**
 * Encryption utilities
 */
export class CryptoUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;

  public static generateKey(): string {
    return crypto.randomBytes(this.KEY_LENGTH).toString('hex');
  }

  public static encrypt(data: string, key: string): string {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(this.IV_LENGTH);

    const cipher = crypto.createCipher(this.ALGORITHM, keyBuffer);
    cipher.setAAD(Buffer.from('aeterna'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
  }

  public static decrypt(encryptedData: string, key: string): string {
    const [ivHex, tagHex, encrypted] = encryptedData.split(':');

    if (!ivHex || !tagHex || !encrypted) {
      throw new AeternaError(
        'Invalid encrypted data format',
        'DECRYPTION_ERROR'
      );
    }

    const keyBuffer = Buffer.from(key, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipher(this.ALGORITHM, keyBuffer);
    decipher.setAAD(Buffer.from('aeterna'));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  public static hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  public static sign(data: string, privateKey: string): string {
    const sign = crypto.createSign('SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'hex');
  }

  public static verify(data: string, signature: string, publicKey: string): boolean {
    const verify = crypto.createVerify('SHA256');
    verify.update(data);
    return verify.verify(publicKey, signature, 'hex');
  }
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();

  public static start(label: string): void {
    this.timers.set(label, performance.now());
  }

  public static end(label: string): number {
    const start = this.timers.get(label);
    if (!start) {
      throw new AeternaError(
        `Timer '${label}' was not started`,
        'TIMER_ERROR'
      );
    }

    const duration = performance.now() - start;
    this.timers.delete(label);
    return duration;
  }

  public static measure<T>(label: string, operation: () => T): T;
  public static measure<T>(label: string, operation: () => Promise<T>): Promise<T>;
  public static measure<T>(
    label: string,
    operation: () => T | Promise<T>
  ): T | Promise<T> {
    this.start(label);

    try {
      const result = operation();

      if (result instanceof Promise) {
        return result.finally(() => {
          const duration = this.end(label);
          console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
        });
      } else {
        const duration = this.end(label);
        console.debug(`[Performance] ${label}: ${duration.toFixed(2)}ms`);
        return result;
      }
    } catch (error) {
      if (this.timers.has(label)) {
        this.end(label);
      }
      throw error;
    }
  }
}

/**
 * Serialization utilities
 */
export class SerializationUtils {
  public static serialize(data: unknown): string {
    return JSON.stringify(data, (key, value) => {
      if (value instanceof Date) {
        return { __type: 'Date', value: value.toISOString() };
      }
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      if (value instanceof Set) {
        return { __type: 'Set', value: Array.from(value) };
      }
      if (typeof value === 'bigint') {
        return { __type: 'BigInt', value: value.toString() };
      }
      return value;
    });
  }

  public static deserialize<T>(serialized: string): T {
    return JSON.parse(serialized, (key, value) => {
      if (value && typeof value === 'object' && '__type' in value) {
        switch (value.__type) {
          case 'Date':
            return new Date(value.value);
          case 'Map':
            return new Map(value.value);
          case 'Set':
            return new Set(value.value);
          case 'BigInt':
            return BigInt(value.value);
        }
      }
      return value;
    });
  }
}

/**
 * Rate limiting utilities
 */
export class RateLimiter {
  private windows: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    private readonly windowSize: number = 60000, // 1 minute
    private readonly maxRequests: number = 100
  ) {}

  public async limit(key: string): Promise<boolean> {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || now >= window.resetTime) {
      window = { count: 0, resetTime: now + this.windowSize };
      this.windows.set(key, window);
    }

    if (window.count >= this.maxRequests) {
      return false;
    }

    window.count++;
    return true;
  }

  public getRemaining(key: string): number {
    const window = this.windows.get(key);
    if (!window || Date.now() >= window.resetTime) {
      return this.maxRequests;
    }
    return Math.max(0, this.maxRequests - window.count);
  }

  public getResetTime(key: string): number {
    const window = this.windows.get(key);
    return window?.resetTime || Date.now();
  }
}

/**
 * Memory utilities for object deep cloning and comparison
 */
export class ObjectUtils {
  public static deepClone<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj.getTime()) as any;
    }

    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as any;
    }

    if (obj instanceof Map) {
      const cloned = new Map();
      obj.forEach((value, key) => {
        cloned.set(key, this.deepClone(value));
      });
      return cloned as any;
    }

    if (obj instanceof Set) {
      const cloned = new Set();
      obj.forEach(value => {
        cloned.add(this.deepClone(value));
      });
      return cloned as any;
    }

    if (typeof obj === 'object') {
      const cloned: any = {};
      Object.keys(obj).forEach(key => {
        cloned[key] = this.deepClone((obj as any)[key]);
      });
      return cloned;
    }

    return obj;
  }

  public static deepEqual<T>(a: T, b: T): boolean {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;

    if (typeof a === 'object') {
      if (Array.isArray(a) !== Array.isArray(b)) return false;

      if (Array.isArray(a)) {
        if (a.length !== (b as any).length) return false;
        return a.every((item, index) => this.deepEqual(item, (b as any)[index]));
      }

      const keysA = Object.keys(a);
      const keysB = Object.keys(b as any);

      if (keysA.length !== keysB.length) return false;

      return keysA.every(key =>
        keysB.includes(key) &&
        this.deepEqual((a as any)[key], (b as any)[key])
      );
    }

    return false;
  }
}

export {
  IdGenerator,
  TypeGuards,
  AsyncUtils,
  ConfigValidator,
  CryptoUtils,
  PerformanceMonitor,
  SerializationUtils,
  RateLimiter,
  ObjectUtils
};