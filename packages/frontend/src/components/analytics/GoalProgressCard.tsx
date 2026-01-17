/**
 * Goal Progress Card Component
 *
 * Displays detailed goal progress with projections.
 */

import { Show } from 'solid-js';

interface GoalProgressCardProps {
  name: string;
  target: number;
  current: number;
  daysRemaining: number;
  onTrack: boolean;
  projectedCompletion: string | null;
}

export function GoalProgressCard(props: GoalProgressCardProps) {
  const progress = () => Math.min(100, Math.round((props.current / props.target) * 100));

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const remaining = () => props.target - props.current;

  const dailyNeeded = () => {
    if (props.daysRemaining <= 0) return 0;
    return Math.ceil(remaining() / props.daysRemaining);
  };

  return (
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h4 class="font-semibold text-slate-900 dark:text-slate-100">{props.name}</h4>
          <p class="text-sm text-slate-500 dark:text-slate-400">
            {props.daysRemaining} days remaining
          </p>
        </div>
        <div
          class={`px-3 py-1 rounded-full text-sm font-medium ${
            props.onTrack
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          }`}
        >
          {props.onTrack ? 'On Track' : 'Behind'}
        </div>
      </div>

      {/* Progress bar */}
      <div class="mb-4">
        <div class="flex justify-between text-sm mb-1">
          <span class="text-slate-600 dark:text-slate-400">{props.current}€</span>
          <span class="text-slate-900 dark:text-slate-100 font-medium">{props.target}€</span>
        </div>
        <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            class={`h-full rounded-full transition-all duration-500 ${
              props.onTrack ? 'bg-green-500' : 'bg-amber-500'
            }`}
            style={{ width: `${progress()}%` }}
          />
        </div>
        <div class="text-right text-sm text-slate-500 dark:text-slate-400 mt-1">
          {progress()}% complete
        </div>
      </div>

      {/* Stats grid */}
      <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400">Remaining</p>
          <p class="text-lg font-bold text-slate-900 dark:text-slate-100">{remaining()}€</p>
        </div>
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400">Daily target</p>
          <p class="text-lg font-bold text-slate-900 dark:text-slate-100">{dailyNeeded()}€</p>
        </div>
      </div>

      <Show when={props.projectedCompletion}>
        <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            Projected completion:
            <span
              class={`ml-2 font-medium ${
                props.onTrack
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {formatDate(props.projectedCompletion!)}
            </span>
          </p>
        </div>
      </Show>
    </div>
  );
}
