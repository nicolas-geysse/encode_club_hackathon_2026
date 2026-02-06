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
       WHERE user_id = '${profileId}'
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
    // Check if inventory table exists (frontend creates it as inventory_items)
    const tables = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'inventory_items'`
    );
    if (tables.length === 0) {
      return [];
    }

    const rows = await query<InventoryRow>(
      `SELECT id, name, estimated_value, category
       FROM inventory_items
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
    const rows = await query<{ energy_level: number }>(
      `SELECT energy_level
       FROM energy_logs
       WHERE user_id = '${profileId}'
       ORDER BY log_date DESC
       LIMIT ${weeks}`
    );
    // Return in chronological order
    return rows.map((r) => r.energy_level).reverse();
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
 * Skill-to-Job match type
 */
interface SkillJobMatch {
  skill: string;
  jobTitle: string;
  hourlyRate: number;
  relevanceScore: number;
  platform?: string;
}

/**
 * Load skill-job matches using SQL (fallback for DuckPGQ)
 * This simulates graph traversal using standard SQL joins
 */
async function loadSkillJobMatches(profileId: string, skills: string[]): Promise<SkillJobMatch[]> {
  if (skills.length === 0) return [];

  try {
    // Try to load from skills table with job matching
    // This is a SQL-based fallback for DuckPGQ graph queries
    const skillsTable = await query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'skills'`
    );

    if (skillsTable.length > 0) {
      // Load skills with their job associations if available
      const skillRows = await query<{
        name: string;
        hourly_rate?: number;
        market_demand?: number;
      }>(
        `SELECT name, hourly_rate, market_demand
         FROM skills
         WHERE profile_id = '${profileId}'
         AND name IN (${skills.map((s) => `'${s}'`).join(', ')})`
      );

      // Generate matches based on skill data
      // In a real DuckPGQ implementation, this would traverse the graph
      return skillRows.map((skill) => ({
        skill: skill.name,
        jobTitle: getJobSuggestionForSkill(skill.name),
        hourlyRate: skill.hourly_rate || estimateHourlyRate(skill.name),
        relevanceScore: skill.market_demand ? skill.market_demand / 5 : 0.7,
        platform: getPlatformForSkill(skill.name),
      }));
    }

    // Fallback: generate suggestions from skill names
    return skills.map((skill) => ({
      skill,
      jobTitle: getJobSuggestionForSkill(skill),
      hourlyRate: estimateHourlyRate(skill),
      relevanceScore: 0.6,
      platform: getPlatformForSkill(skill),
    }));
  } catch (error) {
    logger.warn('Failed to load skill-job matches', { profileId, error });
    return skills.map((skill) => ({
      skill,
      jobTitle: getJobSuggestionForSkill(skill),
      hourlyRate: estimateHourlyRate(skill),
      relevanceScore: 0.5,
    }));
  }
}

/**
 * Get job suggestion based on skill name
 * This is a knowledge-based fallback for graph queries
 */
function getJobSuggestionForSkill(skill: string): string {
  const skillLower = skill.toLowerCase();
  const suggestions: Record<string, string> = {
    python: 'Freelance Developer',
    javascript: 'Web Developer',
    react: 'Frontend Developer',
    sql: 'Data Analyst',
    excel: 'Data Entry',
    writing: 'Content Writer',
    english: 'English Tutor',
    math: 'Math Tutor',
    design: 'Graphic Designer',
    social_media: 'Community Manager',
    marketing: 'Digital Marketing',
    photography: 'Freelance Photographer',
    video: 'Video Editor',
    music: 'Music Teacher',
  };

  for (const [key, job] of Object.entries(suggestions)) {
    if (skillLower.includes(key)) return job;
  }
  return 'Freelance Work';
}

/**
 * Estimate hourly rate based on skill
 */
function estimateHourlyRate(skill: string): number {
  const skillLower = skill.toLowerCase();
  const rates: Record<string, number> = {
    python: 25,
    javascript: 25,
    react: 28,
    sql: 22,
    design: 20,
    writing: 18,
    english: 20,
    math: 20,
  };

  for (const [key, rate] of Object.entries(rates)) {
    if (skillLower.includes(key)) return rate;
  }
  return 15; // Default rate
}

/**
 * Get platform suggestion for skill
 */
function getPlatformForSkill(skill: string): string {
  const skillLower = skill.toLowerCase();
  if (skillLower.includes('python') || skillLower.includes('javascript')) {
    return 'Upwork, Fiverr, Toptal';
  }
  if (skillLower.includes('writing') || skillLower.includes('english')) {
    return 'Upwork, Contently';
  }
  if (skillLower.includes('tutor') || skillLower.includes('math')) {
    return 'Wyzant, Tutor.com';
  }
  return 'LinkedIn, Indeed';
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
      const skills = parseSkills(profile || ({} as ProfileRow));
      const skillNames = skills.map((s) => s.name);

      // Load leads and skill-job matches in parallel
      const [leads, skillJobMatches] = await Promise.all([
        loadLeads(profileId),
        loadSkillJobMatches(profileId, skillNames),
      ]);

      context.jobs = {
        skills,
        leads: leads.map((l) => ({
          id: l.id,
          status: l.status,
          title: l.title,
        })),
        city: profile?.city,
        // Add skill-job graph data (SQL fallback for DuckPGQ)
        skillJobGraph: skillJobMatches,
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
