/**
 * Profile Management Tools
 *
 * MCP tools for managing user profiles with DuckDB persistence:
 * - save_profile: Save profile + planData + followupData
 * - load_profile: Load by ID or active profile
 * - list_profiles: List all profiles with summary
 * - switch_profile: Change active profile
 * - duplicate_profile_for_goal: Clone profile for new goal
 * - delete_profile: Delete a profile
 */

import { query, execute, getSimulationState } from '../services/duckdb.js';
import { trace, getCurrentTraceId } from '../services/opik.js';
import { v4 as uuidv4 } from 'uuid';

// Types
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

interface FullProfile {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
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
  monthlyIncome?: number;
  monthlyExpenses?: number;
  monthlyMargin?: number;
  profileType: string;
  parentProfileId?: string;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  planData?: Record<string, unknown>;
  followupData?: Record<string, unknown>;
  achievements?: string[];
  isActive: boolean;
}

interface ProfileSummary {
  id: string;
  name: string;
  profileType: string;
  goalName?: string;
  goalAmount?: number;
  isActive: boolean;
  createdAt: string;
}

// Tool definitions
export const PROFILE_TOOLS = {
  save_profile: {
    description:
      'Save a user profile with all data (planData, followupData, achievements) to DuckDB',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Profile ID (generated if not provided)' },
        name: { type: 'string', description: 'User name' },
        diploma: { type: 'string', description: 'Current diploma' },
        skills: { type: 'array', items: { type: 'string' }, description: 'List of skills' },
        city: { type: 'string', description: 'City' },
        city_size: { type: 'string', description: 'City size (small/medium/large)' },
        income_sources: { type: 'array', description: 'Income sources' },
        expenses: { type: 'array', description: 'Expense categories' },
        max_work_hours_weekly: { type: 'number', description: 'Max weekly work hours' },
        min_hourly_rate: { type: 'number', description: 'Minimum hourly rate' },
        has_loan: { type: 'boolean', description: 'Has student loan' },
        loan_amount: { type: 'number', description: 'Loan amount' },
        profile_type: { type: 'string', enum: ['main', 'goal-clone'], description: 'Profile type' },
        parent_profile_id: { type: 'string', description: 'Parent profile ID if cloned' },
        goal_name: { type: 'string', description: 'Current goal name' },
        goal_amount: { type: 'number', description: 'Goal target amount' },
        goal_deadline: { type: 'string', description: 'Goal deadline (ISO date)' },
        plan_data: { type: 'object', description: 'Full plan data (tabs, setup, etc.)' },
        followup_data: { type: 'object', description: 'Followup/tracking data' },
        achievements: {
          type: 'array',
          items: { type: 'string' },
          description: 'Unlocked achievements',
        },
        set_active: { type: 'boolean', description: 'Set as active profile', default: false },
      },
      required: ['name'],
    },
  },

  load_profile: {
    description: 'Load a profile by ID or get the active profile',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'Profile ID to load (omit for active profile)' },
      },
    },
  },

  list_profiles: {
    description: 'List all profiles with summary information',
    inputSchema: {
      type: 'object',
      properties: {
        include_clones: {
          type: 'boolean',
          description: 'Include goal-clone profiles',
          default: true,
        },
      },
    },
  },

  switch_profile: {
    description: 'Switch the active profile',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'Profile ID to activate' },
      },
      required: ['profile_id'],
    },
  },

  duplicate_profile_for_goal: {
    description: 'Duplicate a profile for a new goal (keeps personal data, resets goal data)',
    inputSchema: {
      type: 'object',
      properties: {
        source_profile_id: { type: 'string', description: 'Source profile ID to duplicate' },
        goal_name: { type: 'string', description: 'New goal name' },
        goal_amount: { type: 'number', description: 'New goal amount' },
        goal_deadline: { type: 'string', description: 'New goal deadline (ISO date)' },
        set_active: { type: 'boolean', description: 'Set new profile as active', default: true },
      },
      required: ['source_profile_id', 'goal_name', 'goal_amount'],
    },
  },

  delete_profile: {
    description: 'Delete a profile (cannot delete the last profile)',
    inputSchema: {
      type: 'object',
      properties: {
        profile_id: { type: 'string', description: 'Profile ID to delete' },
        confirm: { type: 'boolean', description: 'Confirm deletion', default: false },
      },
      required: ['profile_id', 'confirm'],
    },
  },
};

