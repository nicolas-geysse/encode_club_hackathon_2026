/**
 * Income Service
 *
 * Frontend service for income management with DuckDB persistence.
 * Mirrors lifestyleService pattern for expenses.
 */

import { createLogger } from './logger';

const logger = createLogger('IncomeService');

/**
 * Income item
 */
export interface IncomeItem {
  id: string;
  profileId: string;
  name: string;
  amount: number;
  createdAt?: string;
}

/**
 * Input for creating a new income item
 */
export interface CreateIncomeItemInput {
  profileId: string;
  name: string;
  amount: number;
}

/**
 * Input for updating an income item
 */
export interface UpdateIncomeItemInput {
  id: string;
  name?: string;
  amount?: number;
}

/**
 * List income items for a profile
 */
export async function listItems(profileId: string): Promise<IncomeItem[]> {
  try {
    const url = `/api/income?profileId=${profileId}`;
    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list income items', { error: error.message });
      return [];
    }

    return await response.json();
  } catch (error) {
    logger.error('Error listing income items', { error });
    return [];
  }
}

/**
 * Get a specific income item by ID
 */
export async function getItem(itemId: string): Promise<IncomeItem | null> {
  try {
    const response = await fetch(`/api/income?id=${itemId}`);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to get income item', { error: error.message });
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error('Error getting income item', { error });
    return null;
  }
}

/**
 * Create a new income item
 */
export async function createItem(input: CreateIncomeItemInput): Promise<IncomeItem | null> {
  try {
    const response = await fetch('/api/income', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create income item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Income item created', { itemId: item.id, name: item.name });
    return item;
  } catch (error) {
    logger.error('Error creating income item', { error });
    return null;
  }
}

/**
 * Update an income item
 */
export async function updateItem(input: UpdateIncomeItemInput): Promise<IncomeItem | null> {
  try {
    const response = await fetch('/api/income', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update income item', { error: error.message });
      return null;
    }

    const item = await response.json();
    logger.info('Income item updated', { itemId: item.id });
    return item;
  } catch (error) {
    logger.error('Error updating income item', { error });
    return null;
  }
}

/**
 * Delete an income item
 */
export async function deleteItem(itemId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/income?id=${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete income item', { error: error.message });
      return false;
    }

    logger.info('Income item deleted', { itemId });
    return true;
  } catch (error) {
    logger.error('Error deleting income item', { error });
    return false;
  }
}

/**
 * Calculate total income from items
 */
export function getTotalIncome(items: IncomeItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

/**
 * Bulk create income items (useful for migration from onboarding)
 */
export async function bulkCreateItems(
  profileId: string,
  items: Array<Omit<CreateIncomeItemInput, 'profileId'>>
): Promise<IncomeItem[]> {
  const created: IncomeItem[] = [];

  for (const itemInput of items) {
    const item = await createItem({
      profileId,
      ...itemInput,
    });
    if (item) {
      created.push(item);
    }
  }

  logger.info('Bulk created income items', { profileId, count: created.length });
  return created;
}

export const incomeService = {
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  getTotalIncome,
  bulkCreateItems,
};

export default incomeService;
