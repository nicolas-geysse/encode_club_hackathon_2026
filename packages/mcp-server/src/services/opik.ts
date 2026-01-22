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

// Configuration - env vars are read lazily inside functions to avoid race conditions
// with .env loading in server-side frameworks (Vinxi/SolidStart)
// See: OPIK_API_KEY, OPIK_WORKSPACE, OPIK_PROJECT, OPIK_BASE_URL, ENABLE_OPIK

// Allow disabling mostly "spammy" realtime traces (e.g. background embeddings)
// DEFAULT: FALSE (Opt-in) because it generates too many logs
// Note: This one is safe at module level since it's not critical for auth
export const ENABLE_REALTIME_OPIK = process.env.ENABLE_REALTIME_OPIK === 'true';

// Store project name for use after initialization
let opikProject: string = 'stride';

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

  // ✅ Read env vars NOW, when .env is fully loaded (not at module import time)
  const apiKey = process.env.OPIK_API_KEY?.trim();
  const workspace = process.env.OPIK_WORKSPACE?.trim();
  const project = process.env.OPIK_PROJECT?.trim() || 'stride';
  const apiUrl = process.env.OPIK_BASE_URL?.trim();
  const enableOpik = process.env.ENABLE_OPIK !== 'false';

  // Store project name for later use
  opikProject = project;

  if (!enableOpik) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Opik] Tracing disabled by ENABLE_OPIK=false');
    }
    return false;
  }

  if (!apiKey) {
    console.error('[Opik] OPIK_API_KEY not set, tracing disabled');
    return false;
  }

  try {
    const opikModule = await import('opik');
    const { Opik } = opikModule;

    // SDK v1.9.92+ requires explicit apiUrl (env var OPIK_URL_OVERRIDE or constructor param)
    // Default to Comet Cloud URL if not set (for self-hosted, set OPIK_BASE_URL)
    const effectiveApiUrl = apiUrl || 'https://www.comet.com/opik/api';

    // SDK bug workaround: explicitly set env vars before creating client
    // The HTTP client layer may read from env vars instead of constructor params
    process.env.OPIK_API_KEY = apiKey;
    process.env.OPIK_URL_OVERRIDE = effectiveApiUrl;
    if (workspace) {
      process.env.OPIK_WORKSPACE = workspace;
    }

    // WORKAROUND for SDK bug: apiKey is documented to "Override the Authorization header"
    // but normalizeClientOptions() in BaseClient.ts NEVER adds it to headers!
    // We must pass it manually via the headers option.
    // See: https://github.com/comet-ml/opik/blob/main/sdks/typescript/src/opik/rest_api/BaseClient.ts
    opikClient = new Opik({
      apiKey,
      projectName: project,
      workspaceName: workspace,
      apiUrl: effectiveApiUrl,
      headers: {
        authorization: apiKey, // Lowercase, NO "Bearer " prefix per Opik REST API spec
      },
    });
    // Use client's flush method instead of global flushAll
    flushFn = () => opikClient.flush();
    console.error(
      `[Opik] Initialized with project: ${project}, workspace: ${workspace || 'default'}`
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
        projectName: opikProject,
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
      console.error(`[Opik:${name}] Created trace with ID: ${currentTraceId}`);

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
          console.error(
            `[Opik:${name}] setOutput called with:`,
            JSON.stringify(output).substring(0, 300)
          );
        },
        setUsage: (usage) => {
          usageData = usage;
        },
        end: () => {
          // No-op - actual end logic is handled in the try/catch below
        },
      };
    } catch (error) {
      console.error('[Opik] Error creating trace:', error);
      span = mockSpan;
    }
  }

  // Helper to finalize the trace with all collected data
  const finalizeTrace = async () => {
    if (traceHandle) {
      console.error(
        `[Opik:${name}] finalizeTrace called, outputData:`,
        outputData ? JSON.stringify(outputData).substring(0, 300) : 'null'
      );

      // Build update data with output and additional metadata
      const updateData: Record<string, unknown> = {};

      // Merge collected attributes into metadata
      if (Object.keys(collectedAttrs).length > 0) {
        updateData.metadata = collectedAttrs;
      }
      if (outputData) {
        updateData.output = outputData;
      }
      if (usageData) {
        updateData.usage = usageData;
      }

      // Only call update if we have data to add
      if (Object.keys(updateData).length > 0) {
        try {
          console.error(
            `[Opik:${name}] Calling update with:`,
            JSON.stringify({
              traceId: currentTraceId,
              hasOutput: !!updateData.output,
              hasMetadata: !!updateData.metadata,
              hasUsage: !!updateData.usage,
              outputValue: updateData.output
                ? JSON.stringify(updateData.output).substring(0, 200)
                : 'null',
            })
          );

          // Try direct update call
          traceHandle.update(updateData);
          console.error(`[Opik:${name}] update() called successfully`);
        } catch (err) {
          console.error('[Opik] Error updating trace:', err);
        }
      }

      // End the trace
      try {
        traceHandle.end();
        console.error(`[Opik:${name}] end() called`);
      } catch (err) {
        console.error('[Opik] Error ending trace:', err);
      }
    }
  };

  try {
    const result = await fn(span);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';

    // Finalize trace with all data
    await finalizeTrace();

    // Flush traces and WAIT for it to complete
    if (flushFn) {
      try {
        console.error(`[Opik:${name}] Flushing all traces...`);
        await flushFn();
        console.error(`[Opik:${name}] Flush completed`);
      } catch (err) {
        console.error('[Opik] Flush error:', err);
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;

    // Finalize trace even on error
    await finalizeTrace();

    // Flush traces and WAIT for it to complete
    if (flushFn) {
      try {
        await flushFn();
      } catch (err) {
        console.error('[Opik] Flush error:', err);
      }
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
  // Read env vars at runtime to avoid race condition with .env loading
  const baseUrl = process.env.OPIK_BASE_URL || 'https://www.comet.com/opik';
  const workspace = process.env.OPIK_WORKSPACE || 'default';
  const project = process.env.OPIK_PROJECT || 'stride';

  if (!id) {
    return `${baseUrl}/${workspace}/${project}`;
  }
  return `${baseUrl}/${workspace}/${project}/traces/${id}`;
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
      console.error(`[Opik:span:${name}] Created span under trace ${currentTraceId}`);

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
          console.error(
            `[Opik:span:${name}] setOutput called with:`,
            JSON.stringify(output).substring(0, 200)
          );
        },
        setUsage: (usage) => {
          usageData = usage;
        },
        end: () => {
          // No-op - actual end logic is handled in the try/catch below
        },
      };
    } catch (error) {
      console.error('[Opik] Error creating span:', error);
      span = mockSpan;
    }
  }

  // Helper to finalize the span with all collected data
  const finalizeSpan = async () => {
    if (spanHandle) {
      console.error(
        `[Opik:span:${name}] finalizeSpan called, outputData:`,
        outputData ? JSON.stringify(outputData).substring(0, 200) : 'null'
      );

      // Build update data with output and additional metadata
      const updateData: Record<string, unknown> = {};

      // Merge collected attributes into metadata
      if (Object.keys(collectedAttrs).length > 0) {
        updateData.metadata = collectedAttrs;
      }
      if (outputData) {
        updateData.output = outputData;
      }
      if (usageData) {
        updateData.usage = usageData;
      }

      // Only call update if we have data to add
      if (Object.keys(updateData).length > 0) {
        try {
          console.error(
            `[Opik:span:${name}] Calling update with output:`,
            updateData.output ? 'yes' : 'no'
          );
          spanHandle.update(updateData);
          console.error(`[Opik:span:${name}] update() called successfully`);
        } catch (err) {
          console.error('[Opik] Error updating span:', err);
        }
      }

      // End the span
      try {
        spanHandle.end();
        console.error(`[Opik:span:${name}] end() called`);
      } catch (err) {
        console.error('[Opik] Error ending span:', err);
      }
    }
  };

  try {
    const result = await fn(span);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';
    await finalizeSpan();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;
    await finalizeSpan();
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
