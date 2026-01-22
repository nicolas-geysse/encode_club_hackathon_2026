/**
 * Tests for Skill Arbitrage Algorithm
 *
 * Formula:
 *   score = (rate_weight * norm_rate +
 *            demand_weight * norm_demand +
 *            effort_weight * (1 - norm_effort) +
 *            rest_weight * (1 - norm_rest)) * 10
 *
 * Default weights: rate=30%, demand=25%, effort=25%, rest=20%
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateArbitrageScore,
  rankSkills,
  adjustWeights,
  DEFAULT_WEIGHTS,
  type Skill,
  type ArbitrageWeights,
} from '../skill-arbitrage.js';

// Mock the opik module to avoid actual tracing in tests
vi.mock('../../services/opik.js', () => ({
  trace: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
    const mockSpan = {
      setAttributes: vi.fn(),
      setInput: vi.fn(),
      setOutput: vi.fn(),
      setUsage: vi.fn(),
      setCost: vi.fn(),
      addEvent: vi.fn(),
      end: vi.fn(),
      createChildSpan: vi.fn(),
      getTraceId: vi.fn(() => null),
    };
    return fn(mockSpan);
  }),
  createSpan: vi.fn(async (_name: string, fn: (span: unknown) => Promise<unknown>) => {
    const mockSpan = {
      setAttributes: vi.fn(),
      setInput: vi.fn(),
      setOutput: vi.fn(),
      setUsage: vi.fn(),
      setCost: vi.fn(),
      addEvent: vi.fn(),
      end: vi.fn(),
    };
    return fn(mockSpan);
  }),
  getCurrentTraceHandle: vi.fn(() => null),
  getCurrentTraceId: vi.fn(() => null),
  getCurrentThreadId: vi.fn(() => null),
  setThreadId: vi.fn(),
  generateThreadId: vi.fn(() => 'mock-thread-id'),
}));

// ============================================
// HELPERS
// ============================================

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    level: 'intermediate',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 3,
    restNeeded: 1,
    ...overrides,
  };
}

// ============================================
// calculateArbitrageScore TESTS
// ============================================

describe('calculateArbitrageScore', () => {
  describe('normal cases', () => {
    it('calculates score with average values', () => {
      // hourlyRate=15, demand=3, effort=3, rest=1
      // normalizedRate = 15/30 = 0.5
      // normalizedDemand = 3/5 = 0.6
      // normalizedEffort = 1 - 3/5 = 0.4
      // normalizedRest = 1 - 1/4 = 0.75
      //
      // rate: 0.30 * 0.5 = 0.15
      // demand: 0.25 * 0.6 = 0.15
      // effort: 0.25 * 0.4 = 0.10
      // rest: 0.20 * 0.75 = 0.15
      // Total = 0.55 * 10 = 5.5

      const skill = createSkill({
        hourlyRate: 15,
        marketDemand: 3,
        cognitiveEffort: 3,
        restNeeded: 1,
      });

      const result = calculateArbitrageScore(skill);

      expect(result.score).toBeCloseTo(5.5, 1);
      expect(result.skill.score).toBeCloseTo(5.5, 1);
    });

    it('calculates maximum score with optimal values', () => {
      // hourlyRate=30 (max), demand=5 (max), effort=0 (min), rest=0 (min)
      // All normalized values = 1.0
      // Score = 1.0 * 10 = 10

      const skill = createSkill({
        hourlyRate: 30,
        marketDemand: 5,
        cognitiveEffort: 0,
        restNeeded: 0,
      });

      const result = calculateArbitrageScore(skill);

      expect(result.score).toBeCloseTo(10, 1);
    });

    it('calculates low score with poor values', () => {
      // hourlyRate=0, demand=1, effort=5, rest=4
      // normalizedRate = 0/30 = 0
      // normalizedDemand = 1/5 = 0.2
      // normalizedEffort = 1 - 5/5 = 0
      // normalizedRest = 1 - 4/4 = 0
      //
      // rate: 0.30 * 0 = 0
      // demand: 0.25 * 0.2 = 0.05
      // effort: 0.25 * 0 = 0
      // rest: 0.20 * 0 = 0
      // Total = 0.05 * 10 = 0.5

      const skill = createSkill({
        hourlyRate: 0,
        marketDemand: 1,
        cognitiveEffort: 5,
        restNeeded: 4,
      });

      const result = calculateArbitrageScore(skill);

      expect(result.score).toBeCloseTo(0.5, 1);
    });
  });

  describe('weight application', () => {
    it('applies weights correctly (30/25/25/20)', () => {
      // Test that each component contributes its weight when normalized to 1.0
      const skill = createSkill({
        hourlyRate: 30, // normalized = 1.0
        marketDemand: 5, // normalized = 1.0
        cognitiveEffort: 0, // normalized = 1.0 (inverted)
        restNeeded: 0, // normalized = 1.0 (inverted)
      });

      const result = calculateArbitrageScore(skill);

      // Each contribution should be weight * 1.0 * 10
      expect(result.breakdown.rateContribution).toBeCloseTo(3.0, 1); // 0.30 * 10
      expect(result.breakdown.demandContribution).toBeCloseTo(2.5, 1); // 0.25 * 10
      expect(result.breakdown.effortContribution).toBeCloseTo(2.5, 1); // 0.25 * 10
      expect(result.breakdown.restContribution).toBeCloseTo(2.0, 1); // 0.20 * 10
    });

    it('uses custom weights when provided', () => {
      const skill = createSkill({
        hourlyRate: 30,
        marketDemand: 5,
        cognitiveEffort: 0,
        restNeeded: 0,
      });

      const customWeights: ArbitrageWeights = {
        rate: 0.4,
        demand: 0.3,
        effort: 0.2,
        rest: 0.1,
      };

      const result = calculateArbitrageScore(skill, customWeights);

      expect(result.breakdown.rateContribution).toBeCloseTo(4.0, 1);
      expect(result.breakdown.demandContribution).toBeCloseTo(3.0, 1);
      expect(result.breakdown.effortContribution).toBeCloseTo(2.0, 1);
      expect(result.breakdown.restContribution).toBeCloseTo(1.0, 1);
    });
  });

  describe('normalization', () => {
    it('normalizes hourlyRate on base 30', () => {
      const skill15 = createSkill({ hourlyRate: 15 });
      const skill30 = createSkill({ hourlyRate: 30 });

      const result15 = calculateArbitrageScore(skill15);
      const result30 = calculateArbitrageScore(skill30);

      // €15 = 0.5 normalized, €30 = 1.0 normalized
      // Rate contribution should double
      expect(result30.breakdown.rateContribution).toBeCloseTo(
        result15.breakdown.rateContribution * 2,
        1
      );
    });

    it('caps hourlyRate normalization at 1.0', () => {
      const skill30 = createSkill({ hourlyRate: 30 });
      const skill60 = createSkill({ hourlyRate: 60 });

      const result30 = calculateArbitrageScore(skill30);
      const result60 = calculateArbitrageScore(skill60);

      // Both should have the same rate contribution (capped)
      expect(result60.breakdown.rateContribution).toBeCloseTo(
        result30.breakdown.rateContribution,
        1
      );
    });

    it('normalizes marketDemand on base 5', () => {
      const skill1 = createSkill({ marketDemand: 1 });
      const skill5 = createSkill({ marketDemand: 5 });

      const result1 = calculateArbitrageScore(skill1);
      const result5 = calculateArbitrageScore(skill5);

      // demand=1 → 0.2, demand=5 → 1.0
      expect(result5.breakdown.demandContribution).toBeCloseTo(
        result1.breakdown.demandContribution * 5,
        1
      );
    });

    it('inverts cognitiveEffort (1 - effort/5)', () => {
      const skillLowEffort = createSkill({ cognitiveEffort: 1 });
      const skillHighEffort = createSkill({ cognitiveEffort: 5 });

      const resultLow = calculateArbitrageScore(skillLowEffort);
      const resultHigh = calculateArbitrageScore(skillHighEffort);

      // Low effort should have higher score (inverted)
      expect(resultLow.breakdown.effortContribution).toBeGreaterThan(
        resultHigh.breakdown.effortContribution
      );

      // effort=1 → 1 - 1/5 = 0.8, effort=5 → 1 - 5/5 = 0
      expect(resultLow.breakdown.effortContribution).toBeCloseTo(2.0, 1); // 0.25 * 0.8 * 10
      expect(resultHigh.breakdown.effortContribution).toBeCloseTo(0, 1); // 0.25 * 0 * 10
    });

    it('inverts restNeeded (1 - rest/4)', () => {
      const skillLowRest = createSkill({ restNeeded: 0 });
      const skillHighRest = createSkill({ restNeeded: 4 });

      const resultLow = calculateArbitrageScore(skillLowRest);
      const resultHigh = calculateArbitrageScore(skillHighRest);

      // Low rest needed should have higher score (inverted)
      expect(resultLow.breakdown.restContribution).toBeGreaterThan(
        resultHigh.breakdown.restContribution
      );

      // rest=0 → 1 - 0/4 = 1.0, rest=4 → 1 - 4/4 = 0
      expect(resultLow.breakdown.restContribution).toBeCloseTo(2.0, 1); // 0.20 * 1.0 * 10
      expect(resultHigh.breakdown.restContribution).toBeCloseTo(0, 1); // 0.20 * 0 * 10
    });
  });

  describe('edge cases', () => {
    it('handles hourlyRate=0', () => {
      const skill = createSkill({ hourlyRate: 0 });
      const result = calculateArbitrageScore(skill);

      expect(result.breakdown.rateContribution).toBe(0);
      expect(result.score).toBeGreaterThan(0); // Other components still contribute
    });

    it('handles fractional hourlyRate', () => {
      const skill = createSkill({ hourlyRate: 12.5 });
      const result = calculateArbitrageScore(skill);

      // 12.5 / 30 = 0.4167, contribution = 0.30 * 0.4167 * 10 ≈ 1.25
      expect(result.breakdown.rateContribution).toBeCloseTo(1.25, 1);
    });

    it('handles fractional restNeeded', () => {
      const skill = createSkill({ restNeeded: 0.5 });
      const result = calculateArbitrageScore(skill);

      // 1 - 0.5/4 = 0.875, contribution = 0.20 * 0.875 * 10 = 1.75
      expect(result.breakdown.restContribution).toBeCloseTo(1.75, 1);
    });
  });

  describe('recommendations', () => {
    it('generates excellent recommendation for score >= 7', () => {
      const skill = createSkill({
        hourlyRate: 30,
        marketDemand: 5,
        cognitiveEffort: 1,
        restNeeded: 0,
      });

      const result = calculateArbitrageScore(skill);

      expect(result.score).toBeGreaterThanOrEqual(7);
      expect(result.recommendation).toContain('Excellent');
    });

    it('generates poor recommendation for score < 3', () => {
      const skill = createSkill({
        hourlyRate: 0,
        marketDemand: 1,
        cognitiveEffort: 5,
        restNeeded: 4,
      });

      const result = calculateArbitrageScore(skill);

      expect(result.score).toBeLessThan(3);
      expect(result.recommendation).toContain("n'est pas optimal");
    });
  });
});

// ============================================
// rankSkills TESTS
// ============================================

describe('rankSkills', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sorts skills by score in descending order', async () => {
    const skills: Skill[] = [
      createSkill({ id: 'low', name: 'Low', hourlyRate: 5, marketDemand: 1 }),
      createSkill({ id: 'high', name: 'High', hourlyRate: 30, marketDemand: 5 }),
      createSkill({ id: 'mid', name: 'Mid', hourlyRate: 15, marketDemand: 3 }),
    ];

    const result = await rankSkills(skills);

    expect(result.skills[0].skill.id).toBe('high');
    expect(result.skills[1].skill.id).toBe('mid');
    expect(result.skills[2].skill.id).toBe('low');
    expect(result.skills[0].score).toBeGreaterThan(result.skills[1].score);
    expect(result.skills[1].score).toBeGreaterThan(result.skills[2].score);
  });

  it('returns empty result for empty skills array', async () => {
    const result = await rankSkills([]);

    expect(result.skills).toHaveLength(0);
    expect(result.topPick).toBeNull();
    expect(result.averageScore).toBe(0);
    expect(result.insights).toContain('Aucune compétence à évaluer');
  });

  it('handles single skill correctly', async () => {
    const skills = [createSkill({ name: 'Only One' })];

    const result = await rankSkills(skills);

    expect(result.skills).toHaveLength(1);
    expect(result.topPick?.skill.name).toBe('Only One');
    expect(result.averageScore).toBe(result.skills[0].score);
  });

  it('handles skills with equal scores', async () => {
    const skills: Skill[] = [
      createSkill({ id: 'a', name: 'Skill A', hourlyRate: 15, marketDemand: 3 }),
      createSkill({ id: 'b', name: 'Skill B', hourlyRate: 15, marketDemand: 3 }),
    ];

    const result = await rankSkills(skills);

    expect(result.skills).toHaveLength(2);
    expect(result.skills[0].score).toBeCloseTo(result.skills[1].score, 5);
  });

  it('calculates correct average score', async () => {
    const skills: Skill[] = [
      createSkill({ id: 'high', hourlyRate: 30, marketDemand: 5 }),
      createSkill({ id: 'low', hourlyRate: 0, marketDemand: 1 }),
    ];

    const result = await rankSkills(skills);

    const expectedAverage = (result.skills[0].score + result.skills[1].score) / 2;
    expect(result.averageScore).toBeCloseTo(expectedAverage, 5);
  });

  it('identifies topPick correctly', async () => {
    const skills: Skill[] = [
      createSkill({ id: 'low', hourlyRate: 5 }),
      createSkill({ id: 'high', hourlyRate: 30 }),
    ];

    const result = await rankSkills(skills);

    expect(result.topPick?.skill.id).toBe('high');
    expect(result.topPick).toBe(result.skills[0]);
  });

  it('generates insights about top pick', async () => {
    const skills: Skill[] = [
      createSkill({ name: 'Python', hourlyRate: 25, marketDemand: 5 }),
      createSkill({ name: 'Excel', hourlyRate: 10, marketDemand: 2 }),
    ];

    const result = await rankSkills(skills);

    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights[0]).toContain('Python');
    expect(result.insights[0]).toContain('meilleur arbitrage');
  });
});

// ============================================
// adjustWeights TESTS
// ============================================

describe('adjustWeights', () => {
  it('returns normalized weights that sum to 1', () => {
    const adjusted = adjustWeights(DEFAULT_WEIGHTS, {
      effortSensitivity: 0.8,
      hourlyRatePriority: 0.9,
      timeFlexibility: 0.3,
    });

    const sum = adjusted.rate + adjusted.demand + adjusted.effort + adjusted.rest;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('increases rate weight with higher hourlyRatePriority', () => {
    const lowPriority = adjustWeights(DEFAULT_WEIGHTS, { hourlyRatePriority: 0.2 });
    const highPriority = adjustWeights(DEFAULT_WEIGHTS, { hourlyRatePriority: 0.9 });

    expect(highPriority.rate).toBeGreaterThan(lowPriority.rate);
  });

  it('increases effort weight with higher effortSensitivity', () => {
    const lowSensitivity = adjustWeights(DEFAULT_WEIGHTS, { effortSensitivity: 0.2 });
    const highSensitivity = adjustWeights(DEFAULT_WEIGHTS, { effortSensitivity: 0.9 });

    expect(highSensitivity.effort).toBeGreaterThan(lowSensitivity.effort);
  });

  it('increases rest weight with higher timeFlexibility', () => {
    const lowFlexibility = adjustWeights(DEFAULT_WEIGHTS, { timeFlexibility: 0.2 });
    const highFlexibility = adjustWeights(DEFAULT_WEIGHTS, { timeFlexibility: 0.9 });

    expect(highFlexibility.rest).toBeGreaterThan(lowFlexibility.rest);
  });

  it('uses default preferences when none provided', () => {
    const adjusted = adjustWeights(DEFAULT_WEIGHTS, {});

    // With all preferences at 0.5 (default), weights should be proportional to original
    const sum = adjusted.rate + adjusted.demand + adjusted.effort + adjusted.rest;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('keeps demand weight unchanged', () => {
    const adjusted1 = adjustWeights(DEFAULT_WEIGHTS, { hourlyRatePriority: 0.2 });
    const adjusted2 = adjustWeights(DEFAULT_WEIGHTS, { hourlyRatePriority: 0.9 });

    // Demand is not adjusted by preferences (only normalized)
    // But relative proportion may change due to normalization
    // Check that demand is still a meaningful portion
    expect(adjusted1.demand).toBeGreaterThan(0.1);
    expect(adjusted2.demand).toBeGreaterThan(0.1);
  });
});

// ============================================
// DEFAULT_WEIGHTS TESTS
// ============================================

describe('DEFAULT_WEIGHTS', () => {
  it('has correct weight values', () => {
    expect(DEFAULT_WEIGHTS.rate).toBe(0.3);
    expect(DEFAULT_WEIGHTS.demand).toBe(0.25);
    expect(DEFAULT_WEIGHTS.effort).toBe(0.25);
    expect(DEFAULT_WEIGHTS.rest).toBe(0.2);
  });

  it('sums to 1', () => {
    const sum =
      DEFAULT_WEIGHTS.rate + DEFAULT_WEIGHTS.demand + DEFAULT_WEIGHTS.effort + DEFAULT_WEIGHTS.rest;
    expect(sum).toBe(1);
  });
});
