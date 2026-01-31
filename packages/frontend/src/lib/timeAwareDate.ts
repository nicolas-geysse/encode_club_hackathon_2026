/**
 * Time-Aware Date Utilities
 *
 * Centralized date logic for simulation support.
 * Uses simulated date when provided, otherwise falls back to real date.
 *
 * @reusable - Can be extracted for other projects needing time simulation
 */

/**
 * Time context passed from SimulationContext
 */
export interface TimeContext {
  /** ISO string from SimulationContext (simulatedDate) */
  simulatedDate?: string;
  /** Whether simulation is active */
  isSimulating?: boolean;
  /** Number of days offset from real date */
  offsetDays?: number;
}

/**
 * Get reference date - uses simulated date if provided
 *
 * @example
 * // Real date (no context)
 * const now = getReferenceDate();
 *
 * // Simulated date
 * const simDate = getReferenceDate({ simulatedDate: '2026-06-01T00:00:00Z' });
 */
export function getReferenceDate(context?: TimeContext): Date {
  if (context?.simulatedDate) {
    return new Date(context.simulatedDate);
  }
  return new Date();
}

/**
 * Calculate months until a target date
 *
 * @returns Number of months (0 if date is in the past)
 */
export function getMonthsUntil(targetDate: string, context?: TimeContext): number {
  const now = getReferenceDate(context);
  const target = new Date(targetDate);
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return Math.max(0, months);
}

/**
 * Calculate weeks until a target date
 *
 * @returns Number of weeks (0 if date is in the past)
 */
export function getWeeksUntil(targetDate: string, context?: TimeContext): number {
  const now = getReferenceDate(context);
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (7 * 24 * 60 * 60 * 1000)));
}

/**
 * Calculate days until a target date
 *
 * @returns Number of days (can be negative if date is in the past)
 */
export function getDaysUntil(targetDate: string, context?: TimeContext): number {
  const now = getReferenceDate(context);
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

/**
 * Check if a deadline has passed
 */
export function isDeadlinePassed(deadline: string, context?: TimeContext): boolean {
  const now = getReferenceDate(context);
  return now > new Date(deadline);
}

/**
 * Format time remaining in human-readable form
 *
 * @example
 * formatTimeRemaining('2026-06-01') // "3 months"
 * formatTimeRemaining('2026-02-15') // "2 weeks"
 * formatTimeRemaining('2025-01-01') // "deadline passed"
 */
export function formatTimeRemaining(targetDate: string, context?: TimeContext): string {
  if (isDeadlinePassed(targetDate, context)) {
    return 'deadline passed';
  }

  const weeks = getWeeksUntil(targetDate, context);
  const months = getMonthsUntil(targetDate, context);

  if (months >= 2) {
    return `${months} month${months > 1 ? 's' : ''}`;
  } else if (weeks >= 1) {
    return `${weeks} week${weeks > 1 ? 's' : ''}`;
  } else {
    const days = getDaysUntil(targetDate, context);
    return `${days} day${days > 1 ? 's' : ''}`;
  }
}

/**
 * Calculate relative date from reference (used for deadline parsing)
 */
export function calculateRelativeDateFromReference(
  amount: number,
  unit: 'days' | 'weeks' | 'months' | 'years',
  context?: TimeContext
): Date {
  const targetDate = new Date(getReferenceDate(context));

  switch (unit) {
    case 'days':
      targetDate.setDate(targetDate.getDate() + amount);
      break;
    case 'weeks':
      targetDate.setDate(targetDate.getDate() + amount * 7);
      break;
    case 'months':
      targetDate.setMonth(targetDate.getMonth() + amount);
      break;
    case 'years':
      targetDate.setFullYear(targetDate.getFullYear() + amount);
      break;
  }

  return targetDate;
}

/**
 * Format a date relative to the reference date
 *
 * @example
 * formatRelativeToReference('2026-06-01', ctx) // "in 3 months"
 * formatRelativeToReference('2025-12-01', ctx) // "1 month ago"
 */
export function formatRelativeToReference(targetDate: string, context?: TimeContext): string {
  const now = getReferenceDate(context);
  const target = new Date(targetDate);
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays === 0) {
    return 'today';
  }

  const absDays = Math.abs(diffDays);
  const suffix = diffDays > 0 ? '' : ' ago';
  const prefix = diffDays > 0 ? 'in ' : '';

  if (absDays < 7) {
    return `${prefix}${absDays} day${absDays > 1 ? 's' : ''}${suffix}`;
  } else if (absDays < 30) {
    const weeks = Math.ceil(absDays / 7);
    return `${prefix}${weeks} week${weeks > 1 ? 's' : ''}${suffix}`;
  } else if (absDays < 365) {
    const months = Math.ceil(absDays / 30);
    return `${prefix}${months} month${months > 1 ? 's' : ''}${suffix}`;
  } else {
    const years = Math.floor(absDays / 365);
    return `${prefix}${years} year${years > 1 ? 's' : ''}${suffix}`;
  }
}
