/**
 * Inventory Tab Component
 *
 * Items to sell: track belongings that can generate income.
 * Now uses inventoryService for DuckDB persistence.
 */

import { createSignal, For, Show, createEffect, onMount } from 'solid-js';
import { useProfile } from '~/lib/profileContext';
import {
  inventoryService,
  type InventoryItem,
  type CreateInventoryItemInput,
} from '~/lib/inventoryService';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';

// Legacy Item interface for backward compatibility with props
interface LegacyItem {
  id: string;
  name: string;
  category: 'electronics' | 'clothing' | 'books' | 'furniture' | 'sports' | 'other';
  estimatedValue: number;
  condition: 'new' | 'like_new' | 'good' | 'fair' | 'poor';
  platform?: string;
  sold?: boolean;
  soldPrice?: number;
}

interface InventoryTabProps {
  initialItems?: LegacyItem[];
  onItemsChange?: (items: LegacyItem[]) => void;
  currencySymbol?: string;
}

const CATEGORIES = [
  { id: 'electronics', label: 'Electronics', icon: '📱' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'sports', label: 'Sports', icon: '⚽' },
  { id: 'other', label: 'Other', icon: '📦' },
];

const PLATFORMS = [
  { id: 'leboncoin', label: 'Craigslist' },
  { id: 'vinted', label: 'Vinted' },
  { id: 'facebook', label: 'Facebook Marketplace' },
  { id: 'ebay', label: 'eBay' },
  { id: 'direct', label: 'Direct sale' },
];

// Convert legacy item to new format
function legacyToItem(legacy: LegacyItem, profileId: string): InventoryItem {
  return {
    id: legacy.id,
    profileId,
    name: legacy.name,
    category: legacy.category,
    estimatedValue: legacy.estimatedValue,
    condition: legacy.condition,
    platform: legacy.platform,
    status: legacy.sold ? 'sold' : 'available',
    soldPrice: legacy.soldPrice,
  };
}

// Convert new item to legacy format for backward compat
function itemToLegacy(item: InventoryItem): LegacyItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    estimatedValue: item.estimatedValue,
    condition: item.condition,
    platform: item.platform,
    sold: item.status === 'sold',
    soldPrice: item.soldPrice,
  };
}

