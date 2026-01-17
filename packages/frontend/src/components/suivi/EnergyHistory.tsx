/**
 * Energy History Component (Compact)
 *
 * 2-column layout: Current energy + emoji input | Inline mini-bars + stats
 * Integrates Energy Debt alerts inline.
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

// Comeback Detection (energy recovery after low period)
function detectComeback(history: EnergyEntry[], threshold = 40): boolean {
  if (history.length < 3) return false;
  const current = history[history.length - 1]?.level ?? 0;
  const previous = history[history.length - 2]?.level ?? 50;
  const lowWeeks = history.filter((e) => e.level < threshold).length;
  return lowWeeks >= 2 && current > 80 && previous < 50;
}

export function EnergyHistory(props: EnergyHistoryProps) {
  const threshold = () => props.threshold || 40;

  const debt = createMemo(() => detectEnergyDebt(props.history, threshold()));
  const isComeback = createMemo(() => detectComeback(props.history, threshold()));

  const averageEnergy = createMemo(() => {
    if (props.history.length === 0) return 0;
    return Math.round(props.history.reduce((sum, e) => sum + e.level, 0) / props.history.length);
  });

  const minEnergy = createMemo(() => {
    if (props.history.length === 0) return 0;
    return Math.min(...props.history.map((e) => e.level));
  });

  const currentEnergy = createMemo(() => {
    if (props.history.length === 0) return 50;
    return props.history[props.history.length - 1].level;
  });

  const getEnergyEmoji = (level: number) => {
    if (level >= 80) return '🚀';
    if (level >= 60) return '😊';
    if (level >= 40) return '😐';
    if (level >= 20) return '😔';
    return '😴';
  };

  const getEnergyColor = (level: number) => {
    if (level >= 70) return 'bg-green-500';
    if (level >= 50) return 'bg-yellow-500';
    if (level >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getSeverityClasses = (severity: string) => {
    switch (severity) {
      case 'high':
        return {
          label: 'Critical',
          bg: 'bg-red-100 dark:bg-red-900/30',
          text: 'text-red-700 dark:text-red-300',
          border: 'border-red-300 dark:border-red-700',
        };
      case 'medium':
        return {
          label: 'Moderate',
          bg: 'bg-orange-100 dark:bg-orange-900/30',
          text: 'text-orange-700 dark:text-orange-300',
          border: 'border-orange-300 dark:border-orange-700',
        };
      default:
        return {
          label: 'Minor',
          bg: 'bg-amber-100 dark:bg-amber-900/30',
          text: 'text-amber-700 dark:text-amber-300',
          border: 'border-amber-300 dark:border-amber-700',
        };
    }
  };

  return (
    <div class="card">
      <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
        <span>⚡</span> Energy
      </h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Current Energy + Emoji Input */}
        <div class="space-y-3">
          {/* Current energy display */}
          <div class="flex items-center gap-3">
            <span class="text-3xl">{getEnergyEmoji(currentEnergy())}</span>
            <div class="flex-1">
              <div class="flex items-baseline gap-2">
                <span class="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {currentEnergy()}%
                </span>
                <span class="text-sm text-slate-500 dark:text-slate-400">current</span>
              </div>
              <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden mt-1">
                <div
                  class={`h-full transition-all duration-500 ${getEnergyColor(currentEnergy())}`}
                  style={{ width: `${currentEnergy()}%` }}
                />
              </div>
            </div>
          </div>

          {/* Emoji input */}
          <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-2">
            <p class="text-xs text-slate-500 dark:text-slate-400 mb-2">How are you this week?</p>
            <div class="flex gap-1">
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
                    class={`flex-1 py-2 rounded text-xl transition-all hover:scale-110 ${
                      currentEnergy() >= option.level - 10 && currentEnergy() < option.level + 10
                        ? 'bg-primary-100 dark:bg-primary-900/40 ring-2 ring-primary-500'
                        : 'bg-white dark:bg-slate-600 hover:bg-slate-100 dark:hover:bg-slate-500'
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

        {/* Right Column: Inline mini-bars + stats */}
        <div class="space-y-3">
          {/* Mini bar chart */}
          <div class="flex items-end gap-0.5 h-16">
            <For each={props.history.slice(-8)}>
              {(entry) => (
                <div class="flex-1 flex flex-col items-center gap-0.5">
                  <div
                    class={`w-full rounded-t transition-all ${getEnergyColor(entry.level)} ${
                      entry.level < threshold() ? 'opacity-60' : ''
                    }`}
                    style={{ height: `${Math.max(entry.level, 5)}%` }}
                    title={`Week ${entry.week}: ${entry.level}%`}
                  />
                </div>
              )}
            </For>
            <Show when={props.history.length === 0}>
              <div class="flex-1 text-center text-slate-400 dark:text-slate-500 text-xs py-4">
                No data yet
              </div>
            </Show>
          </div>

          {/* Stats row */}
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Avg: <strong class="text-slate-700 dark:text-slate-200">{averageEnergy()}%</strong>
            </span>
            <span>
              Min: <strong class="text-slate-700 dark:text-slate-200">{minEnergy()}%</strong>
            </span>
            <span class="text-red-400">Threshold: {threshold()}%</span>
          </div>
        </div>
      </div>

      {/* Inline Energy Debt Alert */}
      <Show when={debt()}>
        {(debtInfo) => {
          const severity = getSeverityClasses(debtInfo().severity);
          return (
            <div class={`mt-4 p-3 rounded-lg border ${severity.bg} ${severity.border}`}>
              <div class="flex items-center gap-2">
                <span class="text-xl">⚠️</span>
                <div class="flex-1">
                  <span class={`font-semibold ${severity.text}`}>
                    Energy Debt ({severity.label})
                  </span>
                  <span class={`text-sm ${severity.text} ml-2`}>
                    {debtInfo().consecutiveLowWeeks} weeks below {threshold()}%
                  </span>
                </div>
                <button
                  type="button"
                  class="px-3 py-1 bg-white dark:bg-slate-700 rounded text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                >
                  Self-Care
                </button>
              </div>
            </div>
          );
        }}
      </Show>

      {/* Inline Comeback Alert */}
      <Show when={isComeback() && !debt()}>
        <div class="mt-4 p-3 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700">
          <div class="flex items-center gap-2">
            <span class="text-xl animate-bounce">🚀</span>
            <div class="flex-1">
              <span class="font-semibold text-green-700 dark:text-green-300">Comeback Mode!</span>
              <span class="text-sm text-green-600 dark:text-green-400 ml-2">
                Energy recovered to {currentEnergy()}%
              </span>
            </div>
            <span class="text-green-600 dark:text-green-400 text-sm">Ready to catch up</span>
          </div>
        </div>
      </Show>
    </div>
  );
}
