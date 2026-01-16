/**
 * GoalProgress Component
 *
 * A visual progress bar showing goal completion percentage.
 */

import { Show } from 'solid-js';

interface GoalProgressProps {
  current: number;
  target: number;
  label?: string;
  showAmount?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function GoalProgress(props: GoalProgressProps) {
  const percentage = () => Math.min(100, Math.round((props.current / props.target) * 100));

  const sizeClasses = () => {
    switch (props.size) {
      case 'sm':
        return 'h-2';
      case 'lg':
        return 'h-6';
      default:
        return 'h-4';
    }
  };

  const getColorClass = () => {
    const pct = percentage();
    if (pct >= 100) return 'bg-green-500';
    if (pct >= 75) return 'bg-emerald-500';
    if (pct >= 50) return 'bg-blue-500';
    if (pct >= 25) return 'bg-amber-500';
    return 'bg-primary-500';
  };

  return (
    <div class="w-full">
      <Show when={props.label || props.showAmount}>
        <div class="flex justify-between items-center mb-2">
          <Show when={props.label}>
            <span class="text-sm font-medium text-slate-700">{props.label}</span>
          </Show>
          <Show when={props.showAmount}>
            <span class="text-sm text-slate-600">
              {props.current.toLocaleString()}€ / {props.target.toLocaleString()}€
            </span>
          </Show>
        </div>
      </Show>

      <div class={`w-full bg-slate-200 rounded-full overflow-hidden ${sizeClasses()}`}>
        <div
          class={`${sizeClasses()} rounded-full transition-all duration-500 ${getColorClass()}`}
          style={{ width: `${percentage()}%` }}
        />
      </div>

      <div class="flex justify-between mt-1">
        <span class="text-xs text-slate-500">{percentage()}%</span>
        <Show when={percentage() >= 100}>
          <span class="text-xs text-green-600 font-medium">Goal reached!</span>
        </Show>
      </div>
    </div>
  );
}

export default GoalProgress;
