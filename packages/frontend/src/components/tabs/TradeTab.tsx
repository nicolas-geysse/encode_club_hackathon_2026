/**
 * Trade Tab Component
 *
 * Borrowing and trading: track loans and exchanges with friends.
 */

import { createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  Banknote,
  Download,
  Repeat,
  Upload,
  Lightbulb,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  AlertCircle,
} from 'lucide-solid';
import { cn } from '~/lib/cn';

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
    icon: Banknote,
    color: 'green',
    description: 'One-time sales for income',
  },
  {
    id: 'borrow',
    label: 'Borrow',
    icon: Download,
    color: 'blue',
    description: 'Items you need without buying',
  },
  {
    id: 'trade',
    label: 'Trade',
    icon: Repeat,
    color: 'purple',
    description: 'Exchange skills or items',
  },
  {
    id: 'lend',
    label: 'Lend',
    icon: Upload,
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

  const getTypeIcon = (type: string) => {
    const info = TRADE_TYPES.find((t) => t.id === type);
    return info?.icon || Banknote;
  };

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
    <div class="p-6 space-y-6">
      {/* Summary Cards */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card class="border-green-500/20 bg-green-500/5">
          <CardContent class="p-6">
            <div class="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-2">
              <Banknote class="h-4 w-4" /> From Sales
            </div>
            <div class="text-2xl font-bold text-green-900 dark:text-green-100 mt-2">
              {formatCurrency(soldValue(), currency())}
            </div>
            <div class="flex items-center justify-between text-xs mt-1 text-green-600/80 dark:text-green-400/80">
              <span>
                {trades().filter((t) => t.type === 'sell' && t.status === 'completed').length} sold
              </span>
              <Show when={potentialSaleValue() > 0}>
                <span class="text-amber-600 dark:text-amber-400 ml-2">
                  {formatCurrency(potentialSaleValue(), currency(), { showSign: true })} potential
                </span>
              </Show>
            </div>
          </CardContent>
        </Card>

        <Card class="border-blue-500/20 bg-blue-500/5">
          <CardContent class="p-6">
            <div class="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
              <Download class="h-4 w-4" /> Borrowed
            </div>
            <div class="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
              {formatCurrency(borrowedValue(), currency())}
            </div>
            <div class="text-xs text-blue-500 dark:text-blue-400 mt-1">
              {trades().filter((t) => t.type === 'borrow' && t.status === 'active').length} active
            </div>
          </CardContent>
        </Card>

        <Card class="border-orange-500/20 bg-orange-500/5">
          <CardContent class="p-6">
            <div class="text-sm text-orange-600 dark:text-orange-400 font-medium flex items-center gap-2">
              <Upload class="h-4 w-4" /> Lent
            </div>
            <div class="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-2">
              {formatCurrency(lentValue(), currency())}
            </div>
            <div class="text-xs text-orange-500 dark:text-orange-400 mt-1">
              {trades().filter((t) => t.type === 'lend' && t.status === 'active').length} active
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goal-based suggestions (Borrow/Trade) */}
      <Show when={suggestions().filter((s) => s.sourceType === 'goal').length > 0}>
        <Card class="bg-purple-500/5 border-purple-500/20">
          <CardContent class="p-4">
            <h3 class="font-medium text-purple-900 dark:text-purple-200 mb-3 flex items-center gap-2">
              <Lightbulb class="h-4 w-4" /> Suggestions for "{props.goalName || 'your goal'}"
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <For each={suggestions().filter((s) => s.sourceType === 'goal')}>
                {(suggestion) => (
                  <Button
                    variant="outline"
                    class="h-auto p-3 flex items-center justify-between text-left whitespace-normal"
                    onClick={() => addFromSuggestion(suggestion)}
                  >
                    <div>
                      <div class="font-medium text-foreground">{suggestion.name}</div>
                      <div class="text-xs text-muted-foreground font-normal">
                        {suggestion.description}
                      </div>
                    </div>
                    <div class="text-right ml-2">
                      <div class="text-green-600 dark:text-green-400 font-bold">
                        -{formatCurrency(suggestion.estimatedSavings, currency())}
                      </div>
                      <div class="text-xs text-muted-foreground font-normal">to save</div>
                    </div>
                  </Button>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Tips - at the top for visibility */}
      <Card class="bg-muted/50 border-none">
        <CardContent class="p-4">
          <h4 class="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
            <Lightbulb class="h-4 w-4 text-amber-500" /> Tip
          </h4>
          <p class="text-sm text-muted-foreground">
            {activeType() === 'sell'
              ? 'Selling unused items is a quick way to generate cash. List on marketplaces or ask friends!'
              : activeType() === 'borrow'
                ? 'Borrowing textbooks or equipment can help you save money. Ask your friends or the library!'
                : activeType() === 'lend'
                  ? 'Lending unused items strengthens bonds and can lead to future exchanges.'
                  : 'Bartering is a great way to get what you need without spending. Offer your skills!'}
          </p>
        </CardContent>
      </Card>

      {/* Type Tabs */}
      <div class="flex flex-wrap gap-2">
        <For each={TRADE_TYPES}>
          {(type) => {
            const activeColors: Record<string, string> = {
              sell: 'bg-green-600 hover:bg-green-700 text-white',
              borrow: 'bg-blue-600 hover:bg-blue-700 text-white',
              trade: 'bg-purple-600 hover:bg-purple-700 text-white',
              lend: 'bg-orange-500 hover:bg-orange-600 text-white',
            };
            return (
              <Button
                variant={activeType() === type.id ? 'default' : 'outline'}
                size="sm"
                class={activeType() === type.id ? activeColors[type.id] : 'bg-card'}
                onClick={() => setActiveType(type.id)}
                title={type.description}
              >
                <Dynamic component={type.icon} class="h-4 w-4 mr-2" />
                {type.label}
              </Button>
            );
          }}
        </For>
      </div>

      {/* Trades List */}
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-medium text-foreground flex items-center gap-2">
            <Dynamic component={getTypeIcon(activeType())} class="h-5 w-5" />
            {getTypeInfo(activeType())?.label}
          </h3>
          <Button
            size="sm"
            onClick={() => {
              setNewTrade({ ...newTrade(), type: activeType() as TradeItem['type'] });
              setShowAddForm(true);
            }}
          >
            <Plus class="h-4 w-4 mr-2" /> Add
          </Button>
        </div>

        <For each={trades().filter((t) => t.type === activeType())}>
          {(trade) => (
            <Card>
              <CardContent class="p-4 flex items-center gap-4">
                {/* Icon */}
                <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-primary">
                  <Dynamic component={getTypeIcon(trade.type)} class="h-6 w-6" />
                </div>

                {/* Trade Info */}
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium text-foreground">{trade.name}</h4>
                    <span
                      class={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        getStatusBadge(trade.status).class
                      }`}
                    >
                      {getStatusBadge(trade.status).label}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                    <span>
                      {trade.type === 'borrow' ? 'From' : trade.type === 'lend' ? 'To' : 'With'}{' '}
                      <strong>{trade.partner}</strong>
                    </span>
                    <Show when={trade.dueDate}>
                      <span class="text-muted-foreground/50">•</span>
                      <span>Return: {new Date(trade.dueDate!).toLocaleDateString('en-US')}</span>
                    </Show>
                  </div>
                  <Show when={trade.description}>
                    <p class="text-sm text-muted-foreground/70 mt-1">{trade.description}</p>
                  </Show>
                </div>

                {/* Value */}
                <div class="flex-shrink-0 text-right">
                  <div class="font-bold text-foreground">
                    {formatCurrency(trade.value, currency())}
                  </div>
                </div>

                {/* Actions */}
                <div class="flex-shrink-0 flex items-center gap-2">
                  {/* Cancel button for pending trades */}
                  <Show when={trade.status === 'pending'}>
                    <Button variant="outline" size="sm" onClick={() => cancelSale(trade.id)}>
                      Cancel
                    </Button>
                  </Show>
                  {/* Confirm/Done buttons for non-completed trades */}
                  <Show when={trade.status !== 'completed'}>
                    <Button
                      variant="ghost"
                      size="sm"
                      class={trade.status === 'pending' ? 'text-primary' : 'text-green-600'}
                      onClick={() =>
                        updateStatus(trade.id, trade.status === 'pending' ? 'active' : 'completed')
                      }
                    >
                      <Check class="h-4 w-4 mr-1" />
                      {trade.status === 'pending' ? 'Confirm' : 'Done'}
                    </Button>
                  </Show>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditTrade(trade)}
                    title="Edit"
                  >
                    <Pencil class="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    class="hover:text-destructive"
                    onClick={() => setDeleteConfirm({ id: trade.id, name: trade.name })}
                  >
                    <Trash2 class="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </For>

        {/* Show inventory items as available to sell when on Sell tab */}
        <Show
          when={activeType() === 'sell' && props.inventoryItems && props.inventoryItems.length > 0}
        >
          <div class="text-xs text-muted-foreground mb-2 mt-4 font-medium uppercase tracking-wide">
            Available from inventory
          </div>
          <For
            each={(props.inventoryItems || []).filter(
              (item) => !trades().some((t) => t.inventoryItemId === item.id)
            )}
          >
            {(item) => (
              <Card>
                <CardContent class="p-4 flex items-center gap-4">
                  <div class="flex-shrink-0 w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center text-green-600">
                    <Banknote class="h-6 w-6" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <h4 class="font-medium text-foreground">{item.name}</h4>
                    <div class="text-sm text-muted-foreground">From your inventory</div>
                  </div>
                  <div class="text-right font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(item.estimatedValue, currency())}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    class="text-green-600 border-green-200 hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-900/20"
                    onClick={() => addInventoryItemToSell(item)}
                  >
                    List for sale
                  </Button>
                </CardContent>
              </Card>
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
          <div class="text-center py-12 text-muted-foreground">
            <div class="flex justify-center mb-3">
              <Dynamic component={getTypeIcon(activeType())} class="h-12 w-12 opacity-20" />
            </div>
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

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card class="max-w-md w-full">
            <CardContent class="p-6">
              <div class="flex flex-col gap-4 mb-4">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-semibold text-foreground">
                    {editingTradeId() ? 'Edit Trade' : 'New Trade'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowAddForm(false);
                      resetForm();
                    }}
                  >
                    <X class="h-4 w-4" />
                  </Button>
                </div>

                {/* Type Selection Pills */}
                <div class="flex flex-wrap gap-2">
                  <For each={TRADE_TYPES}>
                    {(type) => (
                      <button
                        class={cn(
                          'px-3 py-1 text-xs font-medium rounded-full border transition-all flex items-center gap-1',
                          newTrade().type === type.id
                            ? `bg-${type.color}-600 text-white border-${type.color}-600`
                            : 'bg-background hover:bg-muted text-muted-foreground border-border'
                        )}
                        onClick={() => {
                          setNewTrade({
                            ...newTrade(),
                            type: type.id as TradeItem['type'],
                            partner: editingTradeId() ? newTrade().partner : '', // Keep partner if editing, else reset
                            // Reset label-dependent fields if needed
                          });
                        }}
                      >
                        <Dynamic component={type.icon} class="h-3 w-3" />
                        {type.label}
                      </button>
                    )}
                  </For>
                </div>
              </div>

              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">What?</label>
                  <Input
                    type="text"
                    placeholder="Ex: Laptop, Math textbook..."
                    value={newTrade().name}
                    onInput={(e: any) =>
                      setNewTrade({ ...newTrade(), name: e.currentTarget.value })
                    }
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">
                    {newTrade().type === 'borrow'
                      ? 'From whom?'
                      : newTrade().type === 'lend'
                        ? 'To whom?'
                        : 'With whom?'}
                  </label>
                  <Input
                    type="text"
                    placeholder="Person's name"
                    value={newTrade().partner}
                    onInput={(e: any) =>
                      setNewTrade({ ...newTrade(), partner: e.currentTarget.value })
                    }
                  />
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Estimated value ({currencySymbol()})
                    </label>
                    <Input
                      type="number"
                      min="0"
                      value={newTrade().value}
                      onInput={(e: any) =>
                        setNewTrade({ ...newTrade(), value: parseInt(e.currentTarget.value) || 0 })
                      }
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Return date
                    </label>
                    <Input
                      type="date"
                      value={newTrade().dueDate}
                      onInput={(e: any) =>
                        setNewTrade({ ...newTrade(), dueDate: e.currentTarget.value })
                      }
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">
                    Notes (optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: Return before vacation"
                    value={newTrade().description}
                    onInput={(e: any) =>
                      setNewTrade({ ...newTrade(), description: e.currentTarget.value })
                    }
                  />
                </div>
              </div>

              <div class="flex gap-3 mt-6">
                <Button
                  variant="outline"
                  class="flex-1"
                  onClick={() => {
                    setShowAddForm(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  class="flex-1"
                  onClick={() => (editingTradeId() ? updateTrade() : addTrade())}
                  disabled={!newTrade().name || !newTrade().partner}
                >
                  {editingTradeId() ? 'Update' : 'Add'}
                </Button>
              </div>
            </CardContent>
          </Card>
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
