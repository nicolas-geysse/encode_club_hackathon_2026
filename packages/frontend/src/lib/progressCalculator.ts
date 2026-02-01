/**
 * Progress Calculator
 *
 * Unified utility for calculating total progress toward financial goals.
 * Separates mission earnings (stored in followupData.currentAmount) from
 * one-time gains (trades + paused subscriptions) for dynamic calculation.
 *
 * This prevents double-counting issues that would occur if one-time gains
 * were persisted into currentAmount directly.
 */

/**
 * One-time gains from trades and paused subscriptions.
 * These are discrete events, not recurring income.
 */
export interface OneTimeGains {
  /** Completed sell trades (items sold) */
  tradeSales: number;
  /** Active + completed borrow savings (items borrowed instead of purchased) */
  tradeBorrow: number;
  /** Savings from paused subscriptions (monthly cost * paused months) */
  pausedSavings: number;
}

/**
 * Calculate total progress toward a goal.
 *
 * Combines mission earnings (currentAmount) with one-time gains from
 * trades and paused subscriptions. This calculation happens at display
 * time to avoid double-counting on page refresh.
 *
 * @param currentAmount - Mission earnings from followupData (excludes trades)
 * @param oneTimeGains - One-time gains from Budget API
 * @returns Total progress amount
 *
 * @example
 * ```typescript
 * const total = calculateTotalProgress(200, {
 *   tradeSales: 100,      // Sold iPhone
 *   tradeBorrow: 50,      // Borrowed laptop from friend
 *   pausedSavings: 30,    // Paused Netflix for 2 months
 * });
 * // total = 380
 * ```
 */
export function calculateTotalProgress(currentAmount: number, oneTimeGains: OneTimeGains): number {
  return (
    currentAmount + oneTimeGains.tradeSales + oneTimeGains.tradeBorrow + oneTimeGains.pausedSavings
  );
}

/**
 * Get empty one-time gains for fallback cases.
 * Use when budget data is unavailable or loading.
 */
export function getEmptyOneTimeGains(): OneTimeGains {
  return {
    tradeSales: 0,
    tradeBorrow: 0,
    pausedSavings: 0,
  };
}
