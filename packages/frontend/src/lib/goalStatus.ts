/**
 * Goal Status Calculation Module
 *
 * Provides unified, configurable thresholds for goal progress status.
 * Single source of truth for status determination across all goal display components.
 *
 * Part of v4.0 Goals Tab Fix (Phase 22) - eliminates dual calculation systems
 * between EarningsChart and WeeklyProgressCards.
 */

// Re-export GoalStatus type from earnings.ts for convenience
export type { GoalStatus } from '../types/earnings';

// Import for internal use
import type { GoalStatus } from '../types/earnings';

// === CONFIGURABLE THRESHOLDS ===

/**
 * Threshold ratios for goal status determination.
 *
 * These values define the boundaries between status levels based on
 * the ratio of cumulative earned vs cumulative target:
 *
 * - AHEAD:    >= 105% of target (exceeding expectations)
 * - ON_TRACK: >= 90% of target (within acceptable range)
 * - BEHIND:   >= 40% of target (recoverable with effort)
 * - CRITICAL: < 40% of target (needs intervention)
 *
 * These thresholds match WeeklyProgressCards (lines 203-219) for consistency.
 */
export const GOAL_STATUS_THRESHOLDS = {
  AHEAD: 1.05, // >= 105% of cumulative target = ahead
  ON_TRACK: 0.9, // >= 90% = on-track
  BEHIND: 0.4, // >= 40% = behind
  // < 40% = critical
} as const;

export type GoalStatusThresholds = typeof GOAL_STATUS_THRESHOLDS;

// === STATUS CALCULATION ===

/**
 * Calculate goal status from cumulative progress.
 *
 * Compares cumulative earned amount against cumulative target
 * using configurable threshold ratios.
 *
 * @param cumulativeEarned - Total amount earned toward goal so far
 * @param cumulativeTarget - Expected cumulative target for current point in time
 * @param thresholds - Optional custom thresholds (defaults to GOAL_STATUS_THRESHOLDS)
 * @returns GoalStatus indicating progress level
 *
 * @example
 * // User has earned 950 out of expected 1000 (95%)
 * calculateGoalStatus(950, 1000) // Returns 'on-track'
 *
 * // User has earned 1100 out of expected 1000 (110%)
 * calculateGoalStatus(1100, 1000) // Returns 'ahead'
 *
 * // User has earned 300 out of expected 1000 (30%)
 * calculateGoalStatus(300, 1000) // Returns 'critical'
 */
export function calculateGoalStatus(
  cumulativeEarned: number,
  cumulativeTarget: number,
  thresholds = GOAL_STATUS_THRESHOLDS
): GoalStatus {
  // Handle edge case: no target yet (goal just started or target is zero)
  if (cumulativeTarget <= 0) {
    return cumulativeEarned > 0 ? 'ahead' : 'on-track';
  }

  const ratio = cumulativeEarned / cumulativeTarget;

  if (ratio >= thresholds.AHEAD) return 'ahead';
  if (ratio >= thresholds.ON_TRACK) return 'on-track';
  if (ratio >= thresholds.BEHIND) return 'behind';
  return 'critical';
}

// === PACE CALCULATION ===

/**
 * Determine if user is on pace to meet their goal.
 *
 * Simplified boolean check using ON_TRACK threshold.
 * Useful for binary on-pace/off-pace indicators.
 *
 * @param cumulativeEarned - Total amount earned toward goal so far
 * @param cumulativeTarget - Expected cumulative target for current point in time
 * @param thresholds - Optional custom thresholds (defaults to GOAL_STATUS_THRESHOLDS)
 * @returns true if on pace (>= ON_TRACK threshold), false otherwise
 *
 * @example
 * calculateOnPace(900, 1000) // true (90% >= 90% threshold)
 * calculateOnPace(899, 1000) // false (89.9% < 90% threshold)
 */
export function calculateOnPace(
  cumulativeEarned: number,
  cumulativeTarget: number,
  thresholds = GOAL_STATUS_THRESHOLDS
): boolean {
  if (cumulativeTarget <= 0) return true;
  const ratio = cumulativeEarned / cumulativeTarget;
  return ratio >= thresholds.ON_TRACK;
}
