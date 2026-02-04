/**
 * Simulation API Route
 *
 * Handles time simulation operations using DuckDB.
 * Uses centralized database connection from _db.ts
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, execute, executeSchema } from './_db';
import { createLogger } from '~/lib/logger';
import { toISODate, todayISO } from '~/lib/dateUtils';

const logger = createLogger('Simulation');

// Helper to get base URL from request
function getBaseUrl(event: APIEvent): string {
  const url = new URL(event.request.url);
  return `${url.protocol}//${url.host}`;
}

interface SimulationState {
  simulatedDate: string;
  realDate: string;
  offsetDays: number;
  isSimulating: boolean;
}

// Schema initialization flag
let schemaInitialized = false;

// Initialize simulation state if needed
async function ensureSimulationState(): Promise<void> {
  if (schemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS simulation_state (
        id VARCHAR PRIMARY KEY DEFAULT 'global',
        simulated_date DATE DEFAULT CURRENT_DATE,
        real_date DATE DEFAULT CURRENT_DATE,
        offset_days INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await execute(`
      INSERT INTO simulation_state (id, simulated_date, real_date, offset_days)
      SELECT 'global', CURRENT_DATE, CURRENT_DATE, 0
      WHERE NOT EXISTS (SELECT 1 FROM simulation_state WHERE id = 'global')
    `);
    schemaInitialized = true;
    logger.info('Schema initialized');
  } catch {
    // Table might already exist
    schemaInitialized = true;
  }
}

// GET: Get current simulation state
export async function GET() {
  try {
    await ensureSimulationState();

    const result = await query<{
      simulated_date: string;
      real_date: string;
      offset_days: number;
    }>(`SELECT simulated_date, real_date, offset_days FROM simulation_state WHERE id = 'global'`);

    if (result.length === 0) {
      const now = todayISO();
      return new Response(
        JSON.stringify({
          simulatedDate: now,
          realDate: now,
          offsetDays: 0,
          isSimulating: false,
        } as SimulationState),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // When offset_days is 0 (no simulation), always return TODAY's date
    // This fixes a bug where stale dates from the DB would cause earnings
    // to not show up until the next day
    // IMPORTANT: Use LOCAL date, not UTC! toISOString() returns UTC which can be
    // a day behind in timezones ahead of UTC (e.g., Europe at midnight local = still yesterday UTC)
    const nowDate = new Date();
    const now = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
    const offsetDays = result[0].offset_days;

    let simulatedDate: string;
    if (offsetDays === 0) {
      // No simulation - use real current date
      simulatedDate = now;
    } else {
      // Simulation active - calculate from real date + offset
      const simDate = new Date();
      simDate.setDate(simDate.getDate() + offsetDays);
      simulatedDate = `${simDate.getFullYear()}-${String(simDate.getMonth() + 1).padStart(2, '0')}-${String(simDate.getDate()).padStart(2, '0')}`;
    }

    const state: SimulationState = {
      simulatedDate,
      realDate: now,
      offsetDays,
      isSimulating: offsetDays > 0,
    };

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    // Return a fallback state instead of crashing
    const now = todayISO();
    return new Response(
      JSON.stringify({
        simulatedDate: now,
        realDate: now,
        offsetDays: 0,
        isSimulating: false,
        _fallback: true,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST: Advance simulation or reset
export async function POST(event: APIEvent) {
  try {
    await ensureSimulationState();

    const body = await event.request.json();
    const { action, days = 1 } = body;

    if (action === 'advance') {
      // Get current state
      const result = await query<{ offset_days: number }>(
        `SELECT offset_days FROM simulation_state WHERE id = 'global'`
      );
      const currentOffset = result.length > 0 ? result[0].offset_days : 0;
      const newOffset = currentOffset + days;

      // Calculate new simulated date
      const realDate = new Date();
      const simulatedDate = new Date(realDate);
      simulatedDate.setDate(simulatedDate.getDate() + newOffset);

      await execute(`
        UPDATE simulation_state SET
          simulated_date = '${toISODate(simulatedDate)}',
          real_date = '${toISODate(realDate)}',
          offset_days = ${newOffset},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);

      // Trigger insights processing if profile info is provided
      const { profileId, energyHistory, currentAmount, goalAmount } = body;
      let insightsResult = null;

      if (profileId) {
        try {
          // Create the request to insights API
          const insightsResponse = await fetch(`${getBaseUrl(event)}/api/insights`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              profileId,
              energyHistory,
              currentAmount,
              goalAmount,
              simulatedDate: toISODate(simulatedDate),
            }),
          });

          if (insightsResponse.ok) {
            insightsResult = await insightsResponse.json();
          }
        } catch (error) {
          logger.error('Failed to trigger insights', { error });
          // Don't fail the simulation if insights fail
        }
      }

      return new Response(
        JSON.stringify({
          simulatedDate: toISODate(simulatedDate),
          realDate: toISODate(realDate),
          offsetDays: newOffset,
          isSimulating: true,
          insightsTriggered: !!insightsResult,
          insights: insightsResult,
          _debug: {
            step: 'advance',
            prevOffset: currentOffset,
            newOffset,
            daysAdded: days,
            simDate: simulatedDate.toISOString(),
            realDateStr: realDate.toISOString(),
          },
        } as SimulationState & { insightsTriggered?: boolean; insights?: unknown; _debug?: any }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'reset') {
      const realDate = new Date();
      const realDateStr = toISODate(realDate);

      await execute(`
        UPDATE simulation_state SET
          simulated_date = '${realDateStr}',
          real_date = '${realDateStr}',
          offset_days = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);

      return new Response(
        JSON.stringify({
          simulatedDate: realDateStr,
          realDate: realDateStr,
          offsetDays: 0,
          isSimulating: false,
        } as SimulationState),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: true, message: 'Invalid action. Use "advance" or "reset".' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database operation failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
