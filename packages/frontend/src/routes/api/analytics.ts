/**
 * Analytics API Route
 *
 * GET /api/analytics
 * Returns aggregated analytics data for the dashboard.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query } from './_db';

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

interface AnalyticsResponse {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netMargin: number;
    goalProgress: number;
    totalEarnings: number;
    totalHoursWorked: number;
    goalName?: string;
    goalAmount?: number;
    daysRemaining?: number;
  };
  incomeBreakdown: { source: string; amount: number; percentage: number }[];
  expenseBreakdown: { category: string; amount: number; percentage: number }[];
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
    const incomeSources: IncomeSource[] = profile.income_sources
      ? JSON.parse(profile.income_sources)
      : [];
    const expenses: Expense[] = profile.expenses ? JSON.parse(profile.expenses) : [];
    const followupData = profile.followup_data ? JSON.parse(profile.followup_data) : null;
    const planData = profile.plan_data ? JSON.parse(profile.plan_data) : null;

    // Calculate totals
    const totalIncome =
      profile.monthly_income || incomeSources.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses =
      profile.monthly_expenses || expenses.reduce((sum, e) => sum + e.amount, 0);
    const netMargin = profile.monthly_margin || totalIncome - totalExpenses;

    // Income breakdown with percentages
    const incomeBreakdown = incomeSources.map((i) => ({
      source: i.source,
      amount: i.amount,
      percentage: totalIncome > 0 ? Math.round((i.amount / totalIncome) * 100) : 0,
    }));

    // Expense breakdown with percentages
    const expenseBreakdown = expenses.map((e) => ({
      category: e.category,
      amount: e.amount,
      percentage: totalExpenses > 0 ? Math.round((e.amount / totalExpenses) * 100) : 0,
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

    const response: AnalyticsResponse = {
      summary: {
        totalIncome,
        totalExpenses,
        netMargin,
        goalProgress: Math.min(100, goalProgress),
        totalEarnings,
        totalHoursWorked,
        goalName,
        goalAmount,
        daysRemaining: goalMetrics?.daysRemaining,
      },
      incomeBreakdown,
      expenseBreakdown,
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
    console.error('[Analytics] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Analytics failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
