/**
 * Onboarding Persistence Module
 *
 * Extracts data persistence logic from OnboardingChat.tsx for better maintainability.
 * Handles persisting extracted onboarding data to dedicated database tables.
 */

import { skillService } from '~/lib/skillService';
import { lifestyleService } from '~/lib/lifestyleService';
import { inventoryService } from '~/lib/inventoryService';
import { incomeService } from '~/lib/incomeService';
import { tradeService } from '~/lib/tradeService';
import { createLogger } from '~/lib/logger';
import { eventBus } from '~/lib/eventBus';
import { simulationService } from '~/lib/simulationService';
import { getSkillDefaults } from '~/lib/data/skillRegistry';

const logger = createLogger('OnboardingPersistence');

// Types matching retroplan API
export type AcademicEventType =
  | 'exam_period'
  | 'class_intensive'
  | 'vacation'
  | 'vacation_rest'
  | 'vacation_available'
  | 'internship'
  | 'project_deadline';

export interface AcademicEvent {
  name: string;
  type: AcademicEventType;
  startDate?: string;
  endDate?: string;
}

export interface InventoryItem {
  name: string;
  category: string;
  estimatedValue?: number;
}

export interface Subscription {
  name: string;
  currentCost: number;
}

export interface TradeOpportunity {
  type: 'borrow' | 'lend' | 'trade' | 'sell' | 'cut';
  description: string;
  withPerson?: string;
  forWhat?: string;
  estimatedValue?: number;
}

export interface IncomeSource {
  source: string;
  amount: number;
}

export interface ExpenseItem {
  category: string;
  amount: number;
}

export interface GoalData {
  name: string;
  amount: number;
  deadline?: string;
  academicEvents?: AcademicEvent[];
}

export interface PersistResult {
  success: boolean;
  failures: string[];
}

/**
 * Default profile values used when resetting profile state.
 * Centralizes the default values to avoid duplication across multiple reset functions.
 */
export const DEFAULT_PROFILE = {
  skills: [] as string[],
  certifications: [] as string[],
  incomes: [] as IncomeSource[],
  expenses: [] as ExpenseItem[],
  maxWorkHours: 15,
  minHourlyRate: 12,
  hasLoan: false,
  loanAmount: 0,
  academicEvents: [] as AcademicEvent[],
  inventoryItems: [] as InventoryItem[],
  subscriptions: [] as Subscription[],
  tradeOpportunities: [] as TradeOpportunity[],
  swipePreferences: {
    effort_sensitivity: 0.5,
    hourly_rate_priority: 0.5,
    time_flexibility: 0.5,
    income_stability: 0.5,
  },
};

/**
 * Persist goal data to the goals table.
 * Sprint 9.5: Archives (status='paused') existing active goals instead of deleting.
 * This preserves goal history while enforcing single active goal policy.
 *
 * BUG FIX: Now checks for existing goals with same name+amount to avoid duplicates.
 * If found, reactivates the existing goal instead of creating a new one.
 */
