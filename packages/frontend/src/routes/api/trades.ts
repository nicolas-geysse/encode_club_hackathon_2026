/**
 * Trades API Route
 *
 * Handles trade CRUD operations using DuckDB.
 * Trades include: borrow, lend, trade, sell operations.
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  ensureSchema,
  successResponse,
  errorResponse,
  parseQueryParams,
  handleGetById,
  handleGetByProfileId,
  handleBulkDeleteByProfileId,
  checkExists,
  buildUpdateFields,
  query,
  execute,
  escapeSQL,
  uuidv4,
} from './_crud-helpers';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Trades');

// Schema initialization flag
const schemaFlag = { initialized: false };

const SCHEMA_SQL = `
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
`;

async function ensureTradesSchema(): Promise<void> {
  return ensureSchema({
    flag: schemaFlag,
    sql: SCHEMA_SQL,
    logger,
    tableName: 'trades',
  });
}

// Trade types
type TradeType = 'borrow' | 'lend' | 'trade' | 'sell';
type TradeStatus = 'pending' | 'active' | 'completed';

// DB Row type
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

// Public type
interface Trade {
  id: string;
  profileId: string;
  type: TradeType;
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: TradeStatus;
  dueDate?: string;
  inventoryItemId?: string;
  createdAt: string;
  updatedAt: string;
}

function rowToTrade(row: TradeRow): Trade {
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

    const params = parseQueryParams(event);
    const tradeId = params.get('id');
    const profileId = params.get('profileId');
    const type = params.get('type');

    if (tradeId) {
      const result = await handleGetById<TradeRow, Trade>(tradeId, {
        table: 'trades',
        mapper: rowToTrade,
        logger,
        notFoundMessage: 'Trade not found',
      });
      if (result.response) return result.response;
      return successResponse(result.data);
    }

    if (profileId) {
      const additionalWhere = type ? `type = ${escapeSQL(type)}` : '';
      const trades = await handleGetByProfileId<TradeRow, Trade>(profileId, {
        table: 'trades',
        mapper: rowToTrade,
        logger,
        additionalWhere,
      });
      return successResponse(trades);
    }

    return errorResponse('profileId required', 400);
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
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
      return errorResponse('profileId, name, and partner are required', 400);
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
    return successResponse(rowToTrade(rows[0]), 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PUT: Update an existing trade
export async function PUT(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    const exists = await checkExists(id, { table: 'trades' });
    if (!exists) {
      return errorResponse('Trade not found', 404);
    }

    const updateFields = buildUpdateFields({
      updates,
      fieldMappings: [
        { entityField: 'name', dbField: 'name' },
        { entityField: 'description', dbField: 'description' },
        { entityField: 'partner', dbField: 'partner' },
        { entityField: 'value', dbField: 'value', isNumeric: true },
        { entityField: 'status', dbField: 'status' },
        { entityField: 'dueDate', dbField: 'due_date', nullable: true },
      ],
    });

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    await execute(`UPDATE trades SET ${updateFields.join(', ')} WHERE id = ${escapeSQL(id)}`);

    const rows = await query<TradeRow>(`SELECT * FROM trades WHERE id = ${escapeSQL(id)}`);

    logger.info('Trade updated', { tradeId: id });
    return successResponse(rowToTrade(rows[0]));
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// DELETE: Delete a trade or all trades for a profile
export async function DELETE(event: APIEvent) {
  try {
    await ensureTradesSchema();

    const params = parseQueryParams(event);
    const tradeId = params.get('id');
    const profileId = params.get('profileId');

    if (tradeId) {
      await execute(`DELETE FROM trades WHERE id = ${escapeSQL(tradeId)}`);
      logger.info('Trade deleted', { tradeId });
      return successResponse({ success: true, deleted: tradeId });
    }

    if (profileId) {
      const { count } = await handleBulkDeleteByProfileId(profileId, {
        table: 'trades',
        logger,
      });
      logger.info('All trades deleted for profile', { profileId, count });
      return successResponse({ success: true, profileId });
    }

    return errorResponse('id or profileId required', 400);
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}
