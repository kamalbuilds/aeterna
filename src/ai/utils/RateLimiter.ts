// AETERNA Rate Limiter Utility
// Production-level rate limiting with token bucket algorithm

export interface RateLimiterConfig {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  tokensPerMinute?: number;
  tokensPerHour?: number;
}

export interface RateLimiterStats {
  requestsThisMinute: number;
  requestsThisHour: number;
  tokensThisMinute: number;
  tokensThisHour: number;
  lastResetMinute: Date;
  lastResetHour: Date;
  isLimited: boolean;
  timeUntilReset: number;
}

export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private requestsThisMinute: number = 0;
  private requestsThisHour: number = 0;
  private tokensThisMinute: number = 0;
  private tokensThisHour: number = 0;
  private lastResetMinute: Date;
  private lastResetHour: Date;
  private waitQueue: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    tokens: number;
    timestamp: Date;
  }> = [];

  constructor(config: RateLimiterConfig) {
    this.config = {
      requestsPerMinute: config.requestsPerMinute || 60,
      requestsPerHour: config.requestsPerHour || 3600,
      tokensPerMinute: config.tokensPerMinute || 40000,
      tokensPerHour: config.tokensPerHour || 200000
    };

    const now = new Date();
    this.lastResetMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    this.lastResetHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Start cleanup interval for expired queue items
    setInterval(() => this.cleanupQueue(), 60000); // Every minute
  }

  private resetCountersIfNeeded(): void {
    const now = new Date();
    const currentMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Reset minute counters
    if (currentMinute.getTime() > this.lastResetMinute.getTime()) {
      this.requestsThisMinute = 0;
      this.tokensThisMinute = 0;
      this.lastResetMinute = currentMinute;
    }

    // Reset hour counters
    if (currentHour.getTime() > this.lastResetHour.getTime()) {
      this.requestsThisHour = 0;
      this.tokensThisHour = 0;
      this.lastResetHour = currentHour;
    }
  }

  private canMakeRequest(tokens: number = 0): boolean {
    this.resetCountersIfNeeded();

    // Check if we're within limits
    const withinRequestLimits = (
      this.requestsThisMinute < this.config.requestsPerMinute &&
      this.requestsThisHour < this.config.requestsPerHour
    );

    const withinTokenLimits = (
      this.tokensThisMinute + tokens <= this.config.tokensPerMinute &&
      this.tokensThisHour + tokens <= this.config.tokensPerHour
    );

    return withinRequestLimits && withinTokenLimits;
  }

  private getTimeUntilReset(): number {
    const now = new Date();
    const nextMinute = new Date(this.lastResetMinute);
    nextMinute.setMinutes(nextMinute.getMinutes() + 1);

    const nextHour = new Date(this.lastResetHour);
    nextHour.setHours(nextHour.getHours() + 1);

    // Return the smaller of the two wait times
    const minuteWait = Math.max(0, nextMinute.getTime() - now.getTime());
    const hourWait = Math.max(0, nextHour.getTime() - now.getTime());

    return Math.min(minuteWait, hourWait);
  }

  private processQueue(): void {
    while (this.waitQueue.length > 0) {
      const request = this.waitQueue[0];

      if (this.canMakeRequest(request.tokens)) {
        this.waitQueue.shift();
        this.requestsThisMinute++;
        this.requestsThisHour++;
        this.tokensThisMinute += request.tokens;
        this.tokensThisHour += request.tokens;
        request.resolve();
      } else {
        break; // Can't process more requests right now
      }
    }
  }

  private cleanupQueue(): void {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Remove requests that have been waiting too long
    const expiredRequests = this.waitQueue.filter(req => req.timestamp < fiveMinutesAgo);
    this.waitQueue = this.waitQueue.filter(req => req.timestamp >= fiveMinutesAgo);

    // Reject expired requests
    expiredRequests.forEach(req => {
      req.reject(new Error('Rate limiter timeout: Request expired while waiting in queue'));
    });
  }

  public async waitForAvailability(tokens: number = 0): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.canMakeRequest(tokens)) {
        // Can make request immediately
        this.requestsThisMinute++;
        this.requestsThisHour++;
        this.tokensThisMinute += tokens;
        this.tokensThisHour += tokens;
        resolve();
      } else {
        // Add to queue
        this.waitQueue.push({
          resolve,
          reject,
          tokens,
          timestamp: new Date()
        });

        // Set up timeout for this request
        const timeUntilReset = this.getTimeUntilReset();
        const timeoutMs = Math.min(timeUntilReset + 1000, 5 * 60 * 1000); // Max 5 minutes

        setTimeout(() => {
          // Check if request is still in queue and reject it
          const index = this.waitQueue.findIndex(req => req.resolve === resolve);
          if (index !== -1) {
            this.waitQueue.splice(index, 1);
            reject(new Error(`Rate limit timeout: ${timeoutMs}ms exceeded`));
          }
        }, timeoutMs);

        // Try to process queue after a short delay
        setTimeout(() => {
          this.processQueue();
        }, Math.min(1000, timeUntilReset + 100));
      }
    });
  }

  public recordRequest(tokens: number = 0): void {
    // This method can be called to manually record requests/tokens
    // if they were made outside of waitForAvailability
    this.resetCountersIfNeeded();
    this.requestsThisMinute++;
    this.requestsThisHour++;
    this.tokensThisMinute += tokens;
    this.tokensThisHour += tokens;
  }

  public getStats(): RateLimiterStats {
    this.resetCountersIfNeeded();

    return {
      requestsThisMinute: this.requestsThisMinute,
      requestsThisHour: this.requestsThisHour,
      tokensThisMinute: this.tokensThisMinute,
      tokensThisHour: this.tokensThisHour,
      lastResetMinute: new Date(this.lastResetMinute),
      lastResetHour: new Date(this.lastResetHour),
      isLimited: !this.canMakeRequest(),
      timeUntilReset: this.getTimeUntilReset()
    };
  }

  public getRemainingCapacity(): {
    requests: { minute: number; hour: number };
    tokens: { minute: number; hour: number };
  } {
    this.resetCountersIfNeeded();

    return {
      requests: {
        minute: Math.max(0, this.config.requestsPerMinute - this.requestsThisMinute),
        hour: Math.max(0, this.config.requestsPerHour - this.requestsThisHour)
      },
      tokens: {
        minute: Math.max(0, this.config.tokensPerMinute - this.tokensThisMinute),
        hour: Math.max(0, this.config.tokensPerHour - this.tokensThisHour)
      }
    };
  }

  public updateConfig(newConfig: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public reset(): void {
    this.requestsThisMinute = 0;
    this.requestsThisHour = 0;
    this.tokensThisMinute = 0;
    this.tokensThisHour = 0;
    const now = new Date();
    this.lastResetMinute = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    this.lastResetHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Reject all waiting requests
    this.waitQueue.forEach(req => {
      req.reject(new Error('Rate limiter reset'));
    });
    this.waitQueue = [];
  }
}