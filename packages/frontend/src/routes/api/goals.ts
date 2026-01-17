/* eslint-disable no-console */
/**
 * Goals API Route
 *
 * Handles goal CRUD operations using DuckDB.
 * Goals are now separate from profiles, supporting:
 * - Multiple goals per profile
 * - Conditional goals (dependent on parent completion/date)
 * - Goal components (sub-tasks like "Code" and "Driving lessons" for a Driver's License goal)
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, escapeSQL } from './_db';

// Schema initialization flag (persists across requests in same process)
let goalsSchemaInitialized = false;

// Initialize goals schema if needed
async function ensureGoalsSchema(): Promise<void> {
  if (goalsSchemaInitialized) return;

  try {
    // Create goals table
    await execute(`
      CREATE TABLE IF NOT EXISTS goals (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        amount DECIMAL NOT NULL,
        deadline DATE,
        priority INTEGER DEFAULT 1,
        parent_goal_id VARCHAR,
        condition_type VARCHAR DEFAULT 'none',
        status VARCHAR DEFAULT 'active',
        progress DECIMAL DEFAULT 0,
        plan_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create goal_components table
    await execute(`
      CREATE TABLE IF NOT EXISTS goal_components (
        id VARCHAR PRIMARY KEY,
        goal_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        type VARCHAR DEFAULT 'other',
        estimated_hours DECIMAL,
        estimated_cost DECIMAL,
        status VARCHAR DEFAULT 'pending',
        completed_at TIMESTAMP,
        depends_on JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    goalsSchemaInitialized = true;
    console.log('[Goals] Schema initialized');
  } catch (error) {
    // Tables might already exist, mark as initialized anyway
    console.log('[Goals] Schema init note:', error);
    goalsSchemaInitialized = true;
  }
}

// Goal type from DB
interface GoalRow {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  deadline: string | null;
  priority: number;
  parent_goal_id: string | null;
  condition_type: string;
  status: string;
  progress: number;
  plan_data: string | null;
  created_at: string;
  updated_at: string;
}

// Goal component type from DB
interface GoalComponentRow {
  id: string;
  goal_id: string;
  name: string;
  type: string;
  estimated_hours: number | null;
  estimated_cost: number | null;
  status: string;
  completed_at: string | null;
  depends_on: string | null;
  created_at: string;
}

// Public Goal type
export interface Goal {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  deadline?: string;
  priority: number;
  parentGoalId?: string;
  conditionType: 'none' | 'after_completion' | 'after_date';
  status: 'active' | 'waiting' | 'completed' | 'paused';
  progress: number;
  planData?: Record<string, unknown>;
  components?: GoalComponent[];
  createdAt?: string;
  updatedAt?: string;
}

// Public GoalComponent type
export interface GoalComponent {
  id: string;
  goalId: string;
  name: string;
  type: 'exam' | 'time_allocation' | 'purchase' | 'milestone' | 'other';
  estimatedHours?: number;
  estimatedCost?: number;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  dependsOn?: string[];
  createdAt?: string;
}

function rowToGoal(row: GoalRow, components?: GoalComponent[]): Goal {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    amount: row.amount,
    deadline: row.deadline || undefined,
    priority: row.priority,
    parentGoalId: row.parent_goal_id || undefined,
    conditionType: (row.condition_type || 'none') as Goal['conditionType'],
    status: (row.status || 'active') as Goal['status'],
    progress: row.progress || 0,
    planData: row.plan_data ? JSON.parse(row.plan_data) : undefined,
    components,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToComponent(row: GoalComponentRow): GoalComponent {
  return {
    id: row.id,
    goalId: row.goal_id,
    name: row.name,
    type: (row.type || 'other') as GoalComponent['type'],
    estimatedHours: row.estimated_hours || undefined,
    estimatedCost: row.estimated_cost || undefined,
    status: (row.status || 'pending') as GoalComponent['status'],
    completedAt: row.completed_at || undefined,
    dependsOn: row.depends_on ? JSON.parse(row.depends_on) : undefined,
    createdAt: row.created_at,
  };
}

// GET: List goals for a profile or get specific goal
export async function GET(event: APIEvent) {
  try {
    await ensureGoalsSchema();

    const url = new URL(event.request.url);
    const goalId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');
    const status = url.searchParams.get('status'); // 'active', 'waiting', 'completed', 'all'

    if (goalId) {
      // Get specific goal with components
      const escapedGoalId = escapeSQL(goalId);
      const goalRows = await query<GoalRow>(`SELECT * FROM goals WHERE id = ${escapedGoalId}`);

      if (goalRows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Get components for this goal
      const componentRows = await query<GoalComponentRow>(
        `SELECT * FROM goal_components WHERE goal_id = ${escapedGoalId} ORDER BY created_at ASC`
      );

      const components = componentRows.map(rowToComponent);
      const goal = rowToGoal(goalRows[0], components);

      return new Response(JSON.stringify(goal), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (profileId) {
      // List goals for profile
      const escapedProfileId = escapeSQL(profileId);
      let whereClause = `profile_id = ${escapedProfileId}`;

      if (status && status !== 'all') {
        whereClause += ` AND status = ${escapeSQL(status)}`;
      }

      const goalRows = await query<GoalRow>(
        `SELECT * FROM goals WHERE ${whereClause} ORDER BY priority ASC, created_at DESC`
      );

      // Get all components for these goals
      let componentRows: GoalComponentRow[] = [];
      if (goalRows.length > 0) {
        const goalIds = goalRows.map((g) => escapeSQL(g.id)).join(', ');
        componentRows = await query<GoalComponentRow>(
          `SELECT * FROM goal_components WHERE goal_id IN (${goalIds}) ORDER BY created_at ASC`
        );
      }

      // Group components by goal_id
      const componentsByGoal = new Map<string, GoalComponent[]>();
      for (const row of componentRows) {
        const component = rowToComponent(row);
        const existing = componentsByGoal.get(row.goal_id) || [];
        existing.push(component);
        componentsByGoal.set(row.goal_id, existing);
      }

      // Build goals with components
      const goals = goalRows.map((row) => rowToGoal(row, componentsByGoal.get(row.id)));

      return new Response(JSON.stringify(goals), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Goals] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST: Create a new goal (also supports legacy action-based API)
export async function POST(event: APIEvent) {
  try {
    await ensureGoalsSchema();

    const body = await event.request.json();

    // Support legacy action-based API for backward compatibility
    if (body.action) {
      return handleLegacyAction(body);
    }

    // New REST-style API
    const {
      profileId,
      name,
      amount,
      deadline,
      priority = 1,
      parentGoalId,
      conditionType = 'none',
      status = 'active',
      planData,
      components = [],
    } = body;

    if (!profileId || !name || amount === undefined) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId, name, and amount are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const goalId = uuidv4();

    // Insert goal
    await execute(`
      INSERT INTO goals (
        id, profile_id, name, amount, deadline, priority,
        parent_goal_id, condition_type, status, plan_data
      ) VALUES (
        ${escapeSQL(goalId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${amount},
        ${deadline ? escapeSQL(deadline) : 'NULL'},
        ${priority},
        ${parentGoalId ? escapeSQL(parentGoalId) : 'NULL'},
        ${escapeSQL(conditionType)},
        ${escapeSQL(status)},
        ${planData ? escapeSQL(JSON.stringify(planData)) : 'NULL'}
      )
    `);

    // Insert components if provided
    for (const comp of components) {
      const componentId = uuidv4();
      await execute(`
        INSERT INTO goal_components (
          id, goal_id, name, type, estimated_hours, estimated_cost, status, depends_on
        ) VALUES (
          ${escapeSQL(componentId)},
          ${escapeSQL(goalId)},
          ${escapeSQL(comp.name)},
          ${escapeSQL(comp.type || 'other')},
          ${comp.estimatedHours || 'NULL'},
          ${comp.estimatedCost || 'NULL'},
          ${escapeSQL(comp.status || 'pending')},
          ${comp.dependsOn ? escapeSQL(JSON.stringify(comp.dependsOn)) : 'NULL'}
        )
      `);
    }

    // Fetch the created goal with components
    const goalRows = await query<GoalRow>(`SELECT * FROM goals WHERE id = ${escapeSQL(goalId)}`);
    const componentRows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE goal_id = ${escapeSQL(goalId)} ORDER BY created_at ASC`
    );

    const goal = rowToGoal(goalRows[0], componentRows.map(rowToComponent));

    return new Response(JSON.stringify(goal), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Goals] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PUT: Update goal
export async function PUT(event: APIEvent) {
  try {
    await ensureGoalsSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedId = escapeSQL(id);

    // Check if goal exists
    const existing = await query<{ id: string }>(`SELECT id FROM goals WHERE id = ${escapedId}`);
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build update query
    const updateFields: string[] = ['updated_at = CURRENT_TIMESTAMP'];

    if (updates.name !== undefined) {
      updateFields.push(`name = ${escapeSQL(updates.name)}`);
    }
    if (updates.amount !== undefined) {
      updateFields.push(`amount = ${updates.amount}`);
    }
    if (updates.deadline !== undefined) {
      updateFields.push(`deadline = ${updates.deadline ? escapeSQL(updates.deadline) : 'NULL'}`);
    }
    if (updates.priority !== undefined) {
      updateFields.push(`priority = ${updates.priority}`);
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = ${escapeSQL(updates.status)}`);
    }
    if (updates.progress !== undefined) {
      updateFields.push(`progress = ${updates.progress}`);
    }
    if (updates.planData !== undefined) {
      updateFields.push(
        `plan_data = ${updates.planData ? escapeSQL(JSON.stringify(updates.planData)) : 'NULL'}`
      );
    }
    if (updates.parentGoalId !== undefined) {
      updateFields.push(
        `parent_goal_id = ${updates.parentGoalId ? escapeSQL(updates.parentGoalId) : 'NULL'}`
      );
    }
    if (updates.conditionType !== undefined) {
      updateFields.push(`condition_type = ${escapeSQL(updates.conditionType)}`);
    }

    await execute(`UPDATE goals SET ${updateFields.join(', ')} WHERE id = ${escapedId}`);

    // If goal is completed, check if any waiting child goals should be activated
    if (updates.status === 'completed') {
      await execute(`
        UPDATE goals
        SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE parent_goal_id = ${escapedId}
        AND condition_type = 'after_completion'
        AND status = 'waiting'
      `);
    }

    // Fetch updated goal
    const goalRows = await query<GoalRow>(`SELECT * FROM goals WHERE id = ${escapedId}`);
    const componentRows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE goal_id = ${escapedId} ORDER BY created_at ASC`
    );

    const goal = rowToGoal(goalRows[0], componentRows.map(rowToComponent));

    return new Response(JSON.stringify(goal), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Goals] PUT error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete goal
export async function DELETE(event: APIEvent) {
  try {
    await ensureGoalsSchema();

    const url = new URL(event.request.url);
    const goalId = url.searchParams.get('id');

    if (!goalId) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedGoalId = escapeSQL(goalId);

    // Get goal info before deletion
    const goal = await query<{ name: string }>(
      `SELECT name FROM goals WHERE id = ${escapedGoalId}`
    );
    if (goal.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete components first
    await execute(`DELETE FROM goal_components WHERE goal_id = ${escapedGoalId}`);

    // Delete the goal
    await execute(`DELETE FROM goals WHERE id = ${escapedGoalId}`);

    // Also delete any child goals that depended on this one
    await execute(`DELETE FROM goals WHERE parent_goal_id = ${escapedGoalId}`);

    return new Response(JSON.stringify({ success: true, deleted: goal[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Goals] DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ============================================================================
// Legacy Action-Based API (for backward compatibility)
// ============================================================================

interface LegacyGoal {
  id: string;
  userId: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  minimumBudget: number;
  status: 'active' | 'completed' | 'abandoned';
  feasibilityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  weeklyTarget: number;
  createdAt: string;
  plan?: LegacyGoalPlan;
}

interface LegacyGoalPlan {
  strategies: LegacyStrategy[];
  milestones: LegacyMilestone[];
  achievements: LegacyAchievement[];
}

interface LegacyStrategy {
  id: string;
  type: 'job' | 'hustle' | 'selling' | 'optimization';
  name: string;
  monthlyImpact: number;
  effort: 'low' | 'medium' | 'high';
  description: string;
}

interface LegacyMilestone {
  weekNumber: number;
  targetAmount: number;
  cumulativeTarget: number;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  actions: string[];
  earnedAmount?: number;
}

interface LegacyAchievement {
  id: string;
  name: string;
  icon: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

// In-memory storage for legacy API (maintains backward compatibility)
const legacyGoalsStore: Map<string, LegacyGoal> = new Map();

function generateLegacyId(): string {
  return 'goal_' + Math.random().toString(36).substring(2, 15);
}

function calculateWeeklyTarget(amount: number, deadline: string): number {
  const now = new Date();
  const deadlineDate = new Date(deadline);
  const weeksRemaining = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );
  return weeksRemaining > 0 ? Math.ceil(amount / weeksRemaining) : amount;
}

function calculateFeasibility(
  _amount: number,
  weeklyTarget: number,
  _minimumBudget: number
): { score: number; risk: 'low' | 'medium' | 'high' } {
  const avgMonthlyEarningPotential = 400;
  const monthlyTarget = weeklyTarget * 4;

  if (monthlyTarget <= avgMonthlyEarningPotential * 0.5) {
    return { score: 0.9, risk: 'low' };
  } else if (monthlyTarget <= avgMonthlyEarningPotential) {
    return { score: 0.7, risk: 'medium' };
  } else {
    return { score: 0.4, risk: 'high' };
  }
}

function generateStrategies(profile: { skills?: string[] } | null): LegacyStrategy[] {
  const strategies: LegacyStrategy[] = [];

  strategies.push({
    id: 'opt_food',
    type: 'optimization',
    name: 'Campus Cafeteria',
    monthlyImpact: 100,
    effort: 'low',
    description: 'Eat at campus cafeteria instead of cooking or ordering',
  });

  if (profile?.skills?.includes('python') || profile?.skills?.includes('javascript')) {
    strategies.push({
      id: 'job_freelance',
      type: 'job',
      name: 'Dev Freelance (Upwork)',
      monthlyImpact: 500,
      effort: 'medium',
      description: '10h/week of freelance dev at $25/h',
    });
  }

  strategies.push({
    id: 'hustle_delivery',
    type: 'hustle',
    name: 'Delivery (Uber Eats)',
    monthlyImpact: 300,
    effort: 'medium',
    description: 'Deliveries in evenings and weekends',
  });

  strategies.push({
    id: 'sell_stuff',
    type: 'selling',
    name: 'Sell unused items',
    monthlyImpact: 150,
    effort: 'low',
    description: 'Sell on eBay/Craigslist',
  });

  return strategies;
}

function generateMilestones(
  amount: number,
  weeklyTarget: number,
  deadline: string
): LegacyMilestone[] {
  const milestones: LegacyMilestone[] = [];
  const deadlineDate = new Date(deadline);
  const now = new Date();
  const weeksRemaining = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  for (let week = 1; week <= Math.min(weeksRemaining, 12); week++) {
    milestones.push({
      weekNumber: week,
      targetAmount: weeklyTarget,
      cumulativeTarget: weeklyTarget * week,
      status: week === 1 ? 'in_progress' : 'pending',
      actions: week <= 2 ? ['Sell items', 'Optimize expenses'] : ['Keep up the effort'],
    });
  }

  return milestones;
}

function generateAchievements(): LegacyAchievement[] {
  return [
    { id: 'first_100', name: 'First Blood', icon: '💰', description: 'Earn $100', unlocked: false },
    { id: 'halfway', name: 'Halfway There', icon: '🎯', description: 'Reach 50%', unlocked: false },
    {
      id: 'streak_4',
      name: 'On Fire',
      icon: '🔥',
      description: '4 consecutive weeks',
      unlocked: false,
    },
    {
      id: 'diversified',
      name: 'Diversified',
      icon: '📈',
      description: '3+ income sources',
      unlocked: false,
    },
    {
      id: 'goal_achieved',
      name: 'Goal!',
      icon: '🏆',
      description: 'Reach the goal',
      unlocked: false,
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleLegacyAction(body: any): Promise<Response> {
  const { action } = body;

  switch (action) {
    case 'create': {
      const { goalName, goalAmount, goalDeadline, minimumBudget, profile } = body;

      const weeklyTarget = calculateWeeklyTarget(goalAmount, goalDeadline);
      const { score, risk } = calculateFeasibility(goalAmount, weeklyTarget, minimumBudget || 0);

      const goal: LegacyGoal = {
        id: generateLegacyId(),
        userId: profile?.name || 'anonymous',
        goalName,
        goalAmount,
        goalDeadline,
        minimumBudget: minimumBudget || 0,
        status: 'active',
        feasibilityScore: score,
        riskLevel: risk,
        weeklyTarget,
        createdAt: new Date().toISOString(),
        plan: {
          strategies: generateStrategies(profile),
          milestones: generateMilestones(goalAmount, weeklyTarget, goalDeadline),
          achievements: generateAchievements(),
        },
      };

      legacyGoalsStore.set(goal.id, goal);

      return new Response(JSON.stringify(goal), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    case 'list': {
      const goals = Array.from(legacyGoalsStore.values());
      return new Response(JSON.stringify({ goals }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    case 'get': {
      const { goalId } = body;
      const goal = legacyGoalsStore.get(goalId);

      if (!goal) {
        return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(goal), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    case 'update_progress': {
      const { goalId, weekNumber, earnedAmount } = body;
      const goal = legacyGoalsStore.get(goalId);

      if (!goal || !goal.plan) {
        return new Response(JSON.stringify({ error: true, message: 'Goal not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const milestone = goal.plan.milestones.find((m) => m.weekNumber === weekNumber);
      if (milestone) {
        milestone.earnedAmount = earnedAmount;
        milestone.status = earnedAmount >= milestone.targetAmount ? 'completed' : 'in_progress';
      }

      const totalEarned = goal.plan.milestones.reduce((sum, m) => sum + (m.earnedAmount || 0), 0);

      if (totalEarned >= 100) {
        const firstBlood = goal.plan.achievements.find((a) => a.id === 'first_100');
        if (firstBlood && !firstBlood.unlocked) {
          firstBlood.unlocked = true;
          firstBlood.unlockedAt = new Date().toISOString();
        }
      }

      if (totalEarned >= goal.goalAmount / 2) {
        const halfway = goal.plan.achievements.find((a) => a.id === 'halfway');
        if (halfway && !halfway.unlocked) {
          halfway.unlocked = true;
          halfway.unlockedAt = new Date().toISOString();
        }
      }

      if (totalEarned >= goal.goalAmount) {
        goal.status = 'completed';
        const achieved = goal.plan.achievements.find((a) => a.id === 'goal_achieved');
        if (achieved && !achieved.unlocked) {
          achieved.unlocked = true;
          achieved.unlockedAt = new Date().toISOString();
        }
      }

      legacyGoalsStore.set(goal.id, goal);

      return new Response(
        JSON.stringify({
          goal,
          totalEarned,
          progressPercent: Math.round((totalEarned / goal.goalAmount) * 100),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    default:
      return new Response(JSON.stringify({ error: true, message: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
  }
}
