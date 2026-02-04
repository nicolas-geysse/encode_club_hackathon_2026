/**
 * Earnings Aggregator Module
 *
 * Combines earnings from all sources (missions, savings, trades) into
 * a unified EarningEvent[] array with correct date attribution.
 *
 * Part of v4.0 Goals Tab Fix - provides single source of truth for
 * all earning calculations used by useGoalData hook.
 */

import type { EarningEvent, EarningSource } from '../types/earnings';
import { getWeekNumber } from '../types/earnings';
import {
  calculateSavingsWeeks,
  applySavingsAdjustments,
  getEffectiveSavingsAmount,
  type SavingsAdjustment,
} from './savingsHelper';
import { createLogger } from './logger';

const logger = createLogger('EarningsAggregator');

// === TYPES ===

/**
 * Mission data from followup_data
 * Mirrors Mission interface from MissionCard but only what we need
 */
export interface MissionData {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'skipped';
  earningsCollected: number;
  completedAt?: string;
  updatedAt?: string;
}

/**
 * Trade data from budget API
 */
export interface TradeData {
  id: string;
  type: 'sell' | 'borrow' | 'lend';
  status: 'pending' | 'active' | 'completed';
  itemName: string;
  expectedPrice?: number;
  retailPrice?: number;
  created_at: string;
  updated_at: string;
}

/**
 * Parameters for aggregating all earnings
 */
export interface AggregateEarningsParams {
  /** Completed missions from followup_data */
  missions: MissionData[];
  /** Monthly net margin (income - expenses) */
  monthlyMargin: number;
  /** Day of month when income arrives (1-31) */
  incomeDay: number;
  /** Trades from budget API */
  trades: TradeData[];
  /** When the goal started */
  goalStartDate: Date;
  /** Goal deadline */
  goalDeadline: Date;
  /** Optional savings adjustments by week number */
  savingsAdjustments?: Record<number, SavingsAdjustment>;
  /**
   * Current date for filtering earnings (defaults to now).
   * Only earnings with date <= currentDate are included in "earned" total.
   * Pass simulatedDate here for time simulation support.
   */
  currentDate?: Date;
}

// === HELPER FUNCTIONS ===

/**
 * Generate a unique ID for an earning event
 */
function generateEventId(source: EarningSource, referenceId: string): string {
  return `earn-${source}-${referenceId}`;
}

/**
 * Parse a date string to Date, with fallback to current date
 * Handles various formats from DuckDB timestamps
 */
function parseDate(dateString: string | undefined, fallback: Date = new Date()): Date {
  if (!dateString) {
    logger.debug('[DIAG] parseDate: no dateString, using fallback', {
      fallback: fallback.toISOString(),
    });
    return fallback;
  }

  // Handle DuckDB timestamp format (e.g., "2026-02-05 10:00:00" without timezone)
  // Convert to ISO format if needed
  let normalizedDateString = dateString;
  if (dateString.includes(' ') && !dateString.includes('T')) {
    normalizedDateString = dateString.replace(' ', 'T');
  }

  const parsed = new Date(normalizedDateString);

  if (isNaN(parsed.getTime())) {
    logger.debug('[DIAG] parseDate: invalid date, using fallback', {
      original: dateString,
      normalized: normalizedDateString,
      fallback: fallback.toISOString(),
    });
    return fallback;
  }

  return parsed;
}

// === AGGREGATION FUNCTIONS ===

/**
 * Aggregate mission earnings
 *
 * Uses completedAt for date attribution with updatedAt fallback.
 * Only includes completed missions with positive earnings.
 */
function aggregateMissionEarnings(missions: MissionData[], goalStartDate: Date): EarningEvent[] {
  const events: EarningEvent[] = [];

  for (const mission of missions) {
    // Only include completed missions with earnings
    if (mission.status !== 'completed' || mission.earningsCollected <= 0) {
      continue;
    }

    // Date attribution: completedAt > updatedAt > current date
    const eventDate = parseDate(mission.completedAt || mission.updatedAt);
    const weekNumber = getWeekNumber(eventDate, goalStartDate);

    events.push({
      id: generateEventId('mission', mission.id),
      date: eventDate,
      amount: mission.earningsCollected,
      source: 'mission',
      label: mission.title,
      weekNumber,
      metadata: { missionId: mission.id },
    });
  }

  return events;
}

