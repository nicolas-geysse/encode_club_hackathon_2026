/**
 * Debug State API Route
 *
 * Returns the current state of all algorithms for the debug panel.
 * - Energy state (Normal, Debt, Comeback)
 * - Comeback detection status
 * - Energy debt status
 * - User preference weights
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';

interface DebugState {
  // Energy state
  energyState: 'Normal' | 'Energy Debt' | 'Comeback Active';
  energyConfidence: number;
  currentEnergy: number;
  energyHistory: number[];

  // Comeback detection
  comebackActive: boolean;
  comebackDeficit: number;
  recoveryProgress: number;
  deficitWeeks: number;

  // Energy debt
  debtDetected: boolean;
  debtSeverity: 'mild' | 'moderate' | 'severe' | null;
  debtWeeks: number;

  // Preference weights
  prefs: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
}

export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await initDatabase();

    // Get profile data
    const profileResult = await query<Record<string, unknown>>(
      `SELECT * FROM profiles WHERE id = '${profileId.replace(/'/g, "''")}'`
    );

    const profile = profileResult[0];
    if (!profile) {
      return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get energy logs (last 8 weeks)
    let energyResult: Record<string, unknown>[] = [];
    try {
      energyResult = await query<Record<string, unknown>>(
        `SELECT energy_level, week_number FROM energy_logs
         WHERE profile_id = '${profileId.replace(/'/g, "''")}'
         ORDER BY week_number DESC
         LIMIT 8`
      );
    } catch {
      // energy_logs table might not exist yet
      energyResult = [];
    }

    const energyHistory = energyResult.map((r) => Number(r.energy_level || 50)).reverse();
    const currentEnergy = energyHistory[energyHistory.length - 1] || 50;

    // Analyze energy state
    const lowWeeks = energyHistory.filter((e) => e < 40).length;
    const consecutiveLowWeeks = countConsecutiveLow(energyHistory);
    const previousEnergy = energyHistory[energyHistory.length - 2] || 50;

    // Determine state
    let energyState: DebugState['energyState'] = 'Normal';
    let energyConfidence = 70;
    let comebackActive = false;
    let debtDetected = false;
    let debtSeverity: DebugState['debtSeverity'] = null;

    // Comeback detection: current > 80%, previous < 50%, had 2+ low weeks
    if (lowWeeks >= 2 && currentEnergy > 80 && previousEnergy < 50) {
      energyState = 'Comeback Active';
      comebackActive = true;
      energyConfidence = 85;
    }
    // Energy debt: 3+ consecutive weeks below 40%
    else if (consecutiveLowWeeks >= 3) {
      energyState = 'Energy Debt';
      debtDetected = true;
      debtSeverity =
        consecutiveLowWeeks >= 5 ? 'severe' : consecutiveLowWeeks >= 4 ? 'moderate' : 'mild';
      energyConfidence = 80;
    }

    // Get swipe preferences
    const swipePrefs = profile.swipe_preferences
      ? JSON.parse(profile.swipe_preferences as string)
      : {
          effort_sensitivity: 0.5,
          hourly_rate_priority: 0.5,
          time_flexibility: 0.5,
          income_stability: 0.5,
        };

    // Calculate comeback metrics
    const deficitWeeks = lowWeeks;
    const comebackDeficit = calculateDeficit(energyHistory, profile);
    const recoveryProgress = comebackActive ? Math.round((currentEnergy / 100) * 100) : 0;

    const debugState: DebugState = {
      energyState,
      energyConfidence,
      currentEnergy,
      energyHistory,

      comebackActive,
      comebackDeficit,
      recoveryProgress,
      deficitWeeks,

      debtDetected,
      debtSeverity,
      debtWeeks: consecutiveLowWeeks,

      prefs: {
        effortSensitivity: swipePrefs.effort_sensitivity || 0.5,
        hourlyRatePriority: swipePrefs.hourly_rate_priority || 0.5,
        timeFlexibility: swipePrefs.time_flexibility || 0.5,
        incomeStability: swipePrefs.income_stability || 0.5,
      },
    };

    return new Response(JSON.stringify(debugState), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[DebugState] Error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Helper: count consecutive low energy weeks from the end
function countConsecutiveLow(history: number[]): number {
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] < 40) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Helper: estimate deficit based on low weeks and goal
function calculateDeficit(history: number[], profile: Record<string, unknown>): number {
  const lowWeeks = history.filter((e) => e < 40).length;
  const weeklyTarget = profile.weekly_target ? Number(profile.weekly_target) : 100;
  // Assume 50% reduction during low energy weeks
  return lowWeeks * (weeklyTarget * 0.5);
}
