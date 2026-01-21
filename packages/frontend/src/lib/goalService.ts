/**
 * Goal Service
 *
 * Frontend service for goal management with DuckDB persistence.
 * Supports multiple goals per profile, conditional goals, and goal components.
 */

import { createLogger } from './logger';
import { eventBus } from './eventBus';

const logger = createLogger('GoalService');

/**
 * Goal component for sub-tasks within a goal
 * Example: "Code exam" and "Driving lessons" for a Driver's License goal
 */
export interface GoalComponent {
  id?: string;
  goalId?: string;
  name: string;
  type: 'exam' | 'time_allocation' | 'purchase' | 'milestone' | 'other';
  estimatedHours?: number;
  estimatedCost?: number;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  dependsOn?: string[];
  createdAt?: string;
}

/**
 * Goal with optional components and conditional relationships
 */
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

/**
 * Input for creating a new goal
 */
export interface CreateGoalInput {
  profileId: string;
  name: string;
  amount: number;
  deadline?: string;
  priority?: number;
  parentGoalId?: string;
  conditionType?: 'none' | 'after_completion' | 'after_date';
  status?: 'active' | 'waiting' | 'completed' | 'paused';
  planData?: Record<string, unknown>;
  components?: Omit<GoalComponent, 'id' | 'goalId' | 'createdAt'>[];
}

/**
 * Input for updating an existing goal
 */
export interface UpdateGoalInput {
  id: string;
  name?: string;
  amount?: number;
  deadline?: string;
  priority?: number;
  status?: 'active' | 'waiting' | 'completed' | 'paused';
  progress?: number;
  planData?: Record<string, unknown>;
  parentGoalId?: string;
  conditionType?: 'none' | 'after_completion' | 'after_date';
}

/**
 * List goals for a profile
 */