export function InventoryTab(props: InventoryTabProps) {
  // Currency symbol from props, defaults to $
  const currencySymbol = () => props.currencySymbol || '$';

  const { profile, inventory: contextInventory, refreshInventory } = useProfile();
  const [localItems, setLocalItems] = createSignal<InventoryItem[]>([]);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [isLoading, setIsLoading] = createSignal(false);
  const [showSoldModal, setShowSoldModal] = createSignal<{
    id: string;
    name: string;
    estimatedValue: number;
  } | null>(null);
  const [soldPrice, setSoldPrice] = createSignal(0);
  const [editingItemId, setEditingItemId] = createSignal<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = createSignal<{ id: string; name: string } | null>(null);
  const [newItem, setNewItem] = createSignal<Partial<CreateInventoryItemInput>>({
    name: '',
    category: 'electronics',
    estimatedValue: 50,
    condition: 'good',
    platform: 'leboncoin',
  });

  // Use context inventory (from DB) as source of truth when profile exists
  // Only fall back to initialItems when no profile (backward compat)
  createEffect(() => {
    const ctxItems = contextInventory();
    const currentProfile = profile();

    // If we have a profile ID, always trust the DB (context inventory)
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

  // Load inventory on mount if profile exists
  onMount(async () => {
    const currentProfile = profile();
    if (currentProfile?.id) {
      await refreshInventory();
    }
  });

  const items = () => localItems();

  const addItem = async () => {
    const item = newItem();
    if (!item.name || !item.estimatedValue) return;

    const currentProfile = profile();
    if (!currentProfile?.id) {
      // No profile - fall back to local-only mode
      const newItemComplete: InventoryItem = {
        id: `item_${Date.now()}`,
        profileId: '',
        name: item.name,
        category: item.category || 'other',
        estimatedValue: item.estimatedValue,
        condition: item.condition || 'good',
        platform: item.platform,
        status: 'available',
      };

      const updated = [...items(), newItemComplete];
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      setShowAddForm(false);
      resetNewItem();
      return;
    }

    // Use service to create item in DB
    setIsLoading(true);
    try {
      const created = await inventoryService.createItem({
        profileId: currentProfile.id,
        name: item.name,
        category: item.category,
        estimatedValue: item.estimatedValue,
        condition: item.condition,
        platform: item.platform,
      });

      if (created) {
        await refreshInventory();
        props.onItemsChange?.(contextInventory().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const markAsSold = async (id: string, price: number) => {
    const currentProfile = profile();
    if (!currentProfile?.id) {
      // Local-only mode
      const updated = items().map((item) =>
        item.id === id ? { ...item, status: 'sold' as const, soldPrice: price } : item
      );
      setLocalItems(updated);
      props.onItemsChange?.(updated.map(itemToLegacy));
      return;
    }

    // Use service to mark as sold
    setIsLoading(true);
    try {
      const updated = await inventoryService.markAsSold(id, price);
      if (updated) {
        await refreshInventory();
        props.onItemsChange?.(contextInventory().map(itemToLegacy));
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
      const success = await inventoryService.deleteItem(id);
      if (success) {
        await refreshInventory();
        props.onItemsChange?.(contextInventory().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetNewItem = () => {
    setNewItem({
      name: '',
      category: 'electronics',
      estimatedValue: 50,
      condition: 'good',
      platform: 'leboncoin',
    });
    setEditingItemId(null);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name,
      category: item.category,
      estimatedValue: item.estimatedValue,
      condition: item.condition,
      platform: item.platform,
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
              estimatedValue: data.estimatedValue ?? item.estimatedValue,
              condition: data.condition || item.condition,
              platform: data.platform || item.platform,
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
      const updated = await inventoryService.updateItem({
        id: itemId,
        name: data.name,
        category: data.category,
        estimatedValue: data.estimatedValue,
        condition: data.condition,
        platform: data.platform,
      });

      if (updated) {
        await refreshInventory();
        props.onItemsChange?.(contextInventory().map(itemToLegacy));
      }
    } finally {
      setIsLoading(false);
      setShowAddForm(false);
      resetNewItem();
    }
  };

  const totalEstimated = () =>
    items()
      .filter((i) => i.status === 'available')
      .reduce((sum, i) => sum + i.estimatedValue, 0);

  const totalSold = () =>
    items()
      .filter((i) => i.status === 'sold')
      .reduce((sum, i) => sum + (i.soldPrice || 0), 0);

  const getCategoryIcon = (category: string) =>
    CATEGORIES.find((c) => c.id === category)?.icon || '📦';

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      new: 'New',
      like_new: 'Like new',
      good: 'Good',
      fair: 'Fair',
      poor: 'Needs repair',
    };
    return labels[condition] || condition;
  };

  return (
    <div class="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-2 gap-4">
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
          <div class="text-sm text-blue-600 dark:text-blue-400 font-medium">For sale</div>
          <div class="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
            {currencySymbol()}
            {totalEstimated()}
          </div>
          <div class="text-xs text-blue-500 dark:text-blue-400 mt-1">
            {items().filter((i) => i.status === 'available').length} items
          </div>
        </div>
        <div class="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30">
          <div class="text-sm text-green-600 dark:text-green-400 font-medium">Sold</div>
          <div class="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
            {currencySymbol()}
            {totalSold()}
          </div>
          <div class="text-xs text-green-500 dark:text-green-400 mt-1">
            {items().filter((i) => i.status === 'sold').length} items
          </div>
        </div>
      </div>

      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>📦</span> Inventory
        </h2>
        <button
          type="button"
          class="btn-primary"
          onClick={() => setShowAddForm(true)}
          disabled={isLoading()}
        >
          + Add
        </button>
      </div>

      {/* Items List */}
      <Show when={items().length > 0}>
        <div class="space-y-3">
          <For each={items()}>
            {(item) => (
              <div
                class={`card flex items-center gap-4 ${
                  item.status === 'sold'
                    ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                    : ''
                }`}
              >
                {/* Category Icon */}
                <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl">
                  {getCategoryIcon(item.category)}
                </div>

                {/* Item Info */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="font-semibold text-slate-900 dark:text-slate-100">{item.name}</h4>
                    <Show when={item.status === 'sold'}>
                      <span class="px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-full">
                        Sold
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                    <span>{getConditionLabel(item.condition)}</span>
                    <Show when={item.platform}>
                      <span class="text-slate-300 dark:text-slate-600">•</span>
                      <span>{item.platform}</span>
                    </Show>
                  </div>
                </div>

                {/* Price */}
                <div class="flex-shrink-0 text-right">
                  <Show when={item.status === 'sold'}>
                    <div class="font-bold text-green-600 dark:text-green-400">
                      {currencySymbol()}
                      {item.soldPrice}
                    </div>
                    <div class="text-xs text-slate-400 line-through">
                      {currencySymbol()}
                      {item.estimatedValue}
                    </div>
                  </Show>
                  <Show when={item.status === 'available'}>
                    <div class="font-bold text-slate-900 dark:text-slate-100">
                      {currencySymbol()}
                      {item.estimatedValue}
                    </div>
                  </Show>
                </div>

                {/* Actions */}
                <div class="flex-shrink-0 flex items-center gap-2">
                  <Show when={item.status === 'available'}>
                    <button
                      type="button"
                      class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors disabled:opacity-50"
                      onClick={() => {
                        setSoldPrice(item.estimatedValue);
                        setShowSoldModal({
                          id: item.id,
                          name: item.name,
                          estimatedValue: item.estimatedValue,
                        });
                      }}
                      disabled={isLoading()}
                    >
                      Sold!
                    </button>
                    <button
                      type="button"
                      class="text-slate-400 hover:text-primary-500 transition-colors disabled:opacity-50"
                      onClick={() => handleEdit(item)}
                      disabled={isLoading()}
                      title="Edit item"
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
                  </Show>
                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    onClick={() => setDeleteConfirm({ id: item.id, name: item.name })}
                    disabled={isLoading()}
                    title="Delete item"
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
        </div>
      </Show>

      {/* Empty State */}
      <Show when={items().length === 0 && !showAddForm()}>
        <div class="card text-center py-12">
          <div class="text-4xl mb-4">📦</div>
          <h3 class="text-lg font-medium text-slate-900 dark:text-slate-100 mb-2">
            Nothing to sell?
          </h3>
          <p class="text-slate-500 dark:text-slate-400 mb-4">
            Add items you no longer need to generate income
          </p>
          <button type="button" class="btn-primary" onClick={() => setShowAddForm(true)}>
            Add an item
          </button>
        </div>
      </Show>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {editingItemId() ? 'Edit item' : 'New item'}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: iPhone 12, Bike, Textbooks..."
                  value={newItem().name}
                  onInput={(e) => setNewItem({ ...newItem(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Category
                </label>
                <div class="grid grid-cols-3 gap-2">
                  <For each={CATEGORIES}>
                    {(cat) => (
                      <button
                        type="button"
                        class={`p-2 rounded-lg border-2 transition-all text-center ${
                          newItem().category === cat.id
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                            : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 dark:bg-slate-700'
                        }`}
                        onClick={() =>
                          setNewItem({
                            ...newItem(),
                            category: cat.id as InventoryItem['category'],
                          })
                        }
                      >
                        <div class="text-xl">{cat.icon}</div>
                        <div class="text-xs mt-1 text-slate-700 dark:text-slate-300">
                          {cat.label}
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Estimated value ({currencySymbol()})
                  </label>
                  <input
                    type="number"
                    class="input-field"
                    min="1"
                    value={newItem().estimatedValue}
                    onInput={(e) =>
                      setNewItem({
                        ...newItem(),
                        estimatedValue: parseInt(e.currentTarget.value) || 0,
                      })
                    }
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Condition
                  </label>
                  <select
                    class="input-field"
                    value={newItem().condition}
                    onChange={(e) =>
                      setNewItem({
                        ...newItem(),
                        condition: e.currentTarget.value as InventoryItem['condition'],
                      })
                    }
                  >
                    <option value="new">New</option>
                    <option value="like_new">Like new</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Needs repair</option>
                  </select>
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Sales platform
                </label>
                <select
                  class="input-field"
                  value={newItem().platform}
                  onChange={(e) => setNewItem({ ...newItem(), platform: e.currentTarget.value })}
                >
                  <For each={PLATFORMS}>
                    {(platform) => <option value={platform.id}>{platform.label}</option>}
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
                disabled={!newItem().name || !newItem().estimatedValue || isLoading()}
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

      {/* Sold Price Modal */}
      <Show when={showSoldModal()}>
        {(modal) => (
          <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div class="card max-w-sm w-full text-center">
              <div class="text-4xl mb-3">🎉</div>
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Sold: {modal().name}
              </h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Estimated: {currencySymbol()}
                {modal().estimatedValue}
              </p>

              <div class="mb-4">
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Final sale price
                </label>
                <div class="relative">
                  <input
                    type="number"
                    class="input-field text-center text-xl font-bold pr-8"
                    min="0"
                    value={soldPrice()}
                    onInput={(e) => setSoldPrice(parseInt(e.currentTarget.value) || 0)}
                    autofocus
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 text-lg">
                    {currencySymbol()}
                  </span>
                </div>
              </div>

              <div class="flex gap-3">
                <button
                  type="button"
                  class="btn-secondary flex-1"
                  onClick={() => setShowSoldModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="btn-primary flex-1 bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    markAsSold(modal().id, soldPrice());
                    setShowSoldModal(null);
                  }}
                  disabled={isLoading()}
                >
                  {isLoading() ? 'Confirming...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm()}
        title="Delete item?"
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
