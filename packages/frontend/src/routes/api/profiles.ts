/**
 * Profiles API Route
 *
 * Handles profile CRUD operations using DuckDB.
 * Uses centralized database connection from _db.ts
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  successResponse,
  errorResponse,
  parseQueryParams,
  query,
  execute,
  executeSchema,
  escapeSQL,
  escapeJSON,
  uuidv4,
} from './_crud-helpers';
import { createLogger } from '../../lib/logger';
import { fuzzyCoordinates } from '../../lib/locationPrivacy';

const logger = createLogger('Profiles');

// Schema initialization flags
const schemaFlag = { initialized: false };
let goalsMigrationDone = false;

const SCHEMA_SQL = `
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
    latitude DOUBLE,
    longitude DOUBLE,
    address VARCHAR,
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
    swipe_preferences JSON,
    skipped_steps VARCHAR[],
    is_active BOOLEAN DEFAULT FALSE
  )
`;

const MIGRATIONS = [
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS swipe_preferences JSON`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS field VARCHAR`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS currency VARCHAR DEFAULT 'USD'`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications VARCHAR[]`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS latitude DOUBLE`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longitude DOUBLE`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address VARCHAR`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS income_day INTEGER DEFAULT 15`,
  `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skipped_steps VARCHAR[]`,
];

/**
 * Convert various date formats to ISO date string (YYYY-MM-DD)
 */
function toISODateString(dateValue: string | null | undefined): string | null {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      if (/^\d{4}-\d{2}-\d{2}/.test(dateValue)) {
        return dateValue.substring(0, 10);
      }
      return null;
    }
    return date.toISOString().substring(0, 10);
  } catch {
    return null;
  }
}

/**
 * Migrate embedded goals from profiles to goals table
 */
async function migrateEmbeddedGoals(): Promise<void> {
  if (goalsMigrationDone) return;

  try {
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
    logger.info('Goal migration skipped (goals table may not exist yet)', { error: err });
    goalsMigrationDone = true;
  }
}

async function ensureProfilesSchema(): Promise<void> {
  if (schemaFlag.initialized) return;

  try {
    await executeSchema(SCHEMA_SQL);

    // Run migrations
    for (const migration of MIGRATIONS) {
      try {
        await execute(migration);
      } catch {
        // Migration might fail if column already exists, ignore
      }
    }

    schemaFlag.initialized = true;
    logger.info('Schema initialized');

    // Run goal migration after schema is ready
    setTimeout(() => {
      migrateEmbeddedGoals().catch((err) => {
        logger.warn('Goal migration error', { error: err });
      });
    }, 100);
  } catch {
    schemaFlag.initialized = true;
  }
}

// DB Row type
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
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  income_sources: string | null;
  expenses: string | null;
  max_work_hours_weekly: number | null;
  min_hourly_rate: number | null;
  has_loan: boolean;
  loan_amount: number | null;
  monthly_income: number | null;
  monthly_expenses: number | null;
  monthly_margin: number | null;
  income_day: number | null;
  profile_type: string;
  parent_profile_id: string | null;
  goal_name: string | null;
  goal_amount: number | null;
  goal_deadline: string | null;
  plan_data: string | null;
  followup_data: string | null;
  achievements: string | null;
  swipe_preferences: string | null;
  skipped_steps: string[] | null;
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
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    address: row.address || undefined,
    incomeSources: row.income_sources ? JSON.parse(row.income_sources) : undefined,
    expenses: row.expenses ? JSON.parse(row.expenses) : undefined,
    maxWorkHoursWeekly: row.max_work_hours_weekly || undefined,
    minHourlyRate: row.min_hourly_rate || undefined,
    hasLoan: row.has_loan || false,
    loanAmount: row.loan_amount || undefined,
    monthlyIncome: row.monthly_income || undefined,
    monthlyExpenses: row.monthly_expenses || undefined,
    monthlyMargin: row.monthly_margin || undefined,
    incomeDay: row.income_day ?? 15, // Default to 15 (mid-month)
    profileType: row.profile_type || 'main',
    parentProfileId: row.parent_profile_id || undefined,
    goalName: row.goal_name || undefined,
    goalAmount: row.goal_amount || undefined,
    goalDeadline: row.goal_deadline || undefined,
    planData: row.plan_data ? JSON.parse(row.plan_data) : undefined,
    followupData: row.followup_data ? JSON.parse(row.followup_data) : undefined,
    achievements: row.achievements ? JSON.parse(row.achievements) : undefined,
    swipePreferences: row.swipe_preferences ? JSON.parse(row.swipe_preferences) : undefined,
    skippedSteps: row.skipped_steps || undefined,
    isActive: row.is_active,
  };
}

const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

