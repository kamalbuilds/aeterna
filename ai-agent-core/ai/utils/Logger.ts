// AETERNA Logger Utility
// Production-level logging with structured output and performance tracking

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  component: string;
  message: string;
  data?: any;
  traceId?: string;
  userId?: string;
  performanceData?: {
    duration?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}

export class Logger {
  private component: string;
  private logLevel: LogLevel;
  private enableConsole: boolean;
  private enableFile: boolean;
  private traceId?: string;

  constructor(
    component: string,
    options: {
      logLevel?: LogLevel;
      enableConsole?: boolean;
      enableFile?: boolean;
      traceId?: string;
    } = {}
  ) {
    this.component = component;
    this.logLevel = options.logLevel || 'info';
    this.enableConsole = options.enableConsole !== false;
    this.enableFile = options.enableFile || false;
    this.traceId = options.traceId;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(entry: LogEntry): string {
    const timestamp = entry.timestamp.toISOString();
    const level = entry.level.toUpperCase().padEnd(5);
    const component = entry.component.padEnd(20);

    let message = `${timestamp} [${level}] ${component} ${entry.message}`;

    if (entry.traceId) {
      message += ` [trace:${entry.traceId}]`;
    }

    if (entry.userId) {
      message += ` [user:${entry.userId}]`;
    }

    if (entry.performanceData?.duration) {
      message += ` [${entry.performanceData.duration.toFixed(2)}ms]`;
    }

    return message;
  }

  private log(level: LogLevel, message: string, data?: any, options?: {
    traceId?: string;
    userId?: string;
    performanceData?: LogEntry['performanceData'];
  }): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      component: this.component,
      message,
      data,
      traceId: options?.traceId || this.traceId,
      userId: options?.userId,
      performanceData: options?.performanceData
    };

    if (this.enableConsole) {
      const formattedMessage = this.formatMessage(entry);

      switch (level) {
        case 'debug':
          console.debug(formattedMessage, data || '');
          break;
        case 'info':
          console.info(formattedMessage, data || '');
          break;
        case 'warn':
          console.warn(formattedMessage, data || '');
          break;
        case 'error':
          console.error(formattedMessage, data || '');
          break;
      }
    }

    if (this.enableFile) {
      this.writeToFile(entry);
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    try {
      // In production, you'd implement proper file logging
      // For now, we'll just store in memory or use a proper logging library
      const logData = {
        ...entry,
        data: entry.data ? JSON.stringify(entry.data) : undefined
      };

      // Store in memory or send to logging service
      // Implementation would depend on your infrastructure
    } catch (error) {
      console.error('Failed to write log to file:', error);
    }
  }

  public debug(message: string, data?: any, options?: Parameters<typeof this.log>[3]): void {
    this.log('debug', message, data, options);
  }

  public info(message: string, data?: any, options?: Parameters<typeof this.log>[3]): void {
    this.log('info', message, data, options);
  }

  public warn(message: string, data?: any, options?: Parameters<typeof this.log>[3]): void {
    this.log('warn', message, data, options);
  }

  public error(message: string, data?: any, options?: Parameters<typeof this.log>[3]): void {
    this.log('error', message, data, options);
  }

  public setTraceId(traceId: string): void {
    this.traceId = traceId;
  }

  public createChild(component: string): Logger {
    return new Logger(component, {
      logLevel: this.logLevel,
      enableConsole: this.enableConsole,
      enableFile: this.enableFile,
      traceId: this.traceId
    });
  }

  public withPerformanceTracking<T>(
    operation: string,
    fn: () => Promise<T> | T,
    options?: { userId?: string }
  ): Promise<T> {
    const startTime = performance.now();
    const memoryBefore = process.memoryUsage();

    this.debug(`Starting ${operation}`, undefined, options);

    const handleCompletion = (result: T, error?: Error) => {
      const endTime = performance.now();
      const memoryAfter = process.memoryUsage();

      const performanceData = {
        duration: endTime - startTime,
        memoryUsage: memoryAfter.heapUsed - memoryBefore.heapUsed
      };

      if (error) {
        this.error(`Failed ${operation}`, { error: error.message, stack: error.stack }, {
          ...options,
          performanceData
        });
        throw error;
      } else {
        this.info(`Completed ${operation}`, undefined, {
          ...options,
          performanceData
        });
        return result;
      }
    };

    try {
      const result = fn();

      if (result instanceof Promise) {
        return result
          .then(r => handleCompletion(r))
          .catch(error => handleCompletion(undefined as any, error));
      } else {
        return Promise.resolve(handleCompletion(result));
      }
    } catch (error) {
      return Promise.resolve(handleCompletion(undefined as any, error as Error));
    }
  }
}