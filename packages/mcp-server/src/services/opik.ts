/**
 * Opik Tracing Service
 *
 * Provides observability for all tool calls and LLM interactions
 * Connects to self-hosted Opik instance
 */

// Note: Using dynamic import for opik as it may not be available during initial development
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let opikClient: any = null;
let currentTraceId: string | null = null;

// Configuration
// Note: Opik SDK connects to the API, not the frontend
// Frontend is at http://localhost:5173, API is at http://localhost:8085
const OPIK_BASE_URL = process.env.OPIK_BASE_URL || 'http://localhost:5173';
const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';

/**
 * Span interface for tracing
 */
export interface Span {
  setAttributes(attrs: Record<string, unknown>): void;
  addEvent(name: string, attrs?: Record<string, unknown>): void;
  end(): void;
}

/**
 * Initialize Opik client
 */
export async function initOpik(): Promise<void> {
  try {
    // Dynamic import to handle missing package gracefully
    const { Opik } = await import('opik');
    opikClient = new Opik({
      apiKey: process.env.OPIK_API_KEY,
      projectName: OPIK_PROJECT,
    });
    console.error(`Opik initialized with project: ${OPIK_PROJECT}`);
  } catch (error) {
    console.error('Opik not available, tracing disabled:', error);
  }
}

/**
 * Create a trace wrapper for a function
 * Automatically tracks duration, success/failure, and custom attributes
 */
export async function trace<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span
): Promise<T> {
  const startTime = Date.now();

  // Create a mock span if Opik is not available
  const mockSpan: Span = {
    setAttributes: (attrs) => {
      console.error(`[Trace:${name}] Attributes:`, JSON.stringify(attrs));
    },
    addEvent: (eventName, attrs) => {
      console.error(`[Trace:${name}] Event: ${eventName}`, attrs ? JSON.stringify(attrs) : '');
    },
    end: () => {
      const duration = Date.now() - startTime;
      console.error(`[Trace:${name}] Duration: ${duration}ms`);
    },
  };

  // Use Opik if available, otherwise use mock
  let span: Span = mockSpan;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let traceHandle: any = null;

  if (opikClient) {
    try {
      traceHandle = opikClient.trace({
        name,
        metadata: {
          project: OPIK_PROJECT,
          parentSpan: parentSpan ? 'has-parent' : 'root',
        },
      });
      currentTraceId = traceHandle.id;

      span = {
        setAttributes: (attrs) => {
          if (traceHandle) {
            traceHandle.setMetadata({ ...traceHandle.metadata, ...attrs });
          }
        },
        addEvent: (eventName, attrs) => {
          if (traceHandle) {
            traceHandle.log({ event: eventName, ...attrs });
          }
        },
        end: () => {
          if (traceHandle) {
            traceHandle.end();
          }
        },
      };
    } catch (error) {
      console.error('Error creating Opik trace:', error);
      span = mockSpan;
    }
  }

  try {
    const result = await fn(span);
    span.setAttributes({
      duration_ms: Date.now() - startTime,
      status: 'success',
    });
    span.end();
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    span.setAttributes({
      duration_ms: Date.now() - startTime,
      status: 'error',
      error_message: errorMessage,
    });
    span.end();
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
  if (!id) {
    return `${OPIK_BASE_URL}/projects/${OPIK_PROJECT}`;
  }
  return `${OPIK_BASE_URL}/traces/${id}`;
}

/**
 * Get the current trace ID
 */
export function getCurrentTraceId(): string | null {
  return currentTraceId;
}

// Export service
export const opik = {
  init: initOpik,
  trace,
  logFeedback,
  getTraceUrl,
  getCurrentTraceId,
};

export default opik;
