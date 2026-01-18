/**
 * Budget Tab Component
 *
 * Unified budget management: income sources and expense categories.
 * Income category for managing income sources.
 * Expense categories: housing, food, transport, subscriptions, other.
 * Uses lifestyleService for expenses and incomeService for income (DuckDB persistence).
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
import { incomeService } from '~/lib/incomeService';
import { monthsUntil, formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { type LegacyLifestyleItem, itemToLegacy, legacyToItem } from '~/types/entities';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { Slider } from '~/components/ui/Slider';
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
  AlertCircle,
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
}

interface CategoryInfo {
  id: string;
  label: string;
  icon: any;
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
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Income */}
        <Card class="border-green-500/20 bg-green-500/5">
          <CardContent class="p-6">
            <div class="text-sm font-medium text-green-600 dark:text-green-400 flex items-center gap-2">
              <Wallet class="h-4 w-4" /> Income
            </div>
            <div class="text-2xl font-bold text-green-700 dark:text-green-300 mt-2">
              {formatCurrency(totalIncome(), currency(), { showSign: true })}
            </div>
            <div class="text-xs text-green-600/80 dark:text-green-400/80 mt-1">
              {incomeItems().length} source{incomeItems().length !== 1 ? 's' : ''}
            </div>
          </CardContent>
        </Card>

        {/* Total Expenses */}
        <Card class="border-red-500/20 bg-red-500/5">
          <CardContent class="p-6">
            <div class="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <TrendingDown class="h-4 w-4" /> Expenses
            </div>
            <div class="text-2xl font-bold text-red-700 dark:text-red-300 mt-2">
              -{formatCurrency(activeMonthlyTotal(), currency())}
            </div>
            <div class="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
              {pausedItemsCount() > 0 ? `${pausedItemsCount()} paused` : 'this month'}
            </div>
          </CardContent>
        </Card>

        {/* Net Margin */}
        <Card
          class={cn(
            'border-opacity-20',
            netMargin() >= 0 ? 'border-primary bg-primary/10' : 'border-amber-500 bg-amber-500/10'
          )}
        >
          <CardContent class="p-6">
            <div
              class={cn(
                'text-sm font-medium flex items-center gap-2',
                netMargin() >= 0 ? 'text-primary' : 'text-amber-600 dark:text-amber-400'
              )}
            >
              <TrendingUp class="h-4 w-4" /> Net Margin
            </div>
            <div
              class={cn(
                'text-2xl font-bold mt-2',
                netMargin() >= 0 ? 'text-primary' : 'text-amber-700 dark:text-amber-300'
              )}
            >
              {formatCurrency(netMargin(), currency(), { showSign: true })}
            </div>
            <div
              class={cn(
                'text-xs mt-1',
                netMargin() >= 0 ? 'text-primary/80' : 'text-amber-600/80 dark:text-amber-400/80'
              )}
            >
              per month
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pause Savings Info */}
      <Show when={totalPauseSavings() > 0}>
        <Card class="bg-green-500/10 border-green-500/20">
          <CardContent class="p-4 flex items-center gap-3">
            <PiggyBank class="h-5 w-5 text-green-600" />
            <span class="text-sm text-green-700 dark:text-green-300">
              You'll save <strong>{formatCurrency(totalPauseSavings(), currency())}</strong> by
              pausing expenses!
            </span>
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
      <div class="flex gap-2 flex-wrap">
        <For each={CATEGORIES}>
          {(cat) => (
            <Button
              variant={activeCategory() === cat.id ? 'default' : 'outline'}
              size="sm"
              class={cn(
                'rounded-full transition-all',
                activeCategory() === cat.id
                  ? cat.type === 'income'
                    ? 'bg-green-600 hover:bg-green-800 text-white'
                    : 'bg-red-600 hover:bg-red-800 text-white'
                  : 'bg-card hover:bg-muted'
              )}
              onClick={() => setActiveCategory(cat.id)}
            >
              <Dynamic component={cat.icon} class="h-4 w-4 mr-2" />
              {cat.label}
            </Button>
          )}
        </For>
      </div>

      {/* Items List */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-foreground flex items-center gap-2">
            <Dynamic component={getCategoryInfo(activeCategory())?.icon} class="h-5 w-5" />
            {getCategoryInfo(activeCategory())?.label}
          </h3>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus class="h-4 w-4 mr-2" /> Add
          </Button>
        </div>

        {/* Income Items */}
        <Show when={isIncomeCategory()}>
          <For each={incomeItems()}>
            {(item) => (
              <Card>
                <CardContent class="p-4 space-y-3">
                  {/* Header: Name + Amount */}
                  <div class="flex items-center justify-between">
                    <h4 class="font-medium text-foreground">{item.name}</h4>
                    <div class="font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(item.amount, currency(), { showSign: true })}/mo
                    </div>
                  </div>

                  {/* Actions: Edit / Delete */}
                  <div class="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEditIncome(item)}
                      disabled={isLoading()}
                      title="Edit income"
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                      disabled={isLoading()}
                      title="Delete income"
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
              <Card>
                <CardContent class="p-4 space-y-3">
                  {/* Header: Name + Cost */}
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <h4 class="font-medium text-foreground">{item.name}</h4>
                      <Show when={item.pausedMonths > 0}>
                        <span class="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 rounded-full">
                          Paused {item.pausedMonths}mo
                        </span>
                      </Show>
                    </div>
                    <div class="font-bold text-foreground">
                      {formatCurrency(item.currentCost, currency())}/mo
                    </div>
                  </div>

                  {/* Pause Slider */}
                  <Show when={maxPauseMonths() > 0}>
                    <div class="pt-2 pb-1">
                      <Slider
                        min={0}
                        max={maxPauseMonths()}
                        step={1}
                        value={[item.pausedMonths]}
                        onChange={(vals: number[]) => updatePausedMonths(item.id, vals[0])}
                        disabled={isLoading()}
                        label="Pause duration"
                        valueDisplay={(val: number) => (
                          <span
                            class={cn(
                              val > 0 ? 'text-amber-600 dark:text-amber-400 font-bold' : ''
                            )}
                          >
                            {val} mo
                            {val > 0 && ` (-${formatCurrency(val * item.currentCost, currency())})`}
                          </span>
                        )}
                      />
                    </div>
                  </Show>

                  {/* Actions: Edit / Delete */}
                  <div class="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-primary"
                      onClick={() => handleEditExpense(item)}
                      disabled={isLoading()}
                      title="Edit expense"
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                      disabled={isLoading()}
                      title="Delete expense"
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
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowAddForm(false);
                    resetNewItem();
                  }}
                >
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
                    onInput={(e: any) => setNewItem({ ...newItem(), name: e.currentTarget.value })}
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
                    onInput={(e: any) => {
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
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Category
                    </label>
                    <Select
                      value={newItem().category}
                      onChange={(e: any) =>
                        setNewItem({
                          ...newItem(),
                          category: e.currentTarget.value as LifestyleItem['category'],
                        })
                      }
                      options={CATEGORIES.filter((c) => c.type === 'expense').map((c) => ({
                        value: c.id,
                        label: c.label,
                      }))}
                    />
                  </div>
                </Show>
              </div>

              <div class="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  class="flex-1"
                  onClick={() => {
                    setShowAddForm(false);
                    resetNewItem();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  class="flex-1"
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
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
