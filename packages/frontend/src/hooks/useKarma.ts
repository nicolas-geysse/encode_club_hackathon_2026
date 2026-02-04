/**
 * useKarma Hook
 *
 * Calculates karma score from trade/lend activities.
 * Karma represents community contribution through sharing economy.
 *
 * Karma Score:
 * - +1 for each completed lend
 * - +1 for each completed trade/swap
 * - Does NOT count pending or cancelled items
 *
 * Karma Benefits (integrated into Stride):
 * - Unlocks achievements at thresholds
 * - Provides positive feedback in Bruno tips
 * - Small energy boost (+2% per karma point, capped at +10%)
 */

import { createMemo, type Accessor } from 'solid-js';

export interface Trade {
  id: string;
  type: 'lend' | 'borrow' | 'trade' | 'sell';
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  // ... other fields
}

export interface KarmaResult {
  /** Total karma score */
  score: number;
  /** Number of lend actions */
  lendCount: number;
  /** Number of trade/swap actions */
  tradeCount: number;
  /** Karma tier: 'none' | 'helper' | 'champion' | 'legend' */
  tier: 'none' | 'helper' | 'champion' | 'legend';
  /** Energy bonus from karma (0-10%) */
  energyBonus: number;
}

/**
 * Get karma tier from score
 */
function getKarmaTier(score: number): KarmaResult['tier'] {
  if (score >= 10) return 'legend';
  if (score >= 5) return 'champion';
  if (score >= 2) return 'helper';
  return 'none';
}

/**
 * Calculate energy bonus from karma (2% per point, max 10%)
 */
function getEnergyBonus(score: number): number {
  return Math.min(10, score * 2);
}

/**
 * Hook to calculate karma from trades
 */
export function useKarma(trades: Accessor<Trade[]>): Accessor<KarmaResult> {
  return createMemo(() => {
    const items = trades();

    // Count completed lends
    const lendCount = items.filter((t) => t.type === 'lend' && t.status === 'completed').length;

    // Count completed trades/swaps
    const tradeCount = items.filter((t) => t.type === 'trade' && t.status === 'completed').length;

    const score = lendCount + tradeCount;

    return {
      score,
      lendCount,
      tradeCount,
      tier: getKarmaTier(score),
      energyBonus: getEnergyBonus(score),
    };
  });
}

/**
 * Simple karma calculation (non-reactive, for one-time use)
 */
export function calculateKarma(trades: Trade[]): KarmaResult {
  const lendCount = trades.filter((t) => t.type === 'lend' && t.status === 'completed').length;

  const tradeCount = trades.filter((t) => t.type === 'trade' && t.status === 'completed').length;

  const score = lendCount + tradeCount;

  return {
    score,
    lendCount,
    tradeCount,
    tier: getKarmaTier(score),
    energyBonus: getEnergyBonus(score),
  };
}

export default useKarma;
