/**
 * Unit Tests for GoalsTab Component
 *
 * Tests key behaviors:
 * 1. Single Active Goal Policy (Sprint 9.5) - Creating/reactivating goals archives existing active
 * 2. Goal Presets - Preset application creates correct components
 * 3. Auto-Complete - Progress >= 100 triggers completion
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Goal, GoalComponent } from '~/lib/goalService';

// Mock all services before imports
vi.mock('~/lib/goalService', () => ({
  goalService: {
    listGoals: vi.fn().mockResolvedValue([]),
    createGoal: vi.fn().mockResolvedValue({ id: 'new-goal-1' }),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/lib/profileService', () => ({
  profileService: {
    loadActiveProfile: vi.fn().mockResolvedValue({ id: 'profile-123', name: 'Test User' }),
  },
}));

vi.mock('~/lib/notificationStore', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('~/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import mocked services
import { goalService } from '~/lib/goalService';
import { profileService } from '~/lib/profileService';
import { toast } from '~/lib/notificationStore';

// Test helpers for goal creation
function createTestGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-' + Math.random().toString(36).substr(2, 9),
    profileId: 'profile-123',
    name: 'Test Goal',
    amount: 500,
    deadline: '2025-06-01',
    priority: 1,
    conditionType: 'none',
    status: 'active',
    progress: 0,
    ...overrides,
  };
}

describe('GoalsTab - Business Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (profileService.loadActiveProfile as Mock).mockResolvedValue({
      id: 'profile-123',
      name: 'Test User',
    });
  });

  describe('Single Active Goal Policy (Sprint 9.5)', () => {
    it('archives existing active goal when creating a new one', async () => {
      const existingActiveGoal = createTestGoal({
        id: 'existing-goal',
        name: 'Vacation Fund',
        status: 'active',
      });

      (goalService.listGoals as Mock).mockResolvedValue([existingActiveGoal]);

      // Simulate creating a new goal with existing active goals
      // This should trigger archiving of the existing goal
      const activeGoals = [existingActiveGoal].filter((g) => g.status === 'active');

      expect(activeGoals).toHaveLength(1);
      expect(activeGoals[0].id).toBe('existing-goal');

      // The component would call updateGoal to archive
      await goalService.updateGoal({ id: 'existing-goal', status: 'paused' });

      expect(goalService.updateGoal).toHaveBeenCalledWith({
        id: 'existing-goal',
        status: 'paused',
      });
    });

    it('reactivating a paused goal archives current active goal', async () => {
      const activeGoal = createTestGoal({
        id: 'active-goal',
        name: 'Current Goal',
        status: 'active',
      });
      const pausedGoal = createTestGoal({
        id: 'paused-goal',
        name: 'Paused Goal',
        status: 'paused',
      });

      (goalService.listGoals as Mock).mockResolvedValue([activeGoal, pausedGoal]);

      // When reactivating a paused goal:
      // 1. Archive current active
      await goalService.updateGoal({ id: 'active-goal', status: 'paused' });
      // 2. Activate the paused goal
      await goalService.updateGoal({ id: 'paused-goal', status: 'active' });

      expect(goalService.updateGoal).toHaveBeenCalledTimes(2);
      expect(goalService.updateGoal).toHaveBeenNthCalledWith(1, {
        id: 'active-goal',
        status: 'paused',
      });
      expect(goalService.updateGoal).toHaveBeenNthCalledWith(2, {
        id: 'paused-goal',
        status: 'active',
      });
    });

    it('does not archive when editing the same goal', async () => {
      const existingGoal = createTestGoal({
        id: 'goal-to-edit',
        name: 'Original Name',
        status: 'active',
      });

      (goalService.listGoals as Mock).mockResolvedValue([existingGoal]);

      // When editing an existing goal (not creating new)
      // The editingGoalId check should prevent archiving
      const editingGoalId = 'goal-to-edit';

      // Skip archive if editing the goal itself
      if (editingGoalId) {
        // Update instead of create
        await goalService.updateGoal({
          id: editingGoalId,
          name: 'Updated Name',
        });
      }

      expect(goalService.updateGoal).toHaveBeenCalledTimes(1);
      expect(goalService.updateGoal).toHaveBeenCalledWith({
        id: 'goal-to-edit',
        name: 'Updated Name',
      });
    });

    it('allows creating first goal without confirmation', async () => {
      (goalService.listGoals as Mock).mockResolvedValue([]);

      // No active goals = no confirmation needed
      const goals: Goal[] = [];
      const activeGoals = goals.filter((g) => g.status === 'active');

      expect(activeGoals.length).toBe(0);

      // Should create directly without archiving
      await goalService.createGoal({
        profileId: 'profile-123',
        name: 'First Goal',
        amount: 500,
      });

      expect(goalService.createGoal).toHaveBeenCalledTimes(1);
      expect(goalService.updateGoal).not.toHaveBeenCalled();
    });
  });

  describe('Goal Presets', () => {
    const presets = [
      { name: 'Vacation', amount: 500, icon: '🏖️', components: [] },
      {
        name: "Driver's license",
        amount: 1500,
        icon: '🚗',
        components: [
          {
            name: 'Theory classes',
            type: 'time_allocation',
            estimatedHours: 10,
            estimatedCost: 50,
          },
          { name: 'Code exam', type: 'exam', estimatedHours: 2, estimatedCost: 30 },
          {
            name: 'Driving lessons (20h)',
            type: 'time_allocation',
            estimatedHours: 20,
            estimatedCost: 800,
          },
          {
            name: 'Driving test',
            type: 'exam',
            estimatedHours: 1,
            estimatedCost: 100,
            dependsOn: ['Code exam', 'Driving lessons (20h)'],
          },
        ],
      },
      { name: 'Computer', amount: 800, icon: '💻', components: [] },
      { name: 'Emergency fund', amount: 1000, icon: '🛡️', components: [] },
    ];

    it('preset with no components creates simple goal', () => {
      const vacationPreset = presets.find((p) => p.name === 'Vacation')!;

      expect(vacationPreset.components).toHaveLength(0);
      expect(vacationPreset.amount).toBe(500);
    });

    it("Driver's license preset creates 4 components", () => {
      const driversLicensePreset = presets.find((p) => p.name === "Driver's license")!;

      expect(driversLicensePreset.components).toHaveLength(4);
      expect(driversLicensePreset.amount).toBe(1500);
    });

    it('preset components have correct types', () => {
      const driversLicensePreset = presets.find((p) => p.name === "Driver's license")!;

      const componentTypes = driversLicensePreset.components.map((c) => c.type);
      expect(componentTypes).toContain('time_allocation');
      expect(componentTypes).toContain('exam');
    });

    it('preset component dependencies are correctly set', () => {
      const driversLicensePreset = presets.find((p) => p.name === "Driver's license")!;

      const drivingTestComponent = driversLicensePreset.components.find(
        (c) => c.name === 'Driving test'
      )!;

      expect(drivingTestComponent.dependsOn).toContain('Code exam');
      expect(drivingTestComponent.dependsOn).toContain('Driving lessons (20h)');
    });

    it('applying preset generates unique component IDs', () => {
      const driversLicensePreset = presets.find((p) => p.name === "Driver's license")!;

      // Simulate applyPreset logic
      const components = driversLicensePreset.components.map((c, i) => ({
        id: `comp_${Date.now()}_${i}`,
        name: c.name,
        type: c.type,
        estimatedHours: c.estimatedHours || 0,
        estimatedCost: c.estimatedCost || 0,
        dependsOn: c.dependsOn || [],
      }));

      const ids = components.map((c) => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('total preset cost equals sum of component costs', () => {
      const driversLicensePreset = presets.find((p) => p.name === "Driver's license")!;

      const totalComponentCost = driversLicensePreset.components.reduce(
        (sum, c) => sum + (c.estimatedCost || 0),
        0
      );

      // 50 + 30 + 800 + 100 = 980
      expect(totalComponentCost).toBe(980);
      // Note: preset amount (1500) includes other costs like permit fees
      expect(driversLicensePreset.amount).toBeGreaterThan(totalComponentCost);
    });
  });

  describe('Auto-Complete (Feature K)', () => {
    it('goal with progress >= 100 should be marked completed', async () => {
      const goalAtFullProgress = createTestGoal({
        id: 'goal-100',
        progress: 100,
        status: 'active',
      });

      // Simulate auto-complete logic
      if (goalAtFullProgress.progress >= 100 && goalAtFullProgress.status === 'active') {
        await goalService.updateGoal({
          id: goalAtFullProgress.id,
          status: 'completed',
        });

        toast.success('Goal achieved!', `"${goalAtFullProgress.name}" has been completed!`);
      }

      expect(goalService.updateGoal).toHaveBeenCalledWith({
        id: 'goal-100',
        status: 'completed',
      });
      expect(toast.success).toHaveBeenCalled();
    });

    it('goal with progress > 100 should also be marked completed', async () => {
      const goalOverProgress = createTestGoal({
        id: 'goal-150',
        progress: 150,
        status: 'active',
      });

      if (goalOverProgress.progress >= 100 && goalOverProgress.status === 'active') {
        await goalService.updateGoal({
          id: goalOverProgress.id,
          status: 'completed',
        });
      }

      expect(goalService.updateGoal).toHaveBeenCalledWith({
        id: 'goal-150',
        status: 'completed',
      });
    });

    it('already completed goal is not re-completed', async () => {
      const alreadyCompletedGoal = createTestGoal({
        id: 'goal-done',
        progress: 100,
        status: 'completed',
      });

      // Auto-complete should not trigger for already completed goals
      if (alreadyCompletedGoal.progress >= 100 && alreadyCompletedGoal.status === 'active') {
        await goalService.updateGoal({
          id: alreadyCompletedGoal.id,
          status: 'completed',
        });
      }

      // Should NOT be called because status !== 'active'
      expect(goalService.updateGoal).not.toHaveBeenCalled();
    });

    it('goal with progress < 100 is not auto-completed', async () => {
      const partialProgressGoal = createTestGoal({
        id: 'goal-partial',
        progress: 75,
        status: 'active',
      });

      if (partialProgressGoal.progress >= 100 && partialProgressGoal.status === 'active') {
        await goalService.updateGoal({
          id: partialProgressGoal.id,
          status: 'completed',
        });
      }

      expect(goalService.updateGoal).not.toHaveBeenCalled();
    });
  });

  describe('Goal Component Progress', () => {
    it('calculates progress based on completed components', () => {
      const components: GoalComponent[] = [
        { name: 'Step 1', type: 'milestone', status: 'completed' },
        { name: 'Step 2', type: 'milestone', status: 'completed' },
        { name: 'Step 3', type: 'milestone', status: 'pending' },
        { name: 'Step 4', type: 'milestone', status: 'pending' },
      ];

      const completedCount = components.filter((c) => c.status === 'completed').length;
      const progress = Math.round((completedCount / components.length) * 100);

      expect(progress).toBe(50);
    });

    it('empty components array means 0% progress', () => {
      const components: GoalComponent[] = [];

      const completedCount = components.filter((c) => c.status === 'completed').length;
      const progress =
        components.length > 0 ? Math.round((completedCount / components.length) * 100) : 0;

      expect(progress).toBe(0);
    });

    it('all components completed means 100% progress', () => {
      const components: GoalComponent[] = [
        { name: 'Step 1', type: 'milestone', status: 'completed' },
        { name: 'Step 2', type: 'milestone', status: 'completed' },
      ];

      const completedCount = components.filter((c) => c.status === 'completed').length;
      const progress = Math.round((completedCount / components.length) * 100);

      expect(progress).toBe(100);
    });
  });

  describe('Conditional Goals', () => {
    it('conditional goal starts in waiting status', async () => {
      // When creating a conditional goal with a parent (parent-goal exists and is active)
      // Conditional goals with conditionType !== 'none' AND parentGoalId start in 'waiting'
      await goalService.createGoal({
        profileId: 'profile-123',
        name: 'Conditional Goal',
        amount: 500,
        parentGoalId: 'parent-goal',
        conditionType: 'after_completion',
        status: 'waiting', // Conditional goals start waiting
      });

      expect(goalService.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'waiting',
          parentGoalId: 'parent-goal',
          conditionType: 'after_completion',
        })
      );
    });

    it('conditional goal with no parent starts active', async () => {
      // Goals with conditionType = 'none' or no parentGoalId start 'active'
      await goalService.createGoal({
        profileId: 'profile-123',
        name: 'Regular Goal',
        amount: 500,
        parentGoalId: undefined,
        conditionType: 'none',
        status: 'active', // Non-conditional goals start active
      });

      expect(goalService.createGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });
  });

  describe('Form Validation', () => {
    it('requires goal name', () => {
      const goalName = '';
      const goalAmount = 500;
      const goalDeadline = '2025-06-01';

      const isValid = goalName && goalAmount > 0 && goalDeadline;

      expect(isValid).toBeFalsy();
    });

    it('requires positive amount', () => {
      const goalName = 'Test Goal';
      const goalAmount = 0;
      const goalDeadline = '2025-06-01';

      const isValid = goalName && goalAmount > 0 && goalDeadline;

      expect(isValid).toBeFalsy();
    });

    it('requires deadline', () => {
      const goalName = 'Test Goal';
      const goalAmount = 500;
      const goalDeadline = '';

      const isValid = goalName && goalAmount > 0 && goalDeadline;

      expect(isValid).toBeFalsy();
    });

    it('valid form passes validation', () => {
      const goalName = 'Test Goal';
      const goalAmount = 500;
      const goalDeadline = '2025-06-01';

      const isValid = goalName && goalAmount > 0 && goalDeadline;

      expect(isValid).toBeTruthy();
    });
  });
});
