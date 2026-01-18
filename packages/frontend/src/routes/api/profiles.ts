/**
 * Profiles API Route
 *
 * Handles profile CRUD operations using DuckDB.
 * Uses centralized database connection from _db.ts
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Profiles');

// Schema initialization flag (persists across requests in same process)
let schemaInitialized = false;
let goalsMigrationDone = false;

/**
 * Convert various date formats to ISO date string (YYYY-MM-DD)
 * DuckDB expects this format for DATE columns
 */
function toISODateString(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;

  try {
    // Try to parse the date
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      // If invalid, check if it's already in ISO format
      if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
        return dateValue.substring(0, 10);
      }
      return null;
    }
    // Return in YYYY-MM-DD format
    return date.toISOString().substring(0, 10);
  } catch {
    return null;
  }
}

// Migrate embedded goals from profiles to goals table
async function migrateEmbeddedGoals(): Promise<void> {
  if (goalsMigrationDone) return;

  try {
    // Find profiles with embedded goals that don't have a corresponding goal in the goals table
    const profiles = await query<ProfileRow>(`
      SELECT p.* FROM profiles p
      WHERE p.goal_name IS NOT NULL
      AND p.goal_amount IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM goals g WHERE g.profile_id = p.id
      )
    `);

    let migrated = 0;
    for (const p of profiles) {
      try {
        const goalId = crypto.randomUUID();
        // Convert deadline to ISO format (YYYY-MM-DD) for DuckDB
        const isoDeadline = toISODateString(p.goal_deadline);
        await execute(`
          INSERT INTO goals (id, profile_id, name, amount, deadline, priority, status, created_at)
          VALUES (
            ${escapeSQL(goalId)},
            ${escapeSQL(p.id)},
            ${escapeSQL(p.goal_name!)},
            ${p.goal_amount},
            ${isoDeadline ? escapeSQL(isoDeadline) : 'NULL'},
            1,
            'active',
            CURRENT_TIMESTAMP
          )
        `);
        migrated++;
      } catch (err) {
        logger.warn(`Failed to migrate goal for profile ${p.id}`, { error: err });
      }
    }

    if (migrated > 0) {
      logger.info(`Migrated ${migrated} embedded goals to goals table`);
    }

    goalsMigrationDone = true;
  } catch (err) {
    // Goals table might not exist yet, will be created by goals.ts
    logger.info('Goal migration skipped (goals table may not exist yet)', { error: err });
    goalsMigrationDone = true;
  }
}

