import { For, Show } from 'solid-js';
import { cn } from '~/lib/cn';

interface MonthPickerProps {
  max: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function MonthPicker(props: MonthPickerProps) {
  // Generate array of numbers from 0 to max
  const months = () => Array.from({ length: props.max + 1 }, (_, i) => i);

  return (
    <div class="w-full">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Pause Duration
        </span>
        <span class="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
          {props.value} month{props.value !== 1 ? 's' : ''}
        </span>
      </div>
      <div
        class="flex gap-1 overflow-x-auto pb-2 scrollbar-hide snap-x"
        style={{ '-webkit-overflow-scrolling': 'touch' }}
      >
        <For each={months()}>
          {(month) => (
            <button
              onClick={() => !props.disabled && props.onChange(month)}
              disabled={props.disabled}
              class={cn(
                'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all snap-center',
                'border border-transparent focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary',
                props.value === month
                  ? 'bg-amber-500 text-white shadow-md scale-100 font-bold'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80 hover:scale-105 active:scale-95',
                props.disabled && 'opacity-50 cursor-not-allowed transform-none'
              )}
            >
              {month}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
