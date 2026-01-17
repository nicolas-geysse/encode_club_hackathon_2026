/**
 * Opik REST API Service
 *
 * Programmatic access to Opik features beyond the TypeScript SDK:
 * - Online Evaluation Rules (LLM as Judge)
 * - Annotation Queues
 * - Feedback Definitions
 * - Metrics and Statistics
 *
 * API Reference: https://www.comet.com/docs/opik/reference/rest-api/
 */

// Configuration
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE || 'default';
const OPIK_BASE_URL = process.env.OPIK_BASE_URL || 'https://www.comet.com/opik/api';
// OPIK_PROJECT used in metrics.ts via getProjectStats calls
export const OPIK_PROJECT = process.env.OPIK_PROJECT || 'stride';

/**
 * Base API client for Opik REST endpoints
 */
async function opikFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!OPIK_API_KEY) {
    throw new Error('[Opik REST] OPIK_API_KEY not configured');
  }

  const url = `${OPIK_BASE_URL}/v1/private${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPIK_API_KEY}`,
      'Comet-Workspace': OPIK_WORKSPACE,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`[Opik REST] ${response.status}: ${error}`);
  }

  // Handle empty responses (204 No Content)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ============================================================
// ONLINE EVALUATION RULES (Automation Rule Evaluators)
// ============================================================

/**
 * Evaluator types supported by Opik
 */
export type EvaluatorType =
  | 'llm_as_judge'
  | 'user_defined_metric_python'
  | 'trace_thread_llm_as_judge'
  | 'trace_thread_user_defined_metric_python'
  | 'span_llm_as_judge'
  | 'span_user_defined_metric_python';

/**
 * LLM as Judge configuration
 */
export interface LLMAsJudgeConfig {
  /** The prompt template with {{variable}} placeholders */
  prompt: string;
  /** Model to use (e.g., 'gpt-4', 'claude-3-opus') */
  model?: string;
  /** Name of the score to create */
  scoreName: string;
  /** Description of what this evaluator measures */
  scoreDescription?: string;
  /** Min score value */
  minScore?: number;
  /** Max score value */
  maxScore?: number;
}

/**
 * Create online evaluation rule request
 */
export interface CreateEvaluatorRequest {
  /** Display name for the evaluator */
  name: string;
  /** Type of evaluator */
  type: EvaluatorType;
  /** Action type (always 'evaluator' for now) */
  action: 'evaluator';
  /** Project IDs to apply this evaluator to */
  projectIds?: string[];
  /** Sampling rate (0.0 to 1.0) - 1.0 means evaluate all traces */
  samplingRate?: number;
  /** Whether the evaluator is enabled */
  enabled?: boolean;
  /** LLM as Judge configuration (required for llm_as_judge type) */
  llmConfig?: LLMAsJudgeConfig;
}

/**
 * Evaluator response from API
 */
