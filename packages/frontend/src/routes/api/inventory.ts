/* eslint-disable no-console */
/**
 * Inventory API Route
 *
 * Handles inventory item CRUD operations using DuckDB.
 * Items are things students can sell to generate income.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, escapeSQL } from './_db';

// Schema initialization flag
let inventorySchemaInitialized = false;

// Initialize inventory schema if needed
async function ensureInventorySchema(): Promise<void> {
  if (inventorySchemaInitialized) return;

  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        category VARCHAR DEFAULT 'other',
        estimated_value DECIMAL DEFAULT 50,
        condition VARCHAR DEFAULT 'good',
        platform VARCHAR,
        status VARCHAR DEFAULT 'available',
        sold_price DECIMAL,
        sold_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    inventorySchemaInitialized = true;
    console.log('[Inventory] Schema initialized');
  } catch (error) {
    console.log('[Inventory] Schema init note:', error);
    inventorySchemaInitialized = true;
  }
}

// Inventory item type from DB
interface InventoryItemRow {
  id: string;
  profile_id: string;
  name: string;
  category: string;
  estimated_value: number;
  condition: string;
  platform: string | null;
  status: string;
  sold_price: number | null;
  sold_at: string | null;
  created_at: string;
}

// Public InventoryItem type
export interface InventoryItem {
  id: string;
  profileId: string;
  name: string;
  category: 'electronics' | 'clothing' | 'books' | 'furniture' | 'sports' | 'other';
  estimatedValue: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  platform?: string;
  status: 'available' | 'sold';
  soldPrice?: number;
  soldAt?: string;
  createdAt?: string;
}

function rowToItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    category: (row.category || 'other') as InventoryItem['category'],
    estimatedValue: row.estimated_value || 50,
    condition: (row.condition || 'good') as InventoryItem['condition'],
    platform: row.platform || undefined,
    status: (row.status || 'available') as InventoryItem['status'],
    soldPrice: row.sold_price || undefined,
    soldAt: row.sold_at || undefined,
    createdAt: row.created_at,
  };
}

// GET: List inventory items for a profile or get specific item
export async function GET(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const url = new URL(event.request.url);
    const itemId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');
    const status = url.searchParams.get('status'); // 'available', 'sold', 'all'

    if (itemId) {
      const escapedItemId = escapeSQL(itemId);
      const itemRows = await query<InventoryItemRow>(
        `SELECT * FROM inventory_items WHERE id = ${escapedItemId}`
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

      if (status && status !== 'all') {
        whereClause += ` AND status = ${escapeSQL(status)}`;
      }

      const itemRows = await query<InventoryItemRow>(
        `SELECT * FROM inventory_items WHERE ${whereClause} ORDER BY created_at DESC`
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
    console.error('[Inventory] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST: Create a new inventory item
export async function POST(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const body = await event.request.json();
    const {
      profileId,
      name,
      category = 'other',
      estimatedValue = 50,
      condition = 'good',
      platform,
    } = body;

    if (!profileId || !name) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId and name are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const itemId = uuidv4();

    await execute(`
      INSERT INTO inventory_items (
        id, profile_id, name, category, estimated_value, condition, platform, status
      ) VALUES (
        ${escapeSQL(itemId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${escapeSQL(category)},
        ${estimatedValue},
        ${escapeSQL(condition)},
        ${platform ? escapeSQL(platform) : 'NULL'},
        'available'
      )
    `);

    const itemRows = await query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = ${escapeSQL(itemId)}`
    );
    const item = rowToItem(itemRows[0]);

    return new Response(JSON.stringify(item), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Inventory] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PUT: Update inventory item (including marking as sold)
export async function PUT(event: APIEvent) {
  try {
    await ensureInventorySchema();

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
      `SELECT id FROM inventory_items WHERE id = ${escapedId}`
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
    if (updates.estimatedValue !== undefined) {
      updateFields.push(`estimated_value = ${updates.estimatedValue}`);
    }
    if (updates.condition !== undefined) {
      updateFields.push(`condition = ${escapeSQL(updates.condition)}`);
    }
    if (updates.platform !== undefined) {
      updateFields.push(`platform = ${updates.platform ? escapeSQL(updates.platform) : 'NULL'}`);
    }
    if (updates.status !== undefined) {
      updateFields.push(`status = ${escapeSQL(updates.status)}`);
      if (updates.status === 'sold') {
        updateFields.push(`sold_at = CURRENT_TIMESTAMP`);
      }
    }
    if (updates.soldPrice !== undefined) {
      updateFields.push(`sold_price = ${updates.soldPrice}`);
    }

    if (updateFields.length > 0) {
      await execute(
        `UPDATE inventory_items SET ${updateFields.join(', ')} WHERE id = ${escapedId}`
      );
    }

    const itemRows = await query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = ${escapedId}`
    );
    const item = rowToItem(itemRows[0]);

    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Inventory] PUT error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete inventory item
export async function DELETE(event: APIEvent) {
  try {
    await ensureInventorySchema();

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
      `SELECT name FROM inventory_items WHERE id = ${escapedItemId}`
    );
    if (item.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await execute(`DELETE FROM inventory_items WHERE id = ${escapedItemId}`);

    return new Response(JSON.stringify({ success: true, deleted: item[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Inventory] DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
