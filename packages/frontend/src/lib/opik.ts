/**
 * Opik Tracing Utility for Frontend
 *
 * Provides observability for API endpoints and LLM interactions.
 * Connects to Opik Cloud or self-hosted instance.
 */

// Configuration from environment
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE;
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';
const OPIK_BASE_URL = process.env.OPIK_BASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
let currentTraceId: string | null = null;
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
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
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
      traceHandle = client.trace({
        name,
        projectName: OPIK_PROJECT,
        startTime,
        metadata: {
          ...metadata,
        },
      });
      currentTraceId = traceHandle.data?.id;

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
