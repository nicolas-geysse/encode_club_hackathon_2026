/**
 * Savings Helper Module
 *
 * Calculates which weeks receive monthly savings based on the income day.
 * Used by WeeklyProgressCards to display savings badges on the appropriate weeks.
 */

/**
 * Information about a month's savings being applied to a specific week
 */
export interface MonthlySavingsInfo {
  weekNumber: number;
  amount: number;
  month: string; // Month name: "January", "February", etc.
  year: number;
  incomeDate: string; // ISO date string
  isAdjusted: boolean;
  adjustedAmount?: number;
}

/**
 * Savings adjustments stored in followup data
 */
export interface SavingsAdjustment {
  amount: number;
  note?: string;
  adjustedAt: string;
}

/**
 * Savings credits stored in followup data (auto-credited)
 */
export interface SavingsCredits {
  [monthKey: string]: number; // "2026-01" -> 200 (amount credited)
}

/**
 * Calculate which weeks receive monthly savings
 *
 * @param goalStartDate - When the goal started (typically today)
 * @param goalEndDate - Goal deadline
 * @param incomeDay - Day of month when income arrives (1-31)
 * @param monthlyMargin - Monthly net margin (income - expenses)
 * @returns Array of savings info for each relevant week
 */
export function calculateSavingsWeeks(
  goalStartDate: Date | string,
  goalEndDate: Date | string,
  incomeDay: number,
  monthlyMargin: number
): MonthlySavingsInfo[] {
  if (monthlyMargin <= 0) return [];

  const result: MonthlySavingsInfo[] = [];
  const startDate = new Date(goalStartDate);
  const endDate = new Date(goalEndDate);

  // Normalize incomeDay to valid range
  const normalizedIncomeDay = Math.min(Math.max(1, incomeDay), 28); // Use 28 to avoid month-end issues

  // Iterate through months in the goal period
  let currentMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (currentMonth <= endDate) {
    // Calculate the income date for this month
    const incomeDate = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      normalizedIncomeDay
    );

    // Skip if income date is before goal start
    if (incomeDate >= startDate && incomeDate <= endDate) {
      // Calculate which week number this income date falls in
      const weekNumber = getWeekNumberForDate(startDate, incomeDate);

      if (weekNumber > 0) {
        result.push({
          weekNumber,
          amount: monthlyMargin,
          month: incomeDate.toLocaleString('en', { month: 'long' }),
          year: incomeDate.getFullYear(),
          incomeDate: incomeDate.toISOString().split('T')[0],
          isAdjusted: false,
        });
      }
    }

    // Move to next month
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
  }

  return result;
}

/**
 * Get the week number (1-indexed) for a date relative to a start date
 */
function getWeekNumberForDate(startDate: Date, targetDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysDiff = Math.floor((targetDate.getTime() - startDate.getTime()) / msPerDay);
  return Math.floor(daysDiff / 7) + 1;
}

/**
 * Generate month key for savings tracking (e.g., "2026-01")
 */
export function getMonthKey(date: Date | string): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Check if savings should be auto-credited for the current month
 *
 * @param currentDate - Current date (may be simulated)
 * @param incomeDay - Day of month when income arrives
 * @param savingsCredits - Previously credited months
 * @returns Object with credit info or null if no credit needed
 */
export function checkAutoCredit(
  currentDate: Date,
  incomeDay: number,
  savingsCredits: SavingsCredits,
  monthlyMargin: number
): { monthKey: string; amount: number } | null {
  if (monthlyMargin <= 0) return null;

  const today = currentDate.getDate();
  const normalizedIncomeDay = Math.min(Math.max(1, incomeDay), 28);
  const monthKey = getMonthKey(currentDate);

  // Check if we've passed the income day and haven't credited this month
  if (today >= normalizedIncomeDay && !savingsCredits[monthKey]) {
    return { monthKey, amount: monthlyMargin };
  }

  return null;
}

/**
 * Apply savings adjustments to the calculated weeks
 */
export function applySavingsAdjustments(
  savings: MonthlySavingsInfo[],
  adjustments: Record<number, SavingsAdjustment>
): MonthlySavingsInfo[] {
  return savings.map((s) => {
    const adjustment = adjustments[s.weekNumber];
    if (adjustment) {
      return {
        ...s,
        isAdjusted: true,
        adjustedAmount: adjustment.amount,
      };
    }
    return s;
  });
}

/**
 * Get the effective savings amount for a week (adjusted or original)
 */
export function getEffectiveSavingsAmount(savings: MonthlySavingsInfo): number {
  return savings.isAdjusted && savings.adjustedAmount !== undefined
    ? savings.adjustedAmount
    : savings.amount;
}

/**
 * Format income day for display
 */
export function formatIncomeDay(incomeDay: number): string {
  if (incomeDay <= 5) return 'beginning of month';
  if (incomeDay >= 25) return 'end of month';
  return 'mid-month';
}
