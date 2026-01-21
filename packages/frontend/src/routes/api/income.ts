/**
 * Income API Route
 *
 * Handles income CRUD operations using DuckDB.
 * Mirrors lifestyle.ts structure for expenses, but for income sources.
 */

import type { APIEvent } from '@solidjs/start/server';
import {
  ensureSchema,
  successResponse,
  errorResponse,
  parseQueryParams,
  handleGetById,
  handleGetByProfileId,
  handleDeleteById,
  handleBulkDeleteByProfileId,
  handleDeduplication,
  checkDuplicate,
  checkExists,
  buildUpdateFields,
  query,
  execute,
  escapeSQL,
  uuidv4,
} from './_crud-helpers';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Income');

// Schema initialization flag
const schemaFlag = { initialized: false };

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS income_items (
    id VARCHAR PRIMARY KEY,
    profile_id VARCHAR NOT NULL,
    name VARCHAR NOT NULL,
    amount DECIMAL NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

async function ensureIncomeSchema(): Promise<void> {
  return ensureSchema({
    flag: schemaFlag,
    sql: SCHEMA_SQL,
    logger,
    tableName: 'income_items',
  });
}

// DB Row type
interface IncomeItemRow {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  created_at: string;
}

// Public type
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

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');

    if (itemId) {
      const result = await handleGetById<IncomeItemRow, IncomeItem>(itemId, {
        table: 'income_items',
        mapper: rowToItem,
        logger,
        notFoundMessage: 'Item not found',
      });
      if (result.response) return result.response;
      return successResponse(result.data);
    }

    if (profileId) {
      const items = await handleGetByProfileId<IncomeItemRow, IncomeItem>(profileId, {
        table: 'income_items',
        mapper: rowToItem,
        logger,
      });
      return successResponse(items);
    }

    return errorResponse('profileId is required', 400);
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// POST: Create a new income item
export async function POST(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const body = await event.request.json();
    const { profileId, name, amount = 0 } = body;

    if (!profileId || !name) {
      return errorResponse('profileId and name are required', 400);
    }

    // Check for existing item (deduplication)
    const existing = await checkDuplicate<IncomeItemRow>(profileId, name, {
      table: 'income_items',
    });
    if (existing) {
      logger.info('Item already exists, returning existing', { name, profileId });
      return successResponse(rowToItem(existing));
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

    return successResponse(rowToItem(itemRows[0]), 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PUT: Update income item
export async function PUT(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    const exists = await checkExists(id, { table: 'income_items' });
    if (!exists) {
      return errorResponse('Item not found', 404);
    }

    const updateFields = buildUpdateFields({
      updates,
      fieldMappings: [
        { entityField: 'name', dbField: 'name' },
        { entityField: 'amount', dbField: 'amount', isNumeric: true },
      ],
    });

    if (updateFields.length > 0) {
      await execute(
        `UPDATE income_items SET ${updateFields.join(', ')} WHERE id = ${escapeSQL(id)}`
      );
    }

    const itemRows = await query<IncomeItemRow>(
      `SELECT * FROM income_items WHERE id = ${escapeSQL(id)}`
    );

    return successResponse(rowToItem(itemRows[0]));
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// DELETE: Delete income item(s) - supports single id, bulk by profileId, or dedup
export async function DELETE(event: APIEvent) {
  try {
    await ensureIncomeSchema();

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');
    const dedup = params.get('dedup') === 'true';

    // Deduplication mode
    if (dedup && profileId) {
      const { remaining } = await handleDeduplication(profileId, {
        table: 'income_items',
        logger,
      });
      return successResponse({ success: true, remaining, deduplicated: true });
    }

    // Bulk delete by profileId
    if (profileId && !itemId) {
      const { count } = await handleBulkDeleteByProfileId(profileId, {
        table: 'income_items',
        logger,
      });
      return successResponse({ success: true, deletedCount: count });
    }

    // Single item delete
    if (!itemId) {
      return errorResponse('id or profileId is required', 400);
    }

    const result = await handleDeleteById(itemId, {
      table: 'income_items',
      notFoundMessage: 'Item not found',
    });

    if (result.response) return result.response;
    return successResponse({ success: true, deleted: result.deletedName });
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}
