/**
 * Week Calculator Utility
 *
 * Centralized utility for calculating week information relative to a goal's timeline.
 * Used across WeeklyProgressCards, EnergyHistory, RetroplanPanel for consistent
 * current week detection and day-within-week tracking.
 */

export interface WeekInfo {
  /** Week number (1-indexed) */
  weekNumber: number;
  /** Start date of the current week */
  weekStart: Date;
  /** End date of the current week */
  weekEnd: Date;
  /** Whether this week number is within the goal's total weeks */
  isCurrentWeek: boolean;
  /** Days elapsed in current week (0 = Monday/start, 6 = Sunday/end) */
  daysIntoWeek: number;
}

/**
 * Calculate week information based on goal start date and simulated date.
 *
 * @param goalStartDate - ISO date string of goal start date
 * @param totalWeeks - Total number of weeks for the goal
 * @param simulatedDate - Optional simulated date (defaults to current date)
 * @returns WeekInfo with current week number and days into week
 */
export function getCurrentWeekInfo(
  goalStartDate: string,
  totalWeeks: number,
  simulatedDate?: Date
): WeekInfo {
  const now = simulatedDate || new Date();
  const start = new Date(goalStartDate);

  // Normalize to midnight for consistent day calculations
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  // Calculate days since start
  const daysSinceStart = Math.floor(
    (nowMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Week number is 1-indexed (Week 1 starts from day 0)
  const weekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  // Days into the current week (0-6)
  // 0 = first day of the week, 6 = last day
  const daysIntoWeek = Math.max(0, daysSinceStart >= 0 ? daysSinceStart % 7 : 0);

  // Calculate week start and end dates
  const weekStart = new Date(startMidnight);
  weekStart.setDate(startMidnight.getDate() + (weekNumber - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return {
    weekNumber,
    weekStart,
    weekEnd,
    isCurrentWeek: weekNumber >= 1 && weekNumber <= totalWeeks,
    daysIntoWeek,
  };
}

/**
 * Get the week number for a specific date relative to goal start.
 *
 * @param date - The date to check
 * @param goalStartDate - Start date of the goal
 * @returns Week number (1-indexed)
 */
export function getWeekNumberFromDate(date: Date, goalStartDate: Date): number {
  const dateMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const startMidnight = new Date(
    goalStartDate.getFullYear(),
    goalStartDate.getMonth(),
    goalStartDate.getDate()
  );

  const daysSinceStart = Math.floor(
    (dateMidnight.getTime() - startMidnight.getTime()) / (1000 * 60 * 60 * 24)
  );

  return Math.max(1, Math.floor(daysSinceStart / 7) + 1);
}

/**
 * Check if a given week number is the current week based on simulated date.
 *
 * @param weekNumber - Week number to check
 * @param goalStartDate - ISO date string of goal start date
 * @param simulatedDate - Optional simulated date
 * @returns true if this is the current week
 */
export function isCurrentWeekNumber(
  weekNumber: number,
  goalStartDate: string,
  simulatedDate?: Date
): boolean {
  const now = simulatedDate || new Date();
  const start = new Date(goalStartDate);

  const daysSinceStart = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

  const currentWeekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  return weekNumber === currentWeekNumber;
}

/**
 * Calculate the number of weeks between two dates.
 *
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Number of weeks (rounded up)
 */
export function calculateTotalWeeks(startDate: Date, endDate: Date): number {
  const diffTime = endDate.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(diffDays / 7));
}
