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
        return { label: 'Termine', class: 'bg-green-100 text-green-700' };
      case 'skipped':
        return { label: 'Passe', class: 'bg-slate-100 text-slate-500' };
      default:
        return { label: 'En cours', class: 'bg-blue-100 text-blue-700' };
    }
  };

  const status = () => getStatusBadge(props.mission.status);

  return (
    <div
      class={`card transition-all ${
        props.mission.status === 'completed'
          ? 'bg-green-50 border-green-200'
          : props.mission.status === 'skipped'
            ? 'opacity-60'
            : ''
      }`}
    >
      <div class="flex items-start gap-4">
        {/* Category Icon */}
        <div class="flex-shrink-0 w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">
          {getCategoryIcon(props.mission.category)}
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          {/* Header */}
          <div class="flex items-center gap-2 mb-1">
            <h4 class="font-semibold text-slate-900 truncate">{props.mission.title}</h4>
            <span class={`px-2 py-0.5 text-xs font-medium rounded-full ${status().class}`}>
              {status().label}
            </span>
          </div>

          {/* Description */}
          <p class="text-sm text-slate-500 mb-3">{props.mission.description}</p>

          {/* Progress Bar */}
          <Show when={props.mission.status === 'active'}>
            <div class="mb-3">
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Progression</span>
                <span>{props.mission.progress}%</span>
              </div>
              <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary-500 transition-all duration-300"
                  style={{ width: `${props.mission.progress}%` }}
                />
              </div>
            </div>
          </Show>

          {/* Stats */}
          <div class="flex items-center gap-4 text-sm">
            <div class="flex items-center gap-1 text-slate-500">
              <span>⏱</span>
              <span>
                {props.mission.hoursCompleted}/{props.mission.weeklyHours}h
              </span>
            </div>
            <div class="flex items-center gap-1 text-green-600 font-medium">
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
              class="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
              onClick={() => props.onComplete?.()}
            >
              ✓ Fait
            </button>
            <button
              type="button"
              class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm hover:bg-slate-200 transition-colors"
              onClick={() => {
                const hours = prompt('Heures completees cette semaine:', '0');
                const earnings = prompt('Euros gagnes:', '0');
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
              Passer
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
}
