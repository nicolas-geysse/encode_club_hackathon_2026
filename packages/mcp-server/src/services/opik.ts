/**
 * Opik Tracing Service
 *
 * Provides observability for all tool calls and LLM interactions
 * Connects to self-hosted Opik instance
 */

// =============================================================================
// PRIVACY: Location PII sanitization for FERPA/GDPR compliance
// WARNING: This is duplicated from packages/frontend/src/lib/locationPrivacy.ts
// If you modify the logic here, update the frontend version too!
// For hackathon this is acceptable; in production, extract to shared package.
// =============================================================================

/**
 * PRIVACY COMPLIANCE:
 * All trace inputs/outputs are sanitized to remove raw GPS coordinates.
 * Location data is replaced with placeholder to prevent PII leakage.
 * Required for FERPA (student data) and GDPR compliance.
 */
const PRIVACY_PLACEHOLDER = '[LOCATION_REDACTED]';
const LOCATION_KEYS = ['latitude', 'longitude', 'lat', 'lon', 'coords', 'coordinates'];

function sanitizeLocationPII(data: Record<string, unknown>): Record<string, unknown> {
  if (!data || typeof data !== 'object') return data;

  const result = { ...data };
  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    if (LOCATION_KEYS.some((k) => lowerKey.includes(k))) {
      result[key] = PRIVACY_PLACEHOLDER;
    } else if (
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = sanitizeLocationPII(result[key] as Record<string, unknown>);
    } else if (Array.isArray(result[key])) {
      result[key] = (result[key] as unknown[]).map((item) =>
        item !== null && typeof item === 'object'
          ? sanitizeLocationPII(item as Record<string, unknown>)
          : item
      );
    }
  }
  return result;
}

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

// Log level configuration: 'debug' | 'info' | 'warn' | 'error' | 'none'
// Set LOG_LEVEL=debug to see verbose Opik span/trace logs
// Set LOG_LEVEL=info (default) for normal operation
// Set LOG_LEVEL=none to suppress all debug logs (same as info, but explicit)
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 } as const;
type LogLevel = keyof typeof LOG_LEVELS;
const rawLogLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const currentLogLevel: LogLevel = rawLogLevel in LOG_LEVELS ? (rawLogLevel as LogLevel) : 'info';

/** Log only if current level allows it */
function logDebug(...args: unknown[]): void {
  if (LOG_LEVELS[currentLogLevel] <= LOG_LEVELS.debug) {
    console.error(...args);
  }
}

// Allow disabling mostly "spammy" realtime traces (e.g. background embeddings)
// DEFAULT: FALSE (Opt-in) because it generates too many logs
// Note: This one is safe at module level since it's not critical for auth
export const ENABLE_REALTIME_OPIK = process.env.ENABLE_REALTIME_OPIK === 'true';

// Store project name for use after initialization
let opikProject: string = 'stride';

// Thread ID for conversation grouping
let currentThreadId: string | null = null;

/**
 * Span types supported by Opik SDK
 */
export type SpanType = 'general' | 'tool' | 'llm' | 'guardrail';

/**
 * Token usage information for LLM calls
 * Cost is in USD (e.g., 0.001 = $0.001)
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  /** @deprecated Use setCost() instead - cost in usage object is ignored by Opik */
  cost?: number;
}

/**
 * Extended span options for creating child spans
 */
export interface SpanOptions {
  input?: Record<string, unknown>;
  tags?: string[];
  /** Span type - defaults to 'general' */
  type?: SpanType;
  /** Model name for LLM spans */
  model?: string;
  /** Provider name for LLM spans (e.g., 'groq', 'gemini') */
  provider?: string;
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
  /** Set estimated cost in USD (separate from usage) */
  setCost(cost: number): void;
  end(): void;
}

/**
 * Trace context passed to the traced function
 * Includes method to create child spans
 */
export interface TraceContext extends Span {
  /** Create a child span under this trace */
  createChildSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T>;
  /** Get the trace ID */
  getTraceId(): string | null;
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
  /** Thread ID to group related traces (e.g., conversation ID) */
  threadId?: string;
}

