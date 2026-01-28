/**
 * Savings Adjust Modal Component
 *
 * Allows users to adjust the monthly savings amount for a specific week.
 * Used when actual savings differ from the projected amount.
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { PiggyBank, AlertCircle, X } from 'lucide-solid';

interface SavingsAdjustModalProps {
  isOpen: boolean;
  weekNumber: number;
  expectedAmount: number;
  currentAmount?: number;
  currency?: Currency;
  onSave: (amount: number, note?: string) => void;
  onClose: () => void;
}

export function SavingsAdjustModal(props: SavingsAdjustModalProps) {
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const [actualAmount, setActualAmount] = createSignal<number>(0);
  const [note, setNote] = createSignal<string>('');

  // Reset state when modal opens or amounts change
  createEffect(() => {
    // Track these reactive props
    const current = props.currentAmount;
    const expected = props.expectedAmount;
    const isOpen = props.isOpen;

    if (isOpen) {
      setActualAmount(current ?? expected);
      setNote('');
    }
  });

  const handleSave = () => {
    props.onSave(actualAmount(), note() || undefined);
  };

  const difference = () => actualAmount() - props.expectedAmount;
  const isReduced = () => difference() < 0;

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div class="bg-card dark:bg-card border border-border rounded-lg max-w-md w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div class="flex items-center justify-between p-4 border-b border-border">
              <div class="flex items-center gap-2">
                <PiggyBank class="h-5 w-5 text-green-600" />
                <h3 class="text-lg font-semibold text-foreground">
                  Adjust Savings - Week {props.weekNumber}
                </h3>
              </div>
              <button
                type="button"
                class="p-1 rounded-lg hover:bg-muted transition-colors"
                onClick={() => props.onClose()}
              >
                <X class="h-5 w-5 text-muted-foreground" />
              </button>
            </div>

            {/* Content */}
            <div class="p-4 space-y-4">
              {/* Expected vs Actual */}
              <div class="p-3 bg-muted/50 rounded-lg">
                <div class="text-sm text-muted-foreground mb-1">Expected savings</div>
                <div class="text-lg font-semibold text-foreground">
                  {formatCurrency(props.expectedAmount, currency())}
                </div>
              </div>

              {/* Input for actual amount */}
              <div>
                <label class="text-sm font-medium text-foreground block mb-2">
                  Actual savings this month
                </label>
                <div class="relative">
                  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {currencySymbol()}
                  </span>
                  <Input
                    type="number"
                    class="pl-8"
                    value={actualAmount()}
                    onInput={(e) => setActualAmount(Number(e.currentTarget.value) || 0)}
                    min={0}
                    step={10}
                  />
                </div>
              </div>

              {/* Difference indicator */}
              <Show when={difference() !== 0}>
                <div
                  class={`flex items-center gap-2 p-2 rounded-lg ${
                    isReduced()
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                      : 'bg-green-500/10 text-green-700 dark:text-green-300'
                  }`}
                >
                  <AlertCircle class="h-4 w-4" />
                  <span class="text-sm">
                    {isReduced() ? 'Saved ' : 'Saved '}
                    <strong>
                      {formatCurrency(Math.abs(difference()), currency())}
                      {isReduced() ? ' less' : ' more'}
                    </strong>{' '}
                    than expected
                  </span>
                </div>
              </Show>

              {/* Optional note */}
              <div>
                <label class="text-sm font-medium text-foreground block mb-2">
                  Note (optional)
                </label>
                <Input
                  type="text"
                  placeholder="e.g., Had an unexpected expense"
                  value={note()}
                  onInput={(e) => setNote(e.currentTarget.value)}
                />
              </div>

              {/* Actions */}
              <div class="flex gap-3 pt-2">
                <Button variant="outline" class="flex-1" onClick={props.onClose}>
                  Cancel
                </Button>
                <Button class="flex-1" onClick={handleSave}>
                  Save Adjustment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export default SavingsAdjustModal;
