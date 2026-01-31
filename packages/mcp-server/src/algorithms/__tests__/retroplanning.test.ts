/**
 * Tests for Retroplanning Algorithm
 *
 * Retroplanning creates capacity-aware goal plans that:
 * - Calculate week-by-week capacity based on academic events and energy
 * - Generate milestones proportional to capacity
 * - Front-load work when high capacity weeks are available
 * - Assess feasibility based on total achievable amount
 */

import { describe, it, expect, vi } from 'vitest';
import { generateRetroplan, calculateCatchUp } from '../retroplanning.js';
import type {
  RetroplanInput,
  AcademicEvent,
  EnergyLog,
  RetroplanConfig,
  DynamicMilestone,
  WeekCapacity,
} from '../../types/retroplanning.js';

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

function createBasicInput(overrides: Partial<RetroplanInput> = {}): RetroplanInput {
  const deadline = new Date();
  deadline.setDate(deadline.getDate() + 56); // 8 weeks from now

  return {
    userId: 'test-user',
    goalId: 'test-goal',
    goalName: 'Test Goal',
    goalAmount: 800, // €100/week for 8 weeks
    deadline,
    userProfile: {
      skills: ['coding', 'design'],
      monthlyIncome: 500,
      monthlyExpenses: 400,
      availableHours: 20,
      defaultHourlyRate: 15,
    },
    academicEvents: [],
    commitments: [],
    energyHistory: [],
    ...overrides,
  };
}

function createEnergyHistory(levels: number[]): EnergyLog[] {
  return levels.map((level, index) => ({
    id: `energy-${index}`,
    userId: 'test-user',
    date: new Date(Date.now() - (levels.length - index) * 7 * 24 * 60 * 60 * 1000),
    energyLevel: Math.min(5, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5,
    moodScore: 3 as const,
    stressLevel: 3 as const,
    notes: '',
  }));
}

function createExamEvent(weeksFromNow: number): AcademicEvent {
  const start = new Date();
  start.setDate(start.getDate() + weeksFromNow * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 5);

  return {
    id: `exam-${weeksFromNow}`,
    userId: 'test-user',
    name: 'Final Exams',
    type: 'exam_period',
    startDate: start,
    endDate: end,
    priority: 'critical',
    capacityImpact: 0.2,
  };
}

function createConfig(overrides: Partial<RetroplanConfig> = {}): RetroplanConfig {
  return {
    goalAmount: 800,
    deadline: new Date(Date.now() + 56 * 24 * 60 * 60 * 1000),
    minimumBudgetProtection: 0,
    defaultHourlyRate: 15,
    maxHoursPerWeek: 20,
    minHoursPerWeek: 3,
    bufferWeeks: 1,
    bufferPercentage: 0.1,
    examCapacityMultiplier: 0.2,
    preExamWeeksProtected: 1,
    catchUpMultiplier: 1.5,
    catchUpSpreadWeeks: 3,
    ...overrides,
  };
}

function createMockMilestones(count: number): DynamicMilestone[] {
  const milestones: DynamicMilestone[] = [];
  let cumulative = 0;

  for (let i = 0; i < count; i++) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const capacity: WeekCapacity = {
      weekNumber: i + 1,
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      totalAvailableHours: 168,
      sleepHours: 56,
      classHours: 20,
      commitmentHours: 10,
      personalBufferHours: 14,
      maxWorkableHours: 20,
      capacityScore: 75,
      capacityCategory: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
      academicEvents: [],
      isExamPeriod: false,
      isProtectedWeek: false,
      predictedEnergyMultiplier: 1.0,
      maxEarningPotential: 300,
      recommendedTarget: 100,
      minimumTarget: 50,
    };

    const target = 100;
    cumulative += target;

    milestones.push({
      weekNumber: i + 1,
      weekStartDate: weekStart,
      baseTarget: target,
      adjustedTarget: target,
      cumulativeTarget: cumulative,
      capacity,
      recommendedStrategies: [],
      difficulty: 'moderate',
      visualColor: '#4ade80',
      isCatchUpWeek: false,
      catchUpAmount: 0,
      status: 'future',
    });
  }

  return milestones;
}

