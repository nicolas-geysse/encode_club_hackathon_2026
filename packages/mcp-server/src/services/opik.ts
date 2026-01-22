/**
 * Opik Tracing Service
 *
 * Provides observability for all tool calls and LLM interactions
 * Connects to self-hosted Opik instance
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
let currentTraceId: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let currentTraceHandle: any = null;
let flushFn: (() => Promise<void>) | null = null;
let initialized = false;

// Configuration
// Opik Cloud: https://www.comet.com/opik (no OPIK_BASE_URL needed)
// Self-hosted: set OPIK_BASE_URL to your Opik API endpoint
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE;
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';
// For self-hosted only (Opik Cloud doesn't need this)
// For self-hosted only (Opik Cloud doesn't need this)
const OPIK_BASE_URL = process.env.OPIK_BASE_URL;
// Allow disabled state
const ENABLE_OPIK = process.env.ENABLE_OPIK !== 'false';
// Allow disabling mostly "spammy" realtime traces (e.g. background embeddings)
// DEFAULT: FALSE (Opt-in) because it generates too many logs
export const ENABLE_REALTIME_OPIK = process.env.ENABLE_REALTIME_OPIK === 'true';

if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line no-console
  console.log(
    `[Opik] Realtime tracing enabled: ${ENABLE_REALTIME_OPIK} (Env: ${process.env.ENABLE_REALTIME_OPIK})`
  );
}

/**
 * Token usage information for LLM calls
 * Cost is in USD (e.g., 0.001 = $0.001)
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** Estimated cost in USD */
  cost?: number;
}

/**
 * Span interface for tracing
 */
export interface Span {
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  /** Set the input for this trace/span (visible in Opik UI) */
  setInput(input: Record<string, unknown>): void;
  /** Set the output for this trace/span (visible in Opik UI) */
  setOutput(output: Record<string, unknown>): void;
  /** Set token usage at root level (not in metadata) for proper Opik display */
  setUsage(usage: TokenUsage): void;
  end(): void;
}

/**
 * Initialize Opik client (lazy, called automatically on first trace)
 */
async function ensureOpikClient(): Promise<boolean> {
  if (initialized) return !!opikClient;
  initialized = true;

  if (!ENABLE_OPIK) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Opik] Tracing disabled by ENABLE_OPIK=false');
    }
    return false;
  }

  if (!OPIK_API_KEY) {
    console.error('[Opik] OPIK_API_KEY not set, tracing disabled');
    return false;
  }

  try {
    const opikModule = await import('opik');
    const { Opik, flushAll } = opikModule;

    flushFn = flushAll;

    const config: {
      apiKey: string;
      projectName: string;
      workspaceName?: string;
      baseUrl?: string;
    } = {
      apiKey: OPIK_API_KEY,
      projectName: OPIK_PROJECT,
    };

    if (OPIK_WORKSPACE) {
      config.workspaceName = OPIK_WORKSPACE;
    }

    if (OPIK_BASE_URL) {
      config.baseUrl = OPIK_BASE_URL;
    }

    opikClient = new Opik(config);
    console.error(
      `[Opik] Initialized with project: ${OPIK_PROJECT}, workspace: ${OPIK_WORKSPACE || 'default'}`
    );
    return true;
  } catch (error) {
    console.error('[Opik] Failed to initialize:', error);
    return false;
  }
}

/**
 * Initialize Opik client (for backward compatibility)
 */
export async function initOpik(): Promise<void> {
  await ensureOpikClient();
}

/**
 * Options for creating a trace
 */
export interface TraceOptions {
  /** Tags for filtering/grouping traces in Opik UI */
  tags?: string[];
  /** Initial metadata to attach to the trace */
  metadata?: Record<string, unknown>;
  /** Initial input data */
  input?: Record<string, unknown>;
}

