/**
 * Date Utilities (dayjs)
 *
 * Centralized date operations using dayjs for consistency and reliability.
 * Replaces manual millisecond calculations throughout the codebase.
 */

import dayjs, { type Dayjs } from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isBetween from 'dayjs/plugin/isBetween';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import relativeTime from 'dayjs/plugin/relativeTime';
import duration from 'dayjs/plugin/duration';

// Register plugins
dayjs.extend(weekOfYear);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(relativeTime);
dayjs.extend(duration);

// Re-export dayjs for direct use
export { dayjs, type Dayjs };

// ============================================
// DATE CREATION
// ============================================

/**
 * Get current date as dayjs object
 */
export function now(): Dayjs {
  return dayjs();
}

/**
 * Parse a date string or Date object
 */
export function parseDate(date: string | Date | Dayjs): Dayjs {
  return dayjs(date);
}

/**
 * Get today's date as ISO string (YYYY-MM-DD)
 */
export function todayISO(): string {
  return dayjs().format('YYYY-MM-DD');
}

// ============================================
// DATE CALCULATIONS
// ============================================

/**
 * Calculate weeks between two dates
 * Replaces: Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
 */
export function weeksBetween(start: string | Date | Dayjs, end: string | Date | Dayjs): number {
  return Math.max(1, Math.ceil(dayjs(end).diff(dayjs(start), 'week', true)));
}

/**
 * Calculate days between two dates
 * Replaces: Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
 */
export function daysBetween(start: string | Date | Dayjs, end: string | Date | Dayjs): number {
  return Math.ceil(dayjs(end).diff(dayjs(start), 'day', true));
}

/**
 * Calculate months until a deadline from now
 * Returns 0 if deadline is in the past
 */
export function monthsUntil(deadline: string | Date | Dayjs): number {
  const d = dayjs(deadline);
  const n = dayjs();
  return Math.max(0, Math.ceil(d.diff(n, 'month', true)));
}

/**
 * Get Monday of the current week
 * Replaces: date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
 */
export function startOfWeek(date?: string | Date | Dayjs): Dayjs {
  return dayjs(date).startOf('week').add(1, 'day'); // dayjs week starts Sunday, we want Monday
}

/**
 * Get Sunday of the current week
 */
export function endOfWeek(date?: string | Date | Dayjs): Dayjs {
  return startOfWeek(date).add(6, 'day');
}

/**
 * Add days to a date
 * Replaces: date.setDate(date.getDate() + days)
 */
export function addDays(date: string | Date | Dayjs, days: number): Dayjs {
  return dayjs(date).add(days, 'day');
}

/**
 * Add weeks to a date
 */
export function addWeeks(date: string | Date | Dayjs, weeks: number): Dayjs {
  return dayjs(date).add(weeks, 'week');
}

/**
 * Subtract weeks from a date
 */
export function subtractWeeks(date: string | Date | Dayjs, weeks: number): Dayjs {
  return dayjs(date).subtract(weeks, 'week');
}

// ============================================
// DATE FORMATTING
// ============================================

/**
 * Format date as ISO string (YYYY-MM-DD)
 * Replaces: date.toISOString().split('T')[0]
 */
export function toISODate(date: string | Date | Dayjs): string {
  return dayjs(date).format('YYYY-MM-DD');
}

/**
 * Format date as full ISO string
 */
export function toISO(date: string | Date | Dayjs): string {
  return dayjs(date).toISOString();
}

/**
 * Format date for display (e.g., "Jan 15, 2026")
 */
export function formatDate(date: string | Date | Dayjs, format = 'MMM D, YYYY'): string {
  return dayjs(date).format(format);
}

/**
 * Format date with weekday (e.g., "Mon, Jan 15")
 */
export function formatDateWithDay(date: string | Date | Dayjs): string {
  return dayjs(date).format('ddd, MMM D');
}

/**
 * Format relative time (e.g., "2 days ago", "in 3 weeks")
 */
export function formatRelative(date: string | Date | Dayjs): string {
  return dayjs(date).fromNow();
}

/**
 * Format time ago for notifications
 * Returns: "just now", "5m ago", "2h ago", "3d ago"
 */
