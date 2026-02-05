/**
 * useKarma Hook
 *
 * Calculates karma score from trade/lend/borrow activities.
 * Karma represents community contribution through sharing economy.
 *
 * Karma Points (consistent with SwipeCard display):
 * - +50 for each completed lend (helping others)
 * - +30 for each completed trade/swap (mutual benefit)
 * - +20 for each completed borrow (community trust)
 * - Does NOT count pending or cancelled items
 *
 * Karma Benefits (integrated into Stride):
 * - Unlocks achievements at thresholds
 * - Provides positive feedback in Bruno tips
 * - Small energy boost (1% per 50 karma, capped at +10%)
 */

import { createMemo, type Accessor } from 'solid-js';

// Karma points per action (must match SwipeTab.tsx values)
export const KARMA_POINTS = {
  lend: 50,
  trade: 30,
  borrow: 20,
} as const;

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
  /** Number of borrow actions */
  borrowCount: number;
  /** Karma tier: 'none' | 'helper' | 'champion' | 'legend' */
  tier: 'none' | 'helper' | 'champion' | 'legend';
  /** Energy bonus from karma (0-10%) */
  energyBonus: number;
}

/**
 * Get karma tier from score (adjusted for higher point values)
 */
function getKarmaTier(score: number): KarmaResult['tier'] {
  if (score >= 200) return 'legend'; // 4+ lends or equivalent
  if (score >= 100) return 'champion'; // 2 lends or equivalent
  if (score >= 50) return 'helper'; // 1 lend or equivalent
  return 'none';
}

/**
 * Calculate energy bonus from karma (1% per 50 karma, max 10%)
 */
function getEnergyBonus(score: number): number {
  return Math.min(10, Math.floor(score / 50));
}

/**
 * Hook to calculate karma from trades
 */
export function useKarma(trades: Accessor<Trade[]>): Accessor<KarmaResult> {
  return createMemo(() => {
    const items = trades();

    // Count completed actions
    const lendCount = items.filter((t) => t.type === 'lend' && t.status === 'completed').length;
    const tradeCount = items.filter((t) => t.type === 'trade' && t.status === 'completed').length;
    const borrowCount = items.filter((t) => t.type === 'borrow' && t.status === 'completed').length;

    // Calculate total karma using point values
    const score =
      lendCount * KARMA_POINTS.lend +
      tradeCount * KARMA_POINTS.trade +
      borrowCount * KARMA_POINTS.borrow;

    return {
      score,
      lendCount,
      tradeCount,
      borrowCount,
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
  const borrowCount = trades.filter((t) => t.type === 'borrow' && t.status === 'completed').length;

  const score =
    lendCount * KARMA_POINTS.lend +
    tradeCount * KARMA_POINTS.trade +
    borrowCount * KARMA_POINTS.borrow;

  return {
    score,
    lendCount,
    tradeCount,
    borrowCount,
    tier: getKarmaTier(score),
    energyBonus: getEnergyBonus(score),
  };
}

export default useKarma;