// Initialize profiles schema if needed
async function ensureProfilesSchema(): Promise<void> {
  if (schemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS profiles (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        diploma VARCHAR,
        field VARCHAR,
        currency VARCHAR DEFAULT 'USD',
        skills VARCHAR[],
        certifications VARCHAR[],
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

    // Migration: Add field column if missing (for existing databases)
    try {
      await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS field VARCHAR`);
    } catch {
      // Column might already exist or syntax not supported, ignore
    }

    // Migration: Add currency column if missing (for existing databases)
    try {
      await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'USD'`);
    } catch {
      // Column might already exist or syntax not supported, ignore
    }

    // Migration: Add certifications column if missing (for existing databases)
    try {
      await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications VARCHAR[]`);
    } catch {
      // Column might already exist or syntax not supported, ignore
    }

    schemaInitialized = true;
    logger.info('Schema initialized');

    // Run goal migration after schema is ready
    // Delay slightly to ensure goals table schema is also initialized
    setTimeout(() => {
      migrateEmbeddedGoals().catch((err) => {
        logger.warn('Goal migration error', { error: err });
      });
    }, 100);
  } catch {
    // Table might already exist, mark as initialized anyway
    schemaInitialized = true;
  }
}

// Profile type
interface ProfileRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  diploma: string | null;
  field: string | null;
  currency: string | null;
  skills: string[] | null;
  certifications: string[] | null;
  city: string | null;
  city_size: string | null;
  income_sources: string | null;
  expenses: string | null;
  max_work_hours_weekly: number | null;
  min_hourly_rate: number | null;
  has_loan: boolean;
  loan_amount: number | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  monthly_margin: number | null;
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
    field: row.field || undefined,
    currency: (row.currency as 'USD' | 'EUR' | 'GBP') || 'USD',
    skills: row.skills || undefined,
    certifications: row.certifications || undefined,
    city: row.city || undefined,
    citySize: row.city_size || undefined,
    incomeSources: row.income_sources ? JSON.parse(row.income_sources) : undefined,
    expenses: row.expenses ? JSON.parse(row.expenses) : undefined,
    maxWorkHoursWeekly: row.max_work_hours_weekly || undefined,
    minHourlyRate: row.min_hourly_rate || undefined,
    hasLoan: row.has_loan || false,
    loanAmount: row.loan_amount || undefined,
    monthlyIncome: row.monthly_income || undefined,
    monthlyExpenses: row.monthly_expenses || undefined,
    monthlyMargin: row.monthly_margin || undefined,
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
      // Load specific profile - use escapeSQL for safety
      const escapedId = escapeSQL(profileId);
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE id = ${escapedId}`);
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
          const escapedId = escapeSQL(anyRows[0].id);
          await execute(`UPDATE profiles SET is_active = TRUE WHERE id = ${escapedId}`);
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
    logger.error('GET error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database connection failed',
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
    const escapedProfileId = escapeSQL(profileId);
    const existing = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE id = ${escapedProfileId}`
    );

    const monthlyIncome = body.incomeSources
      ? body.incomeSources.reduce((sum: number, i: { amount: number }) => sum + (i.amount || 0), 0)
      : 0;
    const monthlyExpenses = body.expenses
      ? body.expenses.reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0)
      : 0;

    // Format skills array for DuckDB
    const skillsSQL =
      body.skills && Array.isArray(body.skills) && body.skills.length > 0
        ? `ARRAY[${body.skills.map((s: string) => escapeSQL(s)).join(', ')}]`
        : 'NULL';

    // Format certifications array for DuckDB
    const certificationsSQL =
      body.certifications && Array.isArray(body.certifications) && body.certifications.length > 0
        ? `ARRAY[${body.certifications.map((c: string) => escapeSQL(c)).join(', ')}]`
        : 'NULL';

    if (existing.length > 0) {
      // Update existing
      await execute(`
        UPDATE profiles SET
          name = ${escapeSQL(body.name)},
          updated_at = CURRENT_TIMESTAMP,
          diploma = ${escapeSQL(body.diploma)},
          field = ${escapeSQL(body.field)},
          currency = ${escapeSQL(body.currency || 'USD')},
          skills = ${skillsSQL},
          certifications = ${certificationsSQL},
          city = ${escapeSQL(body.city)},
          city_size = ${escapeSQL(body.citySize)},
          income_sources = ${body.incomeSources ? escapeSQL(JSON.stringify(body.incomeSources)) : 'NULL'},
          expenses = ${body.expenses ? escapeSQL(JSON.stringify(body.expenses)) : 'NULL'},
          max_work_hours_weekly = ${body.maxWorkHoursWeekly || 'NULL'},
          min_hourly_rate = ${body.minHourlyRate || 'NULL'},
          has_loan = ${body.hasLoan ? 'TRUE' : 'FALSE'},
          loan_amount = ${body.loanAmount || 'NULL'},
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
        WHERE id = ${escapedProfileId}
      `);
    } else {
      // Insert new
      await execute(`
        INSERT INTO profiles (
          id, name, diploma, field, currency, skills, certifications, city, city_size, income_sources, expenses,
          max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
          monthly_income, monthly_expenses, monthly_margin,
          profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
          plan_data, followup_data, achievements, is_active
        ) VALUES (
          ${escapedProfileId},
          ${escapeSQL(body.name)},
          ${escapeSQL(body.diploma)},
          ${escapeSQL(body.field)},
          ${escapeSQL(body.currency || 'USD')},
          ${skillsSQL},
          ${certificationsSQL},
          ${escapeSQL(body.city)},
          ${escapeSQL(body.citySize)},
          ${body.incomeSources ? escapeSQL(JSON.stringify(body.incomeSources)) : 'NULL'},
          ${body.expenses ? escapeSQL(JSON.stringify(body.expenses)) : 'NULL'},
          ${body.maxWorkHoursWeekly || 'NULL'},
          ${body.minHourlyRate || 'NULL'},
          ${body.hasLoan ? 'TRUE' : 'FALSE'},
          ${body.loanAmount || 'NULL'},
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
    const escapedProfileId = escapeSQL(profileId);
    const existing = await query<{ name: string }>(
      `SELECT name FROM profiles WHERE id = ${escapedProfileId}`
    );
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Deactivate all, activate target
    await execute(`UPDATE profiles SET is_active = FALSE`);
    await execute(`UPDATE profiles SET is_active = TRUE WHERE id = ${escapedProfileId}`);

    return new Response(JSON.stringify({ success: true, profileId, name: existing[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('PUT error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database operation failed',
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

    const escapedProfileId = escapeSQL(profileId);

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
      `SELECT name, is_active FROM profiles WHERE id = ${escapedProfileId}`
    );
    if (profile.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wasActive = profile[0].is_active;

    // Cascade delete: remove all related data first
    // Delete goals for this profile
    try {
      await execute(`DELETE FROM goals WHERE profile_id = ${escapedProfileId}`);
    } catch {
      // Goals table might not exist yet, ignore
    }

    // Delete skills for this profile
    try {
      await execute(`DELETE FROM skills WHERE profile_id = ${escapedProfileId}`);
    } catch {
      // Skills table might not exist yet, ignore
    }

    // Delete inventory items for this profile
    try {
      await execute(`DELETE FROM inventory_items WHERE profile_id = ${escapedProfileId}`);
    } catch {
      // Inventory table might not exist yet, ignore
    }

    // Delete lifestyle items for this profile
    try {
      await execute(`DELETE FROM lifestyle_items WHERE profile_id = ${escapedProfileId}`);
    } catch {
      // Lifestyle table might not exist yet, ignore
    }

    // Delete the profile
    await execute(`DELETE FROM profiles WHERE id = ${escapedProfileId}`);

    // If was active, activate another profile
    if (wasActive) {
      // First get the ID of another profile, then update it
      const otherProfile = await query<{ id: string }>(`SELECT id FROM profiles LIMIT 1`);
      if (otherProfile.length > 0) {
        const escapedOtherId = escapeSQL(otherProfile[0].id);
        await execute(`UPDATE profiles SET is_active = TRUE WHERE id = ${escapedOtherId}`);
      }
    }

    return new Response(JSON.stringify({ success: true, deleted: profile[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('DELETE error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database operation failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
