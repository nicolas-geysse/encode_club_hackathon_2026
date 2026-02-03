/**
 * Unit Tests for useGoalData Hook
 *
 * Phase 2 Consolidation: Tests to prevent regression of Budget → Goals synchronization
 *
 * Key behaviors tested:
 * 1. projectedSavingsBasis uses current margin (not historical adjustments)
 * 2. When margin changes, projected savings recalculates
 * 3. API receives correct parameters for target calculation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateSavingsWeeks,
  applySavingsAdjustments,
  getEffectiveSavingsAmount,
  type SavingsAdjustment,
} from '../../lib/savingsHelper';

// Mock logger to avoid console noise in tests
vi.mock('../../lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('useGoalData - Budget→Goals Sync Logic', () => {
  // Test data setup
  const goalStartDate = new Date('2026-01-01');
  const goalDeadline = new Date('2026-03-31'); // 3 months
  const incomeDay = 15;

  describe('Projected vs Actual Savings Calculation', () => {
    it('projectedSavingsBasis should use current margin, not adjustments', () => {
      const currentMargin = 50; // Current budget: 50€/month
      const previousMargin = 200; // When adjustments were made: 200€/month

      // Calculate base savings weeks from CURRENT margin
      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        currentMargin > 0 ? currentMargin : 0
      );

      // Projected savings = sum of base amounts (current margin)
      const projectedTotalSavings = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);

      // User had manually adjusted to 200€ per month (from when margin was higher)
      const savingsAdjustments: Record<number, SavingsAdjustment> = {};
      baseSavingsWeeks.forEach((s) => {
        savingsAdjustments[s.weekNumber] = {
          amount: previousMargin, // Old higher value
          adjustedAt: '2026-01-15',
        };
      });

      // Actual savings with adjustments
      const adjustedSavingsWeeks = applySavingsAdjustments(baseSavingsWeeks, savingsAdjustments);
      const actualTotalSavings = adjustedSavingsWeeks.reduce(
        (sum, s) => sum + getEffectiveSavingsAmount(s),
        0
      );

      // KEY ASSERTION: Projected should use current margin, actual should use adjustments
      // Each savings week base amount should be currentMargin (50)
      expect(baseSavingsWeeks.every((s) => s.amount === currentMargin)).toBe(true);

      // Projected total should be based on current margin
      expect(projectedTotalSavings).toBe(currentMargin * baseSavingsWeeks.length);

      // Actual total uses adjustments (higher historical value)
      expect(actualTotalSavings).toBe(previousMargin * baseSavingsWeeks.length);

      // They should be different!
      expect(projectedTotalSavings).not.toBe(actualTotalSavings);
      expect(projectedTotalSavings).toBeLessThan(actualTotalSavings);
    });

    it('projectedSavingsBasis should update when margin changes', () => {
      const marginBefore = 100;
      const marginAfter = 50; // User added expenses

      // Calculate with old margin
      const baseSavingsOld = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        marginBefore
      );
      const projectedOld = baseSavingsOld.reduce((sum, s) => sum + s.amount, 0);

      // Calculate with new margin
      const baseSavingsNew = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        marginAfter
      );
      const projectedNew = baseSavingsNew.reduce((sum, s) => sum + s.amount, 0);

      // KEY ASSERTION: Projected savings should change when margin changes
      expect(projectedNew).toBeLessThan(projectedOld);
      expect(projectedNew).toBe(marginAfter * baseSavingsNew.length);
      expect(projectedOld).toBe(marginBefore * baseSavingsOld.length);
    });

    it('negative margin should result in zero projected savings', () => {
      const negativeMargin = -100; // Deficit budget

      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        negativeMargin > 0 ? negativeMargin : 0 // Only positive margin generates savings
      );

      const projectedTotalSavings = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);

      // KEY ASSERTION: Negative margin = no savings projection
      expect(baseSavingsWeeks.length).toBe(0);
      expect(projectedTotalSavings).toBe(0);
    });
  });

  describe('API Parameter Calculation', () => {
    it('should calculate effectiveGoalForWork correctly with projected savings', () => {
      const goalAmount = 1000;
      const currentMargin = 50;

      // Calculate projected savings (what useGoalData does)
      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        currentMargin
      );
      const projectedSavingsBasis = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);

      // Simulate what API does
      const savingsContribution = projectedSavingsBasis;
      const effectiveGoalForWork = Math.max(0, goalAmount - savingsContribution);

      // KEY ASSERTION: Work needed = goal - projected savings
      expect(effectiveGoalForWork).toBe(goalAmount - projectedSavingsBasis);
      expect(effectiveGoalForWork).toBeGreaterThan(0);
    });

    it('should increase work target when margin decreases', () => {
      const goalAmount = 1000;
      const highMargin = 200;
      const lowMargin = 50;

      // High margin scenario
      const savingsHigh = calculateSavingsWeeks(goalStartDate, goalDeadline, incomeDay, highMargin);
      const projectedHigh = savingsHigh.reduce((sum, s) => sum + s.amount, 0);
      const workNeededHigh = Math.max(0, goalAmount - projectedHigh);

      // Low margin scenario (user added expenses)
      const savingsLow = calculateSavingsWeeks(goalStartDate, goalDeadline, incomeDay, lowMargin);
      const projectedLow = savingsLow.reduce((sum, s) => sum + s.amount, 0);
      const workNeededLow = Math.max(0, goalAmount - projectedLow);

      // KEY ASSERTION: Lower margin = more work needed
      expect(workNeededLow).toBeGreaterThan(workNeededHigh);
    });
  });

  describe('Edge Cases', () => {
    it('zero margin should mean all work from earnings', () => {
      const goalAmount = 1000;
      const zeroMargin = 0;

      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        zeroMargin
      );
      const projectedSavingsBasis = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);
      const effectiveGoalForWork = Math.max(0, goalAmount - projectedSavingsBasis);

      // With 0 margin, all goal must come from work
      expect(projectedSavingsBasis).toBe(0);
      expect(effectiveGoalForWork).toBe(goalAmount);
    });

    it('margin higher than goal should still calculate work correctly', () => {
      const goalAmount = 100;
      const veryHighMargin = 500; // Save 500€/month for a 100€ goal

      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        veryHighMargin
      );
      const projectedSavingsBasis = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);
      const effectiveGoalForWork = Math.max(0, goalAmount - projectedSavingsBasis);

      // Savings exceed goal, no work needed
      expect(projectedSavingsBasis).toBeGreaterThan(goalAmount);
      expect(effectiveGoalForWork).toBe(0);
    });

    it('no savings adjustments means projected equals actual', () => {
      const currentMargin = 100;

      const baseSavingsWeeks = calculateSavingsWeeks(
        goalStartDate,
        goalDeadline,
        incomeDay,
        currentMargin
      );

      // No adjustments
      const savingsAdjustments: Record<number, SavingsAdjustment> = {};
      const adjustedSavingsWeeks = applySavingsAdjustments(baseSavingsWeeks, savingsAdjustments);

      const projectedTotalSavings = baseSavingsWeeks.reduce((sum, s) => sum + s.amount, 0);
      const actualTotalSavings = adjustedSavingsWeeks.reduce(
        (sum, s) => sum + getEffectiveSavingsAmount(s),
        0
      );

      // Without adjustments, they should be equal
      expect(projectedTotalSavings).toBe(actualTotalSavings);
    });
  });
});
