/**
 * Lifestyle Tab Component
 *
 * Budget optimization: housing, food, transport, subscriptions.
 * Now uses lifestyleService for DuckDB persistence.
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { useProfile } from '~/lib/profileContext';
import {
  lifestyleService,
  type LifestyleItem,
  type CreateLifestyleItemInput,
} from '~/lib/lifestyleService';

// Legacy item interface for backward compatibility with props
interface LegacyLifestyleItem {
  id: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  name: string;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  applied?: boolean;
}

interface LifestyleTabProps {
  initialItems?: LegacyLifestyleItem[];
  onItemsChange?: (items: LegacyLifestyleItem[]) => void;
  currencySymbol?: string;
}

const CATEGORIES = [
  { id: 'housing', label: 'Housing', icon: '🏠', color: 'blue' },
  { id: 'food', label: 'Food', icon: '🍕', color: 'orange' },
  { id: 'transport', label: 'Transport', icon: '🚌', color: 'green' },
  { id: 'subscriptions', label: 'Subscriptions', icon: '📺', color: 'purple' },
  { id: 'other', label: 'Other', icon: '📌', color: 'slate' },
];

const SUGGESTIONS: Record<string, { items: Partial<CreateLifestyleItemInput>[] }> = {
  subscriptions: {
    items: [
      { name: 'Netflix', currentCost: 13, optimizedCost: 6.5, suggestion: 'Family sharing' },
      { name: 'Spotify', currentCost: 11, optimizedCost: 3, suggestion: 'Student duo' },
      {
        name: 'Gym',
        currentCost: 30,
        optimizedCost: 0,
        suggestion: 'Campus gym',
      },
      { name: 'Amazon Prime', currentCost: 6, optimizedCost: 3, suggestion: 'Student offer' },
    ],
  },
  food: {
    items: [
      {
        name: 'Campus cafeteria',
        currentCost: 0,
        optimizedCost: 0,
        suggestion: '$1 with scholarship',
      },
      {
        name: 'Groceries',
        currentCost: 200,
        optimizedCost: 150,
        suggestion: 'Discount store + batch cooking',
      },
      { name: 'Coffee', currentCost: 50, optimizedCost: 15, suggestion: 'Bring thermos' },
    ],
  },
  transport: {
    items: [
      { name: 'Transit pass', currentCost: 75, optimizedCost: 37, suggestion: 'Student discount' },
      { name: 'Gas', currentCost: 100, optimizedCost: 50, suggestion: 'Carpool' },
    ],
  },
};

// Convert legacy item to new format
function legacyToItem(legacy: LegacyLifestyleItem, profileId: string): LifestyleItem {
  return {
    id: legacy.id,
    profileId,
    name: legacy.name,
    category: legacy.category,
    currentCost: legacy.currentCost,
    optimizedCost: legacy.optimizedCost,
    suggestion: legacy.suggestion,
    essential: false,
    applied: legacy.applied || false,
  };
}

// Convert new item to legacy format for backward compat
function itemToLegacy(item: LifestyleItem): LegacyLifestyleItem {
  return {
    id: item.id,
    category: item.category,
    name: item.name,
    currentCost: item.currentCost,
    optimizedCost: item.optimizedCost,
    suggestion: item.suggestion,
    applied: item.applied,
  };
}

export function LifestyleTab(props: LifestyleTabProps) {
  // Currency symbol from props, defaults to $
  const currencySymbol = () => props.currencySymbol || '$';

  const { profile, lifestyle: contextLifestyle, refreshLifestyle } = useProfile();
  const [localItems, setLocalItems] = createSignal<LifestyleItem[]>([]);
  const [activeCategory, setActiveCategory] = createSignal<string>('subscriptions');
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [editingItemId, setEditingItemId] = createSignal<string | null>(null);
  const [newItem, setNewItem] = createSignal<Partial<CreateLifestyleItemInput>>({
    name: '',
    category: 'subscriptions',
    currentCost: 0,
  });

  // Use context lifestyle (from DB) as source of truth when profile exists
  // Only fall back to initialItems when no profile (backward compat)
  createEffect(() => {
    const ctxItems = contextLifestyle();
    const currentProfile = profile();

    // If we have a profile ID, always trust the DB (context lifestyle)
    // This prevents temp IDs from initialItems causing 404 on delete
    if (currentProfile?.id) {
      setLocalItems(ctxItems);
      return;
    }

    // No profile - fall back to initialItems for backward compatibility
    if (props.initialItems && props.initialItems.length > 0) {
      const converted = props.initialItems.map((item) => legacyToItem(item, ''));
      setLocalItems(converted);
    }
  });

  // Load lifestyle on mount if profile exists
  onMount(async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      await refreshLifestyle();
    }
  });

  const items = () => localItems();

  const addItem = async (suggestion?: Partial<CreateLifestyleItemInput>) => {
    const base = suggestion || newItem();
    if (!base.name) return;

    const currentProfile = profile();
    if (!currentProfile?.id) {
      // No profile - fall back to local-only mode
      const item: LifestyleItem = {
        id: `lifestyle_${Date.now()}`,
        profileId: '',
        category:
          (base.category as LifestyleItem['category']) ||
          (activeCategory() as LifestyleItem['category']),
        name: base.name,
        currentCost: base.currentCost || 0,
        optimizedCost: base.optimizedCost,
        suggestion: base.suggestion,
        essential: false,
        applied: false,
      };

      const updated = [...items(), item];
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      setShowAddForm(false);
      resetNewItem();
      return;
    }

    // Use service to create item in DB
    setIsLoading(true);
    try {
      const created = await lifestyleService.createItem({
        profileId: currentProfile.id,
        name: base.name,
        category: base.category || (activeCategory() as LifestyleItem['category']),
        currentCost: base.currentCost || 0,
        optimizedCost: base.optimizedCost,
        suggestion: base.suggestion,
      });

      if (created) {
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const applyOptimization = async (id: string) => {
    const currentProfile = profile();
    if (!currentProfile?.id) {
      // Local-only mode
      const updated = items().map((item) => (item.id === id ? { ...item, applied: true } : item));
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      return;
    }

    // Use service to apply optimization
    setIsLoading(true);
    try {
      const updated = await lifestyleService.applyOptimization(id);
      if (updated) {
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const removeItem = async (id: string) => {
    const currentProfile = profile();
    if (!currentProfile?.id) {
      // Local-only mode
      const updated = items().filter((item) => item.id !== id);
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      return;
    }

    // Use service to delete item
    setIsLoading(true);
    try {
      const success = await lifestyleService.deleteItem(id);
      if (success) {
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetNewItem = () => {
    setNewItem({ name: '', category: 'subscriptions', currentCost: 0 });
    setEditingItemId(null);
  };

  const handleEdit = (item: LifestyleItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      category: item.category,
      currentCost: item.currentCost,
      optimizedCost: item.optimizedCost,
      suggestion: item.suggestion,
    });
    setShowAddForm(true);
  };

  const updateItem = async () => {
    const itemId = editingItemId();
    if (!itemId) return;

    const currentProfile = profile();
    const data = newItem();

    if (!currentProfile?.id) {
      // Local-only mode - update in local array
      const updated = items().map((item) =>
        item.id === itemId
          ? {
              ...item,
              name: data.name || item.name,
              category: data.category || item.category,
              currentCost: data.currentCost ?? item.currentCost,
              optimizedCost: data.optimizedCost,
              suggestion: data.suggestion,
            }
          : item
      );
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      setShowAddForm(false);
      resetNewItem();
      return;
    }

    // Use service to update item in DB
    setIsLoading(true);
    try {
      const updated = await lifestyleService.updateItem({
        id: itemId,
        name: data.name,
        category: data.category,
        currentCost: data.currentCost,
        optimizedCost: data.optimizedCost,
        suggestion: data.suggestion,
      });

      if (updated) {
        await refreshLifestyle();
        props.onItemsChange?.(contextLifestyle().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const totalOptimized = () =>
    items().reduce(
      (sum, i) => sum + (i.applied ? (i.optimizedCost ?? i.currentCost) : i.currentCost),
      0
    );
  const potentialSavings = () =>
    items()
      .filter((i) => !i.applied && i.optimizedCost !== undefined)
      .reduce((sum, i) => sum + (i.currentCost - (i.optimizedCost || 0)), 0);

  const getCategoryInfo = (id: string) => CATEGORIES.find((c) => c.id === id);

  return (
    <div class="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-2 gap-4">
        <div class="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30">
          <div class="text-sm text-green-600 dark:text-green-400">Optimized</div>
          <div class="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
            {currencySymbol()}
            {totalOptimized()}
          </div>
          <div class="text-xs text-green-500 dark:text-green-400">/month</div>
        </div>
        <div class="card bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30">
          <div class="text-sm text-amber-600 dark:text-amber-400">Potential savings</div>
          <div class="text-2xl font-bold text-amber-900 dark:text-amber-100 mt-1">
            +{currencySymbol()}
            {potentialSavings()}
          </div>
          <div class="text-xs text-amber-500 dark:text-amber-400">/month</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div class="flex gap-2 overflow-x-auto pb-2">
        <For each={CATEGORIES}>
          {(cat) => (
            <button
              type="button"
              class={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-all ${
                activeCategory() === cat.id
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
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

      {/* Quick Add Suggestions */}
      <Show when={SUGGESTIONS[activeCategory()]}>
        <div class="card bg-slate-50 dark:bg-slate-700">
          <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Suggestions</h4>
          <div class="flex flex-wrap gap-2">
            <For
              each={SUGGESTIONS[activeCategory()]?.items.filter(
                (s) => !items().some((i) => i.name === s.name)
              )}
            >
              {(suggestion) => (
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-500 rounded-full hover:border-primary-300 dark:hover:border-primary-500 transition-colors disabled:opacity-50"
                  onClick={() =>
                    addItem({
                      ...suggestion,
                      category: activeCategory() as LifestyleItem['category'],
                    })
                  }
                  disabled={isLoading()}
                >
                  {suggestion.name}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

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

        <For each={items().filter((i) => i.category === activeCategory())}>
          {(item) => (
            <div class="card flex items-center gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-medium text-slate-900 dark:text-slate-100">{item.name}</h4>
                  <Show when={item.applied}>
                    <span class="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full">
                      Optimized
                    </span>
                  </Show>
                </div>
                <Show when={item.suggestion && !item.applied}>
                  <p class="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    💡 {item.suggestion}
                  </p>
                </Show>
              </div>

              <div class="flex items-center gap-4">
                <div class="text-right">
                  <Show when={item.optimizedCost !== undefined && !item.applied}>
                    <div class="text-sm text-slate-400 line-through">
                      {currencySymbol()}
                      {item.currentCost}
                    </div>
                    <div class="font-bold text-green-600 dark:text-green-400">
                      {currencySymbol()}
                      {item.optimizedCost}
                    </div>
                  </Show>
                  <Show when={item.applied}>
                    <div class="font-bold text-green-600 dark:text-green-400">
                      {currencySymbol()}
                      {item.optimizedCost}
                    </div>
                  </Show>
                  <Show
                    when={
                      item.optimizedCost === undefined ||
                      (item.optimizedCost !== undefined &&
                        !item.applied &&
                        item.applied === undefined)
                    }
                  >
                    <div class="font-bold text-slate-900 dark:text-slate-100">
                      {currencySymbol()}
                      {item.currentCost}
                    </div>
                  </Show>
                </div>

                <Show when={item.optimizedCost !== undefined && !item.applied}>
                  <button
                    type="button"
                    class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                    onClick={() => applyOptimization(item.id)}
                    disabled={isLoading()}
                  >
                    Apply
                  </button>
                </Show>

                <button
                  type="button"
                  class="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                  onClick={() => handleEdit(item)}
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
                  onClick={() => removeItem(item.id)}
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
      </div>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {editingItemId() ? 'Edit expense' : 'New expense'}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Netflix, Transit, Groceries..."
                  value={newItem().name}
                  onInput={(e) => setNewItem({ ...newItem(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Monthly cost ($)
                </label>
                <input
                  type="number"
                  class="input-field"
                  min="0"
                  value={newItem().currentCost}
                  onInput={(e) =>
                    setNewItem({ ...newItem(), currentCost: parseInt(e.currentTarget.value) || 0 })
                  }
                />
              </div>

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
                  <For each={CATEGORIES}>
                    {(cat) => (
                      <option value={cat.id}>
                        {cat.icon} {cat.label}
                      </option>
                    )}
                  </For>
                </select>
              </div>
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
    </div>
  );
}
