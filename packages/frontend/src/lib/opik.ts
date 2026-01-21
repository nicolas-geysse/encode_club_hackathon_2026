/**
 * Opik Tracing Utility for Frontend
 *
 * Provides observability for API endpoints and LLM interactions.
 * Connects to Opik Cloud or self-hosted instance.
 *
 * Features:
 * - Traces: Individual operations/requests
 * - Spans: Nested operations within traces (with proper type: llm, tool, general, guardrail)
 * - Threads: Group related traces (e.g., conversations)
 * - Feedback Scores: Evaluation metrics on traces
 *
 * IMPORTANT: Based on Opik SDK documentation:
 * - Spans must have `type` field ("general" | "tool" | "llm" | "guardrail")
 * - Usage format: { prompt_tokens, completion_tokens, total_tokens }
 * - Cost goes in `totalEstimatedCost`, not in `usage`
 * - LLM spans should include `model` and `provider`
 * - Spans must end() before parent trace ends
 */

// Configuration from environment
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE;
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';
const OPIK_PROJECT_ID = process.env.OPIK_PROJECT_ID; // UUID for dashboard URLs
const OPIK_BASE_URL = process.env.OPIK_BASE_URL;
// Allow explicit disabling via env var (default to true if key exists)
const ENABLE_OPIK = process.env.ENABLE_OPIK !== 'false';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
let currentTraceId: string | null = null;
let currentThreadId: string | null = null;
let flushFn: (() => Promise<void>) | null = null;

// Store active trace handles by ID to avoid race conditions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const activeTraces = new Map<string, any>();

/**
 * Span types supported by Opik SDK
 */
export type SpanType = 'general' | 'tool' | 'llm' | 'guardrail';

/**
 * Token usage information for LLM calls
 */
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * Extended span options for LLM calls
 */
export interface SpanOptions {
  input?: Record<string, unknown>;
  tags?: string[];
  /** Span type - defaults to 'general' */
  type?: SpanType;
  /** Model name for LLM spans */
  model?: string;
  /** Provider name for LLM spans (e.g., 'groq', 'openai') */
  provider?: string;
}

/**
 * Span interface for tracing
 */
export interface Span {
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  /** Set output data that will be visible in Opik UI */
  setOutput(output: Record<string, unknown>): void;
  /** Set token usage (prompt_tokens, completion_tokens, total_tokens) */
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
 * Initialize Opik client (lazy)
 */
async function getOpikClient() {
  if (opikClient) return opikClient;

  if (!ENABLE_OPIK) {
    // Only log once to avoid spamming
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Opik] Tracing disabled by ENABLE_OPIK=false');
    }
    return null;
  }

  if (!OPIK_API_KEY) {
    console.error('[Opik] OPIK_API_KEY not set, tracing disabled');
    return null;
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
      `[Opik] Initialized - project: ${OPIK_PROJECT}, workspace: ${OPIK_WORKSPACE || 'default'}`
    );
    return opikClient;
  } catch (error) {
    console.error('[Opik] Failed to initialize:', error);
    return null;
  }
}

/**
 * Trace options for advanced configuration
 */
export interface TraceOptions {
  /** Custom metadata to attach to the trace */
  source?: string;
  /** Thread ID to group related traces (e.g., conversation ID) */
  threadId?: string;
  /** Input data for the trace (shows in Opik UI) */
  input?: Record<string, unknown>;
  /** Tags for filtering in dashboard */
  tags?: string[];
}

/**
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 *
 * @param name - Name of the trace (e.g., 'chat.onboarding')
 * @param fn - Function to execute within the trace (receives TraceContext)
 * @param options - Additional trace options (threadId, input, tags)
 */
