/**
 * Trades API Route
 *
 * Handles trade CRUD operations using DuckDB.
 * Trades include: borrow, lend, trade, sell operations.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Trades');

// Schema initialization flag (persists across requests in same process)
let schemaInitialized = false;

// Trade types
type TradeType = 'borrow' | 'lend' | 'trade' | 'sell';
type TradeStatus = 'pending' | 'active' | 'completed';

// Initialize trades schema if needed
async function ensureTradesSchema(): Promise<void> {
  if (schemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS trades (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        description VARCHAR,
        partner VARCHAR NOT NULL,
        value DECIMAL DEFAULT 0,
        status VARCHAR DEFAULT 'pending',
        due_date DATE,
        inventory_item_id VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    schemaInitialized = true;
    logger.info('Trades schema initialized');
  } catch {
    // Table might already exist, mark as initialized anyway
    schemaInitialized = true;
  }
}

// Trade row type from DB
interface TradeRow {
  id: string;
  profile_id: string;
  type: TradeType;
  name: string;
  description: string | null;
  partner: string;
  value: number;
  status: TradeStatus;
  due_date: string | null;
  inventory_item_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToTrade(row: TradeRow) {
  return {
    id: row.id,
    profileId: row.profile_id,
    type: row.type,
    name: row.name,
    description: row.description || undefined,
    partner: row.partner,
    value: row.value || 0,
    status: row.status || 'pending',
    dueDate: row.due_date || undefined,
    inventoryItemId: row.inventory_item_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET: List trades for a profile
export async function GET(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');
    const tradeId = url.searchParams.get('id');
    const type = url.searchParams.get('type');

    if (tradeId) {
      // Get specific trade
      const rows = await query<TradeRow>(`SELECT * FROM trades WHERE id = ${escapeSQL(tradeId)}`);
      if (rows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Trade not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(rowToTrade(rows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build query
    let sql = `SELECT * FROM trades WHERE profile_id = ${escapeSQL(profileId)}`;
    if (type) {
      sql += ` AND type = ${escapeSQL(type)}`;
    }
    sql += ` ORDER BY created_at DESC`;

    const rows = await query<TradeRow>(sql);
    return new Response(JSON.stringify(rows.map(rowToTrade)), {
      status: 200,
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

// POST: Create a new trade
export async function POST(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const body = await event.request.json();
    const { profileId, type, name, description, partner, value, status, dueDate, inventoryItemId } =
      body;

    if (!profileId || !name || !partner) {
      return new Response(
        JSON.stringify({ error: true, message: 'profileId, name, and partner are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tradeId = uuidv4();

    await execute(`
      INSERT INTO trades (id, profile_id, type, name, description, partner, value, status, due_date, inventory_item_id)
      VALUES (
        ${escapeSQL(tradeId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(type || 'borrow')},
        ${escapeSQL(name)},
        ${escapeSQL(description)},
        ${escapeSQL(partner)},
        ${value || 0},
        ${escapeSQL(status || 'pending')},
        ${dueDate ? escapeSQL(dueDate) : 'NULL'},
        ${escapeSQL(inventoryItemId)}
      )
    `);

    const rows = await query<TradeRow>(`SELECT * FROM trades WHERE id = ${escapeSQL(tradeId)}`);

    logger.info('Trade created', { tradeId, name, type });
    return new Response(JSON.stringify(rowToTrade(rows[0])), {
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

// PUT: Update an existing trade
export async function PUT(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const body = await event.request.json();
    const { id, name, description, partner, value, status, dueDate } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if trade exists
    const existing = await query<{ id: string }>(
      `SELECT id FROM trades WHERE id = ${escapeSQL(id)}`
    );
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Trade not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build update query with only provided fields
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    if (name !== undefined) updates.push(`name = ${escapeSQL(name)}`);
    if (description !== undefined) updates.push(`description = ${escapeSQL(description)}`);
    if (partner !== undefined) updates.push(`partner = ${escapeSQL(partner)}`);
    if (value !== undefined) updates.push(`value = ${value}`);
    if (status !== undefined) updates.push(`status = ${escapeSQL(status)}`);
    if (dueDate !== undefined) updates.push(`due_date = ${dueDate ? escapeSQL(dueDate) : 'NULL'}`);

    await execute(`UPDATE trades SET ${updates.join(', ')} WHERE id = ${escapeSQL(id)}`);

    const rows = await query<TradeRow>(`SELECT * FROM trades WHERE id = ${escapeSQL(id)}`);

    logger.info('Trade updated', { tradeId: id });
    return new Response(JSON.stringify(rowToTrade(rows[0])), {
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

// DELETE: Delete a trade or all trades for a profile
export async function DELETE(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const url = new URL(event.request.url);
    const tradeId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    if (tradeId) {
      // Delete specific trade
      await execute(`DELETE FROM trades WHERE id = ${escapeSQL(tradeId)}`);
      logger.info('Trade deleted', { tradeId });
      return new Response(JSON.stringify({ success: true, deleted: tradeId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (profileId) {
      // Delete all trades for profile
      await execute(`DELETE FROM trades WHERE profile_id = ${escapeSQL(profileId)}`);
      logger.info('All trades deleted for profile', { profileId });
      return new Response(JSON.stringify({ success: true, profileId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: true, message: 'id or profileId required' }), {
      status: 400,
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
