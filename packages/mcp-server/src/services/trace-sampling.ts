/**
 * Trace Sampling Service
 *
 * Intelligent sampling strategy for Opik traces to balance
 * observability vs. cost/noise.
 *
 * Sampling Rules:
 * - 100% on errors or fallback levels > 0 (always trace problems)
 * - 100% on user feedback (thumbs up/down)
 * - 100% for new users (first 7 days)
 * - 10% random sampling for successful level-0 traces
 *
 * This is a PRE-TRACE decision to avoid overhead.
 */

import { createLogger } from './logger.js';

const logger = createLogger('TraceSampling');

// ============================================================================
// Types
// ============================================================================

export interface SamplingContext {
  /** Profile ID for user lookup */
  profileId: string;
  /** Tab type being traced */
  tabType: string;
  /** Whether this is triggered by user feedback */
  hasFeedback?: boolean;
  /** Whether user has given feedback before */
  isFeedbackTrace?: boolean;
  /** Estimated fallback level (0 = full, 3 = static) */
  estimatedFallbackLevel?: number;
  /** Known error before trace starts */
  hasKnownError?: boolean;
  /** Profile creation date (for new user detection) */
  profileCreatedAt?: Date | string;
  /** Force trace regardless of sampling (for debugging) */
  forceTrace?: boolean;
  /** Experiment IDs user is enrolled in (A/B tests) */
  experimentIds?: string[];
}

export interface SamplingDecision {
  /** Whether to trace this request */
  shouldTrace: boolean;
  /** Reason for the decision */
  reason: SamplingReason;
  /** Sampling rate applied (for analytics) */
  samplingRate: number;
}

export type SamplingReason =
  | 'forced' // forceTrace=true
  | 'error' // hasKnownError=true
  | 'fallback' // fallbackLevel > 0
  | 'feedback' // hasFeedback=true
  | 'new_user' // profile < 7 days old
  | 'experiment' // enrolled in A/B test
  | 'sampled_in' // random 10% selection
  | 'sampled_out'; // random 90% skip

// ============================================================================
// Configuration
// ============================================================================

/** Random sampling rate for successful traces (10%) */
const SUCCESS_SAMPLING_RATE = 0.1;

/** New user window in days */
const NEW_USER_DAYS = 7;

/** Environment override for testing */
const FORCE_TRACE_ALL = process.env.OPIK_TRACE_ALL === 'true';

// ============================================================================
// Implementation
// ============================================================================

/**
 * Determine if a trace should be created based on sampling rules.
 * Call this BEFORE starting any trace operation.
 */
export function shouldSampleTrace(context: SamplingContext): SamplingDecision {
  // 1. Force trace via env var (testing/debugging)
  if (FORCE_TRACE_ALL) {
    return { shouldTrace: true, reason: 'forced', samplingRate: 1.0 };
  }

  // 2. Force trace via context (explicit request)
  if (context.forceTrace) {
    return { shouldTrace: true, reason: 'forced', samplingRate: 1.0 };
  }

  // 3. Always trace errors
  if (context.hasKnownError) {
    return { shouldTrace: true, reason: 'error', samplingRate: 1.0 };
  }

  // 4. Always trace fallback scenarios (indicates degraded experience)
  if (context.estimatedFallbackLevel !== undefined && context.estimatedFallbackLevel > 0) {
    return { shouldTrace: true, reason: 'fallback', samplingRate: 1.0 };
  }

  // 5. Always trace feedback (valuable for quality monitoring)
  if (context.hasFeedback || context.isFeedbackTrace) {
    return { shouldTrace: true, reason: 'feedback', samplingRate: 1.0 };
  }

  // 6. Always trace new users (first 7 days)
  if (isNewUser(context.profileCreatedAt)) {
    return { shouldTrace: true, reason: 'new_user', samplingRate: 1.0 };
  }

  // 7. Always trace users in experiments (for A/B analysis)
  if (context.experimentIds && context.experimentIds.length > 0) {
    return { shouldTrace: true, reason: 'experiment', samplingRate: 1.0 };
  }

  // 8. Random 10% sampling for normal successful traces
  if (shouldRandomSample(context.profileId)) {
    return { shouldTrace: true, reason: 'sampled_in', samplingRate: SUCCESS_SAMPLING_RATE };
  }

  // 9. Skip tracing (90% of normal cases)
  return { shouldTrace: false, reason: 'sampled_out', samplingRate: SUCCESS_SAMPLING_RATE };
}

