/**
 * Timeline Hero Component
 *
 * Double progress bar showing time progress and workload progress.
 */

import { Show } from 'solid-js';

interface TimelineHeroProps {
  goalName: string;
  goalAmount: number;
  currentAmount: number;
  startDate: string;
  endDate: string;
  weeklyTarget: number;
  currentWeek: number;
  totalWeeks: number;
}

export function TimelineHero(props: TimelineHeroProps) {
  const timeProgress = () => Math.min((props.currentWeek / props.totalWeeks) * 100, 100);
  const amountProgress = () => Math.min((props.currentAmount / props.goalAmount) * 100, 100);

  const daysRemaining = () => {
    const end = new Date(props.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const isOnTrack = () => amountProgress() >= timeProgress() - 5;
  const isAhead = () => amountProgress() > timeProgress() + 10;

  const getStatusMessage = () => {
    if (isAhead()) return { text: 'En avance !', color: 'text-green-600', icon: '🚀' };
    if (isOnTrack()) return { text: 'Sur la bonne voie', color: 'text-blue-600', icon: '👍' };
    return { text: "Besoin d'un coup de boost", color: 'text-amber-600', icon: '⚡' };
  };

  const status = getStatusMessage();

  return (
    <div class="card bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      {/* Header */}
      <div class="flex items-start justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold">{props.goalName}</h2>
          <p class="text-slate-400 mt-1">
            Objectif: <span class="text-white font-semibold">{props.goalAmount}€</span>
          </p>
        </div>
        <div class="text-right">
          <div class="text-3xl font-bold">{props.currentAmount}€</div>
          <div class="text-slate-400 text-sm">collectes</div>
        </div>
      </div>

      {/* Double Progress Bars */}
      <div class="space-y-4">
        {/* Time Progress */}
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-slate-400">Temps ecoule</span>
            <span class="font-medium">
              Semaine {props.currentWeek}/{props.totalWeeks}
            </span>
          </div>
          <div class="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-500"
              style={`width: ${timeProgress()}%`}
            />
          </div>
        </div>

        {/* Amount Progress */}
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-slate-400">Progression objectif</span>
            <span class="font-medium">{Math.round(amountProgress())}%</span>
          </div>
          <div class="h-3 bg-slate-700 rounded-full overflow-hidden relative">
            {/* Time marker */}
            <div
              class="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10"
              style={`left: ${timeProgress()}%`}
            />
            <div
              class={`h-full transition-all duration-500 ${
                isAhead()
                  ? 'bg-gradient-to-r from-green-500 to-green-400'
                  : isOnTrack()
                    ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                    : 'bg-gradient-to-r from-amber-500 to-amber-400'
              }`}
              style={`width: ${amountProgress()}%`}
            />
          </div>
        </div>
      </div>

      {/* Status & Stats */}
      <div class="mt-6 pt-6 border-t border-slate-700 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-2xl">{status.icon}</span>
          <span class={`font-medium ${status.color}`}>{status.text}</span>
        </div>
        <div class="flex gap-6 text-sm">
          <div class="text-center">
            <div class="font-bold text-white">{daysRemaining()}</div>
            <div class="text-slate-400">jours</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-white">{props.weeklyTarget}€</div>
            <div class="text-slate-400">/semaine</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-white">{props.goalAmount - props.currentAmount}€</div>
            <div class="text-slate-400">restant</div>
          </div>
        </div>
      </div>

      {/* Quick Action */}
      <Show when={!isOnTrack()}>
        <div class="mt-4 p-3 bg-amber-500/20 rounded-lg flex items-center justify-between">
          <span class="text-amber-200 text-sm">
            Tu es {Math.round(timeProgress() - amountProgress())}% en retard sur l'objectif
          </span>
          <button
            type="button"
            class="px-3 py-1 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Plan de rattrapage
          </button>
        </div>
      </Show>
    </div>
  );
}