export async function listGoals(
  profileId: string,
  options: { status?: 'active' | 'waiting' | 'completed' | 'all' } = {}
): Promise<Goal[]> {
  try {
    let url = `/api/goals?profileId=${profileId}`;
    if (options.status) {
      url += `&status=${options.status}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list goals', { error: error.message });
      return [];
    }

    const goals = await response.json();
    return goals;
  } catch (error) {
    logger.error('Error listing goals', { error });
    return [];
  }
}

/**
 * Get a specific goal by ID
 */
export async function getGoal(goalId: string): Promise<Goal | null> {
  try {
    const response = await fetch(`/api/goals?id=${goalId}`);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to get goal', { error: error.message });
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error getting goal', { error });
    return null;
  }
}

/**
 * Create a new goal
 */
export async function createGoal(input: CreateGoalInput): Promise<Goal | null> {
  // Validation: profileId is required
  logger.info('Creating goal', { profileId: input.profileId, name: input.name });

  if (!input.profileId) {
    logger.error('createGoal called without profileId!', { input });
    return null;
  }

  if (!input.name) {
    logger.error('createGoal called without name!', { input });
    return null;
  }

  if (typeof input.amount !== 'number' || input.amount <= 0) {
    logger.error('createGoal called with invalid amount!', { amount: input.amount });
    return null;
  }

  try {
    const response = await fetch('/api/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create goal', { error: error.message, status: response.status });
      return null;
    }

    const goal = await response.json();
    logger.info('Goal created successfully', {
      goalId: goal.id,
      name: goal.name,
      profileId: input.profileId,
    });
    eventBus.emit('DATA_CHANGED');
    return goal;
  } catch (error) {
    logger.error('Error creating goal', { error, profileId: input.profileId });
    return null;
  }
}

/**
 * Update an existing goal
 */
export async function updateGoal(input: UpdateGoalInput): Promise<Goal | null> {
  try {
    const response = await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update goal', { error: error.message });
      return null;
    }

    const goal = await response.json();
    logger.info('Goal updated', { goalId: goal.id });
    eventBus.emit('DATA_CHANGED');
    return goal;
  } catch (error) {
    logger.error('Error updating goal', { error });
    return null;
  }
}

/**
 * Delete a goal and its components
 */
export async function deleteGoal(goalId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/goals?id=${goalId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete goal', { error: error.message });
      return false;
    }

    logger.info('Goal deleted', { goalId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error deleting goal', { error });
    return false;
  }
}

/**
 * Mark a goal as completed
 * This will also activate any child goals with condition_type='after_completion'
 */
export async function completeGoal(goalId: string): Promise<Goal | null> {
  return updateGoal({
    id: goalId,
    status: 'completed',
    progress: 100,
  });
}

/**
 * Update goal progress
 */
export async function updateGoalProgress(goalId: string, progress: number): Promise<Goal | null> {
  return updateGoal({
    id: goalId,
    progress: Math.max(0, Math.min(100, progress)),
  });
}

/**
 * Create a conditional goal that starts after another goal completes
 */
export async function createConditionalGoal(
  input: Omit<CreateGoalInput, 'conditionType' | 'status'> & {
    parentGoalId: string;
  }
): Promise<Goal | null> {
  return createGoal({
    ...input,
    conditionType: 'after_completion',
    status: 'waiting',
  });
}

/**
 * Get all active goals for a profile (excluding waiting/completed)
 */
export async function getActiveGoals(profileId: string): Promise<Goal[]> {
  return listGoals(profileId, { status: 'active' });
}

/**
 * Get the primary (highest priority) goal for a profile
 */
export async function getPrimaryGoal(profileId: string): Promise<Goal | null> {
  const goals = await listGoals(profileId, { status: 'active' });
  if (goals.length === 0) return null;

  // Return the goal with lowest priority number (highest priority)
  return goals.reduce((primary, goal) => (goal.priority < primary.priority ? goal : primary));
}

/**
 * Reorder goals by updating their priorities
 */
export async function reorderGoals(goalIds: string[]): Promise<boolean> {
  try {
    // Update each goal's priority based on its position in the array
    const updates = goalIds.map((id, index) => updateGoal({ id, priority: index + 1 }));

    const results = await Promise.all(updates);
    const success = results.every((result) => result !== null);
    if (success) {
      eventBus.emit('DATA_CHANGED');
    }
    return success;
  } catch (error) {
    logger.error('Error reordering goals', { error });
    return false;
  }
}

/**
 * Create a complex goal with components
 * Example: Driver's License with Code exam, Lessons, Driving test components
 */
export async function createComplexGoal(
  profileId: string,
  goal: {
    name: string;
    amount: number;
    deadline?: string;
    components: Array<{
      name: string;
      type: GoalComponent['type'];
      estimatedHours?: number;
      estimatedCost?: number;
      dependsOn?: string[];
    }>;
  }
): Promise<Goal | null> {
  return createGoal({
    profileId,
    name: goal.name,
    amount: goal.amount,
    deadline: goal.deadline,
    components: goal.components.map((c) => ({
      name: c.name,
      type: c.type,
      estimatedHours: c.estimatedHours,
      estimatedCost: c.estimatedCost,
      status: 'pending' as const,
      dependsOn: c.dependsOn,
    })),
  });
}

/**
 * Calculate total cost of a goal including all components
 */
export function calculateGoalTotalCost(goal: Goal): number {
  const baseCost = goal.amount;
  const componentsCost = (goal.components || []).reduce(
    (sum, c) => sum + (c.estimatedCost || 0),
    0
  );
  return baseCost + componentsCost;
}

/**
 * Calculate total hours for a goal including all components
 */
export function calculateGoalTotalHours(goal: Goal): number {
  return (goal.components || []).reduce((sum, c) => sum + (c.estimatedHours || 0), 0);
}

/**
 * Get goal completion percentage based on components
 */
export function calculateComponentProgress(goal: Goal): number {
  const components = goal.components || [];
  if (components.length === 0) return goal.progress;

  const completed = components.filter((c) => c.status === 'completed').length;
  return Math.round((completed / components.length) * 100);
}

export const goalService = {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  completeGoal,
  updateGoalProgress,
  createConditionalGoal,
  getActiveGoals,
  getPrimaryGoal,
  reorderGoals,
  createComplexGoal,
  calculateGoalTotalCost,
  calculateGoalTotalHours,
  calculateComponentProgress,
};

export default goalService;
