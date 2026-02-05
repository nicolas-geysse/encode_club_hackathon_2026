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
 * Karma Levels (G.7):
 * - 0-99: "Newcomer" (just starting out)
 * - 100-499: "Helper" (active contributor)
 * - 500+: "Community Star" (community champion)
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

/** Karma tier identifiers */
export type KarmaTier = 'newcomer' | 'helper' | 'star';

/** Display info for karma tiers */
export interface KarmaTierInfo {
  tier: KarmaTier;
  label: string;
  emoji: string;
  color: string;
  colorClass: string;
  /** Points needed for next tier (null if max tier) */
  nextTierAt: number | null;
  /** Progress to next tier (0-100) */
  progress: number;
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
  /** Karma tier identifier */
  tier: KarmaTier;
  /** Full tier display info */
  tierInfo: KarmaTierInfo;
  /** Energy bonus from karma (0-10%) */
  energyBonus: number;
}

/** Tier thresholds */
const TIER_THRESHOLDS = {
  helper: 100,
  star: 500,
} as const;

/**
 * Get karma tier from score
 * - 0-99: newcomer
 * - 100-499: helper
 * - 500+: star
 */
function getKarmaTier(score: number): KarmaTier {
  if (score >= TIER_THRESHOLDS.star) return 'star';
  if (score >= TIER_THRESHOLDS.helper) return 'helper';
  return 'newcomer';
}

/**
 * Get full tier display info including progress to next tier
 */
export function getKarmaTierInfo(score: number): KarmaTierInfo {
  const tier = getKarmaTier(score);

  const tierData: Record<KarmaTier, Omit<KarmaTierInfo, 'tier' | 'nextTierAt' | 'progress'>> = {
    newcomer: {
      label: 'Newcomer',
      emoji: '🌱',
      color: '#6b7280', // gray
      colorClass: 'text-gray-500 dark:text-gray-400',
    },
    helper: {
      label: 'Helper',
      emoji: '🤝',
      color: '#8b5cf6', // purple
      colorClass: 'text-purple-500 dark:text-purple-400',
    },
    star: {
      label: 'Community Star',
      emoji: '⭐',
      color: '#f59e0b', // amber
      colorClass: 'text-amber-500 dark:text-amber-400',
    },
  };

  // Calculate progress to next tier
  let nextTierAt: number | null = null;
  let progress = 100;

  if (tier === 'newcomer') {
    nextTierAt = TIER_THRESHOLDS.helper;
    progress = Math.min(100, Math.round((score / TIER_THRESHOLDS.helper) * 100));
  } else if (tier === 'helper') {
    nextTierAt = TIER_THRESHOLDS.star;
    const rangeStart = TIER_THRESHOLDS.helper;
    const rangeSize = TIER_THRESHOLDS.star - TIER_THRESHOLDS.helper;
    progress = Math.min(100, Math.round(((score - rangeStart) / rangeSize) * 100));
  }
  // star tier: progress stays at 100, nextTierAt stays null

  return {
    tier,
    ...tierData[tier],
    nextTierAt,
    progress,
  };
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
      tierInfo: getKarmaTierInfo(score),
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
    tierInfo: getKarmaTierInfo(score),
    energyBonus: getEnergyBonus(score),
  };
}

export default useKarma;
