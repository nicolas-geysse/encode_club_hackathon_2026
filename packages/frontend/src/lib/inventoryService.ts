/**
 * Inventory Service
 *
 * Frontend service for inventory item management with DuckDB persistence.
 * Items are things students can sell to generate income.
 */

import { createLogger } from './logger';

// Re-export types from canonical source
export type {
  InventoryItem,
  CreateInventoryItemInput,
  InventoryCategory,
  ItemCondition,
  ItemStatus,
} from '../types/entities';
import type {
  InventoryItem,
  CreateInventoryItemInput,
  InventoryCategory,
  ItemCondition,
  ItemStatus,
} from '../types/entities';

const logger = createLogger('InventoryService');

/**
 * Input for updating an inventory item (internal use)
 */
interface UpdateInventoryItemInput {
  id: string;
  name?: string;
  category?: InventoryCategory;
  estimatedValue?: number;
  condition?: ItemCondition;
  platform?: string;
  status?: ItemStatus;
  soldPrice?: number;
}

/**
 * List inventory items for a profile
 */
export async function listItems(
  profileId: string,
  options: { status?: 'available' | 'sold' | 'all' } = {}
): Promise<InventoryItem[]> {
  try {
    let url = `/api/inventory?profileId=${profileId}`;
    if (options.status) {
      url += `&status=${options.status}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list inventory items', { error: error.message });
      return [];
    }

    return await response.json();
  } catch (error) {
    logger.error('Error listing inventory items', { error });
    return [];
  }
}

/**
 * Create a new inventory item
 */
export async function createItem(input: CreateInventoryItemInput): Promise<InventoryItem | null> {
  try {
    const response = await fetch('/api/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create inventory item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Inventory item created', { itemId: item.id, name: item.name });
    return item;
  } catch (error) {
    logger.error('Error creating inventory item', { error });
    return null;
  }
}

/**
 * Update an inventory item
 */
export async function updateItem(input: UpdateInventoryItemInput): Promise<InventoryItem | null> {
  try {
    const response = await fetch('/api/inventory', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update inventory item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Inventory item updated', { itemId: item.id });
    return item;
  } catch (error) {
    logger.error('Error updating inventory item', { error });
    return null;
  }
}

/**
 * Delete an inventory item
 */
export async function deleteItem(itemId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/inventory?id=${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete inventory item', { error: error.message });
      return false;
    }

    logger.info('Inventory item deleted', { itemId });
    return true;
  } catch (error) {
    logger.error('Error deleting inventory item', { error });
    return false;
  }
}

/**
 * Mark an item as sold
 */
export async function markAsSold(itemId: string, soldPrice: number): Promise<InventoryItem | null> {
  return updateItem({
    id: itemId,
    status: 'sold',
    soldPrice,
  });
}

/**
 * Get total estimated value of available items
 */
export function getTotalEstimatedValue(items: InventoryItem[]): number {
  return items
    .filter((item) => item.status === 'available')
    .reduce((sum, item) => sum + item.estimatedValue, 0);
}

/**
 * Get total sold value
 */
export function getTotalSoldValue(items: InventoryItem[]): number {
  return items
    .filter((item) => item.status === 'sold')
    .reduce((sum, item) => sum + (item.soldPrice || 0), 0);
}

/**
 * Bulk create inventory items (useful for migration from onboarding)
 */
export async function bulkCreateItems(
  profileId: string,
  items: Array<Omit<CreateInventoryItemInput, 'profileId'>>
): Promise<InventoryItem[]> {
  const created: InventoryItem[] = [];

  for (const itemInput of items) {
    const item = await createItem({
      profileId,
      ...itemInput,
    });
    if (item) {
      created.push(item);
    }
  }

  logger.info('Bulk created inventory items', { profileId, count: created.length });
  return created;
}

export const inventoryService = {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  markAsSold,
  getTotalEstimatedValue,
  getTotalSoldValue,
  bulkCreateItems,
};

export default inventoryService;