/**
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: TraceOptions
): Promise<T> {
  const startTime = new Date();
  const collectedAttrs: Record<string, unknown> = options?.metadata ? { ...options.metadata } : {};
  let usageData: TokenUsage | null = null;
  let inputData: Record<string, unknown> | null = options?.input || null;
  let outputData: Record<string, unknown> | null = null;

  // Create a mock span if Opik is not available
  const mockSpan: Span = {
    setAttributes: (attrs) => {
      Object.assign(collectedAttrs, attrs);
    },
    addEvent: (eventName, attrs) => {
      Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
    },
    setInput: (input) => {
      inputData = input;
    },
    setOutput: (output) => {
      outputData = output;
    },
    setUsage: (usage) => {
      usageData = usage;
      console.error(`[Trace:${name}] Usage:`, JSON.stringify(usage));
    },
    end: () => {
      const duration = Date.now() - startTime.getTime();
      console.error(
        `[Trace:${name}] Duration: ${duration}ms, Attrs:`,
        JSON.stringify(collectedAttrs),
        'Usage:',
        JSON.stringify(usageData)
      );
    },
  };

  // Use Opik if available, otherwise use mock
  let span: Span = mockSpan;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let traceHandle: any = null;

  const hasClient = await ensureOpikClient();
  if (hasClient && opikClient) {
    try {
      const traceConfig: Record<string, unknown> = {
        name,
        projectName: OPIK_PROJECT,
        startTime,
        metadata: options?.metadata || {},
      };

      // Add tags if provided
      if (options?.tags && options.tags.length > 0) {
        traceConfig.tags = options.tags;
      }

      // Add initial input if provided
      if (options?.input) {
        traceConfig.input = options.input;
      }

      traceHandle = opikClient.trace(traceConfig);
      currentTraceId = traceHandle.data?.id || traceHandle.id;
      currentTraceHandle = traceHandle;

      span = {
        setAttributes: (attrs) => {
          Object.assign(collectedAttrs, attrs);
        },
        addEvent: (eventName, attrs) => {
          Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
        },
        setInput: (input) => {
          inputData = input;
        },
        setOutput: (output) => {
          outputData = output;
        },
        setUsage: (usage) => {
          usageData = usage;
        },
        end: () => {
          if (traceHandle) {
            // Update with metadata, input, output, and usage at root level
            const updateData: Record<string, unknown> = { metadata: collectedAttrs };
            // Set input/output for Opik UI display
            if (inputData) {
              updateData.input = inputData;
            }
            if (outputData) {
              updateData.output = outputData;
            }
            // IMPORTANT: Set usage at root level, not in metadata, for Opik to display correctly
            if (usageData) {
              updateData.usage = usageData;
            }
            traceHandle.update(updateData);
            traceHandle.end();
          }
        },
      };
    } catch (error) {
      console.error('[Opik] Error creating trace:', error);
      span = mockSpan;
    }
  }

  try {
    const result = await fn(span);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';
    span.end();

    // Flush traces asynchronously
    if (flushFn) {
      flushFn().catch((err) => console.error('[Opik] Flush error:', err));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;
    span.end();

    // Flush traces asynchronously
    if (flushFn) {
      flushFn().catch((err) => console.error('[Opik] Flush error:', err));
    }

    throw error;
  }
}

/**
 * Log feedback for a trace
 */
export async function logFeedback(
  traceId: string,
  feedback: 'thumbs_up' | 'thumbs_down',
  comment?: string
): Promise<void> {
  if (opikClient) {
    try {
      await opikClient.feedback({
        traceId,
        score: feedback === 'thumbs_up' ? 1 : 0,
        comment,
      });
    } catch (error) {
      console.error('Error logging feedback:', error);
    }
  }
  console.error(`[Feedback] Trace ${traceId}: ${feedback}`);
}

/**
 * Get the URL to view a trace in the Opik dashboard
 */
export function getTraceUrl(traceId?: string): string {
  const id = traceId || currentTraceId;
  // Use Opik Cloud URL if no base URL is set
  const baseUrl = OPIK_BASE_URL || 'https://www.comet.com/opik';
  const workspace = OPIK_WORKSPACE || 'default';

  if (!id) {
    return `${baseUrl}/${workspace}/${OPIK_PROJECT}`;
  }
  return `${baseUrl}/${workspace}/${OPIK_PROJECT}/traces/${id}`;
}

/**
 * Get the current trace ID
 */
export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

