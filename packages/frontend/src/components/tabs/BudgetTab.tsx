/**
 * Budget Tab Component
 *
 * Unified budget management: income sources and expense categories.
 * Income category for managing income sources.
 * Expense categories: housing, food, transport, subscriptions, other.
 * Uses lifestyleService for expenses and incomeService for income (DuckDB persistence).
 * Uses createCrudTab hook for common CRUD state management.
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useProfile, type IncomeItem } from '~/lib/profileContext';
import { cn } from '~/lib/cn';
import {
  lifestyleService,
  type LifestyleItem,
  type CreateLifestyleItemInput,
} from '~/lib/lifestyleService';
import { mergeExpenseSources } from '~/lib/expenseUtils';
import { incomeService } from '~/lib/incomeService';
import { createCrudTab } from '~/hooks/createCrudTab';
import { createDirtyState } from '~/hooks/createDirtyState';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { monthsUntil, formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { type LegacyLifestyleItem, itemToLegacy, legacyToItem } from '~/types/entities';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import { Input } from '~/components/ui/Input';
import { MonthPicker } from '~/components/ui/MonthPicker';
import {
  Wallet,
  Home,
  Utensils,
  Bus,
  Tv,
  Pin,
  TrendingUp,
  TrendingDown,
  Target,
  Pencil,
  Trash2,
  Plus,
  X,
  PiggyBank,
} from 'lucide-solid';

interface BudgetTabProps {
  initialItems?: LegacyLifestyleItem[];
  onItemsChange?: (items: LegacyLifestyleItem[]) => void;
  currency?: Currency;
  profileMonthlyExpenses?: number;
  profileExpenses?: Array<{ category: string; amount: number }>;
  profileIncomeSources?: Array<{ source: string; amount: number }>;
  goalDeadline?: string;
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
}

interface CategoryInfo {
  id: string;
  label: string;
  icon: typeof Wallet;
  color: string;
  type: 'income' | 'expense';
}

const CATEGORIES: CategoryInfo[] = [
  { id: 'income', label: 'Income', icon: Wallet, color: 'green', type: 'income' },
  { id: 'housing', label: 'Housing', icon: Home, color: 'blue', type: 'expense' },
  { id: 'food', label: 'Food', icon: Utensils, color: 'orange', type: 'expense' },
  { id: 'transport', label: 'Transport', icon: Bus, color: 'emerald', type: 'expense' },
  { id: 'subscriptions', label: 'Subscriptions', icon: Tv, color: 'purple', type: 'expense' },
  { id: 'other', label: 'Other', icon: Pin, color: 'slate', type: 'expense' },
];

export function BudgetTab(props: BudgetTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const {
    profile,
    goals,
    lifestyle: contextLifestyle,
    income: contextIncome,
    refreshLifestyle,
    refreshIncome,
    refreshProfile,
  } = useProfile();

  // Feature M: Get primary goal amount for savings progress calculation
  const primaryGoal = () => goals().find((g) => g.status === 'active' && !g.parentGoalId);
  const goalAmount = () => primaryGoal()?.amount || 0;

  // Income day from profile (default to 15)
  const incomeDay = () => profile()?.incomeDay || 15;

  // Use createCrudTab hook for common CRUD state management
  // We use a generic type since we manage both LifestyleItem and IncomeItem
  const crud = createCrudTab<LifestyleItem | IncomeItem>({
    getItemId: (item) => item.id,
    getItemName: (item) => item.name,
  });

  // Destructure for convenience (aliased to match original names)
  const {
    showAddForm,
    setShowAddForm,
    isLoading,
    setIsLoading,
    editingId: editingItemId,
    deleteConfirm,
    setDeleteConfirm,
  } = crud;

  const [localItems, setLocalItems] = createSignal<LifestyleItem[]>([]);
  const [localIncomeItems, setLocalIncomeItems] = createSignal<IncomeItem[]>([]);
  const [activeCategory, setActiveCategory] = createSignal<string>('income');
  const [newItem, setNewItem] = createSignal<
    Partial<CreateLifestyleItemInput & { amount?: number }>
  >({
    name: '',
    category: 'subscriptions',
    currentCost: 0,
    amount: 0,
  });

  // Dirty state tracking for unsaved changes dialog
  const {
    isDirty,
    setOriginal: setDirtyOriginal,
    clear: clearDirty,
  } = createDirtyState({
    getCurrentValues: () => newItem(),
  });

  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Notify parent when dirty state changes
  createEffect(() => {
    props.onDirtyChange?.(isDirty());
  });

  // Use context data (from DB) as source of truth when profile exists
  // Falls back to profile.expenses if lifestyle_items is empty (DuckDB issue workaround)
  createEffect(() => {
    const ctxItems = contextLifestyle();
    const ctxIncome = contextIncome();
    const currentProfile = profile();

    if (currentProfile?.id) {
      // Merge lifestyle_items with profile.expenses fallback
      const mergedItems = mergeExpenseSources(ctxItems, currentProfile.expenses);
      setLocalItems(mergedItems);
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
  // Note: Item creation is handled by OnboardingChat, not here
  onMount(async () => {
    const currentProfile = profile();
    if (!currentProfile?.id) return;

    await Promise.all([refreshLifestyle(), refreshIncome()]);
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

  // Feature M: Cumulative savings projection from net margin
  const cumulativeSavingsFromMargin = () => {
    const margin = netMargin();
    const months = maxPauseMonths();
    return margin > 0 && months > 0 ? margin * months : 0;
  };

  // Feature M: Goal progress from net margin projection
  const marginGoalProgress = () => {
    const goal = goalAmount();
    if (!goal || goal <= 0) return null;
    return (cumulativeSavingsFromMargin() / goal) * 100;
  };

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
      // No profile - fall back to local-only mode
      if (isIncomeCategory) {
        const item: IncomeItem = {
          id: `income_${Date.now()}`,
          profileId: '',
          name: base.name,
          amount: base.amount || 0,
        };
        setLocalIncomeItems([...localIncomeItems(), item]);
      } else {
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

    if (!currentProfile?.id) {
      // Local-only mode
      if (isIncomeCategory) {
        setLocalIncomeItems(localIncomeItems().filter((item) => item.id !== id));
      } else {
        const updated = items().filter((item) => item.id !== id);
        setLocalItems(updated);
        props.onItemsChange?.(updated.map(itemToLegacy));
      }
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
    const active = activeCategory();
    setNewItem({
      name: '',
      category:
        active !== 'income'
          ? (active as LifestyleItem['category'])
          : (undefined as unknown as LifestyleItem['category']),
      currentCost: 0,
      amount: 0,
    });
    crud.resetForm();
    clearDirty(); // Clear dirty state when form closes
  };

  // Handle cancel - shows confirmation dialog if there are unsaved changes
  const handleCancel = () => {
    if (isDirty()) {
      setShowUnsavedDialog(true);
    } else {
      resetNewItem();
      crud.closeAddForm();
    }
  };

  // Discard changes and close form (called from unsaved changes dialog)
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    resetNewItem();
    crud.closeAddForm();
  };

  // Open add form with dirty state tracking
  const openAddForm = () => {
    // Sprint 2 Bug #6 fix: Reset form state when opening Add form
    // This ensures the category matches the active tab (income vs expense)
    resetNewItem();
    setShowAddForm(true);
    setDirtyOriginal(); // Capture initial state
  };

  const handleEditExpense = (item: LifestyleItem) => {
    setNewItem({
      name: item.name,
      category: item.category,
      currentCost: item.currentCost,
    });
    crud.startEdit(item.id);
    setDirtyOriginal(); // Capture loaded values as original
  };

  const handleEditIncome = (item: IncomeItem) => {
    setNewItem({
      name: item.name,
      amount: item.amount,
    });
    crud.startEdit(item.id);
    setDirtyOriginal(); // Capture loaded values as original
  };

  const updateItem = async () => {
    const itemId = editingItemId();
    if (!itemId) return;

    const currentProfile = profile();
    const data = newItem();
    const isIncomeCategory = activeCategory() === 'income';

    if (!currentProfile?.id) {
      // Local-only mode
      if (isIncomeCategory) {
        setLocalIncomeItems(
          localIncomeItems().map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  name: data.name || item.name,
                  amount: data.amount ?? item.amount,
                }
              : item
          )
        );
      } else {
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
      }
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
    <div class="p-6 space-y-6">
      {/* Header */}
      <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
        <PiggyBank class="h-6 w-6 text-primary" /> My Budget
      </h2>

      {/* Bruno Hint */}
      <BrunoHintV2
        tabType="budget"
        profileId={profile()?.id}
        contextData={{
          monthlyIncome: totalIncome(),
          monthlyExpenses: activeMonthlyTotal(),
          monthlyMargin: netMargin(),
          expenses: items().map((l) => ({
            category: l.category || 'other',
            amount: l.currentCost,
          })),
        }}
        fallbackMessage="Track your income and expenses to maximize your savings potential!"
        compact
      />

      {/* Summary Cards */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Income */}
        <Card class="border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/10 shadow-sm">
          <CardContent class="p-6">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                Total Income
              </span>
              <div class="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <Wallet class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
            <div class="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
              {formatCurrency(totalIncome(), currency(), { showSign: true })}
            </div>
            <div class="text-xs text-emerald-600/80 dark:text-emerald-400/60 mt-1 font-medium">
              {incomeItems().length} source{incomeItems().length !== 1 ? 's' : ''} active
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card class="border-red-200/50 dark:border-red-800/50 bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/10 shadow-sm">
          <CardContent class="p-6">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-red-600 dark:text-red-400">Total Expenses</span>
              <div class="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                <TrendingDown class="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </div>
            <div class="text-2xl font-bold text-red-900 dark:text-red-100">
              -{formatCurrency(activeMonthlyTotal(), currency())}
            </div>
            <div class="text-xs text-red-600/80 dark:text-red-400/60 mt-1 font-medium">
              {pausedItemsCount() > 0 ? (
                <span class="flex items-center gap-1">
                  <span class="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  {pausedItemsCount()} paused
                </span>
              ) : (
                'All active'
              )}
            </div>
          </CardContent>
        </Card>

        {/* Net Margin */}
        <Card
          class={cn(
            'shadow-sm transition-colors duration-300',
            netMargin() >= 0
              ? 'border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-900/10'
              : 'border-amber-200/50 dark:border-amber-800/50 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-900/10'
          )}
        >
          <CardContent class="p-6">
            <div class="flex items-center justify-between mb-2">
              <span
                class={cn(
                  'text-sm font-medium',
                  netMargin() >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                )}
              >
                Net Margin
              </span>
              <div
                class={cn(
                  'h-8 w-8 rounded-full flex items-center justify-center',
                  netMargin() >= 0
                    ? 'bg-emerald-100 dark:bg-emerald-900/50'
                    : 'bg-amber-100 dark:bg-amber-900/50'
                )}
              >
                <TrendingUp
                  class={cn(
                    'h-4 w-4',
                    netMargin() >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  )}
                />
              </div>
            </div>
            <div
              class={cn(
                'text-2xl font-bold',
                netMargin() >= 0
                  ? 'text-emerald-900 dark:text-emerald-100'
                  : 'text-amber-900 dark:text-amber-100'
              )}
            >
              {formatCurrency(netMargin(), currency(), { showSign: true })}
            </div>
            <div
              class={cn(
                'text-xs mt-1 font-medium',
                netMargin() >= 0
                  ? 'text-emerald-600/80 dark:text-emerald-400/60'
                  : 'text-amber-600/80 dark:text-amber-400/60'
              )}
            >
              Available per month
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Day Selector - when savings are added to progress */}
      <Show when={netMargin() > 0}>
        <Card class="border-green-500/20 bg-green-500/5">
          <CardContent class="p-4">
            <div class="flex items-center justify-between flex-wrap gap-3">
              <div class="flex items-center gap-3">
                <PiggyBank class="h-5 w-5 text-green-600" />
                <span class="text-sm text-green-700 dark:text-green-300">
                  <strong>Savings arrive on:</strong>
                </span>
              </div>
              <span class="px-3 py-1.5 text-sm rounded-lg border border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300">
                {incomeDay() <= 5
                  ? 'Beginning of month (1st-5th)'
                  : incomeDay() <= 15
                    ? 'Mid-month (15th)'
                    : 'End of month (25th-31st)'}
              </span>
            </div>
            <p class="text-xs text-green-600/80 dark:text-green-400/80 mt-2">
              Your monthly savings of {formatCurrency(netMargin(), currency())} will be
              automatically added to your progress on this date.
              <span class="italic"> (Set during onboarding)</span>
            </p>
          </CardContent>
        </Card>
      </Show>

      {/* Feature M: Cumulative Savings From Net Margin */}
      <Show when={cumulativeSavingsFromMargin() > 0}>
        <Card class="border-emerald-500/20 bg-emerald-500/5">
          <CardContent class="p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <TrendingUp class="h-5 w-5 text-emerald-600" />
                <span class="text-sm text-emerald-700 dark:text-emerald-300">
                  <strong>Projected Savings</strong>
                </span>
              </div>
              <div class="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(cumulativeSavingsFromMargin(), currency(), { showSign: true })}
              </div>
            </div>

            {/* Calculation breakdown */}
            <div class="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              {formatCurrency(netMargin(), currency())} × {maxPauseMonths()} months until deadline
            </div>

            {/* Progress toward goal */}
            <Show when={marginGoalProgress() !== null}>
              <div class="pt-2 border-t border-emerald-500/20">
                <div class="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 mb-1">
                  <span>Progress toward goal</span>
                  <span class="font-medium">
                    {Math.round(marginGoalProgress()!)}% of{' '}
                    {formatCurrency(goalAmount(), currency())}
                  </span>
                </div>
                <div class="w-full h-2 bg-emerald-200 dark:bg-emerald-900/50 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-emerald-600 dark:bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, marginGoalProgress()!)}%` }}
                  />
                </div>
              </div>
            </Show>
          </CardContent>
        </Card>
      </Show>

      {/* Pause Savings Panel */}
      <Show when={totalPauseSavings() > 0}>
        <Card class="bg-green-500/10 border-green-500/20">
          <CardContent class="p-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <PiggyBank class="h-5 w-5 text-green-600" />
                <span class="text-sm text-green-700 dark:text-green-300">
                  <strong>Savings until deadline</strong>
                </span>
              </div>
              <div class="text-lg font-bold text-green-700 dark:text-green-300">
                {formatCurrency(totalPauseSavings(), currency(), { showSign: true })}
              </div>
            </div>

            {/* Show breakdown by paused items */}
            <Show when={pausedItemsCount() > 0}>
              <div class="text-xs text-green-600/80 dark:text-green-400/80 space-y-1">
                <For each={items().filter((i) => i.pausedMonths > 0)}>
                  {(item) => (
                    <div class="flex justify-between">
                      <span>
                        {item.name}: {formatCurrency(item.currentCost, currency())}/mo ×{' '}
                        {item.pausedMonths} mo
                      </span>
                      <span class="font-medium">
                        {formatCurrency(item.currentCost * item.pausedMonths, currency())}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            {/* Show progress toward goal */}
            <Show when={goalAmount() > 0}>
              <div class="pt-2 border-t border-green-500/20">
                <div class="flex items-center justify-between text-xs text-green-600 dark:text-green-400 mb-1">
                  <span>Contribution to goal</span>
                  <span class="font-medium">
                    {Math.round((totalPauseSavings() / goalAmount()) * 100)}% of{' '}
                    {formatCurrency(goalAmount(), currency())}
                  </span>
                </div>
                <div class="w-full h-2 bg-green-200 dark:bg-green-900/50 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-green-600 dark:bg-green-500 rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, (totalPauseSavings() / goalAmount()) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            </Show>
          </CardContent>
        </Card>
      </Show>

      {/* Deadline Info */}
      <Show when={maxPauseMonths() > 0 && !isIncomeCategory()}>
        <Card class="bg-amber-500/10 border-amber-500/20">
          <CardContent class="p-4 flex items-center gap-3">
            <Target class="h-5 w-5 text-amber-600" />
            <span class="text-sm text-amber-700 dark:text-amber-300">
              You have <strong>{maxPauseMonths()} months</strong> until your goal deadline. Pause
              expenses to save money!
            </span>
          </CardContent>
        </Card>
      </Show>

      {/* Category Tabs */}
      <div class="flex flex-wrap gap-2 p-1 bg-muted/20 border border-border/50 rounded-2xl w-fit">
        <For each={CATEGORIES}>
          {(cat) => {
            const isActive = () => activeCategory() === cat.id;
            return (
              <Button
                variant="ghost"
                size="sm"
                class={cn(
                  'rounded-xl px-4 h-9 transition-all duration-300 font-medium border border-transparent',
                  isActive()
                    ? cat.type === 'income'
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600'
                      : 'bg-red-500 text-white shadow-md shadow-red-500/20 hover:bg-red-600'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
                onClick={() => setActiveCategory(cat.id)}
              >
                <div
                  class={cn(
                    'mr-2 h-5 w-5 rounded-full flex items-center justify-center transition-colors',
                    isActive() ? 'bg-white/20' : 'bg-transparent'
                  )}
                >
                  <Dynamic component={cat.icon} class="h-3.5 w-3.5" />
                </div>
                {cat.label}
              </Button>
            );
          }}
        </For>
      </div>

      {/* Items List */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-foreground flex items-center gap-2">
            <Dynamic component={getCategoryInfo(activeCategory())?.icon} class="h-5 w-5" />
            {getCategoryInfo(activeCategory())?.label}
          </h3>
          <Button size="sm" onClick={openAddForm}>
            <Plus class="h-4 w-4 mr-2" /> Add
          </Button>
        </div>

        {/* Income Items */}
        <Show when={isIncomeCategory()}>
          <For each={incomeItems()}>
            {(item) => (
              <Card class="group hover:border-emerald-500/30 hover:shadow-md transition-all duration-300">
                <CardContent class="p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div class="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Wallet class="h-5 w-5 text-emerald-600 dark:text-emerald-400 opacity-80" />
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <h4 class="font-bold text-foreground truncate text-base">{item.name}</h4>
                      <div class="font-bold text-emerald-600 dark:text-emerald-400 text-lg">
                        +{formatCurrency(item.amount, currency(), { showSign: false })}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus-within:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                      onClick={() => handleEditIncome(item)}
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>

          <Show when={incomeItems().length === 0}>
            <div class="text-center py-8 text-muted-foreground">
              No income sources yet. Add your first one!
            </div>
          </Show>
        </Show>

        {/* Expense Items */}
        <Show when={!isIncomeCategory()}>
          <For each={items().filter((i) => i.category === activeCategory())}>
            {(item) => (
              <Card class="group hover:border-red-500/30 hover:shadow-md transition-all duration-300">
                <CardContent class="p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div
                    class={cn(
                      'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300',
                      item.pausedMonths > 0
                        ? 'bg-amber-100 dark:bg-amber-900/40'
                        : 'bg-red-100 dark:bg-red-900/40'
                    )}
                  >
                    <Dynamic
                      component={getCategoryInfo(item.category)?.icon}
                      class={cn(
                        'h-5 w-5',
                        item.pausedMonths > 0
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-red-600 dark:text-red-400 opacity-80'
                      )}
                    />
                  </div>

                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-0.5">
                      <div class="flex items-center gap-2 overflow-hidden">
                        <h4 class="font-bold text-foreground truncate text-base">{item.name}</h4>
                        <Show when={item.pausedMonths > 0}>
                          <span class="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full border border-amber-200/50 flex-shrink-0">
                            Paused {item.pausedMonths}mo
                          </span>
                        </Show>
                      </div>
                      <div
                        class={cn(
                          'font-bold text-lg flex-shrink-0 ml-2',
                          item.pausedMonths > 0
                            ? 'text-muted-foreground line-through decoration-amber-500/50 opacity-70'
                            : 'text-foreground'
                        )}
                      >
                        {formatCurrency(item.currentCost, currency())}
                      </div>
                    </div>

                    <Show when={maxPauseMonths() > 0}>
                      <div class="pt-1 flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                        <MonthPicker
                          max={maxPauseMonths()}
                          value={item.pausedMonths}
                          onChange={(val) => updatePausedMonths(item.id, val)}
                          disabled={isLoading()}
                        />
                        <Show when={item.pausedMonths > 0}>
                          <span class="text-xs text-amber-600 dark:text-amber-400 font-medium whitespace-nowrap">
                            Saves {formatCurrency(item.pausedMonths * item.currentCost, currency())}
                          </span>
                        </Show>
                      </div>
                    </Show>
                  </div>

                  {/* Actions */}
                  <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 focus-within:opacity-100 self-center ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={() => handleEditExpense(item)}
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                    >
                      <Trash2 class="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>

          <Show when={items().filter((i) => i.category === activeCategory()).length === 0}>
            <div class="text-center py-8 text-muted-foreground">No items in this category</div>
          </Show>
        </Show>
      </div>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card class="max-w-md w-full">
            <CardContent class="p-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-semibold text-foreground">
                  {editingItemId()
                    ? isIncomeCategory()
                      ? 'Edit income'
                      : 'Edit expense'
                    : isIncomeCategory()
                      ? 'New income'
                      : 'New expense'}
                </h3>
                <Button variant="ghost" size="icon" onClick={handleCancel}>
                  <X class="h-4 w-4" />
                </Button>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                  <Input
                    type="text"
                    placeholder={
                      isIncomeCategory()
                        ? 'Ex: Scholarship, Part-time job...'
                        : 'Ex: Netflix, Transit, Groceries...'
                    }
                    value={newItem().name}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewItem({ ...newItem(), name: e.currentTarget.value })
                    }
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">
                    {isIncomeCategory() ? 'Monthly amount' : 'Monthly cost'} ({currencySymbol()})
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={isIncomeCategory() ? newItem().amount : newItem().currentCost}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) => {
                      const val = parseInt(e.currentTarget.value) || 0;
                      if (isIncomeCategory()) {
                        setNewItem({ ...newItem(), amount: val });
                      } else {
                        setNewItem({ ...newItem(), currentCost: val });
                      }
                    }}
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-2">
                    Category
                  </label>
                  <div class="flex flex-wrap gap-2">
                    {/* Include Income in the choices to allow switching */}
                    <button
                      class={cn(
                        'px-3 py-1 text-xs font-medium rounded-full border transition-all',
                        (newItem().category as unknown as string) === 'income' ||
                          (isIncomeCategory() && !newItem().category) ||
                          ((newItem().amount || 0) > 0 && isIncomeCategory())
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      )}
                      onClick={() => {
                        // Switch to Income mode
                        setActiveCategory('income'); // Update the main view filter too for consistency
                        setNewItem({
                          ...newItem(),
                          category: undefined, // Income doesn't have a category field in the same way
                          amount: newItem().currentCost || 0, // Transfer value if exists
                          currentCost: undefined,
                        });
                      }}
                    >
                      Income
                    </button>

                    <For each={CATEGORIES.filter((c) => c.type === 'expense')}>
                      {(cat) => (
                        <button
                          class={cn(
                            'px-3 py-1 text-xs font-medium rounded-full border transition-all',
                            newItem().category === cat.id
                              ? 'bg-red-600 text-white border-red-600'
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          )}
                          onClick={() => {
                            // Switch to Expense mode (if was income)
                            if (activeCategory() === 'income') {
                              setActiveCategory(cat.id); // Update main view
                            }
                            setNewItem({
                              ...newItem(),
                              category: cat.id as LifestyleItem['category'],
                              currentCost: newItem().amount || newItem().currentCost || 0, // Transfer value
                              amount: undefined,
                            });
                          }}
                        >
                          {cat.label}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              <div class="flex gap-3 mt-6">
                <Button variant="outline" class="flex-1" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={() => (editingItemId() ? updateItem() : addItem())}
                  disabled={!newItem().name || isLoading()}
                  class="flex-1"
                >
                  {isLoading()
                    ? editingItemId()
                      ? 'Updating...'
                      : 'Adding...'
                    : editingItemId()
                      ? 'Update'
                      : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
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
            crud.cancelDelete();
          }
        }}
        onCancel={crud.cancelDelete}
      />

      {/* Unsaved changes confirmation */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog()}
        onDiscard={handleDiscardChanges}
        onKeepEditing={() => setShowUnsavedDialog(false)}
      />
    </div>
  );
}
