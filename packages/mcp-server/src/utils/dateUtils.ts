/**
 * Date Utilities (dayjs)
 *
 * Centralized date operations using dayjs for consistency and reliability.
 * Replaces manual millisecond calculations throughout the codebase.
 */

import dayjs, { type Dayjs } from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear.js';
import isBetween from 'dayjs/plugin/isBetween.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter.js';
import duration from 'dayjs/plugin/duration.js';

// Register plugins
dayjs.extend(weekOfYear);
dayjs.extend(isBetween);
dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
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
 */
export function daysBetween(start: string | Date | Dayjs, end: string | Date | Dayjs): number {
  return Math.ceil(dayjs(end).diff(dayjs(start), 'day', true));
}

/**
 * Get Monday of the week
 * Replaces: date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
 */
export function startOfWeek(date?: string | Date | Dayjs): Dayjs {
  return dayjs(date).startOf('week').add(1, 'day'); // dayjs week starts Sunday, we want Monday
}

/**
 * Get Sunday of the week
 */
export function endOfWeek(date?: string | Date | Dayjs): Dayjs {
  return startOfWeek(date).add(6, 'day');
}

/**
 * Add days to a date
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
 * Add months to a date
 */
export function addMonths(date: string | Date | Dayjs, months: number): Dayjs {
  return dayjs(date).add(months, 'month');
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
 * Format date for display
 */
export function formatDate(date: string | Date | Dayjs, format = 'MMM D, YYYY'): string {
  return dayjs(date).format(format);
}

/**
 * Get month name
 */
export function getMonthName(date: string | Date | Dayjs): string {
  return dayjs(date).format('MMMM');
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
 * Get year and month key (YYYY-MM)
 */
export function getYearMonthKey(date: string | Date | Dayjs): string {
  return dayjs(date).format('YYYY-MM');
}

// ============================================
// DEADLINE UTILITIES
// ============================================

/**
 * Parse deadline from various formats
 * Handles: ISO strings, "X months/weeks/days" patterns
 */
export function parseDeadline(deadline: string): Dayjs | null {
  // Try ISO date first
  const isoDate = dayjs(deadline);
  if (isoDate.isValid()) {
    return isoDate;
  }

  // Try relative patterns
  const match = deadline.match(/(\d+)\s*(month|week|day)s?/i);
  if (match) {
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase() as 'month' | 'week' | 'day';
    return dayjs().add(value, unit);
  }

  return null;
}

/**
 * Calculate milliseconds until deadline
 */
export function msUntilDeadline(deadline: string | Date | Dayjs): number {
  return dayjs(deadline).diff(dayjs());
}

/**
 * Check if deadline is valid (in the future)
 */
export function isValidDeadline(deadline: string | Date | Dayjs): boolean {
  return dayjs(deadline).isAfter(dayjs());
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
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMonths,
  toISODate,
  toISO,
  formatDate,
  getMonthName,
  isBefore,
  isAfter,
  isDateRangeOverlapping,
  getWeekNumber,
  getYearMonthKey,
  parseDeadline,
  msUntilDeadline,
  isValidDeadline,
  normalizeDbDate,
};
