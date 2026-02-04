/**
 * Analytics API Route
 *
 * GET /api/analytics
 * Returns aggregated analytics data for the dashboard.
 *
 * Expense breakdown now reads from lifestyle_items table (single source of truth)
 * instead of profile.expenses JSON column.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query } from './_db';
import { createLogger } from '~/lib/logger';

const logger = createLogger('Analytics');

// Types
interface ProfileRow {
  id: string;
  name: string;
  income_sources: string | null;
  expenses: string | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  monthly_margin: number | null;
  goal_name: string | null;
  goal_amount: number | null;
  goal_deadline: string | null;
  plan_data: string | null;
  followup_data: string | null;
}

interface LifestyleItemRow {
  id: string;
  profile_id: string;
  name: string;
  category: string;
  current_cost: number;
  paused_months: number;
}

interface IncomeItemRow {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
}

interface IncomeSource {
  source: string;
  amount: number;
}

interface Expense {
  category: string;
  amount: number;
}

interface EnergyEntry {
  week: number;
  level: number;
  date: string;
}

interface Mission {
  id: string;
  title: string;
  category: string;
  weeklyHours: number;
  weeklyEarnings: number;
  status: string;
  progress: number;
  hoursCompleted: number;
  earningsCollected: number;
}

interface TradeRow {
  type: string;
  value: number;
  status: string;
}

interface AnalyticsResponse {
  summary: {
    // MONTHLY RECURRING (correct semantics)
    totalIncome: number; // Monthly income only (no trades)
    totalExpenses: number; // Active monthly expenses
    netMargin: number; // Monthly margin (income - expenses)
    goalProgress: number;
    totalEarnings: number;
    totalHoursWorked: number;
    goalName?: string;
    goalAmount?: number;
    daysRemaining?: number;
    // ONE-TIME GAINS (discrete events)
    tradeSalesCompleted?: number;
    tradeBorrowSavings?: number;
    pausedSavings?: number;
    oneTimeGainsTotal?: number; // NEW: Total one-time gains
    // Legacy (deprecated)
    adjustedMargin?: number;
  };
  incomeBreakdown: { source: string; amount: number; percentage: number }[];
  expenseBreakdown: { category: string; amount: number; percentage: number }[];
  // One-time gains breakdown (trades + paused items)
  savingsBreakdown?: { source: string; amount: number; type: 'trade' | 'paused' }[];
  // NEW: Goal projection with correct calculation
  goalProjection?: {
    goalAmount: number;
    monthsRemaining: number;
    fromMonthlyMargin: number; // margin × months
    fromOneTimeGains: number; // one-time gains already acquired
    totalProjected: number; // sum of above
    potentialExtra: number; // pending trades/borrows
    progressPercent: number;
  };
  earningsTimeline: { week: number; date: string; amount: number; cumulative: number }[];
  energyTrend: { week: number; level: number; status: 'low' | 'medium' | 'high' }[];
  goalMetrics?: {
    name: string;
    target: number;
    current: number;
    daysRemaining: number;
    onTrack: boolean;
    projectedCompletion: string | null;
  };
  missionStats: {
    total: number;
    active: number;
    completed: number;
    skipped: number;
    byCategory: { category: string; count: number; earnings: number }[];
  };
}

function getEnergyStatus(level: number): 'low' | 'medium' | 'high' {
  if (level < 40) return 'low';
  if (level < 70) return 'medium';
  return 'high';
}

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');

    // Get active or specified profile
    let profileQuery = 'SELECT * FROM profiles WHERE is_active = TRUE LIMIT 1';
    if (profileId) {
      profileQuery = `SELECT * FROM profiles WHERE id = '${profileId}'`;
    }

    const profiles = await query<ProfileRow>(profileQuery);

    if (profiles.length === 0) {
      // Return empty analytics
      return new Response(
        JSON.stringify({
          summary: {
            totalIncome: 0,
            totalExpenses: 0,
            netMargin: 0,
            goalProgress: 0,
            totalEarnings: 0,
            totalHoursWorked: 0,
          },
          incomeBreakdown: [],
          expenseBreakdown: [],
          earningsTimeline: [],
          energyTrend: [],
          missionStats: {
            total: 0,
            active: 0,
            completed: 0,
            skipped: 0,
            byCategory: [],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const profile = profiles[0];

    // Parse JSON data
    const followupData = profile.followup_data ? JSON.parse(profile.followup_data) : null;
    const planData = profile.plan_data ? JSON.parse(profile.plan_data) : null;

    // Query income_items for income breakdown (single source of truth)
    let incomeItems: IncomeItemRow[] = [];
    try {
      incomeItems = await query<IncomeItemRow>(
        `SELECT id, profile_id, name, amount
         FROM income_items
         WHERE profile_id = '${profile.id}'
         ORDER BY name`
      );
    } catch {
      // Table might not exist yet, fall back to profile.income_sources
      const fallbackIncome: IncomeSource[] = profile.income_sources
        ? JSON.parse(profile.income_sources)
        : [];
      incomeItems = fallbackIncome.map((i, idx) => ({
        id: `fallback_${idx}`,
        profile_id: profile.id,
        name: i.source,
        amount: i.amount,
      }));
    }

    // Query lifestyle_items for expense breakdown (single source of truth)
    let lifestyleItems: LifestyleItemRow[] = [];
    try {
      lifestyleItems = await query<LifestyleItemRow>(
        `SELECT id, profile_id, name, category, current_cost, COALESCE(paused_months, 0) as paused_months
         FROM lifestyle_items
         WHERE profile_id = '${profile.id}'
         ORDER BY category, name`
      );
    } catch {
      // Table might not exist yet, fall back to profile.expenses
      const fallbackExpenses: Expense[] = profile.expenses ? JSON.parse(profile.expenses) : [];
      lifestyleItems = fallbackExpenses.map((e, i) => ({
        id: `fallback_${i}`,
        profile_id: profile.id,
        name: e.category,
        category: e.category === 'rent' ? 'housing' : e.category,
        current_cost: e.amount,
        paused_months: 0,
      }));
    }

    // Separate active and paused items for accurate expense calculation
    const activeItems = lifestyleItems.filter((item) => item.paused_months === 0);
    const pausedItems = lifestyleItems.filter((item) => item.paused_months > 0);

    // Aggregate by category for expense breakdown (active items only)
    const categoryTotals = activeItems.reduce(
      (acc, item) => {
        const cat = item.category === 'rent' ? 'housing' : item.category;
        if (!acc[cat]) {
          acc[cat] = 0;
        }
        acc[cat] += item.current_cost;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate paused savings (monthly cost * paused months)
    const pausedSavings = pausedItems.reduce(
      (sum, item) => sum + item.current_cost * item.paused_months,
      0
    );

    // Query trades table for completed sales and borrow savings
    let tradeSalesCompleted = 0;
    let tradeBorrowSavings = 0;
    try {
      const tradeItems = await query<TradeRow>(
        `SELECT type, value, status FROM trades WHERE profile_id = '${profile.id}'`
      );

      // Completed sales = realized income
      tradeSalesCompleted = tradeItems
        .filter((t) => t.type === 'sell' && t.status === 'completed')
        .reduce((sum, t) => sum + t.value, 0);

      // Borrow savings (active + completed)
      tradeBorrowSavings = tradeItems
        .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
        .reduce((sum, t) => sum + t.value, 0);
    } catch {
      // trades table might not exist yet
    }

    // Calculate totals from income_items (CORRECT: no trades in monthly income)
    const incomeFromItems = incomeItems.reduce((sum, i) => sum + i.amount, 0);
    // FIX: totalIncome is ONLY recurring income, NOT including one-time trade sales
    const totalIncome = incomeFromItems; // CORRECT: No tradeSalesCompleted here
    const totalExpenses = Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0);
    const netMargin = totalIncome - totalExpenses; // CORRECT: Monthly margin
    // oneTimeGainsTotal for display
    const oneTimeGainsTotal = tradeSalesCompleted + tradeBorrowSavings + pausedSavings;
    // Legacy adjusted margin kept for backward compatibility but deprecated
    const adjustedMargin = netMargin + pausedSavings + tradeBorrowSavings;

    // Income breakdown with percentages (from income_items)
    const incomeBreakdown = incomeItems.map((i) => ({
      source: i.name,
      amount: i.amount,
      percentage: totalIncome > 0 ? Math.round((i.amount / totalIncome) * 100) : 0,
    }));

    // Expense breakdown with percentages (from lifestyle_items, aggregated by category)
    const expenseBreakdown = Object.entries(categoryTotals).map(([category, amount]) => ({
      category,
      amount,
      percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
    }));

    // Energy trend from followup data
    const energyHistory: EnergyEntry[] = followupData?.energyHistory || [];
    const energyTrend = energyHistory.map((e) => ({
      week: e.week,
      level: e.level,
      status: getEnergyStatus(e.level),
    }));

    // Mission stats from followup data
    const missions: Mission[] = followupData?.missions || [];
    const missionStats = {
      total: missions.length,
      active: missions.filter((m) => m.status === 'active').length,
      completed: missions.filter((m) => m.status === 'completed').length,
      skipped: missions.filter((m) => m.status === 'skipped').length,
      byCategory: Object.entries(
        missions.reduce(
          (acc, m) => {
            if (!acc[m.category]) {
              acc[m.category] = { count: 0, earnings: 0 };
            }
            acc[m.category].count++;
            acc[m.category].earnings += m.earningsCollected || 0;
            return acc;
          },
          {} as Record<string, { count: number; earnings: number }>
        )
      ).map(([category, data]) => ({
        category,
        count: data.count,
        earnings: data.earnings,
      })),
    };

    // Calculate earnings timeline from missions
    const totalEarnings = missions.reduce((sum, m) => sum + (m.earningsCollected || 0), 0);
    const totalHoursWorked = missions.reduce((sum, m) => sum + (m.hoursCompleted || 0), 0);

    // Build weekly earnings timeline
    const earningsTimeline: { week: number; date: string; amount: number; cumulative: number }[] =
      [];
    let cumulative = 0;
    energyHistory.forEach((entry) => {
      const weekEarnings = missions
        .filter((m) => m.status === 'completed')
        .reduce(
          (sum, m) => sum + (m.earningsCollected || 0) / Math.max(1, energyHistory.length),
          0
        );
      cumulative += weekEarnings;
      earningsTimeline.push({
        week: entry.week,
        date: entry.date,
        amount: Math.round(weekEarnings),
        cumulative: Math.round(cumulative),
      });
    });

    // If no energy history, use followup current amount
    if (earningsTimeline.length === 0 && followupData?.currentAmount) {
      earningsTimeline.push({
        week: 1,
        date: new Date().toISOString(),
        amount: followupData.currentAmount,
        cumulative: followupData.currentAmount,
      });
    }

    // Goal metrics
    let goalMetrics = undefined;
    const goalName = profile.goal_name || planData?.setup?.goalName;
    const goalAmount = profile.goal_amount || planData?.setup?.goalAmount;
    const goalDeadline = profile.goal_deadline || planData?.setup?.goalDeadline;

    if (goalName && goalAmount) {
      const currentAmount = followupData?.currentAmount || totalEarnings;
      const daysRemaining = goalDeadline
        ? Math.max(
            0,
            Math.ceil((new Date(goalDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          )
        : 0;

      const dailyNeeded = daysRemaining > 0 ? (goalAmount - currentAmount) / daysRemaining : 0;
      const avgDailyEarnings =
        totalEarnings > 0 && energyHistory.length > 0
          ? totalEarnings / (energyHistory.length * 7)
          : 0;
      const onTrack = avgDailyEarnings >= dailyNeeded;

      let projectedCompletion: string | null = null;
      if (avgDailyEarnings > 0) {
        const daysToGoal = Math.ceil((goalAmount - currentAmount) / avgDailyEarnings);
        const projectedDate = new Date();
        projectedDate.setDate(projectedDate.getDate() + daysToGoal);
        projectedCompletion = projectedDate.toISOString().split('T')[0];
      }

      goalMetrics = {
        name: goalName,
        target: goalAmount,
        current: currentAmount,
        daysRemaining,
        onTrack,
        projectedCompletion,
      };
    }

    // Goal progress
    const goalProgress =
      goalAmount && goalAmount > 0
        ? Math.round(((followupData?.currentAmount || totalEarnings) / goalAmount) * 100)
        : 0;

    // Build savings breakdown for the new consolidated view
    const savingsBreakdown: { source: string; amount: number; type: 'trade' | 'paused' }[] = [];

    if (tradeSalesCompleted > 0) {
      savingsBreakdown.push({ source: 'Trade Sales', amount: tradeSalesCompleted, type: 'trade' });
    }
    if (tradeBorrowSavings > 0) {
      savingsBreakdown.push({
        source: 'Borrow Savings',
        amount: tradeBorrowSavings,
        type: 'trade',
      });
    }
    if (pausedSavings > 0) {
      savingsBreakdown.push({
        source: `Paused Items (${pausedItems.length})`,
        amount: pausedSavings,
        type: 'paused',
      });
    }

    // Calculate goal projection (correct semantics)
    const monthsRemaining = goalMetrics?.daysRemaining
      ? Math.ceil(goalMetrics.daysRemaining / 30)
      : 0;
    const fromMonthlyMargin = netMargin * monthsRemaining;
    const fromOneTimeGains = oneTimeGainsTotal;
    const totalProjected = fromMonthlyMargin + fromOneTimeGains;
    const progressPercent =
      goalAmount && goalAmount > 0
        ? Math.min(100, Math.max(0, (totalProjected / goalAmount) * 100))
        : 0;

    const response: AnalyticsResponse = {
      summary: {
        // MONTHLY RECURRING (correct)
        totalIncome, // Only recurring income
        totalExpenses,
        netMargin, // Correct monthly margin
        goalProgress: Math.min(100, goalProgress),
        totalEarnings,
        totalHoursWorked,
        goalName,
        goalAmount,
        daysRemaining: goalMetrics?.daysRemaining,
        // ONE-TIME GAINS
        tradeSalesCompleted,
        tradeBorrowSavings,
        pausedSavings,
        oneTimeGainsTotal, // NEW: Total one-time gains
        // Legacy (deprecated)
        adjustedMargin,
      },
      incomeBreakdown,
      expenseBreakdown,
      savingsBreakdown: savingsBreakdown.length > 0 ? savingsBreakdown : undefined,
      // NEW: Goal projection with correct calculation
      goalProjection:
        goalAmount && goalAmount > 0
          ? {
              goalAmount,
              monthsRemaining,
              fromMonthlyMargin,
              fromOneTimeGains,
              totalProjected,
              potentialExtra: 0, // TODO: Add pending trades calculation
              progressPercent,
            }
          : undefined,
      earningsTimeline,
      energyTrend,
      goalMetrics,
      missionStats,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Analytics failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
