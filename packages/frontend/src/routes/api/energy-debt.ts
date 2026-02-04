/**
 * Energy Debt Detection API Route
 *
 * HTTP endpoint for energy debt detection with Opik tracing.
 * Algorithms are imported from ~/lib/algorithms (single source of truth).
 *
 * P1-Health: Unified algorithm with Opik tracing
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';
import { trace } from '~/lib/opik';
import {
  detectEnergyDebt,
  adjustTargetForDebt,
  calculateRecoveryProgress,
  type EnergyEntry,
} from '~/lib/algorithms';
import { createLogger } from '~/lib/logger';

const logger = createLogger('EnergyDebt');

// ============================================
// API HANDLER
// ============================================

export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const profileId = url.searchParams.get('profileId');

  if (!profileId) {
    return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    return await trace(
      'api.energy_debt_detection',
      async (ctx) => {
        await initDatabase();

        // Get profile data
        const profileResult = await query<Record<string, unknown>>(
          `SELECT followup_data, weekly_target FROM profiles WHERE id = '${profileId.replace(/'/g, "''")}'`
        );

        const profile = profileResult[0];
        if (!profile) {
          return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Extract energy history from followup_data
        let energyEntries: EnergyEntry[] = [];

        if (profile.followup_data) {
          try {
            const followupData =
              typeof profile.followup_data === 'string'
                ? JSON.parse(profile.followup_data)
                : profile.followup_data;

            if (Array.isArray(followupData?.energyHistory)) {
              energyEntries = followupData.energyHistory;
            }
          } catch {
            // Keep empty history
          }
        }

        // Detect energy debt using unified algorithm
        const debt = detectEnergyDebt(energyEntries);

        // Calculate target adjustment if debt is detected
        const weeklyTarget = profile.weekly_target ? Number(profile.weekly_target) : 100;
        const adjustment = adjustTargetForDebt(weeklyTarget, debt);

        // Calculate recovery progress
        const recoveryProgress = calculateRecoveryProgress(energyEntries);

        // Set trace attributes
        ctx.setAttributes({
          'energy_debt.profile_id': profileId,
          'energy_debt.history_length': energyEntries.length,
          'energy_debt.detected': debt.detected,
          'energy_debt.consecutive_weeks': debt.consecutiveLowWeeks,
          'energy_debt.severity': debt.severity,
          'energy_debt.target_reduction': debt.targetReduction,
          'energy_debt.recovery_progress': recoveryProgress,
        });

        return new Response(
          JSON.stringify({
            debt,
            adjustment,
            recoveryProgress,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
      { source: 'energy_debt_api' }
    );
  } catch (error) {
    logger.error('GET error', { error });
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
// POST: Direct analysis without DB lookup
// ============================================

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { energyHistory, weeklyTarget } = body as {
      energyHistory: EnergyEntry[];
      weeklyTarget?: number;
    };

    if (!Array.isArray(energyHistory)) {
      return new Response(JSON.stringify({ error: true, message: 'energyHistory required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return await trace(
      'api.energy_debt_detection_direct',
      async (ctx) => {
        const debt = detectEnergyDebt(energyHistory);
        const adjustment = adjustTargetForDebt(weeklyTarget || 100, debt);
        const recoveryProgress = calculateRecoveryProgress(energyHistory);

        ctx.setAttributes({
          'energy_debt.history_length': energyHistory.length,
          'energy_debt.detected': debt.detected,
          'energy_debt.severity': debt.severity,
        });

        return new Response(
          JSON.stringify({
            debt,
            adjustment,
            recoveryProgress,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      },
      { source: 'energy_debt_api_direct' }
    );
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
