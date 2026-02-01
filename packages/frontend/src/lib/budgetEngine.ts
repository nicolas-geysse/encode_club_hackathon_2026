/**
 * Budget Engine
 *
 * Pure projection logic for financial calculations.
 * Calculates current path and what-if scenarios.
 *
 * @reusable - Can be extracted for other financial planning projects
 */

import { getWeeksUntil, type TimeContext } from './timeAwareDate';

/**
 * Financial data for projection calculations
 */
export interface FinancialData {
  /** Monthly income */
  income: number;
  /** Monthly expenses */
  expenses: number;
  /** Amount already saved */
  currentSaved: number;
  /** Goal target amount */
  goalAmount: number;
  /** Goal deadline (ISO date string) */
  goalDeadline: string;
  /** One-time gains from trades and paused subscriptions (optional for backward compat) */
  oneTimeGains?: number;
}

/**
 * Modifications for what-if scenarios
 */
export interface ScenarioModifications {
  /** Additional monthly income (e.g., new job) */
  additionalIncome?: number;
  /** One-time gain (sell item, gift) */
  oneTimeGain?: number;
  /** Monthly savings from expense cuts */
  reducedExpenses?: number;
  /** Additional work hours per week */
  additionalHoursPerWeek?: number;
  /** Hourly rate for work */
  hourlyRate?: number;
}

/**
 * Path projection result
 */
export interface PathResult {
  /** Monthly margin (income - expenses + modifications) */
  monthlyMargin: number;
  /** Weeks to reach goal (null = never at current rate) */
  weeksToGoal: number | null;
  /** Projected total at deadline */
  projectedTotal: number;
  /** Whether goal will be reached by deadline */
  success: boolean;
  /** Percentage progress toward goal */
  progressPercent: number;
}

/**
 * Full projection result with optional scenario comparison
 */
export interface ProjectionResult {
  /** Current path without modifications */
  currentPath: PathResult;
  /** Path with modifications (if provided) */
  scenarioPath?: PathResult;
  /** Delta between scenario and current (if scenario provided) */
  delta?: {
    /** Weeks saved (positive = faster) */
    weeks: number;
    /** Extra amount at deadline */
    amount: number;
    /** Monthly margin difference */
    monthlyMarginDiff: number;
  };
  /** Time context used for calculations */
  timeInfo: {
    weeksRemaining: number;
    monthsRemaining: number;
    deadlinePassed: boolean;
  };
}

/**
 * Calculate financial projection
 *
 * @param data - Current financial data
 * @param timeContext - Time context for simulation support
 * @param modifications - Optional scenario modifications
 *
 * @example
 * // Current path only
 * const result = calculateProjection(financialData, timeContext);
 *
 * // With what-if scenario
 * const result = calculateProjection(financialData, timeContext, {
 *   additionalHoursPerWeek: 10,
 *   hourlyRate: 15
 * });
 */
export function calculateProjection(
  data: FinancialData,
  timeContext: TimeContext,
  modifications?: ScenarioModifications
): ProjectionResult {
  const weeksRemaining = getWeeksUntil(data.goalDeadline, timeContext);
  const monthsRemaining = Math.max(weeksRemaining / 4.33, 0.1); // Minimum 0.1 to avoid division by zero
  const deadlinePassed = weeksRemaining === 0;

  // Current path calculation
  const currentMargin = data.income - data.expenses;
  const oneTimeGains = data.oneTimeGains || 0;
  const currentProjected = data.currentSaved + oneTimeGains + currentMargin * monthsRemaining;
  const currentWeeksToGoal = calculateWeeksToGoal(
    data.goalAmount,
    data.currentSaved + oneTimeGains,
    currentMargin,
    0
  );
  const currentProgress =
    data.goalAmount > 0 ? ((data.currentSaved + oneTimeGains) / data.goalAmount) * 100 : 0;

  const result: ProjectionResult = {
    currentPath: {
      monthlyMargin: currentMargin,
      weeksToGoal: currentWeeksToGoal,
      projectedTotal: Math.max(0, currentProjected),
      success: currentProjected >= data.goalAmount,
      progressPercent: Math.min(100, currentProgress),
    },
    timeInfo: {
      weeksRemaining,
      monthsRemaining: Math.round(monthsRemaining * 10) / 10,
      deadlinePassed,
    },
  };

  // Scenario path (if modifications provided)
  if (modifications && hasModifications(modifications)) {
    let extraMonthly = modifications.additionalIncome || 0;
    extraMonthly += modifications.reducedExpenses || 0;

    // Calculate extra from additional work hours
    if (modifications.additionalHoursPerWeek && modifications.hourlyRate) {
      extraMonthly += modifications.additionalHoursPerWeek * modifications.hourlyRate * 4.33;
    }

    const oneTime = modifications.oneTimeGain || 0;
    const newMargin = currentMargin + extraMonthly;
    const newProjected = data.currentSaved + oneTime + newMargin * monthsRemaining;
    const newWeeksToGoal = calculateWeeksToGoal(
      data.goalAmount,
      data.currentSaved + oneTime,
      newMargin,
      0
    );
    const newProgress =
      data.goalAmount > 0 ? ((data.currentSaved + oneTime) / data.goalAmount) * 100 : 0;

    result.scenarioPath = {
      monthlyMargin: newMargin,
      weeksToGoal: newWeeksToGoal,
      projectedTotal: Math.max(0, newProjected),
      success: newProjected >= data.goalAmount,
      progressPercent: Math.min(100, newProgress),
    };

    result.delta = {
      weeks: (currentWeeksToGoal || Infinity) - (newWeeksToGoal || Infinity),
      amount: newProjected - currentProjected,
      monthlyMarginDiff: extraMonthly,
    };
  }

  return result;
}

