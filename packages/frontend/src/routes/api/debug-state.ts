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
 *              and uses the same algorithms as tips-orchestrator for consistency.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';

// ============================================
// TYPES (aligned with mcp-server algorithms)
// ============================================

interface EnergyEntry {
  week: number;
  level: number; // 0-100
  date: string;
}

type DebtSeverity = 'low' | 'medium' | 'high';

interface EnergyDebtResult {
  detected: boolean;
  consecutiveLowWeeks: number;
  severity: DebtSeverity;
}

interface ComebackResult {
  detected: boolean;
  confidenceScore: number;
  deficitWeeks: number;
}

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

// ============================================
// ALGORITHMS (copied from mcp-server for consistency)
// ============================================

/**
 * Detect energy debt from energy history
 * Matches: packages/mcp-server/src/algorithms/energy-debt.ts:80-121
 */
function detectEnergyDebt(history: EnergyEntry[], threshold = 40): EnergyDebtResult {
  const minConsecutiveWeeks = 3;

  // Need at least minConsecutiveWeeks of data
  if (history.length < minConsecutiveWeeks) {
    return { detected: false, consecutiveLowWeeks: 0, severity: 'low' };
  }

  // Count consecutive low weeks from most recent
  let consecutiveLow = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].level < threshold) {
      consecutiveLow++;
    } else {
      break; // Chain broken
    }
  }

  // Not enough consecutive low weeks
  if (consecutiveLow < minConsecutiveWeeks) {
    return { detected: false, consecutiveLowWeeks: 0, severity: 'low' };
  }

  // Determine severity (matches mcp-server logic)
  const severity: DebtSeverity =
    consecutiveLow >= 5 ? 'high' : consecutiveLow >= 4 ? 'medium' : 'low';

  return {
    detected: true,
    consecutiveLowWeeks: consecutiveLow,
    severity,
  };
}

/**
 * Detect a comeback window from energy history
 * Matches: packages/mcp-server/src/algorithms/comeback-detection.ts:100-143
 *
 * A comeback is detected when:
 * 1. At least 3 data points
 * 2. At least 2 low weeks (energy < 40%)
 * 3. Current energy > 80%
 * 4. Previous energy < 50%
 */
function detectComebackWindow(energyLevels: number[]): ComebackResult | null {
  const lowThreshold = 40;
  const recoveryThreshold = 80;
  const previousThreshold = 50;
  const minLowWeeks = 2;

  // Need at least 3 data points
  if (energyLevels.length < 3) {
    return null;
  }

  // Count low weeks
  const lowWeeks = energyLevels.filter((e) => e < lowThreshold);

  // Get current and previous energy
  const currentEnergy = energyLevels[energyLevels.length - 1];
  const previousEnergy = energyLevels[energyLevels.length - 2] || 50;

  // Check comeback conditions
  const hasEnoughLowWeeks = lowWeeks.length >= minLowWeeks;
  const isRecovered = currentEnergy > recoveryThreshold;
  const wasLow = previousEnergy < previousThreshold;

  if (!hasEnoughLowWeeks || !isRecovered || !wasLow) {
    return null;
  }

  // Calculate confidence based on recovery strength
  const recoveryDelta = currentEnergy - previousEnergy;
  const confidenceScore = Math.min(1, recoveryDelta / 50); // 50+ point jump = max confidence

  return {
    detected: true,
    confidenceScore,
    deficitWeeks: lowWeeks.length,
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
    // SPRINT 13.5 FIX: Use real algorithms
    // ============================================

    // Energy Debt detection (using EnergyEntry format for proper algorithm)
    const energyDebt = detectEnergyDebt(energyEntries);

    // Comeback detection (using number[] for that algorithm)
    const comeback = detectComebackWindow(energyHistory);

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
      // Map algorithm severity to display severity
      debtSeverity =
        energyDebt.severity === 'high'
          ? 'severe'
          : energyDebt.severity === 'medium'
            ? 'moderate'
            : 'mild';
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

    // Calculate comeback metrics
    const deficitWeeks = comeback?.deficitWeeks || energyHistory.filter((e) => e < 40).length;
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

// ============================================
// HELPERS
// ============================================

// Estimate deficit based on low weeks and goal
function calculateDeficit(history: number[], profile: Record<string, unknown>): number {
  const lowWeeks = history.filter((e) => e < 40).length;
  const weeklyTarget = profile.weekly_target ? Number(profile.weekly_target) : 100;
  // Assume 50% reduction during low energy weeks
  return lowWeeks * (weeklyTarget * 0.5);
}
