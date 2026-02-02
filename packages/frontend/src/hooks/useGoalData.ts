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
import type { IncomeItem, LifestyleItem } from '../lib/profileContext';
import { aggregateAllEarnings, type MissionData, type TradeData } from '../lib/earningsAggregator';
import { calculateGoalStatus, calculateOnPace } from '../lib/goalStatus';
import {
  calculateSavingsWeeks,
  applySavingsAdjustments,
  getEffectiveSavingsAmount,
  type SavingsAdjustment,
} from '../lib/savingsHelper';

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
   * Simulated date for testing purposes (static value).
   * If provided, uses this date instead of current date for calculations.
   * @deprecated Use simulatedDateAccessor for reactive updates
   */
  simulatedDate?: Date;

  /**
   * Reactive accessor for simulated date.
   * When the accessor returns a new date, the hook will re-fetch data.
   * Preferred over simulatedDate for dynamic simulation controls.
   */
  simulatedDateAccessor?: Accessor<Date | undefined>;
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
  /** Cumulative target up to current week (for status calculation) */
  cumulativeTarget: number;
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
  /** Earnings events that have occurred (date <= currentDate) */
  earnings: Accessor<EarningEvent[]>;
  /** All earnings including future scheduled (for chart projection) */
  projectedEarnings: Accessor<EarningEvent[]>;
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
 * @param incomeAccessor - Optional reactive accessor for income items (for live margin calculation)
 * @param lifestyleAccessor - Optional reactive accessor for lifestyle items (for live margin calculation)
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
  options: UseGoalDataOptions = {},
  // Optional accessors for reactive margin calculation (sync with Budget tab)
  incomeAccessor?: Accessor<IncomeItem[]>,
  lifestyleAccessor?: Accessor<LifestyleItem[]>
): UseGoalDataResult {
  // Error state for manual errors
  const [manualError, setManualError] = createSignal<Error | undefined>(undefined);

  // Reactive simulated date - supports both accessor and static value
  // The accessor pattern enables reactive updates when simulation controls change
  const getSimulatedDate = (): Date | undefined => {
    // Prefer accessor (reactive) over static value
    if (options.simulatedDateAccessor) {
      return options.simulatedDateAccessor();
    }
    return options.simulatedDate;
  };

  // Determine current date (support simulation)
  const getCurrentDate = () => getSimulatedDate() || new Date();

  // === RETROPLAN RESOURCE ===
  // Fetches retroplan from POST /api/retroplan
  const [retroplanResource, { refetch: refetchRetroplan }] = createResource(
    // Source: reacts to goal and profile changes
    () => {
      const g = goal();
      const p = profile();
      // Access simulated date inside source function for reactivity
      const simDate = getSimulatedDate();
      if (!g?.id || !g?.amount || !g?.deadline || !p?.id) return null;

      // Calculate monthlyMargin reactively from income/lifestyle accessors if provided
      // This ensures Goals tab updates when Budget tab changes income/expenses
      // Pattern from /suivi page (contextIncome/contextLifestyle)
      const computedMargin = (() => {
        if (incomeAccessor && lifestyleAccessor) {
          const incomeItems = incomeAccessor();
          const lifestyleItems = lifestyleAccessor();
          const incomeTotal = incomeItems.reduce((sum, i) => sum + i.amount, 0);
          const expensesTotal = lifestyleItems
            .filter((i) => i.pausedMonths === 0) // Only active expenses
            .reduce((sum, i) => sum + i.currentCost, 0);
          const margin = incomeTotal - expensesTotal;
          // If no data, fallback to profile value
          if (incomeTotal === 0 && expensesTotal === 0) {
            return p.monthlyMargin || 0;
          }
          return margin;
        }
        return p.monthlyMargin || 0; // Fallback for backward compatibility
      })();

      // Calculate totalEarned for feasibility calculation
      // This is computed here so retroplan can factor in actual progress
      const goalStartDate = g.createdAt ? new Date(g.createdAt) : new Date();
      const goalDeadline = g.deadline ? new Date(g.deadline) : new Date();
      const missions = extractMissions(p.followupData);
      const monthlyMargin = computedMargin;
      const incomeDay = p.incomeDay || 15;
      const currentDate = simDate || new Date();

      // Calculate ACTUAL total savings (accounting for adjustments)
      // This ensures weekly targets update when user adjusts savings in WeeklyProgressCards
      const savingsAdjustments = (p.followupData?.savingsAdjustments || {}) as Record<
        number,
        SavingsAdjustment
      >;
      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        monthlyMargin > 0 ? monthlyMargin : 0 // Only positive margin generates savings
      );
      const adjustedSavingsWeeks = applySavingsAdjustments(baseSavingsWeeks, savingsAdjustments);
      const actualTotalSavings = adjustedSavingsWeeks.reduce(
        (sum, s) => sum + getEffectiveSavingsAmount(s),
        0
      );

      // Calculate earnings (simplified - trades handled separately)
      const earningsEvents = aggregateAllEarnings({
        missions,
        monthlyMargin,
        incomeDay,
        trades: [], // Trades loaded separately, minor impact on feasibility
        goalStartDate,
        goalDeadline,
        currentDate,
      });
      const totalEarned = earningsEvents.reduce((sum, e) => sum + e.amount, 0);

      return {
        goalId: g.id,
        goalAmount: g.amount,
        deadline: g.deadline,
        profileId: p.id,
        hourlyRate: p.minHourlyRate || 15,
        monthlyMargin: computedMargin, // Base margin for display
        actualTotalSavings, // ACTUAL savings after adjustments - use this for effectiveGoalForWork
        availableHoursPerWeek: p.maxWorkHoursWeekly, // User's configured available hours
        goalStartDate: g.createdAt,
        simulatedDate: simDate?.toISOString(),
        totalEarned, // Pass to API for feasibility calculation
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
          actualTotalSavings: params.actualTotalSavings, // ACTUAL savings after adjustments
          availableHoursPerWeek: params.availableHoursPerWeek,
          goalStartDate: params.goalStartDate,
          simulatedDate: params.simulatedDate,
          totalEarned: params.totalEarned, // For accurate feasibility
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

  // === COMPUTED MARGIN MEMO ===
  // Reactive margin calculation from income/lifestyle accessors
  // Ensures earnings calculations stay in sync with Budget tab changes
  const computedMargin = createMemo(() => {
    const p = profile();
    if (incomeAccessor && lifestyleAccessor) {
      const incomeItems = incomeAccessor();
      const lifestyleItems = lifestyleAccessor();
      const incomeTotal = incomeItems.reduce((sum, i) => sum + i.amount, 0);
      const expensesTotal = lifestyleItems
        .filter((i) => i.pausedMonths === 0) // Only active expenses
        .reduce((sum, i) => sum + i.currentCost, 0);
      const margin = incomeTotal - expensesTotal;
      // If no data, fallback to profile value
      if (incomeTotal === 0 && expensesTotal === 0) {
        return p?.monthlyMargin || 0;
      }
      return margin;
    }
    return p?.monthlyMargin || 0; // Fallback for backward compatibility
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

    // Use reactive computed margin (syncs with Budget tab)
    const monthlyMargin = computedMargin();

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
      // Pass current date (simulated or real) to filter future earnings
      // Only events with date <= currentDate are included
      currentDate: getCurrentDate(),
    });
  });

  // === PROJECTED EARNINGS MEMO ===
  // All earnings INCLUDING future scheduled ones (for chart projection)
  // This shows where earnings WILL come from based on scheduled savings
  const projectedEarnings = createMemo<EarningEvent[]>(() => {
    const g = goal();
    const p = profile();

    if (!g || !p) return [];

    const goalStartDate = g.createdAt ? new Date(g.createdAt) : new Date();
    const goalDeadline = g.deadline ? new Date(g.deadline) : new Date();
    const missions = extractMissions(p.followupData);
    // Use reactive computed margin (syncs with Budget tab)
    const monthlyMargin = computedMargin();
    const incomeDay = p.incomeDay || 15;
    const trades = tradesResource() || [];
    const tradeData = mapTradesToTradeData(trades);
    const savingsAdjustments = p.followupData?.savingsAdjustments as
      | Record<number, { amount: number; note?: string; adjustedAt: string }>
      | undefined;

    // Use far future date to include ALL scheduled earnings
    return aggregateAllEarnings({
      missions,
      monthlyMargin,
      incomeDay,
      trades: tradeData,
      goalStartDate,
      goalDeadline,
      savingsAdjustments,
      currentDate: goalDeadline, // Include all events up to deadline
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

    // Step 3a: Calculate cumulative target for current week
    // This const is computed once and used for both status calculation and return value
    const cumulativeTarget = (() => {
      if (plan && plan.milestones.length > 0) {
        const currentWeekNumber = plan.totalWeeks - weeksRemaining + 1;
        const currentMilestone = plan.milestones.find((m) => m.weekNumber === currentWeekNumber);
        if (currentMilestone) {
          return currentMilestone.cumulativeTarget;
        } else {
          // Fallback: use linear target for weeks beyond milestones
          return goalAmount * (currentWeekNumber / plan.totalWeeks);
        }
      } else {
        // No retroplan - use linear estimate
        const totalWeeks = plan?.totalWeeks || Math.max(1, weeksRemaining);
        const elapsedWeeks = totalWeeks - weeksRemaining;
        return linearWeeklyNeed * elapsedWeeks;
      }
    })();

    // Step 3b: Use unified status calculation with configurable thresholds
    const status = calculateGoalStatus(totalEarned, cumulativeTarget);
    const onPace = calculateOnPace(totalEarned, cumulativeTarget);

    return {
      totalEarned,
      weeklyTarget,
      linearWeeklyNeed,
      cumulativeTarget,
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
    projectedEarnings,
    milestones,
    stats,
    loading,
    error,
    refetch,
  };
}

export default useGoalData;
