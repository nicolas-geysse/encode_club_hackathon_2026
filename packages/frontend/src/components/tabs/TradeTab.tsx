/**
 * Trade Tab Component
 *
 * Borrowing and trading: track loans and exchanges with friends.
 */

import { createSignal, For, Show } from 'solid-js';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';

interface TradeItem {
  id: string;
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  description?: string;
  partner: string;
  value: number;
  status: 'active' | 'completed' | 'pending';
  dueDate?: string;
  inventoryItemId?: string; // Link to the source inventory item
}

interface InventoryItemForTrade {
  id: string;
  name: string;
  estimatedValue: number;
  category?: string;
}

interface LifestyleItemForTrade {
  name: string;
  currentCost: number;
  pausedMonths?: number;
}

interface TradeTabProps {
  initialTrades?: TradeItem[];
  onTradesChange?: (trades: TradeItem[]) => void;
  goalName?: string;
  goalAmount?: number;
  currency?: Currency;
  inventoryItems?: InventoryItemForTrade[];
  lifestyleItems?: LifestyleItemForTrade[];
  onInventorySold?: (inventoryItemId: string, soldPrice: number) => Promise<void>;
}

interface TradeSuggestion {
  type: 'borrow' | 'lend' | 'trade' | 'sell';
  name: string;
  description: string;
  estimatedSavings: number;
  sourceType?: 'goal' | 'inventory';
}

// Generate suggestions based on goal and inventory
function getSuggestions(
  goalName?: string,
  _goalAmount?: number,
  _inventoryItems?: InventoryItemForTrade[]
): TradeSuggestion[] {
  const suggestions: TradeSuggestion[] = [];
  const lowerGoal = (goalName || '').toLowerCase();

  // Note: Inventory items are now shown directly in the Sell tab list,
  // not as suggestions here

  // GOAL-BASED SUGGESTIONS: Context-aware borrow/trade suggestions

  // Camping/vacation goal suggestions
  if (
    lowerGoal.includes('camping') ||
    lowerGoal.includes('vacation') ||
    lowerGoal.includes('travel')
  ) {
    suggestions.push({
      type: 'borrow',
      name: 'Camping tent',
      description: 'Borrow a 2-person tent for your trip',
      estimatedSavings: 80,
      sourceType: 'goal',
    });
    suggestions.push({
      type: 'borrow',
      name: 'Sleeping bag',
      description: 'Ask a friend or family member',
      estimatedSavings: 40,
      sourceType: 'goal',
    });
    suggestions.push({
      type: 'borrow',
      name: 'Cooler/Ice box',
      description: 'To keep your food fresh during the trip',
      estimatedSavings: 30,
      sourceType: 'goal',
    });
  }

  // Tech/electronics goal suggestions
  if (lowerGoal.includes('computer') || lowerGoal.includes('pc') || lowerGoal.includes('tech')) {
    suggestions.push({
      type: 'borrow',
      name: 'Repair tools',
      description: 'To upgrade it yourself',
      estimatedSavings: 25,
      sourceType: 'goal',
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
      sourceType: 'goal',
    });
    suggestions.push({
      type: 'borrow',
      name: 'Hand truck/Dolly',
      description: 'To move heavy furniture',
      estimatedSavings: 35,
      sourceType: 'goal',
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
      sourceType: 'goal',
    });
  }

  // 4. GENERIC SUGGESTIONS: Only if nothing else available
  const nonGenericCount = suggestions.filter((s) => s.sourceType !== undefined).length;
  if (nonGenericCount < 2) {
    suggestions.push({
      type: 'borrow',
      name: 'Power tools',
      description: 'Borrow drill, saw, etc. for occasional DIY',
      estimatedSavings: 30,
      sourceType: 'goal',
    });
    suggestions.push({
      type: 'trade',
      name: 'Skill exchange',
      description: 'Offer tutoring/design in exchange for help',
      estimatedSavings: 40,
      sourceType: 'goal',
    });
  }

  return suggestions;
}

const TRADE_TYPES = [
  {
    id: 'sell',
    label: 'Sell',
    icon: '💰',
    color: 'green',
    description: 'One-time sales for income',
  },
  {
    id: 'borrow',
    label: 'Borrow',
    icon: '📥',
    color: 'blue',
    description: 'Items you need without buying',
  },
  {
    id: 'trade',
    label: 'Trade',
    icon: '🔄',
    color: 'purple',
    description: 'Exchange skills or items',
  },
  {
    id: 'lend',
    label: 'Lend',
    icon: '📤',
    color: 'orange',
    description: 'Share unused items with friends',
  },
];

