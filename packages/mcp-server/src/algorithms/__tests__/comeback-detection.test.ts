/**
 * Tests for Comeback Detection Algorithm
 *
 * Comeback Window triggers when:
 * - Had ≥2 low weeks (energy < 40%)
 * - Current energy > 80%
 * - Previous energy < 50% (showing recovery)
 *
 * The algorithm generates a capacity-aware catch-up plan.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  detectComebackWindow,
  generateCatchUpPlan,
  checkComebackCompletion,
  DEFAULT_CONFIG,
  DEFAULT_CAPACITIES,
  type CatchUpPlan,
} from '../comeback-detection.js';

// Mock the opik trace function to avoid actual tracing in tests
vi.mock('../../services/opik.js', () => ({
  trace: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
    const mockSpan = { setAttributes: vi.fn() };
    return fn(mockSpan);
  }),
}));

// ============================================
// detectComebackWindow TESTS
// ============================================

describe('detectComebackWindow', () => {
  describe('detection conditions', () => {
    it('detects comeback when current >80% after low period', () => {
      // History: low, low, recovered (current >80%, previous <50%)
      // Both 30 and 35 are < 40 (low threshold), 35 < 50 (previous threshold)
      const history = [30, 35, 85];
      const result = detectComebackWindow(history, 500);

      expect(result?.detected).toBe(true);
    });

    it('does not detect if never had low weeks', () => {
      // All weeks above threshold
      const history = [60, 60, 85];
      const result = detectComebackWindow(history, 500);

      expect(result).toBeNull();
    });

    it('does not detect if current energy ≤80%', () => {
      // Current exactly at threshold (80 is not >80)
      // Two low weeks (30, 35), previous < 50, but current = 80 (not > 80)
      const history = [30, 35, 80];
      const result = detectComebackWindow(history, 500);

      expect(result).toBeNull();
    });

    it('does not detect if previous week ≥50%', () => {
      // Two low weeks in history (30, 35), but previous (50) is ≥50
      // All conditions met except previousEnergy < 50
      const history = [30, 35, 50, 85];
      const result = detectComebackWindow(history, 500);

      expect(result).toBeNull();
    });

    it('requires minimum 2 low weeks', () => {
      // Only 1 low week (30), previous is 45 < 50, current > 80
      // All conditions met except minLowWeeks = 2
      const history = [60, 30, 45, 85];
      const result = detectComebackWindow(history, 500);

      expect(result).toBeNull();
    });

    it('detects with exactly 2 low weeks', () => {
      const history = [30, 35, 85];
      const result = detectComebackWindow(history, 500);

      expect(result?.detected).toBe(true);
      expect(result?.deficitWeeks).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty history', () => {
      const result = detectComebackWindow([], 500);
      expect(result).toBeNull();
    });

    it('returns null for insufficient history (< 3 weeks)', () => {
      const result = detectComebackWindow([30, 85], 500);
      expect(result).toBeNull();
    });

    it('handles very low energy followed by high recovery', () => {
      // Dramatic recovery
      const history = [10, 15, 20, 95];
      const result = detectComebackWindow(history, 500);

      expect(result?.detected).toBe(true);
      expect(result?.confidenceScore).toBeGreaterThan(0.5);
    });

    it('handles long history with recent comeback', () => {
      // Many weeks, but comeback conditions met at end
      const history = [60, 70, 80, 30, 35, 40, 90];
      const result = detectComebackWindow(history, 500);

      expect(result?.detected).toBe(true);
    });
  });

  describe('recovery week tracking', () => {
    it('sets recoveryWeek to current week number', () => {
      const history = [30, 35, 85];
      const result = detectComebackWindow(history, 500);

      expect(result?.recoveryWeek).toBe(3);
    });

    it('tracks deficit correctly', () => {
      const result = detectComebackWindow([30, 35, 85], 1000);

      expect(result?.deficit).toBe(1000);
    });
  });

  describe('suggested catch-up weeks', () => {
    it('suggests catch-up weeks based on deficit weeks', () => {
      // 2 low weeks → suggests 3 catch-up weeks (ceil(2 * 1.5))
      const history = [30, 35, 85];
      const result = detectComebackWindow(history, 500);

      expect(result?.suggestedCatchUpWeeks).toBe(3);
    });

    it('caps catch-up weeks at maxCatchUpWeeks', () => {
      // Many low weeks but capped at 3 (default)
      const history = [30, 30, 30, 30, 30, 40, 90];
      const result = detectComebackWindow(history, 500);

      expect(result?.suggestedCatchUpWeeks).toBeLessThanOrEqual(3);
    });
  });

  describe('confidence score', () => {
    it('calculates confidence based on recovery delta', () => {
      // 2 low weeks (30, 35), recovery: 90 - 35 = 55 point jump → confidence = 1.0
      const history = [30, 35, 90];
      const result = detectComebackWindow(history, 500);

      expect(result?.confidenceScore).toBe(1.0);
    });

    it('returns lower confidence for smaller recovery', () => {
      // 2 low weeks (30, 35), recovery: 85 - 35 = 50 point jump → confidence = 1.0
      // For lower confidence, need smaller delta: 85 - 45 = 40 → 0.8
      // But 45 is not < 40, so need: [30, 30, 45, 85] (2 low weeks, previous=45)
      const history = [30, 30, 45, 85];
      const result = detectComebackWindow(history, 500);

      expect(result?.confidenceScore).toBe(0.8);
    });

    it('caps confidence at 1.0', () => {
      // 2 low weeks (30, 10), huge recovery: 95 - 10 = 85 point jump → capped at 1.0
      const history = [30, 10, 95];
      const result = detectComebackWindow(history, 500);

      expect(result?.confidenceScore).toBe(1.0);
    });
  });

  describe('custom config', () => {
    it('uses custom lowThreshold', () => {
      // With threshold 50, 45 is considered low (2 weeks of 45 < 50)
      const history = [45, 45, 85];
      const result = detectComebackWindow(history, 500, { lowThreshold: 50 });

      expect(result?.detected).toBe(true);
    });

    it('uses custom recoveryThreshold', () => {
      // With threshold 70, 75 is enough. Need 2 low weeks (30, 35)
      const history = [30, 35, 75];
      const result = detectComebackWindow(history, 500, { recoveryThreshold: 70 });

      expect(result?.detected).toBe(true);
    });

    it('uses custom previousThreshold', () => {
      // With threshold 60, previous=55 triggers comeback
      // Need 2 low weeks (30, 35), then previous=55 < 60
      const history = [30, 35, 55, 85];
      const result = detectComebackWindow(history, 500, { previousThreshold: 60 });

      expect(result?.detected).toBe(true);
    });

    it('uses custom minLowWeeks', () => {
      // Require 3 low weeks, but only have 2
      const history = [30, 35, 85];
      const result = detectComebackWindow(history, 500, { minLowWeeks: 3 });

      expect(result).toBeNull();
    });
  });
});

// ============================================
// generateCatchUpPlan TESTS
// ============================================

describe('generateCatchUpPlan', () => {
  describe('plan generation', () => {
    it('generates plan with correct number of weeks', () => {
      const plan = generateCatchUpPlan(300, [90, 80, 70]);

      expect(plan).toHaveLength(3);
    });

    it('distributes deficit proportionally to capacity', () => {
      const plan = generateCatchUpPlan(240, [90, 80, 70]);
      // Total capacity: 240
      // Week 1: 90/240 * 240 = 90
      // Week 2: 80/240 * 240 = 80
      // Week 3: 70/240 * 240 = 70

      expect(plan[0].target).toBe(90);
      expect(plan[1].target).toBe(80);
      expect(plan[2].target).toBe(70);
    });

    it('assigns correct week numbers', () => {
      const plan = generateCatchUpPlan(300, [90, 80, 70]);

      expect(plan[0].week).toBe(1);
      expect(plan[1].week).toBe(2);
      expect(plan[2].week).toBe(3);
    });

    it('includes capacity in each week', () => {
      const plan = generateCatchUpPlan(300, [90, 80, 70]);

      expect(plan[0].capacity).toBe(90);
      expect(plan[1].capacity).toBe(80);
      expect(plan[2].capacity).toBe(70);
    });
  });

  describe('effort levels', () => {
    it('assigns light effort for low utilization', () => {
      // Low target relative to capacity
      const plan = generateCatchUpPlan(60, [90, 80, 70]);

      // With low targets, effort should be light
      expect(plan.some((w) => w.effortLevel === 'light')).toBe(true);
    });

    it('assigns moderate effort for medium utilization', () => {
      // With deficit=120 and capacities=[90, 80, 70] (total=240):
      // Week 1: target = 45, ratio = 45/(90*0.5) = 1.0 → moderate (< 1.2)
      const plan = generateCatchUpPlan(120, [90, 80, 70]);

      // Check that we have moderate effort weeks
      expect(plan.some((w) => w.effortLevel === 'moderate')).toBe(true);
    });

    it('assigns intense effort for high utilization', () => {
      // High deficit for available capacity
      const plan = generateCatchUpPlan(600, [90, 80, 70]);

      expect(plan.some((w) => w.effortLevel === 'intense')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty plan for zero deficit', () => {
      const plan = generateCatchUpPlan(0, [90, 80, 70]);

      expect(plan).toHaveLength(0);
    });

    it('returns empty plan for negative deficit', () => {
      const plan = generateCatchUpPlan(-100, [90, 80, 70]);

      expect(plan).toHaveLength(0);
    });

    it('returns empty plan for empty capacities', () => {
      const plan = generateCatchUpPlan(300, []);

      expect(plan).toHaveLength(0);
    });

    it('handles single week capacity', () => {
      const plan = generateCatchUpPlan(100, [100]);

      expect(plan).toHaveLength(1);
      expect(plan[0].target).toBe(100);
    });
  });

  describe('default capacities', () => {
    it('uses default capacities when not provided', () => {
      const plan = generateCatchUpPlan(240);

      expect(plan).toHaveLength(3);
      // DEFAULT_CAPACITIES = [90, 80, 70]
    });
  });
});

// ============================================
// checkComebackCompletion TESTS
// ============================================

describe('checkComebackCompletion', () => {
  describe('completion status', () => {
    it('returns completed=true when earnings ≥80% of target', () => {
      const plan: CatchUpPlan[] = [
        { week: 1, target: 100, capacity: 90, effortLevel: 'moderate' },
        { week: 2, target: 80, capacity: 80, effortLevel: 'moderate' },
      ];
      // 80% of 180 = 144
      const result = checkComebackCompletion(plan, [80, 70]); // 150 total

      expect(result.completed).toBe(true);
      expect(result.completionRate).toBeGreaterThanOrEqual(0.8);
    });

    it('returns completed=false when earnings <80% of target', () => {
      const plan: CatchUpPlan[] = [
        { week: 1, target: 100, capacity: 90, effortLevel: 'moderate' },
        { week: 2, target: 100, capacity: 80, effortLevel: 'moderate' },
      ];
      // 80% of 200 = 160, but we only have 100
      const result = checkComebackCompletion(plan, [50, 50]);

      expect(result.completed).toBe(false);
    });

    it('calculates correct completion rate', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [50]);

      expect(result.completionRate).toBeCloseTo(0.5, 2);
    });
  });

  describe('achievements', () => {
    it('awards overachiever for 110%+ completion', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [115]);

      expect(result.achievement?.id).toBe('comeback_overachiever');
      expect(result.achievement?.tier).toBe('gold');
    });

    it('awards mission_complete for 100% completion', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [100]);

      expect(result.achievement?.id).toBe('comeback_complete');
      expect(result.achievement?.tier).toBe('silver');
    });

    it('awards success for 80-99% completion', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [85]);

      expect(result.achievement?.id).toBe('comeback_success');
      expect(result.achievement?.tier).toBe('bronze');
    });

    it('returns no achievement for <80% completion', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [70]);

      expect(result.achievement).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns not completed for empty plan', () => {
      const result = checkComebackCompletion([], [100]);

      expect(result.completed).toBe(false);
      expect(result.completionRate).toBe(0);
    });

    it('caps completion rate at 1.0 for calculation but not for achievement', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [200]);

      expect(result.completionRate).toBe(1.0); // Capped
      expect(result.achievement?.id).toBe('comeback_overachiever');
    });

    it('handles zero actual earnings', () => {
      const plan: CatchUpPlan[] = [{ week: 1, target: 100, capacity: 90, effortLevel: 'moderate' }];
      const result = checkComebackCompletion(plan, [0]);

      expect(result.completed).toBe(false);
      expect(result.completionRate).toBe(0);
    });
  });
});

// ============================================
// DEFAULT_CONFIG TESTS
// ============================================

describe('DEFAULT_CONFIG', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CONFIG.lowThreshold).toBe(40);
    expect(DEFAULT_CONFIG.recoveryThreshold).toBe(80);
    expect(DEFAULT_CONFIG.previousThreshold).toBe(50);
    expect(DEFAULT_CONFIG.minLowWeeks).toBe(2);
    expect(DEFAULT_CONFIG.maxCatchUpWeeks).toBe(3);
  });
});

describe('DEFAULT_CAPACITIES', () => {
  it('has correct default values', () => {
    expect(DEFAULT_CAPACITIES).toEqual([90, 80, 70]);
  });
});
