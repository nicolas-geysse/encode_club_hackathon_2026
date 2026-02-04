/**
 * Tab Context Service
 *
 * Loads context data from DuckDB for each tab type.
 * Provides graceful fallback if DuckPGQ is unavailable.
 */

import { query } from './duckdb.js';
import { createLogger } from './logger.js';
import type { TabType, TabContext } from '../agents/strategies/types.js';

const logger = createLogger('TabContextService');

// Profile row type from DuckDB
interface ProfileRow {
  id: string;
  name?: string;
  diploma?: string;
  field?: string;
  city?: string;
  skills?: string[];
  monthly_income?: number;
  monthly_expenses?: number;
  current_energy?: number;
  max_work_hours_weekly?: number;
  min_hourly_rate?: number;
  plan_data?: string | Record<string, unknown>;
  achievements?: string | Record<string, unknown>[];
}

// Goal row type
interface GoalRow {
  id: string;
  name: string;
  amount: number;
  deadline?: string;
  progress?: number;
  status?: string;
}

// Inventory item type
interface InventoryRow {
  id: string;
  name: string;
  estimated_value?: number;
  category?: string;
}

// Trade row type
interface TradeRow {
  id: string;
  type: string;
  name: string;
  value?: number;
  status: string;
}

// Lead row type
interface LeadRow {
  id: string;
  status: string;
  title?: string;
  company?: string;
}

/**
 * Load basic profile data
 */
async function loadProfile(profileId: string): Promise<ProfileRow | null> {
  try {
    const rows = await query<ProfileRow>(
      `SELECT * FROM profiles WHERE id = '${profileId}' LIMIT 1`
    );
    return rows[0] || null;
  } catch (error) {
    logger.warn('Failed to load profile', { profileId, error });
    return null;
  }
}

/**
 * Load goals for a profile
 */
async function loadGoals(profileId: string): Promise<GoalRow[]> {
  try {
    const rows = await query<GoalRow>(
      `SELECT id, name, amount, deadline, progress, status
       FROM goals
       WHERE profile_id = '${profileId}'
       ORDER BY created_at DESC`
    );
    return rows;
  } catch (error) {
    logger.warn('Failed to load goals', { profileId, error });
    return [];
  }
}

/**
 * Load inventory items for a profile
 */
async function loadInventory(profileId: string): Promise<InventoryRow[]> {
  try {
    // Check if inventory table exists
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'inventory'`
    );
    if (tables.length === 0) {
      return [];
    }

    const rows = await query<InventoryRow>(
      `SELECT id, name, estimated_value, category
       FROM inventory
       WHERE profile_id = '${profileId}'`
    );
    return rows;
  } catch (error) {
    logger.warn('Failed to load inventory', { profileId, error });
    return [];
  }
}

/**
 * Load trades for a profile
 */
async function loadTrades(profileId: string): Promise<TradeRow[]> {
  try {
    // Check if trades table exists
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'trades'`
    );
    if (tables.length === 0) {
      return [];
    }

    const rows = await query<TradeRow>(
      `SELECT id, type, name, value, status
       FROM trades
       WHERE profile_id = '${profileId}'`
    );
    return rows;
  } catch (error) {
    logger.warn('Failed to load trades', { profileId, error });
    return [];
  }
}

/**
 * Load leads for a profile
 */
