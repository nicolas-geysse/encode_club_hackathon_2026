/**
 * Budget Tab Component
 *
 * Unified budget management: income sources and expense categories.
 * Income category for managing income sources.
 * Expense categories: housing, food, transport, subscriptions, other.
 * Uses lifestyleService for expenses and incomeService for income (DuckDB persistence).
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { useProfile, type IncomeItem } from '~/lib/profileContext';
import {
  lifestyleService,
  type LifestyleItem,
  type CreateLifestyleItemInput,
} from '~/lib/lifestyleService';
import { incomeService } from '~/lib/incomeService';
import { monthsUntil, formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';

// Legacy item interface for backward compatibility with props
interface LegacyLifestyleItem {
  id: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  name: string;
  currentCost: number;
  pausedMonths?: number;
}

interface BudgetTabProps {
  initialItems?: LegacyLifestyleItem[];
  onItemsChange?: (items: LegacyLifestyleItem[]) => void;
  currency?: Currency;
  profileMonthlyExpenses?: number;
  profileExpenses?: Array<{ category: string; amount: number }>;
  profileIncomeSources?: Array<{ source: string; amount: number }>;
  goalDeadline?: string;
}

interface CategoryInfo {
  id: string;
  label: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
}

const CATEGORIES: CategoryInfo[] = [
  { id: 'income', label: 'Income', icon: '💵', color: 'green', type: 'income' },
  { id: 'housing', label: 'Housing', icon: '🏠', color: 'blue', type: 'expense' },
  { id: 'food', label: 'Food', icon: '🍕', color: 'orange', type: 'expense' },
  { id: 'transport', label: 'Transport', icon: '🚌', color: 'emerald', type: 'expense' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '📺', color: 'purple', type: 'expense' },
  { id: 'other', label: 'Other', icon: '📌', color: 'slate', type: 'expense' },
];

// Convert legacy item to new format
function legacyToItem(legacy: LegacyLifestyleItem, profileId: string): LifestyleItem {
  return {
    id: legacy.id,
    profileId,
    name: legacy.name,
    category: legacy.category,
    currentCost: legacy.currentCost,
    essential: false,
    applied: false,
    pausedMonths: legacy.pausedMonths || 0,
  };
}

// Convert new item to legacy format for backward compat
function itemToLegacy(item: LifestyleItem): LegacyLifestyleItem {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    currentCost: item.currentCost,
    pausedMonths: item.pausedMonths,
  };
}

export function BudgetTab(props: BudgetTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const {
    profile,
    lifestyle: contextLifestyle,
    income: contextIncome,
    refreshLifestyle,
    refreshIncome,
  } = useProfile();
  const [localItems, setLocalItems] = createSignal<LifestyleItem[]>([]);
  const [localIncomeItems, setLocalIncomeItems] = createSignal<IncomeItem[]>([]);
  const [activeCategory, setActiveCategory] = createSignal<string>('income');
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [editingItemId, setEditingItemId] = createSignal<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = createSignal<{ id: string; name: string } | null>(null);
  const [newItem, setNewItem] = createSignal<
    Partial<CreateLifestyleItemInput & { amount?: number }>
  >({
    name: '',
    category: 'subscriptions',
    currentCost: 0,
    amount: 0,
  });

  // Use context data (from DB) as source of truth when profile exists
  createEffect(() => {
    const ctxItems = contextLifestyle();
    const ctxIncome = contextIncome();
    const currentProfile = profile();

    if (currentProfile?.id) {
      setLocalItems(ctxItems);
      setLocalIncomeItems(ctxIncome);
      return;
    }

    // No profile - fall back to initialItems for backward compatibility
    if (props.initialItems && props.initialItems.length > 0) {
      const converted = props.initialItems.map((item) => legacyToItem(item, ''));
      setLocalItems(converted);
    }
  });

  // Load data on mount if profile exists
  onMount(async () => {
    const currentProfile = profile();
    if (!currentProfile?.id) return;

    await Promise.all([refreshLifestyle(), refreshIncome()]);
    const existingExpenseItems = contextLifestyle();
    const existingIncomeItems = contextIncome();

    setIsLoading(true);
    try {
      // If no lifestyle items exist AND profile has expenses breakdown, create from that
      if (
        existingExpenseItems.length === 0 &&
        props.profileExpenses &&
        props.profileExpenses.length > 0
      ) {
        // Map category names to display names
        const categoryNames: Record<string, string> = {
          rent: 'Rent',
          housing: 'Rent',
          food: 'Food & Groceries',
          transport: 'Transport',
          subscriptions: 'Subscriptions',
          other: 'Other expenses',
        };

        for (const expense of props.profileExpenses) {
          // Normalize 'rent' to 'housing'
          const normalizedCategory = expense.category === 'rent' ? 'housing' : expense.category;
          await lifestyleService.createItem({
            profileId: currentProfile.id,
            name: categoryNames[expense.category] || expense.category,
            category: normalizedCategory as LifestyleItem['category'],
            currentCost: expense.amount,
          });
        }
        await refreshLifestyle();
      }

      // If no income items exist AND profile has income sources, create from that
      if (
        existingIncomeItems.length === 0 &&
        props.profileIncomeSources &&
        props.profileIncomeSources.length > 0
      ) {
        for (const income of props.profileIncomeSources) {
          await incomeService.createItem({
            profileId: currentProfile.id,
            name: income.source === 'total' ? 'Monthly income' : income.source,
            amount: income.amount,
          });
        }
        await refreshIncome();
      }
    } finally {
      setIsLoading(false);
    }
  });

  const items = () => localItems();
  const incomeItems = () => localIncomeItems();

  // Calculate max pause months from goal deadline
  const maxPauseMonths = () => {
    if (!props.goalDeadline) return 0;
    return monthsUntil(props.goalDeadline);
  };

  // Total income (sum of all income items)
  const totalIncome = () => incomeItems().reduce((sum, i) => sum + i.amount, 0);

  // Active monthly total (expenses not paused this month)
  const activeMonthlyTotal = () =>
    items()
      .filter((i) => i.pausedMonths === 0)
      .reduce((sum, i) => sum + i.currentCost, 0);

  // Net margin (income - expenses)
  const netMargin = () => totalIncome() - activeMonthlyTotal();

  // Total pause savings (sum of pausedMonths * currentCost for all items)
  const totalPauseSavings = () =>
    items().reduce((sum, i) => sum + i.pausedMonths * i.currentCost, 0);

  // Number of paused items
  const pausedItemsCount = () => items().filter((i) => i.pausedMonths > 0).length;

  const updatePausedMonths = async (id: string, months: number) => {
    const currentProfile = profile();
    if (!currentProfile?.id) {
      // Local-only mode
      const updated = items().map((item) =>
        item.id === id ? { ...item, pausedMonths: months } : item
      );
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      return;
    }

    // Use service to update in DB
    setIsLoading(true);
    try {
      await lifestyleService.updateItem({ id, pausedMonths: months });
      await refreshLifestyle();
      props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
    } finally {
      setIsLoading(false);
    }
  };

  const addItem = async () => {
    const base = newItem();
    if (!base.name) return;

    const currentProfile = profile();
    const isIncomeCategory = activeCategory() === 'income';

    if (!currentProfile?.id) {
      // No profile - fall back to local-only mode (only for expenses)
      if (!isIncomeCategory) {
        const item: LifestyleItem = {
          id: `lifestyle_${Date.now()}`,
          profileId: '',
          category:
            (base.category as LifestyleItem['category']) ||
            (activeCategory() as LifestyleItem['category']),
          name: base.name,
          currentCost: base.currentCost || 0,
          essential: false,
          applied: false,
          pausedMonths: 0,
        };

        const updated = [...items(), item];
        setLocalItems(updated);
        props.onItemsChange?.(updated.map(itemToLegacy));
      }
      setShowAddForm(false);
      resetNewItem();
      return;
    }

    setIsLoading(true);
    try {
      if (isIncomeCategory) {
        // Create income item
        await incomeService.createItem({
          profileId: currentProfile.id,
          name: base.name,
          amount: base.amount || 0,
        });
        await refreshIncome();
      } else {
        // Create expense item
        await lifestyleService.createItem({
          profileId: currentProfile.id,
          name: base.name,
          category: base.category || (activeCategory() as LifestyleItem['category']),
          currentCost: base.currentCost || 0,
        });
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const removeItem = async (id: string) => {
    const currentProfile = profile();
    const isIncomeCategory = activeCategory() === 'income';

    if (!currentProfile?.id && !isIncomeCategory) {
      // Local-only mode (only for expenses)
      const updated = items().filter((item) => item.id !== id);
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      return;
    }

    setIsLoading(true);
    try {
      if (isIncomeCategory) {
        await incomeService.deleteItem(id);
        await refreshIncome();
      } else {
        await lifestyleService.deleteItem(id);
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetNewItem = () => {
    setNewItem({ name: '', category: 'subscriptions', currentCost: 0, amount: 0 });
    setEditingItemId(null);
  };

  const handleEditExpense = (item: LifestyleItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      category: item.category,
      currentCost: item.currentCost,
    });
    setShowAddForm(true);
  };

  const handleEditIncome = (item: IncomeItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      amount: item.amount,
    });
    setShowAddForm(true);
  };

  const updateItem = async () => {
    const itemId = editingItemId();
    if (!itemId) return;

    const currentProfile = profile();
    const data = newItem();
    const isIncomeCategory = activeCategory() === 'income';

    if (!currentProfile?.id && !isIncomeCategory) {
      // Local-only mode - update in local array (expenses only)
      const updated = items().map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: data.name || item.name,
              category: data.category || item.category,
              currentCost: data.currentCost ?? item.currentCost,
            }
          : item
      );
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      setShowAddForm(false);
      resetNewItem();
      return;
    }

    setIsLoading(true);
    try {
      if (isIncomeCategory) {
        await incomeService.updateItem({
          id: itemId,
          name: data.name,
          amount: data.amount,
        });
        await refreshIncome();
      } else {
        await lifestyleService.updateItem({
          id: itemId,
          name: data.name,
          category: data.category,
          currentCost: data.currentCost,
        });
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const getCategoryInfo = (id: string) => CATEGORIES.find((c) => c.id === id);
  const isIncomeCategory = () => activeCategory() === 'income';

  return (
    <div class="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-3 gap-4">
        {/* Total Income */}
        <div class="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30">
          <div class="text-sm text-green-600 dark:text-green-400">Income</div>
          <div class="text-2xl font-bold text-green-700 dark:text-green-100 mt-1">
            {formatCurrency(totalIncome(), currency(), { showSign: true })}
          </div>
          <div class="text-xs text-green-500 dark:text-green-400">
            {incomeItems().length} source{incomeItems().length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Total Expenses */}
        <div class="card bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30">
          <div class="text-sm text-red-600 dark:text-red-400">Expenses</div>
          <div class="text-2xl font-bold text-red-700 dark:text-red-100 mt-1">
            -{formatCurrency(activeMonthlyTotal(), currency())}
          </div>
          <div class="text-xs text-red-500 dark:text-red-400">
            {pausedItemsCount() > 0 ? `${pausedItemsCount()} paused` : 'this month'}
          </div>
        </div>

        {/* Net Margin */}
        <div
          class={`card bg-gradient-to-br ${
            netMargin() >= 0
              ? 'from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30'
              : 'from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30'
          }`}
        >
          <div
            class={`text-sm ${
              netMargin() >= 0
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            Net Margin
          </div>
          <div
            class={`text-2xl font-bold mt-1 ${
              netMargin() >= 0
                ? 'text-primary-700 dark:text-primary-100'
                : 'text-amber-700 dark:text-amber-100'
            }`}
          >
            {formatCurrency(netMargin(), currency(), { showSign: true })}
          </div>
          <div
            class={`text-xs ${
              netMargin() >= 0
                ? 'text-primary-500 dark:text-primary-400'
                : 'text-amber-500 dark:text-amber-400'
            }`}
          >
            per month
          </div>
        </div>
      </div>

      {/* Pause Savings Info */}
      <Show when={totalPauseSavings() > 0}>
        <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-4 py-3">
          <div class="flex items-center gap-2 text-green-700 dark:text-green-300">
            <span class="text-lg">🎯</span>
            <span class="text-sm">
              You'll save <strong>{formatCurrency(totalPauseSavings(), currency())}</strong> by
              pausing expenses!
            </span>
          </div>
        </div>
      </Show>

      {/* Deadline Info */}
      <Show when={maxPauseMonths() > 0 && !isIncomeCategory()}>
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
          <div class="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <span class="text-lg">🎯</span>
            <span class="text-sm">
              You have <strong>{maxPauseMonths()} months</strong> until your goal deadline. Pause
              expenses to save money!
            </span>
          </div>
        </div>
      </Show>

      {/* Category Tabs */}
      <div class="flex gap-2 flex-wrap">
        <For each={CATEGORIES}>
          {(cat) => (
            <button
              type="button"
              class={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                activeCategory() === cat.id
                  ? cat.type === 'income'
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
              onClick={() => setActiveCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          )}
        </For>
      </div>

      {/* Items List */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-slate-900 dark:text-slate-100">
            {getCategoryInfo(activeCategory())?.icon} {getCategoryInfo(activeCategory())?.label}
          </h3>
          <button
            type="button"
            class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
            onClick={() => setShowAddForm(true)}
          >
            + Add
          </button>
        </div>

        {/* Income Items */}
        <Show when={isIncomeCategory()}>
          <For each={incomeItems()}>
            {(item) => (
              <div class="card space-y-3">
                {/* Header: Name + Amount */}
                <div class="flex items-center justify-between">
                  <h4 class="font-medium text-slate-900 dark:text-slate-100">{item.name}</h4>
                  <div class="font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(item.amount, currency(), { showSign: true })}/mo
                  </div>
                </div>

                {/* Actions: Edit / Delete */}
                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    class="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                    onClick={() => handleEditIncome(item)}
                    disabled={isLoading()}
                    title="Edit income"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                    disabled={isLoading()}
                    title="Delete income"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </For>

          <Show when={incomeItems().length === 0}>
            <div class="text-center py-8 text-slate-500 dark:text-slate-400">
              No income sources yet. Add your first one!
            </div>
          </Show>
        </Show>

        {/* Expense Items */}
        <Show when={!isIncomeCategory()}>
          <For each={items().filter((i) => i.category === activeCategory())}>
            {(item) => (
              <div class="card space-y-3">
                {/* Header: Name + Cost */}
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-slate-900 dark:text-slate-100">{item.name}</h4>
                    <Show when={item.pausedMonths > 0}>
                      <span class="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full">
                        Paused {item.pausedMonths}mo
                      </span>
                    </Show>
                  </div>
                  <div class="font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(item.currentCost, currency())}/mo
                  </div>
                </div>

                {/* Pause Slider */}
                <Show when={maxPauseMonths() > 0}>
                  <div class="space-y-2">
                    <div class="flex items-center justify-between text-sm">
                      <span class="text-slate-500 dark:text-slate-400">Pause for:</span>
                      <span class="font-medium text-amber-600 dark:text-amber-400">
                        {item.pausedMonths} month{item.pausedMonths !== 1 ? 's' : ''}
                        {item.pausedMonths > 0 &&
                          ` = -${formatCurrency(item.pausedMonths * item.currentCost, currency())}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={maxPauseMonths()}
                      value={item.pausedMonths}
                      onInput={(e) => updatePausedMonths(item.id, parseInt(e.currentTarget.value))}
                      class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                      disabled={isLoading()}
                    />
                    <div class="flex justify-between text-xs text-slate-400">
                      <span>0</span>
                      <span>{maxPauseMonths()} mo</span>
                    </div>
                  </div>
                </Show>

                {/* Actions: Edit / Delete */}
                <div class="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    class="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                    onClick={() => handleEditExpense(item)}
                    disabled={isLoading()}
                    title="Edit expense"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  </button>

                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                    disabled={isLoading()}
                    title="Delete expense"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </For>

          <Show when={items().filter((i) => i.category === activeCategory()).length === 0}>
            <div class="text-center py-8 text-slate-500 dark:text-slate-400">
              No items in this category
            </div>
          </Show>
        </Show>
      </div>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {editingItemId()
                ? isIncomeCategory()
                  ? 'Edit income'
                  : 'Edit expense'
                : isIncomeCategory()
                  ? 'New income'
                  : 'New expense'}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder={
                    isIncomeCategory()
                      ? 'Ex: Scholarship, Part-time job...'
                      : 'Ex: Netflix, Transit, Groceries...'
                  }
                  value={newItem().name}
                  onInput={(e) => setNewItem({ ...newItem(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {isIncomeCategory() ? 'Monthly amount' : 'Monthly cost'} ({currencySymbol()})
                </label>
                <input
                  type="number"
                  class="input-field"
                  min="0"
                  value={isIncomeCategory() ? newItem().amount : newItem().currentCost}
                  onInput={(e) => {
                    const val = parseInt(e.currentTarget.value) || 0;
                    if (isIncomeCategory()) {
                      setNewItem({ ...newItem(), amount: val });
                    } else {
                      setNewItem({ ...newItem(), currentCost: val });
                    }
                  }}
                />
              </div>

              <Show when={!isIncomeCategory()}>
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    class="input-field"
                    value={newItem().category}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem(),
                        category: e.currentTarget.value as LifestyleItem['category'],
                      })
                    }
                  >
                    <For each={CATEGORIES.filter((c) => c.type === 'expense')}>
                      {(cat) => (
                        <option value={cat.id}>
                          {cat.icon} {cat.label}
                        </option>
                      )}
                    </For>
                  </select>
                </div>
              </Show>
            </div>

            <div class="flex gap-3 mt-6">
              <button
                type="button"
                class="btn-secondary flex-1"
                onClick={() => {
                  setShowAddForm(false);
                  resetNewItem();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
                onClick={() => (editingItemId() ? updateItem() : addItem())}
                disabled={!newItem().name || isLoading()}
              >
                {isLoading()
                  ? editingItemId()
                    ? 'Updating...'
                    : 'Adding...'
                  : editingItemId()
                    ? 'Update'
                    : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm()}
        title={isIncomeCategory() ? 'Delete income source?' : 'Delete expense?'}
        message={`Are you sure you want to delete "${deleteConfirm()?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const confirm = deleteConfirm();
          if (confirm) {
            removeItem(confirm.id);
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