/**
 * Aggregate monthly savings earnings
 *
 * Places savings at incomeDay of each month within goal period.
 * Applies adjustments if present.
 */
function aggregateSavingsEarnings(
  monthlyMargin: number,
  incomeDay: number,
  goalStartDate: Date,
  goalDeadline: Date,
  adjustments?: Record<number, SavingsAdjustment>
): EarningEvent[] {
  const events: EarningEvent[] = [];

  // if (monthlyMargin <= 0) {
  //   return events;
  // }

  // Calculate which weeks receive savings
  let savingsWeeks = calculateSavingsWeeks(goalStartDate, goalDeadline, incomeDay, monthlyMargin);

  // Apply adjustments if present
  if (adjustments && Object.keys(adjustments).length > 0) {
    savingsWeeks = applySavingsAdjustments(savingsWeeks, adjustments);
  }

  // Convert to EarningEvents
  for (const savings of savingsWeeks) {
    const effectiveAmount = getEffectiveSavingsAmount(savings);

    // Skip if effective amount is 0 or negative (user zeroed it out)
    if (effectiveAmount <= 0) {
      continue;
    }

    const eventDate = new Date(savings.incomeDate);
    const monthKey = `${savings.year}-${String(new Date(savings.incomeDate).getMonth() + 1).padStart(2, '0')}`;

    events.push({
      id: generateEventId('savings', monthKey),
      date: eventDate,
      amount: effectiveAmount,
      source: 'savings',
      label: `${savings.month} savings${savings.isAdjusted ? ' (adjusted)' : ''}`,
      weekNumber: savings.weekNumber,
    });
  }

  return events;
}

/**
 * Aggregate trade sale earnings
 *
 * Uses updated_at for date attribution (when sale completed).
 * Only includes completed sells with positive price.
 */
function aggregateTradeSaleEarnings(trades: TradeData[], goalStartDate: Date): EarningEvent[] {
  const events: EarningEvent[] = [];

  // Debug: Log all trades being processed
  const completedSells = trades.filter((t) => t.type === 'sell' && t.status === 'completed');
  if (completedSells.length > 0) {
    logger.debug('[DIAG] Processing completed sells', {
      count: completedSells.length,
      trades: completedSells.map((t) => ({
        id: t.id,
        itemName: t.itemName,
        expectedPrice: t.expectedPrice,
        status: t.status,
        updated_at: t.updated_at,
      })),
    });
  }

  for (const trade of trades) {
    // Only include completed sells with expected price
    if (trade.type !== 'sell' || trade.status !== 'completed') {
      continue;
    }

    const amount = trade.expectedPrice ?? 0;
    if (amount <= 0) {
      continue;
    }

    // Use updated_at for when sale was completed
    const eventDate = parseDate(trade.updated_at);
    const weekNumber = getWeekNumber(eventDate, goalStartDate);

    logger.debug('[DIAG] Trade sale event created', {
      tradeId: trade.id,
      itemName: trade.itemName,
      amount,
      updated_at_raw: trade.updated_at,
      eventDate: eventDate.toISOString(),
      weekNumber,
    });

    events.push({
      id: generateEventId('trade_sale', trade.id),
      date: eventDate,
      amount,
      source: 'trade_sale',
      label: `Sold: ${trade.itemName}`,
      weekNumber,
      metadata: { tradeId: trade.id },
    });
  }

  return events;
}

/**
 * Aggregate trade borrow savings
 *
 * Uses created_at for date attribution (when borrow was initiated).
 * Amount is retailPrice - money saved by borrowing vs buying.
 */
