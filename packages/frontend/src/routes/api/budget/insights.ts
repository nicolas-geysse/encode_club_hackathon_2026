/**
 * Budget Insights API
 *
 * GET /api/budget/insights?profileId=xxx
 *
 * Analyzes spending by category, compares to student benchmarks,
 * and returns optimization suggestions. Traced with Opik.
 */

import type { APIEvent } from '@solidjs/start/server';
import { initDatabase, query } from '../_db';
import { createLogger } from '~/lib/logger';
import { trace, logFeedbackScores } from '~/lib/opik';

const logger = createLogger('BudgetInsights');

// Student benchmark thresholds (% of total income)
const STUDENT_BENCHMARKS: Record<string, { max: number; label: string }> = {
  housing: { max: 35, label: 'Housing' },
  food: { max: 20, label: 'Food' },
  transport: { max: 10, label: 'Transport' },
  subscriptions: { max: 10, label: 'Subscriptions' },
  other: { max: 25, label: 'Other' },
};

interface CategoryInsight {
  category: string;
  label: string;
  amount: number;
  percentage: number;
  benchmark: number;
  status: 'under' | 'on_track' | 'over';
  delta: number;
  items: Array<{ name: string; cost: number; essential: boolean; paused: boolean }>;
  suggestion?: string;
}

export interface BudgetInsightsResponse {
  totalIncome: number;
  totalExpenses: number;
  margin: number;
  marginPercentage: number;
  categories: CategoryInsight[];
  topOptimization?: { category: string; potentialSaving: number; suggestion: string };
  healthScore: number;
  currency: string;
}

