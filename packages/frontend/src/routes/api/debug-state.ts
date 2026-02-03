/**
 * Debug State API Route
 *
 * Returns the current state of all algorithms for the debug panel.
 * - Energy state (Normal, Debt, Comeback)
 * - Comeback detection status
 * - Energy debt status
 * - User preference weights
 *
 * Sprint 13.5: Now reads from profiles.followup_data.energyHistory (not energy_logs table)
 * P1-Health: Now uses unified algorithms from API routes (no more duplication)
 * P2-Health: Unified severity terminology (low/medium/high)
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';
// P1-Health: Import unified algorithms from lib
import { detectEnergyDebt, detectComebackWindow, type EnergyEntry } from '~/lib/algorithms';

// ============================================
// TYPES
// ============================================

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
    // SPRINT 13.5 FIX: Read energy from followup_data
    // ============================================

    let energyEntries: EnergyEntry[] = [];
    let energyHistory: number[] = [];

    if (profile.followup_data) {
      try {
        const followupData =
          typeof profile.followup_data === 'string'
            ? JSON.parse(profile.followup_data)
            : profile.followup_data;

        if (Array.isArray(followupData?.energyHistory)) {
          // Take last 8 entries (same as before)
          energyEntries = followupData.energyHistory.slice(-8);
          energyHistory = energyEntries.map((e: EnergyEntry) => e.level);
        }
      } catch (parseErr) {
        console.error('[DebugState] Failed to parse followup_data:', parseErr);
      }
    }

    const currentEnergy = energyHistory[energyHistory.length - 1] || 50;

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

    // Determine state (mutually exclusive: Comeback > Debt > Normal)
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
