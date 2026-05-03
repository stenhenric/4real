import { redact } from './redact.ts';
import { getTraceContext } from '../services/trace-context.service.ts';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  fatal: (message: string, context?: LogContext) => void;
  child: (baseContext: LogContext) => Logger;
}

function serializeValue(value: unknown): unknown {
  const redactedValue = redact(value);

  return serializeRedactedValue(redactedValue);
}

function serializeRedactedValue(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => serializeRedactedValue(entry));
  }

  if (typeof value === 'string') {
    return value.replace(/\r/g, '\\r').replace(/\n/g, '\\n');
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serializeRedactedValue(entry)]),
    );
  }

  return value;
}

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const serializedContext = serializeValue({
    ...getTraceContext(),
    ...context,
  });
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message: message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'),
    ...(serializedContext && typeof serializedContext === 'object' ? serializedContext : {}),
  };

  const line = `${JSON.stringify(payload)}\n`;
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(line);
    return;
  }

  process.stdout.write(line);
}

function createLogger(baseContext: LogContext = {}): Logger {
  return {
    debug: (message, context = {}) => write('debug', message, { ...baseContext, ...context }),
    info: (message, context = {}) => write('info', message, { ...baseContext, ...context }),
    warn: (message, context = {}) => write('warn', message, { ...baseContext, ...context }),
    error: (message, context = {}) => write('error', message, { ...baseContext, ...context }),
    fatal: (message, context = {}) => write('fatal', message, { ...baseContext, ...context }),
    child: (context) => createLogger({ ...baseContext, ...context }),
  };
}

export const logger = createLogger();