export async function persistGoal(profileId: string, goalData: GoalData): Promise<boolean> {
  try {
    // Fetch ALL goals (any status) to check for duplicates
    const allGoalsResponse = await fetch(`/api/goals?profileId=${profileId}`);
    let allGoals: Array<{ id: string; name: string; amount: number; status: string }> = [];
    if (allGoalsResponse.ok) {
      allGoals = await allGoalsResponse.json();
    }

    // Check if an identical goal already exists (same name and amount)
    const identicalGoal = allGoals.find(
      (g) => g.name === goalData.name && g.amount === goalData.amount
    );

    if (identicalGoal) {
      // Reactivate the existing goal instead of creating a duplicate
      logger.info('Found identical goal, reactivating instead of creating duplicate', {
        goalId: identicalGoal.id,
        name: goalData.name,
        amount: goalData.amount,
      });

      // First, pause any OTHER active goals (not the identical one)
      const otherActiveGoals = allGoals.filter(
        (g) => g.status === 'active' && g.id !== identicalGoal.id
      );
      for (const goal of otherActiveGoals) {
        await fetch('/api/goals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: goal.id, status: 'paused' }),
        });
      }

      // Build planData with academicEvents (same logic as new goal creation)
      const reactivatePlanData: Record<string, unknown> = {};
      if (goalData.academicEvents && goalData.academicEvents.length > 0) {
        reactivatePlanData.academicEvents = goalData.academicEvents.map((event) => ({
          id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: event.type || 'exam_period',
          name: event.name || 'Exam',
          startDate: event.startDate,
          endDate: event.endDate || event.startDate,
        }));
      }

      // Reactivate the identical goal (update deadline + planData with academicEvents)
      await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: identicalGoal.id,
          status: 'active',
          deadline: goalData.deadline || null,
          ...(Object.keys(reactivatePlanData).length > 0 ? { planData: reactivatePlanData } : {}),
        }),
      });

      return true; // Exit early - no new goal needed
    }

    // No identical goal found - archive existing active goals and create new one
    const activeGoals = allGoals.filter((g) => g.status === 'active');
    for (const goal of activeGoals) {
      await fetch('/api/goals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: goal.id, status: 'paused' }),
      });
    }

    // Build planData with academicEvents if available
    const goalPlanData: Record<string, unknown> = {};
    if (goalData.academicEvents && goalData.academicEvents.length > 0) {
      goalPlanData.academicEvents = goalData.academicEvents.map((event) => ({
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: event.type || 'exam_period',
        name: event.name || 'Exam',
        startDate: event.startDate,
        endDate: event.endDate || event.startDate,
      }));
    }

    // Sprint 13.13: Use simulated date so Week 1 Day 1 starts immediately
    // This ensures consistency with currentDate() used in /suivi
    // If simulation has an offset, using real date would cause Day mismatch
    const simState = await simulationService.getSimulationState();
    // Sprint 13.15: Handle both YYYY-MM-DD and ISO strings safely to avoid "000ZT000Z" error
    const datePart = simState.simulatedDate.split('T')[0];
    const createdAt = `${datePart}T00:00:00.000Z`;

    // Create the new goal with planData
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileId,
        name: goalData.name,
        amount: goalData.amount,
        deadline: goalData.deadline || null,
        priority: 1,
        status: 'active',
        planData: Object.keys(goalPlanData).length > 0 ? goalPlanData : undefined,
        createdAt,
      }),
    });

    // Sprint 13.12: Validate response status - don't silently fail
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Failed to create goal', { status: response.status, error: errorText });
      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to persist goal', { error });
    return false;
  }
}

/**
 * Persist skills to the skills table.
 *
 * Now uses the Unified Skill Registry to get complete attributes
 * (marketDemand, cognitiveEffort, restNeeded) for each skill.
 * This ensures skills created during onboarding have proper arbitrage scores.
 */
export async function persistSkills(
  profileId: string,
  skills: string[],
  defaultHourlyRate: number = 15
): Promise<boolean> {
  if (!skills || skills.length === 0) return true;

  try {
    await skillService.bulkCreateSkills(
      profileId,
      skills.map((name) => {
        // Look up skill defaults from the Unified Registry
        const defaults = getSkillDefaults(name);
        return {
          name,
          level: 'intermediate' as const,
          // Use provided rate if higher, otherwise use registry default
          hourlyRate: Math.max(defaultHourlyRate, defaults.defaultHourlyRate),
          // Include all attributes for proper arbitrage scoring
          marketDemand: defaults.marketDemand,
          cognitiveEffort: defaults.cognitiveEffort,
          restNeeded: defaults.restNeeded,
        };
      })
    );
    logger.info('Skills persisted with registry attributes', {
      count: skills.length,
      skills: skills.slice(0, 3), // Log first 3 for debugging
    });
    return true;
  } catch (error) {
    logger.error('Failed to persist skills', { error });
    return false;
  }
}

/**
 * Persist inventory items to the inventory table.
 */
export async function persistInventory(
  profileId: string,
  items: InventoryItem[]
): Promise<boolean> {
  if (!items || items.length === 0) return true;

  try {
    await inventoryService.bulkCreateItems(
      profileId,
      items.map((item) => ({
        name: item.name,
        category:
          (item.category as
            | 'electronics'
            | 'clothing'
            | 'books'
            | 'furniture'
            | 'sports'
            | 'other') || 'other',
        estimatedValue: item.estimatedValue || 50,
      }))
    );
    return true;
  } catch (error) {
    logger.error('Failed to persist inventory', { error });
    return false;
  }
}

/**
 * Persist expenses AND subscriptions to the lifestyle table in a single operation.
 * Combines both into one bulkCreateItems call to avoid the race condition
 * where parallel clears wipe each other's data.
 */
