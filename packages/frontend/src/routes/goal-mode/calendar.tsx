/**
 * Goal Calendar Page - Capacity-Aware Retroplanning View
 *
 * Displays the retroplan as a visual calendar with:
 * - Color-coded capacity weeks (green=high, yellow=medium, orange=low, red=protected)
 * - Weekly targets adjusted for capacity
 * - Academic events overlay
 * - Progress tracking
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { useNavigate } from '@solidjs/router';

interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
  events: { name: string; type: string }[];
}

interface Milestone {
  weekNumber: number;
  baseTarget: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: WeekCapacity;
  difficulty: 'easy' | 'moderate' | 'challenging' | 'protected';
  isCatchUpWeek: boolean;
  catchUpAmount: number;
}

interface Retroplan {
  id: string;
  goalId: string;
  milestones: Milestone[];
  totalWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  frontLoadedPercentage: number;
  riskFactors: string[];
}

interface Goal {
  id: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  retroplan?: Retroplan;
}

export default function GoalCalendar() {
  const navigate = useNavigate();

  const [goal, setGoal] = createSignal<Goal | null>(null);
  const [retroplan, setRetroplan] = createSignal<Retroplan | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedWeek, setSelectedWeek] = createSignal<number | null>(null);

  onMount(async () => {
    // Load goal from session storage
    const storedGoal = sessionStorage.getItem('currentGoal');
    if (!storedGoal) {
      navigate('/goal-mode/setup');
      return;
    }

    const goalData = JSON.parse(storedGoal) as Goal;
    setGoal(goalData);

    // If retroplan is embedded in goal, use it
    if (goalData.retroplan) {
      setRetroplan(goalData.retroplan);
      setLoading(false);
      return;
    }

    // Otherwise, try to fetch retroplan from API
    try {
      const response = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_retroplan',
          goalId: goalData.id,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setRetroplan(data.retroplan);
      } else {
        // Generate a new retroplan
        const genResponse = await fetch('/api/retroplan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'generate_retroplan',
            goalId: goalData.id,
            goalAmount: goalData.goalAmount,
            deadline: goalData.goalDeadline,
          }),
        });

        if (genResponse.ok) {
          const data = await genResponse.json();
          setRetroplan(data.retroplan);
        }
      }
    } catch (err) {
      setError('Erreur lors du chargement du retroplan');
    } finally {
      setLoading(false);
    }
  });

  // Get color class for capacity category
  const getCapacityColor = (category: WeekCapacity['capacityCategory']) => {
    switch (category) {
      case 'high':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'medium':
        return 'bg-yellow-100 border-yellow-300 text-yellow-800';
      case 'low':
        return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'protected':
        return 'bg-red-100 border-red-300 text-red-800';
      default:
        return 'bg-slate-100 border-slate-300';
    }
  };

  // Get icon for capacity category
  const getCapacityIcon = (category: WeekCapacity['capacityCategory']) => {
    switch (category) {
      case 'high':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟠';
      case 'protected':
        return '🔴';
      default:
        return '⚪';
    }
  };

  // Format date for display
  const formatWeekDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  return (
    <div class="max-w-4xl mx-auto">
      <Show when={loading()}>
        <div class="text-center py-12">
          <div class="animate-spin text-4xl mb-4">📅</div>
          <p class="text-slate-600">Chargement du retroplan...</p>
        </div>
      </Show>

      <Show when={error()}>
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          {error()}
        </div>
      </Show>

      <Show when={!loading() && goal() && retroplan()}>
        {/* Header */}
        <div class="text-center mb-8">
          <h2 class="text-3xl font-bold text-slate-900 mb-2">
            📅 Retroplan: {goal()?.goalName}
          </h2>
          <p class="text-slate-600">
            <span class="font-semibold">{goal()?.goalAmount}€</span> d'ici le{' '}
            <span class="font-semibold">
              {new Date(goal()?.goalDeadline || '').toLocaleDateString('fr-FR')}
            </span>
          </p>
        </div>

        {/* Feasibility Summary */}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div class="card text-center">
            <p class="text-sm text-slate-500 mb-1">Faisabilite</p>
            <p class="text-2xl font-bold text-slate-900">
              {Math.round((retroplan()?.feasibilityScore || 0) * 100)}%
            </p>
          </div>
          <div class="card text-center">
            <p class="text-sm text-slate-500 mb-1">Semaines</p>
            <p class="text-2xl font-bold text-slate-900">{retroplan()?.totalWeeks}</p>
          </div>
          <div class="card text-center">
            <p class="text-sm text-slate-500 mb-1">Protegees</p>
            <p class="text-2xl font-bold text-red-600">
              {retroplan()?.protectedWeeks || 0}
            </p>
          </div>
          <div class="card text-center">
            <p class="text-sm text-slate-500 mb-1">Front-loading</p>
            <p class="text-2xl font-bold text-green-600">
              {Math.round(retroplan()?.frontLoadedPercentage || 0)}%
            </p>
          </div>
        </div>

        {/* Legend */}
        <div class="flex items-center justify-center gap-6 mb-6 text-sm">
          <span class="flex items-center gap-1">
            <span class="w-4 h-4 rounded bg-green-200 border border-green-400"></span>
            Haute capacite
          </span>
          <span class="flex items-center gap-1">
            <span class="w-4 h-4 rounded bg-yellow-200 border border-yellow-400"></span>
            Moyenne
          </span>
          <span class="flex items-center gap-1">
            <span class="w-4 h-4 rounded bg-orange-200 border border-orange-400"></span>
            Basse
          </span>
          <span class="flex items-center gap-1">
            <span class="w-4 h-4 rounded bg-red-200 border border-red-400"></span>
            Protegee (exams)
          </span>
        </div>

        {/* Calendar Grid */}
        <div class="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 mb-8">
          <For each={retroplan()?.milestones}>
            {(milestone) => (
              <button
                class={`
                  p-3 rounded-lg border-2 transition-all cursor-pointer
                  ${getCapacityColor(milestone.capacity.capacityCategory)}
                  ${selectedWeek() === milestone.weekNumber ? 'ring-2 ring-primary-500 ring-offset-2' : ''}
                  hover:scale-105
                `}
                onClick={() => setSelectedWeek(
                  selectedWeek() === milestone.weekNumber ? null : milestone.weekNumber
                )}
              >
                <div class="text-xs font-medium mb-1">S{milestone.weekNumber}</div>
                <div class="text-lg font-bold">{Math.round(milestone.adjustedTarget)}€</div>
                <div class="text-xs opacity-70">
                  {formatWeekDate(milestone.capacity.weekStartDate)}
                </div>
              </button>
            )}
          </For>
        </div>

        {/* Selected Week Details */}
        <Show when={selectedWeek()}>
          {(() => {
            const milestone = retroplan()?.milestones.find(
              (m) => m.weekNumber === selectedWeek()
            );
            if (!milestone) return null;

            return (
              <div class="card mb-8">
                <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
                  {getCapacityIcon(milestone.capacity.capacityCategory)}
                  Semaine {milestone.weekNumber} - {formatWeekDate(milestone.capacity.weekStartDate)}
                </h3>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p class="text-sm text-slate-500">Cible ajustee</p>
                    <p class="text-xl font-bold">{Math.round(milestone.adjustedTarget)}€</p>
                  </div>
                  <div>
                    <p class="text-sm text-slate-500">Cible de base</p>
                    <p class="text-xl font-bold text-slate-400">
                      {Math.round(milestone.baseTarget)}€
                    </p>
                  </div>
                  <div>
                    <p class="text-sm text-slate-500">Cumul attendu</p>
                    <p class="text-xl font-bold">{Math.round(milestone.cumulativeTarget)}€</p>
                  </div>
                  <div>
                    <p class="text-sm text-slate-500">Heures dispo</p>
                    <p class="text-xl font-bold">{milestone.capacity.effectiveHours}h</p>
                  </div>
                </div>

                <div class="flex items-center gap-4 text-sm">
                  <span
                    class={`px-2 py-1 rounded ${getCapacityColor(milestone.capacity.capacityCategory)}`}
                  >
                    Capacite: {milestone.capacity.capacityScore}%
                  </span>
                  <span class="text-slate-500">
                    Difficulte:{' '}
                    {milestone.difficulty === 'easy'
                      ? '🟢 Facile'
                      : milestone.difficulty === 'moderate'
                      ? '🟡 Modere'
                      : milestone.difficulty === 'challenging'
                      ? '🟠 Difficile'
                      : '🔴 Protege'}
                  </span>
                </div>

                <Show when={milestone.capacity.events.length > 0}>
                  <div class="mt-4 pt-4 border-t border-slate-200">
                    <p class="text-sm font-medium text-slate-700 mb-2">Evenements:</p>
                    <div class="flex flex-wrap gap-2">
                      <For each={milestone.capacity.events}>
                        {(event) => (
                          <span class="px-2 py-1 bg-slate-100 rounded text-sm">
                            {event.type === 'exam_period'
                              ? '📝'
                              : event.type === 'vacation'
                              ? '🏖️'
                              : '📅'}{' '}
                            {event.name}
                          </span>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            );
          })()}
        </Show>

        {/* Risk Factors */}
        <Show when={retroplan()?.riskFactors && retroplan()!.riskFactors.length > 0}>
          <div class="card bg-amber-50 border-amber-200 mb-8">
            <h3 class="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <span>⚠️</span> Points d'attention
            </h3>
            <ul class="text-sm text-amber-700 space-y-1">
              <For each={retroplan()?.riskFactors}>
                {(factor) => <li>• {factor}</li>}
              </For>
            </ul>
          </div>
        </Show>

        {/* Action Buttons */}
        <div class="flex justify-center gap-4">
          <button
            class="btn-secondary"
            onClick={() => navigate('/goal-mode/track')}
          >
            Suivre ma progression
          </button>
          <button
            class="btn-primary"
            onClick={() => navigate('/goal-mode/plan')}
          >
            Voir les strategies
          </button>
        </div>
      </Show>

      {/* No retroplan fallback */}
      <Show when={!loading() && goal() && !retroplan()}>
        <div class="text-center py-12">
          <p class="text-slate-600 mb-4">
            Aucun retroplan trouve. Ajoute tes examens et engagements pour un plan personnalise.
          </p>
          <button class="btn-primary" onClick={() => navigate('/goal-mode/setup')}>
            Configurer mon retroplan
          </button>
        </div>
      </Show>
    </div>
  );
}
