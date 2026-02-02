/**
 * useGoalData Hook
 *
 * Centralized data orchestration hook for goal progress tracking.
 * Provides unified access to earnings, milestones, and computed stats
 * for GoalsTab, WeeklyProgressCards, and EarningsChart components.
 *
 * Part of v4.0 Goals Tab Fix - replaces scattered calculations
 * with single source of truth for all goal-related data.
 */

import { createSignal, createMemo, createResource, type Accessor } from 'solid-js';
import type { EarningEvent, GoalStatus } from '../types/earnings';
import type { Goal } from '../lib/goalService';
import type { FullProfile } from '../lib/profileService';
import { aggregateAllEarnings, type MissionData, type TradeData } from '../lib/earningsAggregator';

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

  /**
   * Simulated date for testing purposes.
   * If provided, uses this date instead of current date for calculations.
   */
  simulatedDate?: Date;
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
  /** Cumulative target up to this week (for chart pace line) */
  cumulativeTarget: number;
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

// === INTERNAL TYPES ===

interface RetroplanResponse {
  success: boolean;
  retroplan?: Retroplan;
  error?: boolean;
  message?: string;
}

interface Trade {
  id: string;
  profileId: string;
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  value: number;
  status: 'pending' | 'active' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// === HELPER FUNCTIONS ===

/**
 * Calculate weeks remaining from deadline
 */
function calculateWeeksRemaining(deadline: string | undefined, now: Date): number {
  if (!deadline) return 0;

  const deadlineDate = new Date(deadline);
  const diffMs = deadlineDate.getTime() - now.getTime();
  const diffWeeks = Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000));

  return Math.max(0, diffWeeks);
}

/**
 * Convert Trade[] to TradeData[] for aggregator
 */
function mapTradesToTradeData(trades: Trade[]): TradeData[] {
  return trades.map((t) => ({
    id: t.id,
    type: t.type === 'trade' ? 'sell' : t.type, // Map 'trade' to 'sell' for compatibility
    status: t.status,
    itemName: t.name,
    expectedPrice: t.type === 'sell' || t.type === 'trade' ? t.value : undefined,
    retailPrice: t.type === 'borrow' ? t.value : undefined,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  }));
}

/**
 * Extract MissionData[] from followupData
 */