function aggregateTradeBorrowEarnings(trades: TradeData[], goalStartDate: Date): EarningEvent[] {
  const events: EarningEvent[] = [];

  for (const trade of trades) {
    // Only include borrows (any status - saving happens immediately)
    if (trade.type !== 'borrow') {
      continue;
    }

    const amount = trade.retailPrice ?? 0;
    if (amount <= 0) {
      continue;
    }

    // Use created_at for when borrow was initiated
    const eventDate = parseDate(trade.created_at);
    const weekNumber = getWeekNumber(eventDate, goalStartDate);

    events.push({
      id: generateEventId('trade_borrow', trade.id),
      date: eventDate,
      amount,
      source: 'trade_borrow',
      label: `Borrowed (saved): ${trade.itemName}`,
      weekNumber,
      metadata: { tradeId: trade.id },
    });
  }

  return events;
}

// === MAIN EXPORT ===

/**
 * Aggregate all earnings from all sources into EarningEvent[]
 *
 * Combines:
 * - Mission earnings (from completed missions)
 * - Monthly savings (placed at incomeDay)
 * - Trade sale earnings (completed sells)
 * - Trade borrow savings (money saved by borrowing)
 *
 * Returns sorted array by date (earliest first).
 *
 * @example
 * const events = aggregateAllEarnings({
 *   missions: profile.followupData?.missions ?? [],
 *   monthlyMargin: 200,
 *   incomeDay: 15,
 *   trades: budgetData.trades ?? [],
 *   goalStartDate: new Date(goal.createdAt),
 *   goalDeadline: new Date(goal.deadline),
 *   savingsAdjustments: profile.followupData?.savingsAdjustments,
 * });
 */
export function aggregateAllEarnings(params: AggregateEarningsParams): EarningEvent[] {
  const {
    missions,
    monthlyMargin,
    incomeDay,
    trades,
    goalStartDate,
    goalDeadline,
    savingsAdjustments,
    currentDate = new Date(), // Default to now
  } = params;

  const events: EarningEvent[] = [];

  // 1. Process missions
  const missionEvents = aggregateMissionEarnings(missions, goalStartDate);
  events.push(...missionEvents);

  // 2. Process savings
  const savingsEvents = aggregateSavingsEarnings(
    monthlyMargin,
    incomeDay,
    goalStartDate,
    goalDeadline,
    savingsAdjustments
  );
  events.push(...savingsEvents);

  // 3. Process trade sales
  const tradeSaleEvents = aggregateTradeSaleEarnings(trades, goalStartDate);
  events.push(...tradeSaleEvents);

  // 4. Process trade borrow savings
  const tradeBorrowEvents = aggregateTradeBorrowEarnings(trades, goalStartDate);
  events.push(...tradeBorrowEvents);

  // Sort by date (earliest first)
  const sortedEvents = events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Filter to only include events that have already occurred (date <= end of currentDate)
  // This ensures "Total Earned" only counts actual earnings, not future projections
  // Use end-of-day to include all events from "today" regardless of time component
  const endOfCurrentDay = new Date(currentDate);
  endOfCurrentDay.setHours(23, 59, 59, 999);

  // Debug: Log trade sale events and filtering
  const tradeSales = sortedEvents.filter((e) => e.source === 'trade_sale');
  if (tradeSales.length > 0) {
    const included = tradeSales.filter((e) => e.date <= endOfCurrentDay);
    const excluded = tradeSales.filter((e) => e.date > endOfCurrentDay);
    logger.debug('[DIAG] Trade sale date filtering', {
      currentDate: currentDate.toISOString(),
      endOfCurrentDay: endOfCurrentDay.toISOString(),
      totalTradeSales: tradeSales.length,
      included: included.map((e) => ({ id: e.id, date: e.date.toISOString(), amount: e.amount })),
      excluded: excluded.map((e) => ({ id: e.id, date: e.date.toISOString(), amount: e.amount })),
    });
  }

  return sortedEvents.filter((event) => event.date <= endOfCurrentDay);
}
