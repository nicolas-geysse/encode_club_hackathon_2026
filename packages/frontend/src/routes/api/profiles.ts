/**
 * Profiles API Route
 *
 * Handles profile CRUD operations using DuckDB.
 * This is a server-side API route for profile management.
 */

import type { APIEvent } from '@solidjs/start/server';
import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Database path
const DB_PATH =
  process.env.DUCKDB_PATH || path.join(process.env.HOME || '.', '.stride', 'data.duckdb');

// Database connection cache
let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

async function getConnection(): Promise<duckdb.Connection> {
  if (!connection) {
    // Ensure directory exists
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new duckdb.Database(DB_PATH);
    connection = db.connect();
  }
  return connection;
}

// Schema initialization flag
let schemaInitialized = false;

// Initialize profiles schema if needed
async function ensureProfilesSchema(): Promise<void> {
  if (schemaInitialized) return;

  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        diploma VARCHAR,
        skills VARCHAR[],
        city VARCHAR,
        city_size VARCHAR,
        income_sources JSON,
        expenses JSON,
        max_work_hours_weekly INTEGER,
        min_hourly_rate DECIMAL,
        has_loan BOOLEAN DEFAULT FALSE,
        loan_amount DECIMAL,
        monthly_income DECIMAL,
        monthly_expenses DECIMAL,
        monthly_margin DECIMAL,
        profile_type VARCHAR DEFAULT 'main',
        parent_profile_id VARCHAR,
        goal_name VARCHAR,
        goal_amount DECIMAL,
        goal_deadline DATE,
        plan_data JSON,
        followup_data JSON,
        achievements JSON,
        is_active BOOLEAN DEFAULT FALSE
      )
    `);
    schemaInitialized = true;
  } catch {
    // Table might already exist, ignore
    schemaInitialized = true;
  }
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

function escapeSQL(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

// Profile type
interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  diploma: string | null;
  skills: string[] | null;
  city: string | null;
  city_size: string | null;
  income_sources: string | null;
  expenses: string | null;
  profile_type: string;
  parent_profile_id: string | null;
  goal_name: string | null;
  goal_amount: number | null;
  goal_deadline: string | null;
  plan_data: string | null;
  followup_data: string | null;
  achievements: string | null;
  is_active: boolean;
}

function rowToProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    diploma: row.diploma || undefined,
    skills: row.skills || undefined,
    city: row.city || undefined,
    citySize: row.city_size || undefined,
    incomeSources: row.income_sources ? JSON.parse(row.income_sources) : undefined,
    expenses: row.expenses ? JSON.parse(row.expenses) : undefined,
    profileType: row.profile_type || 'main',
    parentProfileId: row.parent_profile_id || undefined,
    goalName: row.goal_name || undefined,
    goalAmount: row.goal_amount || undefined,
    goalDeadline: row.goal_deadline || undefined,
    planData: row.plan_data ? JSON.parse(row.plan_data) : undefined,
    followupData: row.followup_data ? JSON.parse(row.followup_data) : undefined,
    achievements: row.achievements ? JSON.parse(row.achievements) : undefined,
    isActive: row.is_active,
  };
}

// GET: Load profile(s)
export async function GET(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('id');
    const activeOnly = url.searchParams.get('active') === 'true';
    const listAll = url.searchParams.get('list') === 'true';

    if (listAll) {
      // List all profiles
      const rows = await query<ProfileRow>(
        `SELECT * FROM profiles ORDER BY is_active DESC, created_at DESC`
      );
      return new Response(JSON.stringify(rows.map(rowToProfile)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (profileId) {
      // Load specific profile
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE id = '${profileId}'`);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(rowToProfile(rows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (activeOnly) {
      // Load active profile
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE is_active = TRUE LIMIT 1`);
      if (rows.length === 0) {
        // Try to get any profile and make it active
        const anyRows = await query<ProfileRow>(`SELECT * FROM profiles LIMIT 1`);
        if (anyRows.length > 0) {
          await execute(`UPDATE profiles SET is_active = TRUE WHERE id = '${anyRows[0].id}'`);
          anyRows[0].is_active = true;
          return new Response(JSON.stringify(rowToProfile(anyRows[0])), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(rowToProfile(rows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Default: return all profiles
    const rows = await query<ProfileRow>(
      `SELECT * FROM profiles ORDER BY is_active DESC, created_at DESC`
    );
    return new Response(JSON.stringify(rows.map(rowToProfile)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profiles GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST: Create/Update profile
export async function POST(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const body = await event.request.json();
    const profileId = body.id || uuidv4();
    const setActive = body.setActive !== false;

    // Deactivate all if setting as active
    if (setActive) {
      await execute(`UPDATE profiles SET is_active = FALSE`);
    }

    // Check if profile exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE id = '${profileId}'`
    );

    const monthlyIncome = body.incomeSources
      ? body.incomeSources.reduce((sum: number, i: { amount: number }) => sum + (i.amount || 0), 0)
      : 0;
    const monthlyExpenses = body.expenses
      ? body.expenses.reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0)
      : 0;

    if (existing.length > 0) {
      // Update existing
      await execute(`
        UPDATE profiles SET
          name = ${escapeSQL(body.name)},
          updated_at = CURRENT_TIMESTAMP,
          diploma = ${escapeSQL(body.diploma)},
          city = ${escapeSQL(body.city)},
          city_size = ${escapeSQL(body.citySize)},
          income_sources = ${body.incomeSources ? escapeSQL(JSON.stringify(body.incomeSources)) : 'NULL'},
          expenses = ${body.expenses ? escapeSQL(JSON.stringify(body.expenses)) : 'NULL'},
          monthly_income = ${monthlyIncome},
          monthly_expenses = ${monthlyExpenses},
          monthly_margin = ${monthlyIncome - monthlyExpenses},
          profile_type = ${escapeSQL(body.profileType || 'main')},
          parent_profile_id = ${escapeSQL(body.parentProfileId)},
          goal_name = ${escapeSQL(body.goalName)},
          goal_amount = ${body.goalAmount || 'NULL'},
          goal_deadline = ${body.goalDeadline ? escapeSQL(body.goalDeadline) : 'NULL'},
          plan_data = ${body.planData ? escapeSQL(JSON.stringify(body.planData)) : 'NULL'},
          followup_data = ${body.followupData ? escapeSQL(JSON.stringify(body.followupData)) : 'NULL'},
          achievements = ${body.achievements ? escapeSQL(JSON.stringify(body.achievements)) : 'NULL'},
          is_active = ${setActive}
        WHERE id = '${profileId}'
      `);
    } else {
      // Insert new
      await execute(`
        INSERT INTO profiles (
          id, name, diploma, city, city_size, income_sources, expenses,
          monthly_income, monthly_expenses, monthly_margin,
          profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
          plan_data, followup_data, achievements, is_active
        ) VALUES (
          '${profileId}',
          ${escapeSQL(body.name)},
          ${escapeSQL(body.diploma)},
          ${escapeSQL(body.city)},
          ${escapeSQL(body.citySize)},
          ${body.incomeSources ? escapeSQL(JSON.stringify(body.incomeSources)) : 'NULL'},
          ${body.expenses ? escapeSQL(JSON.stringify(body.expenses)) : 'NULL'},
          ${monthlyIncome},
          ${monthlyExpenses},
          ${monthlyIncome - monthlyExpenses},
          ${escapeSQL(body.profileType || 'main')},
          ${escapeSQL(body.parentProfileId)},
          ${escapeSQL(body.goalName)},
          ${body.goalAmount || 'NULL'},
          ${body.goalDeadline ? escapeSQL(body.goalDeadline) : 'NULL'},
          ${body.planData ? escapeSQL(JSON.stringify(body.planData)) : 'NULL'},
          ${body.followupData ? escapeSQL(JSON.stringify(body.followupData)) : 'NULL'},
          ${body.achievements ? escapeSQL(JSON.stringify(body.achievements)) : 'NULL'},
          ${setActive}
        )
      `);
    }

    return new Response(JSON.stringify({ success: true, profileId, isActive: setActive }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profiles POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PUT: Switch active profile
export async function PUT(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const body = await event.request.json();
    const { profileId } = body;

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if profile exists
    const existing = await query<{ name: string }>(
      `SELECT name FROM profiles WHERE id = '${profileId}'`
    );
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Deactivate all, activate target
    await execute(`UPDATE profiles SET is_active = FALSE`);
    await execute(`UPDATE profiles SET is_active = TRUE WHERE id = '${profileId}'`);

    return new Response(JSON.stringify({ success: true, profileId, name: existing[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profiles PUT error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete profile
export async function DELETE(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('id');

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'id required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check profile count
    const count = await query<{ count: number }>(`SELECT COUNT(*) as count FROM profiles`);
    if (count[0].count <= 1) {
      return new Response(
        JSON.stringify({ error: true, message: 'Cannot delete the last profile' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get profile info
    const profile = await query<{ name: string; is_active: boolean }>(
      `SELECT name, is_active FROM profiles WHERE id = '${profileId}'`
    );
    if (profile.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wasActive = profile[0].is_active;

    // Delete
    await execute(`DELETE FROM profiles WHERE id = '${profileId}'`);

    // If was active, activate another
    if (wasActive) {
      await execute(
        `UPDATE profiles SET is_active = TRUE WHERE id = (SELECT id FROM profiles LIMIT 1)`
      );
    }

    return new Response(JSON.stringify({ success: true, deleted: profile[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Profiles DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