// GET: Load profile(s)
export async function GET(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const params = parseQueryParams(event);
    const profileId = params.get('id');
    const activeOnly = params.get('active') === 'true';
    const listAll = params.get('list') === 'true';

    if (listAll) {
      const rows = await query<ProfileRow>(
        `SELECT * FROM profiles ORDER BY is_active DESC, created_at DESC`
      );
      return new Response(JSON.stringify(rows.map(rowToProfile)), {
        status: 200,
        headers: NO_CACHE_HEADERS,
      });
    }

    if (profileId) {
      const escapedId = escapeSQL(profileId);
      const rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE id = ${escapedId}`);
      if (rows.length === 0) {
        return errorResponse('Profile not found', 404, true);
      }
      return new Response(JSON.stringify(rowToProfile(rows[0])), {
        status: 200,
        headers: NO_CACHE_HEADERS,
      });
    }

    if (activeOnly) {
      let rows = await query<ProfileRow>(`SELECT * FROM profiles WHERE is_active = TRUE LIMIT 1`);
      if (rows.length === 0) {
        // No active profile - check if any profiles exist and auto-activate the first one
        const allProfiles = await query<ProfileRow>(
          `SELECT * FROM profiles ORDER BY created_at DESC LIMIT 1`
        );
        if (allProfiles.length > 0) {
          // Auto-activate the most recent profile
          const profileToActivate = allProfiles[0];
          const escapedId = escapeSQL(profileToActivate.id);
          await execute(`UPDATE profiles SET is_active = TRUE WHERE id = ${escapedId}`);
          logger.info('Auto-activated profile (no active profile found)', {
            profileId: profileToActivate.id,
          });
          rows = [{ ...profileToActivate, is_active: true }];
        } else {
          // Truly no profiles exist
          return new Response(JSON.stringify(null), {
            status: 200,
            headers: NO_CACHE_HEADERS,
          });
        }
      }
      return new Response(JSON.stringify(rowToProfile(rows[0])), {
        status: 200,
        headers: NO_CACHE_HEADERS,
      });
    }

    // Default: return all profiles
    const rows = await query<ProfileRow>(
      `SELECT * FROM profiles ORDER BY is_active DESC, created_at DESC`
    );
    return new Response(JSON.stringify(rows.map(rowToProfile)), {
      status: 200,
      headers: NO_CACHE_HEADERS,
    });
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(
      error instanceof Error ? error.message : 'Database connection failed',
      500,
      true
    );
  }
}

// POST: Create/Update profile
export async function POST(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const body = await event.request.json();

    // PRIVACY: Always store fuzzy coordinates (2 decimal places = ~1km precision)
    // This ensures FERPA/GDPR compliance - no precise GPS data persisted
    // Defense-in-depth: even if frontend sends raw coordinates, API enforces fuzzy values
    if (body.latitude != null && body.longitude != null) {
      const fuzzy = fuzzyCoordinates(body.latitude, body.longitude);
      body.latitude = fuzzy.latitude;
      body.longitude = fuzzy.longitude;
    }

    const profileId = body.id || uuidv4();
    const setActive = body.setActive !== false;
    const preserveActiveState = body.setActive === false;

    if (setActive) {
      await execute(`UPDATE profiles SET is_active = FALSE`);
    }

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

    const skillsSQL =
      body.skills && Array.isArray(body.skills) && body.skills.length > 0
        ? `ARRAY[${body.skills.map((s: string) => escapeSQL(s)).join(', ')}]`
        : 'NULL';

    const certificationsSQL =
      body.certifications && Array.isArray(body.certifications) && body.certifications.length > 0
        ? `ARRAY[${body.certifications.map((c: string) => escapeSQL(c)).join(', ')}]`
        : 'NULL';

    const skippedStepsSQL =
      body.skippedSteps && Array.isArray(body.skippedSteps) && body.skippedSteps.length > 0
        ? `ARRAY[${body.skippedSteps.map((s: string) => escapeSQL(s)).join(', ')}]`
        : 'NULL';

    if (existing.length > 0) {
      const isActiveClause = preserveActiveState
        ? ''
        : `,
          is_active = ${setActive ? 'TRUE' : 'FALSE'}`;
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
          latitude = ${body.latitude != null ? body.latitude : 'NULL'},
          longitude = ${body.longitude != null ? body.longitude : 'NULL'},
          address = ${escapeSQL(body.address)},
          income_sources = ${body.incomeSources ? escapeJSON(body.incomeSources) : 'NULL'},
          expenses = ${body.expenses ? escapeJSON(body.expenses) : 'NULL'},
          max_work_hours_weekly = ${body.maxWorkHoursWeekly || 'NULL'},
          min_hourly_rate = ${body.minHourlyRate || 'NULL'},
          has_loan = ${body.hasLoan ? 'TRUE' : 'FALSE'},
          loan_amount = ${body.loanAmount || 'NULL'},
          monthly_income = ${monthlyIncome},
          monthly_expenses = ${monthlyExpenses},
          monthly_margin = ${monthlyIncome - monthlyExpenses},
          income_day = ${body.incomeDay != null ? body.incomeDay : 15},
          profile_type = ${escapeSQL(body.profileType || 'main')},
          parent_profile_id = ${escapeSQL(body.parentProfileId)},
          goal_name = ${escapeSQL(body.goalName)},
          goal_amount = ${body.goalAmount || 'NULL'},
          goal_deadline = ${body.goalDeadline ? escapeSQL(body.goalDeadline) : 'NULL'},
          plan_data = ${body.planData ? escapeJSON(body.planData) : 'NULL'},
          followup_data = ${body.followupData ? escapeJSON(body.followupData) : 'NULL'},
          achievements = ${body.achievements ? escapeJSON(body.achievements) : 'NULL'},
          swipe_preferences = ${body.swipePreferences ? escapeJSON(body.swipePreferences) : 'NULL'},
          skipped_steps = ${skippedStepsSQL}${isActiveClause}
        WHERE id = ${escapedProfileId}
      `);
    } else {
      await execute(`
        INSERT INTO profiles (
          id, name, diploma, field, currency, skills, certifications, city, city_size,
          latitude, longitude, address, income_sources, expenses,
          max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
          monthly_income, monthly_expenses, monthly_margin, income_day,
          profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
          plan_data, followup_data, achievements, swipe_preferences, skipped_steps, is_active
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
          ${body.latitude != null ? body.latitude : 'NULL'},
          ${body.longitude != null ? body.longitude : 'NULL'},
          ${escapeSQL(body.address)},
          ${body.incomeSources ? escapeJSON(body.incomeSources) : 'NULL'},
          ${body.expenses ? escapeJSON(body.expenses) : 'NULL'},
          ${body.maxWorkHoursWeekly || 'NULL'},
          ${body.minHourlyRate || 'NULL'},
          ${body.hasLoan ? 'TRUE' : 'FALSE'},
          ${body.loanAmount || 'NULL'},
          ${monthlyIncome},
          ${monthlyExpenses},
          ${monthlyIncome - monthlyExpenses},
          ${body.incomeDay != null ? body.incomeDay : 15},
          ${escapeSQL(body.profileType || 'main')},
          ${escapeSQL(body.parentProfileId)},
          ${escapeSQL(body.goalName)},
          ${body.goalAmount || 'NULL'},
          ${body.goalDeadline ? escapeSQL(body.goalDeadline) : 'NULL'},
          ${body.planData ? escapeJSON(body.planData) : 'NULL'},
          ${body.followupData ? escapeJSON(body.followupData) : 'NULL'},
          ${body.achievements ? escapeJSON(body.achievements) : 'NULL'},
          ${body.swipePreferences ? escapeJSON(body.swipePreferences) : 'NULL'},
          ${skippedStepsSQL},
          ${setActive ? 'TRUE' : 'FALSE'}
        )
      `);
    }

    return successResponse({ success: true, profileId, isActive: setActive }, 200, true);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(
      error instanceof Error ? error.message : 'Database operation failed',
      500,
      true
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
      return errorResponse('profileId required', 400, true);
    }

    const escapedProfileId = escapeSQL(profileId);
    const existing = await query<{ name: string }>(
      `SELECT name FROM profiles WHERE id = ${escapedProfileId}`
    );
    if (existing.length === 0) {
      return errorResponse('Profile not found', 404, true);
    }

    // Atomic switch
    await execute(`
      UPDATE profiles
      SET is_active = CASE
        WHEN id = ${escapedProfileId} THEN TRUE
        ELSE FALSE
      END
    `);

    return successResponse({ success: true, profileId, name: existing[0].name }, 200, true);
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(
      error instanceof Error ? error.message : 'Database operation failed',
      500,
      true
    );
  }
}

