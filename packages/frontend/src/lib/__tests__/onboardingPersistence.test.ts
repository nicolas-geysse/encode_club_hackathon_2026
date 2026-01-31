/**
 * Unit Tests for onboardingPersistence.ts
 *
 * Tests the data persistence logic extracted from OnboardingChat.tsx.
 * Mocks all service dependencies and fetch calls.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  persistGoal,
  persistSkills,
  persistInventory,
  persistExpenses,
  persistSubscriptions,
  persistIncome,
  persistTrades,
  persistAllOnboardingData,
  verifyProfileInDb,
  clearProfileData,
  DEFAULT_PROFILE,
  type GoalData,
  type InventoryItem,
  type ExpenseItem,
  type Subscription,
  type IncomeSource,
  type TradeOpportunity,
} from '~/lib/onboardingPersistence';

// Mock all services
vi.mock('~/lib/skillService', () => ({
  skillService: {
    bulkCreateSkills: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/lib/lifestyleService', () => ({
  lifestyleService: {
    bulkCreateItems: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/lib/inventoryService', () => ({
  inventoryService: {
    bulkCreateItems: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/lib/incomeService', () => ({
  incomeService: {
    bulkCreateItems: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('~/lib/tradeService', () => ({
  tradeService: {
    bulkCreateTrades: vi.fn().mockResolvedValue(undefined),
  },
}));

// Sprint 13.17: Add missing mocks for simulationService and eventBus
vi.mock('~/lib/simulationService', () => ({
  simulationService: {
    getSimulationState: vi.fn().mockResolvedValue({
      simulatedDate: '2025-01-29T00:00:00.000Z',
      offsetDays: 0,
    }),
  },
}));

vi.mock('~/lib/eventBus', () => ({
  eventBus: {
    emit: vi.fn(),
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

// Import mocked services for assertions
import { skillService } from '~/lib/skillService';
import { lifestyleService } from '~/lib/lifestyleService';
import { inventoryService } from '~/lib/inventoryService';
import { incomeService } from '~/lib/incomeService';
import { tradeService } from '~/lib/tradeService';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('onboardingPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
  });

  describe('DEFAULT_PROFILE', () => {
    it('has expected default values', () => {
      expect(DEFAULT_PROFILE.skills).toEqual([]);
      expect(DEFAULT_PROFILE.maxWorkHours).toBe(15);
      expect(DEFAULT_PROFILE.minHourlyRate).toBe(12);
      expect(DEFAULT_PROFILE.hasLoan).toBe(false);
      expect(DEFAULT_PROFILE.swipePreferences.effort_sensitivity).toBe(0.5);
    });
  });

  describe('persistGoal', () => {
    const profileId = 'test-profile-123';
    const goalData: GoalData = {
      name: 'Save for laptop',
      amount: 500,
      deadline: '2025-06-01',
    };

    it('archives existing goals before creating new one', async () => {
      // Mock: no existing active goals
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]), // No existing goals
      });
      // Mock: POST new goal succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-goal' }),
      });

      const result = await persistGoal(profileId, goalData);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First call: GET existing active goals
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        `/api/goals?profileId=${profileId}&status=active`
      );

      // Second call: POST new goal
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        '/api/goals',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('includes academicEvents in planData when provided', async () => {
      // Mock: no existing active goals
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });
      // Mock: POST new goal succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'new-goal' }),
      });

      const goalWithEvents: GoalData = {
        ...goalData,
        academicEvents: [
          {
            name: 'Final Exams',
            type: 'exam_period',
            startDate: '2025-05-15',
            endDate: '2025-05-30',
          },
        ],
      };

      await persistGoal(profileId, goalWithEvents);

      // The POST call is the second one (after GET for existing goals)
      const postCall = mockFetch.mock.calls[1];
      const body = JSON.parse(postCall[1].body);
      expect(body.planData).toBeDefined();
      expect(body.planData.academicEvents).toHaveLength(1);
      expect(body.planData.academicEvents[0].name).toBe('Final Exams');
    });

    it('returns false on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await persistGoal(profileId, goalData);

      expect(result).toBe(false);
    });
  });

  describe('persistSkills', () => {
    const profileId = 'test-profile-123';
    const skills = ['Python', 'TypeScript', 'SQL'];

    it('calls skillService.bulkCreateSkills with correct data', async () => {
      const result = await persistSkills(profileId, skills);

      expect(result).toBe(true);
      expect(skillService.bulkCreateSkills).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Python', level: 'intermediate', hourlyRate: 15 }),
          expect.objectContaining({ name: 'TypeScript', level: 'intermediate', hourlyRate: 15 }),
          expect.objectContaining({ name: 'SQL', level: 'intermediate', hourlyRate: 15 }),
        ])
      );
    });

    it('uses custom hourly rate when provided', async () => {
      await persistSkills(profileId, skills, 25);

      expect(skillService.bulkCreateSkills).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([expect.objectContaining({ hourlyRate: 25 })])
      );
    });

    it('returns true without calling service when skills array is empty', async () => {
      const result = await persistSkills(profileId, []);

      expect(result).toBe(true);
      expect(skillService.bulkCreateSkills).not.toHaveBeenCalled();
    });

    it('returns false on service error', async () => {
      (skillService.bulkCreateSkills as Mock).mockRejectedValueOnce(new Error('DB error'));

      const result = await persistSkills(profileId, skills);

      expect(result).toBe(false);
    });
  });

  describe('persistInventory', () => {
    const profileId = 'test-profile-123';
    const items: InventoryItem[] = [
      { name: 'Old Laptop', category: 'electronics', estimatedValue: 200 },
      { name: 'Textbooks', category: 'books' },
    ];

    it('calls inventoryService.bulkCreateItems with correct data', async () => {
      const result = await persistInventory(profileId, items);

      expect(result).toBe(true);
      expect(inventoryService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Old Laptop',
            category: 'electronics',
            estimatedValue: 200,
          }),
          expect.objectContaining({ name: 'Textbooks', category: 'books', estimatedValue: 50 }), // default value
        ])
      );
    });

    it('returns true without calling service when items array is empty', async () => {
      const result = await persistInventory(profileId, []);

      expect(result).toBe(true);
      expect(inventoryService.bulkCreateItems).not.toHaveBeenCalled();
    });
  });

  describe('persistExpenses', () => {
    const profileId = 'test-profile-123';
    const expenses: ExpenseItem[] = [
      { category: 'rent', amount: 600 },
      { category: 'food', amount: 300 },
      { category: 'transport', amount: 100 },
      { category: 'subscriptions', amount: 50 },
      { category: 'other', amount: 150 },
    ];

    it('maps rent category to housing', async () => {
      await persistExpenses(profileId, [{ category: 'rent', amount: 600 }]);

      expect(lifestyleService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([expect.objectContaining({ category: 'housing', name: 'Rent' })])
      );
    });

    it('adjusts other category when subscriptions are explicit', async () => {
      const subscriptions: Subscription[] = [
        { name: 'Netflix', currentCost: 15 },
        { name: 'Spotify', currentCost: 10 },
      ];

      await persistExpenses(profileId, expenses, subscriptions);

      // Original subscriptions: 50, Actual: 25, Adjustment: 25
      // other should be 150 + 25 = 175
      expect(lifestyleService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Other expenses', currentCost: 175 }),
        ])
      );
    });

    it('excludes subscriptions category when subscriptions are explicit', async () => {
      const subscriptions: Subscription[] = [{ name: 'Netflix', currentCost: 15 }];

      await persistExpenses(profileId, expenses, subscriptions);

      const call = (lifestyleService.bulkCreateItems as Mock).mock.calls[0][1];
      const categories = call.map((item: { category: string }) => item.category);
      expect(categories).not.toContain('subscriptions');
    });

    it('returns true without calling service when expenses array is empty', async () => {
      const result = await persistExpenses(profileId, []);

      expect(result).toBe(true);
      expect(lifestyleService.bulkCreateItems).not.toHaveBeenCalled();
    });
  });

  describe('persistSubscriptions', () => {
    const profileId = 'test-profile-123';
    const subscriptions: Subscription[] = [
      { name: 'Netflix', currentCost: 15 },
      { name: 'Spotify', currentCost: 10 },
    ];

    it('calls lifestyleService.bulkCreateItems with subscriptions category', async () => {
      const result = await persistSubscriptions(profileId, subscriptions);

      expect(result).toBe(true);
      expect(lifestyleService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Netflix', category: 'subscriptions', currentCost: 15 }),
          expect.objectContaining({ name: 'Spotify', category: 'subscriptions', currentCost: 10 }),
        ])
      );
    });

    it('uses default cost of 10 when currentCost is undefined', async () => {
      const subsWithUndefined: Subscription[] = [
        { name: 'Unknown Service', currentCost: undefined as unknown as number },
      ];

      await persistSubscriptions(profileId, subsWithUndefined);

      expect(lifestyleService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([expect.objectContaining({ currentCost: 10 })])
      );
    });
  });

  describe('persistIncome', () => {
    const profileId = 'test-profile-123';
    const incomes: IncomeSource[] = [
      { source: 'Part-time job', amount: 500 },
      { source: 'total', amount: 700 },
    ];

    it('calls incomeService.bulkCreateItems with correct data', async () => {
      const result = await persistIncome(profileId, incomes);

      expect(result).toBe(true);
      expect(incomeService.bulkCreateItems).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({ name: 'Part-time job', amount: 500 }),
          expect.objectContaining({ name: 'Monthly income', amount: 700 }), // 'total' mapped to 'Monthly income'
        ])
      );
    });

    it('returns true without calling service when incomes array is empty', async () => {
      const result = await persistIncome(profileId, []);

      expect(result).toBe(true);
      expect(incomeService.bulkCreateItems).not.toHaveBeenCalled();
    });
  });

  describe('persistTrades', () => {
    const profileId = 'test-profile-123';
    const trades: TradeOpportunity[] = [
      { type: 'sell', description: 'Old textbooks', estimatedValue: 50 },
      { type: 'borrow', description: 'Camping gear', withPerson: 'Alex', estimatedValue: 150 },
      { type: 'cut', description: 'Cancel gym membership' }, // 'cut' should map to 'sell'
    ];

    it('calls tradeService.bulkCreateTrades with correct data', async () => {
      const result = await persistTrades(profileId, trades);

      expect(result).toBe(true);
      expect(tradeService.bulkCreateTrades).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([
          expect.objectContaining({ type: 'sell', name: 'Old textbooks', value: 50 }),
          expect.objectContaining({
            type: 'borrow',
            name: 'Camping gear',
            partner: 'Alex',
            value: 150,
          }),
          expect.objectContaining({ type: 'sell', name: 'Cancel gym membership' }), // 'cut' → 'sell'
        ])
      );
    });

    it('uses default partner "To be determined" when withPerson is not provided', async () => {
      const tradesNoPartner: TradeOpportunity[] = [{ type: 'sell', description: 'Item' }];

      await persistTrades(profileId, tradesNoPartner);

      expect(tradeService.bulkCreateTrades).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([expect.objectContaining({ partner: 'To be determined' })])
      );
    });

    it('returns true without calling service when trades array is empty', async () => {
      const result = await persistTrades(profileId, []);

      expect(result).toBe(true);
      expect(tradeService.bulkCreateTrades).not.toHaveBeenCalled();
    });
  });

  describe('persistAllOnboardingData', () => {
    const profileId = 'test-profile-123';

    it('returns success when all tasks complete', async () => {
      // Mock fetch to return appropriate responses for goal persistence
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/api/goals') && url.includes('status=active')) {
          // GET existing goals - return empty array
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([]),
          });
        }
        // All other requests succeed
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'new-item' }),
        });
      });

      const result = await persistAllOnboardingData(profileId, {
        goal: { name: 'Test Goal', amount: 500, deadline: '2025-06-01' },
        skills: ['Python'],
        inventoryItems: [{ name: 'Laptop', category: 'electronics' }],
        expenses: [{ category: 'food', amount: 200 }],
        incomes: [{ source: 'Job', amount: 500 }],
        tradeOpportunities: [{ type: 'sell', description: 'Books' }],
      });

      expect(result.success).toBe(true);
      expect(result.failures).toEqual([]);
    });

    it('returns partial failures gracefully', async () => {
      (skillService.bulkCreateSkills as Mock).mockRejectedValueOnce(new Error('Skills failed'));

      const result = await persistAllOnboardingData(profileId, {
        skills: ['Python'],
        incomes: [{ source: 'Job', amount: 500 }],
      });

      expect(result.success).toBe(false);
      expect(result.failures).toContain('skills');
      expect(result.failures).not.toContain('income');
    });

    it('handles multiple task failures', async () => {
      (skillService.bulkCreateSkills as Mock).mockRejectedValueOnce(new Error('Skills failed'));
      (incomeService.bulkCreateItems as Mock).mockRejectedValueOnce(new Error('Income failed'));

      const result = await persistAllOnboardingData(profileId, {
        skills: ['Python'],
        incomes: [{ source: 'Job', amount: 500 }],
      });

      expect(result.success).toBe(false);
      expect(result.failures).toContain('skills');
      expect(result.failures).toContain('income');
    });

    it('handles empty data without errors', async () => {
      const result = await persistAllOnboardingData(profileId, {});

      expect(result.success).toBe(true);
      expect(result.failures).toEqual([]);
    });

    it('executes tasks in parallel (not sequential)', async () => {
      const executionOrder: string[] = [];

      (skillService.bulkCreateSkills as Mock).mockImplementation(async () => {
        executionOrder.push('skills-start');
        await new Promise((r) => setTimeout(r, 50));
        executionOrder.push('skills-end');
      });

      (incomeService.bulkCreateItems as Mock).mockImplementation(async () => {
        executionOrder.push('income-start');
        await new Promise((r) => setTimeout(r, 10));
        executionOrder.push('income-end');
      });

      await persistAllOnboardingData(profileId, {
        skills: ['Python'],
        incomes: [{ source: 'Job', amount: 500 }],
      });

      // If parallel, income should finish before skills
      // Order should be: skills-start, income-start, income-end, skills-end
      expect(executionOrder[0]).toBe('skills-start');
      expect(executionOrder[1]).toBe('income-start');
      expect(executionOrder[2]).toBe('income-end');
      expect(executionOrder[3]).toBe('skills-end');
    });

    it('only creates tasks for non-empty data', async () => {
      await persistAllOnboardingData(profileId, {
        skills: [], // empty - should not create task
        incomes: [{ source: 'Job', amount: 500 }], // non-empty
      });

      expect(skillService.bulkCreateSkills).not.toHaveBeenCalled();
      expect(incomeService.bulkCreateItems).toHaveBeenCalled();
    });

    it('passes minHourlyRate to persistSkills', async () => {
      await persistAllOnboardingData(profileId, {
        skills: ['Python'],
        minHourlyRate: 20,
      });

      expect(skillService.bulkCreateSkills).toHaveBeenCalledWith(
        profileId,
        expect.arrayContaining([expect.objectContaining({ hourlyRate: 20 })])
      );
    });
  });

  describe('verifyProfileInDb', () => {
    const profileId = 'test-profile-123';

    it('returns true when profile exists', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: profileId }),
      });

      const result = await verifyProfileInDb(profileId);

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(`/api/profiles?id=${profileId}`);
    });

    it('returns false when profile does not exist', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await verifyProfileInDb(profileId);

      expect(result).toBe(false);
    });

    it('returns false on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await verifyProfileInDb(profileId);

      expect(result).toBe(false);
    });

    it('returns false when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const result = await verifyProfileInDb(profileId);

      expect(result).toBe(false);
    });
  });

  describe('clearProfileData', () => {
    const profileId = 'test-profile-123';

    it('calls DELETE on all related endpoints', async () => {
      await clearProfileData(profileId);

      expect(mockFetch).toHaveBeenCalledTimes(6);
      expect(mockFetch).toHaveBeenCalledWith(`/api/goals?profileId=${profileId}`, {
        method: 'DELETE',
      });
      expect(mockFetch).toHaveBeenCalledWith(`/api/skills?profileId=${profileId}`, {
        method: 'DELETE',
      });
      expect(mockFetch).toHaveBeenCalledWith(`/api/inventory?profileId=${profileId}`, {
        method: 'DELETE',
      });
      expect(mockFetch).toHaveBeenCalledWith(`/api/lifestyle?profileId=${profileId}`, {
        method: 'DELETE',
      });
      expect(mockFetch).toHaveBeenCalledWith(`/api/income?profileId=${profileId}`, {
        method: 'DELETE',
      });
      expect(mockFetch).toHaveBeenCalledWith(`/api/trades?profileId=${profileId}`, {
        method: 'DELETE',
      });
    });

    it('does not throw on partial failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed'));

      // Should not throw
      await expect(clearProfileData(profileId)).resolves.toBeUndefined();
    });
  });
});
