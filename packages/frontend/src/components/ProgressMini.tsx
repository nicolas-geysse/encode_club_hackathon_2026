/**
 * Progress Mini Component
 *
 * Compact progress bar for header with tooltip breakdown.
 * Shows percentage with optional category breakdown.
 */

import { createSignal, Show, For } from 'solid-js';

export interface ProgressBreakdown {
  label: string;
  value: number;
  color: string;
}

interface ProgressMiniProps {
  percent: number;
  breakdown?: ProgressBreakdown[];
  goalAmount?: number;
  currentAmount?: number;
}

export function ProgressMini(props: ProgressMiniProps) {
  const [showTooltip, setShowTooltip] = createSignal(false);

  const clampedPercent = () => Math.min(100, Math.max(0, props.percent));

  const getProgressColor = () => {
    const p = clampedPercent();
    if (p >= 100) return 'from-green-500 to-green-600';
    if (p >= 75) return 'from-primary-500 to-primary-600';
    if (p >= 50) return 'from-amber-500 to-amber-600';
    return 'from-red-500 to-red-600';
  };

  return (
    <div
      class="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Progress Bar */}
      <div class="flex items-center gap-2 cursor-pointer">
        <div class="w-20 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            class={`h-full bg-gradient-to-r ${getProgressColor()} transition-all duration-500 ease-out`}
            style={{ width: `${clampedPercent()}%` }}
          />
        </div>
        <span class="text-xs font-medium text-slate-600 min-w-[32px]">
          {Math.round(clampedPercent())}%
        </span>
      </div>

      {/* Tooltip */}
      <Show when={showTooltip()}>
        <div class="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 bg-slate-900 text-white rounded-lg shadow-lg p-3 z-50">
          <div class="text-xs font-semibold mb-2">Goal progress</div>

          {/* Goal amounts */}
          <Show when={props.goalAmount && props.currentAmount !== undefined}>
            <div class="flex justify-between text-sm mb-2">
              <span class="text-slate-300">{props.currentAmount}€</span>
              <span class="text-slate-400">/</span>
              <span class="text-slate-300">{props.goalAmount}€</span>
            </div>
          </Show>

          {/* Breakdown */}
          <Show when={props.breakdown && props.breakdown.length > 0}>
            <div class="space-y-1.5 mt-2 pt-2 border-t border-slate-700">
              <For each={props.breakdown}>
                {(item) => (
                  <div class="flex items-center justify-between text-xs">
                    <div class="flex items-center gap-1.5">
                      <span
                        class="w-2 h-2 rounded-full"
                        style={{ 'background-color': item.color }}
                      />
                      <span class="text-slate-300">{item.label}</span>
                    </div>
                    <span class="font-medium">{item.value}€</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Arrow */}
          <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45" />
        </div>
      </Show>
    </div>
  );
}

export default ProgressMini;