/**
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 */
export async function trace<T>(
  name: string,
  fn: (ctx: TraceContext) => Promise<T>,
  options?: TraceOptions
): Promise<T> {
  const startTime = new Date();
  const collectedAttrs: Record<string, unknown> = options?.metadata ? { ...options.metadata } : {};
  let usageData: TokenUsage | null = null;
  let costData: number | null = null;
  // inputData is stored via traceConfig.input, not used directly
  let outputData: Record<string, unknown> | null = null;

  // Track child spans to ensure they end before trace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childSpans: any[] = [];

  // Create a mock context if Opik is not available
  const mockContext: TraceContext = {
    setAttributes: (attrs) => {
      Object.assign(collectedAttrs, attrs);
    },
    addEvent: (eventName, attrs) => {
      Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
    },
    setInput: () => {
      // Input is set via traceConfig.input, not stored locally
    },
    setOutput: (output) => {
      outputData = output;
    },
    setUsage: (usage) => {
      usageData = usage;
      console.error(`[Trace:${name}] Usage:`, JSON.stringify(usage));
    },
    setCost: (cost) => {
      costData = cost;
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
    createChildSpan: async <S>(spanName: string, spanFn: (span: Span) => Promise<S>) => {
      const mockSpan: Span = {
        setAttributes: () => {},
        addEvent: () => {},
        setInput: () => {},
        setOutput: () => {},
        setUsage: () => {},
        setCost: () => {},
        end: () => {},
      };
      return spanFn(mockSpan);
    },
    getTraceId: () => null,
  };

  // Use Opik if available, otherwise use mock
  let ctx: TraceContext = mockContext;
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

      // Add initial input if provided (sanitized for PII)
      if (options?.input) {
        traceConfig.input = sanitizeLocationPII(options.input);
      }

      // Add thread ID for conversation grouping
      if (options?.threadId) {
        traceConfig.threadId = options.threadId;
        currentThreadId = options.threadId;
      }

      traceHandle = opikClient.trace(traceConfig);
      currentTraceId = traceHandle.data?.id || traceHandle.id;
      currentTraceHandle = traceHandle;

      // Debug: Log trace handle structure to verify ID extraction
      if (!currentTraceId) {
        console.error(`[Opik:${name}] WARNING: No trace ID extracted!`, {
          hasData: !!traceHandle.data,
          dataId: traceHandle.data?.id,
          directId: traceHandle.id,
          handleKeys: Object.keys(traceHandle || {}),
        });
      }
      logDebug(`[Opik:${name}] Created trace with ID: ${currentTraceId}`);

      ctx = {
        setAttributes: (attrs) => {
          Object.assign(collectedAttrs, attrs);
        },
        addEvent: (eventName, attrs) => {
          Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
        },
        setInput: () => {
          // Input is set via traceConfig.input, not stored locally
        },
        setOutput: (output) => {
          outputData = output;
          logDebug(
            `[Opik:${name}] setOutput called with:`,
            JSON.stringify(output).substring(0, 300)
          );
        },
        setUsage: (usage) => {
          usageData = usage;
        },
        setCost: (cost) => {
          costData = cost;
        },
        end: () => {
          // End all child spans first (in reverse order)
          for (let i = childSpans.length - 1; i >= 0; i--) {
            try {
              childSpans[i].end();
            } catch {
              // Span might already be ended
            }
          }
          // No-op for trace - actual end logic is handled in finalize
        },
        createChildSpan: async <S>(
          spanName: string,
          spanFn: (span: Span) => Promise<S>,
          spanOptions?: SpanOptions
        ): Promise<S> => {
          return createSpanInternal(traceHandle, childSpans, spanName, spanFn, spanOptions);
        },
        getTraceId: () => currentTraceId,
      };
    } catch (error) {
      console.error('[Opik] Error creating trace:', error);
      ctx = mockContext;
    }
  }

  // Helper to finalize the trace with all collected data
  const finalizeTrace = async () => {
    if (traceHandle) {
      logDebug(
        `[Opik:${name}] finalizeTrace called, outputData:`,
        outputData ? JSON.stringify(outputData).substring(0, 300) : 'null'
      );

      // End all child spans first (in reverse order)
      for (let i = childSpans.length - 1; i >= 0; i--) {
        try {
          childSpans[i].end();
        } catch {
          // Span might already be ended
        }
      }

      // Build update data with output and additional metadata
      const updateData: Record<string, unknown> = {};

      // Merge collected attributes into metadata (sanitized for PII)
      if (Object.keys(collectedAttrs).length > 0) {
        updateData.metadata = sanitizeLocationPII(collectedAttrs);
      }
      // PRIVACY: Sanitize output before sending to Opik
      if (outputData) {
        updateData.output = sanitizeLocationPII(outputData);
      }
      // Usage format: { prompt_tokens, completion_tokens, total_tokens }
      if (usageData) {
        updateData.usage = {
          prompt_tokens: usageData.prompt_tokens,
          completion_tokens: usageData.completion_tokens,
          total_tokens: usageData.total_tokens,
        };
      }
      // Cost is separate from usage
      if (costData !== null) {
        updateData.totalEstimatedCost = costData;
      }

      // Only call update if we have data to add
      if (Object.keys(updateData).length > 0) {
        try {
          logDebug(
            `[Opik:${name}] Calling update with:`,
            JSON.stringify({
              traceId: currentTraceId,
              hasOutput: !!updateData.output,
              hasMetadata: !!updateData.metadata,
              hasUsage: !!updateData.usage,
              hasCost: costData !== null,
              outputValue: updateData.output
                ? JSON.stringify(updateData.output).substring(0, 200)
                : 'null',
            })
          );

          // Try direct update call
          traceHandle.update(updateData);
          logDebug(`[Opik:${name}] update() called successfully`);
        } catch (err) {
          console.error('[Opik] Error updating trace:', err);
        }
      }

      // End the trace
      try {
        traceHandle.end();
        logDebug(`[Opik:${name}] end() called`);
      } catch (err) {
        console.error('[Opik] Error ending trace:', err);
      }
    }
  };

  try {
    const result = await fn(ctx);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';

    // Finalize trace with all data
    await finalizeTrace();

    // Flush traces and WAIT for it to complete
    if (flushFn) {
      try {
        logDebug(`[Opik:${name}] Flushing all traces...`);
        await flushFn();
        logDebug(`[Opik:${name}] Flush completed`);
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
 * Internal function to create a span under a trace
 * Used by both trace().createChildSpan() and legacy createSpan()
 */
async function createSpanInternal<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traceHandle: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  childSpans: any[],
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const startTime = new Date();
  const collectedAttrs: Record<string, unknown> = {};
  let usageData: TokenUsage | null = null;
  let costData: number | null = null;
  let outputData: Record<string, unknown> | null = null;

  if (!traceHandle) {
    // No trace handle, create mock span
    const mockSpan: Span = {
      setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
      addEvent: () => {},
      setInput: () => {},
      setOutput: (output) => {
        outputData = output;
      },
      setUsage: (usage) => {
        usageData = usage;
      },
      setCost: (cost) => {
        costData = cost;
      },
      end: () => {
        console.error(`[Span:${name}] Duration: ${Date.now() - startTime.getTime()}ms`);
      },
    };
    return fn(mockSpan);
  }

  // Build span config with required type field
  const spanConfig: Record<string, unknown> = {
    name,
    startTime,
    type: options?.type || 'general', // REQUIRED: defaults to 'general'
  };

  // PRIVACY: Sanitize span input before logging
  if (options?.input) {
    spanConfig.input = sanitizeLocationPII(options.input);
  }

  if (options?.tags && options.tags.length > 0) {
    spanConfig.tags = options.tags;
  }

  // Add model and provider for LLM spans
  if (options?.model) {
    spanConfig.model = options.model;
  }

  if (options?.provider) {
    spanConfig.provider = options.provider;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spanHandle: any = null;

  try {
    spanHandle = traceHandle.span(spanConfig);
    childSpans.push(spanHandle);
    logDebug(`[Opik:span:${name}] Created span (type=${options?.type || 'general'})`);

    const span: Span = {
      setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
      addEvent: (eventName, attrs) => {
        Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
      },
      setInput: () => {
        // Input is set in spanConfig
      },
      setOutput: (output) => {
        outputData = output;
        logDebug(
          `[Opik:span:${name}] setOutput called with:`,
          JSON.stringify(output).substring(0, 200)
        );
      },
      setUsage: (usage) => {
        usageData = usage;
      },
      setCost: (cost) => {
        costData = cost;
      },
      end: () => {
        // No-op - actual end logic is handled below
      },
    };

    const result = await fn(span);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';

    // Finalize span - sanitize before sending to Opik
    if (spanHandle) {
      const updateData: Record<string, unknown> = { metadata: sanitizeLocationPII(collectedAttrs) };
      // PRIVACY: Sanitize span output before sending to Opik
      if (outputData) {
        updateData.output = sanitizeLocationPII(outputData);
      }
      // Correct usage format - cast to TokenUsage since TypeScript flow analysis
      // doesn't track callback assignments properly
      const usage = usageData as TokenUsage | null;
      if (usage) {
        updateData.usage = {
          prompt_tokens: usage.prompt_tokens,
          completion_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        };
      }
      // Cost is separate
      if (costData !== null) {
        updateData.totalEstimatedCost = costData;
      }
      spanHandle.update(updateData);
      spanHandle.end();
      logDebug(`[Opik:span:${name}] end() called`);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;

    if (spanHandle) {
      spanHandle.update({
        metadata: sanitizeLocationPII(collectedAttrs),
        output: { error: errorMessage },
        errorInfo: { message: errorMessage },
      });
      spanHandle.end();
    }

    throw error;
  }
}

/**
 * Log feedback for a trace (simple thumbs up/down)
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
 * Feedback score definition for detailed evaluation metrics
 */
export interface FeedbackScore {
  /** Name of the metric (e.g., 'relevance', 'safety', 'heuristic_score') */
  name: string;
  /** Score value between 0 and 1 */
  value: number;
  /** Optional reason explaining the score */
  reason?: string;
}

/**
 * Log detailed feedback scores to a trace
 * Used for evaluation and quality monitoring in Opik dashboard
 *
 * Uses REST API directly for immediate visibility in the Feedback Scores tab
 * See: PUT /v1/private/traces/{id}/feedback-scores
 */
export async function logFeedbackScores(
  traceId: string | null,
  scores: FeedbackScore[]
): Promise<boolean> {
  const id = traceId || currentTraceId;
  if (!id) {
    console.error('[Opik] No trace ID available for feedback scores');
    return false;
  }

  // Read env vars lazily at runtime
  const apiKey = process.env.OPIK_API_KEY?.trim();
  const workspace = process.env.OPIK_WORKSPACE?.trim();
  const apiUrl = process.env.OPIK_BASE_URL?.trim() || 'https://www.comet.com/opik/api';

  if (!apiKey) {
    console.error('[Opik] OPIK_API_KEY not set, cannot log feedback scores');
    return false;
  }

  try {
    let allSucceeded = true;
    let successCount = 0;

    for (const score of scores) {
      const response = await fetch(`${apiUrl}/v1/private/traces/${id}/feedback-scores`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: apiKey, // Opik API expects raw API key, not "Bearer" prefix
          ...(workspace ? { 'Comet-Workspace': workspace } : {}),
        },
        body: JSON.stringify({
          name: score.name,
          value: score.value,
          source: 'sdk',
          reason: score.reason,
        }),
      });

      if (!response.ok) {
        allSucceeded = false;
        const errorText = await response.text();
        console.error(
          `[Opik] Failed to log feedback score "${score.name}": ${response.status} - ${errorText}`
        );
      } else {
        successCount++;
      }
    }

    logDebug(
      `[Opik] Logged ${successCount}/${scores.length} feedback scores to trace ${id}${allSucceeded ? '' : ' (some failed)'}`
    );
    return allSucceeded;
  } catch (error) {
    console.error('[Opik] Error logging feedback scores:', error);
    return false;
  }
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
 * @param options - Span options (tags, input, type, model, provider)
 * @returns Promise with the function result
 *
 * @example
 * // Creates: parent_trace -> child_span
 * await trace('parent_trace', async (ctx) => {
 *   // Using ctx.createChildSpan (preferred for proper hierarchy)
 *   await ctx.createChildSpan('child_operation', async (childSpan) => {
 *     childSpan.setAttributes({ step: 'processing' });
 *   }, { type: 'llm', model: 'llama-3.1-70b', provider: 'groq' });
 * });
 *
 * @deprecated Use ctx.createChildSpan() from trace() for proper span hierarchy
 */
export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  // Temporary array for this span (won't affect parent's tracking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempSpans: any[] = [];
  return createSpanInternal(currentTraceHandle, tempSpans, name, fn, options);
}

/**
 * Get the current trace handle for advanced usage
 */
export function getCurrentTraceHandle(): unknown {
  return currentTraceHandle;
}

/**
 * Get the current thread ID (for conversation grouping)
 */
export function getCurrentThreadId(): string | null {
  return currentThreadId;
}

/**
 * Set the current thread ID for grouping subsequent traces
 */
export function setThreadId(threadId: string): void {
  currentThreadId = threadId;
}

/**
 * Generate a new unique thread ID
 */
export function generateThreadId(): string {
  const id = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  currentThreadId = id;
  return id;
}

// Helper to skip tracing if realtime logs are disabled
export async function maybeTrace<T>(
  name: string,
  fn: (ctx: TraceContext) => Promise<T>,
  options?: TraceOptions
): Promise<T> {
  if (!ENABLE_REALTIME_OPIK) {
    const mockContext: TraceContext = {
      setAttributes: () => {},
      addEvent: () => {},
      setInput: () => {},
      setOutput: () => {},
      setUsage: () => {},
      setCost: () => {},
      end: () => {},
      createChildSpan: async <S>(_name: string, spanFn: (span: Span) => Promise<S>) => {
        const mockSpan: Span = {
          setAttributes: () => {},
          addEvent: () => {},
          setInput: () => {},
          setOutput: () => {},
          setUsage: () => {},
          setCost: () => {},
          end: () => {},
        };
        return spanFn(mockSpan);
      },
      getTraceId: () => null,
    };
    return fn(mockContext);
  }
  return trace(name, fn, options);
}

// Helper to skip span creation if realtime logs are disabled
export async function maybeCreateSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  if (!ENABLE_REALTIME_OPIK) {
    const mockSpan: Span = {
      setAttributes: () => {},
      addEvent: () => {},
      setInput: () => {},
      setOutput: () => {},
      setUsage: () => {},
      setCost: () => {},
      end: () => {},
    };
    return fn(mockSpan);
  }
  return createSpan(name, fn, options);
}

// ============================================================
// PROMPT VERSION TRACKING
// ============================================================

import {
  getPromptMetadata,
  initPromptHashes,
  registerPrompt,
  type PromptMetadata,
} from './promptHash.js';

// Re-export for convenience
export { initPromptHashes, getPromptMetadata, registerPrompt };
export type { PromptMetadata };

/**
 * Set prompt version attributes on a span/trace context.
 * Call this at the start of any trace that uses an agent.
 *
 * @example
 * return trace('tool.analyze_budget', async (ctx) => {
 *   setPromptAttributes(ctx, 'budget-coach');
 *   // ... rest of function
 * });
 */
export function setPromptAttributes(ctx: Span | TraceContext, agentId: string): void {
  const meta = getPromptMetadata(agentId);
  if (meta) {
    ctx.setAttributes({
      'prompt.name': meta.name,
      'prompt.version': meta.version,
      'prompt.hash': meta.hash,
    });
  }
}

// ============================================================
// CONDITIONAL TRACING WITH SAMPLING
// ============================================================

import {
  shouldSampleTrace,
  shouldUpgradeSampling,
  logSamplingDecision,
  type SamplingContext,
  type SamplingDecision,
} from './trace-sampling.js';

// Re-export sampling types
export type { SamplingContext, SamplingDecision };
export { shouldSampleTrace, shouldUpgradeSampling };

/**
 * Extended trace options with sampling context
 */
export interface ConditionalTraceOptions extends TraceOptions {
  /** Sampling context for deciding whether to trace */
  sampling?: SamplingContext;
}

/**
 * Result from conditional trace includes sampling decision
 */
export interface ConditionalTraceResult<T> {
  result: T;
  sampled: boolean;
  samplingDecision: SamplingDecision;
  traceId: string | null;
}

/**
 * Conditional trace that applies sampling rules.
 * Use this instead of trace() for high-volume endpoints.
 *
 * Features:
 * - Pre-trace sampling decision (avoids overhead)
 * - Post-trace upgrade (if error/fallback discovered)
 * - Sampling metadata in trace for analysis
 *
 * @example
 * ```typescript
 * const result = await conditionalTrace(
 *   'tips.orchestrator.goals',
 *   async (ctx) => { ... },
 *   {
 *     tags: ['bruno', 'tips'],
 *     sampling: {
 *       profileId,
 *       tabType: 'goals',
 *       profileCreatedAt: profile.createdAt,
 *     }
 *   }
 * );
 * ```
 */
export async function conditionalTrace<T>(
  name: string,
  fn: (ctx: TraceContext) => Promise<T>,
  options?: ConditionalTraceOptions
): Promise<ConditionalTraceResult<T>> {
  // If no sampling context, always trace (backwards compatible)
  if (!options?.sampling) {
    const result = await trace(name, fn, options);
    return {
      result,
      sampled: true,
      samplingDecision: { shouldTrace: true, reason: 'forced', samplingRate: 1.0 },
      traceId: getCurrentTraceId(),
    };
  }

  // Make sampling decision
  const samplingDecision = shouldSampleTrace(options.sampling);
  logSamplingDecision(options.sampling, samplingDecision);

  // If not sampled, run without tracing
  if (!samplingDecision.shouldTrace) {
    // Create mock context
    const mockContext: TraceContext = {
      setAttributes: () => {},
      addEvent: () => {},
      setInput: () => {},
      setOutput: () => {},
      setUsage: () => {},
      setCost: () => {},
      end: () => {},
      createChildSpan: async <S>(_name: string, spanFn: (span: Span) => Promise<S>) => {
        const mockSpan: Span = {
          setAttributes: () => {},
          addEvent: () => {},
          setInput: () => {},
          setOutput: () => {},
          setUsage: () => {},
          setCost: () => {},
          end: () => {},
        };
        return spanFn(mockSpan);
      },
      getTraceId: () => null,
    };

    const result = await fn(mockContext);
    return {
      result,
      sampled: false,
      samplingDecision,
      traceId: null,
    };
  }

  // Trace with sampling metadata
  const traceOptions: TraceOptions = {
    ...options,
    metadata: {
      ...options.metadata,
      'sampling.reason': samplingDecision.reason,
      'sampling.rate': samplingDecision.samplingRate,
    },
  };

  const result = await trace(name, fn, traceOptions);
  return {
    result,
    sampled: true,
    samplingDecision,
    traceId: getCurrentTraceId(),
  };
}

// Export service
export const opik = {
  init: initOpik,
  trace,
  conditionalTrace,
  createSpan,
  maybeTrace,
  maybeCreateSpan,
  logFeedback,
  logFeedbackScores,
  getTraceUrl,
  getCurrentTraceId,
  getCurrentTraceHandle,
  getCurrentThreadId,
  setThreadId,
  generateThreadId,
  setPromptAttributes,
  initPromptHashes,
  getPromptMetadata,
  registerPrompt,
  shouldSampleTrace,
  shouldUpgradeSampling,
};

export default opik;