// DELETE: Delete profile with cascade
export async function DELETE(event: APIEvent) {
  try {
    await ensureProfilesSchema();

    const params = parseQueryParams(event);
    const profileId = params.get('id');

    if (!profileId) {
      return errorResponse('id required', 400, true);
    }

    const escapedProfileId = escapeSQL(profileId);

    // Check profile count
    const count = await query<{ count: number }>(`SELECT COUNT(*) as count FROM profiles`);
    if (count[0].count <= 1) {
      return errorResponse('Cannot delete the last profile', 400, true);
    }

    // Get profile info
    const profile = await query<{ name: string; is_active: boolean }>(
      `SELECT name, is_active FROM profiles WHERE id = ${escapedProfileId}`
    );
    if (profile.length === 0) {
      return errorResponse('Profile not found', 404, true);
    }

    const wasActive = profile[0].is_active;

    // Cascade delete: remove all related data
    const tables = ['goals', 'skills', 'inventory_items', 'lifestyle_items', 'trades'];
    for (const table of tables) {
      try {
        await execute(`DELETE FROM ${table} WHERE profile_id = ${escapedProfileId}`);
      } catch {
        // Table might not exist yet, ignore
      }
    }

    // Delete the profile
    await execute(`DELETE FROM profiles WHERE id = ${escapedProfileId}`);

    // If was active, activate another profile
    if (wasActive) {
      const otherProfile = await query<{ id: string }>(`SELECT id FROM profiles LIMIT 1`);
      if (otherProfile.length > 0) {
        const escapedOtherId = escapeSQL(otherProfile[0].id);
        await execute(`UPDATE profiles SET is_active = TRUE WHERE id = ${escapedOtherId}`);
      }
    }

    return successResponse({ success: true, deleted: profile[0].name }, 200, true);
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(
      error instanceof Error ? error.message : 'Database operation failed',
      500,
      true
    );
  }
}
