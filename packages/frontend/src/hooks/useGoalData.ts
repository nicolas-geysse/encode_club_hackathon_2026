/**
 * useGoalData Hook
 *
 * Centralized data orchestration hook for goal progress tracking.
 * Provides unified access to earnings, milestones, and computed stats
 * for GoalsTab, WeeklyProgressCards, and EarningsChart components.
 *
 * Part of v4.0 Goals Tab Fix - replaces scattered calculations
 * with single source of truth for all goal-related data.
 *
 * SKELETON IMPLEMENTATION - stub values returned.
 * Real data fetching to be implemented in Phase 21.
 */

import { createSignal, createMemo, type Accessor } from 'solid-js';
import type { EarningEvent, GoalStatus } from '../types/earnings';
import type { Goal } from '../lib/goalService';
import type { FullProfile } from '../lib/profileService';

// === RETROPLAN TYPES ===
// Simplified types for hook return values.
// Full Retroplan types are in routes/api/retroplan.ts

/**
 * Week capacity information for milestone calculation
 */
export interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected' | 'boosted';
  effectiveHours: number;
  maxEarningPotential: number;
}

/**
 * Dynamic milestone with capacity-aware targets
 */
export interface DynamicMilestone {
  weekNumber: number;
  baseTarget: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: WeekCapacity;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'protected';
  isCatchUpWeek: boolean;
  catchUpAmount: number;
}

/**
 * Retroplan with capacity-aware milestones
 */
export interface Retroplan {
  id: string;
  goalId: string;
  milestones: DynamicMilestone[];
  totalWeeks: number;
  boostedWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  frontLoadedPercentage: number;
  riskFactors: string[];
}

// === HOOK OPTIONS ===

/**
 * Configuration options for useGoalData hook.
 */
export interface UseGoalDataOptions {
  /**
   * Include simulation data for "What If" scenarios.
   * When true, factors in simulated time offset from simulation_state table.
   */
  includeSimulation?: boolean;
}

// === HOOK RESULT ===

/**
 * Unified stats computed from goal, earnings, and capacity data.
 */
export interface GoalStats {
  /** Total amount earned toward goal */
  totalEarned: number;
  /** Capacity-aware target for current week */
  weeklyTarget: number;
  /** Linear weekly need (total / weeks) for comparison */
  linearWeeklyNeed: number;
  /** Current goal status */
  status: GoalStatus;
  /** Weeks remaining until deadline */
  weeksRemaining: number;
  /** Progress as percentage (0-100) */
  percentComplete: number;
  /** Whether user is on pace to meet goal */
  onPace: boolean;
}

/**
 * Simplified milestone for UI display.
 */
export interface SimpleMilestone {
  /** Week number (1-indexed) */
  week: number;
  /** Capacity-adjusted target for this week */
  adjustedTarget: number;
}

/**
 * Return type for useGoalData hook.
 */
export interface UseGoalDataResult {
  // Data accessors
  /** Capacity-aware retroplan for the goal */
  retroplan: Accessor<Retroplan | undefined>;
  /** All earnings events attributed by date */
  earnings: Accessor<EarningEvent[]>;
  /** Simplified milestones for UI rendering */
  milestones: Accessor<SimpleMilestone[]>;

  // Computed stats (unified)
  /** Aggregated goal statistics */
  stats: Accessor<GoalStats>;

  // Loading states
  /** True while data is being fetched */
  loading: Accessor<boolean>;
  /** Error if data fetch failed */
  error: Accessor<Error | undefined>;

  // Actions
  /** Trigger refetch of all goal data */
  refetch: () => void;
}

// === HOOK IMPLEMENTATION ===

/**
 * Centralized hook for goal data orchestration.
 *
 * Provides unified access to:
 * - Earnings events (missions, savings, trades)
 * - Capacity-aware milestones
 * - Computed progress stats
 *
 * @param goal - Accessor to the goal being tracked
 * @param profile - Accessor to the user's profile
 * @param options - Optional configuration
 * @returns UseGoalDataResult with accessors for all goal data
 *
 * @example
 * ```tsx
 * const GoalsTab = (props: { goal: Accessor<Goal | undefined>; profile: Accessor<FullProfile | undefined> }) => {
 *   const { earnings, stats, loading } = useGoalData(props.goal, props.profile);
 *
 *   return (
 *     <Show when={!loading()}>
 *       <div>Total earned: {stats().totalEarned}</div>
 *       <EarningsChart events={earnings()} />
 *     </Show>
 *   );
 * };
 * ```
 */
