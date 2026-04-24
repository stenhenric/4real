type LogLevel = 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (baseContext: LogContext) => Logger;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]),
    );
  }

  return value;
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const serializedContext = serializeValue(context);
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(serializedContext && typeof serializedContext === 'object' ? serializedContext : {}),
  };

  const line = `${JSON.stringify(payload)}\n`;
  if (level === 'error') {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

function createLogger(baseContext: LogContext = {}): Logger {
  return {
    info: (message, context = {}) => write('info', message, { ...baseContext, ...context }),
    warn: (message, context = {}) => write('warn', message, { ...baseContext, ...context }),
    error: (message, context = {}) => write('error', message, { ...baseContext, ...context }),
    child: (context) => createLogger({ ...baseContext, ...context }),
  };
}

export const logger = createLogger();