function computeInsights(
  income: Array<{ name: string; amount: number }>,
  lifestyle: Array<{
    name: string;
    category: string;
    currentCost: number;
    essential: boolean;
    pausedMonths: number;
    optimizedCost?: number;
  }>,
  currency: string
): BudgetInsightsResponse {
  const totalIncome = income.reduce((s, i) => s + i.amount, 0);
  const activeExpenses = lifestyle.filter((l) => l.pausedMonths === 0);
  const totalExpenses = activeExpenses.reduce((s, l) => s + l.currentCost, 0);
  const margin = totalIncome - totalExpenses;
  const marginPercentage = totalIncome > 0 ? Math.round((margin / totalIncome) * 100) : 0;

  // Group by category
  const byCategory: Record<string, typeof activeExpenses> = {};
  for (const item of activeExpenses) {
    const cat = item.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  // Build insights per category
  const categories: CategoryInsight[] = [];
  let biggestOverspend: { category: string; delta: number; saving: number } | null = null;

  for (const [cat, benchmark] of Object.entries(STUDENT_BENCHMARKS)) {
    const items = byCategory[cat] || [];
    const amount = items.reduce((s, i) => s + i.currentCost, 0);
    const percentage = totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0;
    const delta = percentage - benchmark.max;

    let status: CategoryInsight['status'] = 'on_track';
    if (delta > 5) status = 'over';
    else if (delta < -5) status = 'under';

    // Potential saving from optimized costs
    const potentialSaving = items.reduce((s, i) => {
      if (i.optimizedCost != null && i.optimizedCost < i.currentCost) {
        return s + (i.currentCost - i.optimizedCost);
      }
      return s;
    }, 0);

    let suggestion: string | undefined;
    if (status === 'over') {
      const nonEssential = items.filter((i) => !i.essential);
      if (nonEssential.length > 0) {
        const topNE = nonEssential.sort((a, b) => b.currentCost - a.currentCost)[0];
        suggestion = `Consider reducing ${topNE.name} (${currency}${topNE.currentCost}/mo)`;
      } else {
        suggestion = `${benchmark.label} is ${delta}% over benchmark — look for cheaper alternatives`;
      }
    }

    categories.push({
      category: cat,
      label: benchmark.label,
      amount,
      percentage,
      benchmark: benchmark.max,
      status,
      delta,
      items: items.map((i) => ({
        name: i.name,
        cost: i.currentCost,
        essential: i.essential,
        paused: i.pausedMonths > 0,
      })),
      suggestion,
    });

    if (status === 'over' && (!biggestOverspend || delta > biggestOverspend.delta)) {
      biggestOverspend = {
        category: benchmark.label,
        delta,
        saving: potentialSaving || Math.round(amount * 0.15),
      };
    }
  }

  // Sort: over first, then by amount descending
  categories.sort((a, b) => {
    const statusOrder = { over: 0, on_track: 1, under: 2 };
    const diff = statusOrder[a.status] - statusOrder[b.status];
    if (diff !== 0) return diff;
    return b.amount - a.amount;
  });

  // Health score: 0-100
  const overCount = categories.filter((c) => c.status === 'over').length;
  const marginScore = Math.min(40, Math.max(0, marginPercentage * 2));
  const categoryScore = Math.max(0, 60 - overCount * 20);
  const healthScore = Math.min(100, marginScore + categoryScore);

  return {
    totalIncome,
    totalExpenses,
    margin,
    marginPercentage,
    categories,
    topOptimization: biggestOverspend
      ? {
          category: biggestOverspend.category,
          potentialSaving: biggestOverspend.saving,
          suggestion: `Your ${biggestOverspend.category.toLowerCase()} spending is ${biggestOverspend.delta}% over the student benchmark. You could save ~${currency}${biggestOverspend.saving}/mo.`,
        }
      : undefined,
    healthScore,
    currency,
  };
}

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const profileId = url.searchParams.get('profileId');

  if (!profileId) {
    return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return trace(
    'budget.insights',
    async (ctx) => {
      try {
        await initDatabase();

        // Query income and lifestyle
        const [incomeRows, lifestyleRows, profileRows] = await Promise.all([
          query(`SELECT name, amount FROM income_items WHERE profile_id = '${profileId}'`),
          query(
            `SELECT name, category, current_cost, essential, paused_months, optimized_cost FROM lifestyle_items WHERE profile_id = '${profileId}'`
          ),
          query(`SELECT currency FROM profiles WHERE id = '${profileId}' LIMIT 1`),
        ]);

        const currency =
          (profileRows as Array<{ currency: string }>)[0]?.currency === 'USD' ? '$' : '€';

        const income = (incomeRows as Array<{ name: string; amount: number }>).map((r) => ({
          name: r.name,
          amount: Number(r.amount),
        }));

        const lifestyle = (
          lifestyleRows as Array<{
            name: string;
            category: string;
            current_cost: number;
            essential: boolean | number;
            paused_months: number;
            optimized_cost: number | null;
          }>
        ).map((r) => ({
          name: r.name,
          category: r.category || 'other',
          currentCost: Number(r.current_cost),
          essential: !!r.essential,
          pausedMonths: Number(r.paused_months) || 0,
          optimizedCost: r.optimized_cost != null ? Number(r.optimized_cost) : undefined,
        }));

        const insights = computeInsights(income, lifestyle, currency);

        ctx.setAttributes({
          'budget.total_income': insights.totalIncome,
          'budget.total_expenses': insights.totalExpenses,
          'budget.margin': insights.margin,
          'budget.health_score': insights.healthScore,
          'budget.categories_over': insights.categories.filter((c) => c.status === 'over').length,
          'budget.categories_count': insights.categories.length,
        });

        // Log health score as feedback
        const traceId = ctx.getTraceId();
        if (traceId) {
          logFeedbackScores(traceId, [
            {
              name: 'budget_health_score',
              value: insights.healthScore / 100,
              reason: `Margin: ${insights.marginPercentage}%, Over: ${insights.categories.filter((c) => c.status === 'over').length} categories`,
            },
          ]).catch(() => {});
        }

        return new Response(JSON.stringify(insights), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        logger.error('Budget insights error', { error });
        return new Response(
          JSON.stringify({
            error: true,
            message: error instanceof Error ? error.message : 'Failed to compute insights',
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
    {
      source: 'budget_insights',
      tags: ['budget', 'insights', 'financial_health'],
      metadata: { profile_id: profileId },
    }
  );
}

// Also export the compute function for frontend use
export { computeInsights };
