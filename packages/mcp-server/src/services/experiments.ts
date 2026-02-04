/**
 * A/B Testing Experiment Framework
 *
 * Provides infrastructure for running controlled experiments on agent behavior.
 * Features:
 * - Deterministic variant allocation (same user = same variant)
 * - Experiment configuration with control/treatment variants
 * - Opik trace metadata for analysis
 * - Multiple concurrent experiments support
 *
 * Usage:
 * ```typescript
 * const variant = getExperimentVariant('rag-social-proof', profileId);
 * if (variant === 'treatment') {
 *   // Enable RAG
 * }
 * ```
 */

import { createLogger } from './logger.js';

const logger = createLogger('Experiments');

// ============================================================================
// Types
// ============================================================================

export type ExperimentVariant = 'control' | 'treatment';

export interface ExperimentConfig {
  /** Unique experiment identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what's being tested */
  description: string;
  /** Percentage of users in treatment (0.0-1.0) */
  allocation: number;
  /** Whether experiment is active */
  enabled: boolean;
  /** Start date (ISO string) */
  startDate?: string;
  /** End date (ISO string) - experiment auto-disables after this */
  endDate?: string;
  /** Configuration for control variant */
  control: Record<string, unknown>;
  /** Configuration for treatment variant */
  treatment: Record<string, unknown>;
  /** Tags for filtering in Opik */
  tags?: string[];
}

export interface ExperimentAssignment {
  experimentId: string;
  variant: ExperimentVariant;
  config: Record<string, unknown>;
}

export interface ExperimentMetadata {
  /** Comma-separated experiment IDs */
  'experiment.ids': string;
  /** Comma-separated experiment:variant pairs */
  'experiment.variants': string;
  /** Individual experiment assignments */
  [key: `experiment.${string}.variant`]: ExperimentVariant;
  [key: `experiment.${string}.allocation`]: number;
}

// ============================================================================
// Experiment Registry
// ============================================================================

/**
 * Active experiments registry.
 * Add new experiments here to enable them.
 */
export const EXPERIMENTS: Record<string, ExperimentConfig> = {
  /**
   * Test if RAG social proof improves tip quality and engagement.
   * Treatment: Include "X students like you saved €Y" in tips.
   */
  'rag-social-proof': {
    id: 'rag-social-proof',
    name: 'RAG Social Proof in Tips',
    description: 'Test if adding social proof from similar students improves engagement',
    allocation: 0.2, // 20% treatment
    enabled: false, // Disabled until RAG is implemented
    control: { enableRAG: false },
    treatment: { enableRAG: true },
    tags: ['rag', 'engagement'],
  },

  /**
   * Test 2 agents vs 4 agents for speed vs quality tradeoff.
   * Treatment: Use only primary + guardian (2 agents).
   * Control: Use all 4 agents (primary + secondaries + guardian).
   */
  'agent-count': {
    id: 'agent-count',
    name: 'Agent Count Optimization',
    description: 'Test if fewer agents (faster) maintains quality',
    allocation: 0.3, // 30% treatment
    enabled: true,
    control: { maxAgents: 4, skipSecondary: false },
    treatment: { maxAgents: 2, skipSecondary: true },
    tags: ['performance', 'agents'],
  },

  /**
   * Test Guardian strictness levels.
   * Treatment: More lenient validation (minConfidence: 0.5).
   * Control: Standard validation (minConfidence: 0.7).
   */
  'guardian-strictness': {
    id: 'guardian-strictness',
    name: 'Guardian Strictness Level',
    description: 'Test if lenient validation improves tip variety without safety issues',
    allocation: 0.25, // 25% treatment
    enabled: true,
    control: { minConfidence: 0.7, strictMode: true },
    treatment: { minConfidence: 0.5, strictMode: false },
    tags: ['guardian', 'quality'],
  },

  /**
   * Test different LLM temperatures for tip generation.
   * Treatment: Higher temperature (0.7) for more creative tips.
   * Control: Standard temperature (0.5).
   */
  'llm-temperature': {
    id: 'llm-temperature',
    name: 'LLM Temperature for Tips',
    description: 'Test if higher temperature improves tip creativity',
    allocation: 0.2, // 20% treatment
    enabled: true,
    control: { temperature: 0.5 },
    treatment: { temperature: 0.7 },
    tags: ['llm', 'creativity'],
  },

  /**
   * Test tip length preference.
   * Treatment: Shorter tips (maxTokens: 128).
   * Control: Standard length (maxTokens: 256).
   */
  'tip-length': {
    id: 'tip-length',
    name: 'Tip Length Optimization',
    description: 'Test if shorter tips have better engagement',
    allocation: 0.25, // 25% treatment
    enabled: false, // Start with other experiments first
    control: { maxTokens: 256 },
    treatment: { maxTokens: 128 },
    tags: ['ux', 'engagement'],
  },
};

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Simple hash function for deterministic variant allocation.
 * Returns a value between 0.0 and 1.0.
 */
function hashToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Normalize to 0.0-1.0
  return Math.abs(hash % 10000) / 10000;
}

/**
 * Check if an experiment is currently active.
 */
function isExperimentActive(experiment: ExperimentConfig): boolean {
  if (!experiment.enabled) return false;

  const now = new Date();

  if (experiment.startDate) {
    const start = new Date(experiment.startDate);
    if (now < start) return false;
  }

  if (experiment.endDate) {
    const end = new Date(experiment.endDate);
    if (now > end) return false;
  }

  return true;
}

/**
 * Get the variant for a user in a specific experiment.
 * Uses deterministic hashing so same user always gets same variant.
 *
 * @param experimentId - The experiment ID
 * @param profileId - The user's profile ID
 * @returns The variant ('control' or 'treatment'), or null if experiment not found/inactive
 */