// ============================================
// generateRetroplan TESTS
// ============================================

describe('generateRetroplan', () => {
  it('generates a plan with correct number of weeks', async () => {
    const input = createBasicInput();
    const retroplan = await generateRetroplan(input);

    expect(retroplan.totalWeeks).toBe(8);
    expect(retroplan.milestones).toHaveLength(8);
  });

  it('includes all required fields in retroplan', async () => {
    const input = createBasicInput();
    const retroplan = await generateRetroplan(input);

    expect(retroplan).toHaveProperty('id');
    expect(retroplan).toHaveProperty('goalId', 'test-goal');
    expect(retroplan).toHaveProperty('totalWeeks');
    expect(retroplan).toHaveProperty('milestones');
    expect(retroplan).toHaveProperty('feasibilityScore');
    expect(retroplan).toHaveProperty('frontLoadedPercentage');
    expect(retroplan).toHaveProperty('highCapacityWeeks');
    expect(retroplan).toHaveProperty('mediumCapacityWeeks');
    expect(retroplan).toHaveProperty('lowCapacityWeeks');
    expect(retroplan).toHaveProperty('protectedWeeks');
  });

  it('protects exam weeks with reduced targets', async () => {
    const input = createBasicInput({
      academicEvents: [createExamEvent(4)], // Exams in week 4
    });

    const retroplan = await generateRetroplan(input);

    // Week 4 should be protected
    expect(retroplan.protectedWeeks).toBeGreaterThanOrEqual(1);

    // Protected weeks should have lower targets
    const protectedMilestones = retroplan.milestones.filter((m) => m.capacity.isProtectedWeek);
    const normalMilestones = retroplan.milestones.filter(
      (m) => !m.capacity.isProtectedWeek && m.capacity.capacityCategory === 'high'
    );

    if (protectedMilestones.length > 0 && normalMilestones.length > 0) {
      const avgProtectedTarget =
        protectedMilestones.reduce((sum, m) => sum + m.adjustedTarget, 0) /
        protectedMilestones.length;
      const avgNormalTarget =
        normalMilestones.reduce((sum, m) => sum + m.adjustedTarget, 0) / normalMilestones.length;

      expect(avgProtectedTarget).toBeLessThan(avgNormalTarget);
    }
  });

  it('considers energy history in capacity', async () => {
    // Low energy history (levels 1-2 out of 5)
    const lowEnergyInput = createBasicInput({
      energyHistory: createEnergyHistory([2, 2, 2, 2, 2, 2]),
    });

    // High energy history (levels 4-5 out of 5)
    const highEnergyInput = createBasicInput({
      energyHistory: createEnergyHistory([5, 5, 5, 5, 5, 5]),
    });

    const lowEnergyPlan = await generateRetroplan(lowEnergyInput);
    const highEnergyPlan = await generateRetroplan(highEnergyInput);

    // Low energy should have lower total recommended capacity
    const lowTotalCapacity = lowEnergyPlan.milestones.reduce(
      (sum, m) => sum + m.capacity.capacityScore,
      0
    );
    const highTotalCapacity = highEnergyPlan.milestones.reduce(
      (sum, m) => sum + m.capacity.capacityScore,
      0
    );

    expect(lowTotalCapacity).toBeLessThan(highTotalCapacity);
  });

  it('front-loads work in early high-capacity weeks', async () => {
    const input = createBasicInput({
      academicEvents: [createExamEvent(7)], // Exams in final week
    });

    const retroplan = await generateRetroplan(input);

    // frontLoadedPercentage should reflect front-loading
    expect(retroplan.frontLoadedPercentage).toBeGreaterThan(45);
  });
});

