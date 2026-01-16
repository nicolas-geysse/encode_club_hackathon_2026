/**
 * Unified Logging System for Stride
 *
 * Provides structured logging with:
 * - Feature-based context
 * - Correlation IDs for request tracing
 * - Consistent format across components
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  feature?: string;
  correlationId?: string;
  userId?: string;
  [key: string]: unknown;
}

function log(level: LogLevel, message: string, context?: LogContext) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (context?.feature) {
    console[level](`${prefix} [${context.feature}]`, message, context);
  } else {
    console[level](prefix, message, context || '');
  }
}

/**
 * Create a logger instance for a specific feature
 *
 * @example
 * const logger = createLogger('Onboarding');
 * logger.info('Step completed', { step: 3, profile: { name: 'Lucas' } });
 * // Output: [2026-01-16T...] [INFO] [Onboarding] Step completed { step: 3, profile: {...} }
 */
export function createLogger(feature: string) {
  return {
    debug: (msg: string, ctx?: Omit<LogContext, 'feature'>) =>
      log('debug', msg, { ...ctx, feature }),
    info: (msg: string, ctx?: Omit<LogContext, 'feature'>) => log('info', msg, { ...ctx, feature }),
    warn: (msg: string, ctx?: Omit<LogContext, 'feature'>) => log('warn', msg, { ...ctx, feature }),
    error: (msg: string, ctx?: Omit<LogContext, 'feature'>) =>
      log('error', msg, { ...ctx, feature }),
  };
}

/**
 * Generate a correlation ID for tracing async operations
 *
 * @example
 * const correlationId = generateCorrelationId();
 * logger.info('Starting operation', { correlationId });
 * // ... async work
 * logger.info('Operation complete', { correlationId });
 */
export function generateCorrelationId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log a user action with correlation
 */
export function logUserAction(feature: string, action: string, data?: Record<string, unknown>) {
  const logger = createLogger(feature);
  const correlationId = generateCorrelationId();
  logger.info(`User action: ${action}`, { correlationId, ...data });
  return correlationId;
}
