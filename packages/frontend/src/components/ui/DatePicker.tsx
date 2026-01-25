/**
 * DatePicker Component
 *
 * A styled wrapper around Ark UI DatePicker with support for single and range modes.
 * Uses the same styling conventions as other UI components.
 */

import { DatePicker as ArkDatePicker, parseDate, type DateValue } from '@ark-ui/solid';
import { Show, Index, createMemo, splitProps } from 'solid-js';
import { Portal } from 'solid-js/web';
import { cn } from '~/lib/cn';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-solid';

export interface DatePickerSingleProps {
  mode?: 'single';
  /** Date value in YYYY-MM-DD format */
  value?: string;
  /** Callback when date changes (receives YYYY-MM-DD string) */
  onChange?: (date: string) => void;
}

export interface DatePickerRangeProps {
  mode: 'range';
  /** Start date in YYYY-MM-DD format */
  startValue?: string;
  /** End date in YYYY-MM-DD format */
  endValue?: string;
  /** Callback when range changes */
  onRangeChange?: (start: string, end: string) => void;
}

export interface DatePickerBaseProps {
  /** Minimum selectable date (YYYY-MM-DD) */
  min?: string;
  /** Maximum selectable date (YYYY-MM-DD) */
  max?: string;
  /** Placeholder text for input */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Show calendar inline (always visible) */
  inline?: boolean;
  /** Additional class for root */
  class?: string;
  /** Label text */
  label?: string;
  /** Whether the input takes full width (default: true) */
  fullWidth?: boolean;
}

export type DatePickerProps = DatePickerBaseProps & (DatePickerSingleProps | DatePickerRangeProps);

/** Convert YYYY-MM-DD string to DateValue */
function stringToDateValue(dateStr: string | undefined): DateValue | undefined {
  if (!dateStr) return undefined;
  try {
    return parseDate(dateStr);
  } catch {
    return undefined;
  }
}

/** Convert DateValue to YYYY-MM-DD string */
function dateValueToString(dv: DateValue | undefined): string {
  if (!dv) return '';
  return `${dv.year}-${String(dv.month).padStart(2, '0')}-${String(dv.day).padStart(2, '0')}`;
}