/**
 * Calculate weeks needed to reach goal
 *
 * @returns Weeks to goal or null if never reachable
 */
function calculateWeeksToGoal(
  goalAmount: number,
  currentSaved: number,
  monthlyMargin: number,
  oneTimeGain: number
): number | null {
  const remaining = goalAmount - currentSaved - oneTimeGain;

  if (remaining <= 0) {
    return 0; // Already reached
  }

  if (monthlyMargin <= 0) {
    return null; // Never reachable
  }

  const monthsNeeded = remaining / monthlyMargin;
  return Math.ceil(monthsNeeded * 4.33);
}

/**
 * Check if modifications object has any actual values
 */
function hasModifications(mods: ScenarioModifications): boolean {
  return (
    (mods.additionalIncome !== undefined && mods.additionalIncome > 0) ||
    (mods.oneTimeGain !== undefined && mods.oneTimeGain > 0) ||
    (mods.reducedExpenses !== undefined && mods.reducedExpenses > 0) ||
    (mods.additionalHoursPerWeek !== undefined &&
      mods.additionalHoursPerWeek > 0 &&
      mods.hourlyRate !== undefined &&
      mods.hourlyRate > 0)
  );
}

/**
 * Build a human-readable summary of a projection
 */
export function buildProjectionSummary(
  projection: ProjectionResult,
  currencySymbol: string = '$'
): string {
  const { currentPath, scenarioPath, delta, timeInfo } = projection;
  const lines: string[] = [];

  // Time info
  if (timeInfo.deadlinePassed) {
    lines.push('**Deadline has passed.** Consider setting a new timeline.');
  } else {
    lines.push(
      `**${timeInfo.weeksRemaining} weeks** (${timeInfo.monthsRemaining} months) until deadline.`
    );
  }

  // Current path
  lines.push('');
  lines.push('**Current Path:**');
  lines.push(`- Monthly margin: ${currencySymbol}${currentPath.monthlyMargin.toFixed(0)}`);
  lines.push(`- Projected at deadline: ${currencySymbol}${currentPath.projectedTotal.toFixed(0)}`);
  lines.push(`- Goal reachable: ${currentPath.success ? 'Yes' : 'No'}`);

  // Scenario comparison
  if (scenarioPath && delta) {
    lines.push('');
    lines.push('**With Changes:**');
    lines.push(`- New monthly margin: ${currencySymbol}${scenarioPath.monthlyMargin.toFixed(0)}`);
    lines.push(
      `- Projected at deadline: ${currencySymbol}${scenarioPath.projectedTotal.toFixed(0)}`
    );
    lines.push(`- Goal reachable: ${scenarioPath.success ? 'Yes' : 'No'}`);

    lines.push('');
    lines.push('**Impact:**');
    if (delta.weeks > 0 && delta.weeks !== Infinity) {
      lines.push(`- Reach goal **${delta.weeks} weeks faster**`);
    }
    if (delta.amount > 0) {
      lines.push(`- Extra ${currencySymbol}${delta.amount.toFixed(0)} by deadline`);
    }
    if (delta.monthlyMarginDiff > 0) {
      lines.push(`- +${currencySymbol}${delta.monthlyMarginDiff.toFixed(0)}/month margin`);
    }
  }

  return lines.join('\n');
}

/**
 * Quick projection check - simplified for common use cases
 */
export function willReachGoal(
  data: FinancialData,
  timeContext: TimeContext,
  additionalMonthly: number = 0
): boolean {
  const result = calculateProjection(data, timeContext, { additionalIncome: additionalMonthly });
  return additionalMonthly > 0
    ? (result.scenarioPath?.success ?? false)
    : result.currentPath.success;
}
