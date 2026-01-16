/**
 * Trade Tab Component
 *
 * Borrowing and trading: track loans and exchanges with friends.
 */

import { createSignal, For, Show } from 'solid-js';

interface TradeItem {
  id: string;
  type: 'borrow' | 'lend' | 'trade';
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: 'active' | 'completed' | 'pending';
  dueDate?: string;
}

interface TradeTabProps {
  initialTrades?: TradeItem[];
  onTradesChange?: (trades: TradeItem[]) => void;
  goalName?: string;
  goalAmount?: number;
}

interface TradeSuggestion {
  type: 'borrow' | 'lend' | 'trade';
  name: string;
  description: string;
  estimatedSavings: number;
}

// Generate suggestions based on goal
function getSuggestions(goalName?: string, _goalAmount?: number): TradeSuggestion[] {
  const suggestions: TradeSuggestion[] = [];
  const lowerGoal = (goalName || '').toLowerCase();

  // Camping/vacation goal suggestions
  if (
    lowerGoal.includes('camping') ||
    lowerGoal.includes('vacation') ||
    lowerGoal.includes('travel')
  ) {
    suggestions.push({
      type: 'borrow',
      name: 'Tent',
      description: 'Borrow a tent instead of buying',
      estimatedSavings: 80,
    });
    suggestions.push({
      type: 'borrow',
      name: 'Sleeping bag',
      description: 'Borrow from a friend for the vacation',
      estimatedSavings: 40,
    });
    suggestions.push({
      type: 'borrow',
      name: 'Cooler',
      description: 'To keep your food fresh',
      estimatedSavings: 30,
    });
  }

  // Tech/electronics goal suggestions
  if (lowerGoal.includes('computer') || lowerGoal.includes('pc') || lowerGoal.includes('tech')) {
    suggestions.push({
      type: 'borrow',
      name: 'Repair tools',
      description: 'To upgrade it yourself',
      estimatedSavings: 25,
    });
  }

  // Moving/housing goal suggestions
  if (
    lowerGoal.includes('apartment') ||
    lowerGoal.includes('moving') ||
    lowerGoal.includes('housing')
  ) {
    suggestions.push({
      type: 'borrow',
      name: 'Moving boxes',
      description: 'Reuse from your friends',
      estimatedSavings: 20,
    });
    suggestions.push({
      type: 'borrow',
      name: 'Hand truck/Dolly',
      description: 'To move heavy furniture',
      estimatedSavings: 35,
    });
  }

  // Study/school goal suggestions
  if (
    lowerGoal.includes('study') ||
    lowerGoal.includes('school') ||
    lowerGoal.includes('training') ||
    lowerGoal.includes('license')
  ) {
    suggestions.push({
      type: 'borrow',
      name: 'Textbooks',
      description: 'Borrow from previous year students',
      estimatedSavings: 50,
    });
  }

  // Generic suggestions (always show some)
  if (suggestions.length < 3) {
    suggestions.push({
      type: 'borrow',
      name: 'Tools',
      description: 'For occasional DIY',
      estimatedSavings: 30,
    });
    suggestions.push({
      type: 'trade',
      name: 'Skills/Courses',
      description: 'Exchange your skills for others',
      estimatedSavings: 40,
    });
  }

  return suggestions;
}

const TRADE_TYPES = [
  { id: 'borrow', label: 'Borrow', icon: '📥', color: 'blue' },
  { id: 'lend', label: 'Lend', icon: '📤', color: 'orange' },
  { id: 'trade', label: 'Trade', icon: '🔄', color: 'purple' },
];

