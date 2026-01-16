/**
 * Lifestyle Tab Component
 *
 * Budget optimization: housing, food, transport, subscriptions.
 */

import { createSignal, For, Show } from 'solid-js';

interface LifestyleItem {
  id: string;
  category: 'housing' | 'food' | 'transport' | 'subscriptions' | 'other';
  name: string;
  currentCost: number;
  optimizedCost?: number;
  suggestion?: string;
  applied?: boolean;
}

interface LifestyleTabProps {
  initialItems?: LifestyleItem[];
  onItemsChange?: (items: LifestyleItem[]) => void;
}

const CATEGORIES = [
  { id: 'housing', label: 'Logement', icon: '🏠', color: 'blue' },
  { id: 'food', label: 'Alimentation', icon: '🍕', color: 'orange' },
  { id: 'transport', label: 'Transport', icon: '🚌', color: 'green' },
  { id: 'subscriptions', label: 'Abonnements', icon: '📺', color: 'purple' },
  { id: 'other', label: 'Autre', icon: '📌', color: 'slate' },
];

const SUGGESTIONS: Record<string, { items: Partial<LifestyleItem>[] }> = {
  subscriptions: {
    items: [
      { name: 'Netflix', currentCost: 13, optimizedCost: 6.5, suggestion: 'Partage familial' },
      { name: 'Spotify', currentCost: 11, optimizedCost: 3, suggestion: 'Duo etudiant' },
      {
        name: 'Salle de sport',
        currentCost: 30,
        optimizedCost: 0,
        suggestion: 'Sport universitaire',
      },
      { name: 'Amazon Prime', currentCost: 6, optimizedCost: 3, suggestion: 'Offre etudiant' },
    ],
  },
  food: {
    items: [
      { name: 'Restaurant U', currentCost: 0, optimizedCost: 0, suggestion: '1€ avec bourse' },
      { name: 'Courses', currentCost: 200, optimizedCost: 150, suggestion: 'Lidl + batch cooking' },
      { name: 'Cafes', currentCost: 50, optimizedCost: 15, suggestion: 'Thermos maison' },
    ],
  },
  transport: {
    items: [
      { name: 'Abonnement metro', currentCost: 75, optimizedCost: 37, suggestion: 'Imagine R' },
      { name: 'Essence', currentCost: 100, optimizedCost: 50, suggestion: 'Covoiturage BlaBlaCar' },
    ],
  },
};

