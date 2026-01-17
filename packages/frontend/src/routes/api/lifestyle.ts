/* eslint-disable no-console */
/**
 * Lifestyle API Route
 *
 * Handles lifestyle expense CRUD operations using DuckDB.
 * Budget optimization: housing, food, transport, subscriptions.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, escapeSQL } from './_db';

// Schema initialization flag
let lifestyleSchemaInitialized = false;

// Initialize lifestyle schema if needed
async function ensureLifestyleSchema(): Promise<void> {
  if (lifestyleSchemaInitialized) return;

  try {
    await execute(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    lifestyleSchemaInitialized = true;
    console.log('[Lifestyle] Schema initialized');
  } catch (error) {
    console.log('[Lifestyle] Schema init note:', error);
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
    console.error('[Lifestyle] GET error:', error);
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
      currentCost,
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
        id, profile_id, name, category, current_cost, optimized_cost, suggestion, essential, applied
      ) VALUES (
        ${escapeSQL(itemId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${escapeSQL(category)},
        ${currentCost},
        ${optimizedCost !== undefined ? optimizedCost : 'NULL'},
        ${suggestion ? escapeSQL(suggestion) : 'NULL'},
        ${essential},
        FALSE
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
    console.error('[Lifestyle] POST error:', error);
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
    console.error('[Lifestyle] PUT error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete lifestyle item
export async function DELETE(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');

    if (!itemId) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
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
    console.error('[Lifestyle] DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
