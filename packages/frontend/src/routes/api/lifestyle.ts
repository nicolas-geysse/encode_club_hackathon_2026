/**
 * Lifestyle API Route
 *
 * Handles lifestyle expense CRUD operations using DuckDB.
 * Budget optimization: housing, food, transport, subscriptions.
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

const logger = createLogger('Lifestyle');

// Schema initialization flag
const schemaFlag = { initialized: false };

const SCHEMA_SQL = `
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
`;

const MIGRATIONS = [
  `ALTER TABLE lifestyle_items ADD COLUMN IF NOT EXISTS paused_months INTEGER DEFAULT 0`,
];

async function ensureLifestyleSchema(): Promise<void> {
  return ensureSchema({
    flag: schemaFlag,
    sql: SCHEMA_SQL,
    migrations: MIGRATIONS,
    logger,
    tableName: 'lifestyle_items',
  });
}

// DB Row type
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

// Public type
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

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');
    const category = params.get('category');

    if (itemId) {
      const result = await handleGetById<LifestyleItemRow, LifestyleItem>(itemId, {
        table: 'lifestyle_items',
        mapper: rowToItem,
        logger,
        notFoundMessage: 'Item not found',
      });
      if (result.response) return result.response;
      return successResponse(result.data);
    }

    if (profileId) {
      const additionalWhere = category ? `category = ${escapeSQL(category)}` : '';
      const items = await handleGetByProfileId<LifestyleItemRow, LifestyleItem>(profileId, {
        table: 'lifestyle_items',
        mapper: rowToItem,
        logger,
        orderBy: 'category, created_at DESC',
        additionalWhere,
      });
      return successResponse(items);
    }

    return errorResponse('profileId is required', 400);
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
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
      currentCost = 10,
      optimizedCost,
      suggestion,
      essential = false,
    } = body;

    if (!profileId || !name || currentCost === undefined) {
      return errorResponse('profileId, name, and currentCost are required', 400);
    }

    // Check for existing item (deduplication, case-insensitive)
    const existing = await checkDuplicate<LifestyleItemRow>(profileId, name, {
      table: 'lifestyle_items',
      caseSensitive: false,
    });
    if (existing) {
      logger.info('Item already exists, returning existing', { name, profileId });
      return successResponse(rowToItem(existing));
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

    return successResponse(rowToItem(itemRows[0]), 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PUT: Update lifestyle item (including applying optimization)
export async function PUT(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    const exists = await checkExists(id, { table: 'lifestyle_items' });
    if (!exists) {
      return errorResponse('Item not found', 404);
    }

    const updateFields = buildUpdateFields({
      updates,
      fieldMappings: [
        { entityField: 'name', dbField: 'name' },
        { entityField: 'category', dbField: 'category' },
        { entityField: 'currentCost', dbField: 'current_cost', isNumeric: true },
        { entityField: 'optimizedCost', dbField: 'optimized_cost', isNumeric: true },
        { entityField: 'suggestion', dbField: 'suggestion', nullable: true },
        { entityField: 'essential', dbField: 'essential', isBoolean: true },
        { entityField: 'applied', dbField: 'applied', isBoolean: true },
        { entityField: 'pausedMonths', dbField: 'paused_months', isNumeric: true },
      ],
    });

    if (updateFields.length > 0) {
      await execute(
        `UPDATE lifestyle_items SET ${updateFields.join(', ')} WHERE id = ${escapeSQL(id)}`
      );
    }

    const itemRows = await query<LifestyleItemRow>(
      `SELECT * FROM lifestyle_items WHERE id = ${escapeSQL(id)}`
    );

    return successResponse(rowToItem(itemRows[0]));
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// DELETE: Delete lifestyle item(s) - supports single id, bulk by profileId, or dedup
export async function DELETE(event: APIEvent) {
  try {
    await ensureLifestyleSchema();

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');
    const dedup = params.get('dedup') === 'true';

    // Deduplication mode
    if (dedup && profileId) {
      const { remaining } = await handleDeduplication(profileId, {
        table: 'lifestyle_items',
        logger,
      });
      return successResponse({ success: true, remaining, deduplicated: true });
    }

    // Bulk delete by profileId
    if (profileId && !itemId) {
      const { count } = await handleBulkDeleteByProfileId(profileId, {
        table: 'lifestyle_items',
        logger,
      });
      return successResponse({ success: true, deletedCount: count });
    }

    // Single item delete
    if (!itemId) {
      return errorResponse('id or profileId is required', 400);
    }

    const result = await handleDeleteById(itemId, {
      table: 'lifestyle_items',
      notFoundMessage: 'Item not found',
    });

    if (result.response) return result.response;
    return successResponse({ success: true, deleted: result.deletedName });
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}