export function getExperimentVariant(
  experimentId: string,
  profileId: string
): ExperimentVariant | null {
  const experiment = EXPERIMENTS[experimentId];

  if (!experiment) {
    logger.warn('Unknown experiment', { experimentId });
    return null;
  }

  if (!isExperimentActive(experiment)) {
    return null;
  }

  // Deterministic hash based on experiment + profile
  const hash = hashToFloat(`${experimentId}:${profileId}`);

  return hash < experiment.allocation ? 'treatment' : 'control';
}

/**
 * Get the configuration for a user's variant in an experiment.
 *
 * @param experimentId - The experiment ID
 * @param profileId - The user's profile ID
 * @returns The variant config, or null if not enrolled
 */
export function getExperimentConfig(
  experimentId: string,
  profileId: string
): Record<string, unknown> | null {
  const experiment = EXPERIMENTS[experimentId];
  const variant = getExperimentVariant(experimentId, profileId);

  if (!experiment || !variant) return null;

  return variant === 'treatment' ? experiment.treatment : experiment.control;
}

/**
 * Get all experiment assignments for a user.
 * Returns only active experiments the user is enrolled in.
 *
 * @param profileId - The user's profile ID
 * @param experimentIds - Optional list of specific experiments to check (defaults to all)
 * @returns Array of experiment assignments
 */
export function getExperimentAssignments(
  profileId: string,
  experimentIds?: string[]
): ExperimentAssignment[] {
  const ids = experimentIds || Object.keys(EXPERIMENTS);
  const assignments: ExperimentAssignment[] = [];

  for (const id of ids) {
    const experiment = EXPERIMENTS[id];
    if (!experiment || !isExperimentActive(experiment)) continue;

    const variant = getExperimentVariant(id, profileId);
    if (!variant) continue;

    assignments.push({
      experimentId: id,
      variant,
      config: variant === 'treatment' ? experiment.treatment : experiment.control,
    });
  }

  return assignments;
}

/**
 * Build experiment metadata for Opik traces.
 * This metadata enables filtering and analysis in the Opik dashboard.
 *
 * @param profileId - The user's profile ID
 * @param experimentIds - Optional list of specific experiments
 * @returns Metadata object to spread into trace options
 */
export function buildExperimentMetadata(
  profileId: string,
  experimentIds?: string[]
): Partial<ExperimentMetadata> {
  const assignments = getExperimentAssignments(profileId, experimentIds);

  if (assignments.length === 0) {
    return {};
  }

  const metadata: Record<string, unknown> = {
    'experiment.ids': assignments.map((a) => a.experimentId).join(','),
    'experiment.variants': assignments.map((a) => `${a.experimentId}:${a.variant}`).join(','),
  };

  // Add individual experiment details
  for (const assignment of assignments) {
    const experiment = EXPERIMENTS[assignment.experimentId];
    metadata[`experiment.${assignment.experimentId}.variant`] = assignment.variant;
    metadata[`experiment.${assignment.experimentId}.allocation`] = experiment?.allocation || 0;
  }

  return metadata as Partial<ExperimentMetadata>;
}

/**
 * Check if a user is in the treatment group for any active experiment.
 * Useful for quick checks in code paths.
 */
export function isInTreatment(profileId: string, experimentId: string): boolean {
  return getExperimentVariant(experimentId, profileId) === 'treatment';
}

/**
 * Get merged config from all active experiments for a user.
 * Later experiments override earlier ones if they set the same key.
 *
 * @param profileId - The user's profile ID
 * @returns Merged configuration object
 */
export function getMergedExperimentConfig(profileId: string): Record<string, unknown> {
  const assignments = getExperimentAssignments(profileId);
  const merged: Record<string, unknown> = {};

  for (const assignment of assignments) {
    Object.assign(merged, assignment.config);
  }

  return merged;
}

// ============================================================================
// Admin/Debug Functions
// ============================================================================

/**
 * Get all experiments with their current status.
 */
export function listExperiments(): Array<{
  id: string;
  name: string;
  enabled: boolean;
  active: boolean;
  allocation: number;
}> {
  return Object.values(EXPERIMENTS).map((exp) => ({
    id: exp.id,
    name: exp.name,
    enabled: exp.enabled,
    active: isExperimentActive(exp),
    allocation: exp.allocation,
  }));
}

/**
 * Preview variant assignment for a user (for debugging).
 */
export function previewAssignment(
  profileId: string
): Array<{ experimentId: string; variant: ExperimentVariant; active: boolean }> {
  return Object.values(EXPERIMENTS).map((exp) => ({
    experimentId: exp.id,
    variant: hashToFloat(`${exp.id}:${profileId}`) < exp.allocation ? 'treatment' : 'control',
    active: isExperimentActive(exp),
  }));
}

/**
 * Force enable/disable an experiment (for testing).
 * Note: This modifies the in-memory registry, not persistent storage.
 */
export function setExperimentEnabled(experimentId: string, enabled: boolean): boolean {
  const experiment = EXPERIMENTS[experimentId];
  if (!experiment) {
    logger.warn('Cannot set enabled: unknown experiment', { experimentId });
    return false;
  }

  experiment.enabled = enabled;
  logger.info('Experiment enabled state changed', { experimentId, enabled });
  return true;
}

export default {
  EXPERIMENTS,
  getExperimentVariant,
  getExperimentConfig,
  getExperimentAssignments,
  buildExperimentMetadata,
  isInTreatment,
  getMergedExperimentConfig,
  listExperiments,
  previewAssignment,
  setExperimentEnabled,
};