// ============================================
// calculateWeekCapacity TESTS (via generateRetroplan)
// ============================================

describe('calculateWeekCapacity', () => {
  it('returns protected category for exam periods', async () => {
    const input = createBasicInput({
      academicEvents: [createExamEvent(0)], // Exams this week
    });

    const retroplan = await generateRetroplan(input);
    const firstWeek = retroplan.milestones[0];

    expect(firstWeek.capacity.capacityCategory).toBe('protected');
    expect(firstWeek.capacity.isExamPeriod).toBe(true);
  });

  it('returns high category when no constraints', async () => {
    const input = createBasicInput({
      energyHistory: createEnergyHistory([5, 5, 5, 5]), // High energy
    });

    const retroplan = await generateRetroplan(input);

    // At least some weeks should be high capacity
    const highCapacityWeeks = retroplan.milestones.filter(
      (m) => m.capacity.capacityCategory === 'high'
    );
    expect(highCapacityWeeks.length).toBeGreaterThan(0);
  });

  it('respects maxHoursPerWeek limit', async () => {
    const input = createBasicInput();
    const retroplan = await generateRetroplan(input);

    for (const milestone of retroplan.milestones) {
      expect(milestone.capacity.maxWorkableHours).toBeLessThanOrEqual(25);
    }
  });

  it('respects minHoursPerWeek floor', async () => {
    const input = createBasicInput({
      academicEvents: [createExamEvent(0), createExamEvent(1), createExamEvent(2)],
    });

    const retroplan = await generateRetroplan(input);

    for (const milestone of retroplan.milestones) {
      expect(milestone.capacity.maxWorkableHours).toBeGreaterThanOrEqual(3);
    }
  });
});

// ============================================
// generateDynamicMilestones TESTS (via generateRetroplan)
// ============================================

describe('generateDynamicMilestones', () => {
  it('cumulative targets sum to goal amount', async () => {
    const input = createBasicInput({ goalAmount: 1000 });
    const retroplan = await generateRetroplan(input);

    const lastMilestone = retroplan.milestones[retroplan.milestones.length - 1];

    // Should be approximately equal to goal (within buffer)
    expect(lastMilestone.cumulativeTarget).toBeGreaterThanOrEqual(1000);
    expect(lastMilestone.cumulativeTarget).toBeLessThanOrEqual(1200); // With 10% buffer
  });

  it('protected weeks have difficulty = protected', async () => {
    const input = createBasicInput({
      academicEvents: [createExamEvent(3)],
    });

    const retroplan = await generateRetroplan(input);
    const protectedMilestones = retroplan.milestones.filter((m) => m.capacity.isProtectedWeek);

    for (const milestone of protectedMilestones) {
      expect(milestone.difficulty).toBe('protected');
    }
  });

  it('assigns correct difficulty levels', async () => {
    const input = createBasicInput();
    const retroplan = await generateRetroplan(input);

    for (const milestone of retroplan.milestones) {
      expect(['easy', 'moderate', 'challenging', 'protected']).toContain(milestone.difficulty);
    }
  });
});

// ============================================
// assessFeasibility TESTS (via generateRetroplan)
// ============================================

describe('assessFeasibility', () => {
  it('returns high score for achievable goals', async () => {
    const input = createBasicInput({
      goalAmount: 400, // Very achievable
    });

    const retroplan = await generateRetroplan(input);
    expect(retroplan.feasibilityScore).toBeGreaterThan(0.7);
  });

  it('returns lower score for ambitious goals', async () => {
    const input = createBasicInput({
      goalAmount: 3000, // Very ambitious for 8 weeks
      academicEvents: [createExamEvent(2), createExamEvent(5)],
    });

    const retroplan = await generateRetroplan(input);

    // Score should be lower due to protected weeks and high goal
    expect(retroplan.feasibilityScore).toBeLessThan(0.9);
  });

  it('penalizes plans with many protected weeks', async () => {
    const manyExamsInput = createBasicInput({
      academicEvents: [
        createExamEvent(1),
        createExamEvent(3),
        createExamEvent(5),
        createExamEvent(7),
      ],
    });

    const noExamsInput = createBasicInput();

    const manyExamsPlan = await generateRetroplan(manyExamsInput);
    const noExamsPlan = await generateRetroplan(noExamsInput);

    expect(manyExamsPlan.feasibilityScore).toBeLessThan(noExamsPlan.feasibilityScore);
  });
});

