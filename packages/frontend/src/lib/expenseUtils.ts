/**
 * Expense Utilities
 *
 * Helper functions for merging expense data from multiple sources.
 * Handles the dual-source architecture: profile.expenses (legacy) + lifestyle_items (new).
 */

import type { LifestyleItem, Expense } from '../types/entities';
import { createLogger } from './logger';

const logger = createLogger('ExpenseUtils');

/**
 * Convert legacy profile.expenses format to LifestyleItem format
 */
export function legacyExpenseToLifestyleItem(expense: Expense, index: number): LifestyleItem {
  return {
    id: `legacy_${expense.category}_${index}`,
    profileId: '',
    name: formatCategoryName(expense.category),
    category: mapLegacyCategory(expense.category),
    currentCost: expense.amount,
    essential: expense.category === 'housing' || expense.category === 'food',
    applied: false,
    pausedMonths: 0,
  };
}

/**
 * Map legacy category names to LifestyleItem categories
 */
function mapLegacyCategory(
  category: string
): 'housing' | 'food' | 'transport' | 'subscriptions' | 'other' {
  const mapping: Record<string, LifestyleItem['category']> = {
    rent: 'housing',
    housing: 'housing',
    food: 'food',
    transport: 'transport',
    subscriptions: 'subscriptions',
    other: 'other',
  };
  return mapping[category.toLowerCase()] || 'other';
}

/**
 * Format category name for display
 */
function formatCategoryName(category: string): string {
  const names: Record<string, string> = {
    rent: 'Rent',
    housing: 'Housing',
    food: 'Food & Groceries',
    transport: 'Transport',
    subscriptions: 'Subscriptions',
    other: 'Other Expenses',
  };
  return names[category.toLowerCase()] || category;
}

/**
 * Normalize expenses to array format
 * Handles corrupted data where expenses might be stored as a number
 */
export function normalizeExpenses(expenses: Expense[] | number | undefined): Expense[] {
  // Already an array - return as-is
  if (Array.isArray(expenses)) {
    return expenses;
  }

  // Number: convert to 5-category breakdown
  if (typeof expenses === 'number' && expenses > 0) {
    logger.info('Converting expenses number to breakdown', { total: expenses });
    return [
      { category: 'rent', amount: Math.round(expenses * 0.5) },
      { category: 'food', amount: Math.round(expenses * 0.25) },
      { category: 'transport', amount: Math.round(expenses * 0.1) },
      { category: 'subscriptions', amount: Math.round(expenses * 0.05) },
      { category: 'other', amount: Math.round(expenses * 0.1) },
    ];
  }

  // Undefined, null, 0, or invalid
  return [];
}

/**
 * Merge expense sources: prioritize lifestyle_items, fallback to profile.expenses
 *
 * Strategy:
 * - If lifestyle_items has data, use it (DuckDB is working)
 * - If lifestyle_items is empty, convert profile.expenses to LifestyleItem format
 * - This ensures expenses are always visible regardless of which persistence layer works
 *
 * Note: profileExpenses may be a number (corrupted data) - we normalize it first
 */
export function mergeExpenseSources(
  lifestyleItems: LifestyleItem[],
  profileExpenses: Expense[] | number | undefined
): LifestyleItem[] {
  // If lifestyle_items has data, DuckDB is working - use it
  if (lifestyleItems.length > 0) {
    logger.debug('Using lifestyle_items from DuckDB', { count: lifestyleItems.length });
    return lifestyleItems;
  }

  // Normalize expenses (handles number -> array conversion)
  const normalizedExpenses = normalizeExpenses(profileExpenses);

  // Fallback: convert profile.expenses to LifestyleItem format
  if (normalizedExpenses.length > 0) {
    logger.debug('Falling back to profile.expenses from localStorage', {
      count: normalizedExpenses.length,
    });
    return normalizedExpenses.map((expense, index) => legacyExpenseToLifestyleItem(expense, index));
  }

  // No data from either source
  logger.debug('No expense data from either source');
  return [];
}

/**
 * Calculate total expenses from merged sources
 * Note: profileExpenses may be a number (corrupted data)
 */
export function calculateTotalExpenses(
  lifestyleItems: LifestyleItem[],
  profileExpenses: Expense[] | number | undefined
): number {
  const merged = mergeExpenseSources(lifestyleItems, profileExpenses);
  return merged.reduce((sum, item) => sum + item.currentCost, 0);
}
