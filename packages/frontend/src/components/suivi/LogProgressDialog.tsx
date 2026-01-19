import { createSignal, Show, createEffect } from 'solid-js';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Clock, ArrowRight } from 'lucide-solid';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';

interface LogProgressDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (hours: number, earnings: number) => void;
  title?: string;
  currentHours: number;
  currentEarnings: number;
  targetHours?: number;
  targetEarnings?: number;
  currency?: Currency;
}

export function LogProgressDialog(props: LogProgressDialogProps) {
  const currencySymbol = () => getCurrencySymbol(props.currency);

  const [addedHours, setAddedHours] = createSignal('');
  const [totalHours, setTotalHours] = createSignal('');
  const [addedEarnings, setAddedEarnings] = createSignal('');
  const [totalEarnings, setTotalEarnings] = createSignal('');

  // Reset form when opened
  createEffect(() => {
    if (props.isOpen) {
      setAddedHours(''); // Default empty for "Add"
      setTotalHours((props.currentHours || 0).toString());
      setAddedEarnings('');
      setTotalEarnings((props.currentEarnings || 0).toString());
    }
  });

  const safeParseFloat = (val: string) => parseFloat(val.replace(',', '.')) || 0;

  const updateHoursFromAdd = (val: string) => {
    setAddedHours(val);
    const added = safeParseFloat(val);
    const total = (props.currentHours || 0) + added;
    setTotalHours(Number.isInteger(total) ? total.toString() : total.toFixed(1)); // Clean format
  };

  const updateHoursFromTotal = (val: string) => {
    setTotalHours(val);
    const total = safeParseFloat(val);
    const delta = total - (props.currentHours || 0);
    setAddedHours(Number.isInteger(delta) ? delta.toString() : delta.toFixed(1));
  };

  const updateEarningsFromAdd = (val: string) => {
    setAddedEarnings(val);
    const added = safeParseFloat(val);
    const total = (props.currentEarnings || 0) + added;
    setTotalEarnings(Number.isInteger(total) ? total.toString() : total.toFixed(2));
  };

  const updateEarningsFromTotal = (val: string) => {
    setTotalEarnings(val);
    const total = safeParseFloat(val);
    const delta = total - (props.currentEarnings || 0);
    setAddedEarnings(Number.isInteger(delta) ? delta.toString() : delta.toFixed(2));
  };

  const handleSave = () => {
    const h = safeParseFloat(addedHours());
    const e = safeParseFloat(addedEarnings());
    props.onSave(h, e);
    props.onClose();
  };

  const isFirstEntry = () => (props.currentHours || 0) === 0 && (props.currentEarnings || 0) === 0;

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div class="bg-card dark:bg-card border border-border rounded-lg p-6 max-w-md w-full shadow-xl">
          <h3 class="text-lg font-semibold text-foreground mb-4">
            {props.title || 'Log Progress'}
          </h3>

          <Show
            when={!isFirstEntry()}
            fallback={
              /* Simple Mode for First Entry */
              <div class="space-y-4">
                <div class="space-y-2">
                  <label class="text-sm font-medium leading-none">
                    Hours completed {props.targetHours ? `(Target: ${props.targetHours}h)` : ''}
                  </label>
                  <div class="relative">
                    <Clock class="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="0.0"
                      class="pl-9"
                      value={addedHours()}
                      onInput={(e) => updateHoursFromAdd(e.currentTarget.value)}
                      autofocus
                    />
                  </div>
                </div>
                <div class="space-y-2">
                  <label class="text-sm font-medium leading-none">
                    Earnings collected{' '}
                    {props.targetEarnings
                      ? `(Target: ${formatCurrency(props.targetEarnings, props.currency)})`
                      : ''}
                  </label>
                  <div class="relative">
                    <span class="absolute left-3 top-2.5 text-sm text-muted-foreground">
                      {currencySymbol()}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      class="pl-9"
                      value={addedEarnings()}
                      onInput={(e) => updateEarningsFromAdd(e.currentTarget.value)}
                    />
                  </div>
                </div>
              </div>
            }
          >
            {/* Advanced Mode for Updates */}
            <div class="space-y-6">
              <div class="grid grid-cols-[1fr_auto_1fr] gap-4 items-end mb-2 text-sm text-muted-foreground font-medium text-center">
                <div>Added</div>
                <div class="pb-2" />
                <div>New Total</div>
              </div>

              {/* Hours Row */}
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock class="h-3 w-3" /> Current: {props.currentHours}
                  {props.targetHours ? ` / ${props.targetHours}` : ''}h
                </label>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Input
                      type="number"
                      step="0.5"
                      placeholder="+0"
                      class="text-center bg-primary/5 border-primary/20"
                      value={addedHours()}
                      onInput={(e) => updateHoursFromAdd(e.currentTarget.value)}
                    />
                  </div>
                  <ArrowRight class="h-4 w-4 text-muted-foreground" />
                  <div class="relative flex-1">
                    <Input
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Total"
                      class="text-center font-bold"
                      value={totalHours()}
                      onInput={(e) => updateHoursFromTotal(e.currentTarget.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Earnings Row */}
              <div class="space-y-1">
                <label class="text-xs text-muted-foreground flex items-center gap-1">
                  <span class="text-xs">{currencySymbol()}</span> Current:{' '}
                  {formatCurrency(props.currentEarnings, props.currency)}
                  {props.targetEarnings
                    ? ` / ${formatCurrency(props.targetEarnings, props.currency)}`
                    : ''}
                </label>
                <div class="flex items-center gap-2">
                  <div class="relative flex-1">
                    <Input
                      type="number"
                      step="1"
                      placeholder="+0"
                      class="text-center bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800"
                      value={addedEarnings()}
                      onInput={(e) => updateEarningsFromAdd(e.currentTarget.value)}
                    />
                  </div>
                  <ArrowRight class="h-4 w-4 text-muted-foreground" />
                  <div class="relative flex-1">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="Total"
                      class="text-center font-bold"
                      value={totalEarnings()}
                      onInput={(e) => updateEarningsFromTotal(e.currentTarget.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Show>

          <div class="mt-6 flex gap-3 justify-end">
            <Button variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Log</Button>
          </div>
        </div>
      </div>
    </Show>
  );
}
