/**
 * Goal Components API Route
 *
 * Handles CRUD operations for goal components (sub-tasks).
 * Supports updating component status, which is the main use case.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, escapeSQL } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('GoalComponents');

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

// GET: List components for a goal
export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const componentId = url.searchParams.get('id');
    const goalId = url.searchParams.get('goalId');

    if (componentId) {
      // Get specific component
      const rows = await query<GoalComponentRow>(
        `SELECT * FROM goal_components WHERE id = ${escapeSQL(componentId)}`
      );

      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Component not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(rowToComponent(rows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (goalId) {
      // List components for goal
      const rows = await query<GoalComponentRow>(
        `SELECT * FROM goal_components WHERE goal_id = ${escapeSQL(goalId)} ORDER BY created_at ASC`
      );

      return new Response(JSON.stringify(rows.map(rowToComponent)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: true, message: 'id or goalId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
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
      return new Response(
        JSON.stringify({ error: true, message: 'goalId and name are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
        ${dependsOn ? escapeSQL(JSON.stringify(dependsOn)) : 'NULL'}
      )
    `);

    const rows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE id = ${escapeSQL(componentId)}`
    );

    return new Response(JSON.stringify(rowToComponent(rows[0])), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PATCH: Update a component (mainly for status updates)
export async function PATCH(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedId = escapeSQL(id);

    // Check if component exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM goal_components WHERE id = ${escapedId}`
    );
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Component not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build update query
    const updateFields: string[] = [];

    if (updates.name !== undefined) {
      updateFields.push(`name = ${escapeSQL(updates.name)}`);
    }
    if (updates.type !== undefined) {
      updateFields.push(`type = ${escapeSQL(updates.type)}`);
    }
    if (updates.estimatedHours !== undefined) {
      updateFields.push(`estimated_hours = ${updates.estimatedHours || 'NULL'}`);
    }
    if (updates.estimatedCost !== undefined) {
      updateFields.push(`estimated_cost = ${updates.estimatedCost || 'NULL'}`);
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = ${escapeSQL(updates.status)}`);
      // Set completed_at when status changes to completed
      if (updates.status === 'completed') {
        updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
      } else if (updates.status === 'pending' || updates.status === 'in_progress') {
        // Clear completed_at if status changes back
        updateFields.push(`completed_at = NULL`);
      }
    }
    if (updates.dependsOn !== undefined) {
      updateFields.push(
        `depends_on = ${updates.dependsOn ? escapeSQL(JSON.stringify(updates.dependsOn)) : 'NULL'}`
      );
    }

    if (updateFields.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await execute(`UPDATE goal_components SET ${updateFields.join(', ')} WHERE id = ${escapedId}`);

    // Fetch updated component
    const rows = await query<GoalComponentRow>(
      `SELECT * FROM goal_components WHERE id = ${escapedId}`
    );

    // Also update parent goal's progress based on component completion
    const component = rowToComponent(rows[0]);
    if (updates.status !== undefined) {
      await updateGoalProgressFromComponents(component.goalId);
    }

    return new Response(JSON.stringify(component), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('PATCH error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PUT: Full update (same as PATCH for compatibility)
export async function PUT(event: APIEvent) {
  return PATCH(event);
}

// DELETE: Delete a component
export async function DELETE(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const componentId = url.searchParams.get('id');
    const goalId = url.searchParams.get('goalId');

    // Bulk delete by goalId
    if (goalId && !componentId) {
      const countResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM goal_components WHERE goal_id = ${escapeSQL(goalId)}`
      );
      const count = Number(countResult[0]?.count || 0);

      await execute(`DELETE FROM goal_components WHERE goal_id = ${escapeSQL(goalId)}`);

      return new Response(JSON.stringify({ success: true, deletedCount: count }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!componentId) {
      return new Response(JSON.stringify({ error: true, message: 'id or goalId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get component info before deletion
    const component = await query<{ name: string; goal_id: string }>(
      `SELECT name, goal_id FROM goal_components WHERE id = ${escapeSQL(componentId)}`
    );
    if (component.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Component not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const goalIdToUpdate = component[0].goal_id;

    await execute(`DELETE FROM goal_components WHERE id = ${escapeSQL(componentId)}`);

    // Update parent goal progress
    await updateGoalProgressFromComponents(goalIdToUpdate);

    return new Response(JSON.stringify({ success: true, deleted: component[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('DELETE error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Helper to update parent goal's progress based on component completion.
 * Progress = (completed components / total components) * 100
 */
async function updateGoalProgressFromComponents(goalId: string): Promise<void> {
  try {
    const escapedGoalId = escapeSQL(goalId);

    // Get total and completed component counts
    const stats = await query<{ total: bigint; completed: bigint }>(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM goal_components
      WHERE goal_id = ${escapedGoalId}
    `);

    const total = Number(stats[0]?.total || 0);
    const completed = Number(stats[0]?.completed || 0);

    if (total > 0) {
      const progress = Math.round((completed / total) * 100);
      await execute(`
        UPDATE goals
        SET progress = ${progress}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${escapedGoalId}
      `);

      // If all components are completed, mark goal as completed
      if (completed === total) {
        await execute(`
          UPDATE goals
          SET status = 'completed', updated_at = CURRENT_TIMESTAMP
          WHERE id = ${escapedGoalId} AND status = 'active'
        `);
      }
    }
  } catch (error) {
    logger.error('Failed to update goal progress from components', { error, goalId });
  }
}
