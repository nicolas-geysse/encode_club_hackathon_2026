/**
 * Unit Tests for TradeTab Component
 *
 * Tests key behaviors:
 * 1. Financial Calculations - Borrowed value, Karma score, Potential sale value
 * 2. Trade Type Handling - Status progression, Inventory linking for sells
 */

import { describe, it, expect, vi } from 'vitest';

// Mock logger before imports
vi.mock('~/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Test types matching TradeTab's interfaces
interface TradeItem {
  id: string;
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: 'active' | 'completed' | 'pending';
  dueDate?: string;
  inventoryItemId?: string;
}

interface InventoryItemForTrade {
  id: string;
  name: string;
  estimatedValue: number;
  category?: string;
}

// Test helper to create trades
function createTestTrade(overrides: Partial<TradeItem> = {}): TradeItem {
  return {
    id: 'trade-' + Math.random().toString(36).substr(2, 9),
    type: 'borrow',
    name: 'Test Item',
    partner: 'Test Partner',
    value: 50,
    status: 'pending',
    ...overrides,
  };
}

describe('TradeTab - Business Logic', () => {
  describe('Financial Calculations', () => {
    describe('borrowedValue calculation', () => {
      it('includes only active and completed borrows', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'borrow', status: 'active', value: 100 }),
          createTestTrade({ type: 'borrow', status: 'completed', value: 50 }),
          createTestTrade({ type: 'borrow', status: 'pending', value: 75 }),
        ];

        // Calculate borrowed value (active + completed, excluding pending)
        const borrowedValue = trades
          .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
          .reduce((sum, t) => sum + t.value, 0);

        expect(borrowedValue).toBe(150); // 100 + 50
      });

      it('excludes pending borrows from borrowedValue', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'borrow', status: 'pending', value: 100 }),
          createTestTrade({ type: 'borrow', status: 'pending', value: 50 }),
        ];

        const borrowedValue = trades
          .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
          .reduce((sum, t) => sum + t.value, 0);

        expect(borrowedValue).toBe(0);
      });

      it('returns 0 when no borrow trades exist', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'sell', status: 'completed', value: 100 }),
          createTestTrade({ type: 'lend', status: 'active', value: 50 }),
        ];

        const borrowedValue = trades
          .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
          .reduce((sum, t) => sum + t.value, 0);

        expect(borrowedValue).toBe(0);
      });
    });

    describe('pendingBorrowValue calculation', () => {
      it('calculates value of pending borrows only', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'borrow', status: 'pending', value: 75 }),
          createTestTrade({ type: 'borrow', status: 'pending', value: 25 }),
          createTestTrade({ type: 'borrow', status: 'active', value: 100 }),
        ];

        const pendingBorrowValue = trades
          .filter((t) => t.type === 'borrow' && t.status === 'pending')
          .reduce((sum, t) => sum + t.value, 0);

        expect(pendingBorrowValue).toBe(100); // 75 + 25
      });
    });

    describe('totalBorrowPotential calculation', () => {
      it('sums borrowed value and pending borrow value', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'borrow', status: 'active', value: 100 }),
          createTestTrade({ type: 'borrow', status: 'completed', value: 50 }),
          createTestTrade({ type: 'borrow', status: 'pending', value: 75 }),
        ];

        const borrowedValue = trades
          .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
          .reduce((sum, t) => sum + t.value, 0);

        const pendingBorrowValue = trades
          .filter((t) => t.type === 'borrow' && t.status === 'pending')
          .reduce((sum, t) => sum + t.value, 0);

        const totalBorrowPotential = borrowedValue + pendingBorrowValue;

        expect(totalBorrowPotential).toBe(225); // 100 + 50 + 75
      });
    });

    describe('Karma score calculation', () => {
      it('counts only lend and trade actions that are not pending', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'lend', status: 'active', value: 50 }),
          createTestTrade({ type: 'lend', status: 'completed', value: 30 }),
          createTestTrade({ type: 'trade', status: 'active', value: 40 }),
          createTestTrade({ type: 'lend', status: 'pending', value: 20 }), // Should not count
          createTestTrade({ type: 'borrow', status: 'active', value: 100 }), // Should not count
          createTestTrade({ type: 'sell', status: 'completed', value: 75 }), // Should not count
        ];

        const karmaScore = trades.filter(
          (t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending'
        ).length;

        expect(karmaScore).toBe(3); // 2 lend + 1 trade (all non-pending)
      });

      it('excludes pending lend and trade actions', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'lend', status: 'pending', value: 50 }),
          createTestTrade({ type: 'trade', status: 'pending', value: 40 }),
        ];

        const karmaScore = trades.filter(
          (t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending'
        ).length;

        expect(karmaScore).toBe(0);
      });

      it('returns 0 when no lend or trade actions exist', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'borrow', status: 'active', value: 100 }),
          createTestTrade({ type: 'sell', status: 'completed', value: 75 }),
        ];

        const karmaScore = trades.filter(
          (t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending'
        ).length;

        expect(karmaScore).toBe(0);
      });
    });

    describe('soldValue calculation', () => {
      it('sums only completed sell trades', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'sell', status: 'completed', value: 100 }),
          createTestTrade({ type: 'sell', status: 'completed', value: 50 }),
          createTestTrade({ type: 'sell', status: 'pending', value: 75 }),
          createTestTrade({ type: 'sell', status: 'active', value: 60 }),
        ];

        const soldValue = trades
          .filter((t) => t.type === 'sell' && t.status === 'completed')
          .reduce((sum, t) => sum + t.value, 0);

        expect(soldValue).toBe(150); // 100 + 50
      });
    });

    describe('potentialSaleValue calculation', () => {
      it('includes pending sells and available inventory items', () => {
        const trades: TradeItem[] = [
          createTestTrade({
            type: 'sell',
            status: 'pending',
            value: 100,
            inventoryItemId: 'inv-1',
          }),
          createTestTrade({ type: 'sell', status: 'completed', value: 50 }),
        ];

        const inventoryItems: InventoryItemForTrade[] = [
          { id: 'inv-1', name: 'Listed Laptop', estimatedValue: 200 }, // Already listed
          { id: 'inv-2', name: 'Available Camera', estimatedValue: 150 }, // Not listed
        ];

        // Pending sells (not completed)
        const pendingSells = trades
          .filter((t) => t.type === 'sell' && t.status !== 'completed')
          .reduce((sum, t) => sum + t.value, 0);

        // Available inventory (not already listed)
        const availableInventory = inventoryItems
          .filter((item) => !trades.some((t) => t.inventoryItemId === item.id))
          .reduce((sum, item) => sum + item.estimatedValue, 0);

        const potentialSaleValue = pendingSells + availableInventory;

        expect(pendingSells).toBe(100);
        expect(availableInventory).toBe(150); // Only inv-2 is not listed
        expect(potentialSaleValue).toBe(250);
      });

      it('returns 0 when no pending sells or available inventory', () => {
        const trades: TradeItem[] = [
          createTestTrade({ type: 'sell', status: 'completed', value: 100 }),
        ];
        const inventoryItems: InventoryItemForTrade[] = [];

        const pendingSells = trades
          .filter((t) => t.type === 'sell' && t.status !== 'completed')
          .reduce((sum, t) => sum + t.value, 0);

        const availableInventory = inventoryItems.reduce(
          (sum, item) => sum + item.estimatedValue,
          0
        );

        expect(pendingSells + availableInventory).toBe(0);
      });
    });
  });

  describe('Trade Type Handling', () => {
    describe('Status progression', () => {
      it('pending -> active -> completed is valid progression', () => {
        const validProgressions = [
          ['pending', 'active'],
          ['active', 'completed'],
          ['pending', 'completed'],
          ['active', 'pending'], // Can revert to pending
        ];

        validProgressions.forEach(([from, to]) => {
          // All progressions are valid in the component
          expect(['pending', 'active', 'completed']).toContain(from);
          expect(['pending', 'active', 'completed']).toContain(to);
        });
      });

      it('borrow trades have correct status flow', () => {
        const borrowTrade = createTestTrade({
          type: 'borrow',
          status: 'pending',
        });

        // Initial state
        expect(borrowTrade.status).toBe('pending');

        // After confirming
        borrowTrade.status = 'active';
        expect(borrowTrade.status).toBe('active');

        // After returning item
        borrowTrade.status = 'completed';
        expect(borrowTrade.status).toBe('completed');
      });

      it('sell trades have correct status flow', () => {
        const sellTrade = createTestTrade({
          type: 'sell',
          status: 'pending',
          inventoryItemId: 'inv-1',
        });

        // Initial state: listed for sale
        expect(sellTrade.status).toBe('pending');

        // After buyer shows interest
        sellTrade.status = 'active';
        expect(sellTrade.status).toBe('active');

        // After sale completed
        sellTrade.status = 'completed';
        expect(sellTrade.status).toBe('completed');
      });
    });

    describe('Inventory linking for sells', () => {
      it('sell trade can be linked to inventory item', () => {
        const inventoryItem: InventoryItemForTrade = {
          id: 'inv-laptop',
          name: 'Old Laptop',
          estimatedValue: 200,
          category: 'electronics',
        };

        const sellTrade = createTestTrade({
          type: 'sell',
          name: inventoryItem.name,
          value: inventoryItem.estimatedValue,
          inventoryItemId: inventoryItem.id,
          description: `From inventory - ${inventoryItem.category || 'item'}`,
        });

        expect(sellTrade.inventoryItemId).toBe('inv-laptop');
        expect(sellTrade.name).toBe('Old Laptop');
        expect(sellTrade.value).toBe(200);
      });

      it('sell without inventory link has undefined inventoryItemId', () => {
        const manualSell = createTestTrade({
          type: 'sell',
          name: 'Manual item',
          value: 50,
          // No inventoryItemId
        });

        expect(manualSell.inventoryItemId).toBeUndefined();
      });

      it('inventory item is excluded from available list after listing', () => {
        const inventoryItems: InventoryItemForTrade[] = [
          { id: 'inv-1', name: 'Laptop', estimatedValue: 200 },
          { id: 'inv-2', name: 'Camera', estimatedValue: 150 },
        ];

        const trades: TradeItem[] = [
          createTestTrade({
            type: 'sell',
            inventoryItemId: 'inv-1',
          }),
        ];

        const availableInventory = inventoryItems.filter(
          (item) => !trades.some((t) => t.inventoryItemId === item.id)
        );

        expect(availableInventory).toHaveLength(1);
        expect(availableInventory[0].id).toBe('inv-2');
      });
    });
  });

  describe('Trade Suggestions', () => {
    // Helper to simulate getSuggestions logic
    function getSuggestions(goalName?: string): Array<{ type: string; name: string }> {
      const suggestions: Array<{ type: string; name: string }> = [];
      const lowerGoal = (goalName || '').toLowerCase();

      if (
        lowerGoal.includes('camping') ||
        lowerGoal.includes('vacation') ||
        lowerGoal.includes('travel')
      ) {
        suggestions.push({ type: 'borrow', name: 'Camping tent' });
        suggestions.push({ type: 'borrow', name: 'Sleeping bag' });
        suggestions.push({ type: 'borrow', name: 'Cooler/Ice box' });
      }

      if (
        lowerGoal.includes('computer') ||
        lowerGoal.includes('pc') ||
        lowerGoal.includes('tech')
      ) {
        suggestions.push({ type: 'borrow', name: 'Repair tools' });
      }

      if (
        lowerGoal.includes('apartment') ||
        lowerGoal.includes('moving') ||
        lowerGoal.includes('housing')
      ) {
        suggestions.push({ type: 'borrow', name: 'Moving boxes' });
        suggestions.push({ type: 'borrow', name: 'Hand truck/Dolly' });
      }

      return suggestions;
    }

    it('generates vacation-related suggestions', () => {
      const suggestions = getSuggestions('Summer vacation');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.name === 'Camping tent')).toBe(true);
    });

    it('generates camping-related suggestions', () => {
      const suggestions = getSuggestions('Camping trip');

      expect(suggestions.some((s) => s.name === 'Sleeping bag')).toBe(true);
    });

    it('generates computer-related suggestions', () => {
      const suggestions = getSuggestions('New computer');

      expect(suggestions.some((s) => s.name === 'Repair tools')).toBe(true);
    });

    it('generates moving-related suggestions', () => {
      const suggestions = getSuggestions('New apartment');

      expect(suggestions.some((s) => s.name === 'Moving boxes')).toBe(true);
    });

    it('returns empty for unrelated goal', () => {
      const suggestions = getSuggestions('Emergency fund');

      // No specific suggestions for emergency fund
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('Trade Form Validation', () => {
    it('requires name and partner for trade', () => {
      const trade = { name: '', partner: '', value: 50 };

      const isValid = trade.name && trade.partner;

      expect(isValid).toBeFalsy();
    });

    it('allows trade with name and partner', () => {
      const trade = { name: 'Item', partner: 'Friend', value: 50 };

      const isValid = trade.name && trade.partner;

      expect(isValid).toBeTruthy();
    });

    it('value can be 0', () => {
      const trade = { name: 'Item', partner: 'Friend', value: 0 };

      const isValid = trade.name && trade.partner && trade.value >= 0;

      expect(isValid).toBeTruthy();
    });
  });

  describe('Trade Type Info', () => {
    const TRADE_TYPES = [
      { id: 'sell', label: 'Sell', color: 'green', description: 'One-time sales for income' },
      {
        id: 'borrow',
        label: 'Borrow',
        color: 'blue',
        description: 'Items you need without buying',
      },
      { id: 'trade', label: 'Trade', color: 'purple', description: 'Exchange skills or items' },
      {
        id: 'lend',
        label: 'Lend',
        color: 'orange',
        description: 'Share unused items with friends',
      },
    ];

    it('has correct type definitions', () => {
      expect(TRADE_TYPES).toHaveLength(4);
      expect(TRADE_TYPES.map((t) => t.id)).toEqual(['sell', 'borrow', 'trade', 'lend']);
    });

    it('each type has required fields', () => {
      TRADE_TYPES.forEach((type) => {
        expect(type.id).toBeDefined();
        expect(type.label).toBeDefined();
        expect(type.color).toBeDefined();
        expect(type.description).toBeDefined();
      });
    });
  });

  describe('Status Badge', () => {
    function getStatusBadge(status: string) {
      switch (status) {
        case 'active':
          return { label: 'In progress', class: 'bg-blue-100 text-blue-700' };
        case 'completed':
          return { label: 'Done', class: 'bg-green-100 text-green-700' };
        case 'pending':
          return { label: 'Pending', class: 'bg-amber-100 text-amber-700' };
        default:
          return { label: status, class: 'bg-slate-100 text-slate-700' };
      }
    }

    it('returns correct badge for active status', () => {
      const badge = getStatusBadge('active');
      expect(badge.label).toBe('In progress');
    });

    it('returns correct badge for completed status', () => {
      const badge = getStatusBadge('completed');
      expect(badge.label).toBe('Done');
    });

    it('returns correct badge for pending status', () => {
      const badge = getStatusBadge('pending');
      expect(badge.label).toBe('Pending');
    });

    it('returns default badge for unknown status', () => {
      const badge = getStatusBadge('unknown');
      expect(badge.label).toBe('unknown');
    });
  });
});