function extractMissions(followupData: Record<string, unknown> | undefined): MissionData[] {
  if (!followupData) return [];

  const missions = followupData.missions as
    | Array<{
        id?: string;
        title?: string;
        status?: string;
        earningsCollected?: number;
        completedAt?: string;
        updatedAt?: string;
      }>
    | undefined;

  if (!Array.isArray(missions)) return [];

  return missions
    .filter((m) => m && typeof m === 'object')
    .map((m, index) => ({
      id: m.id || `mission-${index}`,
      title: m.title || 'Mission',
      status: (m.status as 'active' | 'completed' | 'skipped') || 'active',
      earningsCollected: m.earningsCollected || 0,
      completedAt: m.completedAt,
      updatedAt: m.updatedAt,
    }));
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
  // Error state for manual errors
  const [manualError, setManualError] = createSignal<Error | undefined>(undefined);

  // Determine current date (support simulation)
  const getCurrentDate = () => options.simulatedDate || new Date();

  // === RETROPLAN RESOURCE ===
  // Fetches retroplan from POST /api/retroplan
  const [retroplanResource, { refetch: refetchRetroplan }] = createResource(
    // Source: reacts to goal and profile changes
    () => {
      const g = goal();
      const p = profile();
      if (!g?.id || !g?.amount || !g?.deadline || !p?.id) return null;
      return {
        goalId: g.id,
        goalAmount: g.amount,
        deadline: g.deadline,
        profileId: p.id,
        hourlyRate: p.minHourlyRate || 15,
        monthlyMargin: p.monthlyMargin || 0,
        goalStartDate: g.createdAt,
        simulatedDate: options.simulatedDate?.toISOString(),
      };
    },
    // Fetcher
    async (params) => {
      if (!params) return undefined;

      const response = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_retroplan',
          userId: params.profileId,
          goalId: params.goalId,
          goalAmount: params.goalAmount,
          deadline: params.deadline,
          hourlyRate: params.hourlyRate,
          monthlyMargin: params.monthlyMargin,
          goalStartDate: params.goalStartDate,
          simulatedDate: params.simulatedDate,
        }),
      });

      if (!response.ok) {
        throw new Error(`Retroplan fetch failed: ${response.status}`);
      }

      const data: RetroplanResponse = await response.json();

      if (data.error) {
        throw new Error(data.message || 'Retroplan generation failed');
      }

      return data.retroplan;
    }
  );

  // === TRADES RESOURCE ===
  // Fetches trades from GET /api/trades?profileId=X
  const [tradesResource, { refetch: refetchTrades }] = createResource(
    () => {
      const p = profile();
      if (!p?.id) return null;
      return { profileId: p.id };
    },
    async (params) => {
      if (!params) return [];

      const response = await fetch(`/api/trades?profileId=${params.profileId}`);

      if (!response.ok) {
        // Trades are optional - don't fail the whole hook
        return [];
      }

      const trades: Trade[] = await response.json();
      return trades;
    }
  );

  // === RETROPLAN MEMO ===
  // Extract retroplan from resource
  const retroplan = createMemo<Retroplan | undefined>(() => {
    return retroplanResource();
  });

  // === EARNINGS MEMO ===
  // Aggregates earnings from missions, savings, and trades
  const earnings = createMemo<EarningEvent[]>(() => {
    const g = goal();
    const p = profile();

    if (!g || !p) return [];

    // Get goal start and deadline dates
    const goalStartDate = g.createdAt ? new Date(g.createdAt) : new Date();
    const goalDeadline = g.deadline ? new Date(g.deadline) : new Date();

    // Extract missions from followupData
    const missions = extractMissions(p.followupData);

    // Calculate monthly margin from profile
    const monthlyMargin = p.monthlyMargin || 0;

    // Get income day (default to 15)
    const incomeDay = p.incomeDay || 15;

    // Get trades from resource
    const trades = tradesResource() || [];
    const tradeData = mapTradesToTradeData(trades);

    // Extract savings adjustments if present
    const savingsAdjustments = p.followupData?.savingsAdjustments as
      | Record<number, { amount: number; note?: string; adjustedAt: string }>
      | undefined;

    return aggregateAllEarnings({
      missions,
      monthlyMargin,
      incomeDay,
      trades: tradeData,
      goalStartDate,
      goalDeadline,
      savingsAdjustments,
    });
  });

  // === MILESTONES MEMO ===
  // Simplified milestones for UI
  const milestones = createMemo<SimpleMilestone[]>(() => {
    const plan = retroplan();
    if (!plan) return [];

    return plan.milestones.map((m) => ({
      week: m.weekNumber,
      adjustedTarget: m.adjustedTarget,
      cumulativeTarget: m.cumulativeTarget,
    }));
  });

  // === STATS MEMO ===
  // Computed statistics from goal, earnings, and retroplan
  const stats = createMemo<GoalStats>(() => {
    const g = goal();
    const earningsList = earnings();
    const plan = retroplan();

    // Calculate total from earnings
    const totalEarned = earningsList.reduce((sum, e) => sum + e.amount, 0);

    // Get goal amount
    const goalAmount = g?.amount ?? 0;

    // Calculate weeks remaining
    const now = getCurrentDate();
    const weeksRemaining = calculateWeeksRemaining(g?.deadline, now);

    // Linear calculation (baseline comparison)
    const linearWeeklyNeed = weeksRemaining > 0 ? goalAmount / weeksRemaining : 0;

    // Get capacity-aware weekly target from retroplan if available
    // For now, use linear (Phase 22 will improve this)
    let weeklyTarget = linearWeeklyNeed;

    if (plan && plan.milestones.length > 0) {
      // Find current week's milestone
      const currentWeekNumber = plan.totalWeeks - weeksRemaining + 1;
      const currentMilestone = plan.milestones.find((m) => m.weekNumber === currentWeekNumber);
      if (currentMilestone) {
        weeklyTarget = currentMilestone.adjustedTarget;
      }
    }

    // Progress calculation
    const percentComplete = goalAmount > 0 ? Math.min(100, (totalEarned / goalAmount) * 100) : 0;

    // Calculate expected progress based on time elapsed
    const remaining = goalAmount - totalEarned;
    const expectedRemaining = linearWeeklyNeed * weeksRemaining;
    const onPace = remaining <= expectedRemaining || percentComplete >= 100;

    // Determine status based on progress and pace
    // TODO [Phase 22]: Use configurable thresholds
    let status: GoalStatus = 'on-track';
    if (percentComplete >= 100) {
      status = 'ahead';
    } else if (!onPace && goalAmount > 0) {
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

  // === LOADING STATE ===
  const loading = createMemo(() => {
    return retroplanResource.loading || tradesResource.loading;
  });

  // === ERROR STATE ===
  const error = createMemo<Error | undefined>(() => {
    // Check for manual errors first
    const manual = manualError();
    if (manual) return manual;

    // Check resource errors
    const retroplanErr = retroplanResource.error;
    if (retroplanErr)
      return retroplanErr instanceof Error ? retroplanErr : new Error(String(retroplanErr));

    // Trades errors are non-critical, don't propagate
    return undefined;
  });

  // === REFETCH ACTION ===
  const refetch = () => {
    setManualError(undefined);
    refetchRetroplan();
    refetchTrades();
  };

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