export function TradeTab(props: TradeTabProps) {
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const [trades, setTrades] = createSignal<TradeItem[]>(props.initialTrades || []);
  const [activeType, setActiveType] = createSignal<string>('sell');
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [deleteConfirm, setDeleteConfirm] = createSignal<{ id: string; name: string } | null>(null);
  const [editingTradeId, setEditingTradeId] = createSignal<string | null>(null);
  const [newTrade, setNewTrade] = createSignal<Partial<TradeItem>>({
    type: 'sell',
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

  const updateStatus = async (id: string, status: TradeItem['status']) => {
    const trade = trades().find((t) => t.id === id);

    // If completing a sell linked to an inventory item, update inventory status
    if (
      status === 'completed' &&
      trade?.type === 'sell' &&
      trade?.inventoryItemId &&
      props.onInventorySold
    ) {
      await props.onInventorySold(trade.inventoryItemId, trade.value);
    }

    const updated = trades().map((t) => (t.id === id ? { ...t, status } : t));
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

  const removeTrade = (id: string) => {
    const updated = trades().filter((t) => t.id !== id);
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

  const resetForm = () => {
    setNewTrade({
      type: activeType() as TradeItem['type'],
      name: '',
      partner: '',
      value: 0,
      status: 'pending',
    });
    setEditingTradeId(null);
  };

  const handleEditTrade = (trade: TradeItem) => {
    setEditingTradeId(trade.id);
    setNewTrade({
      type: trade.type,
      name: trade.name,
      description: trade.description,
      partner: trade.partner,
      value: trade.value,
      dueDate: trade.dueDate,
      status: trade.status,
    });
    setShowAddForm(true);
  };

  const updateTrade = () => {
    const tradeId = editingTradeId();
    if (!tradeId) return;

    const data = newTrade();
    const updated = trades().map((t) =>
      t.id === tradeId
        ? {
            ...t,
            name: data.name || t.name,
            description: data.description,
            partner: data.partner || t.partner,
            value: data.value ?? t.value,
            dueDate: data.dueDate,
          }
        : t
    );
    setTrades(updated);
    props.onTradesChange?.(updated);
    setShowAddForm(false);
    resetForm();
  };

  const cancelSale = (id: string) => {
    // Simply remove the pending trade - inventory item wasn't marked as sold yet
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

  // Total from completed sales
  const soldValue = () =>
    trades()
      .filter((t) => t.type === 'sell' && t.status === 'completed')
      .reduce((sum, t) => sum + t.value, 0);

  // Total savings from borrowing (money not spent) + sales
  const totalSavings = () => borrowedValue() + soldValue();

  // Potential value from pending sells + available inventory not yet listed
  const potentialSaleValue = () => {
    const pendingSells = trades()
      .filter((t) => t.type === 'sell' && t.status !== 'completed')
      .reduce((sum, t) => sum + t.value, 0);

    const availableInventory = (props.inventoryItems || [])
      .filter((item) => !trades().some((t) => t.inventoryItemId === item.id))
      .reduce((sum, item) => sum + item.estimatedValue, 0);

    return pendingSells + availableInventory;
  };

  // Savings percentage of goal
  const savingsPercent = () => {
    if (!props.goalAmount || props.goalAmount <= 0) return 0;
    return Math.round((totalSavings() / props.goalAmount) * 100);
  };

  // Get suggestions based on goal (inventory items shown directly in Sell list)
  const suggestions = () => getSuggestions(props.goalName, props.goalAmount);

  // Add inventory item directly as a sell trade (no form)
  const addInventoryItemToSell = (item: InventoryItemForTrade) => {
    const newTrade: TradeItem = {
      id: `trade_${Date.now()}`,
      type: 'sell',
      name: item.name,
      description: `From inventory - ${item.category || 'item'}`,
      partner: 'Marketplace',
      value: item.estimatedValue,
      status: 'pending',
      inventoryItemId: item.id,
    };

    const updated = [...trades(), newTrade];
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

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
        return {
          label: 'In progress',
          class: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
        };
      case 'completed':
        return {
          label: 'Done',
          class: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
        };
      case 'pending':
        return {
          label: 'Pending',
          class: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400',
        };
      default:
        return {
          label: status,
          class: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
        };
    }
  };

  return (
    <div class="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Summary Cards */}
      <div class="grid grid-cols-3 gap-4">
        <div class="card bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30">
          <div class="text-sm text-green-600 dark:text-green-400 font-medium">💰 From Sales</div>
          <div class="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
            {formatCurrency(soldValue(), currency())}
          </div>
          <div class="flex items-center justify-between text-xs mt-1">
            <span class="text-green-500 dark:text-green-400">
              {trades().filter((t) => t.type === 'sell' && t.status === 'completed').length} sold
            </span>
            <Show when={potentialSaleValue() > 0}>
              <span class="text-amber-600 dark:text-amber-400">
                {formatCurrency(potentialSaleValue(), currency(), { showSign: true })} potential
              </span>
            </Show>
          </div>
        </div>
        <div class="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30">
          <div class="text-sm text-blue-600 dark:text-blue-400 font-medium">📥 Borrowed</div>
          <div class="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
            {formatCurrency(borrowedValue(), currency())}
          </div>
          <div class="text-xs text-blue-500 dark:text-blue-400 mt-1">
            {trades().filter((t) => t.type === 'borrow' && t.status === 'active').length} active
          </div>
        </div>
        <div class="card bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30">
          <div class="text-sm text-orange-600 dark:text-orange-400 font-medium">📤 Lent</div>
          <div class="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">
            {formatCurrency(lentValue(), currency())}
          </div>
          <div class="text-xs text-orange-500 dark:text-orange-400 mt-1">
            {trades().filter((t) => t.type === 'lend' && t.status === 'active').length} active
          </div>
        </div>
      </div>

      {/* Goal Progress - shows when there's a goal */}
      <Show when={props.goalAmount && props.goalAmount > 0}>
        <div class="card bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/30 dark:to-primary-800/30">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-primary-700 dark:text-primary-300 font-medium">
              Total Progress: {formatCurrency(totalSavings(), currency())} /{' '}
              {formatCurrency(props.goalAmount || 0, currency())}
            </span>
            <span class="text-lg font-bold text-primary-900 dark:text-primary-100">
              {savingsPercent()}%
            </span>
          </div>
          <div class="h-3 bg-primary-200 dark:bg-primary-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary-600 dark:bg-primary-400 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(savingsPercent(), 100)}%` }}
            />
          </div>
        </div>
      </Show>

      {/* Goal-based suggestions (Borrow/Trade) */}
      <Show when={suggestions().filter((s) => s.sourceType === 'goal').length > 0}>
        <div class="card bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/30 dark:to-indigo-900/30 border-purple-200 dark:border-purple-800">
          <h3 class="font-medium text-purple-900 dark:text-purple-200 mb-3 flex items-center gap-2">
            <span>💡</span> Suggestions for "{props.goalName || 'your goal'}"
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <For each={suggestions().filter((s) => s.sourceType === 'goal')}>
              {(suggestion) => (
                <button
                  type="button"
                  class="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border border-purple-100 dark:border-purple-800 hover:border-purple-300 dark:hover:border-purple-600 transition-colors text-left"
                  onClick={() => addFromSuggestion(suggestion)}
                >
                  <div>
                    <div class="font-medium text-slate-900 dark:text-slate-100">
                      {suggestion.name}
                    </div>
                    <div class="text-xs text-slate-500 dark:text-slate-400">
                      {suggestion.description}
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-green-600 dark:text-green-400 font-bold">
                      -{formatCurrency(suggestion.estimatedSavings, currency())}
                    </div>
                    <div class="text-xs text-slate-400">to save</div>
                  </div>
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Type Tabs */}
      <div class="flex flex-wrap gap-2">
        <For each={TRADE_TYPES}>
          {(type) => (
            <button
              type="button"
              class={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                activeType() === type.id
                  ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
              onClick={() => setActiveType(type.id)}
              title={type.description}
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
          <h3 class="font-medium text-slate-900 dark:text-slate-100">
            {getTypeInfo(activeType())?.icon} {getTypeInfo(activeType())?.label}
          </h3>
          <button
            type="button"
            class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
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
              <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl">
                {getTypeInfo(trade.type)?.icon}
              </div>

              {/* Trade Info */}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-medium text-slate-900 dark:text-slate-100">{trade.name}</h4>
                  <span
                    class={`px-2 py-0.5 text-xs font-medium rounded-full ${
                      getStatusBadge(trade.status).class
                    }`}
                  >
                    {getStatusBadge(trade.status).label}
                  </span>
                </div>
                <div class="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                  <span>
                    {trade.type === 'borrow' ? 'From' : trade.type === 'lend' ? 'To' : 'With'}{' '}
                    <strong>{trade.partner}</strong>
                  </span>
                  <Show when={trade.dueDate}>
                    <span class="text-slate-300 dark:text-slate-600">•</span>
                    <span>Return: {new Date(trade.dueDate!).toLocaleDateString('en-US')}</span>
                  </Show>
                </div>
                <Show when={trade.description}>
                  <p class="text-sm text-slate-400 mt-1">{trade.description}</p>
                </Show>
              </div>

              {/* Value */}
              <div class="flex-shrink-0 text-right">
                <div class="font-bold text-slate-900 dark:text-slate-100">
                  {currencySymbol()}
                  {trade.value}
                </div>
              </div>

              {/* Actions */}
              <div class="flex-shrink-0 flex items-center gap-2">
                {/* Cancel button for pending trades */}
                <Show when={trade.status === 'pending'}>
                  <button
                    type="button"
                    class="px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    onClick={() => cancelSale(trade.id)}
                  >
                    Cancel
                  </button>
                </Show>
                {/* Confirm/Done buttons for non-completed trades */}
                <Show when={trade.status !== 'completed'}>
                  <button
                    type="button"
                    class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                    onClick={() =>
                      updateStatus(trade.id, trade.status === 'pending' ? 'active' : 'completed')
                    }
                  >
                    {trade.status === 'pending' ? 'Confirm' : 'Done'}
                  </button>
                </Show>
                <button
                  type="button"
                  class="text-slate-400 hover:text-primary-500 transition-colors"
                  onClick={() => handleEditTrade(trade)}
                  title="Edit"
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
                  class="text-slate-400 hover:text-red-500 transition-colors"
                  onClick={() => setDeleteConfirm({ id: trade.id, name: trade.name })}
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

        {/* Show inventory items as available to sell when on Sell tab */}
        <Show
          when={activeType() === 'sell' && props.inventoryItems && props.inventoryItems.length > 0}
        >
          <div class="text-xs text-slate-500 dark:text-slate-400 mb-2 mt-4 font-medium uppercase tracking-wide">
            Available from inventory
          </div>
          <For
            each={(props.inventoryItems || []).filter(
              (item) => !trades().some((t) => t.inventoryItemId === item.id)
            )}
          >
            {(item) => (
              <div class="card flex items-center gap-4">
                <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center text-2xl">
                  💰
                </div>
                <div class="flex-1 min-w-0">
                  <h4 class="font-medium text-slate-900 dark:text-slate-100">{item.name}</h4>
                  <div class="text-sm text-slate-500 dark:text-slate-400">From your inventory</div>
                </div>
                <div class="text-right font-bold text-green-600 dark:text-green-400">
                  {currencySymbol()}
                  {item.estimatedValue}
                </div>
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                  onClick={() => addInventoryItemToSell(item)}
                >
                  List for sale
                </button>
              </div>
            )}
          </For>
        </Show>

        <Show
          when={
            trades().filter((t) => t.type === activeType()).length === 0 &&
            !(
              activeType() === 'sell' &&
              props.inventoryItems &&
              (props.inventoryItems || []).filter(
                (item) => !trades().some((t) => t.inventoryItemId === item.id)
              ).length > 0
            )
          }
        >
          <div class="text-center py-8 text-slate-500 dark:text-slate-400">
            <div class="text-4xl mb-3">{getTypeInfo(activeType())?.icon}</div>
            <p>
              {activeType() === 'sell'
                ? "You haven't listed anything for sale"
                : activeType() === 'borrow'
                  ? "You haven't borrowed anything"
                  : activeType() === 'lend'
                    ? "You haven't lent anything"
                    : 'No trades in progress'}
            </p>
          </div>
        </Show>
      </div>

      {/* Tips */}
      <div class="card bg-slate-50 dark:bg-slate-700">
        <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">💡 Tip</h4>
        <p class="text-sm text-slate-600 dark:text-slate-400">
          {activeType() === 'sell'
            ? 'Selling unused items is a quick way to generate cash. List on marketplaces or ask friends!'
            : activeType() === 'borrow'
              ? 'Borrowing textbooks or equipment can help you save money. Ask your friends or the library!'
              : activeType() === 'lend'
                ? 'Lending unused items strengthens bonds and can lead to future exchanges.'
                : 'Bartering is a great way to get what you need without spending. Offer your skills!'}
        </p>
      </div>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div class="card max-w-md w-full">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {getTypeInfo(newTrade().type || 'sell')?.icon} {editingTradeId() ? 'Edit' : 'New'}{' '}
              {getTypeInfo(newTrade().type || 'sell')?.label}
            </h3>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  What?
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Laptop, Math textbook..."
                  value={newTrade().name}
                  onInput={(e) => setNewTrade({ ...newTrade(), name: e.currentTarget.value })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Estimated value ({currencySymbol()})
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
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Return date
                  </label>
                  <input
                    type="date"
                    class="input-field"
                    value={newTrade().dueDate}
                    onInput={(e) => setNewTrade({ ...newTrade(), dueDate: e.currentTarget.value })}
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
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
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                class="btn-primary flex-1"
                onClick={() => (editingTradeId() ? updateTrade() : addTrade())}
                disabled={!newTrade().name || !newTrade().partner}
              >
                {editingTradeId() ? 'Update' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteConfirm()}
        title="Delete trade?"
        message={`Are you sure you want to delete "${deleteConfirm()?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          const confirm = deleteConfirm();
          if (confirm) {
            removeTrade(confirm.id);
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
