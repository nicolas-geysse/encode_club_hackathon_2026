/**
 * Inventory Tab Component
 *
 * Items to sell: track belongings that can generate income.
 */

import { createSignal, For, Show } from 'solid-js';

interface Item {
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
  initialItems?: Item[];
  onItemsChange?: (items: Item[]) => void;
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

export function InventoryTab(props: InventoryTabProps) {
  const [items, setItems] = createSignal<Item[]>(props.initialItems || []);
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [showSoldModal, setShowSoldModal] = createSignal<{
    id: string;
    name: string;
    estimatedValue: number;
  } | null>(null);
  const [soldPrice, setSoldPrice] = createSignal(0);
  const [newItem, setNewItem] = createSignal<Partial<Item>>({
    name: '',
    category: 'electronics',
    estimatedValue: 50,
    condition: 'good',
    platform: 'leboncoin',
  });

  const addItem = () => {
    const item = newItem();
    if (!item.name || !item.estimatedValue) return;

    const newItemComplete: Item = {
      id: `item_${Date.now()}`,
      name: item.name,
      category: item.category || 'other',
      estimatedValue: item.estimatedValue,
      condition: item.condition || 'good',
      platform: item.platform,
      sold: false,
    };

    const updated = [...items(), newItemComplete];
    setItems(updated);
    props.onItemsChange?.(updated);
    setShowAddForm(false);
    setNewItem({
      name: '',
      category: 'electronics',
      estimatedValue: 50,
      condition: 'good',
      platform: 'leboncoin',
    });
  };

  const markAsSold = (id: string, soldPrice: number) => {
    const updated = items().map((item) =>
      item.id === id ? { ...item, sold: true, soldPrice } : item
    );
    setItems(updated);
    props.onItemsChange?.(updated);
  };

  const removeItem = (id: string) => {
    const updated = items().filter((item) => item.id !== id);
    setItems(updated);
    props.onItemsChange?.(updated);
  };

  const totalEstimated = () =>
    items()
      .filter((i) => !i.sold)
      .reduce((sum, i) => sum + i.estimatedValue, 0);

  const totalSold = () =>
    items()
      .filter((i) => i.sold)
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
    <div class="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-2 gap-4">
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
          <div class="text-sm text-blue-600 dark:text-blue-400 font-medium">For sale</div>
          <div class="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
            {totalEstimated()}€
          </div>
          <div class="text-xs text-blue-500 dark:text-blue-400 mt-1">
            {items().filter((i) => !i.sold).length} items
          </div>
        </div>
        <div class="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30">
          <div class="text-sm text-green-600 dark:text-green-400 font-medium">Sold</div>
          <div class="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
            {totalSold()}€
          </div>
          <div class="text-xs text-green-500 dark:text-green-400 mt-1">
            {items().filter((i) => i.sold).length} items
          </div>
        </div>
      </div>

      {/* Header */}
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>📦</span> Inventory
        </h2>
        <button type="button" class="btn-primary" onClick={() => setShowAddForm(true)}>
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
                  item.sold
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
                    <Show when={item.sold}>
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
                  <Show when={item.sold}>
                    <div class="font-bold text-green-600 dark:text-green-400">
                      {item.soldPrice}€
                    </div>
                    <div class="text-xs text-slate-400 line-through">{item.estimatedValue}€</div>
                  </Show>
                  <Show when={!item.sold}>
                    <div class="font-bold text-slate-900 dark:text-slate-100">
                      {item.estimatedValue}€
                    </div>
                  </Show>
                </div>

                {/* Actions */}
                <div class="flex-shrink-0 flex items-center gap-2">
                  <Show when={!item.sold}>
                    <button
                      type="button"
                      class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                      onClick={() => {
                        setSoldPrice(item.estimatedValue);
                        setShowSoldModal({
                          id: item.id,
                          name: item.name,
                          estimatedValue: item.estimatedValue,
                        });
                      }}
                    >
                      Sold!
                    </button>
                  </Show>
                  <button
                    type="button"
                    class="text-slate-400 hover:text-red-500 transition-colors"
                    onClick={() => removeItem(item.id)}
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

      {/* Add Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">New item</h3>

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
                          setNewItem({ ...newItem(), category: cat.id as Item['category'] })
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
                    Estimated value (€)
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
                        condition: e.currentTarget.value as Item['condition'],
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
                onClick={() => setShowAddForm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
                onClick={addItem}
                disabled={!newItem().name || !newItem().estimatedValue}
              >
                Add
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
                Estimated: {modal().estimatedValue}€
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
                    €
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
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
