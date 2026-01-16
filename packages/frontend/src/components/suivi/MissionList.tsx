/**
 * Mission List Component
 *
 * Displays all missions from swipe selections with filtering.
 */

import { createSignal, For, Show, createMemo } from 'solid-js';
import { MissionCard, type Mission } from './MissionCard';

interface MissionListProps {
  missions: Mission[];
  onMissionUpdate?: (id: string, updates: Partial<Mission>) => void;
  onMissionComplete?: (id: string) => void;
  onMissionSkip?: (id: string) => void;
}

type FilterType = 'all' | 'active' | 'completed';

export function MissionList(props: MissionListProps) {
  const [filter, setFilter] = createSignal<FilterType>('all');

  const filteredMissions = createMemo(() => {
    switch (filter()) {
      case 'active':
        return props.missions.filter((m) => m.status === 'active');
      case 'completed':
        return props.missions.filter((m) => m.status === 'completed');
      default:
        return props.missions;
    }
  });

  const stats = createMemo(() => {
    const active = props.missions.filter((m) => m.status === 'active');
    const completed = props.missions.filter((m) => m.status === 'completed');

    return {
      total: props.missions.length,
      active: active.length,
      completed: completed.length,
      totalEarnings: props.missions.reduce((sum, m) => sum + m.earningsCollected, 0),
      totalHours: props.missions.reduce((sum, m) => sum + m.hoursCompleted, 0),
      weeklyPotential: active.reduce((sum, m) => sum + m.weeklyEarnings, 0),
    };
  });

  const handleLogProgress = (id: string, hours: number, earnings: number) => {
    const mission = props.missions.find((m) => m.id === id);
    if (!mission) return;

    const newHours = mission.hoursCompleted + hours;
    const newEarnings = mission.earningsCollected + earnings;
    const progress = Math.min(100, Math.round((newHours / mission.weeklyHours) * 100));

    props.onMissionUpdate?.(id, {
      hoursCompleted: newHours,
      earningsCollected: newEarnings,
      progress,
      status: progress >= 100 ? 'completed' : 'active',
    });
  };

  return (
    <div class="space-y-6">
      {/* Stats Summary */}
      <div class="grid grid-cols-4 gap-3">
        <div class="card text-center py-4">
          <div class="text-2xl font-bold text-primary-600">{stats().active}</div>
          <div class="text-xs text-slate-500">Actives</div>
        </div>
        <div class="card text-center py-4">
          <div class="text-2xl font-bold text-green-600">{stats().completed}</div>
          <div class="text-xs text-slate-500">Terminees</div>
        </div>
        <div class="card text-center py-4">
          <div class="text-2xl font-bold text-slate-900">{stats().totalHours}h</div>
          <div class="text-xs text-slate-500">Travaillees</div>
        </div>
        <div class="card text-center py-4 bg-green-50">
          <div class="text-2xl font-bold text-green-700">{stats().totalEarnings}€</div>
          <div class="text-xs text-green-600">Gagnes</div>
        </div>
      </div>

      {/* Weekly Potential */}
      <Show when={stats().weeklyPotential > 0}>
        <div class="card bg-gradient-to-r from-primary-50 to-primary-100">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium text-primary-900">Potentiel cette semaine</h4>
              <p class="text-sm text-primary-600">Si tu completes toutes tes missions actives</p>
            </div>
            <div class="text-3xl font-bold text-primary-700">+{stats().weeklyPotential}€</div>
          </div>
        </div>
      </Show>

      {/* Filter Tabs */}
      <div class="flex gap-2">
        <For each={['all', 'active', 'completed'] as FilterType[]}>
          {(f) => (
            <button
              type="button"
              class={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filter() === f
                  ? 'bg-primary-100 text-primary-700'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'Toutes' : f === 'active' ? 'Actives' : 'Terminees'} (
              {f === 'all' ? stats().total : f === 'active' ? stats().active : stats().completed})
            </button>
          )}
        </For>
      </div>

      {/* Mission Cards */}
      <div class="space-y-3">
        <For each={filteredMissions()}>
          {(mission) => (
            <MissionCard
              mission={mission}
              onComplete={() => props.onMissionComplete?.(mission.id)}
              onSkip={() => props.onMissionSkip?.(mission.id)}
              onLogProgress={(hours, earnings) => handleLogProgress(mission.id, hours, earnings)}
            />
          )}
        </For>

        {/* Empty State */}
        <Show when={filteredMissions().length === 0}>
          <div class="card text-center py-12">
            <div class="text-4xl mb-4">
              {filter() === 'active' ? '🎯' : filter() === 'completed' ? '🏆' : '📋'}
            </div>
            <h3 class="text-lg font-medium text-slate-900 mb-2">
              {filter() === 'active'
                ? 'Aucune mission active'
                : filter() === 'completed'
                  ? 'Aucune mission terminee'
                  : 'Pas de missions'}
            </h3>
            <p class="text-slate-500">
              {filter() === 'active'
                ? 'Utilise Swipe Scenarios pour creer des missions'
                : filter() === 'completed'
                  ? 'Complete des missions pour les voir ici'
                  : "Va dans l'onglet Swipe pour generer des missions"}
            </p>
          </div>
        </Show>
      </div>

      {/* Motivational Footer */}
      <Show when={stats().active > 0}>
        <div class="text-center text-sm text-slate-500 pt-4 border-t border-slate-100">
          💪 Tu as {stats().active} mission{stats().active > 1 ? 's' : ''} en cours. Continue comme
          ca !
        </div>
      </Show>
    </div>
  );
}
