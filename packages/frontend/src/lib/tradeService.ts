/**
 * Trade Service
 *
 * Frontend service for trade management with DuckDB persistence.
 * Handles: borrow, lend, trade, sell operations.
 */

import { createLogger } from './logger';
import { eventBus } from './eventBus';

// Re-export types from canonical source
export type { TradeItem, CreateTradeInput, TradeType, TradeStatus } from '../types/entities';
import type { TradeItem, CreateTradeInput, TradeType, TradeStatus } from '../types/entities';

const logger = createLogger('TradeService');

/**
 * Input for updating a trade (internal use)
 */
interface UpdateTradeInput {
  id: string;
  name?: string;
  description?: string;
  partner?: string;
  value?: number;
  status?: TradeStatus;
  dueDate?: string;
}

/**
 * List trades for a profile
 */
export async function listTrades(
  profileId: string,
  options: { type?: TradeType } = {}
): Promise<TradeItem[]> {
  try {
    let url = `/api/trades?profileId=${profileId}`;
    if (options.type) {
      url += `&type=${options.type}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to list trades', { error: error.message });
      return [];
    }

    return await response.json();
  } catch (error) {
    logger.error('Error listing trades', { error });
    return [];
  }
}

/**
 * Create a new trade
 */
export async function createTrade(input: CreateTradeInput): Promise<TradeItem | null> {
  try {
    const response = await fetch('/api/trades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to create trade', { error: error.message });
      return null;
    }

    const trade = await response.json();
    logger.info('Trade created', { tradeId: trade.id, name: trade.name });
    eventBus.emit('DATA_CHANGED');
    return trade;
  } catch (error) {
    logger.error('Error creating trade', { error });
    return null;
  }
}

/**
 * Update a trade
 */
export async function updateTrade(input: UpdateTradeInput): Promise<TradeItem | null> {
  try {
    const response = await fetch('/api/trades', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to update trade', { error: error.message });
      return null;
    }

    const trade = await response.json();
    logger.info('Trade updated', { tradeId: trade.id });
    eventBus.emit('DATA_CHANGED');
    return trade;
  } catch (error) {
    logger.error('Error updating trade', { error });
    return null;
  }
}

/**
 * Delete a trade
 */
export async function deleteTrade(tradeId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/trades?id=${tradeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to delete trade', { error: error.message });
      return false;
    }

    logger.info('Trade deleted', { tradeId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error deleting trade', { error });
    return false;
  }
}

/**
 * Update trade status
 */
export async function updateTradeStatus(
  tradeId: string,
  status: TradeStatus
): Promise<TradeItem | null> {
  return updateTrade({ id: tradeId, status });
}

/**
 * Clear all trades for a profile (for re-onboarding)
 */
export async function clearTradesForProfile(profileId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/trades?profileId=${profileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Failed to clear trades', { error: error.message });
      return false;
    }

    logger.info('Cleared all trades for profile', { profileId });
    eventBus.emit('DATA_CHANGED');
    return true;
  } catch (error) {
    logger.error('Error clearing trades', { error });
    return false;
  }
}

/**
 * Bulk create trades (useful for migration from onboarding)
 * Clears existing trades first to prevent duplicates
 */
export async function bulkCreateTrades(
  profileId: string,
  trades: Array<Omit<CreateTradeInput, 'profileId'>>,
  clearFirst = true
): Promise<TradeItem[]> {
  logger.info('bulkCreateTrades called', {
    profileId,
    tradeCount: trades.length,
    clearFirst,
    trades: trades.map((t) => ({ name: t.name, type: t.type, partner: t.partner })),
  });

  try {
    // Clear existing trades first to prevent orphaned data
    if (clearFirst) {
      await clearTradesForProfile(profileId);
    }

    const created: TradeItem[] = [];
    const failed: string[] = [];

    for (const tradeInput of trades) {
      const trade = await createTrade({
        profileId,
        ...tradeInput,
      });
      if (trade) {
        created.push(trade);
      } else {
        failed.push(tradeInput.name);
      }
    }

    if (failed.length > 0) {
      logger.warn('Some trades failed to create', { failed, profileId });
    }

    logger.info('Bulk created trades', {
      profileId,
      successCount: created.length,
      failedCount: failed.length,
    });
    return created;
  } catch (error) {
    logger.error('CRITICAL: bulkCreateTrades failed', {
      error,
      profileId,
      tradeCount: trades.length,
    });
    throw error;
  }
}

/**
 * Calculate total value from completed sales
 */
export function getSoldValue(trades: TradeItem[]): number {
  return trades
    .filter((t) => t.type === 'sell' && t.status === 'completed')
    .reduce((sum, t) => sum + t.value, 0);
}

/**
 * Calculate total value from active borrows (savings)
 */
export function getBorrowedValue(trades: TradeItem[]): number {
  return trades
    .filter((t) => t.type === 'borrow' && t.status === 'active')
    .reduce((sum, t) => sum + t.value, 0);
}

/**
 * Calculate total value from active lends
 */
export function getLentValue(trades: TradeItem[]): number {
  return trades
    .filter((t) => t.type === 'lend' && t.status === 'active')
    .reduce((sum, t) => sum + t.value, 0);
}

export const tradeService = {
  listTrades,
  createTrade,
  updateTrade,
  deleteTrade,
  updateTradeStatus,
  clearTradesForProfile,
  bulkCreateTrades,
  getSoldValue,
  getBorrowedValue,
  getLentValue,
};

export default tradeService;