// Tool handlers
export async function handleProfileTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'save_profile':
      return handleSaveProfile(args);
    case 'load_profile':
      return handleLoadProfile(args);
    case 'list_profiles':
      return handleListProfiles(args);
    case 'switch_profile':
      return handleSwitchProfile(args);
    case 'duplicate_profile_for_goal':
      return handleDuplicateProfileForGoal(args);
    case 'delete_profile':
      return handleDeleteProfile(args);
    default:
      throw new Error(`Unknown profile tool: ${name}`);
  }
}

// Helper: Convert DB row to FullProfile
function rowToProfile(row: ProfileRow): FullProfile {
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
    maxWorkHoursWeekly: row.max_work_hours_weekly || undefined,
    minHourlyRate: row.min_hourly_rate || undefined,
    hasLoan: row.has_loan,
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

// Helper: Escape string for SQL
function escapeSQL(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

// Handler implementations
async function handleSaveProfile(args: Record<string, unknown>) {
  return trace('profile_save', async (span) => {
    const profileId = (args.id as string) || uuidv4();
    const name = args.name as string;
    const setActive = (args.set_active as boolean) || false;

    // Get simulation state for Opik tracing
    const simState = await getSimulationState();

    span.setAttributes({
      'profile.id': profileId,
      'profile.name': name,
      'profile.type': (args.profile_type as string) || 'main',
      'profile.set_active': setActive,
      'profile.goal_name': (args.goal_name as string) || undefined,
      'simulation.is_simulating': simState.isSimulating,
      'simulation.offset_days': simState.offsetDays,
    });

    // Calculate totals if income/expenses provided
    let monthlyIncome = 0;
    let monthlyExpenses = 0;
    if (args.income_sources) {
      const incomes = args.income_sources as Array<{ amount: number }>;
      monthlyIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
    }
    if (args.expenses) {
      const expenses = args.expenses as Array<{ amount: number }>;
      monthlyExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    }
    const monthlyMargin = monthlyIncome - monthlyExpenses;

    // If setting as active, deactivate all others first
    if (setActive) {
      await execute(`UPDATE profiles SET is_active = FALSE`);
    }

    // Check if profile exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM profiles WHERE id = '${profileId}'`
    );

    if (existing.length > 0) {
      // Update existing profile
      await execute(`
        UPDATE profiles SET
          name = ${escapeSQL(name)},
          updated_at = CURRENT_TIMESTAMP,
          diploma = ${escapeSQL(args.diploma as string)},
          skills = ${args.skills ? `ARRAY[${(args.skills as string[]).map((s) => escapeSQL(s)).join(',')}]` : 'NULL'},
          city = ${escapeSQL(args.city as string)},
          city_size = ${escapeSQL(args.city_size as string)},
          income_sources = ${args.income_sources ? escapeSQL(JSON.stringify(args.income_sources)) : 'NULL'},
          expenses = ${args.expenses ? escapeSQL(JSON.stringify(args.expenses)) : 'NULL'},
          max_work_hours_weekly = ${args.max_work_hours_weekly || 'NULL'},
          min_hourly_rate = ${args.min_hourly_rate || 'NULL'},
          has_loan = ${args.has_loan || false},
          loan_amount = ${args.loan_amount || 'NULL'},
          monthly_income = ${monthlyIncome},
          monthly_expenses = ${monthlyExpenses},
          monthly_margin = ${monthlyMargin},
          profile_type = ${escapeSQL((args.profile_type as string) || 'main')},
          parent_profile_id = ${escapeSQL(args.parent_profile_id as string)},
          goal_name = ${escapeSQL(args.goal_name as string)},
          goal_amount = ${args.goal_amount || 'NULL'},
          goal_deadline = ${args.goal_deadline ? escapeSQL(args.goal_deadline as string) : 'NULL'},
          plan_data = ${args.plan_data ? escapeSQL(JSON.stringify(args.plan_data)) : 'NULL'},
          followup_data = ${args.followup_data ? escapeSQL(JSON.stringify(args.followup_data)) : 'NULL'},
          achievements = ${args.achievements ? escapeSQL(JSON.stringify(args.achievements)) : 'NULL'},
          is_active = ${setActive}
        WHERE id = '${profileId}'
      `);
    } else {
      // Insert new profile
      await execute(`
        INSERT INTO profiles (
          id, name, diploma, skills, city, city_size, income_sources, expenses,
          max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
          monthly_income, monthly_expenses, monthly_margin,
          profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
          plan_data, followup_data, achievements, is_active
        ) VALUES (
          '${profileId}',
          ${escapeSQL(name)},
          ${escapeSQL(args.diploma as string)},
          ${args.skills ? `ARRAY[${(args.skills as string[]).map((s) => escapeSQL(s)).join(',')}]` : 'NULL'},
          ${escapeSQL(args.city as string)},
          ${escapeSQL(args.city_size as string)},
          ${args.income_sources ? escapeSQL(JSON.stringify(args.income_sources)) : 'NULL'},
          ${args.expenses ? escapeSQL(JSON.stringify(args.expenses)) : 'NULL'},
          ${args.max_work_hours_weekly || 'NULL'},
          ${args.min_hourly_rate || 'NULL'},
          ${args.has_loan || false},
          ${args.loan_amount || 'NULL'},
          ${monthlyIncome},
          ${monthlyExpenses},
          ${monthlyMargin},
          ${escapeSQL((args.profile_type as string) || 'main')},
          ${escapeSQL(args.parent_profile_id as string)},
          ${escapeSQL(args.goal_name as string)},
          ${args.goal_amount || 'NULL'},
          ${args.goal_deadline ? escapeSQL(args.goal_deadline as string) : 'NULL'},
          ${args.plan_data ? escapeSQL(JSON.stringify(args.plan_data)) : 'NULL'},
          ${args.followup_data ? escapeSQL(JSON.stringify(args.followup_data)) : 'NULL'},
          ${args.achievements ? escapeSQL(JSON.stringify(args.achievements)) : 'NULL'},
          ${setActive}
        )
      `);
    }

    span.setAttributes({
      'profile.saved': true,
      'profile.monthly_margin': monthlyMargin,
    });

    return {
      type: 'text',
      params: {
        content: `Profile **${name}** saved successfully.${setActive ? ' (now active)' : ''}`,
        markdown: true,
      },
      data: {
        profileId,
        isActive: setActive,
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleLoadProfile(args: Record<string, unknown>) {
  return trace('profile_load', async (span) => {
    const profileId = args.profile_id as string | undefined;

    span.setAttributes({
      'profile.id': profileId || 'active',
    });

    let sql: string;
    if (profileId) {
      sql = `SELECT * FROM profiles WHERE id = '${profileId}'`;
    } else {
      sql = `SELECT * FROM profiles WHERE is_active = TRUE LIMIT 1`;
    }

    const rows = await query<ProfileRow>(sql);

    if (rows.length === 0) {
      // If looking for active and none found, get the first profile
      if (!profileId) {
        const anyProfile = await query<ProfileRow>(`SELECT * FROM profiles LIMIT 1`);
        if (anyProfile.length > 0) {
          // Make it active
          await execute(`UPDATE profiles SET is_active = TRUE WHERE id = '${anyProfile[0].id}'`);
          const profile = rowToProfile(anyProfile[0]);
          profile.isActive = true;
          return {
            type: 'composite',
            data: profile,
            metadata: { traceId: getCurrentTraceId() },
          };
        }
      }
      return {
        type: 'text',
        params: {
          content: profileId
            ? `Profile not found: ${profileId}`
            : 'No profiles found. Create one first.',
          markdown: true,
        },
        data: null,
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const profile = rowToProfile(rows[0]);

    span.setAttributes({
      'profile.name': profile.name,
      'profile.type': profile.profileType,
      'profile.is_active': profile.isActive,
    });

    return {
      type: 'composite',
      data: profile,
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleListProfiles(args: Record<string, unknown>) {
  return trace('profile_list', async (span) => {
    const includeClones = args.include_clones !== false;

    let sql = `SELECT id, name, profile_type, goal_name, goal_amount, is_active, created_at FROM profiles`;
    if (!includeClones) {
      sql += ` WHERE profile_type = 'main'`;
    }
    sql += ` ORDER BY is_active DESC, created_at DESC`;

    const rows = await query<{
      id: string;
      name: string;
      profile_type: string;
      goal_name: string | null;
      goal_amount: number | null;
      is_active: boolean;
      created_at: string;
    }>(sql);

    const profiles: ProfileSummary[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      profileType: row.profile_type,
      goalName: row.goal_name || undefined,
      goalAmount: row.goal_amount || undefined,
      isActive: row.is_active,
      createdAt: row.created_at,
    }));

    span.setAttributes({
      'profiles.count': profiles.length,
      'profiles.active_id': profiles.find((p) => p.isActive)?.id || 'none',
    });

    return {
      type: 'table',
      params: {
        title: 'Profils',
        columns: [
          { key: 'status', label: '' },
          { key: 'name', label: 'Nom' },
          { key: 'type', label: 'Type' },
          { key: 'goal', label: 'Objectif' },
        ],
        rows: profiles.map((p) => ({
          status: p.isActive ? '✓' : '',
          name: p.name,
          type: p.profileType === 'main' ? 'Principal' : 'Clone objectif',
          goal: p.goalName ? `${p.goalName} (${p.goalAmount}€)` : '-',
        })),
      },
      data: profiles,
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleSwitchProfile(args: Record<string, unknown>) {
  return trace('profile_switch', async (span) => {
    const profileId = args.profile_id as string;

    // Get simulation state for Opik tracing
    const simState = await getSimulationState();

    span.setAttributes({
      'profile.id': profileId,
      'simulation.is_simulating': simState.isSimulating,
      'simulation.offset_days': simState.offsetDays,
    });

    // Check if profile exists
    const existing = await query<{ id: string; name: string }>(
      `SELECT id, name FROM profiles WHERE id = '${profileId}'`
    );
    if (existing.length === 0) {
      return {
        type: 'text',
        params: {
          content: `Profile not found: ${profileId}`,
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    // Deactivate all, activate target
    await execute(`UPDATE profiles SET is_active = FALSE`);
    await execute(`UPDATE profiles SET is_active = TRUE WHERE id = '${profileId}'`);

    span.setAttributes({
      'profile.name': existing[0].name,
      'profile.switched': true,
    });

    return {
      type: 'text',
      params: {
        content: `Switched to profile **${existing[0].name}**`,
        markdown: true,
      },
      data: { profileId, name: existing[0].name },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleDuplicateProfileForGoal(args: Record<string, unknown>) {
  return trace('profile_duplicate_for_goal', async (span) => {
    const sourceId = args.source_profile_id as string;
    const goalName = args.goal_name as string;
    const goalAmount = args.goal_amount as number;
    const goalDeadline = args.goal_deadline as string | undefined;
    const setActive = args.set_active !== false;

    span.setAttributes({
      'profile.source_id': sourceId,
      'profile.goal_name': goalName,
      'profile.goal_amount': goalAmount,
    });

    // Load source profile
    const sourceRows = await query<ProfileRow>(`SELECT * FROM profiles WHERE id = '${sourceId}'`);
    if (sourceRows.length === 0) {
      return {
        type: 'text',
        params: {
          content: `Source profile not found: ${sourceId}`,
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const source = sourceRows[0];
    const newId = uuidv4();
    const newName = `${source.name} - ${goalName}`;

    // Deactivate all if setting as active
    if (setActive) {
      await execute(`UPDATE profiles SET is_active = FALSE`);
    }

    // Insert cloned profile (keep personal data, reset goal-specific data)
    await execute(`
      INSERT INTO profiles (
        id, name, diploma, skills, city, city_size, income_sources, expenses,
        max_work_hours_weekly, min_hourly_rate, has_loan, loan_amount,
        monthly_income, monthly_expenses, monthly_margin,
        profile_type, parent_profile_id, goal_name, goal_amount, goal_deadline,
        plan_data, followup_data, achievements, is_active
      ) VALUES (
        '${newId}',
        ${escapeSQL(newName)},
        ${escapeSQL(source.diploma)},
        ${source.skills ? `ARRAY[${source.skills.map((s) => escapeSQL(s)).join(',')}]` : 'NULL'},
        ${escapeSQL(source.city)},
        ${escapeSQL(source.city_size)},
        ${source.income_sources ? escapeSQL(source.income_sources) : 'NULL'},
        ${source.expenses ? escapeSQL(source.expenses) : 'NULL'},
        ${source.max_work_hours_weekly || 'NULL'},
        ${source.min_hourly_rate || 'NULL'},
        ${source.has_loan || false},
        ${source.loan_amount || 'NULL'},
        ${source.monthly_income || 0},
        ${source.monthly_expenses || 0},
        ${source.monthly_margin || 0},
        'goal-clone',
        '${sourceId}',
        ${escapeSQL(goalName)},
        ${goalAmount},
        ${goalDeadline ? escapeSQL(goalDeadline) : 'NULL'},
        NULL,
        NULL,
        NULL,
        ${setActive}
      )
    `);

    span.setAttributes({
      'profile.new_id': newId,
      'profile.duplicated': true,
    });

    return {
      type: 'text',
      params: {
        content: `Profile duplicated for goal **${goalName}**.\nNew profile: **${newName}**${setActive ? ' (now active)' : ''}`,
        markdown: true,
      },
      data: {
        profileId: newId,
        name: newName,
        goalName,
        goalAmount,
        isActive: setActive,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}

async function handleDeleteProfile(args: Record<string, unknown>) {
  return trace('profile_delete', async (span) => {
    const profileId = args.profile_id as string;
    const confirm = args.confirm as boolean;

    span.setAttributes({
      'profile.id': profileId,
      'profile.confirm': confirm,
    });

    if (!confirm) {
      return {
        type: 'text',
        params: {
          content: 'Deletion requires confirmation. Set `confirm: true` to proceed.',
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    // Check profile count
    const count = await query<{ count: number }>(`SELECT COUNT(*) as count FROM profiles`);
    if (count[0].count <= 1) {
      return {
        type: 'text',
        params: {
          content: 'Cannot delete the last profile. Create another profile first.',
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    // Get profile info before deletion
    const profile = await query<{ name: string; is_active: boolean }>(
      `SELECT name, is_active FROM profiles WHERE id = '${profileId}'`
    );
    if (profile.length === 0) {
      return {
        type: 'text',
        params: {
          content: `Profile not found: ${profileId}`,
          markdown: true,
        },
        metadata: { traceId: getCurrentTraceId() },
      };
    }

    const wasActive = profile[0].is_active;
    const deletedName = profile[0].name;

    // Delete profile
    await execute(`DELETE FROM profiles WHERE id = '${profileId}'`);

    // If deleted profile was active, activate another one
    if (wasActive) {
      await execute(
        `UPDATE profiles SET is_active = TRUE WHERE id = (SELECT id FROM profiles LIMIT 1)`
      );
    }

    span.setAttributes({
      'profile.deleted': true,
      'profile.name': deletedName,
    });

    return {
      type: 'text',
      params: {
        content: `Profile **${deletedName}** deleted.${wasActive ? ' A new profile has been activated.' : ''}`,
        markdown: true,
      },
      metadata: { traceId: getCurrentTraceId() },
    };
  });
}
