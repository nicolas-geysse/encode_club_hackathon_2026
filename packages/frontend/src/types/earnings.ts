/**
 * Earnings Type Definitions
 *
 * Single source of truth for all earning-related types.
 * Used by useGoalData hook and goal progress components.
 *
 * Part of v4.0 Goals Tab Fix - enables strict date attribution
 * for all earning sources (missions, savings, trades).
 */

// === EARNING SOURCE ===

/**
 * Discriminator for earning event sources.
 * Each source maps to a specific data origin:
 * - mission: Completed missions from followup_data
 * - savings: Monthly savings from income margin
 * - trade_sale: Completed trade sales (inventory items sold)
 * - trade_borrow: Borrow savings (avoiding purchase via borrowing)
 * - manual_adjustment: Future-proofing for manual entries
 */
export type EarningSource =
  | 'mission'
  | 'savings'
  | 'trade_sale'
  | 'trade_borrow'
  | 'manual_adjustment';

// === EARNING EVENT ===

/**
 * Optional metadata for linking events to source records.
 */
export interface EarningEventMetadata {
  /** Reference to completed mission ID */
  missionId?: string;
  /** Reference to trade record ID */
  tradeId?: string;
}

/**
 * Unified earning event with strict date attribution.
 *
 * All earnings from any source are normalized to this format,
 * enabling consistent week-by-week progress tracking.
 *
 * @example
 * const missionEarning: EarningEvent = {
 *   id: 'earn-mission-1',
 *   date: new Date('2026-02-01'),
 *   amount: 150,
 *   source: 'mission',
 *   label: 'Tutoring session completed',
 *   weekNumber: 3,
 *   metadata: { missionId: 'mission-abc123' }
 * };
 */
export interface EarningEvent {
  /** Unique identifier for the earning event */
  id: string;
  /** Effective date of the earning (when the money was earned) */
  date: Date;
  /** Amount earned in user's currency */
  amount: number;
  /** Type discriminator for earning source */
  source: EarningSource;
  /** Human-readable description of the earning */
  label: string;
  /** Week number relative to goal start (1-indexed) */
  weekNumber: number;
  /** Optional references to source records */
  metadata?: EarningEventMetadata;
}

// === GOAL STATUS ===

/**
 * Status indicator for goal progress.
 * Used for visual feedback and alerts.
 *
 * - ahead: Progress exceeds target (green)
 * - on-track: Progress within acceptable range (blue/neutral)
 * - behind: Progress below target but recoverable (yellow/orange)
 * - critical: Progress significantly behind, intervention needed (red)
 */
export type GoalStatus = 'ahead' | 'on-track' | 'behind' | 'critical';

// === HELPER FUNCTIONS ===

/** Milliseconds in one week */
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Calculate week number relative to goal start date.
 *
 * Returns 1-indexed week number (minimum 1).
 * Week 1 is the week containing the goal start date.
 *
 * @param eventDate - Date of the earning event
 * @param goalStartDate - Start date of the goal
 * @returns Week number (1-indexed, minimum 1)
 *
 * @example
 * // Event 10 days after goal start
 * getWeekNumber(new Date('2026-02-10'), new Date('2026-02-01'))
 * // Returns 2 (second week)
 */
export function getWeekNumber(eventDate: Date, goalStartDate: Date): number {
  const diffMs = eventDate.getTime() - goalStartDate.getTime();
  return Math.max(1, Math.floor(diffMs / MS_PER_WEEK) + 1);
}
