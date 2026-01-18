/**
 * Lifestyle API Route
 *
 * Handles lifestyle expense CRUD operations using DuckDB.
 * Budget optimization: housing, food, transport, subscriptions.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Lifestyle');

// Schema initialization flag
let lifestyleSchemaInitialized = false;

// Initialize lifestyle schema if needed
async function ensureLifestyleSchema(): Promise<void> {
  if (lifestyleSchemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS lifestyle_items (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        category VARCHAR DEFAULT 'subscriptions',
        current_cost DECIMAL NOT NULL,
        optimized_cost DECIMAL,
        suggestion VARCHAR,
        essential BOOLEAN DEFAULT FALSE,
        applied BOOLEAN DEFAULT FALSE,
        paused_months INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: Add paused_months column if table already exists
    try {
      await execute(
        `ALTER TABLE lifestyle_items ADD COLUMN IF NOT EXISTS paused_months INTEGER DEFAULT 0`
      );
    } catch {
      // Column may already exist, ignore
    }

    lifestyleSchemaInitialized = true;
    logger.info('Schema initialized');
  } catch (error) {
    logger.debug('Schema init note', { error });
    lifestyleSchemaInitialized = true;
  }
}

// Lifestyle item type from DB
interface LifestyleItemRow {
  id: string;
  profile_id: string;
  name: string;
  category: string;
  current_cost: number;
  optimized_cost: number | null;
  suggestion: string | null;
  essential: boolean;
  applied: boolean;
  paused_months: number;
  created_at: string;
}

// Public LifestyleItem type
export interface LifestyleItem {
  id: string;
  profileId: string;
  name: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  essential: boolean;
  applied: boolean;
  pausedMonths: number;
  createdAt?: string;
}

function rowToItem(row: LifestyleItemRow): LifestyleItem {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    category: (row.category || 'subscriptions') as LifestyleItem['category'],
    currentCost: row.current_cost,
    optimizedCost: row.optimized_cost || undefined,
    suggestion: row.suggestion || undefined,
    essential: row.essential,
    applied: row.applied,
    pausedMonths: row.paused_months || 0,
    createdAt: row.created_at,
  };
}

// GET: List lifestyle items for a profile or get specific item
export async function GET(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');
    const category = url.searchParams.get('category');

    if (itemId) {
      const escapedItemId = escapeSQL(itemId);
      const itemRows = await query<LifestyleItemRow>(
        `SELECT * FROM lifestyle_items WHERE id = ${escapedItemId}`
      );

      if (itemRows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Item not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(rowToItem(itemRows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (profileId) {
      const escapedProfileId = escapeSQL(profileId);
      let whereClause = `profile_id = ${escapedProfileId}`;

      if (category) {
        whereClause += ` AND category = ${escapeSQL(category)}`;
      }

      const itemRows = await query<LifestyleItemRow>(
        `SELECT * FROM lifestyle_items WHERE ${whereClause} ORDER BY category, created_at DESC`
      );

      const items = itemRows.map(rowToItem);

      return new Response(JSON.stringify(items), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
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

// POST: Create a new lifestyle item
export async function POST(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const body = await event.request.json();
    const {
      profileId,
      name,
      category = 'subscriptions',
      currentCost = 10, // Default $10/month (final safety net)
      optimizedCost,
      suggestion,
      essential = false,
    } = body;

    if (!profileId || !name || currentCost === undefined) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId, name, and currentCost are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const itemId = uuidv4();

    await execute(`
      INSERT INTO lifestyle_items (
        id, profile_id, name, category, current_cost, optimized_cost, suggestion, essential, applied, paused_months
      ) VALUES (
        ${escapeSQL(itemId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${escapeSQL(category)},
        ${currentCost},
        ${optimizedCost !== undefined ? optimizedCost : 'NULL'},
        ${suggestion ? escapeSQL(suggestion) : 'NULL'},
        ${essential},
        FALSE,
        0
      )
    `);

    const itemRows = await query<LifestyleItemRow>(
      `SELECT * FROM lifestyle_items WHERE id = ${escapeSQL(itemId)}`
    );
    const item = rowToItem(itemRows[0]);

    return new Response(JSON.stringify(item), {
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

// PUT: Update lifestyle item (including applying optimization)
export async function PUT(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedId = escapeSQL(id);

    // Check if item exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM lifestyle_items WHERE id = ${escapedId}`
    );
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const updateFields: string[] = [];

    if (updates.name !== undefined) {
      updateFields.push(`name = ${escapeSQL(updates.name)}`);
    }
    if (updates.category !== undefined) {
      updateFields.push(`category = ${escapeSQL(updates.category)}`);
    }
    if (updates.currentCost !== undefined) {
      updateFields.push(`current_cost = ${updates.currentCost}`);
    }
    if (updates.optimizedCost !== undefined) {
      updateFields.push(`optimized_cost = ${updates.optimizedCost}`);
    }
    if (updates.suggestion !== undefined) {
      updateFields.push(
        `suggestion = ${updates.suggestion ? escapeSQL(updates.suggestion) : 'NULL'}`
      );
    }
    if (updates.essential !== undefined) {
      updateFields.push(`essential = ${updates.essential}`);
    }
    if (updates.applied !== undefined) {
      updateFields.push(`applied = ${updates.applied}`);
    }
    if (updates.pausedMonths !== undefined) {
      updateFields.push(`paused_months = ${updates.pausedMonths}`);
    }

    if (updateFields.length > 0) {
      await execute(
        `UPDATE lifestyle_items SET ${updateFields.join(', ')} WHERE id = ${escapedId}`
      );
    }

    const itemRows = await query<LifestyleItemRow>(
      `SELECT * FROM lifestyle_items WHERE id = ${escapedId}`
    );
    const item = rowToItem(itemRows[0]);

    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('PUT error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete lifestyle item(s) - supports single id or bulk by profileId
export async function DELETE(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    // Bulk delete by profileId (for re-onboarding)
    if (profileId && !itemId) {
      const escapedProfileId = escapeSQL(profileId);
      const countResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM lifestyle_items WHERE profile_id = ${escapedProfileId}`
      );
      // Convert BigInt to Number (DuckDB returns BigInt for COUNT)
      const count = Number(countResult[0]?.count || 0);

      await execute(`DELETE FROM lifestyle_items WHERE profile_id = ${escapedProfileId}`);

      logger.info('Bulk deleted items for profile', { count, profileId });
      return new Response(JSON.stringify({ success: true, deletedCount: count }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Single item delete by id
    if (!itemId) {
      return new Response(JSON.stringify({ error: true, message: 'id or profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedItemId = escapeSQL(itemId);

    const item = await query<{ name: string }>(
      `SELECT name FROM lifestyle_items WHERE id = ${escapedItemId}`
    );
    if (item.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await execute(`DELETE FROM lifestyle_items WHERE id = ${escapedItemId}`);

    return new Response(JSON.stringify({ success: true, deleted: item[0].name }), {
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
