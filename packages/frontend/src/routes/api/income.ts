/**
 * Income API Route
 *
 * Handles income CRUD operations using DuckDB.
 * Mirrors lifestyle.ts structure for expenses, but for income sources.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Income');

// Schema initialization flag
let incomeSchemaInitialized = false;

// Initialize income schema if needed
async function ensureIncomeSchema(): Promise<void> {
  if (incomeSchemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS income_items (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        amount DECIMAL NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    incomeSchemaInitialized = true;
    logger.info('Schema initialized');
  } catch (error) {
    logger.debug('Schema init note', { error });
    incomeSchemaInitialized = true;
  }
}

// Income item type from DB
interface IncomeItemRow {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  created_at: string;
}

// Public IncomeItem type
export interface IncomeItem {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  createdAt?: string;
}

function rowToItem(row: IncomeItemRow): IncomeItem {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    amount: row.amount,
    createdAt: row.created_at,
  };
}

// GET: List income items for a profile or get specific item
export async function GET(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    if (itemId) {
      const escapedItemId = escapeSQL(itemId);
      const itemRows = await query<IncomeItemRow>(
        `SELECT * FROM income_items WHERE id = ${escapedItemId}`
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
      const itemRows = await query<IncomeItemRow>(
        `SELECT * FROM income_items WHERE profile_id = ${escapedProfileId} ORDER BY created_at DESC`
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

// POST: Create a new income item
export async function POST(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const body = await event.request.json();
    const { profileId, name, amount = 0 } = body;

    if (!profileId || !name) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId and name are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing item with same name+profile (deduplication)
    const existing = await query<IncomeItemRow>(
      `SELECT * FROM income_items WHERE profile_id = ${escapeSQL(profileId)} AND name = ${escapeSQL(name)}`
    );
    if (existing.length > 0) {
      // Return existing item instead of creating duplicate
      logger.info('Item already exists, returning existing', { name, profileId });
      return new Response(JSON.stringify(rowToItem(existing[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const itemId = uuidv4();

    await execute(`
      INSERT INTO income_items (id, profile_id, name, amount)
      VALUES (
        ${escapeSQL(itemId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${amount}
      )
    `);

    const itemRows = await query<IncomeItemRow>(
      `SELECT * FROM income_items WHERE id = ${escapeSQL(itemId)}`
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

// PUT: Update income item
export async function PUT(event: APIEvent) {
  try {
    await ensureIncomeSchema();

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
      `SELECT id FROM income_items WHERE id = ${escapedId}`
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
    if (updates.amount !== undefined) {
      updateFields.push(`amount = ${updates.amount}`);
    }

    if (updateFields.length > 0) {
      await execute(`UPDATE income_items SET ${updateFields.join(', ')} WHERE id = ${escapedId}`);
    }

    const itemRows = await query<IncomeItemRow>(
      `SELECT * FROM income_items WHERE id = ${escapedId}`
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

// DELETE: Delete income item(s) - supports single id, bulk by profileId, or dedup
export async function DELETE(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');
    const dedup = url.searchParams.get('dedup') === 'true';

    // Deduplication mode: remove duplicate items by name for a profile
    if (dedup && profileId) {
      const escapedProfileId = escapeSQL(profileId);

      // Find and delete duplicates (keep the oldest item for each name)
      const duplicatesQuery = `
        DELETE FROM income_items
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY profile_id, name ORDER BY created_at ASC) as rn
            FROM income_items
            WHERE profile_id = ${escapedProfileId}
          ) sub
          WHERE rn > 1
        )
      `;
      await execute(duplicatesQuery);

      // Count remaining items
      const remainingResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM income_items WHERE profile_id = ${escapedProfileId}`
      );
      const remaining = Number(remainingResult[0]?.count || 0);

      logger.info('Deduplicated income items', { profileId, remaining });
      return new Response(JSON.stringify({ success: true, remaining, deduplicated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Bulk delete by profileId (for re-onboarding)
    if (profileId && !itemId) {
      const escapedProfileId = escapeSQL(profileId);
      const countResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM income_items WHERE profile_id = ${escapedProfileId}`
      );
      // Convert BigInt to Number (DuckDB returns BigInt for COUNT)
      const count = Number(countResult[0]?.count || 0);

      await execute(`DELETE FROM income_items WHERE profile_id = ${escapedProfileId}`);

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
      `SELECT name FROM income_items WHERE id = ${escapedItemId}`
    );
    if (item.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await execute(`DELETE FROM income_items WHERE id = ${escapedItemId}`);

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
