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

// Configuration - env vars read lazily to avoid race conditions with .env loading
// in server-side frameworks (Vinxi/SolidStart)
// Functions below read process.env directly at runtime

// Helper to get env vars lazily
function getOpikConfig() {
  return {
    apiKey: process.env.OPIK_API_KEY?.trim(),
    workspace: process.env.OPIK_WORKSPACE?.trim(),
    project: process.env.OPIK_PROJECT?.trim() || 'stride',
    projectId: process.env.OPIK_PROJECT_ID?.trim(),
    baseUrl: process.env.OPIK_BASE_URL?.trim(),
    enabled: process.env.ENABLE_OPIK !== 'false',
  };
}

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

  // Read env vars lazily at runtime
  const cfg = getOpikConfig();

  if (!cfg.enabled) {
    // Only log once to avoid spamming
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Opik] Tracing disabled by ENABLE_OPIK=false');
    }
    return null;
  }

  if (!cfg.apiKey) {
    console.error('[Opik] OPIK_API_KEY not set, tracing disabled');
    return null;
  }

  try {
    const opikModule = await import('opik');
    const { Opik, flushAll } = opikModule;

    flushFn = flushAll;

    // Workaround for Opik SDK v1.9.92 bug: SDK doesn't pass apiKey in HTTP headers
    // We explicitly add the authorization header to ensure authentication works
    const effectiveApiUrl = cfg.baseUrl || 'https://www.comet.com/opik/api';

    // SDK bug workaround: explicitly set env vars before creating client
    // The HTTP client layer may read from env vars instead of constructor params
    process.env.OPIK_API_KEY = cfg.apiKey;
    process.env.OPIK_URL_OVERRIDE = effectiveApiUrl;
    if (cfg.workspace) {
      process.env.OPIK_WORKSPACE = cfg.workspace;
    }

    opikClient = new Opik({
      apiKey: cfg.apiKey,
      projectName: cfg.project,
      workspaceName: cfg.workspace,
      apiUrl: effectiveApiUrl,
      headers: {
        authorization: cfg.apiKey, // Workaround SDK bug - pass API key directly
      },
    });
    console.error(
      `[Opik] Initialized - project: ${cfg.project}, workspace: ${cfg.workspace || 'default'}`
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
  /** Additional metadata to attach to the trace (merged with source) */
  metadata?: Record<string, unknown>;
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
    ('threadId' in options ||
      'input' in options ||
      'tags' in options ||
      'source' in options ||
      'metadata' in options)
      ? (options as TraceOptions)
      : { source: (options as Record<string, unknown>)?.source as string };

  // Merge source and custom metadata into initial trace metadata
  // This ensures metadata is set at trace creation time (workaround for SDK update() issues)
  const metadata = {
    ...(traceOptions.source ? { source: traceOptions.source } : {}),
    ...(traceOptions.metadata || {}),
  };
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
    // Build trace config (get project name lazily)
    const cfg = getOpikConfig();
    const traceConfig: Record<string, unknown> = {
      name,
      projectName: cfg.project,
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
  // Read config lazily at runtime
  const cfg = getOpikConfig();
  const baseUrl = cfg.baseUrl || 'https://www.comet.com/opik';
  const workspace = cfg.workspace || 'default';

  // Need project ID (UUID) for proper dashboard URLs
  if (!cfg.projectId) {
    // Fallback: return project list URL if no project ID configured
    return `${baseUrl}/${workspace}/projects`;
  }

  if (!id) {
    return `${baseUrl}/${workspace}/projects/${cfg.projectId}/traces`;
  }
  return `${baseUrl}/${workspace}/projects/${cfg.projectId}/traces?trace=${id}`;
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
 * Note: Using REST API instead of batch queue due to visibility issue
 * See: https://github.com/comet-ml/opik/issues/2769
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

  // Read config lazily at runtime
  const cfg = getOpikConfig();

  if (!cfg.apiKey) {
    console.error('[Opik] OPIK_API_KEY not set, cannot log feedback scores');
    return false;
  }

  try {
    // Use REST API directly for each score to ensure visibility in traces table
    // Endpoint: PUT /v1/private/traces/{id}/feedback-scores
    const apiUrl = cfg.baseUrl || 'https://www.comet.com/opik/api';

    // Track if all scores were logged successfully
    let allSucceeded = true;
    let successCount = 0;

    for (const score of scores) {
      const response = await fetch(`${apiUrl}/v1/private/traces/${id}/feedback-scores`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          authorization: cfg.apiKey, // Opik API expects raw API key, not "Bearer" prefix
          ...(cfg.workspace ? { 'Comet-Workspace': cfg.workspace } : {}),
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

    console.error(
      `[Opik] Logged ${successCount}/${scores.length} feedback scores to trace ${id}${allSucceeded ? '' : ' (some failed)'}`
    );
    return allSucceeded;
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
 * Audit information returned with API responses
 * Allows clients to verify that their request was traced
 */
export interface AuditInfo {
  /** The trace ID for this request */
  traceId: string | null;
  /** Direct URL to view the trace in Opik dashboard */
  traceUrl: string;
}

/**
 * Create audit info from a trace context
 * Use this in API handlers to include tracing info in responses
 *
 * @example
 * ```typescript
 * const result = await trace('my.operation', async (ctx) => {
 *   // ... operation ...
 *   return { data: myData, ...createAuditInfo(ctx) };
 * });
 * ```
 */
export function createAuditInfo(ctx: TraceContext): AuditInfo {
  const traceId = ctx.getTraceId();
  return {
    traceId,
    traceUrl: getTraceUrl(traceId || undefined),
  };
}

/**
 * Create audit info from current trace (for use outside trace context)
 * Falls back to current global trace ID
 */
export function createAuditInfoFromCurrent(): AuditInfo {
  return {
    traceId: currentTraceId,
    traceUrl: getTraceUrl(currentTraceId || undefined),
  };
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
  // Datasets
  createDataset,
  listDatasets,
  getDataset,
  getDatasetByName,
  deleteDataset,
  addDatasetItems,
  listDatasetItems,
  deleteDatasetItems,
  // Experiments
  createExperiment,
  listExperiments,
  getExperiment,
  getExperimentByName,
  deleteExperiment,
  addExperimentItems,
  listExperimentItems,
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
  // Datasets
  DatasetItem,
  CreateDatasetRequest,
  Dataset,
  DatasetListResponse,
  DatasetItemsResponse,
  // Experiments
  ExperimentStatus,
  CreateExperimentRequest,
  Experiment,
  ExperimentListResponse,
  ExperimentItem,
  // Evaluators
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

// ============================================================
// PROMPT VERSION TRACKING
// ============================================================

import { createHash } from 'crypto';

export interface PromptMetadata {
  name: string;
  version: string; // 8-char short hash
  hash: string; // Full SHA256
}

// Cache hashes (prompts don't change at runtime)
const promptHashCache = new Map<string, PromptMetadata>();

/**
 * Register a prompt and generate its hash for version tracking.
 * Call this once at module initialization for each agent/prompt.
 *
 * @param agentId - Unique identifier for the agent/prompt (e.g., 'onboarding-extractor')
 * @param instructions - The full prompt/instructions string
 * @returns PromptMetadata with name, version (8-char), and full hash
 */
export function registerPrompt(agentId: string, instructions: string): PromptMetadata {
  const hash = createHash('sha256').update(instructions).digest('hex');
  const metadata: PromptMetadata = {
    name: agentId,
    version: hash.slice(0, 8),
    hash,
  };
  promptHashCache.set(agentId, metadata);
  return metadata;
}

/**
 * Get prompt metadata for an agent by ID.
 *
 * @param agentId - The agent ID to look up
 * @returns PromptMetadata or undefined if not registered
 */
export function getPromptMetadata(agentId: string): PromptMetadata | undefined {
  return promptHashCache.get(agentId);
}

/**
 * Set prompt version attributes on a span/trace context.
 * Call this at the start of any trace that uses an agent.
 *
 * @param ctx - The Span or TraceContext to set attributes on
 * @param agentId - The agent ID to look up metadata for
 *
 * @example
 * ```typescript
 * return trace('agent.onboarding', async (ctx) => {
 *   setPromptAttributes(ctx, 'onboarding-extractor');
 *   // ... rest of function
 * });
 * ```
 */
export function setPromptAttributes(ctx: Span | TraceContext, agentId: string): void {
  const meta = getPromptMetadata(agentId);
  if (!meta) {
    console.warn(`[Opik] No prompt metadata registered for agent '${agentId}'`);
    return;
  }
  ctx.setAttributes({
    'prompt.name': meta.name,
    'prompt.version': meta.version,
    'prompt.hash': meta.hash,
  });
}