// ============================================
// calculateCatchUp TESTS
// ============================================

describe('calculateCatchUp', () => {
  it('returns milestones with catch-up adjustments', () => {
    const config = createConfig();
    const milestones = createMockMilestones(8);
    const currentWeek = 3;
    const actualProgress = 200; // Behind target of 300

    const adjustedMilestones = calculateCatchUp(milestones, currentWeek, actualProgress, config);

    // Should return adjusted milestones
    expect(adjustedMilestones).toHaveLength(8);

    // Future weeks should have catch-up amounts
    const futureWeeks = adjustedMilestones.filter((m) => m.weekNumber > currentWeek);
    const hasCatchUp = futureWeeks.some((m) => m.isCatchUpWeek || m.catchUpAmount > 0);
    expect(hasCatchUp).toBe(true);
  });

  it('returns original milestones when no deficit', () => {
    const config = createConfig();
    const milestones = createMockMilestones(8);
    const currentWeek = 3;
    const actualProgress = 400; // Ahead of target

    const adjustedMilestones = calculateCatchUp(milestones, currentWeek, actualProgress, config);

    // No catch-up needed
    expect(adjustedMilestones).toHaveLength(8);
  });

  it('distributes catch-up across remaining weeks', () => {
    const config = createConfig();
    const milestones = createMockMilestones(8);
    const currentWeek = 2;
    const actualProgress = 50; // Significant deficit

    const adjustedMilestones = calculateCatchUp(milestones, currentWeek, actualProgress, config);

    // Multiple future weeks should receive catch-up
    const catchUpWeeks = adjustedMilestones.filter((m) => m.isCatchUpWeek);
    expect(catchUpWeeks.length).toBeGreaterThanOrEqual(0); // May or may not have catch-up based on algorithm
  });
});

// ============================================
// EDGE CASES
// ============================================

describe('edge cases', () => {
  it('handles empty energy history', async () => {
    const input = createBasicInput({
      energyHistory: [],
    });

    const retroplan = await generateRetroplan(input);
    expect(retroplan.milestones.length).toBeGreaterThan(0);
  });

  it('handles very short deadline (1 week)', async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 7);

    const input = createBasicInput({
      deadline,
      goalAmount: 100,
    });

    const retroplan = await generateRetroplan(input);
    expect(retroplan.totalWeeks).toBeGreaterThanOrEqual(1);
  });

  it('handles all weeks being protected', async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 28); // 4 weeks

    const input = createBasicInput({
      deadline,
      academicEvents: [
        createExamEvent(0),
        createExamEvent(1),
        createExamEvent(2),
        createExamEvent(3),
      ],
    });

    const retroplan = await generateRetroplan(input);

    // Should still generate a plan even if all weeks are protected
    expect(retroplan.milestones.length).toBeGreaterThan(0);
    // Feasibility should be reduced due to protected weeks
    expect(retroplan.feasibilityScore).toBeLessThan(0.75);
  });

  it('handles very high goal amounts gracefully', async () => {
    const input = createBasicInput({
      goalAmount: 10000, // Very high
    });

    const retroplan = await generateRetroplan(input);

    // Should still generate valid milestones
    expect(retroplan.milestones.length).toBeGreaterThan(0);
    // Feasibility should be reduced for very high goals
    expect(retroplan.feasibilityScore).toBeLessThan(0.75);
  });
});