export function TradeTab(props: TradeTabProps) {
  const [trades, setTrades] = createSignal<TradeItem[]>(props.initialTrades || []);
  const [activeType, setActiveType] = createSignal<string>('borrow');
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newTrade, setNewTrade] = createSignal<Partial<TradeItem>>({
    type: 'borrow',
    name: '',
    partner: '',
    value: 0,
    status: 'pending',
  });

  const addTrade = () => {
    const trade = newTrade();
    if (!trade.name || !trade.partner) return;

    const newTradeComplete: TradeItem = {
      id: `trade_${Date.now()}`,
      type: (trade.type as TradeItem['type']) || 'borrow',
      name: trade.name,
      description: trade.description,
      partner: trade.partner,
      value: trade.value || 0,
      status: (trade.status as TradeItem['status']) || 'pending',
      dueDate: trade.dueDate,
    };

    const updated = [...trades(), newTradeComplete];
    setTrades(updated);
    props.onTradesChange?.(updated);
    setShowAddForm(false);
    setNewTrade({
      type: activeType() as TradeItem['type'],
      name: '',
      partner: '',
      value: 0,
      status: 'pending',
    });
  };

  const updateStatus = (id: string, status: TradeItem['status']) => {
    const updated = trades().map((t) => (t.id === id ? { ...t, status } : t));
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

  const removeTrade = (id: string) => {
    const updated = trades().filter((t) => t.id !== id);
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

  const borrowedValue = () =>
    trades()
      .filter((t) => t.type === 'borrow' && t.status === 'active')
      .reduce((sum, t) => sum + t.value, 0);

  const lentValue = () =>
    trades()
      .filter((t) => t.type === 'lend' && t.status === 'active')
      .reduce((sum, t) => sum + t.value, 0);

  // Total savings from borrowing (money not spent)
  const totalSavings = () => borrowedValue();

  // Savings percentage of goal
  const savingsPercent = () => {
    if (!props.goalAmount || props.goalAmount <= 0) return 0;
    return Math.round((totalSavings() / props.goalAmount) * 100);
  };

  // Get suggestions based on goal
  const suggestions = () => getSuggestions(props.goalName, props.goalAmount);

  // Add a suggestion as a trade
  const addFromSuggestion = (suggestion: TradeSuggestion) => {
    const newTrade: TradeItem = {
      id: `trade_${Date.now()}`,
      type: suggestion.type,
      name: suggestion.name,
      description: suggestion.description,
      partner: '', // User fills this in
      value: suggestion.estimatedSavings,
      status: 'pending',
    };

    setNewTrade({
      ...newTrade,
      partner: '',
    });
    setShowAddForm(true);
  };

  const getTypeInfo = (type: string) => TRADE_TYPES.find((t) => t.id === type);

  const getStatusBadge = (status: string) => {
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
  };

  return (
    <div class="p-6 space-y-6 max-w-3xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100">
          <div class="text-sm text-blue-600 font-medium">I borrowed</div>
          <div class="text-2xl font-bold text-blue-900 mt-1">{borrowedValue()}€</div>
          <div class="text-xs text-blue-500 mt-1">
            {trades().filter((t) => t.type === 'borrow' && t.status === 'active').length} active
          </div>
        </div>
        <div class="card bg-gradient-to-br from-orange-50 to-orange-100">
          <div class="text-sm text-orange-600 font-medium">I lent</div>
          <div class="text-2xl font-bold text-orange-900 mt-1">{lentValue()}€</div>
          <div class="text-xs text-orange-500 mt-1">
            {trades().filter((t) => t.type === 'lend' && t.status === 'active').length} active
          </div>
        </div>
        {/* Savings card - shows when there's a goal */}
        <Show when={props.goalAmount && props.goalAmount > 0}>
          <div class="card bg-gradient-to-br from-green-50 to-green-100">
            <div class="text-sm text-green-600 font-medium">Savings</div>
            <div class="text-2xl font-bold text-green-900 mt-1">{totalSavings()}€</div>
            <div class="text-xs text-green-500 mt-1">{savingsPercent()}% of goal</div>
          </div>
        </Show>
      </div>

      {/* Suggestions based on goal */}
      <Show when={suggestions().length > 0}>
        <div class="card bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <h3 class="font-medium text-purple-900 mb-3 flex items-center gap-2">
            <span>💡</span> Suggestions for "{props.goalName || 'your goal'}"
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <For each={suggestions()}>
              {(suggestion) => (
                <button
                  type="button"
                  class="flex items-center justify-between p-3 bg-white rounded-lg border border-purple-100 hover:border-purple-300 transition-colors text-left"
                  onClick={() => addFromSuggestion(suggestion)}
                >
                  <div>
                    <div class="font-medium text-slate-900">{suggestion.name}</div>
                    <div class="text-xs text-slate-500">{suggestion.description}</div>
                  </div>
                  <div class="text-right">
                    <div class="text-green-600 font-bold">-{suggestion.estimatedSavings}€</div>
                    <div class="text-xs text-slate-400">to save</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Type Tabs */}
      <div class="flex gap-2">
        <For each={TRADE_TYPES}>
          {(type) => (
            <button
              type="button"
              class={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                activeType() === type.id
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setActiveType(type.id)}
            >
              <span>{type.icon}</span>
              <span>{type.label}</span>
            </button>
          )}
        </For>
      </div>

      {/* Trades List */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-slate-900">
            {getTypeInfo(activeType())?.icon} {getTypeInfo(activeType())?.label}
          </h3>
          <button
            type="button"
            class="text-sm text-primary-600 hover:text-primary-700 font-medium"
            onClick={() => {
              setNewTrade({ ...newTrade(), type: activeType() as TradeItem['type'] });
              setShowAddForm(true);
            }}
          >
            + Add
          </button>
        </div>

        <For each={trades().filter((t) => t.type === activeType())}>
          {(trade) => (
            <div class="card flex items-center gap-4">
              {/* Icon */}
              <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center text-2xl">
                {getTypeInfo(trade.type)?.icon}
              </div>

              {/* Trade Info */}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-medium text-slate-900">{trade.name}</h4>
                  <span
                    class={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      getStatusBadge(trade.status).class
                    }`}
                  >
                    {getStatusBadge(trade.status).label}
                  </span>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm text-slate-500">
                  <span>
                    {trade.type === 'borrow' ? 'From' : trade.type === 'lend' ? 'To' : 'With'}{' '}
                    <strong>{trade.partner}</strong>
                  </span>
                  <Show when={trade.dueDate}>
                    <span class="text-slate-300">•</span>
                    <span>Return: {new Date(trade.dueDate!).toLocaleDateString('en-US')}</span>
                  </Show>
                </div>
                <Show when={trade.description}>
                  <p class="text-sm text-slate-400 mt-1">{trade.description}</p>
                </Show>
              </div>

              {/* Value */}
              <div class="flex-shrink-0 text-right">
                <div class="font-bold text-slate-900">{trade.value}€</div>
              </div>

              {/* Actions */}
              <div class="flex-shrink-0 flex items-center gap-2">
                <Show when={trade.status !== 'completed'}>
                  <button
                    type="button"
                    class="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                    onClick={() => updateStatus(trade.id, 'completed')}
                  >
                    Done
                  </button>
                </Show>
                <button
                  type="button"
                  class="text-slate-400 hover:text-red-500 transition-colors"
                  onClick={() => removeTrade(trade.id)}
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

        <Show when={trades().filter((t) => t.type === activeType()).length === 0}>
          <div class="text-center py-8 text-slate-500">
            <div class="text-4xl mb-3">{getTypeInfo(activeType())?.icon}</div>
            <p>
              {activeType() === 'borrow'
                ? "You haven't borrowed anything"
                : activeType() === 'lend'
                  ? "You haven't lent anything"
                  : 'No trades in progress'}
            </p>
          </div>
        </Show>
      </div>

      {/* Tips */}
      <div class="card bg-slate-50">
        <h4 class="text-sm font-medium text-slate-700 mb-2">💡 Tip</h4>
        <p class="text-sm text-slate-600">
          {activeType() === 'borrow'
            ? 'Borrowing textbooks or equipment can help you save money. Ask your friends or the library!'
            : activeType() === 'lend'
              ? 'Lending unused items strengthens bonds and can lead to future exchanges.'
              : 'Bartering is a great way to get what you need without spending. Offer your skills!'}
        </p>
      </div>

      {/* Add Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 mb-4">
              {getTypeInfo(newTrade().type || 'borrow')?.icon}{' '}
              {getTypeInfo(newTrade().type || 'borrow')?.label}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">What?</label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Laptop, Math textbook..."
                  value={newTrade().name}
                  onInput={(e) => setNewTrade({ ...newTrade(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  {newTrade().type === 'borrow'
                    ? 'From whom?'
                    : newTrade().type === 'lend'
                      ? 'To whom?'
                      : 'With whom?'}
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Person's name"
                  value={newTrade().partner}
                  onInput={(e) => setNewTrade({ ...newTrade(), partner: e.currentTarget.value })}
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">
                    Estimated value (€)
                  </label>
                  <input
                    type="number"
                    class="input-field"
                    min="0"
                    value={newTrade().value}
                    onInput={(e) =>
                      setNewTrade({ ...newTrade(), value: parseInt(e.currentTarget.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700 mb-1">Return date</label>
                  <input
                    type="date"
                    class="input-field"
                    value={newTrade().dueDate}
                    onInput={(e) => setNewTrade({ ...newTrade(), dueDate: e.currentTarget.value })}
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 mb-1">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Return before vacation"
                  value={newTrade().description}
                  onInput={(e) =>
                    setNewTrade({ ...newTrade(), description: e.currentTarget.value })
                  }
                />
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
                onClick={addTrade}
                disabled={!newTrade().name || !newTrade().partner}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
