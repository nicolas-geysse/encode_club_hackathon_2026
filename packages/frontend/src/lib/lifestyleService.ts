/**
 * Lifestyle Service
 *
 * Frontend service for lifestyle expense management with DuckDB persistence.
 * Budget optimization: housing, food, transport, subscriptions.
 */

import { createLogger } from './logger';
import { eventBus } from './eventBus';

// Re-export types from canonical source
export type { LifestyleItem, CreateLifestyleItemInput, LifestyleCategory } from '../types/entities';
import type { LifestyleItem, CreateLifestyleItemInput, LifestyleCategory } from '../types/entities';

const logger = createLogger('LifestyleService');

/**
 * Input for updating a lifestyle item (internal use)
 */
interface UpdateLifestyleItemInput {
  id: string;
  name?: string;
  category?: LifestyleCategory;
  currentCost?: number;
  optimizedCost?: number;
  suggestion?: string;
  essential?: boolean;
  applied?: boolean;
  pausedMonths?: number;
}

/**
 * List lifestyle items for a profile
 */
export async function listItems(
  profileId: string,
  options: { category?: string } = {}
): Promise<LifestyleItem[]> {
  try {
    let url = `/api/lifestyle?profileId=${profileId}`;
    if (options.category) {
      url += `&category=${options.category}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list lifestyle items', { error: error.message });
      return [];
    }

    return await response.json();
  } catch (error) {
    logger.error('Error listing lifestyle items', { error });
    return [];
  }
}

/**
 * Create a new lifestyle item
 */
export async function createItem(input: CreateLifestyleItemInput): Promise<LifestyleItem | null> {
  try {
    const response = await fetch('/api/lifestyle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create lifestyle item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Lifestyle item created', { itemId: item.id, name: item.name });
    eventBus.emit('DATA_CHANGED');
    return item;
  } catch (error) {
    logger.error('Error creating lifestyle item', { error });
    return null;
  }
}

/**
 * Update a lifestyle item
 */
export async function updateItem(input: UpdateLifestyleItemInput): Promise<LifestyleItem | null> {
  try {
    const response = await fetch('/api/lifestyle', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update lifestyle item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Lifestyle item updated', { itemId: item.id });
    eventBus.emit('DATA_CHANGED');
    return item;
  } catch (error) {
    logger.error('Error updating lifestyle item', { error });
    return null;
  }
}

/**
 * Delete a lifestyle item
 */
export async function deleteItem(itemId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/lifestyle?id=${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete lifestyle item', { error: error.message });
      return false;
    }

    logger.info('Lifestyle item deleted', { itemId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error deleting lifestyle item', { error });
    return false;
  }
}

/**
 * Apply optimization to a lifestyle item
 */
export async function applyOptimization(itemId: string): Promise<LifestyleItem | null> {
  return updateItem({
    id: itemId,
    applied: true,
  });
}

/**
 * Calculate total current monthly cost
 */
export function getTotalCurrentCost(items: LifestyleItem[]): number {
  return items.reduce((sum, item) => sum + item.currentCost, 0);
}

/**
 * Calculate total optimized monthly cost
 */
export function getTotalOptimizedCost(items: LifestyleItem[]): number {
  return items.reduce(
    (sum, item) =>
      sum + (item.applied ? (item.optimizedCost ?? item.currentCost) : item.currentCost),
    0
  );
}

/**
 * Calculate potential monthly savings
 */
export function getPotentialSavings(items: LifestyleItem[]): number {
  return items
    .filter((item) => !item.applied && item.optimizedCost !== undefined)
    .reduce((sum, item) => sum + (item.currentCost - (item.optimizedCost || 0)), 0);
}

/**
 * Clear all lifestyle items for a profile (for re-onboarding)
 */
export async function clearItemsForProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/lifestyle?profileId=${profileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to clear lifestyle items', { error: error.message });
      return false;
    }

    logger.info('Cleared all lifestyle items for profile', { profileId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error clearing lifestyle items', { error });
    return false;
  }
}

/**
 * Bulk create lifestyle items (useful for migration from onboarding)
 * Clears existing items first to prevent duplicates
 */
export async function bulkCreateItems(
  profileId: string,
  items: Array<Omit<CreateLifestyleItemInput, 'profileId'>>,
  clearFirst = true
): Promise<LifestyleItem[]> {
  logger.info('bulkCreateItems called', {
    profileId,
    itemCount: items.length,
    clearFirst,
    items: items.map((i) => ({ name: i.name, category: i.category, cost: i.currentCost })),
  });

  try {
    // Clear existing items first to prevent orphaned data
    if (clearFirst) {
      await clearItemsForProfile(profileId);
    }

    const created: LifestyleItem[] = [];
    const failed: string[] = [];

    for (const itemInput of items) {
      // Ensure currentCost has a value (defense in depth)
      const item = await createItem({
        profileId,
        ...itemInput,
        currentCost: itemInput.currentCost ?? 10, // Default $10/month
      });
      if (item) {
        created.push(item);
      } else {
        failed.push(itemInput.name);
      }
    }

    if (failed.length > 0) {
      logger.warn('Some lifestyle items failed to create', { failed, profileId });
    }

    logger.info('Bulk created lifestyle items', {
      profileId,
      successCount: created.length,
      failedCount: failed.length,
    });
    return created;
  } catch (error) {
    logger.error('CRITICAL: bulkCreateItems failed', {
      error,
      profileId,
      itemCount: items.length,
    });
    // Re-throw so caller knows it failed
    throw error;
  }
}

export const lifestyleService = {
  listItems,
  createItem,
  updateItem,
  deleteItem,
  applyOptimization,
  getTotalCurrentCost,
  getTotalOptimizedCost,
  getPotentialSavings,
  clearItemsForProfile,
  bulkCreateItems,
};

export default lifestyleService;
