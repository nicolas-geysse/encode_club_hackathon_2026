/**
 * Consolidated Budget Service
 *
 * Single source of truth for all financial metrics across the app.
 * Aggregates data from:
 * - income_items table (base income)
 * - lifestyle_items table (expenses with pause tracking)
 * - trades table (completed sales, borrow savings, potential values)
 *
 * IMPORTANT: This service now correctly separates:
 * - MONTHLY RECURRING: income, expenses, margin (continuous cash flow)
 * - ONE-TIME GAINS: trade sales, borrow savings, paused items (discrete events)
 *
 * Used by: ProfileTab, BudgetTab, AnalyticsDashboard, Chat context
 */

import { createLogger } from './logger';

const logger = createLogger('BudgetService');

/**
 * Consolidated budget data structure
 * Provides complete financial picture for a profile with clear separation
 * between monthly recurring and one-time gains.
 */
export interface ConsolidatedBudget {
  // MONTHLY RECURRING (continuous cash flows)
  monthly: {
    income: number; // Sum of income_items (recurring)
    expenses: number; // Active lifestyle_items (paused_months = 0)
    margin: number; // income - expenses
  };

  // ONE-TIME GAINS (discrete events - already realized)
  oneTimeGains: {
    tradeSales: number; // Completed sales (status: 'completed')
    tradeBorrow: number; // Borrow savings (active + completed)
    pausedSavings: number; // cost × paused_months for paused items
    total: number; // Sum of all realized one-time gains
  };

  // ONE-TIME POTENTIAL (not yet realized)
  oneTimePotential: {
    tradeSalesPending: number; // Pending sales
    tradeBorrowPending: number; // Pending borrows
    total: number; // Sum of potential
  };

  // GOAL PROJECTION (combines monthly + one-time correctly)
  goalProjection: {
    goalAmount: number;
    monthsRemaining: number;
    fromMonthlyMargin: number; // monthly.margin × monthsRemaining
    fromOneTimeGains: number; // oneTimeGains.total (already acquired)
    totalProjected: number; // fromMonthlyMargin + fromOneTimeGains
    potentialExtra: number; // oneTimePotential.total
    progressPercent: number; // (totalProjected / goalAmount) × 100
  };

  // Metadata
  lastUpdated: string;

  // ============================================
  // LEGACY FIELDS (for backward compatibility)
  // These will be deprecated in a future version
  // ============================================
  /** @deprecated Use monthly.income instead */
  rawIncome: number;
  /** @deprecated Use monthly.expenses instead (with active items only) */
  rawExpenses: number;
  /** @deprecated Use monthly.margin instead */
  rawMargin: number;
  /** @deprecated Use oneTimeGains.pausedSavings instead */
  pausedSavings: number;
  /** @deprecated */
  pausedItemsCount: number;
  /** @deprecated Use monthly.expenses instead */
  activeExpenses: number;
  /** @deprecated Use oneTimeGains.tradeSales instead */
  tradeSalesCompleted: number;
  /** @deprecated Use oneTimeGains.tradeBorrow instead */
  tradeBorrowSavings: number;
  /** @deprecated Use oneTimePotential.tradeSalesPending instead */
  tradeSalesPotential: number;
  /** @deprecated Use oneTimePotential.tradeBorrowPending instead */
  tradeBorrowPotential: number;
  /** @deprecated Use oneTimePotential.total instead */
  totalTradePotential: number;
  /** @deprecated Incorrect calculation - DO NOT USE. Use monthly.income instead. */
  totalIncome: number;
  /** @deprecated Use oneTimeGains.total instead */
  totalSavings: number;
  /** @deprecated Use monthly.margin instead */
  netMargin: number;
  /** @deprecated Confusing metric - use goalProjection instead */
  adjustedMargin: number;
  /** @deprecated Use goalProjection.monthsRemaining instead */
  monthsUntilDeadline: number;
  /** @deprecated Use goalProjection.goalAmount instead */
  goalAmount: number;
  /** @deprecated Use goalProjection.fromMonthlyMargin instead */
  projectedSavings: number;
  /** @deprecated Use goalProjection.totalProjected + potentialExtra instead */
  projectedWithPotential: number;
  /** @deprecated Use goalProjection.progressPercent instead */
  goalProgress: number;
  /** @deprecated */
  goalProgressWithPotential: number;
}

/**
 * Raw data from API for budget calculation
 */
export interface BudgetApiResponse {
  budget: ConsolidatedBudget;
  breakdown: {
    income: { source: string; amount: number }[];
    expenses: { category: string; amount: number; paused: boolean; pausedMonths?: number }[];
    trades: {
      type: 'sell' | 'borrow';
      name: string;
      value: number;
      status: 'pending' | 'active' | 'completed';
    }[];
  };
}

