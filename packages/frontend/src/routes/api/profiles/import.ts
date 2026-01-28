/**
 * Profile Import API Route
 *
 * POST /api/profiles/import
 * Imports a profile from an exported JSON file.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { execute, escapeSQL, escapeJSON } from '../_db';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('ProfileImport');

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

    // Format skills array for DuckDB (VARCHAR[])
    const skillsSQL =
      profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0
        ? `ARRAY[${profile.skills.map((s) => escapeSQL(s)).join(', ')}]`
        : 'NULL';

    // Insert imported profile
    await execute(`
      INSERT INTO profiles (
        id, name, diploma, skills, city, city_size, income_sources, expenses,
        max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
        monthly_income, monthly_expenses, monthly_margin,
        profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
        plan_data, followup_data, achievements, is_active
      ) VALUES (
        '${profileId}',
        ${escapeSQL(profile.name + ' (Imported)')},
        ${escapeSQL(profile.diploma)},
        ${skillsSQL},
        ${escapeSQL(profile.city)},
        ${escapeSQL(profile.citySize)},
        ${profile.incomeSources ? escapeJSON(profile.incomeSources) : 'NULL'},
        ${profile.expenses ? escapeJSON(profile.expenses) : 'NULL'},
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
        ${profile.planData ? escapeJSON(profile.planData) : 'NULL'},
        ${profile.followupData ? escapeJSON(profile.followupData) : 'NULL'},
        ${profile.achievements ? escapeJSON(profile.achievements) : 'NULL'},
        ${setActive}
      )
    `);

    // Create skills in dedicated skills table (for SkillsTab)
    if (profile.skills && profile.skills.length > 0) {
      try {
        for (const skillName of profile.skills) {
          const skillId = uuidv4();
          await execute(`
            INSERT INTO skills (id, profile_id, name, level, hourly_rate, market_demand, cognitive_effort, rest_needed)
            VALUES (
              '${skillId}',
              '${profileId}',
              ${escapeSQL(skillName)},
              'intermediate',
              ${profile.minHourlyRate || 15},
              3,
              3,
              1
            )
          `);
        }
        logger.info('Created skills from import', { profileId, count: profile.skills.length });
      } catch (skillError) {
        // Non-fatal: skills table might not exist yet
        logger.warn('Failed to create skills from import', { error: skillError });
      }
    }

    // Create goal in dedicated goals table if we have goal data
    if (profile.goalName && profile.goalAmount) {
      try {
        const goalId = uuidv4();
        await execute(`
          INSERT INTO goals (id, profile_id, name, amount, deadline, priority, status)
          VALUES (
            '${goalId}',
            '${profileId}',
            ${escapeSQL(profile.goalName)},
            ${profile.goalAmount},
            ${profile.goalDeadline ? escapeSQL(profile.goalDeadline) : 'NULL'},
            1,
            'active'
          )
        `);
        logger.info('Created goal from import', { profileId, goalName: profile.goalName });
      } catch (goalError) {
        // Non-fatal: goals table might not exist yet
        logger.warn('Failed to create goal from import', { error: goalError });
      }
    }

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
    logger.error('Import failed', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Import failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
