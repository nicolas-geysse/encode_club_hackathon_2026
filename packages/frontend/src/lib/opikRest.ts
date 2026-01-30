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

// Cache for project UUID lookup
let cachedProjectId: string | null = null;

/**
 * Project response from Opik API
 */
interface OpikProject {
  id: string;
  name: string;
}

/**
 * Get project UUID by name (cached after first lookup)
 * Opik API requires UUIDs for project_ids, not project names
 */
export async function getProjectIdByName(projectName: string): Promise<string | null> {
  // Return cached value if available
  if (cachedProjectId) {
    return cachedProjectId;
  }

  if (!OPIK_API_KEY) {
    console.error('[Opik REST] Cannot lookup project: OPIK_API_KEY not configured');
    return null;
  }

  try {
    const url = `${OPIK_BASE_URL}/v1/private/projects?name=${encodeURIComponent(projectName)}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPIK_API_KEY}`,
        'Comet-Workspace': OPIK_WORKSPACE,
      },
    });

    if (!response.ok) {
      console.error(`[Opik REST] Failed to lookup project: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { content?: OpikProject[] };
    const project = data.content?.find((p: OpikProject) => p.name === projectName);

    if (project) {
      cachedProjectId = project.id;
      console.error(`[Opik REST] Resolved project "${projectName}" to UUID: ${project.id}`);
      return project.id;
    }

    // Project not found - this is normal on first run before any trace is sent
    // Opik SDK auto-creates the project when first trace is logged
    console.error(
      `[Opik REST] Project "${projectName}" not found yet (will be created on first trace)`
    );
    return null;
  } catch (error) {
    console.error('[Opik REST] Error looking up project:', error);
    return null;
  }
}

/**
 * Clear cached project ID (useful for testing)
 */
export function clearProjectCache(): void {
  cachedProjectId = null;
}

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

  // Handle empty responses (204 No Content, or 201 with empty body)
  if (response.status === 204) {
    return {} as T;
  }

  // Check if response has content before parsing JSON
  const contentLength = response.headers.get('content-length');
  const contentType = response.headers.get('content-type');

  // Empty body or no JSON content-type
  if (contentLength === '0' || (response.status === 201 && !contentType?.includes('json'))) {
    return {} as T;
  }

  // Try to parse JSON, return empty object if fails
  const text = await response.text();
  if (!text || text.trim() === '') {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    // Some endpoints return success without JSON body
    return {} as T;
  }
}

// ============================================================
// DATASETS
// ============================================================

/**
 * Dataset item - flexible structure with any input/output fields
 * Common patterns:
 * - Q&A: { question: string, expected_answer: string }
 * - Chat: { input: { message, context }, expected_output: { response, intent } }
 * - Custom: any Record<string, unknown>
 */
export interface DatasetItem {
  /** Optional ID (auto-generated if not provided) */
  id?: string;
  /** Input data - can be any structure */
  input?: Record<string, unknown>;
  /** Expected output for evaluation */
  expected_output?: Record<string, unknown>;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
  /** Tags for filtering */
  tags?: string[];
  /** Source reference (e.g., trace_id for items created from traces) */
  source?: string;
  /** For Q&A datasets - alternative to input.question */
  question?: string;
  /** For Q&A datasets - alternative to expected_output.answer */
  expected_answer?: string;
}

/**
 * Create dataset request
 */
export interface CreateDatasetRequest {
  /** Dataset name (must be unique in workspace) */
  name: string;
  /** Description of the dataset's purpose */
  description?: string;
}

/**
 * Dataset response from API
 */
export interface Dataset {
  id: string;
  name: string;
  description?: string;
  item_count?: number;
  created_at: string;
  last_updated_at?: string;
}

/**
 * Dataset list response
 */
export interface DatasetListResponse {
  content: Dataset[];
  page: number;
  size: number;
  total: number;
}

/**
 * Dataset items list response
 */
export interface DatasetItemsResponse {
  content: DatasetItem[];
  page: number;
  size: number;
  total: number;
}

/**
 * Create a new dataset
 *
 * @example
 * const dataset = await createDataset({
 *   name: 'stride_benchmark_v1',
 *   description: 'Benchmark for student financial advisor evaluation'
 * });
 */
export async function createDataset(request: CreateDatasetRequest): Promise<Dataset> {
  return opikFetch<Dataset>('/datasets', {
    method: 'POST',
    body: JSON.stringify({
      name: request.name,
      description: request.description,
    }),
  });
}

/**
 * List all datasets in the workspace
 */
export async function listDatasets(options?: {
  name?: string;
  page?: number;
  size?: number;
}): Promise<DatasetListResponse> {
  const params = new URLSearchParams();
  if (options?.name) params.set('name', options.name);
  params.set('page', String(options?.page || 1));
  params.set('size', String(options?.size || 100));

  return opikFetch<DatasetListResponse>(`/datasets?${params.toString()}`);
}

/**
 * Get a dataset by ID
 */
export async function getDataset(datasetId: string): Promise<Dataset> {
  return opikFetch<Dataset>(`/datasets/${datasetId}`);
}

/**
 * Get a dataset by name
 */
export async function getDatasetByName(name: string): Promise<Dataset | null> {
  const result = await listDatasets({ name });
  return result.content.find((d) => d.name === name) || null;
}

/**
 * Delete a dataset
 */
export async function deleteDataset(datasetId: string): Promise<void> {
  await opikFetch(`/datasets/${datasetId}`, { method: 'DELETE' });
}

/**
 * Add items to a dataset
 *
 * @example
 * await addDatasetItems(datasetId, [
 *   {
 *     input: { message: "Comment économiser 100€?", profile: { income: 500 } },
 *     expected_output: { intent: "budget_analysis", should_be_safe: true },
 *     metadata: { category: "valid", subcategory: "savings" }
 *   }
 * ]);
 */
export async function addDatasetItems(datasetId: string, items: DatasetItem[]): Promise<void> {
  await opikFetch(`/datasets/${datasetId}/items`, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

/**
 * List items in a dataset
 */
export async function listDatasetItems(
  datasetId: string,
  options?: { page?: number; size?: number }
): Promise<DatasetItemsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(options?.page || 1));
  params.set('size', String(options?.size || 100));

  return opikFetch<DatasetItemsResponse>(`/datasets/${datasetId}/items?${params.toString()}`);
}

/**
 * Delete items from a dataset
 */
export async function deleteDatasetItems(datasetId: string, itemIds: string[]): Promise<void> {
  await opikFetch(`/datasets/${datasetId}/items`, {
    method: 'DELETE',
    body: JSON.stringify({ item_ids: itemIds }),
  });
}

// ============================================================
// EXPERIMENTS
// ============================================================

/**
 * Experiment status
 */
export type ExperimentStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Create experiment request
 */
export interface CreateExperimentRequest {
  /** Experiment name - use convention: project_type_date (e.g., stride_daily_2026-01-30) */
  name: string;
  /** Dataset ID to evaluate against */
  dataset_name: string;
  /** Description of what this experiment tests */
  description?: string;
  /** Metadata (e.g., prompt versions, model info) */
  metadata?: Record<string, unknown>;
}

/**
 * Experiment response from API
 */
export interface Experiment {
  id: string;
  name: string;
  dataset_id: string;
  dataset_name: string;
  status?: ExperimentStatus;
  created_at: string;
  last_updated_at?: string;
  metadata?: Record<string, unknown>;
  /** Aggregated metrics after completion */
  feedback_scores?: Array<{ name: string; avg: number; count: number }>;
  trace_count?: number;
}

/**
 * Experiment list response
 */
export interface ExperimentListResponse {
  content: Experiment[];
  page: number;
  size: number;
  total: number;
}

/**
 * Experiment item (result for one dataset item)
 */
export interface ExperimentItem {
  id: string;
  experiment_id: string;
  dataset_item_id: string;
  trace_id?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  feedback_scores?: Array<{ name: string; value: number; reason?: string }>;
  created_at: string;
}

/**
 * Create a new experiment
 *
 * @example
 * const experiment = await createExperiment({
 *   name: 'stride_daily_2026-01-30',
 *   dataset_name: 'stride_benchmark_v1',
 *   metadata: {
 *     prompt_versions: { 'budget-coach': 'a1b2c3d4' },
 *     model: 'llama-3.1-70b-versatile'
 *   }
 * });
 */
export async function createExperiment(request: CreateExperimentRequest): Promise<Experiment> {
  return opikFetch<Experiment>('/experiments', {
    method: 'POST',
    body: JSON.stringify({
      name: request.name,
      dataset_name: request.dataset_name,
      metadata: request.metadata,
    }),
  });
}

/**
 * List experiments
 */
export async function listExperiments(options?: {
  datasetId?: string;
  page?: number;
  size?: number;
}): Promise<ExperimentListResponse> {
  const params = new URLSearchParams();
  if (options?.datasetId) params.set('dataset_id', options.datasetId);
  params.set('page', String(options?.page || 1));
  params.set('size', String(options?.size || 100));

  return opikFetch<ExperimentListResponse>(`/experiments?${params.toString()}`);
}

/**
 * Get experiment by ID
 */
export async function getExperiment(experimentId: string): Promise<Experiment> {
  return opikFetch<Experiment>(`/experiments/${experimentId}`);
}

/**
 * Get experiment by name
 */
export async function getExperimentByName(name: string): Promise<Experiment | null> {
  const result = await listExperiments();
  return result.content.find((e) => e.name === name) || null;
}

/**
 * Delete an experiment
 */
export async function deleteExperiment(experimentId: string): Promise<void> {
  await opikFetch(`/experiments/${experimentId}`, { method: 'DELETE' });
}

/**
 * Add items to an experiment (results of running dataset items)
 *
 * @example
 * await addExperimentItems(experimentId, [
 *   {
 *     dataset_item_id: 'item-uuid',
 *     trace_id: 'trace-uuid', // Link to the trace for this run
 *     output: { response: "...", intent: "budget_analysis" },
 *     feedback_scores: [{ name: 'safety_score', value: 5, reason: 'Safe advice' }]
 *   }
 * ]);
 */
export async function addExperimentItems(
  experimentId: string,
  items: Array<{
    dataset_item_id: string;
    trace_id?: string;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
    feedback_scores?: Array<{ name: string; value: number; reason?: string }>;
  }>
): Promise<void> {
  await opikFetch(`/experiments/${experimentId}/items`, {
    method: 'POST',
    body: JSON.stringify({ experiment_items: items }),
  });
}

/**
 * List experiment items (results)
 */
export async function listExperimentItems(
  experimentId: string,
  options?: { page?: number; size?: number }
): Promise<{ content: ExperimentItem[]; page: number; size: number; total: number }> {
  const params = new URLSearchParams();
  params.set('page', String(options?.page || 1));
  params.set('size', String(options?.size || 100));

  return opikFetch(`/experiments/${experimentId}/items?${params.toString()}`);
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
  /** For categorical: map of category names to numeric values (e.g., { poor: 0.0, good: 1.0 }) */
  categories?: Record<string, number>;
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
    // Opik API expects categories directly in details as LinkedHashMap<String, Double>
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
// SPANS (for trace hierarchy)
// ============================================================

/**
 * Span summary from API
 */
export interface SpanSummary {
  id: string;
  traceId: string;
  name: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    cost?: number;
  };
}

/**
 * Span list response
 */
export interface SpanListResponse {
  content: SpanSummary[];
  page: number;
  size: number;
  total: number;
}

/**
 * List spans for a specific trace
 * Returns all child spans in the trace hierarchy
 */
export async function listSpansForTrace(
  traceId: string,
  options?: { page?: number; size?: number }
): Promise<SpanListResponse> {
  const params = new URLSearchParams();
  params.set('trace_id', traceId);
  params.set('page', String(options?.page || 1));
  params.set('size', String(options?.size || 100));

  try {
    return await opikFetch<SpanListResponse>(`/spans?${params.toString()}`);
  } catch {
    return { content: [], page: 1, size: 0, total: 0 };
  }
}

/**
 * List spans for multiple traces (batched)
 */
export async function listSpansForTraces(traceIds: string[]): Promise<SpanSummary[]> {
  const results = await Promise.all(traceIds.map((id) => listSpansForTrace(id)));
  return results.flatMap((r) => r.content);
}

/**
 * Aggregate spans by name for metrics
 */
export function aggregateSpansByName(spans: SpanSummary[]): {
  byName: Record<string, { count: number; avgDurationMs: number; totalTokens: number }>;
  totalSpans: number;
  totalDurationMs: number;
} {
  const byName: Record<string, { count: number; totalDuration: number; totalTokens: number }> = {};
  let totalDurationMs = 0;

  for (const span of spans) {
    const name = span.name;
    if (!byName[name]) {
      byName[name] = { count: 0, totalDuration: 0, totalTokens: 0 };
    }
    byName[name].count++;

    if (span.duration) {
      byName[name].totalDuration += span.duration;
      totalDurationMs += span.duration;
    }

    if (span.usage?.total_tokens) {
      byName[name].totalTokens += span.usage.total_tokens;
    }
  }

  // Convert to averages
  const result: Record<string, { count: number; avgDurationMs: number; totalTokens: number }> = {};
  for (const [name, stats] of Object.entries(byName)) {
    result[name] = {
      count: stats.count,
      avgDurationMs: stats.count > 0 ? stats.totalDuration / stats.count : 0,
      totalTokens: stats.totalTokens,
    };
  }

  return {
    byName: result,
    totalSpans: spans.length,
    totalDurationMs,
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
  /** Intent detection quality evaluator */
  intent_detection: {
    name: 'Intent Detection Quality',
    type: 'llm_as_judge' as EvaluatorType,
    action: 'evaluator' as const,
    samplingRate: 0.3, // Sample 30% of conversation traces to catch issues without high cost
    enabled: true,
    llmConfig: {
      prompt: `You are evaluating whether the intent detection system correctly understood the user's request.

User message: {{input.message}}
Detected intent action: {{output.intent.action}}
Detected pattern: {{output.intent._matchedPattern}}
Context: User has a complete profile and is in conversation mode.

Score from 1 to 5:
1 = Completely wrong intent (user wanted restart, got general chat; or user wanted to update profile but got new_goal)
2 = Partially wrong (right category but wrong specific action)
3 = Acceptable but imprecise (generic handling when specific action was available)
4 = Correct intent detected
5 = Perfect match with correct action and pattern

Common intents to watch for:
- "full onboarding", "restart", "start over", "recommencer" → restart_update_profile
- "new profile", "fresh start", "from scratch" → restart_new_profile
- "continue", "let's finish", "compléter" → continue_onboarding
- Name changes, city updates, "change my X" → profile-edit (update)
- "save for", "new goal", "$500 for laptop" → new_goal
- "how am I doing", "progress" → check_progress
- Generic questions/chat → general (default_fallback is OK)

If the user's message is truly ambiguous or general, a fallback is acceptable (score 3-4).
If there was a clear intent that wasn't detected, score lower (1-2).

Return JSON: {"score": X, "reason": "brief explanation"}`,
      scoreName: 'intent_detection_quality',
      scoreDescription: 'How well did the intent detection system understand the user request?',
      minScore: 1,
      maxScore: 5,
    },
  },

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
    name: 'intent_detection_confidence',
    type: 'numerical' as FeedbackType,
    description: 'Confidence in intent detection (0.2=fallback/unknown, 1.0=pattern matched)',
    minValue: 0,
    maxValue: 1,
  },
  {
    name: 'intent_detection_quality',
    type: 'numerical' as FeedbackType,
    description: 'LLM-judged quality of intent detection (1=wrong, 5=perfect)',
    minValue: 1,
    maxValue: 5,
  },
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
    // Opik API expects categories as LinkedHashMap<String, Double>, not array
    categories: { poor: 0.0, acceptable: 0.33, good: 0.66, excellent: 1.0 },
  },
];

/**
 * Helper to check if error is a 409 Conflict (already exists)
 */
function isAlreadyExistsError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.includes('409');
  }
  return false;
}

/**
 * Initialize all Stride evaluators and feedback definitions
 * Call this once to set up the Opik dashboard
 *
 * @param projectNameOrId - Either project name (e.g., "stride") or UUID
 *                          If a name is provided, it will be resolved to UUID
 */
export async function initializeStrideOpikSetup(projectNameOrId: string): Promise<{
  evaluators: Evaluator[];
  feedbackDefinitions: FeedbackDefinition[];
  annotationQueue: AnnotationQueue;
}> {
  console.error('[Opik REST] Initializing Stride Opik setup...');

  // Resolve project name to UUID if needed
  // UUIDs are 36 characters with dashes, names typically aren't
  let projectId = projectNameOrId;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    projectNameOrId
  );

  if (!isUuid) {
    const resolvedId = await getProjectIdByName(projectNameOrId);
    if (resolvedId) {
      projectId = resolvedId;
    } else {
      // Project doesn't exist yet - evaluators/queues require project UUID
      // They will be created on next app restart after first traces are logged
      console.error(`[Opik REST] Skipping evaluators/queue setup (project UUID not available yet)`);
      // Continue with feedback definitions which don't need project ID
    }
  }

  // Create feedback definitions first (don't require project ID)
  const feedbackDefinitions: FeedbackDefinition[] = [];
  for (const def of STRIDE_FEEDBACK_DEFINITIONS) {
    try {
      const created = await createFeedbackDefinition(def);
      feedbackDefinitions.push(created);
      console.error(`[Opik REST] Created feedback definition: ${def.name}`);
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        // 409 = already exists, that's expected and ok
        console.error(`[Opik REST] Feedback definition "${def.name}" already exists (ok)`);
      } else {
        console.error(`[Opik REST] Failed to create feedback definition ${def.name}:`, error);
      }
    }
  }

  // Create evaluators (requires valid project UUID)
  const evaluators: Evaluator[] = [];
  if (isUuid || cachedProjectId) {
    for (const [key, config] of Object.entries(STRIDE_EVALUATORS)) {
      try {
        const created = await createEvaluator({
          ...config,
          projectIds: [projectId],
        });
        evaluators.push(created);
        console.error(`[Opik REST] Created evaluator: ${key}`);
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          console.error(`[Opik REST] Evaluator "${key}" already exists (ok)`);
        } else {
          console.error(`[Opik REST] Failed to create evaluator ${key}:`, error);
        }
      }
    }
  }

  // Create annotation queue for human review (requires valid project UUID)
  let annotationQueue: AnnotationQueue = {
    id: 'skipped',
    name: 'Stride Advice Review',
    projectId,
    scope: 'trace',
    commentsEnabled: true,
    feedbackDefinitionNames: [],
    createdAt: new Date().toISOString(),
  };

  if (isUuid || cachedProjectId) {
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
      if (isAlreadyExistsError(error)) {
        console.error('[Opik REST] Annotation queue "Stride Advice Review" already exists (ok)');
      } else {
        console.error('[Opik REST] Failed to create annotation queue:', error);
      }
      // Keep the placeholder
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
};
