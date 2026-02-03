/**
 * Comeback Detection API Route
 *
 * HTTP endpoint for comeback window detection with Opik tracing.
 * Algorithms are imported from ~/lib/algorithms (single source of truth).
 *
 * P1-Health: Unified algorithm with Opik tracing
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, initDatabase } from './_db';
import { trace } from '~/lib/opik';
import { analyzeComeback, type EnergyEntry } from '~/lib/algorithms';

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
      'api.comeback_detection',
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
        let energyHistory: number[] = [];

        if (profile.followup_data) {
          try {
            const followupData =
              typeof profile.followup_data === 'string'
                ? JSON.parse(profile.followup_data)
                : profile.followup_data;

            if (Array.isArray(followupData?.energyHistory)) {
              energyHistory = followupData.energyHistory.map((e: EnergyEntry) => e.level);
            }
          } catch {
            // Keep empty history
          }
        }

        // Calculate deficit based on low weeks and weekly target
        const weeklyTarget = profile.weekly_target ? Number(profile.weekly_target) : 100;
        const lowWeeks = energyHistory.filter((e) => e < 40).length;
        const deficit = lowWeeks * (weeklyTarget * 0.5);

        // Analyze comeback using unified algorithm
        const result = analyzeComeback(energyHistory, deficit);

        // Set trace attributes
        ctx.setAttributes({
          'comeback.profile_id': profileId,
          'comeback.history_length': energyHistory.length,
          'comeback.detected': result.window?.detected || false,
          'comeback.deficit_weeks': result.window?.deficitWeeks || 0,
          'comeback.confidence': result.window?.confidenceScore || 0,
          'comeback.plan_weeks': result.plan.length,
          'comeback.total_catch_up': result.totalCatchUp,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      { source: 'comeback_detection_api' }
    );
  } catch (error) {
    console.error('[ComebackDetection] Error:', error);
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
    const { energyHistory, deficit, capacities } = body as {
      energyHistory: number[];
      deficit: number;
      capacities?: number[];
    };

    if (!Array.isArray(energyHistory)) {
      return new Response(JSON.stringify({ error: true, message: 'energyHistory required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return await trace(
      'api.comeback_detection_direct',
      async (ctx) => {
        const result = analyzeComeback(energyHistory, deficit || 0, capacities);

        ctx.setAttributes({
          'comeback.history_length': energyHistory.length,
          'comeback.detected': result.window?.detected || false,
          'comeback.plan_weeks': result.plan.length,
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
      { source: 'comeback_detection_api_direct' }
    );
  } catch (error) {
    console.error('[ComebackDetection] POST Error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