export async function persistLifestyle(
  profileId: string,
  expenses?: ExpenseItem[],
  subscriptions?: Subscription[]
): Promise<boolean> {
  const hasExpenses = expenses && expenses.length > 0;
  const hasSubscriptions = subscriptions && subscriptions.length > 0;
  if (!hasExpenses && !hasSubscriptions) return true;

  try {
    const categoryNames: Record<string, string> = {
      rent: 'Rent',
      housing: 'Rent',
      food: 'Food & Groceries',
      transport: 'Transport',
      subscriptions: 'Subscriptions',
      other: 'Other expenses',
    };

    const items: Array<{
      name: string;
      category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
      currentCost: number;
    }> = [];

    // Add expense categories (filtering out aggregate "subscriptions" if individual subs exist)
    if (hasExpenses) {
      let subscriptionAdjustment = 0;
      if (hasSubscriptions) {
        const originalSubsAllocation =
          expenses!.find((e) => e.category === 'subscriptions')?.amount || 0;
        const actualSubsTotal = subscriptions!.reduce((sum, s) => sum + (s.currentCost ?? 10), 0);
        subscriptionAdjustment = originalSubsAllocation - actualSubsTotal;
      }

      for (const exp of expenses!) {
        if (hasSubscriptions && exp.category === 'subscriptions') continue;
        items.push({
          name: categoryNames[exp.category] || exp.category,
          category: (exp.category === 'rent' ? 'housing' : exp.category) as
            | 'housing'
            | 'food'
            | 'transport'
            | 'subscriptions'
            | 'other',
          currentCost: exp.category === 'other' ? exp.amount + subscriptionAdjustment : exp.amount,
        });
      }
    }

    // Add individual subscriptions
    if (hasSubscriptions) {
      for (const sub of subscriptions!) {
        items.push({
          name: sub.name,
          category: 'subscriptions',
          currentCost: sub.currentCost ?? 10,
        });
      }
    }

    // Single bulkCreateItems call: clears once, creates all items
    await lifestyleService.bulkCreateItems(profileId, items);
    return true;
  } catch (error) {
    logger.error('Failed to persist lifestyle items', { error });
    return false;
  }
}

/**
 * Persist income items to the income table.
 */
export async function persistIncome(profileId: string, incomes: IncomeSource[]): Promise<boolean> {
  if (!incomes || incomes.length === 0) return true;

  try {
    await incomeService.bulkCreateItems(
      profileId,
      incomes.map((inc) => ({
        name: inc.source === 'total' ? 'Monthly income' : inc.source,
        amount: inc.amount,
      }))
    );
    return true;
  } catch (error) {
    logger.error('Failed to persist income', { error });
    return false;
  }
}

/**
 * Persist trade opportunities to the trades table.
 */
export async function persistTrades(
  profileId: string,
  trades: TradeOpportunity[]
): Promise<boolean> {
  if (!trades || trades.length === 0) return true;

  try {
    // Sprint 13.17: Filter out invalid trades and provide fallbacks
    // The API requires name and partner to be non-empty strings
    const validTrades = trades
      .filter((trade) => {
        // Must have at least a description or forWhat to create a meaningful trade
        const hasContent = trade.description || trade.forWhat;
        if (!hasContent) {
          logger.warn('Skipping trade with no description', { trade });
        }
        return hasContent;
      })
      .map((trade) => ({
        type: trade.type === 'cut' ? 'sell' : trade.type,
        // Use description, fallback to forWhat, or generate from type
        name: trade.description || trade.forWhat || `${trade.type} opportunity`,
        partner: trade.withPerson || 'To be determined',
        value: trade.estimatedValue ?? 0,
        description: trade.forWhat,
        status: 'pending' as const,
      }));

    if (validTrades.length === 0) {
      logger.info('No valid trades to persist after filtering');
      return true;
    }

    await tradeService.bulkCreateTrades(profileId, validTrades);
    return true;
  } catch (error) {
    logger.error('Failed to persist trades', { error });
    return false;
  }
}

/**
 * Persist academic events to the dedicated academic_events DB table.
 * This ensures retroplan and other features can read events from the table,
 * not just from the goal's planData JSON field.
 */
