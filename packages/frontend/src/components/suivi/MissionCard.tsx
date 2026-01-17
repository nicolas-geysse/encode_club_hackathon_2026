/**
 * Mission Card Component
 *
 * Individual mission item from swipe selections.
 */

import { Show } from 'solid-js';

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: string;
  weeklyHours: number;
  weeklyEarnings: number;
  status: 'active' | 'completed' | 'skipped';
  progress: number; // 0-100
  startDate: string;
  hoursCompleted: number;
  earningsCollected: number;
}

interface MissionCardProps {
  mission: Mission;
  onComplete?: () => void;
  onSkip?: () => void;
  onLogProgress?: (hours: number, earnings: number) => void;
}

export function MissionCard(props: MissionCardProps) {
  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      freelance: '💻',
      tutoring: '📚',
      selling: '📦',
      lifestyle: '🏠',
      trade: '🔄',
    };
    return icons[category] || '💼';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          label: 'Done',
          class: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400',
        };
      case 'skipped':
        return {
          label: 'Skipped',
          class: 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
        };
      default:
        return {
          label: 'In progress',
          class: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400',
        };
    }
  };

  const status = () => getStatusBadge(props.mission.status);

  return (
    <div
      class={`card transition-all ${
        props.mission.status === 'completed'
          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          : props.mission.status === 'skipped'
            ? 'opacity-60'
            : ''
      }`}
    >
      <div class="flex items-start gap-4">
        {/* Category Icon */}
        <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-2xl">
          {getCategoryIcon(props.mission.category)}
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          {/* Header */}
          <div class="flex items-center gap-2 mb-1">
            <h4 class="font-semibold text-slate-900 dark:text-slate-100 truncate">
              {props.mission.title}
            </h4>
            <span class={`px-2 py-0.5 text-xs font-medium rounded-full ${status().class}`}>
              {status().label}
            </span>
          </div>

          {/* Description */}
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-3">{props.mission.description}</p>

          {/* Progress Bar */}
          <Show when={props.mission.status === 'active'}>
            <div class="mb-3">
              <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>Progress</span>
                <span>{props.mission.progress}%</span>
              </div>
              <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${props.mission.progress}%` }}
                />
              </div>
            </div>
          </Show>

          {/* Stats */}
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <span>⏱</span>
              <span>
                {props.mission.hoursCompleted}/{props.mission.weeklyHours}h
              </span>
            </div>
            <div class="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
              <span>💰</span>
              <span>
                {props.mission.earningsCollected}/{props.mission.weeklyEarnings}€
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div class="flex-shrink-0 flex flex-col gap-2">
          <Show when={props.mission.status === 'active'}>
            <button
              type="button"
              class="px-3 py-1.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 rounded-lg text-sm font-medium hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
              onClick={() => props.onComplete?.()}
            >
              ✓ Done
            </button>
            <button
              type="button"
              class="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              onClick={() => {
                const hours = prompt('Hours completed this week:', '0');
                const earnings = prompt('Euros earned:', '0');
                if (hours && earnings) {
                  props.onLogProgress?.(parseFloat(hours), parseFloat(earnings));
                }
              }}
            >
              + Log
            </button>
          </Show>
          <Show when={props.mission.status === 'active'}>
            <button
              type="button"
              class="text-xs text-slate-400 hover:text-red-500 transition-colors"
              onClick={() => props.onSkip?.()}
            >
              Skip
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
