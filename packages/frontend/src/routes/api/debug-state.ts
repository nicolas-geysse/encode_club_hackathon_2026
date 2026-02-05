/**
 * Debug State API Route
 *
 * Returns the current state of all algorithms for the debug panel.
 * - Energy state (Normal, Debt, Comeback)
 * - Comeback detection status
 * - Energy debt status
 * - User preference weights
 *
 * Sprint 13.5: Now reads from energy_logs table (fix: was reading stale followup_data)
 * P1-Health: Now uses unified algorithms from API routes (no more duplication)
 * P2-Health: Unified severity terminology (low/medium/high)
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';
// P1-Health: Import unified algorithms from lib
import { detectEnergyDebt, detectComebackWindow, type EnergyEntry } from '~/lib/algorithms';
import { createLogger } from '~/lib/logger';

const logger = createLogger('DebugState');

// ============================================
// TYPES
// ============================================

interface DebugState {
  // Energy state
  // 'Low Energy' = current energy < 40% but not yet 3 consecutive weeks (pre-debt warning)
  energyState: 'Normal' | 'Low Energy' | 'Energy Debt' | 'Comeback Active';
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
  // P2-Health: Unified severity terminology (matches algorithm output directly)
  debtSeverity: 'low' | 'medium' | 'high' | null;
  debtWeeks: number;

  // Preference weights
  prefs: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
}

// ============================================
// API HANDLER
// ============================================

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

    // ============================================
    // FIX: Read energy from energy_logs table (not stale followup_data)
    // Shows rolling window of last 4 weeks of data
    // ============================================

    let energyEntries: EnergyEntry[] = [];
    let energyHistory: number[] = [];

    // Read actual energy logs from database
    // Group by week and get average per week (rolling 4-week window)
    try {
      // First, try to read from energy_logs table
      const energyRows = await query<{
        log_date: string;
        energy_level: number;
        mood_score: number;
        stress_level: number;
      }>(
        `SELECT log_date, energy_level, mood_score, stress_level
         FROM energy_logs
         WHERE profile_id = '${profileId.replace(/'/g, "''")}'
         ORDER BY log_date DESC
         LIMIT 28` // Get up to 4 weeks of daily logs
      );

      if (energyRows.length > 0) {
        // Group by CALENDAR WEEK (based on dates, not array indices)
        // This handles sparse data (e.g., 1 log per week when advancing simulation)
        const sortedRows = [...energyRows].reverse(); // oldest first

        // Calculate composite score for each day (energy + mood + inverse stress)
        const dailyScores = sortedRows.map((row) => {
          const energy = row.energy_level || 3;
          const mood = row.mood_score || 3;
          const stress = row.stress_level || 3;
          // Convert 1-5 scale to percentage: ((e + m + (6-s)) / 15) * 100
          const composite = Math.round(((energy + mood + (6 - stress)) / 15) * 100);
          return { date: String(row.log_date), level: composite };
        });

        // Group by calendar week number (ISO week)
        const weekMap = new Map<string, { levels: number[]; firstDate: string }>();

        for (const entry of dailyScores) {
          const d = new Date(entry.date);
          // Get ISO week number: week starts on Monday
          const jan1 = new Date(d.getFullYear(), 0, 1);
          const dayOfYear = Math.floor((d.getTime() - jan1.getTime()) / 86400000) + 1;
          const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
          const weekKey = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;

          if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { levels: [], firstDate: entry.date });
          }
          weekMap.get(weekKey)!.levels.push(entry.level);
        }

        // Convert to array sorted by week key
        const weeklyAverages = Array.from(weekMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([_weekKey, data], idx) => ({
            week: idx + 1,
            level: Math.round(data.levels.reduce((sum, l) => sum + l, 0) / data.levels.length),
            date: data.firstDate,
          }));

        // Take last 4 weeks (rolling window)
        const last4Weeks = weeklyAverages.slice(-4);
        energyHistory = last4Weeks.map((w) => w.level);
        energyEntries = last4Weeks.map((w) => ({ level: w.level, week: w.week, date: w.date }));
      }
    } catch (err) {
      logger.warn('Failed to read energy_logs, using defaults', { error: err });
    }

    // Default to 50% if no data
    const currentEnergy = energyHistory.length > 0 ? energyHistory[energyHistory.length - 1] : 50;

    // ============================================
    // P1-Health: Use unified algorithms from API routes
    // ============================================

    // Calculate deficit for comeback detection
    const weeklyTarget = profile.weekly_target ? Number(profile.weekly_target) : 100;
    const lowWeeksCount = energyHistory.filter((e) => e < 40).length;
    const estimatedDeficit = lowWeeksCount * (weeklyTarget * 0.5);

    // Energy Debt detection (using EnergyEntry format)
    const energyDebt = detectEnergyDebt(energyEntries);

    // Comeback detection (using number[] and deficit)
    const comeback = detectComebackWindow(energyHistory, estimatedDeficit);

    // Determine state (mutually exclusive: Comeback > Debt > Low Energy > Normal)
    let energyState: DebugState['energyState'] = 'Normal';
    let energyConfidence = 70;
    let comebackActive = false;
    let debtDetected = false;
    let debtSeverity: DebugState['debtSeverity'] = null;

    // Comeback takes priority (it means we've recovered from debt)
    if (comeback?.detected) {
      energyState = 'Comeback Active';
      comebackActive = true;
      energyConfidence = Math.round(comeback.confidenceScore * 100);
    } else if (energyDebt.detected) {
      energyState = 'Energy Debt';
      debtDetected = true;
      // P2-Health: Use algorithm severity directly (no conversion)
      debtSeverity = energyDebt.severity;
      energyConfidence = 80;
    } else if (currentEnergy < 40) {
      // Current energy is low but not yet 3 consecutive weeks = "Low Energy" warning
      energyState = 'Low Energy';
      energyConfidence = 60;
    }

    // Get swipe preferences
    let swipePrefs = {
      effort_sensitivity: 0.5,
      hourly_rate_priority: 0.5,
      time_flexibility: 0.5,
      income_stability: 0.5,
    };

    if (profile.swipe_preferences) {
      try {
        swipePrefs =
          typeof profile.swipe_preferences === 'string'
            ? JSON.parse(profile.swipe_preferences)
            : profile.swipe_preferences;
      } catch {
        // Keep defaults
      }
    }

    // Calculate comeback metrics (using pre-calculated values)
    const deficitWeeks = comeback?.deficitWeeks || lowWeeksCount;
    const comebackDeficit = estimatedDeficit;
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
      debtWeeks: energyDebt.consecutiveLowWeeks,

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
    logger.error('Error getting debug state', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