async function loadLeads(profileId: string): Promise<LeadRow[]> {
  try {
    // Check if leads table exists
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'leads'`
    );
    if (tables.length === 0) {
      return [];
    }

    const rows = await query<LeadRow>(
      `SELECT id, status, title, company
       FROM leads
       WHERE profile_id = '${profileId}'`
    );
    return rows;
  } catch (error) {
    logger.warn('Failed to load leads', { profileId, error });
    return [];
  }
}

/**
 * Load energy history for a profile
 */
async function loadEnergyHistory(profileId: string, weeks = 8): Promise<number[]> {
  try {
    const rows = await query<{ level: number }>(
      `SELECT level
       FROM energy_logs
       WHERE profile_id = '${profileId}'
       ORDER BY week_number DESC
       LIMIT ${weeks}`
    );
    // Return in chronological order
    return rows.map((r) => r.level).reverse();
  } catch (error) {
    logger.warn('Failed to load energy history', { profileId, error });
    return [];
  }
}

/**
 * Parse skills from profile data
 * Skills can be stored as string[], JSON string, or objects
 */
function parseSkills(profile: ProfileRow): Array<{
  name: string;
  hourlyRate?: number;
  arbitrageScore?: number;
  marketDemand?: number;
}> {
  if (!profile.skills) return [];

  try {
    // If it's already an array of strings
    if (Array.isArray(profile.skills)) {
      return profile.skills.map((s) => {
        if (typeof s === 'string') {
          return { name: s };
        }
        // If it's an object with potential skill properties
        if (typeof s === 'object' && s !== null) {
          const skillObj = s as Record<string, unknown>;
          return {
            name: typeof skillObj.name === 'string' ? skillObj.name : String(s),
            hourlyRate: typeof skillObj.hourlyRate === 'number' ? skillObj.hourlyRate : undefined,
            arbitrageScore:
              typeof skillObj.arbitrageScore === 'number' ? skillObj.arbitrageScore : undefined,
            marketDemand:
              typeof skillObj.marketDemand === 'number' ? skillObj.marketDemand : undefined,
          };
        }
        return { name: String(s) };
      });
    }

    return [];
  } catch {
    return [];
  }
}

/**
 * Load context for a specific tab type
 */
export async function loadTabContext(profileId: string, tabType: TabType): Promise<TabContext> {
  logger.debug('Loading tab context', { profileId, tabType });

  // Always load basic profile
  const profile = await loadProfile(profileId);

  // Base context
  const context: TabContext = {
    profileId,
    tabType,
    currentEnergy: profile?.current_energy,
    monthlyMargin:
      profile?.monthly_income !== undefined && profile?.monthly_expenses !== undefined
        ? profile.monthly_income - profile.monthly_expenses
        : undefined,
  };

  // Load tab-specific data
  switch (tabType) {
    case 'profile': {
      const skills = parseSkills(profile || ({} as ProfileRow));
      context.profile = {
        name: profile?.name,
        diploma: profile?.diploma,
        field: profile?.field,
        city: profile?.city,
        skills: skills.map((s) => s.name),
        certifications: [], // Would load from certifications table
        maxWorkHoursWeekly: profile?.max_work_hours_weekly,
        minHourlyRate: profile?.min_hourly_rate,
      };
      break;
    }

    case 'goals': {
      const goals = await loadGoals(profileId);
      context.goals = goals.map((g) => ({
        id: g.id,
        name: g.name,
        amount: g.amount,
        deadline: g.deadline,
        progress: g.progress,
        status: g.status,
      }));
      context.profile = { name: profile?.name };
      break;
    }

    case 'budget': {
      context.budget = {
        monthlyIncome: profile?.monthly_income,
        monthlyExpenses: profile?.monthly_expenses,
        expenses: [], // Would load from expenses table
      };
      context.profile = { name: profile?.name };
      break;
    }

    case 'trade': {
      const [inventory, trades] = await Promise.all([
        loadInventory(profileId),
        loadTrades(profileId),
      ]);
      context.trade = {
        inventory: inventory.map((i) => ({
          name: i.name,
          estimatedValue: i.estimated_value,
        })),
        trades: trades.map((t) => ({
          type: t.type,
          name: t.name,
          value: t.value,
          status: t.status,
        })),
      };
      context.profile = { name: profile?.name };
      break;
    }

    case 'jobs': {
      const [skills, leads] = await Promise.all([
        Promise.resolve(parseSkills(profile || ({} as ProfileRow))),
        loadLeads(profileId),
      ]);
      context.jobs = {
        skills,
        leads: leads.map((l) => ({
          id: l.id,
          status: l.status,
          title: l.title,
        })),
        city: profile?.city,
      };
      context.profile = {
        name: profile?.name,
        maxWorkHoursWeekly: profile?.max_work_hours_weekly,
        minHourlyRate: profile?.min_hourly_rate,
      };
      break;
    }

    case 'swipe': {
      const skills = parseSkills(profile || ({} as ProfileRow));
      // Parse swipe preferences from plan_data
      let preferences: TabContext['swipe'] = { preferences: {}, scenariosCount: 0 };
      try {
        const planData =
          typeof profile?.plan_data === 'string'
            ? JSON.parse(profile.plan_data)
            : profile?.plan_data;
        if (planData?.swipePreferences) {
          preferences = {
            preferences: planData.swipePreferences,
            scenariosCount: planData.scenariosCount || 0,
          };
        }
      } catch {
        // Use defaults
      }
      context.swipe = preferences;
      context.profile = {
        name: profile?.name,
        skills: skills.map((s) => s.name),
      };
      break;
    }
  }

  // Load energy history for all tabs (useful for context)
  context.energyHistory = await loadEnergyHistory(profileId);

  logger.debug('Tab context loaded', {
    profileId,
    tabType,
    hasProfile: !!profile,
    contextKeys: Object.keys(context),
  });

  return context;
}

/**
 * Merge API-provided context with DB-loaded context
 * API context takes precedence (more recent data)
 */
export function mergeContext(dbContext: TabContext, apiContext: Partial<TabContext>): TabContext {
  return {
    ...dbContext,
    ...apiContext,
    profile: {
      ...dbContext.profile,
      ...apiContext.profile,
    },
    goals: apiContext.goals ?? dbContext.goals,
    budget: {
      ...dbContext.budget,
      ...apiContext.budget,
    },
    trade: {
      ...dbContext.trade,
      ...apiContext.trade,
    },
    jobs: {
      ...dbContext.jobs,
      ...apiContext.jobs,
    },
    swipe: {
      ...dbContext.swipe,
      ...apiContext.swipe,
    },
  };
}