export function useGoalData(
  goal: Accessor<Goal | undefined>,
  profile: Accessor<FullProfile | undefined>,
  options: UseGoalDataOptions = {}
): UseGoalDataResult {
  // Loading and error state
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | undefined>(undefined);

  // Mark options as used (for future implementation)
  void options.includeSimulation;

  // TODO [Phase 21]: Implement actual data fetching
  // - Fetch retroplan from /api/retroplan
  // - Transform followup_data missions to EarningEvents
  // - Calculate savings from income margin
  // - Collect trade earnings

  // Stub retroplan data
  const retroplan = createMemo<Retroplan | undefined>(() => {
    const g = goal();
    if (!g) return undefined;

    // TODO [Phase 21]: Fetch real retroplan from API
    return undefined;
  });

  // Stub earnings data
  const earnings = createMemo<EarningEvent[]>(() => {
    const _g = goal();
    const _p = profile();
    if (!_g || !_p) return [];

    // TODO [Phase 21]: Aggregate earnings from:
    // - followup_data.missions (completed)
    // - Monthly savings calculations
    // - Trade sales and borrow savings
    return [];
  });

  // Stub milestones data
  const milestones = createMemo<SimpleMilestone[]>(() => {
    const plan = retroplan();
    if (!plan) return [];

    // TODO [Phase 21]: Extract from retroplan.milestones
    return plan.milestones.map((m) => ({
      week: m.weekNumber,
      adjustedTarget: m.adjustedTarget,
    }));
  });

  // Stub computed stats
  const stats = createMemo<GoalStats>(() => {
    const g = goal();
    const _p = profile();
    const earningsList = earnings();

    // Calculate total from earnings
    const totalEarned = earningsList.reduce((sum, e) => sum + e.amount, 0);

    // Calculate target (stub - uses goal amount / estimated weeks)
    const goalAmount = g?.amount ?? 0;
    const weeksRemaining = 8; // TODO [Phase 21]: Calculate from deadline

    // Linear calculation (to be replaced with capacity-aware in Phase 22)
    const linearWeeklyNeed = weeksRemaining > 0 ? goalAmount / weeksRemaining : 0;

    // Progress calculation
    const percentComplete = goalAmount > 0 ? Math.min(100, (totalEarned / goalAmount) * 100) : 0;

    // TODO [Phase 21]: Use capacity-aware weekly target from retroplan
    const weeklyTarget = linearWeeklyNeed;

    // TODO [Phase 22]: Implement proper status thresholds
    // For now, simple comparison
    const remaining = goalAmount - totalEarned;
    const expectedRemaining = linearWeeklyNeed * weeksRemaining;
    const onPace = remaining <= expectedRemaining;

    // Determine status (stub implementation)
    let status: GoalStatus = 'on-track';
    if (percentComplete >= 100) {
      status = 'ahead';
    } else if (!onPace) {
      const behindPercentage = ((remaining - expectedRemaining) / goalAmount) * 100;
      if (behindPercentage > 20) {
        status = 'critical';
      } else if (behindPercentage > 10) {
        status = 'behind';
      }
    }

    return {
      totalEarned,
      weeklyTarget,
      linearWeeklyNeed,
      status,
      weeksRemaining,
      percentComplete,
      onPace,
    };
  });

  // Refetch action (stub - will trigger data reload in Phase 21)
  const refetch = () => {
    // TODO [Phase 21]: Implement actual refetch
    // - Clear cached data
    // - Refetch retroplan
    // - Refetch earnings
    setLoading(true);
    // Simulate async operation
    setTimeout(() => setLoading(false), 0);
  };

  // Suppress unused setter warning (used in refetch)
  void setError;

  return {
    retroplan,
    earnings,
    milestones,
    stats,
    loading,
    error,
    refetch,
  };
}

export default useGoalData;
