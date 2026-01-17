/**
 * Profile Import API Route
 *
 * POST /api/profiles/import
 * Imports a profile from an exported JSON file.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { execute, escapeSQL } from '../_db';

interface ImportedProfile {
  id?: string;
  name: string;
  diploma?: string;
  skills?: string[];
  city?: string;
  citySize?: string;
  incomeSources?: Array<{ source: string; amount: number }>;
  expenses?: Array<{ category: string; amount: number }>;
  maxWorkHoursWeekly?: number;
  minHourlyRate?: number;
  hasLoan?: boolean;
  loanAmount?: number;
  profileType?: string;
  parentProfileId?: string;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  planData?: Record<string, unknown>;
  followupData?: Record<string, unknown>;
  achievements?: string[];
}

interface ImportRequest {
  version: string;
  exportedAt?: string;
  source?: string;
  profile: ImportedProfile;
  options?: {
    merge?: boolean;
    setActive?: boolean;
  };
}

export async function POST(event: APIEvent) {
  try {
    const body: ImportRequest = await event.request.json();

    // Validate import data
    if (!body.profile || !body.profile.name) {
      return new Response(
        JSON.stringify({ error: true, message: 'Invalid import data: profile with name required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate version
    if (body.version && body.version !== '1.0') {
      return new Response(
        JSON.stringify({ error: true, message: `Unsupported import version: ${body.version}` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { profile, options = {} } = body;
    const { setActive = true } = options;

    // Generate new ID (don't reuse imported ID to avoid conflicts)
    const profileId = uuidv4();

    // Calculate totals
    const monthlyIncome = profile.incomeSources
      ? profile.incomeSources.reduce((sum, i) => sum + (i.amount || 0), 0)
      : 0;
    const monthlyExpenses = profile.expenses
      ? profile.expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      : 0;

    // Deactivate all if setting as active
    if (setActive) {
      await execute(`UPDATE profiles SET is_active = FALSE`);
    }

    // Insert imported profile
    await execute(`
      INSERT INTO profiles (
        id, name, diploma, city, city_size, income_sources, expenses,
        max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
        monthly_income, monthly_expenses, monthly_margin,
        profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
        plan_data, followup_data, achievements, is_active
      ) VALUES (
        '${profileId}',
        ${escapeSQL(profile.name + ' (Imported)')},
        ${escapeSQL(profile.diploma)},
        ${escapeSQL(profile.city)},
        ${escapeSQL(profile.citySize)},
        ${profile.incomeSources ? escapeSQL(JSON.stringify(profile.incomeSources)) : 'NULL'},
        ${profile.expenses ? escapeSQL(JSON.stringify(profile.expenses)) : 'NULL'},
        ${profile.maxWorkHoursWeekly || 'NULL'},
        ${profile.minHourlyRate || 'NULL'},
        ${profile.hasLoan || false},
        ${profile.loanAmount || 'NULL'},
        ${monthlyIncome},
        ${monthlyExpenses},
        ${monthlyIncome - monthlyExpenses},
        ${escapeSQL(profile.profileType || 'main')},
        ${escapeSQL(profile.parentProfileId)},
        ${escapeSQL(profile.goalName)},
        ${profile.goalAmount || 'NULL'},
        ${profile.goalDeadline ? escapeSQL(profile.goalDeadline) : 'NULL'},
        ${profile.planData ? escapeSQL(JSON.stringify(profile.planData)) : 'NULL'},
        ${profile.followupData ? escapeSQL(JSON.stringify(profile.followupData)) : 'NULL'},
        ${profile.achievements ? escapeSQL(JSON.stringify(profile.achievements)) : 'NULL'},
        ${setActive}
      )
    `);

    return new Response(
      JSON.stringify({
        success: true,
        profileId,
        message: `Profile "${profile.name}" imported successfully`,
        isActive: setActive,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Profile Import] Error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Import failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