/**
 * Check if profile is a new user (< 7 days old)
 */
function isNewUser(profileCreatedAt?: Date | string): boolean {
  if (!profileCreatedAt) return false;

  const createdDate =
    typeof profileCreatedAt === 'string' ? new Date(profileCreatedAt) : profileCreatedAt;

  if (isNaN(createdDate.getTime())) return false;

  const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceCreation < NEW_USER_DAYS;
}

/**
 * Deterministic random sampling based on profile ID.
 * Same profile always gets same result for consistency.
 */
function shouldRandomSample(profileId: string): boolean {
  // Simple hash to get deterministic random value
  const hash = simpleHash(profileId);
  return hash < SUCCESS_SAMPLING_RATE;
}

/**
 * Simple hash function that returns 0.0-1.0
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Normalize to 0.0-1.0
  return Math.abs(hash % 1000) / 1000;
}

// ============================================================================
// Post-Trace Decision (for upgrading sampling decision)
// ============================================================================

/**
 * Upgrade sampling decision after trace completes.
 * Use this to force trace upload when we discover an error or fallback.
 *
 * Note: This is called AFTER the trace is created but BEFORE it's flushed.
 * The trace wrapper should check this and force flush if needed.
 */
export function shouldUpgradeSampling(
  originalDecision: SamplingDecision,
  postContext: {
    hadError?: boolean;
    actualFallbackLevel?: number;
    receivedFeedback?: boolean;
  }
): SamplingDecision {
  // If already tracing, no upgrade needed
  if (originalDecision.shouldTrace) {
    return originalDecision;
  }

  // Upgrade if we discovered an error
  if (postContext.hadError) {
    logger.debug('Upgrading sampling: error discovered', {
      originalReason: originalDecision.reason,
    });
    return { shouldTrace: true, reason: 'error', samplingRate: 1.0 };
  }

  // Upgrade if we hit a fallback
  if (postContext.actualFallbackLevel !== undefined && postContext.actualFallbackLevel > 0) {
    logger.debug('Upgrading sampling: fallback discovered', {
      level: postContext.actualFallbackLevel,
    });
    return { shouldTrace: true, reason: 'fallback', samplingRate: 1.0 };
  }

  // Upgrade if user gave feedback
  if (postContext.receivedFeedback) {
    logger.debug('Upgrading sampling: feedback received');
    return { shouldTrace: true, reason: 'feedback', samplingRate: 1.0 };
  }

  // No upgrade needed
  return originalDecision;
}

// ============================================================================
// Analytics Helpers
// ============================================================================

/**
 * Get sampling statistics for monitoring
 */
export function getSamplingStats(): {
  samplingRate: number;
  newUserDays: number;
  forceAll: boolean;
} {
  return {
    samplingRate: SUCCESS_SAMPLING_RATE,
    newUserDays: NEW_USER_DAYS,
    forceAll: FORCE_TRACE_ALL,
  };
}

/**
 * Log sampling decision for debugging
 */
export function logSamplingDecision(context: SamplingContext, decision: SamplingDecision): void {
  if (decision.shouldTrace) {
    logger.debug('Trace sampled IN', {
      profileId: context.profileId.substring(0, 8) + '...',
      tabType: context.tabType,
      reason: decision.reason,
      rate: decision.samplingRate,
    });
  }
  // Don't log sampled_out to avoid noise
}

export default {
  shouldSampleTrace,
  shouldUpgradeSampling,
  getSamplingStats,
  logSamplingDecision,
};
