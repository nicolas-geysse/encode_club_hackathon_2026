/**
 * Budget API Route
 *
 * GET /api/budget
 * Returns consolidated budget data from all financial sources.
 *
 * Sources:
 * - income_items: Base income
 * - lifestyle_items: Expenses with pause tracking
 * - trades: Sales and borrow savings
 * - profiles: Goal information for projections
 *
 * All calculations are traced with Opik for observability.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query } from './_db';
import {
  trace,
  createAuditInfo,
  type TraceContext,
  type TraceOptions,
  type AuditInfo,
} from '../../lib/opik';
import type { ConsolidatedBudget } from '../../lib/budgetService';

// Types for database rows
interface ProfileRow {
  id: string;
  goal_amount: number | null;
  goal_deadline: string | null;
}

interface IncomeItemRow {
  name: string;
  amount: number;
}

interface LifestyleItemRow {
  name: string;
  category: string;
  current_cost: number;
  paused_months: number;
}

interface TradeRow {
  type: string;
  name: string;
  value: number;
  status: string;
}

interface BreakdownItem {
  source?: string;
  category?: string;
  type?: 'sell' | 'borrow';
  name?: string;
  amount?: number;
  value?: number;
  paused?: boolean;
  pausedMonths?: number;
  status?: 'pending' | 'active' | 'completed';
}

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const profileIdParam = url.searchParams.get('profileId');
  const includeBreakdown = url.searchParams.get('breakdown') === 'true';

  const traceOptions: TraceOptions = {
    source: 'api',
    tags: ['budget', 'calculation'],
    input: { profileId: profileIdParam, includeBreakdown },
  };

  try {
    const result = await trace(
      'budget.calculation',
      async (ctx: TraceContext) => {
        // Step 1: Get profile (or active profile)
        const profile = await ctx.createChildSpan(
          'budget.get_profile',
          async (span) => {
            let profileQuery =
              'SELECT id, goal_amount, goal_deadline FROM profiles WHERE is_active = TRUE LIMIT 1';
            if (profileIdParam) {
              profileQuery = `SELECT id, goal_amount, goal_deadline FROM profiles WHERE id = '${profileIdParam}'`;
            }

            const profiles = await query<ProfileRow>(profileQuery);
            span.setAttributes({
              'profile.found': profiles.length > 0,
              'profile.id': profiles[0]?.id || 'none',
            });

            if (profiles.length === 0) {
              span.setOutput({ error: 'No profile found' });
              return null;
            }

            span.setOutput({ profileId: profiles[0].id });
            return profiles[0];
          },
          { type: 'tool' }
        );

        if (!profile) {
          return {
            error: true,
            message: 'No profile found',
            budget: createEmptyBudget(),
          };
        }

        const profileId = profile.id;
        ctx.setAttributes({ 'user.profile_id': profileId });

        // Step 2: Query income items
        const incomeData = await ctx.createChildSpan(
          'budget.income_aggregation',
          async (span) => {
            try {
              const items = await query<IncomeItemRow>(
                `SELECT name, amount FROM income_items WHERE profile_id = '${profileId}' ORDER BY name`
              );
              const total = items.reduce((sum, i) => sum + i.amount, 0);

              span.setAttributes({
                'income.items_count': items.length,
                'income.total': total,
              });
              span.setOutput({ total, count: items.length });

              return { items, total };
            } catch {
              span.setAttributes({ 'income.fallback': true });
              return { items: [], total: 0 };
            }
          },
          { type: 'tool' }
        );

        // Step 3: Query lifestyle items (with pause tracking)
        const expenseData = await ctx.createChildSpan(
          'budget.expense_aggregation',
          async (span) => {
            try {
              const items = await query<LifestyleItemRow>(
                `SELECT name, category, current_cost, COALESCE(paused_months, 0) as paused_months
                 FROM lifestyle_items
                 WHERE profile_id = '${profileId}'
                 ORDER BY category, name`
              );

              const rawExpenses = items.reduce((sum, i) => sum + i.current_cost, 0);
              const activeItems = items.filter((i) => i.paused_months === 0);
              const pausedItems = items.filter((i) => i.paused_months > 0);

              const activeExpenses = activeItems.reduce((sum, i) => sum + i.current_cost, 0);
              const pausedSavings = pausedItems.reduce(
                (sum, i) => sum + i.current_cost * i.paused_months,
                0
              );

              span.setAttributes({
                'expense.items_count': items.length,
                'expense.raw_total': rawExpenses,
                'expense.active_total': activeExpenses,
                'expense.paused_count': pausedItems.length,
                'expense.paused_savings': pausedSavings,
              });
              span.setOutput({
                rawExpenses,
                activeExpenses,
                pausedSavings,
                pausedCount: pausedItems.length,
              });

              return {
                items,
                rawExpenses,
                activeExpenses,
                pausedSavings,
                pausedItemsCount: pausedItems.length,
              };
            } catch {
              span.setAttributes({ 'expense.fallback': true });
              return {
                items: [],
                rawExpenses: 0,
                activeExpenses: 0,
                pausedSavings: 0,
                pausedItemsCount: 0,
              };
            }
          },
          { type: 'tool' }
        );

        // Step 4: Query trades
        const tradeData = await ctx.createChildSpan(
          'budget.trades_aggregation',
          async (span) => {
            try {
              const items = await query<TradeRow>(
                `SELECT type, name, value, status
                 FROM trades
                 WHERE profile_id = '${profileId}'
                 ORDER BY created_at DESC`
              );

              // Completed sales (realized income)
              const salesCompleted = items
                .filter((t) => t.type === 'sell' && t.status === 'completed')
                .reduce((sum, t) => sum + t.value, 0);

              // Potential sales (pending)
              const salesPotential = items
                .filter((t) => t.type === 'sell' && t.status === 'pending')
                .reduce((sum, t) => sum + t.value, 0);

              // Borrow savings (active + completed)
              const borrowSavings = items
                .filter(
                  (t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed')
                )
                .reduce((sum, t) => sum + t.value, 0);

              // Potential borrow (pending)
              const borrowPotential = items
                .filter((t) => t.type === 'borrow' && t.status === 'pending')
                .reduce((sum, t) => sum + t.value, 0);

              span.setAttributes({
                'trades.count': items.length,
                'trades.sales_completed': salesCompleted,
                'trades.sales_potential': salesPotential,
                'trades.borrow_savings': borrowSavings,
                'trades.borrow_potential': borrowPotential,
              });
              span.setOutput({
                salesCompleted,
                salesPotential,
                borrowSavings,
                borrowPotential,
              });

              return {
                items,
                salesCompleted,
                salesPotential,
                borrowSavings,
                borrowPotential,
              };
            } catch {
              span.setAttributes({ 'trades.fallback': true });
              return {
                items: [],
                salesCompleted: 0,
                salesPotential: 0,
                borrowSavings: 0,
                borrowPotential: 0,
              };
            }
          },
          { type: 'tool' }
        );

        // Step 5: Calculate consolidated values with CORRECT SEMANTICS
        // Monthly recurring vs one-time gains are now properly separated
        const budget = await ctx.createChildSpan(
          'budget.consolidation',
          async (span) => {
            // ============================================
            // NEW: MONTHLY RECURRING (continuous cash flows)
            // ============================================
            const monthlyIncome = incomeData.total; // CORRECT: No trades here
            const monthlyExpenses = expenseData.activeExpenses;
            const monthlyMargin = monthlyIncome - monthlyExpenses;

            // ============================================
            // NEW: ONE-TIME GAINS (discrete events - realized)
            // ============================================
            const oneTimeGains = {
              tradeSales: tradeData.salesCompleted,
              tradeBorrow: tradeData.borrowSavings,
              pausedSavings: expenseData.pausedSavings,
              total: tradeData.salesCompleted + tradeData.borrowSavings + expenseData.pausedSavings,
            };

            // ============================================
            // NEW: ONE-TIME POTENTIAL (not yet realized)
            // ============================================
            const oneTimePotential = {
              tradeSalesPending: tradeData.salesPotential,
              tradeBorrowPending: tradeData.borrowPotential,
              total: tradeData.salesPotential + tradeData.borrowPotential,
            };

            // ============================================
            // NEW: GOAL PROJECTION (combines correctly)
            // ============================================
            const goalAmount = profile.goal_amount || 0;
            let monthsUntilDeadline = 0;
            if (profile.goal_deadline) {
              const deadlineDate = new Date(profile.goal_deadline);
              const now = new Date();
              const diffMs = deadlineDate.getTime() - now.getTime();
              monthsUntilDeadline = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30)));
            }

            // CORRECT projection: (monthly margin × months) + one-time gains
            const fromMonthlyMargin = monthlyMargin * monthsUntilDeadline;
            const fromOneTimeGains = oneTimeGains.total;
            const totalProjected = fromMonthlyMargin + fromOneTimeGains;
            const progressPercent =
              goalAmount > 0 ? Math.min(100, Math.max(0, (totalProjected / goalAmount) * 100)) : 0;

            const goalProjection = {
              goalAmount,
              monthsRemaining: monthsUntilDeadline,
              fromMonthlyMargin,
              fromOneTimeGains,
              totalProjected,
              potentialExtra: oneTimePotential.total,
              progressPercent,
            };

            // ============================================
            // LEGACY FIELDS (for backward compatibility)
            // These maintain the old (incorrect) behavior for existing code
            // ============================================
            const rawMargin = incomeData.total - expenseData.rawExpenses;
            const totalIncomeLegacy = incomeData.total + tradeData.salesCompleted; // DEPRECATED
            const totalSavingsLegacy = expenseData.pausedSavings + tradeData.borrowSavings;
            const netMarginLegacy = totalIncomeLegacy - expenseData.activeExpenses; // DEPRECATED
            const adjustedMarginLegacy = netMarginLegacy + totalSavingsLegacy; // DEPRECATED
            const totalTradePotentialLegacy = tradeData.salesPotential + tradeData.borrowPotential;
            const projectedSavingsLegacy = netMarginLegacy * monthsUntilDeadline;
            const projectedWithPotentialLegacy = projectedSavingsLegacy + totalTradePotentialLegacy;
            const goalProgressLegacy =
              goalAmount > 0 ? (projectedSavingsLegacy / goalAmount) * 100 : 0;
            const goalProgressWithPotentialLegacy =
              goalAmount > 0 ? (projectedWithPotentialLegacy / goalAmount) * 100 : 0;

            const consolidated: ConsolidatedBudget = {
              // NEW STRUCTURE (correct semantics)
              monthly: {
                income: monthlyIncome,
                expenses: monthlyExpenses,
                margin: monthlyMargin,
              },
              oneTimeGains,
              oneTimePotential,
              goalProjection,

              // Metadata
              lastUpdated: new Date().toISOString(),

              // LEGACY FIELDS (backward compatibility)
              rawIncome: incomeData.total,
              rawExpenses: expenseData.rawExpenses,
              rawMargin,
              pausedSavings: expenseData.pausedSavings,
              pausedItemsCount: expenseData.pausedItemsCount,
              activeExpenses: expenseData.activeExpenses,
              tradeSalesCompleted: tradeData.salesCompleted,
              tradeBorrowSavings: tradeData.borrowSavings,
              tradeSalesPotential: tradeData.salesPotential,
              tradeBorrowPotential: tradeData.borrowPotential,
              totalTradePotential: totalTradePotentialLegacy,
              totalIncome: totalIncomeLegacy,
              totalSavings: totalSavingsLegacy,
              netMargin: netMarginLegacy,
              adjustedMargin: adjustedMarginLegacy,
              monthsUntilDeadline,
              goalAmount,
              projectedSavings: projectedSavingsLegacy,
              projectedWithPotential: projectedWithPotentialLegacy,
              goalProgress: Math.min(100, Math.max(0, goalProgressLegacy)),
              goalProgressWithPotential: Math.min(
                100,
                Math.max(0, goalProgressWithPotentialLegacy)
              ),
            };

            // Enhanced Opik attributes with new structure
            span.setAttributes({
              // New metrics (correct)
              'budget.monthly.income': monthlyIncome,
              'budget.monthly.expenses': monthlyExpenses,
              'budget.monthly.margin': monthlyMargin,
              'budget.onetime.gains_total': oneTimeGains.total,
              'budget.onetime.potential_total': oneTimePotential.total,
              'budget.projection.total': totalProjected,
              'budget.projection.progress_percent': progressPercent,
              // Legacy (for comparison during transition)
              'budget.legacy.total_income': totalIncomeLegacy,
              'budget.legacy.adjusted_margin': adjustedMarginLegacy,
            });
            span.setOutput({
              monthly: { income: monthlyIncome, expenses: monthlyExpenses, margin: monthlyMargin },
              oneTimeGainsTotal: oneTimeGains.total,
              projectedTotal: totalProjected,
              progressPercent: Math.round(progressPercent),
            });

            return consolidated;
          },
          { type: 'tool' }
        );

        // Build response with audit info for traceability
        const response: {
          budget: ConsolidatedBudget;
          breakdown?: {
            income: BreakdownItem[];
            expenses: BreakdownItem[];
            trades: BreakdownItem[];
          };
        } & AuditInfo = { budget, ...createAuditInfo(ctx) };

        if (includeBreakdown) {
          response.breakdown = {
            income: incomeData.items.map((i) => ({
              source: i.name,
              amount: i.amount,
            })),
            expenses: expenseData.items.map((i) => ({
              category: i.category,
              name: i.name,
              amount: i.current_cost,
              paused: i.paused_months > 0,
              pausedMonths: i.paused_months,
            })),
            trades: tradeData.items.map((t) => ({
              type: t.type as 'sell' | 'borrow',
              name: t.name,
              value: t.value,
              status: t.status as 'pending' | 'active' | 'completed',
            })),
          };
        }

        ctx.setOutput({
          netMargin: budget.netMargin,
          adjustedMargin: budget.adjustedMargin,
          goalProgress: budget.goalProgress,
        });

        return response;
      },
      traceOptions
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Budget] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Budget calculation failed',
        budget: createEmptyBudget(),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Create an empty budget structure
 */
function createEmptyBudget(): ConsolidatedBudget {
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
