/* eslint-disable no-console */
/**
 * Insights API Route
 *
 * Processes profile data to detect:
 * - Comeback Mode: Energy recovery after low periods
 * - Energy Debt: 3+ consecutive weeks below 40%
 * - Milestones: 25%, 50%, 75%, 100% of goal
 *
 * Automatically creates notifications for detected insights.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { execute, escapeSQL, query } from './_db';
import { trace } from '../../lib/opik';

// Energy entry type
interface EnergyEntry {
  week: number;
  energy: number;
  date?: string;
}

// Insight result type
interface InsightResult {
  type:
    | 'comeback_detected'
    | 'energy_debt'
    | 'milestone_25'
    | 'milestone_50'
    | 'milestone_75'
    | 'milestone_100';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

// Check for Comeback Mode
// Criteria: lowWeeks >= 2 && currentEnergy > 80 && previousWeekEnergy < 50
function detectComeback(energyHistory: EnergyEntry[]): InsightResult | null {
  if (energyHistory.length < 3) return null;

  // Sort by week descending (most recent first)
  const sorted = [...energyHistory].sort((a, b) => b.week - a.week);

  const current = sorted[0];
  const previous = sorted[1];

  // Check if current is high (>80) and previous was low (<50)
  if (current.energy > 80 && previous.energy < 50) {
    // Count consecutive low weeks before recovery
    let lowWeeks = 0;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].energy < 50) {
        lowWeeks++;
      } else {
        break;
      }
    }

    if (lowWeeks >= 2) {
      return {
        type: 'comeback_detected',
        title: 'Comeback Mode Activated!',
        message: `After ${lowWeeks} tough weeks, your energy is back at ${current.energy}%! Time to catch up on your savings goal.`,
        data: {
          lowWeeks,
          currentEnergy: current.energy,
          recoveryDate: current.date,
        },
      };
    }
  }

  return null;
}

// Check for Energy Debt
// Criteria: 3+ consecutive weeks with energy < 40%
function detectEnergyDebt(energyHistory: EnergyEntry[]): InsightResult | null {
  if (energyHistory.length < 3) return null;

  // Sort by week ascending
  const sorted = [...energyHistory].sort((a, b) => a.week - b.week);

  // Count consecutive weeks below 40%
  let consecutiveLow = 0;
  let maxConsecutive = 0;
  let streakStartWeek = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].energy < 40) {
      if (consecutiveLow === 0) {
        streakStartWeek = sorted[i].week;
      }
      consecutiveLow++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveLow);
    } else {
      consecutiveLow = 0;
    }
  }

  // Check if current streak is active (last entry is part of it)
  const lastEntry = sorted[sorted.length - 1];
  if (consecutiveLow >= 3 && lastEntry.energy < 40) {
    return {
      type: 'energy_debt',
      title: 'Energy Debt Warning',
      message: `You've been running low on energy for ${consecutiveLow} weeks. Consider reducing your targets temporarily and focusing on recovery.`,
      data: {
        consecutiveWeeks: consecutiveLow,
        currentEnergy: lastEntry.energy,
        streakStartWeek,
        reducedTarget: true,
      },
    };
  }

  return null;
}

// Check for Milestones
function detectMilestones(
  currentAmount: number,
  goalAmount: number,
  previousNotifications: string[],
  currencySymbol: string = '$'
): InsightResult | null {
  if (goalAmount <= 0) return null;

  const progress = (currentAmount / goalAmount) * 100;

  // Check each milestone in order (highest first to get the latest one)
  const milestones = [
    { threshold: 100, type: 'milestone_100' as const, emoji: '', title: 'Goal Achieved!' },
    { threshold: 75, type: 'milestone_75' as const, emoji: '', title: '75% There!' },
    { threshold: 50, type: 'milestone_50' as const, emoji: '', title: 'Halfway!' },
    { threshold: 25, type: 'milestone_25' as const, emoji: '', title: '25% Progress!' },
  ];

  for (const milestone of milestones) {
    if (progress >= milestone.threshold && !previousNotifications.includes(milestone.type)) {
      return {
        type: milestone.type,
        title: `${milestone.emoji} ${milestone.title}`,
        message:
          milestone.threshold === 100
            ? `Congratulations! You've reached your savings goal of ${currencySymbol}${goalAmount}!`
            : `You're ${milestone.threshold}% of the way to your goal! Current savings: ${currencySymbol}${currentAmount.toFixed(0)}`,
        data: {
          currentAmount,
          goalAmount,
          progress: Math.round(progress),
        },
      };
    }
  }

  return null;
}

// Helper to get currency symbol from currency code
function getCurrencySymbol(currency?: string): string {
  switch (currency) {
    case 'EUR':
      return '\u20AC';
    case 'GBP':
      return '\u00A3';
    default:
      return '$';
  }
}

// POST: Process insights and create notifications
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { profileId, energyHistory, currentAmount, goalAmount, simulatedDate, currency } = body;
    const currencySymbol = getCurrencySymbol(currency);

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Process insights with tracing
    const insights = await trace('insights.processing', async (span) => {
      span.setAttributes({
        'insights.profile_id': profileId,
        'insights.energy_history_length': energyHistory?.length ?? 0,
        'insights.current_amount': currentAmount ?? 0,
        'insights.goal_amount': goalAmount ?? 0,
      });

      const results: InsightResult[] = [];

      // Get existing notifications to avoid duplicates
      const existingNotifications = await query<{ type: string }>(
        `SELECT DISTINCT type FROM notifications WHERE profile_id = ${escapeSQL(profileId)} AND dismissed = false`
      );
      const existingTypes = existingNotifications.map((n) => n.type);

      // Check for Comeback Mode
      if (energyHistory && energyHistory.length > 0) {
        const comeback = detectComeback(energyHistory);
        if (comeback && !existingTypes.includes('comeback_detected')) {
          results.push(comeback);
        }

        // Check for Energy Debt (mutually exclusive with comeback)
        if (!comeback) {
          const energyDebt = detectEnergyDebt(energyHistory);
          if (energyDebt && !existingTypes.includes('energy_debt')) {
            results.push(energyDebt);
          }
        }
      }

      // Check for Milestones
      if (currentAmount !== undefined && goalAmount !== undefined && goalAmount > 0) {
        const milestone = detectMilestones(
          currentAmount,
          goalAmount,
          existingTypes,
          currencySymbol
        );
        if (milestone) {
          results.push(milestone);
        }
      }

      span.setAttributes({
        'insights.detected_count': results.length,
        'insights.types': results.map((r) => r.type).join(','),
      });

      return results;
    });

    // Create notifications for each detected insight
    const createdNotifications = [];

    for (const insight of insights) {
      const id = uuidv4();
      const dataJson = insight.data ? JSON.stringify(insight.data).replace(/'/g, "''") : null;

      await execute(`
        INSERT INTO notifications (id, profile_id, type, title, message, data)
        VALUES (
          ${escapeSQL(id)},
          ${escapeSQL(profileId)},
          ${escapeSQL(insight.type)},
          ${escapeSQL(insight.title)},
          ${escapeSQL(insight.message)},
          ${dataJson ? `'${dataJson}'` : 'NULL'}
        )
      `);

      createdNotifications.push({
        id,
        type: insight.type,
        title: insight.title,
        message: insight.message,
        data: insight.data,
      });
    }

    return new Response(
      JSON.stringify({
        insights,
        notificationsCreated: createdNotifications.length,
        notifications: createdNotifications,
        simulatedDate,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Insights] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Failed to process insights',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// GET: Get current insight status for a profile
export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get active insights
    const rows = await query<{ type: string; title: string; data: string | null }>(
      `SELECT type, title, data FROM notifications
       WHERE profile_id = ${escapeSQL(profileId)}
       AND dismissed = false
       AND type IN ('comeback_detected', 'energy_debt', 'milestone_25', 'milestone_50', 'milestone_75', 'milestone_100')
       ORDER BY created_at DESC`
    );

    const activeInsights = rows.map((row) => ({
      type: row.type,
      title: row.title,
      data: row.data ? JSON.parse(row.data) : null,
    }));

    // Determine current mode
    const hasComeback = activeInsights.some((i) => i.type === 'comeback_detected');
    const hasEnergyDebt = activeInsights.some((i) => i.type === 'energy_debt');
    const highestMilestone = activeInsights
      .filter((i) => i.type.startsWith('milestone_'))
      .sort((a, b) => {
        const numA = parseInt(a.type.split('_')[1]);
        const numB = parseInt(b.type.split('_')[1]);
        return numB - numA;
      })[0];

    return new Response(
      JSON.stringify({
        mode: hasComeback ? 'comeback' : hasEnergyDebt ? 'energy_debt' : 'normal',
        activeInsights,
        highestMilestone: highestMilestone?.type ?? null,
        comebackActive: hasComeback,
        energyDebtActive: hasEnergyDebt,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Insights] GET error:', error);
    return new Response(JSON.stringify({ error: true, message: 'Failed to get insight status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