export function LifestyleTab(props: LifestyleTabProps) {
  const [items, setItems] = createSignal<LifestyleItem[]>(props.initialItems || []);
  const [activeCategory, setActiveCategory] = createSignal<string>('subscriptions');
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newItem, setNewItem] = createSignal<Partial<LifestyleItem>>({
    name: '',
    category: 'subscriptions',
    currentCost: 0,
  });

  const addItem = (suggestion?: Partial<LifestyleItem>) => {
    const base = suggestion || newItem();
    if (!base.name) return;

    const item: LifestyleItem = {
      id: `lifestyle_${Date.now()}`,
      category:
        (base.category as LifestyleItem['category']) ||
        (activeCategory() as LifestyleItem['category']),
      name: base.name,
      currentCost: base.currentCost || 0,
      optimizedCost: base.optimizedCost,
      suggestion: base.suggestion,
      applied: false,
    };

    const updated = [...items(), item];
    setItems(updated);
    props.onItemsChange?.(updated);
    setShowAddForm(false);
    setNewItem({ name: '', category: 'subscriptions', currentCost: 0 });
  };

  const applyOptimization = (id: string) => {
    const updated = items().map((item) => (item.id === id ? { ...item, applied: true } : item));
    setItems(updated);
    props.onItemsChange?.(updated);
  };

  const removeItem = (id: string) => {
    const updated = items().filter((item) => item.id !== id);
    setItems(updated);
    props.onItemsChange?.(updated);
  };

  const totalCurrent = () => items().reduce((sum, i) => sum + i.currentCost, 0);
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
      <div class="grid grid-cols-3 gap-4">
        <div class="card">
          <div class="text-sm text-slate-500">Actuel</div>
          <div class="text-2xl font-bold text-slate-900 mt-1">{totalCurrent()}€</div>
          <div class="text-xs text-slate-400">/mois</div>
        </div>
        <div class="card bg-gradient-to-br from-green-50 to-green-100">
          <div class="text-sm text-green-600">Optimise</div>
          <div class="text-2xl font-bold text-green-900 mt-1">{totalOptimized()}€</div>
          <div class="text-xs text-green-500">/mois</div>
        </div>
        <div class="card bg-gradient-to-br from-amber-50 to-amber-100">
          <div class="text-sm text-amber-600">Economies possibles</div>
          <div class="text-2xl font-bold text-amber-900 mt-1">+{potentialSavings()}€</div>
          <div class="text-xs text-amber-500">/mois</div>
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
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
        <div class="card bg-slate-50">
          <h4 class="text-sm font-medium text-slate-700 mb-3">Suggestions</h4>
          <div class="flex flex-wrap gap-2">
            <For
              each={SUGGESTIONS[activeCategory()]?.items.filter(
                (s) => !items().some((i) => i.name === s.name)
              )}
            >
              {(suggestion) => (
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm bg-white border border-slate-200 rounded-full hover:border-primary-300 transition-colors"
                  onClick={() =>
                    addItem({
                      ...suggestion,
                      category: activeCategory() as LifestyleItem['category'],
                    })
                  }
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
          <h3 class="font-medium text-slate-900">
            {getCategoryInfo(activeCategory())?.icon} {getCategoryInfo(activeCategory())?.label}
          </h3>
          <button
            type="button"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium"
            onClick={() => setShowAddForm(true)}
          >
            + Ajouter
          </button>
        </div>

        <For each={items().filter((i) => i.category === activeCategory())}>
          {(item) => (
            <div class="card flex items-center gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-medium text-slate-900">{item.name}</h4>
                  <Show when={item.applied}>
                    <span class="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      Optimise
                    </span>
                  </Show>
                </div>
                <Show when={item.suggestion && !item.applied}>
                  <p class="text-sm text-amber-600 mt-1">💡 {item.suggestion}</p>
                </Show>
              </div>

              <div class="flex items-center gap-4">
                <div class="text-right">
                  <Show when={item.optimizedCost !== undefined && !item.applied}>
                    <div class="text-sm text-slate-400 line-through">{item.currentCost}€</div>
                    <div class="font-bold text-green-600">{item.optimizedCost}€</div>
                  </Show>
                  <Show when={item.applied}>
                    <div class="font-bold text-green-600">{item.optimizedCost}€</div>
                  </Show>
                  <Show
                    when={
                      item.optimizedCost === undefined ||
                      (item.optimizedCost !== undefined &&
                        !item.applied &&
                        item.applied === undefined)
                    }
                  >
                    <div class="font-bold text-slate-900">{item.currentCost}€</div>
                  </Show>
                </div>

                <Show when={item.optimizedCost !== undefined && !item.applied}>
                  <button
                    type="button"
                    class="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                    onClick={() => applyOptimization(item.id)}
                  >
                    Appliquer
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

        <Show when={items().filter((i) => i.category === activeCategory()).length === 0}>
          <div class="text-center py-8 text-slate-500">Aucun element dans cette categorie</div>
        </Show>
      </div>

      {/* Add Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">Nouvelle depense</h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">Nom</label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Netflix, Metro, Courses..."
                  value={newItem().name}
                  onInput={(e) => setNewItem({ ...newItem(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  Cout mensuel (€)
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
                <label class="block text-sm font-medium text-slate-700 mb-1">Categorie</label>
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
                onClick={() => setShowAddForm(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
                onClick={() => addItem()}
                disabled={!newItem().name}
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