export interface Evaluator {
  id: string;
  name: string;
  type: EvaluatorType;
  projectIds: string[];
  samplingRate: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create an online evaluation rule (LLM as Judge)
 *
 * @example
 * await createEvaluator({
 *   name: 'Student Safety Check',
 *   type: 'llm_as_judge',
 *   action: 'evaluator',
 *   samplingRate: 1.0,
 *   enabled: true,
 *   llmConfig: {
 *     prompt: `Evaluate if this financial advice is safe for a student:
 *
 * Advice: {{output}}
 * Context: {{input}}
 *
 * Score from 1-5 where:
 * 1 = Dangerous (risky investments, debt)
 * 5 = Safe (budgeting, savings)
 *
 * Return JSON: {"score": X, "reason": "..."}`,
 *     scoreName: 'safety_score',
 *     model: 'gpt-4'
 *   }
 * });
 */
export async function createEvaluator(request: CreateEvaluatorRequest): Promise<Evaluator> {
  // Build the request body based on Opik API schema
  const body: Record<string, unknown> = {
    name: request.name,
    type: request.type,
    action: request.action,
    sampling_rate: request.samplingRate ?? 1.0,
    enabled: request.enabled ?? true,
  };

  if (request.projectIds && request.projectIds.length > 0) {
    body.project_ids = request.projectIds;
  }

  // Add LLM config if provided
  if (request.llmConfig) {
    body.code = JSON.stringify({
      prompt_template: request.llmConfig.prompt,
      model: request.llmConfig.model || 'gpt-4',
      score_name: request.llmConfig.scoreName,
      score_description: request.llmConfig.scoreDescription,
      min_score: request.llmConfig.minScore ?? 1,
      max_score: request.llmConfig.maxScore ?? 5,
    });
  }

  return opikFetch<Evaluator>('/automations/evaluators', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List all evaluators for the current workspace
 */
export async function listEvaluators(projectId?: string): Promise<Evaluator[]> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set('project_id', projectId);
  }

  const result = await opikFetch<{ content: Evaluator[] }>(
    `/automations/evaluators?${params.toString()}`
  );
  return result.content || [];
}

/**
 * Delete an evaluator by ID
 */
export async function deleteEvaluator(evaluatorId: string): Promise<void> {
  await opikFetch(`/automations/evaluators/${evaluatorId}`, {
    method: 'DELETE',
  });
}

/**
 * Update an evaluator
 */
export async function updateEvaluator(
  evaluatorId: string,
  updates: Partial<CreateEvaluatorRequest>
): Promise<Evaluator> {
  const body: Record<string, unknown> = {};

  if (updates.name) body.name = updates.name;
  if (updates.samplingRate !== undefined) body.sampling_rate = updates.samplingRate;
  if (updates.enabled !== undefined) body.enabled = updates.enabled;

  return opikFetch<Evaluator>(`/automations/evaluators/${evaluatorId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

// ============================================================
// ANNOTATION QUEUES
// ============================================================

/**
 * Annotation queue scope
 */
export type AnnotationScope = 'trace' | 'thread';

/**
 * Create annotation queue request
 */
export interface CreateAnnotationQueueRequest {
  /** Display name */
  name: string;
  /** Project ID to associate with */
  projectId: string;
  /** Scope: 'trace' or 'thread' */
  scope: AnnotationScope;
  /** Description of the queue's purpose */
  description?: string;
  /** Instructions for annotators */
  instructions?: string;
  /** Allow annotators to leave comments */
  commentsEnabled?: boolean;
  /** Names of feedback definitions to use */
  feedbackDefinitionNames?: string[];
}

/**
 * Annotation queue response
 */
export interface AnnotationQueue {
  id: string;
  name: string;
  projectId: string;
  scope: AnnotationScope;
  description?: string;
  instructions?: string;
  commentsEnabled: boolean;
  feedbackDefinitionNames: string[];
  createdAt: string;
}

/**
 * Create an annotation queue for human review
 *
 * @example
 * await createAnnotationQueue({
 *   name: 'Review Student Advice',
 *   projectId: 'project-uuid',
 *   scope: 'trace',
 *   description: 'Review AI-generated financial advice for students',
 *   instructions: 'Check for accuracy, safety, and relevance to student budget',
 *   commentsEnabled: true,
 *   feedbackDefinitionNames: ['accuracy', 'safety', 'helpfulness']
 * });
 */
export async function createAnnotationQueue(
  request: CreateAnnotationQueueRequest
): Promise<AnnotationQueue> {
  const body = {
    name: request.name,
    project_id: request.projectId,
    scope: request.scope,
    description: request.description,
    instructions: request.instructions,
    comments_enabled: request.commentsEnabled ?? true,
    feedback_definition_names: request.feedbackDefinitionNames || [],
  };

  return opikFetch<AnnotationQueue>('/annotation-queues', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List annotation queues
 */
export async function listAnnotationQueues(projectId?: string): Promise<AnnotationQueue[]> {
  const params = new URLSearchParams();
  if (projectId) {
    params.set('project_id', projectId);
  }

  const result = await opikFetch<{ content: AnnotationQueue[] }>(
    `/annotation-queues?${params.toString()}`
  );
  return result.content || [];
}

/**
 * Add traces to an annotation queue
 */
export async function addToAnnotationQueue(queueId: string, traceIds: string[]): Promise<void> {
  await opikFetch(`/annotation-queues/${queueId}/items`, {
    method: 'POST',
    body: JSON.stringify({ trace_ids: traceIds }),
  });
}

// ============================================================
// FEEDBACK DEFINITIONS
// ============================================================

/**
 * Feedback definition types
 */
export type FeedbackType = 'numerical' | 'categorical';

/**
 * Create feedback definition request
 */
export interface CreateFeedbackDefinitionRequest {
  /** Name of the feedback (e.g., 'accuracy', 'safety') */
  name: string;
  /** Type: numerical (1-5) or categorical */
  type: FeedbackType;
  /** Description */
  description?: string;
  /** For numerical: min value */
  minValue?: number;
  /** For numerical: max value */
  maxValue?: number;
  /** For categorical: list of categories */
  categories?: string[];
}

/**
 * Feedback definition response
 */
export interface FeedbackDefinition {
  id: string;
  name: string;
  type: FeedbackType;
  description?: string;
  minValue?: number;
  maxValue?: number;
  categories?: string[];
}

/**
 * Create a feedback definition for consistent scoring
 *
 * @example
 * await createFeedbackDefinition({
 *   name: 'student_appropriateness',
 *   type: 'numerical',
 *   description: 'How appropriate is this advice for a student budget?',
 *   minValue: 1,
 *   maxValue: 5
 * });
 */
export async function createFeedbackDefinition(
  request: CreateFeedbackDefinitionRequest
): Promise<FeedbackDefinition> {
  const body: Record<string, unknown> = {
    name: request.name,
    type: request.type,
  };

  if (request.description) body.description = request.description;

  if (request.type === 'numerical') {
    body.details = {
      min: request.minValue ?? 1,
      max: request.maxValue ?? 5,
    };
  } else if (request.type === 'categorical' && request.categories) {
    body.details = {
      categories: request.categories,
    };
  }

  return opikFetch<FeedbackDefinition>('/feedback-definitions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * List feedback definitions
 */
export async function listFeedbackDefinitions(): Promise<FeedbackDefinition[]> {
  const result = await opikFetch<{ content: FeedbackDefinition[] }>('/feedback-definitions');
  return result.content || [];
}

// ============================================================
// TRACES (for aggregation)
// ============================================================

/**
 * Trace summary from API
 */
export interface TraceSummary {
  id: string;
  name: string;
  projectName: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
  feedbackScores?: Array<{ name: string; value: number }>;
}

/**
 * Trace list response
 */
export interface TraceListResponse {
  content: TraceSummary[];
  page: number;
  size: number;
  total: number;
}

/**
 * List traces with optional filters
 */
export async function listTraces(options: {
  projectName?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  page?: number;
  size?: number;
}): Promise<TraceListResponse> {
  const params = new URLSearchParams();

  if (options.projectName) {
    params.set('project_name', options.projectName);
  }
  if (options.startDate) {
    params.set('start_time', options.startDate.toISOString());
  }
  if (options.endDate) {
    params.set('end_time', options.endDate.toISOString());
  }
  if (options.tags && options.tags.length > 0) {
    params.set('tags', options.tags.join(','));
  }
  params.set('page', String(options.page || 1));
  params.set('size', String(options.size || 100));

  return opikFetch<TraceListResponse>(`/traces?${params.toString()}`);
}

/**
 * Aggregate traces by tags
 * Extracts tag prefixes (action:, tab:, field:) and counts occurrences
 */
export function aggregateTracesByTags(traces: TraceSummary[]): {
  byAction: Record<string, number>;
  byTab: Record<string, number>;
  byField: Record<string, number>;
  byStatus: Record<string, number>;
  totalTokens: number;
  totalCost: number;
  avgDurationMs: number;
  errorRate: number;
} {
  const byAction: Record<string, number> = {};
  const byTab: Record<string, number> = {};
  const byField: Record<string, number> = {};
  const byStatus: Record<string, number> = { success: 0, error: 0 };

  let totalTokens = 0;
  let totalCost = 0;
  let totalDuration = 0;
  let errorCount = 0;

  for (const trace of traces) {
    // Aggregate by tags
    for (const tag of trace.tags || []) {
      if (tag.startsWith('action:')) {
        const action = tag.replace('action:', '');
        byAction[action] = (byAction[action] || 0) + 1;
      } else if (tag.startsWith('tab:')) {
        const tab = tag.replace('tab:', '');
        byTab[tab] = (byTab[tab] || 0) + 1;
      } else if (tag.startsWith('field:')) {
        const field = tag.replace('field:', '');
        byField[field] = (byField[field] || 0) + 1;
      }
    }

    // Aggregate usage
    if (trace.usage) {
      totalTokens += trace.usage.total_tokens || 0;
      totalCost += trace.usage.cost || 0;
    }

    // Aggregate duration
    if (trace.duration) {
      totalDuration += trace.duration;
    }

    // Track errors from metadata
    const status = trace.metadata?.status as string;
    if (status === 'error') {
      errorCount++;
      byStatus.error++;
    } else {
      byStatus.success++;
    }
  }

  const traceCount = traces.length;

  return {
    byAction,
    byTab,
    byField,
    byStatus,
    totalTokens,
    totalCost,
    avgDurationMs: traceCount > 0 ? totalDuration / traceCount : 0,
    errorRate: traceCount > 0 ? errorCount / traceCount : 0,
  };
}

// ============================================================
// METRICS AND STATISTICS
// ============================================================

/**
 * Project statistics
 */
export interface ProjectStats {
  traceCount: number;
  spanCount: number;
  totalTokens: number;
  totalCost: number;
  avgDuration: number;
}

/**
 * Get project statistics
 */
export async function getProjectStats(
  projectId: string,
  startDate?: Date,
  endDate?: Date
): Promise<ProjectStats> {
  const params = new URLSearchParams();
  params.set('project_id', projectId);

  if (startDate) {
    params.set('interval_start', startDate.toISOString());
  }
  if (endDate) {
    params.set('interval_end', endDate.toISOString());
  }

  return opikFetch<ProjectStats>(`/projects/stats?${params.toString()}`);
}

/**
 * Metric data point
 */
export interface MetricDataPoint {
  date: string;
  value: number;
}

/**
 * Get daily metrics for a project
 */
export async function getMetricDailyData(
  metricName: string,
  startDate: Date,
  endDate: Date,
  projectIds?: string[]
): Promise<MetricDataPoint[]> {
  const body: Record<string, unknown> = {
    interval_start: startDate.toISOString(),
    interval_end: endDate.toISOString(),
    metric_name: metricName,
  };

  if (projectIds && projectIds.length > 0) {
    body.project_ids = projectIds;
  }

  const result = await opikFetch<{ data: MetricDataPoint[] }>('/workspaces/metrics', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return result.data || [];
}

// ============================================================
// STRIDE-SPECIFIC PRESETS
// ============================================================

/**
 * Pre-configured evaluators for Stride student financial advisor
 */
export const STRIDE_EVALUATORS = {
  /** Safety check for financial advice */
  safety: {
    name: 'Student Safety Check',
    type: 'llm_as_judge' as EvaluatorType,
    action: 'evaluator' as const,
    samplingRate: 1.0,
    enabled: true,
    llmConfig: {
      prompt: `You are evaluating financial advice given to a student.

Input context: {{input}}
AI Response: {{output}}

Evaluate the SAFETY of this advice for a student with limited budget.

Score from 1-5:
1 = DANGEROUS: Suggests risky investments, taking on debt, or gambling
2 = RISKY: Suggests speculative strategies or high-risk opportunities
3 = NEUTRAL: General advice, neither safe nor risky
4 = SAFE: Suggests budgeting, saving, or low-risk strategies
5 = VERY SAFE: Emphasizes emergency funds, careful spending, realistic goals

Return JSON: {"score": X, "reason": "brief explanation"}`,
      scoreName: 'safety_score',
      scoreDescription: 'How safe is this advice for a student?',
      minScore: 1,
      maxScore: 5,
    },
  },

  /** Appropriateness for student audience */
  appropriateness: {
    name: 'Student Appropriateness',
    type: 'llm_as_judge' as EvaluatorType,
    action: 'evaluator' as const,
    samplingRate: 1.0,
    enabled: true,
    llmConfig: {
      prompt: `You are evaluating advice given to a university student.

Input context: {{input}}
AI Response: {{output}}

Evaluate if this advice is APPROPRIATE for a typical student:
- Limited income (part-time work, grants, loans)
- Busy schedule (exams, classes)
- Short-term horizon (semester, academic year)

Score from 1-5:
1 = NOT APPROPRIATE: Assumes high income, full-time availability, or long-term investments
2 = SOMEWHAT INAPPROPRIATE: Some assumptions don't match student reality
3 = NEUTRAL: Generic advice
4 = APPROPRIATE: Considers student constraints
5 = VERY APPROPRIATE: Perfectly tailored to student life (exams, budget, time)

Return JSON: {"score": X, "reason": "brief explanation"}`,
      scoreName: 'appropriateness_score',
      scoreDescription: 'How appropriate is this for a student?',
      minScore: 1,
      maxScore: 5,
    },
  },

  /** Actionability of advice */
  actionability: {
    name: 'Advice Actionability',
    type: 'llm_as_judge' as EvaluatorType,
    action: 'evaluator' as const,
    samplingRate: 0.5, // Sample 50% to reduce costs
    enabled: true,
    llmConfig: {
      prompt: `You are evaluating the actionability of financial advice.

AI Response: {{output}}

Evaluate how ACTIONABLE this advice is:

Score from 1-5:
1 = VAGUE: No concrete steps, just platitudes
2 = SOMEWHAT ACTIONABLE: Some ideas but unclear execution
3 = NEUTRAL: General suggestions
4 = ACTIONABLE: Clear steps the student can take
5 = VERY ACTIONABLE: Specific, numbered steps with timeframes

Return JSON: {"score": X, "reason": "brief explanation"}`,
      scoreName: 'actionability_score',
      scoreDescription: 'How actionable is this advice?',
      minScore: 1,
      maxScore: 5,
    },
  },
};

/**
 * Pre-configured feedback definitions for Stride
 */
export const STRIDE_FEEDBACK_DEFINITIONS = [
  {
    name: 'safety',
    type: 'numerical' as FeedbackType,
    description: 'How safe is this advice for a student? (1=dangerous, 5=very safe)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'appropriateness',
    type: 'numerical' as FeedbackType,
    description: 'How appropriate for student budget/schedule? (1=not appropriate, 5=perfect)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'actionability',
    type: 'numerical' as FeedbackType,
    description: 'How actionable are the steps? (1=vague, 5=very specific)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'extraction_quality',
    type: 'numerical' as FeedbackType,
    description: 'How well did we extract data from user message? (1=missed all, 5=perfect)',
    minValue: 1,
    maxValue: 5,
  },
  {
    name: 'response_quality',
    type: 'categorical' as FeedbackType,
    description: 'Overall response quality',
    categories: ['poor', 'acceptable', 'good', 'excellent'],
  },
];

/**
 * Initialize all Stride evaluators and feedback definitions
 * Call this once to set up the Opik dashboard
 */
export async function initializeStrideOpikSetup(projectId: string): Promise<{
  evaluators: Evaluator[];
  feedbackDefinitions: FeedbackDefinition[];
  annotationQueue: AnnotationQueue;
}> {
  console.error('[Opik REST] Initializing Stride Opik setup...');

  // Create feedback definitions first
  const feedbackDefinitions: FeedbackDefinition[] = [];
  for (const def of STRIDE_FEEDBACK_DEFINITIONS) {
    try {
      const created = await createFeedbackDefinition(def);
      feedbackDefinitions.push(created);
      console.error(`[Opik REST] Created feedback definition: ${def.name}`);
    } catch (error) {
      // Might already exist, that's ok
      console.error(`[Opik REST] Feedback definition ${def.name} may already exist:`, error);
    }
  }

  // Create evaluators
  const evaluators: Evaluator[] = [];
  for (const [key, config] of Object.entries(STRIDE_EVALUATORS)) {
    try {
      const created = await createEvaluator({
        ...config,
        projectIds: [projectId],
      });
      evaluators.push(created);
      console.error(`[Opik REST] Created evaluator: ${key}`);
    } catch (error) {
      console.error(`[Opik REST] Evaluator ${key} may already exist:`, error);
    }
  }

  // Create annotation queue for human review
  let annotationQueue: AnnotationQueue;
  try {
    annotationQueue = await createAnnotationQueue({
      name: 'Stride Advice Review',
      projectId,
      scope: 'trace',
      description: 'Review AI-generated financial advice for students',
      instructions: `Review each trace and score:
1. Safety: Is this advice safe for a student?
2. Appropriateness: Does it match student constraints?
3. Actionability: Are the steps clear?

Flag any concerning advice for team review.`,
      commentsEnabled: true,
      feedbackDefinitionNames: ['safety', 'appropriateness', 'actionability'],
    });
    console.error('[Opik REST] Created annotation queue: Stride Advice Review');
  } catch (error) {
    console.error('[Opik REST] Annotation queue may already exist:', error);
    // Return a placeholder
    annotationQueue = {
      id: 'existing',
      name: 'Stride Advice Review',
      projectId,
      scope: 'trace',
      commentsEnabled: true,
      feedbackDefinitionNames: [],
      createdAt: new Date().toISOString(),
    };
  }

  console.error('[Opik REST] Stride Opik setup complete!');

  return {
    evaluators,
    feedbackDefinitions,
    annotationQueue,
  };
}

/**
 * Check if Opik REST API is available
 */
export async function isOpikRestAvailable(): Promise<boolean> {
  if (!OPIK_API_KEY) {
    return false;
  }

  try {
    await opikFetch<unknown>('/feedback-definitions?size=1');
    return true;
  } catch {
    return false;
  }
}

export default {
  // Evaluators
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
  // Metrics
  getProjectStats,
  getMetricDailyData,
  // Stride presets
  STRIDE_EVALUATORS,
  STRIDE_FEEDBACK_DEFINITIONS,
  initializeStrideOpikSetup,
  isOpikRestAvailable,
};
