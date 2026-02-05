/**
 * Trade Tab Component
 *
 * Borrowing and trading: track loans and exchanges with friends.
 * Uses createCrudTab hook for common CRUD state management.
 */

import { createSignal, createEffect, For, Show, untrack } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useProfile } from '~/lib/profileContext';
import { createCrudTab } from '~/hooks/createCrudTab';
import { createDirtyState } from '~/hooks/createDirtyState';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import { Handshake } from 'lucide-solid';
import { Input } from '~/components/ui/Input';
import {
  Banknote,
  Download,
  Repeat,
  Upload,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Undo2,
  Heart,
} from 'lucide-solid';
import { Skeleton } from '~/components/ui/Skeleton';
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
  createdAt?: string; // For earnings date attribution
  updatedAt?: string; // For earnings date attribution (set when status changes)
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
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
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

function TradeSkeleton() {
  return (
    <div class="space-y-6">
      {/* Summary Cards Skeleton */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <For each={Array(3).fill(0)}>
          {() => (
            <Card>
              <CardContent class="p-6 space-y-4">
                <Skeleton class="h-4 w-24" />
                <Skeleton class="h-8 w-32" />
                <Skeleton class="h-3 w-40" />
              </CardContent>
            </Card>
          )}
        </For>
      </div>

      {/* Tabs Skeleton */}
      <div class="flex gap-2">
        <Skeleton class="h-9 w-20 rounded-full" />
        <Skeleton class="h-9 w-20 rounded-full" />
        <Skeleton class="h-9 w-20 rounded-full" />
        <Skeleton class="h-9 w-20 rounded-full" />
      </div>

      {/* List Skeleton */}
      <div class="space-y-3">
        <For each={Array(3).fill(0)}>
          {() => (
            <Card>
              <CardContent class="p-4 flex items-center gap-4">
                <Skeleton class="h-10 w-10 rounded-full" />
                <div class="flex-1 space-y-2">
                  <Skeleton class="h-5 w-48" />
                  <Skeleton class="h-3 w-32" />
                </div>
                <Skeleton class="h-6 w-20" />
              </CardContent>
            </Card>
          )}
        </For>
      </div>
    </div>
  );
}

export function TradeTab(props: TradeTabProps) {
  const { profile } = useProfile();

  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  // Use createCrudTab hook for common CRUD state management
  /* eslint-disable solid/reactivity */
  const crud = createCrudTab<TradeItem>({
    getItemId: (trade) => trade.id,
    getItemName: (trade) => trade.name,
    onItemsChange: props.onTradesChange,
  });
  /* eslint-enable solid/reactivity */

  // Destructure for convenience (aliased to match original names for minimal changes)
  const {
    items: trades,
    setItems: setTrades,
    showAddForm,
    setShowAddForm,
    deleteConfirm,
    editingId: editingTradeId,
    isLoading,
  } = crud;

  // Initialize with initial trades
  if (props.initialTrades && props.initialTrades.length > 0 && trades().length === 0) {
    setTrades(props.initialTrades);
  }

  const [activeType, setActiveType] = createSignal<string>('sell');
  const [newTrade, setNewTrade] = createSignal<Partial<TradeItem>>({
    type: 'sell',
    name: '',
    partner: '',
    value: undefined, // Empty by default for easier input
    status: 'pending',
  });

  // Dirty state tracking for unsaved changes dialog
  const {
    isDirty,
    setOriginal: setDirtyOriginal,
    clear: clearDirty,
  } = createDirtyState({
    getCurrentValues: () => newTrade(),
  });

  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Notify parent when dirty state changes
  createEffect(() => {
    props.onDirtyChange?.(isDirty());
  });

  // Sync local trades with props.initialTrades when they change (e.g., after DB refresh)
  // This handles the case where bulkCreateTrades generates new IDs
  createEffect(() => {
    const initialTrades = props.initialTrades || [];
    // Use untrack to read local trades without creating a circular dependency
    const localTrades = untrack(() => trades());

    // Only sync if there are trades from props and they differ from local state
    // We compare by checking if the IDs have changed (indicating a DB refresh)
    const currentIds = new Set(localTrades.map((t) => t.id));
    const propsIds = new Set(initialTrades.map((t) => t.id));

    // If the IDs are completely different, sync from props
    const hasOverlap = [...currentIds].some((id) => propsIds.has(id));
    if (initialTrades.length > 0 && !hasOverlap && currentIds.size > 0) {
      // IDs don't match - this means DB refreshed with new IDs
      // Map the status from local trades to the new trades by matching on name+partner+type
      const updatedTrades = initialTrades.map((propTrade) => {
        // Find matching local trade by name, partner, and type
        const matchingLocal = localTrades.find(
          (t) =>
            t.name === propTrade.name &&
            t.partner === propTrade.partner &&
            t.type === propTrade.type
        );
        // If we found a match and it has a different status, use the local status
        if (matchingLocal && matchingLocal.status !== propTrade.status) {
          return { ...propTrade, status: matchingLocal.status };
        }
        return propTrade;
      });
      setTrades(updatedTrades);
    } else if (initialTrades.length > 0 && localTrades.length === 0) {
      // Initial load - just set from props
      setTrades(initialTrades);
    }
  });

  // Auto-convert inventory items to pending sell trades
  // Items declared during onboarding should appear directly as pending sells
  createEffect(() => {
    const inventoryItems = props.inventoryItems || [];
    const currentTrades = untrack(() => trades());

    // Find inventory items not yet in trades
    // Check by inventoryItemId OR by name (to avoid duplicates when user manually adds)
    const newItems = inventoryItems.filter(
      (item) =>
        !currentTrades.some(
          (t) =>
            t.inventoryItemId === item.id ||
            (t.type === 'sell' && t.name.toLowerCase() === item.name.toLowerCase())
        )
    );

    if (newItems.length > 0) {
      const now = new Date().toISOString();
      const newTrades: TradeItem[] = newItems.map((item) => ({
        id: `trade_inv_${item.id}`,
        type: 'sell' as const,
        name: item.name,
        description: item.category ? `${item.category}` : undefined,
        partner: 'Marketplace',
        value: item.estimatedValue,
        status: 'pending' as const,
        inventoryItemId: item.id,
        createdAt: now,
        updatedAt: now,
      }));

      const updated = [...currentTrades, ...newTrades];
      setTrades(updated);
      props.onTradesChange?.(updated);
    }
  });

  const addTrade = () => {
    const trade = newTrade();
    if (!trade.name) return;

    const now = new Date().toISOString();
    const newTradeComplete: TradeItem = {
      id: `trade_${Date.now()}`,
      type: (trade.type as TradeItem['type']) || 'borrow',
      name: trade.name,
      description: trade.description,
      partner:
        trade.partner ||
        (trade.type === 'borrow' ? 'Someone' : trade.type === 'lend' ? 'Someone' : 'Marketplace'),
      value: trade.value || 0,
      status: (trade.status as TradeItem['status']) || 'pending',
      dueDate: trade.dueDate,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...trades(), newTradeComplete];
    setTrades(updated);
    props.onTradesChange?.(updated);
    setShowAddForm(false);
    setNewTrade({
      type: activeType() as TradeItem['type'],
      name: '',
      partner: '',
      value: undefined,
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

    // Set updatedAt when status changes - critical for earnings date attribution
    const now = new Date().toISOString();
    const updated = trades().map((t) => (t.id === id ? { ...t, status, updatedAt: now } : t));
    setTrades(updated);
    props.onTradesChange?.(updated);
  };

  // Request delete confirmation (shows dialog)
  const requestDeleteTrade = (trade: TradeItem) => {
    crud.confirmDelete(trade);
  };

  // Actually delete the trade (called from confirmation dialog)
  const confirmDeleteTrade = (id: string) => {
    const updated = trades().filter((t) => t.id !== id);
    setTrades(updated);
    props.onTradesChange?.(updated);
    crud.cancelDelete(); // Close the dialog
  };

  const resetForm = () => {
    setNewTrade({
      type: activeType() as TradeItem['type'],
      name: '',
      partner: '',
      value: undefined,
      status: 'pending',
    });
    crud.resetForm();
    clearDirty(); // Clear dirty state when form closes
  };

  // Handle cancel - shows confirmation dialog if there are unsaved changes
  const handleCancel = () => {
    if (isDirty()) {
      setShowUnsavedDialog(true);
    } else {
      resetForm();
      crud.closeAddForm();
    }
  };

  // Discard changes and close form (called from unsaved changes dialog)
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    resetForm();
    crud.closeAddForm();
  };

  // Open add form with dirty state tracking
  const openAddForm = () => {
    setNewTrade({ ...newTrade(), type: activeType() as TradeItem['type'] });
    setShowAddForm(true);
    setDirtyOriginal(); // Capture initial state
  };

  const handleEditTrade = (trade: TradeItem) => {
    setNewTrade({
      type: trade.type,
      name: trade.name,
      description: trade.description,
      partner: trade.partner,
      value: trade.value,
      dueDate: trade.dueDate,
      status: trade.status,
    });
    crud.startEdit(trade.id);
    setDirtyOriginal(); // Capture loaded values as original
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

  // Feature N: Borrowed value calculations with pending
  // Bug C Fix: Include completed borrows as they represent savings achieved
  const borrowedValue = () =>
    trades()
      .filter((t) => t.type === 'borrow' && (t.status === 'active' || t.status === 'completed'))
      .reduce((sum, t) => sum + t.value, 0);

  // Feature N: Pending borrows (items the user is planning to borrow)
  const pendingBorrowValue = () =>
    trades()
      .filter((t) => t.type === 'borrow' && t.status === 'pending')
      .reduce((sum, t) => sum + t.value, 0);

  // Feature N: Total potential savings from borrowing (active + pending)
  const totalBorrowPotential = () => borrowedValue() + pendingBorrowValue();

  // Feature I: Karma score for lend/trade actions (circular economy contribution)
  const karmaScore = () =>
    trades().filter((t) => (t.type === 'lend' || t.type === 'trade') && t.status !== 'pending')
      .length;

  // Total from completed sales
  const soldValue = () =>
    trades()
      .filter((t) => t.type === 'sell' && t.status === 'completed')
      .reduce((sum, t) => sum + t.value, 0);

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

  // Count pending/active items by type for reminder messages
  const pendingCountByType = (type: string) =>
    trades().filter((t) => t.type === type && (t.status === 'pending' || t.status === 'active'))
      .length;

  // Reminder messages for each type when there are pending items
  const getReminderMessage = (type: string): string | null => {
    const count = pendingCountByType(type);
    if (count === 0) return null;

    switch (type) {
      case 'sell':
        return `💡 You have ${count} item${count > 1 ? 's' : ''} waiting to be sold. When you sell one, mark it as "Done" to count toward your earnings!`;
      case 'borrow':
        return `💡 You have ${count} item${count > 1 ? 's' : ''} to borrow. Once you actually get ${count > 1 ? 'them' : 'it'}, mark as "Done" to count the savings!`;
      case 'trade':
        return `💡 You have ${count} trade${count > 1 ? 's' : ''} in progress. Mark as "Done" when the exchange is complete!`;
      case 'lend':
        return `💡 You have ${count} item${count > 1 ? 's' : ''} being lent. Mark as "Done" when returned to track your karma!`;
      default:
        return null;
    }
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
      {/* Header */}
      <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
        <Handshake class="h-6 w-6 text-primary" /> Trade & Sell
      </h2>

      {/* Bruno Hint */}
      <BrunoHintV2
        tabType="trade"
        profileId={profile()?.id}
        contextData={{
          inventory: (props.inventoryItems || []).map((i) => ({
            name: i.name,
            estimatedValue: i.estimatedValue,
          })),
          trades: trades().map((t) => ({
            type: t.type,
            name: t.name,
            value: t.value,
            status: t.status,
          })),
        }}
        fallbackMessage="Sell unused items or borrow from friends to boost your savings!"
        compact
      />

      <Show when={!isLoading()} fallback={<TradeSkeleton />}>
        {/* Summary Cards */}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sales */}
          <Card class="border-emerald-200/50 dark:border-emerald-800/50 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/30 dark:to-emerald-900/10 shadow-sm transition-all hover:shadow-md">
            <CardContent class="p-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  From Sales
                </span>
                <div class="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                  <Banknote class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
              <div class="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                {formatCurrency(soldValue(), currency())}
              </div>
              <div class="flex items-center gap-2 mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80 font-medium">
                <span>
                  {trades().filter((t) => t.type === 'sell' && t.status === 'completed').length}{' '}
                  sold
                </span>
                <Show when={potentialSaleValue() > 0}>
                  <span class="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border border-amber-200/50">
                    +{formatCurrency(potentialSaleValue(), currency(), { showSign: false })}{' '}
                    potential
                  </span>
                </Show>
              </div>
            </CardContent>
          </Card>

          {/* Borrowed */}
          <Card class="border-blue-200/50 dark:border-blue-800/50 bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/10 shadow-sm transition-all hover:shadow-md">
            <CardContent class="p-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-blue-600 dark:text-blue-400">
                  Borrowed Value
                </span>
                <div class="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <Download class="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">
                {formatCurrency(borrowedValue(), currency())}
              </div>
              <div class="mt-1 text-xs text-blue-600/80 dark:text-blue-400/80 font-medium flex items-center gap-2">
                <span>
                  {trades().filter((t) => t.type === 'borrow' && t.status === 'active').length}{' '}
                  active
                </span>
                <Show when={totalBorrowPotential() > borrowedValue()}>
                  <span class="px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50">
                    Saves {formatCurrency(totalBorrowPotential(), currency(), { showSign: false })}
                  </span>
                </Show>
              </div>
            </CardContent>
          </Card>

          {/* Karma */}
          <Card class="border-purple-200/50 dark:border-purple-800/50 bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/10 shadow-sm transition-all hover:shadow-md">
            <CardContent class="p-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-purple-600 dark:text-purple-400">
                  Karma Score
                </span>
                <div class="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                  <Heart class="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div class="text-2xl font-bold text-purple-900 dark:text-purple-100">
                {karmaScore()}
              </div>
              <div class="mt-1 text-xs text-purple-600/80 dark:text-purple-400/80 font-medium">
                Community contributions
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Type Tabs (Pill Design) */}
        <div class="flex flex-wrap gap-2 p-1 bg-muted/20 border border-border/50 rounded-2xl w-fit">
          <For each={TRADE_TYPES}>
            {(type) => {
              const activeClass =
                {
                  sell: 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-600',
                  borrow: 'bg-blue-500 text-white shadow-md shadow-blue-500/20 hover:bg-blue-600',
                  trade:
                    'bg-purple-500 text-white shadow-md shadow-purple-500/20 hover:bg-purple-600',
                  lend: 'bg-orange-500 text-white shadow-md shadow-orange-500/20 hover:bg-orange-600',
                }[type.id] || 'bg-primary text-primary-foreground';

              return (
                <Button
                  variant="ghost"
                  size="sm"
                  class={cn(
                    'rounded-xl px-4 h-9 transition-all duration-300 font-medium border border-transparent',
                    activeType() === type.id
                      ? activeClass
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                  onClick={() => setActiveType(type.id)}
                  title={type.description}
                >
                  <div
                    class={cn(
                      'mr-2 h-5 w-5 rounded-full flex items-center justify-center transition-colors',
                      activeType() === type.id ? 'bg-white/20' : 'bg-transparent'
                    )}
                  >
                    <Dynamic component={type.icon} class="h-3.5 w-3.5" />
                  </div>
                  {type.label}
                </Button>
              );
            }}
          </For>
        </div>

        {/* Pending Items Reminder */}
        <Show when={getReminderMessage(activeType())}>
          <div class="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-200 text-sm">
            {getReminderMessage(activeType())}
          </div>
        </Show>

        {/* Trades List */}
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <h3 class="font-medium text-foreground flex items-center gap-2">
              <Dynamic component={getTypeIcon(activeType())} class="h-5 w-5" />
              {getTypeInfo(activeType())?.label} Items
            </h3>
            <Button
              size="sm"
              onClick={openAddForm}
              class="rounded-md shadow-sm hover:shadow-md transition-all"
            >
              <Plus class="h-4 w-4 mr-2" /> Add {getTypeInfo(activeType())?.label}
            </Button>
          </div>

          <For each={trades().filter((t) => t.type === activeType())}>
            {(trade) => (
              <Card class="group hover:shadow-md transition-all duration-300 border-transparent hover:border-border/50 bg-card/60 hover:bg-card">
                <CardContent class="p-4 flex items-center gap-4">
                  {/* Icon */}
                  <div
                    class={cn(
                      'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110',
                      {
                        sell: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
                        borrow: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
                        trade:
                          'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
                        lend: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400',
                      }[trade.type]
                    )}
                  >
                    <Dynamic component={getTypeIcon(trade.type)} class="h-6 w-6" />
                  </div>

                  {/* Trade Info */}
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <h4 class="font-bold text-foreground truncate text-base">{trade.name}</h4>
                      <span
                        class={cn(
                          'px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-full border border-transparent bg-opacity-50',
                          getStatusBadge(trade.status).class
                        )}
                      >
                        {getStatusBadge(trade.status).label}
                      </span>
                    </div>
                    {/* Simplified Metadata: Description only, Partner if exists */}
                    <div class="flex items-center gap-3 text-sm text-muted-foreground">
                      <Show
                        when={
                          trade.partner &&
                          trade.partner !== 'Unknown' &&
                          trade.partner !== 'Marketplace'
                        }
                      >
                        <span class="flex items-center gap-1 opacity-80">
                          <span class="text-xs">
                            {trade.type === 'borrow'
                              ? 'From'
                              : trade.type === 'lend'
                                ? 'To'
                                : 'With'}
                          </span>
                          <span class="font-medium text-foreground/80">{trade.partner}</span>
                        </span>
                      </Show>
                      <Show
                        when={
                          trade.description &&
                          (!trade.partner ||
                            trade.partner === 'Unknown' ||
                            trade.partner === 'Marketplace')
                        }
                      >
                        <p class="text-xs text-muted-foreground/60 truncate max-w-[200px]">
                          {trade.description}
                        </p>
                      </Show>
                    </div>
                  </div>

                  {/* Value/Karma & Actions */}
                  <div class="flex items-center gap-4">
                    <div class="text-right min-w-[60px]">
                      {/* Sell: just money */}
                      <Show when={trade.type === 'sell'}>
                        <div class="font-bold text-lg">
                          {formatCurrency(trade.value, currency())}
                        </div>
                      </Show>
                      {/* Borrow: money saved + karma */}
                      <Show when={trade.type === 'borrow'}>
                        <div class="font-bold text-lg text-green-600 dark:text-green-400">
                          {formatCurrency(trade.value, currency())}
                        </div>
                        <div class="text-xs text-purple-600 dark:text-purple-400">+20 karma</div>
                      </Show>
                      {/* Lend/Trade: just karma */}
                      <Show when={trade.type === 'lend' || trade.type === 'trade'}>
                        <div class="font-bold text-lg text-purple-600 dark:text-purple-400">
                          +{trade.type === 'lend' ? '50' : '30'} karma
                        </div>
                      </Show>
                    </div>

                    {/* Hover Actions */}
                    <div class="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-200 focus-within:opacity-100">
                      <Show when={trade.status === 'active'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/20"
                          onClick={() => updateStatus(trade.id, 'pending')}
                          title="Revert to pending"
                        >
                          <Undo2 class="h-4 w-4" />
                        </Button>
                      </Show>

                      <Show when={trade.status !== 'completed'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          class={cn(
                            'h-8 w-8',
                            trade.status === 'pending'
                              ? 'text-primary hover:text-primary'
                              : 'text-green-600 hover:text-green-700'
                          )}
                          onClick={() =>
                            updateStatus(
                              trade.id,
                              trade.status === 'pending' ? 'active' : 'completed'
                            )
                          }
                          title={trade.status === 'pending' ? 'Mark as active' : 'Mark as done'}
                        >
                          <Check class="h-4 w-4" />
                        </Button>
                      </Show>

                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 text-muted-foreground hover:text-primary"
                        onClick={() => handleEditTrade(trade)}
                        title="Edit"
                      >
                        <Pencil class="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        class="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => requestDeleteTrade(trade)}
                        title="Delete"
                      >
                        <Trash2 class="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>

          {/* Empty state - for sell tab, only show if no trades AND no inventory items */}
          <Show
            when={
              trades().filter((t) => t.type === activeType()).length === 0 &&
              (activeType() !== 'sell' ||
                (props.inventoryItems || []).filter(
                  (item) => !trades().some((t) => t.inventoryItemId === item.id)
                ).length === 0)
            }
          >
            <div class="text-center py-12">
              <div
                class={cn(
                  'h-16 w-16 rounded-full mx-auto flex items-center justify-center mb-4 bg-muted/30 text-muted-foreground',
                  {
                    sell: 'bg-emerald-500/10 text-emerald-500',
                    borrow: 'bg-blue-500/10 text-blue-500',
                    trade: 'bg-purple-500/10 text-purple-500',
                    lend: 'bg-orange-500/10 text-orange-500',
                  }[activeType()] || 'bg-muted'
                )}
              >
                <Dynamic component={getTypeIcon(activeType())} class="h-8 w-8 opacity-50" />
              </div>
              <h3 class="text-lg font-medium text-foreground">No {activeType()} items yet</h3>
              <Button variant="outline" class="mt-4" onClick={openAddForm}>
                <Plus class="h-4 w-4 mr-2" /> Add first item
              </Button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Add/Edit Form Modal */}
      <Show when={showAddForm()}>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card class="max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
            <CardContent class="p-6">
              <div class="flex flex-col gap-4 mb-6">
                <div class="flex items-center justify-between">
                  <h3 class="text-lg font-bold text-foreground">
                    {editingTradeId() ? 'Edit Trade' : 'New Trade'}
                  </h3>
                  <Button variant="ghost" size="icon" onClick={handleCancel}>
                    <X class="h-4 w-4" />
                  </Button>
                </div>

                {/* Type Selection Pills */}
                <div class="flex flex-wrap gap-2">
                  <For each={TRADE_TYPES}>
                    {(type) => {
                      // Explicit class mapping (Tailwind can't compile dynamic classes)
                      const activeClasses: Record<string, string> = {
                        sell: 'bg-emerald-600 text-white border-emerald-600 shadow-sm',
                        borrow: 'bg-blue-600 text-white border-blue-600 shadow-sm',
                        trade: 'bg-purple-600 text-white border-purple-600 shadow-sm',
                        lend: 'bg-orange-600 text-white border-orange-600 shadow-sm',
                      };
                      return (
                        <button
                          class={cn(
                            'px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border transition-all flex items-center gap-1',
                            newTrade().type === type.id
                              ? activeClasses[type.id]
                              : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          )}
                          onClick={() => {
                            setNewTrade({
                              ...newTrade(),
                              type: type.id as TradeItem['type'],
                            });
                          }}
                        >
                          <Dynamic component={type.icon} class="h-3 w-3" />
                          {type.label}
                        </button>
                      );
                    }}
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
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewTrade({ ...newTrade(), name: e.currentTarget.value })
                    }
                    class="font-medium"
                    autofocus
                  />
                </div>

                {/* Removed "With Whom" and "Date" inputs as per request */}

                {/* Value field only for sell/borrow - trade/lend don't generate money */}
                <Show when={newTrade().type === 'sell' || newTrade().type === 'borrow'}>
                  <div>
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      {newTrade().type === 'sell' ? 'Sale price' : 'Value saved'} (
                      {currencySymbol()})
                    </label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newTrade().value ?? ''}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) => {
                        const val = e.currentTarget.value;
                        setNewTrade({
                          ...newTrade(),
                          value: val === '' ? undefined : parseInt(val) || 0,
                        });
                      }}
                    />
                  </div>
                </Show>

                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">
                    Notes (optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="Details..."
                    value={newTrade().description}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewTrade({ ...newTrade(), description: e.currentTarget.value })
                    }
                  />
                </div>
              </div>

              <div class="flex gap-3 mt-8">
                <Button variant="outline" class="flex-1" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={() => (editingTradeId() ? updateTrade() : addTrade())}
                  disabled={!newTrade().name}
                  class="flex-1"
                >
                  {editingTradeId() ? 'Update' : 'Add Item'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
            confirmDeleteTrade(confirm.id);
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
