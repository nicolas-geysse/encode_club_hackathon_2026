/* eslint-disable no-console */
/**
 * Simulation API Route
 *
 * Handles time simulation operations using DuckDB.
 * Uses centralized database connection from _db.ts
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, execute } from './_db';

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
    await execute(`
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
    console.log('[Simulation] Schema initialized');
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
      const now = new Date().toISOString().split('T')[0];
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

    const state: SimulationState = {
      simulatedDate: result[0].simulated_date,
      realDate: result[0].real_date,
      offsetDays: result[0].offset_days,
      isSimulating: result[0].offset_days > 0,
    };

    return new Response(JSON.stringify(state), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Simulation] GET error:', error);
    // Return a fallback state instead of crashing
    const now = new Date().toISOString().split('T')[0];
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
          simulated_date = '${simulatedDate.toISOString().split('T')[0]}',
          real_date = '${realDate.toISOString().split('T')[0]}',
          offset_days = ${newOffset},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);

      return new Response(
        JSON.stringify({
          simulatedDate: simulatedDate.toISOString().split('T')[0],
          realDate: realDate.toISOString().split('T')[0],
          offsetDays: newOffset,
          isSimulating: true,
        } as SimulationState),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'reset') {
      const realDate = new Date();

      await execute(`
        UPDATE simulation_state SET
          simulated_date = '${realDate.toISOString().split('T')[0]}',
          real_date = '${realDate.toISOString().split('T')[0]}',
          offset_days = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);

      return new Response(
        JSON.stringify({
          simulatedDate: realDate.toISOString().split('T')[0],
          realDate: realDate.toISOString().split('T')[0],
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
    console.error('[Simulation] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database operation failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
