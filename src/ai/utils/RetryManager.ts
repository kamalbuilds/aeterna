// AETERNA Retry Manager Utility
// Production-level retry logic with exponential backoff and jitter

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase?: number;
  jitterFactor?: number;
  shouldRetry?: (error: any, attemptNumber: number) => boolean;
}

export interface RetryStats {
  totalAttempts: number;
  successfulRetries: number;
  failedRetries: number;
  averageAttempts: number;
  lastAttemptTimestamp: Date;
}

export class RetryManager {
  private config: Required<RetryConfig>;
  private stats: RetryStats;

  constructor(config: RetryConfig) {
    this.config = {
      maxRetries: config.maxRetries,
      baseDelay: config.baseDelay,
      maxDelay: config.maxDelay,
      exponentialBase: config.exponentialBase || 2,
      jitterFactor: config.jitterFactor || 0.1,
      shouldRetry: config.shouldRetry || this.defaultShouldRetry.bind(this)
    };

    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      lastAttemptTimestamp: new Date()
    };
  }

  private defaultShouldRetry(error: any, attemptNumber: number): boolean {
    // Don't retry on authentication errors
    if (error?.status === 401 || error?.status === 403) {
      return false;
    }

    // Don't retry on client errors (4xx), except for rate limiting and timeout
    if (error?.status >= 400 && error?.status < 500) {
      return error?.status === 429 || error?.status === 408;
    }

    // Retry on server errors (5xx)
    if (error?.status >= 500) {
      return true;
    }

    // Retry on network errors
    if (error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry on timeout errors
    if (error?.name === 'AbortError' || error?.code === 'TIMEOUT') {
      return true;
    }

    // Don't retry by default for unknown errors after a few attempts
    return attemptNumber < 2;
  }

  private calculateDelay(attemptNumber: number): number {
    // Exponential backoff: baseDelay * (exponentialBase ^ attemptNumber)
    let delay = this.config.baseDelay * Math.pow(this.config.exponentialBase, attemptNumber);

    // Apply maximum delay cap
    delay = Math.min(delay, this.config.maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = delay * this.config.jitterFactor * (Math.random() * 2 - 1); // Random between -jitterFactor and +jitterFactor
    delay += jitter;

    // Ensure delay is positive
    return Math.max(0, Math.round(delay));
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private updateStats(totalAttempts: number, success: boolean): void {
    this.stats.totalAttempts += totalAttempts;
    this.stats.lastAttemptTimestamp = new Date();

    if (success) {
      this.stats.successfulRetries++;
    } else {
      this.stats.failedRetries++;
    }

    // Calculate running average
    const totalOperations = this.stats.successfulRetries + this.stats.failedRetries;
    this.stats.averageAttempts = this.stats.totalAttempts / Math.max(1, totalOperations);
  }

  public async execute<T>(
    operation: () => Promise<T>,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = customConfig ? { ...this.config, ...customConfig } : this.config;
    let lastError: any;
    let attemptNumber = 0;

    while (attemptNumber <= config.maxRetries) {
      try {
        const result = await operation();
        this.updateStats(attemptNumber + 1, true);
        return result;
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (attemptNumber >= config.maxRetries || !config.shouldRetry(error, attemptNumber)) {
          this.updateStats(attemptNumber + 1, false);
          throw error;
        }

        // Calculate delay for next attempt
        const delay = this.calculateDelay(attemptNumber);

        // Log retry attempt (in production, you'd use proper logging)
        console.warn(`Retry attempt ${attemptNumber + 1}/${config.maxRetries} after ${delay}ms delay`, {
          error: error.message,
          status: error.status,
          code: error.code
        });

        // Wait before retrying
        await this.sleep(delay);
        attemptNumber++;
      }
    }

    // This should never be reached due to the logic above, but TypeScript requires it
    this.updateStats(attemptNumber, false);
    throw lastError;
  }

  public async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    circuitBreakerOptions: {
      failureThreshold: number;
      resetTimeoutMs: number;
      monitoringPeriodMs?: number;
    }
  ): Promise<T> {
    // Simple circuit breaker implementation
    const now = Date.now();
    const monitoringPeriod = circuitBreakerOptions.monitoringPeriodMs || 60000; // 1 minute

    // Check recent failure rate
    const recentFailures = this.stats.failedRetries;
    const recentTotal = this.stats.successfulRetries + this.stats.failedRetries;

    if (recentTotal > 0) {
      const failureRate = recentFailures / recentTotal;

      if (failureRate > circuitBreakerOptions.failureThreshold) {
        const timeSinceLastAttempt = now - this.stats.lastAttemptTimestamp.getTime();

        if (timeSinceLastAttempt < circuitBreakerOptions.resetTimeoutMs) {
          throw new Error(`Circuit breaker open. Failure rate: ${failureRate.toFixed(2)}, threshold: ${circuitBreakerOptions.failureThreshold}`);
        }
      }
    }

    return this.execute(operation);
  }

  public async executeWithTimeoutAndRetry<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    retryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const wrappedOperation = async (): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        operation()
          .then(result => {
            clearTimeout(timeout);
            resolve(result);
          })
          .catch(error => {
            clearTimeout(timeout);
            reject(error);
          });
      });
    };

    return this.execute(wrappedOperation, retryConfig);
  }

  public getStats(): RetryStats {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      totalAttempts: 0,
      successfulRetries: 0,
      failedRetries: 0,
      averageAttempts: 0,
      lastAttemptTimestamp: new Date()
    };
  }

  public updateConfig(newConfig: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}