/**
 * Goal Components API Route
 *
 * Handles CRUD operations for goal components (sub-tasks).
 * Supports updating component status, which is the main use case.
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  successResponse,
  errorResponse,
  parseQueryParams,
  handleGetById,
  handleBulkDeleteByProfileId,
  checkExists,
  buildUpdateFields,
  query,
  execute,
  escapeSQL,
  escapeJSON,
  uuidv4,
} from './_crud-helpers';
import { createLogger } from '../../lib/logger';

const logger = createLogger('GoalComponents');

// DB Row type
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

// Public type
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

/**
 * Log component completion stats (for debugging).
 *
 * NOTE: We intentionally do NOT update goal.progress from component completion.
 *
 * Reason: goal.progress represents FINANCIAL progress (% of amount saved),
 * not task completion. Component completion is tracked separately in the
 * GoalComponentsList UI. Mixing these caused confusion where completing
 * 1 component would show 3000€ earned when only 87€ was actually saved.
 *
 * The actual financial progress is updated from /suivi when missions are completed.
 */
async function logComponentStats(goalId: string): Promise<void> {
  try {
    const escapedGoalId = escapeSQL(goalId);

    const stats = await query<{ total: bigint; completed: bigint }>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM goal_components
      WHERE goal_id = ${escapedGoalId}
    `);

    const total = Number(stats[0]?.total || 0);
    const completed = Number(stats[0]?.completed || 0);

    logger.debug('Component stats', { goalId, completed, total });
  } catch (error) {
    logger.error('Failed to get component stats', { error, goalId });
  }
}

// GET: List components for a goal
export async function GET(event: APIEvent) {
  try {
    const params = parseQueryParams(event);
    const componentId = params.get('id');
    const goalId = params.get('goalId');

    if (componentId) {
      const result = await handleGetById<GoalComponentRow, GoalComponent>(componentId, {
        table: 'goal_components',
        mapper: rowToComponent,
        logger,
        notFoundMessage: 'Component not found',
      });
      if (result.response) return result.response;
      return successResponse(result.data);
    }

    if (goalId) {
      const rows = await query<GoalComponentRow>(
        `SELECT * FROM goal_components WHERE goal_id = ${escapeSQL(goalId)} ORDER BY created_at ASC`
      );
      return successResponse(rows.map(rowToComponent));
    }

    return errorResponse('id or goalId is required', 400);
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// POST: Create a new component for a goal
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const {
      goalId,
      name,
      type = 'other',
      estimatedHours,
      estimatedCost,
      status = 'pending',
      dependsOn,
    } = body;

    if (!goalId || !name) {
      return errorResponse('goalId and name are required', 400);
    }

    const componentId = uuidv4();

    await execute(`
      INSERT INTO goal_components (
        id, goal_id, name, type, estimated_hours, estimated_cost, status, depends_on
      ) VALUES (
        ${escapeSQL(componentId)},
        ${escapeSQL(goalId)},
        ${escapeSQL(name)},
        ${escapeSQL(type)},
        ${estimatedHours || 'NULL'},
        ${estimatedCost || 'NULL'},
        ${escapeSQL(status)},
        ${dependsOn ? escapeJSON(dependsOn) : 'NULL'}
      )
    `);

    const rows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE id = ${escapeSQL(componentId)}`
    );

    return successResponse(rowToComponent(rows[0]), 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PATCH: Update a component (mainly for status updates)
export async function PATCH(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    const exists = await checkExists(id, { table: 'goal_components' });
    if (!exists) {
      return errorResponse('Component not found', 404);
    }

    const updateFields = buildUpdateFields({
      updates,
      fieldMappings: [
        { entityField: 'name', dbField: 'name' },
        { entityField: 'type', dbField: 'type' },
        {
          entityField: 'estimatedHours',
          dbField: 'estimated_hours',
          isNumeric: true,
          nullable: true,
        },
        {
          entityField: 'estimatedCost',
          dbField: 'estimated_cost',
          isNumeric: true,
          nullable: true,
        },
        { entityField: 'status', dbField: 'status' },
        { entityField: 'dependsOn', dbField: 'depends_on', isJson: true, nullable: true },
      ],
    });

    // Handle completed_at based on status
    if (updates.status === 'completed') {
      updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
    } else if (updates.status === 'pending' || updates.status === 'in_progress') {
      updateFields.push(`completed_at = NULL`);
    }

    if (updateFields.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    await execute(
      `UPDATE goal_components SET ${updateFields.join(', ')} WHERE id = ${escapeSQL(id)}`
    );

    const rows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE id = ${escapeSQL(id)}`
    );

    const component = rowToComponent(rows[0]);

    // Update parent goal progress if status changed
    if (updates.status !== undefined) {
      await logComponentStats(component.goalId);
    }

    return successResponse(component);
  } catch (error) {
    logger.error('PATCH error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PUT: Full update (same as PATCH for compatibility)
export async function PUT(event: APIEvent) {
  return PATCH(event);
}

// DELETE: Delete a component
export async function DELETE(event: APIEvent) {
  try {
    const params = parseQueryParams(event);
    const componentId = params.get('id');
    const goalId = params.get('goalId');

    // Bulk delete by goalId
    if (goalId && !componentId) {
      const { count } = await handleBulkDeleteByProfileId(goalId, {
        table: 'goal_components',
        profileIdColumn: 'goal_id',
        logger,
      });
      return successResponse({ success: true, deletedCount: count });
    }

    if (!componentId) {
      return errorResponse('id or goalId is required', 400);
    }

    // Get goal_id before deletion for progress update
    const component = await query<{ name: string; goal_id: string }>(
      `SELECT name, goal_id FROM goal_components WHERE id = ${escapeSQL(componentId)}`
    );
    if (component.length === 0) {
      return errorResponse('Component not found', 404);
    }

    const goalIdToUpdate = component[0].goal_id;

    await execute(`DELETE FROM goal_components WHERE id = ${escapeSQL(componentId)}`);

    // Update parent goal progress
    await logComponentStats(goalIdToUpdate);

    return successResponse({ success: true, deleted: component[0].name });
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}
