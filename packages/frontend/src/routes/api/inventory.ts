/**
 * Inventory API Route
 *
 * Handles inventory item CRUD operations using DuckDB.
 * Items are things students can sell to generate income.
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
  checkDuplicate,
  buildUpdateFields,
  checkExists,
  query,
  execute,
  escapeSQL,
  uuidv4,
} from './_crud-helpers';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Inventory');

// Schema initialization flag
const schemaFlag = { initialized: false };

const SCHEMA_SQL = `
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
`;

async function ensureInventorySchema(): Promise<void> {
  return ensureSchema({
    flag: schemaFlag,
    sql: SCHEMA_SQL,
    logger,
    tableName: 'inventory_items',
  });
}

// DB Row type
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

// Public type
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

// Default values by category
const DEFAULT_VALUES: Record<string, number> = {
  electronics: 100,
  books: 25,
  clothing: 30,
  furniture: 75,
  other: 50,
};

// GET: List inventory items for a profile or get specific item
export async function GET(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');
    const status = params.get('status');

    if (itemId) {
      const result = await handleGetById<InventoryItemRow, InventoryItem>(itemId, {
        table: 'inventory_items',
        mapper: rowToItem,
        logger,
        notFoundMessage: 'Item not found',
      });
      if (result.response) return result.response;
      return successResponse(result.data);
    }

    if (profileId) {
      const additionalWhere = status && status !== 'all' ? `status = ${escapeSQL(status)}` : '';
      const items = await handleGetByProfileId<InventoryItemRow, InventoryItem>(profileId, {
        table: 'inventory_items',
        mapper: rowToItem,
        logger,
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

// POST: Create a new inventory item
export async function POST(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const body = await event.request.json();
    const {
      profileId,
      name,
      category = 'other',
      estimatedValue,
      condition = 'good',
      platform,
    } = body;

    if (!profileId || !name) {
      return errorResponse('profileId and name are required', 400);
    }

    // Use provided value or smart default based on category
    const finalValue = estimatedValue ?? DEFAULT_VALUES[category] ?? 50;

    if (estimatedValue === undefined) {
      logger.debug('No value provided, using default', { name, defaultValue: finalValue });
    }

    // Check for existing item (deduplication)
    const existing = await checkDuplicate<InventoryItemRow>(profileId, name, {
      table: 'inventory_items',
    });
    if (existing) {
      logger.info('Item already exists, returning existing', { name, profileId });
      return successResponse(rowToItem(existing));
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
        ${finalValue},
        ${escapeSQL(condition)},
        ${platform ? escapeSQL(platform) : 'NULL'},
        'available'
      )
    `);

    const itemRows = await query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = ${escapeSQL(itemId)}`
    );

    return successResponse(rowToItem(itemRows[0]), 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// PUT: Update inventory item (including marking as sold)
export async function PUT(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    const exists = await checkExists(id, { table: 'inventory_items' });
    if (!exists) {
      return errorResponse('Item not found', 404);
    }

    const updateFields = buildUpdateFields({
      updates,
      fieldMappings: [
        { entityField: 'name', dbField: 'name' },
        { entityField: 'category', dbField: 'category' },
        { entityField: 'estimatedValue', dbField: 'estimated_value', isNumeric: true },
        { entityField: 'condition', dbField: 'condition' },
        { entityField: 'platform', dbField: 'platform', nullable: true },
        { entityField: 'status', dbField: 'status' },
        { entityField: 'soldPrice', dbField: 'sold_price', isNumeric: true },
      ],
    });

    // Handle sold_at timestamp when status changes to sold
    if (updates.status === 'sold') {
      updateFields.push(`sold_at = CURRENT_TIMESTAMP`);
    }

    if (updateFields.length > 0) {
      const escapedId = escapeSQL(id);
      await execute(
        `UPDATE inventory_items SET ${updateFields.join(', ')} WHERE id = ${escapedId}`
      );
    }

    const itemRows = await query<InventoryItemRow>(
      `SELECT * FROM inventory_items WHERE id = ${escapeSQL(id)}`
    );

    return successResponse(rowToItem(itemRows[0]));
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}

// DELETE: Delete inventory item(s) - supports single id or bulk by profileId
export async function DELETE(event: APIEvent) {
  try {
    await ensureInventorySchema();

    const params = parseQueryParams(event);
    const itemId = params.get('id');
    const profileId = params.get('profileId');

    // Bulk delete by profileId
    if (profileId && !itemId) {
      const { count } = await handleBulkDeleteByProfileId(profileId, {
        table: 'inventory_items',
        logger,
      });
      return successResponse({ success: true, deletedCount: count });
    }

    // Single item delete
    if (!itemId) {
      return errorResponse('id or profileId is required', 400);
    }

    const result = await handleDeleteById(itemId, {
      table: 'inventory_items',
      notFoundMessage: 'Item not found',
    });

    if (result.response) return result.response;
    return successResponse({ success: true, deleted: result.deletedName });
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error');
  }
}