export async function trace<T>(
  name: string,
  fn: (ctx: TraceContext) => Promise<T>,
  options?: TraceOptions | Record<string, unknown>
): Promise<T> {
  // Normalize options (support legacy metadata format)
  const traceOptions: TraceOptions =
    options &&
    ('threadId' in options || 'input' in options || 'tags' in options || 'source' in options)
      ? (options as TraceOptions)
      : { source: (options as Record<string, unknown>)?.source as string };

  const metadata = traceOptions.source ? { source: traceOptions.source } : {};
  const startTime = new Date();
  const collectedAttrs: Record<string, unknown> = { ...metadata };
  let outputData: Record<string, unknown> | null = null;
  let usageData: TokenUsage | null = null;
  let costData: number | null = null;

  // Track child spans to ensure they end before trace
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const childSpans: any[] = [];

  // Create mock context for when Opik is not available
  const createMockContext = (): TraceContext => ({
    setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
    addEvent: (eventName, attrs) => {
      console.error(`[Trace:${name}] Event: ${eventName}`, attrs ? JSON.stringify(attrs) : '');
    },
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
      const duration = Date.now() - startTime.getTime();
      console.error(`[Trace:${name}] Duration: ${duration}ms`);
    },
    createChildSpan: async <S>(spanName: string, spanFn: (span: Span) => Promise<S>) => {
      const mockSpan: Span = {
        setAttributes: () => {},
        addEvent: () => {},
        setOutput: () => {},
        setUsage: () => {},
        setCost: () => {},
        end: () => {},
      };
      return spanFn(mockSpan);
    },
    getTraceId: () => null,
  });

  const client = await getOpikClient();
  if (!client) {
    const mockCtx = createMockContext();
    try {
      const result = await fn(mockCtx);
      mockCtx.end();
      return result;
    } catch (error) {
      mockCtx.end();
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let traceHandle: any = null;
  let traceId = '';

  try {
    // Build trace config
    const traceConfig: Record<string, unknown> = {
      name,
      projectName: OPIK_PROJECT,
      startTime,
      metadata,
    };

    if (traceOptions.threadId) {
      traceConfig.threadId = traceOptions.threadId;
      currentThreadId = traceOptions.threadId;
    }

    if (traceOptions.input) {
      traceConfig.input = traceOptions.input;
    }

    if (traceOptions.tags && traceOptions.tags.length > 0) {
      traceConfig.tags = traceOptions.tags;
    }

    traceHandle = client.trace(traceConfig);
    traceId = traceHandle.data?.id || traceHandle.id || `trace_${Date.now()}`;
    currentTraceId = traceId;

    // Store in map to avoid race conditions
    activeTraces.set(traceId, traceHandle);

    // Create real context
    const ctx: TraceContext = {
      setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
      addEvent: (eventName, attrs) => {
        Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
      },
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
        // End all child spans first (in reverse order)
        for (let i = childSpans.length - 1; i >= 0; i--) {
          try {
            childSpans[i].end();
          } catch {
            // Span might already be ended
          }
        }

        if (traceHandle) {
          const updateData: Record<string, unknown> = { metadata: collectedAttrs };
          if (outputData) {
            updateData.output = outputData;
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
          traceHandle.update(updateData);
          traceHandle.end();
        }

        // Remove from active traces
        if (traceId) {
          activeTraces.delete(traceId);
        }
      },
      createChildSpan: async <S>(
        spanName: string,
        spanFn: (span: Span) => Promise<S>,
        spanOptions?: SpanOptions
      ): Promise<S> => {
        return createSpanInternal(traceHandle, childSpans, spanName, spanFn, spanOptions);
      },
      getTraceId: () => traceId,
    };

    const result = await fn(ctx);
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'success';
    ctx.end();

    // Flush - await to ensure data is sent
    if (flushFn) {
      await flushFn().catch((err) => console.error('[Opik] Flush error:', err));
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    collectedAttrs.duration_ms = Date.now() - startTime.getTime();
    collectedAttrs.status = 'error';
    collectedAttrs.error_message = errorMessage;

    // End child spans
    for (let i = childSpans.length - 1; i >= 0; i--) {
      try {
        childSpans[i].end();
      } catch {
        // Ignore
      }
    }

    if (traceHandle) {
      traceHandle.update({
        metadata: collectedAttrs,
        output: { error: errorMessage },
        errorInfo: { message: errorMessage },
      });
      traceHandle.end();
    }

    if (traceId) {
      activeTraces.delete(traceId);
    }

    // Flush even on error
    if (flushFn) {
      await flushFn().catch(() => {});
    }

    throw error;
  }
}

/**
 * Internal function to create a span under a trace
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
  let outputData: Record<string, unknown> | null = null;
  let usageData: TokenUsage | null = null;
  let costData: number | null = null;

  if (!traceHandle) {
    // No trace handle, create mock span
    const mockSpan: Span = {
      setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
      addEvent: () => {},
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

  if (options?.input) {
    spanConfig.input = options.input;
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

    const span: Span = {
      setAttributes: (attrs) => Object.assign(collectedAttrs, attrs),
      addEvent: (eventName, attrs) => {
        Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
      },
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
        if (spanHandle) {
          const updateData: Record<string, unknown> = { metadata: collectedAttrs };
          if (outputData) {
            updateData.output = outputData;
          }
          // Correct usage format
          if (usageData) {
            updateData.usage = {
              prompt_tokens: usageData.prompt_tokens,
              completion_tokens: usageData.completion_tokens,
              total_tokens: usageData.total_tokens,
            };
          }
          // Cost is separate
          if (costData !== null) {
            updateData.totalEstimatedCost = costData;
          }
          spanHandle.update(updateData);
          spanHandle.end();
        }
      },
    };

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

    if (spanHandle) {
      spanHandle.update({
        metadata: collectedAttrs,
        output: { error: errorMessage },
        errorInfo: { message: errorMessage },
      });
      spanHandle.end();
    }

    throw error;
  }
}

/**
 * Legacy createSpan function for backward compatibility
 * Uses global currentTraceHandle (may have race conditions with concurrent requests)
 *
 * @deprecated Use trace().createChildSpan() instead for proper span hierarchy
 */
export async function createSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  // Get the most recent trace handle from the map
  const traceHandle =
    currentTraceId && activeTraces.has(currentTraceId) ? activeTraces.get(currentTraceId) : null;

  // Temporary array for this span (won't affect parent's tracking)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tempSpans: any[] = [];

  return createSpanInternal(traceHandle, tempSpans, name, fn, options);
}

/**
 * Get the current trace ID
 */
export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

/**
 * Get the trace URL for the dashboard
 * Format: https://www.comet.com/opik/{workspace}/projects/{projectId}/traces?trace={traceId}
 */
export function getTraceUrl(traceId?: string): string {
  const id = traceId || currentTraceId;
  const baseUrl = OPIK_BASE_URL || 'https://www.comet.com/opik';
  const workspace = OPIK_WORKSPACE || 'default';

  // Need project ID (UUID) for proper dashboard URLs
  if (!OPIK_PROJECT_ID) {
    // Fallback: return project list URL if no project ID configured
    return `${baseUrl}/${workspace}/projects`;
  }

  if (!id) {
    return `${baseUrl}/${workspace}/projects/${OPIK_PROJECT_ID}/traces`;
  }
  return `${baseUrl}/${workspace}/projects/${OPIK_PROJECT_ID}/traces?trace=${id}`;
}

/**
 * Get the current thread ID (for conversation grouping)
 */
export function getCurrentThreadId(): string | null {
  return currentThreadId;
}

/**
 * Feedback score definition
 */
export interface FeedbackScore {
  /** Name of the metric (e.g., 'relevance', 'accuracy', 'helpfulness') */
  name: string;
  /** Score value between 0 and 1 */
  value: number;
  /** Optional reason explaining the score */
  reason?: string;
}

/**
 * Log feedback scores to a trace
 * Used for evaluation and quality monitoring
 *
 * Uses SDK batch queue: traceFeedbackScoresBatchQueue.create() + flush()
 * See: https://www.comet.com/docs/opik/tracing/annotate_traces
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

  const client = await getOpikClient();
  if (!client) {
    console.error('[Opik] Client not initialized, cannot log feedback scores');
    return false;
  }

  try {
    // Use SDK batch queue method: create() then flush()
    // FeedbackScoreBatchItem: { id: traceId, name, value, source, reason? }
    for (const score of scores) {
      client.traceFeedbackScoresBatchQueue.create({
        id, // trace_id
        name: score.name,
        value: score.value,
        source: 'sdk',
        reason: score.reason,
      });
    }

    // Flush to send all queued scores
    await client.flush();

    console.error(`[Opik] Logged ${scores.length} feedback scores to trace ${id}`);
    return true;
  } catch (error) {
    console.error('[Opik] Error logging feedback scores:', error);
    return false;
  }
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

// Re-export REST API functions for advanced Opik features
export {
  // Project lookup
  getProjectIdByName,
  clearProjectCache,
  // Evaluators (Online Evaluation Rules)
  createEvaluator,
  listEvaluators,
  deleteEvaluator,
  updateEvaluator,
  // Annotation Queues
  createAnnotationQueue,
  listAnnotationQueues,
  addToAnnotationQueue,
  // Feedback Definitions
  createFeedbackDefinition,
  listFeedbackDefinitions,
  // Traces
  listTraces,
  aggregateTracesByTags,
  // Spans
  listSpansForTrace,
  listSpansForTraces,
  aggregateSpansByName,
  // Metrics
  getProjectStats,
  getMetricDailyData,
  // Stride presets
  STRIDE_EVALUATORS,
  STRIDE_FEEDBACK_DEFINITIONS,
  initializeStrideOpikSetup,
  isOpikRestAvailable,
} from './opikRest';

export type {
  EvaluatorType,
  LLMAsJudgeConfig,
  CreateEvaluatorRequest,
  Evaluator,
  AnnotationScope,
  CreateAnnotationQueueRequest,
  AnnotationQueue,
  FeedbackType,
  CreateFeedbackDefinitionRequest,
  FeedbackDefinition,
  TraceSummary,
  TraceListResponse,
  ProjectStats,
  MetricDataPoint,
  SpanSummary,
  SpanListResponse,
} from './opikRest';