/**
 * Fetch consolidated budget from the API
 * This is the main entry point for getting budget data
 */
export async function getConsolidatedBudget(
  profileId?: string
): Promise<ConsolidatedBudget | null> {
  try {
    const url = profileId ? `/api/budget?profileId=${profileId}` : '/api/budget';

    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Budget API returned error', { status: response.status });
      return null;
    }

    const data: BudgetApiResponse = await response.json();
    return data.budget;
  } catch (error) {
    logger.error('Failed to fetch consolidated budget', { error });
    return null;
  }
}

/**
 * Fetch budget with full breakdown details
 */
export async function getBudgetWithBreakdown(
  profileId?: string
): Promise<BudgetApiResponse | null> {
  try {
    const url = profileId
      ? `/api/budget?profileId=${profileId}&breakdown=true`
      : '/api/budget?breakdown=true';

    const response = await fetch(url);
    if (!response.ok) {
      logger.warn('Budget API returned error', { status: response.status });
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch budget with breakdown', { error });
    return null;
  }
}

/**
 * Legacy compatibility adapter
 * Converts ConsolidatedBudget to the format expected by older components.
 * NOTE: Now uses correct monthly values (not inflated by one-time trades)
 */
export function toBudgetLegacy(budget: ConsolidatedBudget): {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyMargin: number;
} {
  return {
    monthlyIncome: budget.monthly.income, // Correct: only recurring income
    monthlyExpenses: budget.monthly.expenses,
    monthlyMargin: budget.monthly.margin, // Correct: not inflated by trades
  };
}

/**
 * Create an empty budget structure (for new profiles or loading states)
 */
export function createEmptyBudget(): ConsolidatedBudget {
  return {
    // New structure (correct semantics)
    monthly: {
      income: 0,
      expenses: 0,
      margin: 0,
    },
    oneTimeGains: {
      tradeSales: 0,
      tradeBorrow: 0,
      pausedSavings: 0,
      total: 0,
    },
    oneTimePotential: {
      tradeSalesPending: 0,
      tradeBorrowPending: 0,
      total: 0,
    },
    goalProjection: {
      goalAmount: 0,
      monthsRemaining: 0,
      fromMonthlyMargin: 0,
      fromOneTimeGains: 0,
      totalProjected: 0,
      potentialExtra: 0,
      progressPercent: 0,
    },
    lastUpdated: new Date().toISOString(),

    // Legacy fields (backward compatibility)
    rawIncome: 0,
    rawExpenses: 0,
    rawMargin: 0,
    pausedSavings: 0,
    pausedItemsCount: 0,
    activeExpenses: 0,
    tradeSalesCompleted: 0,
    tradeBorrowSavings: 0,
    tradeSalesPotential: 0,
    tradeBorrowPotential: 0,
    totalTradePotential: 0,
    totalIncome: 0,
    totalSavings: 0,
    netMargin: 0,
    adjustedMargin: 0,
    monthsUntilDeadline: 0,
    goalAmount: 0,
    projectedSavings: 0,
    projectedWithPotential: 0,
    goalProgress: 0,
    goalProgressWithPotential: 0,
  };
}

/**
 * Format budget for chat context
 * Returns a concise summary suitable for LLM prompts with clear separation
 * between monthly recurring and one-time gains.
 */
export function formatBudgetForChat(budget: ConsolidatedBudget): string {
  const lines: string[] = ['Financial Summary:'];

  // MONTHLY RECURRING
  lines.push('');
  lines.push('MONTHLY INCOME (recurring):');
  lines.push(`- Income: ${budget.monthly.income}€/month`);
  lines.push(`- Expenses: ${budget.monthly.expenses}€/month`);
  lines.push(`- Net margin: ${budget.monthly.margin}€/month`);

  // ONE-TIME GAINS (realized)
  if (budget.oneTimeGains.total > 0) {
    lines.push('');
    lines.push('ONE-TIME GAINS (realized):');
    if (budget.oneTimeGains.tradeSales > 0) {
      lines.push(`- Completed sales: +${budget.oneTimeGains.tradeSales}€`);
    }
    if (budget.oneTimeGains.tradeBorrow > 0) {
      lines.push(`- Borrowing savings: +${budget.oneTimeGains.tradeBorrow}€`);
    }
    if (budget.oneTimeGains.pausedSavings > 0) {
      lines.push(`- Paused items: +${budget.oneTimeGains.pausedSavings}€`);
    }
    lines.push(`- Total one-time gains: +${budget.oneTimeGains.total}€`);
  }

  // ONE-TIME POTENTIAL
  if (budget.oneTimePotential.total > 0) {
    lines.push('');
    lines.push('POTENTIAL GAINS (unrealized):');
    if (budget.oneTimePotential.tradeSalesPending > 0) {
      lines.push(`- Pending sales: +${budget.oneTimePotential.tradeSalesPending}€`);
    }
    if (budget.oneTimePotential.tradeBorrowPending > 0) {
      lines.push(`- Potential borrowing: +${budget.oneTimePotential.tradeBorrowPending}€`);
    }
  }

  // GOAL PROJECTION
  if (budget.goalProjection.goalAmount > 0) {
    lines.push('');
    lines.push('GOAL PROJECTION:');
    lines.push(`- Goal: ${budget.goalProjection.goalAmount}€`);
    lines.push(`- Months remaining: ${budget.goalProjection.monthsRemaining}`);
    lines.push(`- From monthly margin: ${budget.goalProjection.fromMonthlyMargin}€`);
    lines.push(`- From one-time gains: ${budget.goalProjection.fromOneTimeGains}€`);
    lines.push(`- PROJECTED TOTAL: ${budget.goalProjection.totalProjected}€`);
    if (budget.goalProjection.potentialExtra > 0) {
      lines.push(`- Additional potential: +${budget.goalProjection.potentialExtra}€`);
    }
    lines.push(`- Progress: ${budget.goalProjection.progressPercent.toFixed(1)}%`);
  }

  return lines.join('\n');
}

/**
 * Calculate budget health score (0-100)
 * Uses the new structure with clear separation of monthly vs one-time.
 */
export function calculateBudgetHealth(budget: ConsolidatedBudget): {
  score: number;
  status: 'critical' | 'warning' | 'good' | 'excellent';
  message: string;
} {
  // Factors:
  // - Monthly margin positivity (40 points)
  // - Goal progress on track (30 points)
  // - One-time gains realized (20 points)
  // - Buffer (10 points)

  let score = 0;
  const messages: string[] = [];

  // Monthly margin (core health indicator)
  if (budget.monthly.margin >= 0) {
    score += 40;
    if (budget.monthly.margin >= budget.monthly.expenses * 0.2) {
      score += 10; // Bonus for 20%+ margin
      messages.push('Healthy margin');
    }
  } else {
    const marginRatio =
      budget.monthly.expenses > 0 ? budget.monthly.margin / budget.monthly.expenses : 0;
    score += Math.max(0, 20 + marginRatio * 20);
    messages.push('Negative margin');
  }

  // Goal progress (using new projection structure)
  const { goalAmount, monthsRemaining, totalProjected } = budget.goalProjection;
  if (goalAmount > 0 && monthsRemaining > 0) {
    const withPotential = totalProjected + budget.oneTimePotential.total;

    if (totalProjected >= goalAmount) {
      score += 30;
      messages.push('Goal achievable');
    } else if (withPotential >= goalAmount) {
      score += 20;
      messages.push('Goal possible with trades');
    } else {
      const ratio = totalProjected / goalAmount;
      score += Math.floor(ratio * 30);
      messages.push('Goal at risk');
    }
  } else {
    score += 15; // No goal set - neutral
  }

  // One-time gains realized (bonus for proactive saving)
  if (budget.oneTimeGains.total > 0) {
    const gainsScore = Math.min(20, Math.floor(budget.oneTimeGains.total / 50));
    score += gainsScore;
    if (gainsScore >= 10) {
      messages.push('Good one-time gains');
    }
  }

  // Buffer/emergency fund (if margin covers 1+ month expenses)
  if (budget.monthly.margin >= budget.monthly.expenses) {
    score += 10;
  } else if (budget.monthly.margin >= budget.monthly.expenses * 0.5) {
    score += 5;
  }

  // Determine status
  let status: 'critical' | 'warning' | 'good' | 'excellent';
  if (score >= 80) {
    status = 'excellent';
  } else if (score >= 60) {
    status = 'good';
  } else if (score >= 40) {
    status = 'warning';
  } else {
    status = 'critical';
  }

  return {
    score: Math.min(100, score),
    status,
    message: messages.length > 0 ? messages.join('. ') : 'Budget calculated',
  };
}

export const budgetService = {
  getConsolidatedBudget,
  getBudgetWithBreakdown,
  toBudgetLegacy,
  createEmptyBudget,
  formatBudgetForChat,
  calculateBudgetHealth,
};

export default budgetService;