/**
 * Create a child span under the current trace
 * This creates a nested span hierarchy visible in Opik UI
 *
 * @param name - Name of the child span
 * @param fn - Function to execute within the span
 * @returns Promise with the function result
 *
 * @example
 * // Creates: parent_trace -> child_span
 * await trace('parent_trace', async (parentSpan) => {
 *   await createSpan('child_operation', async (childSpan) => {
 *     childSpan.setAttributes({ step: 'processing' });
 *     // do work...
 *   });
 * });
 */
export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    input?: Record<string, unknown>;
    tags?: string[];
  }
): Promise<T> {
  const startTime = new Date();
  const collectedAttrs: Record<string, unknown> = {};
  let usageData: TokenUsage | null = null;
  let inputData: Record<string, unknown> | null = options?.input || null;
  let outputData: Record<string, unknown> | null = null;

  // Create a mock span for when no parent trace exists
  const mockSpan: Span = {
    setAttributes: (attrs) => {
      Object.assign(collectedAttrs, attrs);
    },
    addEvent: (eventName, attrs) => {
      Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
    },
    setInput: (input) => {
      inputData = input;
    },
    setOutput: (output) => {
      outputData = output;
    },
    setUsage: (usage) => {
      usageData = usage;
      console.error(`[Span:${name}] Usage:`, JSON.stringify(usage));
    },
    end: () => {
      const duration = Date.now() - startTime.getTime();
      console.error(
        `[Span:${name}] Duration: ${duration}ms, Attrs:`,
        JSON.stringify(collectedAttrs),
        'Usage:',
        JSON.stringify(usageData)
      );
    },
  };

  let span: Span = mockSpan;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spanHandle: any = null;

  // Only create real span if we have a current trace handle
  if (currentTraceHandle) {
    try {
      // Create child span under current trace
      const spanConfig: Record<string, unknown> = {
        name,
        startTime,
      };

      if (options?.input) {
        spanConfig.input = options.input;
      }

      if (options?.tags && options.tags.length > 0) {
        spanConfig.tags = options.tags;
      }

      spanHandle = currentTraceHandle.span(spanConfig);

      span = {
        setAttributes: (attrs) => {
          Object.assign(collectedAttrs, attrs);
        },
        addEvent: (eventName, attrs) => {
          Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
        },
        setInput: (input) => {
          inputData = input;
        },
        setOutput: (output) => {
          outputData = output;
        },
        setUsage: (usage) => {
          usageData = usage;
        },
        end: () => {
          if (spanHandle) {
            const updateData: Record<string, unknown> = { metadata: collectedAttrs };
            if (inputData) {
              updateData.input = inputData;
            }
            if (outputData) {
              updateData.output = outputData;
            }
            if (usageData) {
              updateData.usage = usageData;
            }
            spanHandle.update(updateData);
            spanHandle.end();
          }
        },
      };
    } catch (error) {
      console.error('[Opik] Error creating span:', error);
      span = mockSpan;
    }
  }

  try {
    const result = await fn(span);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';
    span.end();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;
    span.end();
    throw error;
  }
}

/**
 * Get the current trace handle for advanced usage
 */
export function getCurrentTraceHandle(): unknown {
  return currentTraceHandle;
}

// Helper to skip tracing if realtime logs are disabled
export async function maybeTrace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: TraceOptions
): Promise<T> {
  if (!ENABLE_REALTIME_OPIK) {
    const mockSpan: Span = {
      setAttributes: () => {},
      addEvent: () => {},
      setInput: () => {},
      setOutput: () => {},
      setUsage: () => {},
      end: () => {},
    };
    return fn(mockSpan);
  }
  return trace(name, fn, options);
}

// Helper to skip span creation if realtime logs are disabled
export async function maybeCreateSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: { input?: Record<string, unknown>; tags?: string[] }
): Promise<T> {
  if (!ENABLE_REALTIME_OPIK) {
    const mockSpan: Span = {
      setAttributes: () => {},
      addEvent: () => {},
      setInput: () => {},
      setOutput: () => {},
      setUsage: () => {},
      end: () => {},
    };
    return fn(mockSpan);
  }
  return createSpan(name, fn, options);
}

// Export service
export const opik = {
  init: initOpik,
  trace,
  createSpan,
  maybeTrace,
  maybeCreateSpan,
  logFeedback,
  getTraceUrl,
  getCurrentTraceId,
  getCurrentTraceHandle,
};

export default opik;
