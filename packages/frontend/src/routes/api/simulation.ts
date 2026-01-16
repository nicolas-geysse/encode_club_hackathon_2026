/**
 * Simulation API Route
 *
 * Handles time simulation operations using DuckDB.
 */

import type { APIEvent } from '@solidjs/start/server';
import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as path from 'path';

// Database path
const DB_PATH =
  process.env.DUCKDB_PATH || path.join(process.env.HOME || '.', '.stride', 'data.duckdb');

// Database connection cache
let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

async function getConnection(): Promise<duckdb.Connection> {
  if (!connection) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new duckdb.Database(DB_PATH);
    connection = db.connect();
  }
  return connection;
}

async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    conn.all(sql, (err: Error | null, result: any) => {
      if (err) reject(err);
      else resolve(result as T[]);
    });
  });
}

async function execute(sql: string): Promise<void> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

interface SimulationState {
  simulatedDate: string;
  realDate: string;
  offsetDays: number;
  isSimulating: boolean;
}

// Initialize simulation state if needed
async function ensureSimulationState(): Promise<void> {
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
  } catch {
    // Table might already exist, ignore
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
    console.error('Simulation GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
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
    console.error('Simulation POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
