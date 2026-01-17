/**
 * Opik Tracing Utility for Frontend
 *
 * Provides observability for API endpoints and LLM interactions.
 * Connects to Opik Cloud or self-hosted instance.
 *
 * Features:
 * - Traces: Individual operations/requests
 * - Spans: Nested operations within traces
 * - Threads: Group related traces (e.g., conversations)
 * - Feedback Scores: Evaluation metrics on traces
 */

// Configuration from environment
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE;
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';
const OPIK_BASE_URL = process.env.OPIK_BASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
let currentTraceId: string | null = null;
let currentThreadId: string | null = null;
let flushFn: (() => Promise<void>) | null = null;

/**
 * Span interface for tracing
 */
export interface Span {
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  end(): void;
}

/**
 * Initialize Opik client (lazy)
 */
async function getOpikClient() {
  if (opikClient) return opikClient;

  if (!OPIK_API_KEY) {
    console.error('[Opik Frontend] OPIK_API_KEY not set, tracing disabled');
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
      `[Opik Frontend] Initialized with project: ${OPIK_PROJECT}, workspace: ${OPIK_WORKSPACE || 'default'}`
    );
    return opikClient;
  } catch (error) {
    console.error('[Opik Frontend] Failed to initialize:', error);
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
  /** Input data for the trace */
  input?: Record<string, unknown>;
  /** Tags for filtering in dashboard */
  tags?: string[];
}

/**
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 *
 * @param name - Name of the trace (e.g., 'chat.onboarding')
 * @param fn - Function to execute within the trace
 * @param options - Additional trace options (threadId, input, tags)
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
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

  // Create a mock span for logging when Opik is not available
  const mockSpan: Span = {
    setAttributes: (attrs) => {
      Object.assign(collectedAttrs, attrs);
    },
    addEvent: (eventName, attrs) => {
      console.error(`[Trace:${name}] Event: ${eventName}`, attrs ? JSON.stringify(attrs) : '');
    },
    end: () => {
      const duration = Date.now() - startTime.getTime();
      console.error(
        `[Trace:${name}] Duration: ${duration}ms, Attrs:`,
        JSON.stringify(collectedAttrs)
      );
    },
  };

  let span: Span = mockSpan;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let traceHandle: any = null;

  const client = await getOpikClient();
  if (client) {
    try {
      // Build trace config with optional threadId for conversation grouping
      const traceConfig: Record<string, unknown> = {
        name,
        projectName: OPIK_PROJECT,
        startTime,
        metadata: {
          ...metadata,
        },
      };

      // Add threadId if provided (groups traces into conversations in Opik UI)
      if (traceOptions.threadId) {
        traceConfig.threadId = traceOptions.threadId;
        currentThreadId = traceOptions.threadId;
      }

      // Add input if provided (shows in trace details)
      if (traceOptions.input) {
        traceConfig.input = traceOptions.input;
      }

      // Add tags if provided
      if (traceOptions.tags && traceOptions.tags.length > 0) {
        traceConfig.tags = traceOptions.tags;
      }

      traceHandle = client.trace(traceConfig);
      currentTraceId = traceHandle.data?.id || traceHandle.id;

      span = {
        setAttributes: (attrs) => {
          Object.assign(collectedAttrs, attrs);
        },
        addEvent: (eventName, attrs) => {
          // Events stored in metadata
          Object.assign(collectedAttrs, { [`event_${eventName}`]: attrs || true });
        },
        end: () => {
          if (traceHandle) {
            traceHandle.update({ metadata: collectedAttrs });
            traceHandle.end();
          }
        },
      };
    } catch (error) {
      console.error('[Opik Frontend] Error creating trace:', error);
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
      flushFn().catch((err) => console.error('[Opik Frontend] Flush error:', err));
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
      flushFn().catch((err) => console.error('[Opik Frontend] Flush error:', err));
    }

    throw error;
  }
}

/**
 * Get the current trace ID
 */
export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

/**
 * Get the trace URL for the dashboard
 */
export function getTraceUrl(traceId?: string): string {
  const id = traceId || currentTraceId;
  const baseUrl = OPIK_BASE_URL || 'https://www.comet.com/opik';
  const workspace = OPIK_WORKSPACE || 'default';

  if (!id) {
    return `${baseUrl}/${workspace}/${OPIK_PROJECT}`;
  }
  return `${baseUrl}/${workspace}/${OPIK_PROJECT}/traces/${id}`;
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
 * @param traceId - The trace ID to attach feedback to (defaults to current trace)
 * @param scores - Array of feedback scores
 *
 * @example
 * await logFeedbackScores(traceId, [
 *   { name: 'relevance', value: 0.9, reason: 'Answer was relevant to the question' },
 *   { name: 'accuracy', value: 0.85 },
 *   { name: 'helpfulness', value: 0.95 }
 * ]);
 */
export async function logFeedbackScores(
  traceId: string | null,
  scores: FeedbackScore[]
): Promise<boolean> {
  const id = traceId || currentTraceId;
  if (!id) {
    console.error('[Opik Frontend] No trace ID available for feedback scores');
    return false;
  }

  const client = await getOpikClient();
  if (!client) {
    console.error('[Opik Frontend] Client not available for feedback scores');
    return false;
  }

  try {
    // Format scores for Opik API
    const formattedScores = scores.map((score) => ({
      id,
      name: score.name,
      value: score.value,
      reason: score.reason,
    }));

    await client.logTracesFeedbackScores(formattedScores);

    // Flush to ensure scores are sent
    if (flushFn) {
      await flushFn();
    }

    console.error(`[Opik Frontend] Logged ${scores.length} feedback scores to trace ${id}`);
    return true;
  } catch (error) {
    console.error('[Opik Frontend] Error logging feedback scores:', error);
    return false;
  }
}

/**
 * Set the current thread ID for grouping subsequent traces
 * Useful for starting a new conversation
 */
export function setThreadId(threadId: string): void {
  currentThreadId = threadId;
}

/**
 * Generate a new unique thread ID
 * Use this when starting a new conversation
 */
export function generateThreadId(): string {
  const id = `thread_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  currentThreadId = id;
  return id;
}

// Re-export REST API functions for advanced Opik features
export {
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
  ProjectStats,
  MetricDataPoint,
} from './opikRest';