export function DatePicker(props: DatePickerProps) {
  const [local] = splitProps(props, [
    'mode',
    'class',
    'disabled',
    'inline',
    'placeholder',
    'min',
    'max',
    'label',
    'fullWidth',
  ]);

  const isRange = () => local.mode === 'range';

  // Compute current value as DateValue array
  const currentValue = createMemo<DateValue[]>(() => {
    if (isRange()) {
      const rangeProps = props as DatePickerRangeProps;
      const values: DateValue[] = [];
      const start = stringToDateValue(rangeProps.startValue);
      const end = stringToDateValue(rangeProps.endValue);
      if (start) values.push(start);
      if (end) values.push(end);
      return values;
    } else {
      const singleProps = props as DatePickerSingleProps;
      const val = stringToDateValue(singleProps.value);
      return val ? [val] : [];
    }
  });

  // Handle value change
  const handleValueChange = (details: { value: DateValue[]; valueAsString: string[] }) => {
    if (isRange()) {
      const rangeProps = props as DatePickerRangeProps;
      if (rangeProps.onRangeChange) {
        const [start, end] = details.value;
        rangeProps.onRangeChange(
          start ? dateValueToString(start) : '',
          end ? dateValueToString(end) : ''
        );
      }
    } else {
      const singleProps = props as DatePickerSingleProps;
      if (singleProps.onChange) {
        const [val] = details.value;
        singleProps.onChange(val ? dateValueToString(val) : '');
      }
    }
  };

  // Compute min/max DateValue
  const minValue = createMemo(() => stringToDateValue(local.min));
  const maxValue = createMemo(() => stringToDateValue(local.max));

  return (
    <ArkDatePicker.Root
      selectionMode={isRange() ? 'range' : 'single'}
      value={currentValue()}
      onValueChange={handleValueChange}
      disabled={local.disabled}
      min={minValue()}
      max={maxValue()}
      locale="en-US"
      closeOnSelect={!isRange()}
      positioning={{ placement: 'bottom-start' }}
      class={cn('relative', local.class)}
    >
      <Show when={local.label}>
        <ArkDatePicker.Label class="block text-sm font-medium text-muted-foreground mb-1">
          {local.label}
        </ArkDatePicker.Label>
      </Show>

      <ArkDatePicker.Control class="flex items-center gap-2">
        <div class={cn('relative flex items-center gap-2', local.fullWidth !== false && 'flex-1')}>
          <ArkDatePicker.Input
            index={0}
            placeholder={local.placeholder || (isRange() ? 'Start date' : 'Select date')}
            class={cn(
              'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm',
              'ring-offset-background placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'dark:[color-scheme:dark]'
            )}
          />
          <Show when={isRange()}>
            <span class="text-muted-foreground">→</span>
            <ArkDatePicker.Input
              index={1}
              placeholder="End date"
              class={cn(
                'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm',
                'ring-offset-background placeholder:text-muted-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'dark:[color-scheme:dark]'
              )}
            />
          </Show>
        </div>
        <ArkDatePicker.Trigger
          class={cn(
            'inline-flex items-center justify-center h-10 w-10 rounded-md',
            'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors'
          )}
        >
          <Calendar class="h-4 w-4" />
        </ArkDatePicker.Trigger>
      </ArkDatePicker.Control>

      <Portal>
        <ArkDatePicker.Positioner>
          <ArkDatePicker.Content
            class={cn(
              'z-50 min-w-[280px] rounded-lg border border-border bg-popover p-3 shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
            )}
          >
            <ArkDatePicker.View view="day">
              <ArkDatePicker.Context>
                {(context) => (
                  <>
                    {/* Header with month/year navigation */}
                    <ArkDatePicker.ViewControl class="flex items-center justify-between mb-2">
                      <ArkDatePicker.PrevTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronLeft class="h-4 w-4" />
                      </ArkDatePicker.PrevTrigger>

                      <ArkDatePicker.ViewTrigger
                        class={cn(
                          'text-sm font-semibold px-2 py-1 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ArkDatePicker.RangeText />
                      </ArkDatePicker.ViewTrigger>

                      <ArkDatePicker.NextTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronRight class="h-4 w-4" />
                      </ArkDatePicker.NextTrigger>
                    </ArkDatePicker.ViewControl>

                    {/* Days grid */}
                    <ArkDatePicker.Table class="w-full border-collapse">
                      <ArkDatePicker.TableHead>
                        <ArkDatePicker.TableRow class="flex">
                          <Index each={context().weekDays}>
                            {(weekDay) => (
                              <ArkDatePicker.TableHeader
                                class={cn(
                                  'flex-1 text-center text-xs font-medium text-muted-foreground py-1.5'
                                )}
                              >
                                {weekDay().short}
                              </ArkDatePicker.TableHeader>
                            )}
                          </Index>
                        </ArkDatePicker.TableRow>
                      </ArkDatePicker.TableHead>
                      <ArkDatePicker.TableBody>
                        <Index each={context().weeks}>
                          {(week) => (
                            <ArkDatePicker.TableRow class="flex">
                              <Index each={week()}>
                                {(day) => (
                                  <ArkDatePicker.TableCell value={day()} class="flex-1 p-0.5">
                                    <ArkDatePicker.TableCellTrigger
                                      class={cn(
                                        'inline-flex items-center justify-center w-full h-8 rounded-md text-sm',
                                        'hover:bg-accent hover:text-accent-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        'data-[outside-range]:text-muted-foreground data-[outside-range]:opacity-50',
                                        'data-[disabled]:text-muted-foreground data-[disabled]:opacity-50 data-[disabled]:pointer-events-none',
                                        'data-[in-range]:bg-primary/20',
                                        'data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[selected]:hover:bg-primary/90',
                                        'data-[today]:border data-[today]:border-accent',
                                        'transition-colors'
                                      )}
                                    >
                                      {day().day}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </Index>
                            </ArkDatePicker.TableRow>
                          )}
                        </Index>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>

            {/* Month view */}
            <ArkDatePicker.View view="month">
              <ArkDatePicker.Context>
                {(context) => (
                  <>
                    <ArkDatePicker.ViewControl class="flex items-center justify-between mb-2">
                      <ArkDatePicker.PrevTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronLeft class="h-4 w-4" />
                      </ArkDatePicker.PrevTrigger>

                      <ArkDatePicker.ViewTrigger
                        class={cn(
                          'text-sm font-semibold px-2 py-1 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ArkDatePicker.RangeText />
                      </ArkDatePicker.ViewTrigger>

                      <ArkDatePicker.NextTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronRight class="h-4 w-4" />
                      </ArkDatePicker.NextTrigger>
                    </ArkDatePicker.ViewControl>

                    <ArkDatePicker.Table class="w-full">
                      <ArkDatePicker.TableBody>
                        <Index each={context().getMonthsGrid({ columns: 4, format: 'short' })}>
                          {(months) => (
                            <ArkDatePicker.TableRow class="flex">
                              <Index each={months()}>
                                {(month) => (
                                  <ArkDatePicker.TableCell value={month().value} class="flex-1 p-1">
                                    <ArkDatePicker.TableCellTrigger
                                      class={cn(
                                        'inline-flex items-center justify-center w-full h-10 rounded-md text-sm',
                                        'hover:bg-accent hover:text-accent-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        'data-[selected]:bg-primary data-[selected]:text-primary-foreground',
                                        'transition-colors'
                                      )}
                                    >
                                      {month().label}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </Index>
                            </ArkDatePicker.TableRow>
                          )}
                        </Index>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>

            {/* Year view */}
            <ArkDatePicker.View view="year">
              <ArkDatePicker.Context>
                {(context) => (
                  <>
                    <ArkDatePicker.ViewControl class="flex items-center justify-between mb-2">
                      <ArkDatePicker.PrevTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronLeft class="h-4 w-4" />
                      </ArkDatePicker.PrevTrigger>

                      <ArkDatePicker.ViewTrigger
                        class={cn(
                          'text-sm font-semibold px-2 py-1 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ArkDatePicker.RangeText />
                      </ArkDatePicker.ViewTrigger>

                      <ArkDatePicker.NextTrigger
                        class={cn(
                          'inline-flex items-center justify-center h-8 w-8 rounded-md',
                          'hover:bg-accent hover:text-accent-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'transition-colors'
                        )}
                      >
                        <ChevronRight class="h-4 w-4" />
                      </ArkDatePicker.NextTrigger>
                    </ArkDatePicker.ViewControl>

                    <ArkDatePicker.Table class="w-full">
                      <ArkDatePicker.TableBody>
                        <Index each={context().getYearsGrid({ columns: 4 })}>
                          {(years) => (
                            <ArkDatePicker.TableRow class="flex">
                              <Index each={years()}>
                                {(year) => (
                                  <ArkDatePicker.TableCell value={year().value} class="flex-1 p-1">
                                    <ArkDatePicker.TableCellTrigger
                                      class={cn(
                                        'inline-flex items-center justify-center w-full h-10 rounded-md text-sm',
                                        'hover:bg-accent hover:text-accent-foreground',
                                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                        'data-[selected]:bg-primary data-[selected]:text-primary-foreground',
                                        'transition-colors'
                                      )}
                                    >
                                      {year().label}
                                    </ArkDatePicker.TableCellTrigger>
                                  </ArkDatePicker.TableCell>
                                )}
                              </Index>
                            </ArkDatePicker.TableRow>
                          )}
                        </Index>
                      </ArkDatePicker.TableBody>
                    </ArkDatePicker.Table>
                  </>
                )}
              </ArkDatePicker.Context>
            </ArkDatePicker.View>
          </ArkDatePicker.Content>
        </ArkDatePicker.Positioner>
      </Portal>
    </ArkDatePicker.Root>
  );
}