export async function persistAcademicEvents(
  profileId: string,
  events: AcademicEvent[]
): Promise<boolean> {
  if (!events || events.length === 0) return true;

  try {
    for (const event of events) {
      if (!event.name || !event.startDate) continue;
      await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_academic_event',
          userId: profileId,
          type: event.type || 'exam_period',
          name: event.name,
          startDate: event.startDate,
          endDate: event.endDate || event.startDate,
        }),
      });
    }
    logger.info('Academic events persisted to DB table', { count: events.length });
    return true;
  } catch (error) {
    logger.error('Failed to persist academic events', { error });
    return false;
  }
}

/**
 * Persist all onboarding data in parallel.
 * Returns a result indicating success and any failures.
 */
export async function persistAllOnboardingData(
  profileId: string,
  data: {
    goal?: GoalData;
    skills?: string[];
    inventoryItems?: InventoryItem[];
    expenses?: ExpenseItem[];
    subscriptions?: Subscription[];
    incomes?: IncomeSource[];
    tradeOpportunities?: TradeOpportunity[];
    minHourlyRate?: number;
  }
): Promise<PersistResult> {
  const tasks: { name: string; promise: Promise<boolean> }[] = [];

  // Goal
  if (data.goal && data.goal.name && data.goal.amount) {
    tasks.push({
      name: 'goal',
      promise: persistGoal(profileId, data.goal),
    });
  }

  // Academic Events → dedicated table (separate from goal.planData)
  if (data.goal?.academicEvents && data.goal.academicEvents.length > 0) {
    tasks.push({
      name: 'academicEvents',
      promise: persistAcademicEvents(profileId, data.goal.academicEvents),
    });
  }

  // Skills
  if (data.skills && data.skills.length > 0) {
    tasks.push({
      name: 'skills',
      promise: persistSkills(profileId, data.skills, data.minHourlyRate),
    });
  }

  // Inventory
  if (data.inventoryItems && data.inventoryItems.length > 0) {
    tasks.push({
      name: 'inventory',
      promise: persistInventory(profileId, data.inventoryItems),
    });
  }

  // Lifestyle (expenses + subscriptions combined to avoid race condition)
  const hasExpenses = data.expenses && data.expenses.length > 0;
  const hasSubscriptions = data.subscriptions && data.subscriptions.length > 0;
  if (hasExpenses || hasSubscriptions) {
    tasks.push({
      name: 'lifestyle',
      promise: persistLifestyle(profileId, data.expenses, data.subscriptions),
    });
  }

  // Income
  if (data.incomes && data.incomes.length > 0) {
    tasks.push({
      name: 'income',
      promise: persistIncome(profileId, data.incomes),
    });
  }

  // Trades
  if (data.tradeOpportunities && data.tradeOpportunities.length > 0) {
    tasks.push({
      name: 'trades',
      promise: persistTrades(profileId, data.tradeOpportunities),
    });
  }

  // Execute all in parallel
  const failures: string[] = [];
  if (tasks.length > 0) {
    const results = await Promise.allSettled(tasks.map((t) => t.promise));
    results.forEach((result, index) => {
      if (result.status === 'rejected' || (result.status === 'fulfilled' && !result.value)) {
        failures.push(tasks[index].name);
      }
    });

    // If at least one persistence task succeeded, notify the app via EventBus
    if (failures.length < tasks.length) {
      eventBus.emit('DATA_CHANGED');
    }
  }

  return {
    success: failures.length === 0,
    failures,
  };
}

/**
 * Verify if a profile exists in the database.
 * Used to check if profile was saved to DB (not just localStorage).
 */
export async function verifyProfileInDb(profileId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/profiles?id=${profileId}`);
    return response.ok && !!(await response.json())?.id;
  } catch {
    return false;
  }
}

/**
 * Clear all related data for a profile.
 * Used when resetting or restarting onboarding.
 */
export async function clearProfileData(profileId: string): Promise<void> {
  try {
    await Promise.all([
      fetch(`/api/goals?profileId=${profileId}`, { method: 'DELETE' }),
      fetch(`/api/skills?profileId=${profileId}`, { method: 'DELETE' }),
      fetch(`/api/inventory?profileId=${profileId}`, { method: 'DELETE' }),
      fetch(`/api/lifestyle?profileId=${profileId}`, { method: 'DELETE' }),
      fetch(`/api/income?profileId=${profileId}`, { method: 'DELETE' }),
      fetch(`/api/trades?profileId=${profileId}`, { method: 'DELETE' }),
    ]);
  } catch (error) {
    logger.warn('Failed to clear some profile data', { error });
  }
}
