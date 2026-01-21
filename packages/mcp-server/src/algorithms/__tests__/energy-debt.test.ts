/**
 * Tests for Energy Debt Algorithm
 *
 * Energy Debt triggers when:
 * - ≥3 consecutive weeks with energy <40% (from most recent)
 *
 * Severity levels:
 * - low (3 weeks): 50% target reduction
 * - medium (4 weeks): 75% target reduction
 * - high (5+ weeks): 85% target reduction
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectEnergyDebt,
  adjustTargetForDebt,
  calculateRecoveryProgress,
  checkDebtAchievements,
  DEFAULT_CONFIG,
  type EnergyEntry,
  type EnergyDebt,
} from '../energy-debt.js';

// Mock the opik trace function to avoid actual tracing in tests
vi.mock('../../services/opik.js', () => ({
  trace: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
    const mockSpan = { setAttributes: vi.fn() };
    return fn(mockSpan);
  }),
}));

// ============================================
// HELPERS
// ============================================

function createEnergyHistory(levels: number[]): EnergyEntry[] {
  return levels.map((level, index) => ({
    week: index + 1,
    level,
    date: `2024-01-${String(index + 1).padStart(2, '0')}`,
  }));
}

// ============================================
// detectEnergyDebt TESTS
// ============================================

describe('detectEnergyDebt', () => {
  describe('detection conditions', () => {
    it('detects 3+ consecutive weeks <40% from most recent', () => {
      // 3 weeks at 30% (below threshold)
      const history = createEnergyHistory([30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(true);
      expect(result.consecutiveLowWeeks).toBe(3);
    });

    it('does not trigger with 2 consecutive weeks <40%', () => {
      // Only 2 weeks at 30%
      const history = createEnergyHistory([30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(false);
      expect(result.consecutiveLowWeeks).toBe(0);
    });

    it('does not trigger when recent week breaks the chain', () => {
      // 3 low weeks followed by 1 good week
      const history = createEnergyHistory([30, 30, 30, 50]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(false);
      expect(result.consecutiveLowWeeks).toBe(0);
    });

    it('counts consecutive weeks from most recent backwards', () => {
      // Good week, then 4 low weeks
      const history = createEnergyHistory([50, 30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(true);
      expect(result.consecutiveLowWeeks).toBe(4);
    });

    it('handles exactly at threshold (40%) as not low', () => {
      // Exactly at 40% should not count as low
      const history = createEnergyHistory([40, 40, 40]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(false);
    });

    it('handles energy just below threshold (39%) as low', () => {
      const history = createEnergyHistory([39, 39, 39]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(true);
    });
  });

  describe('severity levels', () => {
    it('returns low severity for 3 consecutive weeks', () => {
      const history = createEnergyHistory([30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.severity).toBe('low');
      expect(result.targetReduction).toBe(0.5); // 50%
    });

    it('returns medium severity for 4 consecutive weeks', () => {
      const history = createEnergyHistory([30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.severity).toBe('medium');
      expect(result.targetReduction).toBe(0.75); // 75%
    });

    it('returns high severity for 5+ consecutive weeks', () => {
      const history = createEnergyHistory([30, 30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.severity).toBe('high');
      expect(result.targetReduction).toBe(0.85); // 85%
    });

    it('returns high severity for 6+ consecutive weeks', () => {
      const history = createEnergyHistory([30, 30, 30, 30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.severity).toBe('high');
      expect(result.targetReduction).toBe(0.85);
    });
  });

  describe('accumulated debt', () => {
    it('calculates accumulated debt as weeks * points per week', () => {
      const history = createEnergyHistory([30, 30, 30]);
      const result = detectEnergyDebt(history);

      // Default: 30 points per week * 3 weeks = 90
      expect(result.accumulatedDebt).toBe(90);
    });

    it('uses custom points per week config', () => {
      const history = createEnergyHistory([30, 30, 30]);
      const result = detectEnergyDebt(history, { debtPointsPerWeek: 50 });

      expect(result.accumulatedDebt).toBe(150); // 50 * 3
    });
  });

  describe('suggestions', () => {
    it('generates suggestions for low severity', () => {
      const history = createEnergyHistory([30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions).toContain('🧘 Prends du temps pour te reposer');
    });

    it('generates additional suggestions for medium severity', () => {
      const history = createEnergyHistory([30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.suggestions).toContain('📱 Limite les écrans le soir');
    });

    it('generates professional help suggestion for high severity', () => {
      const history = createEnergyHistory([30, 30, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.suggestions).toContain('👨‍⚕️ Considère parler à un professionnel');
    });
  });

  describe('edge cases', () => {
    it('returns no debt for empty history', () => {
      const result = detectEnergyDebt([]);

      expect(result.detected).toBe(false);
    });

    it('returns no debt for insufficient history', () => {
      const history = createEnergyHistory([30, 30]); // Only 2 entries
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(false);
    });

    it('handles mixed high and low weeks correctly', () => {
      // Pattern: good, low, low, low (3 low at end)
      const history = createEnergyHistory([60, 30, 30, 30]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(true);
      expect(result.consecutiveLowWeeks).toBe(3);
    });

    it('handles custom threshold config', () => {
      // With threshold of 50, all these are low
      const history = createEnergyHistory([45, 45, 45]);
      const result = detectEnergyDebt(history, { threshold: 50 });

      expect(result.detected).toBe(true);
    });

    it('handles custom minimum consecutive weeks config', () => {
      // Require 2 weeks instead of 3
      const history = createEnergyHistory([30, 30]);
      const result = detectEnergyDebt(history, { minConsecutiveWeeks: 2 });

      expect(result.detected).toBe(true);
    });
  });

  describe('reset after recovery', () => {
    it('does not detect debt after recovery period', () => {
      // 3 low weeks, then 1 good week (chain broken)
      const history = createEnergyHistory([30, 30, 30, 60]);
      const result = detectEnergyDebt(history);

      expect(result.detected).toBe(false);
    });
  });
});

// ============================================
// adjustTargetForDebt TESTS
// ============================================

describe('adjustTargetForDebt', () => {
  it('returns unchanged target when no debt detected', () => {
    const noDebt: EnergyDebt = {
      detected: false,
      consecutiveLowWeeks: 0,
      severity: 'low',
      accumulatedDebt: 0,
      targetReduction: 0,
      suggestions: [],
    };

    const result = adjustTargetForDebt(100, noDebt);

    expect(result.adjustedTarget).toBe(100);
    expect(result.reductionPercentage).toBe(0);
  });

  it('reduces target by 50% for low severity', () => {
    const lowDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 3,
      severity: 'low',
      accumulatedDebt: 90,
      targetReduction: 0.5,
      suggestions: [],
    };

    const result = adjustTargetForDebt(100, lowDebt);

    expect(result.adjustedTarget).toBe(50);
    expect(result.reductionPercentage).toBe(50);
  });

  it('reduces target by 75% for medium severity', () => {
    const mediumDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 4,
      severity: 'medium',
      accumulatedDebt: 120,
      targetReduction: 0.75,
      suggestions: [],
    };

    const result = adjustTargetForDebt(100, mediumDebt);

    expect(result.adjustedTarget).toBe(25);
    expect(result.reductionPercentage).toBe(75);
  });

  it('reduces target by 85% for high severity', () => {
    const highDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 5,
      severity: 'high',
      accumulatedDebt: 150,
      targetReduction: 0.85,
      suggestions: [],
    };

    const result = adjustTargetForDebt(100, highDebt);

    expect(result.adjustedTarget).toBe(15);
    expect(result.reductionPercentage).toBe(85);
  });

  it('rounds adjusted target to integer', () => {
    const debt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 3,
      severity: 'low',
      accumulatedDebt: 90,
      targetReduction: 0.5,
      suggestions: [],
    };

    const result = adjustTargetForDebt(99, debt);

    expect(result.adjustedTarget).toBe(50); // 49.5 rounded
  });

  it('includes reason in adjustment result', () => {
    const debt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 3,
      severity: 'low',
      accumulatedDebt: 90,
      targetReduction: 0.5,
      suggestions: [],
    };

    const result = adjustTargetForDebt(100, debt);

    expect(result.reason).toContain('légère');
    expect(result.reason).toContain('3 semaines');
    expect(result.reason).toContain('50%');
  });
});

// ============================================
// calculateRecoveryProgress TESTS
// ============================================

describe('calculateRecoveryProgress', () => {
  it('returns 0 for insufficient history', () => {
    const history = createEnergyHistory([60]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(0);
  });

  it('returns 0 when last week is below threshold', () => {
    const history = createEnergyHistory([30, 30, 30]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(0);
  });

  it('returns 33% for 1 good week', () => {
    const history = createEnergyHistory([30, 30, 70]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(33);
  });

  it('returns 67% for 2 good weeks', () => {
    const history = createEnergyHistory([30, 70, 70]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(67);
  });

  it('returns 100% for 3+ good weeks', () => {
    const history = createEnergyHistory([70, 70, 70]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(100);
  });

  it('uses custom recovery threshold', () => {
    // With threshold 50, 55 counts as good
    const history = createEnergyHistory([55, 55, 55]);
    const result = calculateRecoveryProgress(history, 50);

    expect(result).toBe(100);
  });

  it('caps at 100%', () => {
    const history = createEnergyHistory([70, 70, 70, 70, 70]);
    const result = calculateRecoveryProgress(history);

    expect(result).toBe(100);
  });
});

// ============================================
// checkDebtAchievements TESTS
// ============================================

describe('checkDebtAchievements', () => {
  it('unlocks debt_survivor when exiting debt', () => {
    const previousDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 3,
      severity: 'low',
      accumulatedDebt: 90,
      targetReduction: 0.5,
      suggestions: [],
    };

    const currentDebt: EnergyDebt = {
      detected: false,
      consecutiveLowWeeks: 0,
      severity: 'low',
      accumulatedDebt: 0,
      targetReduction: 0,
      suggestions: [],
    };

    const achievements = checkDebtAchievements(currentDebt, 0, previousDebt);

    expect(achievements).toContainEqual(
      expect.objectContaining({
        id: 'debt_survivor',
        unlocked: true,
      })
    );
  });

  it('unlocks fully_recharged at 100% recovery', () => {
    const noDebt: EnergyDebt = {
      detected: false,
      consecutiveLowWeeks: 0,
      severity: 'low',
      accumulatedDebt: 0,
      targetReduction: 0,
      suggestions: [],
    };

    const achievements = checkDebtAchievements(noDebt, 100, null);

    expect(achievements).toContainEqual(
      expect.objectContaining({
        id: 'fully_recharged',
        unlocked: true,
      })
    );
  });

  it('unlocks resilient when recovering from high debt', () => {
    const previousDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 5,
      severity: 'high',
      accumulatedDebt: 150,
      targetReduction: 0.85,
      suggestions: [],
    };

    const currentDebt: EnergyDebt = {
      detected: false,
      consecutiveLowWeeks: 0,
      severity: 'low',
      accumulatedDebt: 0,
      targetReduction: 0,
      suggestions: [],
    };

    const achievements = checkDebtAchievements(currentDebt, 0, previousDebt);

    expect(achievements).toContainEqual(
      expect.objectContaining({
        id: 'resilient',
        unlocked: true,
      })
    );
  });

  it('returns empty array when no achievements unlocked', () => {
    const currentDebt: EnergyDebt = {
      detected: true,
      consecutiveLowWeeks: 3,
      severity: 'low',
      accumulatedDebt: 90,
      targetReduction: 0.5,
      suggestions: [],
    };

    const achievements = checkDebtAchievements(currentDebt, 50, null);

    expect(achievements).toHaveLength(0);
  });
});

// ============================================
// DEFAULT_CONFIG TESTS
// ============================================

describe('DEFAULT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CONFIG.threshold).toBe(40);
    expect(DEFAULT_CONFIG.minConsecutiveWeeks).toBe(3);
    expect(DEFAULT_CONFIG.debtPointsPerWeek).toBe(30);
  });
});
