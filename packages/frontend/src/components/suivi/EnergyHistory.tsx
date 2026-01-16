/**
 * Energy History Component
 *
 * Displays energy levels over time and detects Energy Debt.
 */

import { For, Show, createMemo } from 'solid-js';

interface EnergyEntry {
  week: number;
  level: number; // 0-100
  date: string;
}

interface EnergyDebt {
  consecutiveLowWeeks: number;
  severity: 'low' | 'medium' | 'high';
  accumulatedDebt: number;
}

interface EnergyHistoryProps {
  history: EnergyEntry[];
  threshold?: number;
  onEnergyUpdate?: (week: number, level: number) => void;
}

// Energy Debt Detection Algorithm
function detectEnergyDebt(history: EnergyEntry[], threshold = 40): EnergyDebt | null {
  if (history.length < 3) return null;

  let consecutiveLow = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].level < threshold) {
      consecutiveLow++;
    } else {
      break;
    }
  }

  if (consecutiveLow >= 3) {
    return {
      consecutiveLowWeeks: consecutiveLow,
      severity: consecutiveLow >= 5 ? 'high' : consecutiveLow >= 4 ? 'medium' : 'low',
      accumulatedDebt: consecutiveLow * 30,
    };
  }
  return null;
}

export function EnergyHistory(props: EnergyHistoryProps) {
  const threshold = () => props.threshold || 40;

  const debt = createMemo(() => detectEnergyDebt(props.history, threshold()));

  const averageEnergy = createMemo(() => {
    if (props.history.length === 0) return 0;
    return Math.round(props.history.reduce((sum, e) => sum + e.level, 0) / props.history.length);
  });

  const currentEnergy = createMemo(() => {
    if (props.history.length === 0) return 50;
    return props.history[props.history.length - 1].level;
  });

  const getEnergyColor = (level: number) => {
    if (level >= 70) return 'bg-green-500';
    if (level >= 50) return 'bg-yellow-500';
    if (level >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getEnergyLabel = (level: number) => {
    if (level >= 80) return 'Au top !';
    if (level >= 60) return 'Ca va';
    if (level >= 40) return 'Fatigue';
    if (level >= 20) return 'Epuise';
    return 'Burnout';
  };

  const getSeverityInfo = (severity: string) => {
    switch (severity) {
      case 'high':
        return { label: 'Critique', color: 'red', reduction: 85 };
      case 'medium':
        return { label: 'Modere', color: 'orange', reduction: 75 };
      case 'low':
        return { label: 'Leger', color: 'amber', reduction: 50 };
      default:
        return { label: '', color: 'slate', reduction: 0 };
    }
  };

  return (
    <div class="space-y-4">
      {/* Current Energy */}
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-slate-900">Energie actuelle</h3>
          <span class="text-sm text-slate-500">Moyenne: {averageEnergy()}%</span>
        </div>

        <div class="flex items-center gap-4">
          <div class="flex-1">
            <div class="h-4 bg-slate-200 rounded-full overflow-hidden">
              <div
                class={`h-full transition-all duration-500 ${getEnergyColor(currentEnergy())}`}
                style={{ width: `${currentEnergy()}%` }}
              />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-2xl font-bold">{currentEnergy()}%</span>
            <span class="text-sm text-slate-500">{getEnergyLabel(currentEnergy())}</span>
          </div>
        </div>
      </div>

      {/* Energy Debt Alert */}
      <Show when={debt()}>
        {(debtInfo) => {
          const severity = getSeverityInfo(debtInfo().severity);
          return (
            <div class={`card border-2 border-${severity.color}-300 bg-${severity.color}-50`}>
              <div class="flex items-start gap-3">
                <div class="text-3xl">⚠️</div>
                <div class="flex-1">
                  <h4 class={`font-bold text-${severity.color}-800`}>
                    Energy Debt Detecte ({severity.label})
                  </h4>
                  <p class={`text-${severity.color}-600 mt-1`}>
                    {debtInfo().consecutiveLowWeeks} semaines consecutives a moins de {threshold()}%
                    d'energie. Tes objectifs ont ete automatiquement reduits de {severity.reduction}
                    %.
                  </p>

                  <div class="mt-4 p-3 bg-white rounded-lg">
                    <div class="flex items-center justify-between">
                      <span class="text-sm text-slate-600">Points de dette accumules</span>
                      <span class="font-bold text-red-600">{debtInfo().accumulatedDebt} pts</span>
                    </div>
                    <p class="text-xs text-slate-500 mt-2">
                      Prends soin de toi. Quand ton energie remontera, tu pourras debloquer le mode
                      Comeback !
                    </p>
                  </div>

                  <div class="flex gap-2 mt-4">
                    <button
                      type="button"
                      class={`px-4 py-2 bg-${severity.color}-500 text-white rounded-lg text-sm font-medium hover:bg-${severity.color}-600 transition-colors`}
                    >
                      🧘 Mode Self-Care
                    </button>
                    <button
                      type="button"
                      class="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                    >
                      Voir les conseils
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      </Show>

      {/* History Chart */}
      <div class="card">
        <h3 class="font-semibold text-slate-900 mb-4">Historique</h3>

        <div class="flex items-end gap-1 h-32">
          <For each={props.history}>
            {(entry) => (
              <div class="flex-1 flex flex-col items-center gap-1">
                <div
                  class={`w-full rounded-t transition-all ${getEnergyColor(entry.level)} ${
                    entry.level < threshold() ? 'opacity-60' : ''
                  }`}
                  style={{ height: `${entry.level}%` }}
                  title={`Semaine ${entry.week}: ${entry.level}%`}
                />
                <span class="text-xs text-slate-400">S{entry.week}</span>
              </div>
            )}
          </For>
        </div>

        {/* Threshold Line */}
        <div class="relative mt-2">
          <div class="absolute left-0 right-0 border-t-2 border-dashed border-red-300" />
          <span class="absolute right-0 -top-3 text-xs text-red-400">Seuil ({threshold()}%)</span>
        </div>
      </div>

      {/* Quick Energy Input */}
      <div class="card bg-slate-50">
        <h4 class="font-medium text-slate-700 mb-3">Comment tu te sens cette semaine ?</h4>
        <div class="flex gap-2">
          <For
            each={[
              { emoji: '😴', level: 20 },
              { emoji: '😔', level: 40 },
              { emoji: '😐', level: 60 },
              { emoji: '😊', level: 80 },
              { emoji: '🚀', level: 100 },
            ]}
          >
            {(option) => (
              <button
                type="button"
                class={`flex-1 py-3 rounded-lg text-2xl transition-all hover:scale-110 ${
                  currentEnergy() >= option.level - 10 && currentEnergy() < option.level + 10
                    ? 'bg-primary-100 ring-2 ring-primary-500'
                    : 'bg-white hover:bg-slate-100'
                }`}
                onClick={() =>
                  props.onEnergyUpdate?.(
                    props.history.length > 0 ? props.history[props.history.length - 1].week : 1,
                    option.level
                  )
                }
              >
                {option.emoji}
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
