/**
 * MilestoneCard Component
 *
 * Displays a weekly milestone with progress and actions.
 */

import { Show, For } from 'solid-js';

interface MilestoneCardProps {
  weekNumber: number;
  targetAmount: number;
  earnedAmount?: number;
  cumulativeTarget: number;
  status: 'pending' | 'in_progress' | 'completed' | 'missed';
  actions: string[];
  isCurrentWeek?: boolean;
}

export function MilestoneCard(props: MilestoneCardProps) {
  const progress = () =>
    props.earnedAmount ? Math.round((props.earnedAmount / props.targetAmount) * 100) : 0;

  const statusIcon = () => {
    switch (props.status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '◐';
      case 'missed':
        return '✗';
      default:
        return '○';
    }
  };

  const statusColor = () => {
    switch (props.status) {
      case 'completed':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'missed':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-slate-50 border-slate-200 text-slate-600';
    }
  };

  return (
    <div
      class={`
        rounded-lg border-2 p-4 transition-all
        ${statusColor()}
        ${props.isCurrentWeek ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
      `}
    >
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="text-lg font-bold">{statusIcon()}</span>
          <span class="font-semibold">Week {props.weekNumber}</span>
          <Show when={props.isCurrentWeek}>
            <span class="px-2 py-0.5 bg-primary-500 text-white text-xs rounded-full">
              In progress
            </span>
          </Show>
        </div>
        <div class="text-right">
          <div class="font-bold">${props.targetAmount}</div>
          <div class="text-xs opacity-75">Target: ${props.cumulativeTarget} cumulative</div>
        </div>
      </div>

      <Show when={props.status === 'in_progress' || props.status === 'completed'}>
        <div class="mb-3">
          <div class="flex justify-between text-sm mb-1">
            <span>Progress</span>
            <span>
              ${props.earnedAmount || 0} / ${props.targetAmount}
            </span>
          </div>
          <div class="w-full bg-white/50 rounded-full h-2">
            <div
              class={`h-2 rounded-full transition-all ${
                progress() >= 100 ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, progress())}%` }}
            />
          </div>
        </div>
      </Show>

      <Show when={props.actions.length > 0}>
        <div class="border-t border-current/20 pt-2 mt-2">
          <div class="text-xs font-medium mb-1 opacity-75">Actions suggerees:</div>
          <ul class="text-sm space-y-1">
            <For each={props.actions}>
              {(action) => (
                <li class="flex items-center gap-1">
                  <span class="opacity-50">•</span>
                  {action}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}

export default MilestoneCard;
