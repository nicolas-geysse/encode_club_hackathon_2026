/**
 * Simple Logger for MCP Server
 *
 * Provides consistent logging with module prefixes.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogMeta {
  [key: string]: unknown;
}

interface Logger {
  debug: (message: string, meta?: LogMeta) => void;
  info: (message: string, meta?: LogMeta) => void;
  warn: (message: string, meta?: LogMeta) => void;
  error: (message: string, meta?: LogMeta) => void;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Get minimum log level from environment
const MIN_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';
const MIN_PRIORITY = LOG_LEVEL_PRIORITY[MIN_LEVEL] || 0;

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= MIN_PRIORITY;
}

function formatMeta(meta?: LogMeta): string {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    // Handle Error objects specially
    const formatted = Object.entries(meta).reduce(
      (acc, [key, value]) => {
        if (value instanceof Error) {
          acc[key] = { message: value.message, name: value.name };
        } else {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, unknown>
    );
    return ' ' + JSON.stringify(formatted);
  } catch {
    return '';
  }
}

/**
 * Create a logger instance with a module prefix
 */
export function createLogger(module: string): Logger {
  const prefix = `[MCP-${module}]`;

  return {
    debug: (message: string, meta?: LogMeta) => {
      if (shouldLog('debug')) {
        console.debug(`${prefix} ${message}${formatMeta(meta)}`);
      }
    },
    info: (message: string, meta?: LogMeta) => {
      if (shouldLog('info')) {
        console.info(`${prefix} ${message}${formatMeta(meta)}`);
      }
    },
    warn: (message: string, meta?: LogMeta) => {
      if (shouldLog('warn')) {
        console.warn(`${prefix} ${message}${formatMeta(meta)}`);
      }
    },
    error: (message: string, meta?: LogMeta) => {
      if (shouldLog('error')) {
        console.error(`${prefix} ${message}${formatMeta(meta)}`);
      }
    },
  };
}

export default createLogger;