export function formatTimeAgo(date: string | Date | Dayjs): string {
  const d = dayjs(date);
  const diffMinutes = dayjs().diff(d, 'minute');
  const diffHours = dayjs().diff(d, 'hour');
  const diffDays = dayjs().diff(d, 'day');

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// ============================================
// DATE COMPARISONS
// ============================================

/**
 * Check if date is before another date
 */
export function isBefore(date: string | Date | Dayjs, compare: string | Date | Dayjs): boolean {
  return dayjs(date).isBefore(dayjs(compare));
}

/**
 * Check if date is after another date
 */
export function isAfter(date: string | Date | Dayjs, compare: string | Date | Dayjs): boolean {
  return dayjs(date).isAfter(dayjs(compare));
}

/**
 * Check if two date ranges overlap
 */
export function isDateRangeOverlapping(
  start1: string | Date | Dayjs,
  end1: string | Date | Dayjs,
  start2: string | Date | Dayjs,
  end2: string | Date | Dayjs
): boolean {
  const s1 = dayjs(start1);
  const e1 = dayjs(end1);
  const s2 = dayjs(start2);
  const e2 = dayjs(end2);

  return s1.isSameOrBefore(e2) && e1.isSameOrAfter(s2);
}

// ============================================
// WEEK UTILITIES
// ============================================

/**
 * Get week number of the year
 */
export function getWeekNumber(date?: string | Date | Dayjs): number {
  return dayjs(date).week();
}

/**
 * Generate array of week start dates
 */
export function generateWeekDates(
  start: string | Date | Dayjs,
  numWeeks: number
): { week: number; date: string }[] {
  const startDate = dayjs(start);
  return Array.from({ length: numWeeks }, (_, i) => ({
    week: i + 1,
    date: startDate.add(i, 'week').toISOString(),
  }));
}

// ============================================
// CURRENCY FORMATTING
// ============================================

export type Currency = 'USD' | 'EUR' | 'GBP';

/**
 * Get currency symbol from currency code
 */
export function getCurrencySymbol(currency?: Currency | string): string {
  switch (currency) {
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'USD':
    default:
      return '$';
  }
}

/**
 * Format amount with currency symbol in correct position
 * - EUR: symbol after (e.g., "100€" or "100 €")
 * - USD/GBP: symbol before (e.g., "$100" or "£100")
 *
 * @param amount - The numeric amount to format
 * @param currency - Currency code ('USD', 'EUR', 'GBP')
 * @param options - Formatting options
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency?: Currency | string,
  options: { compact?: boolean; showSign?: boolean } = {}
): string {
  const { compact = false, showSign = false } = options;
  const symbol = getCurrencySymbol(currency);

  const absAmount = Math.abs(amount);
  const formattedAbs = compact ? absAmount.toLocaleString() : absAmount.toString();

  let sign = '';
  if (amount < 0) {
    sign = '-';
  } else if (showSign) {
    sign = '+';
  }

  // EUR: symbol after the number. e.g. -100€
  if (currency === 'EUR') {
    return `${sign}${formattedAbs}€`;
  }

  // USD, GBP, and others: symbol before the number. e.g. -$100
  return `${sign}${symbol}${formattedAbs}`;
}

/**
 * Format amount with currency and suffix (e.g., "/h" for hourly rate, "/mo" for monthly)
 */
export function formatCurrencyWithSuffix(
  amount: number,
  currency?: Currency | string,
  suffix?: string
): string {
  const formatted = formatCurrency(amount, currency);
  return suffix ? `${formatted}${suffix}` : formatted;
}

// ============================================
// DEFAULTS
// ============================================

/**
 * Get default deadline (8 weeks from now)
 */
export function defaultDeadline(weeks = 8): string {
  return addWeeks(now(), weeks).format('YYYY-MM-DD');
}

/**
 * Get default deadline (90 days from now)
 */
export function defaultDeadline90Days(): string {
  return addDays(now(), 90).format('YYYY-MM-DD');
}

/**
 * Normalize database date values to YYYY-MM-DD string
 *
 * DuckDB can return dates in various formats:
 * - Date objects
 * - ISO strings with time (YYYY-MM-DDTHH:mm:ss.sssZ)
 * - YYYY-MM-DD strings
 * - BigInt timestamps (microseconds since epoch)
 * - Number timestamps (milliseconds or seconds)
 *
 * This function normalizes all these to YYYY-MM-DD local date strings.
 */
export function normalizeDbDate(d: unknown): string {
  if (d === null || d === undefined) return '';
  if (d instanceof Date) return toISODate(d);
  if (typeof d === 'string') return d.split('T')[0];
  if (typeof d === 'bigint' || typeof d === 'number') {
    const ms = typeof d === 'bigint' ? Number(d) : d;
    // Detect if timestamp is in seconds (< 1e12) or milliseconds
    return toISODate(new Date(ms < 1e12 ? ms * 1000 : ms));
  }
  return String(d);
}

export default {
  dayjs,
  now,
  parseDate,
  todayISO,
  weeksBetween,
  daysBetween,
  monthsUntil,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  subtractWeeks,
  toISODate,
  toISO,
  formatDate,
  formatDateWithDay,
  formatRelative,
  formatTimeAgo,
  isBefore,
  isAfter,
  isDateRangeOverlapping,
  getWeekNumber,
  generateWeekDates,
  defaultDeadline,
  defaultDeadline90Days,
  normalizeDbDate,
  getCurrencySymbol,
  formatCurrency,
  formatCurrencyWithSuffix,
};
