/**
 * Energy History Component (Compact)
 *
 * 2-column layout: Current energy + emoji input | Inline mini-bars + stats
 * Integrates Energy Debt alerts inline.
 */

import { For, Show, createMemo } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Smile,
  Meh,
  Frown,
} from 'lucide-solid';
import { cn } from '~/lib/cn';

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
    if (level >= 80) return '😄';
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
    <Card>
      <CardContent class="p-6">
        <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap class="h-5 w-5 text-yellow-500 fill-yellow-500" /> Energy
        </h3>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column: Current Energy + Emoji Input */}
          <div class="space-y-4">
            {/* Current energy display */}
            <div class="flex items-center gap-4">
              <div class="flex-1">
                <div class="flex items-baseline gap-2">
                  <span class="text-3xl font-bold text-foreground">{currentEnergy()}%</span>
                  <span class="text-sm text-muted-foreground">current</span>
                </div>
                <div class="h-2.5 bg-secondary rounded-full overflow-hidden mt-2">
                  <div
                    class={cn(
                      'h-full transition-all duration-500',
                      getEnergyColor(currentEnergy())
                    )}
                    style={{ width: `${currentEnergy()}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Emoji input */}
            <div class="bg-muted/50 rounded-xl p-3">
              <p class="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                How are you this week?
              </p>
              <div class="flex gap-2">
                <For
                  each={[
                    { emoji: '😴', level: 20 },
                    { emoji: '😔', level: 40 },
                    { emoji: '😐', level: 60 },
                    { emoji: '😊', level: 80 },
                    { emoji: '😄', level: 100 },
                  ]}
                >
                  {(option) => (
                    <Button
                      variant="ghost"
                      class={cn(
                        'flex-1 h-12 text-2xl hover:scale-110 transition-transform',
                        currentEnergy() >= option.level - 10 && currentEnergy() < option.level + 10
                          ? 'bg-primary/20 ring-2 ring-primary'
                          : 'bg-background hover:bg-muted'
                      )}
                      onClick={() =>
                        props.onEnergyUpdate?.(
                          props.history.length > 0
                            ? props.history[props.history.length - 1].week
                            : 1,
                          option.level
                        )
                      }
                    >
                      {option.emoji}
                    </Button>
                  )}
                </For>
              </div>
            </div>
          </div>

          {/* Right Column: Inline mini-bars + stats */}
          <div class="space-y-4">
            {/* Mini bar chart */}
            <div class="flex items-end gap-1 h-20 pt-2">
              <For each={props.history.slice(-8)}>
                {(entry) => (
                  <div class="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                    <div
                      class={cn(
                        'w-full rounded-t-sm transition-all hover:opacity-80',
                        getEnergyColor(entry.level),
                        entry.level < threshold() ? 'opacity-60' : ''
                      )}
                      style={{ height: `${Math.max(entry.level, 5)}%` }}
                    />
                    {/* Tooltip */}
                    <div class="absolute bottom-full mb-2 hidden group-hover:block z-10 bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-md whitespace-nowrap">
                      Week {entry.week}: {entry.level}%
                    </div>
                  </div>
                )}
              </For>
              <Show when={props.history.length === 0}>
                <div class="flex-1 text-center text-muted-foreground text-xs py-4 flex flex-col items-center justify-center h-full bg-muted/30 rounded">
                  <span class="text-xl mb-1">📉</span>
                  No data yet
                </div>
              </Show>
            </div>

            {/* Stats row */}
            <div class="flex justify-between text-xs text-muted-foreground pt-2 border-t border-border">
              <span class="flex items-center gap-1">
                Avg: <strong class="text-foreground">{averageEnergy()}%</strong>
              </span>
              <span class="flex items-center gap-1">
                Min: <strong class="text-foreground">{minEnergy()}%</strong>
              </span>
              <span class="text-destructive flex items-center gap-1">
                Threshold: {threshold()}%
              </span>
            </div>
          </div>
        </div>

        {/* Inline Energy Debt Alert */}
        <Show when={debt()}>
          {(debtInfo) => {
            const severity = getSeverityClasses(debtInfo().severity);
            return (
              <div
                class={cn(
                  'mt-6 p-4 rounded-lg border flex items-center gap-3',
                  severity.bg,
                  severity.border
                )}
              >
                <div class={cn('p-2 rounded-full bg-white/50 dark:bg-black/20', severity.text)}>
                  <AlertTriangle class="h-5 w-5" />
                </div>
                <div class="flex-1">
                  <div class="flex items-center gap-2">
                    <span class={cn('font-bold', severity.text)}>
                      Energy Debt ({severity.label})
                    </span>
                  </div>
                  <span class={cn('text-sm block mt-0.5', severity.text)}>
                    {debtInfo().consecutiveLowWeeks} weeks below {threshold()}%
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  class={cn(
                    'bg-background/50 border-transparent hover:bg-background/80',
                    severity.text
                  )}
                >
                  Self-Care
                </Button>
              </div>
            );
          }}
        </Show>

        {/* Inline Comeback Alert */}
        <Show when={isComeback() && !debt()}>
          <div class="mt-6 p-4 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 flex items-center gap-3">
            <div class="p-2 rounded-full bg-green-200/50 dark:bg-green-800/50 text-green-700 dark:text-green-300">
              <Zap class="h-5 w-5 animate-pulse" />
            </div>
            <div class="flex-1">
              <span class="font-bold text-green-800 dark:text-green-200">Comeback Mode!</span>
              <span class="text-sm text-green-700 dark:text-green-300 block mt-0.5">
                Energy recovered to {currentEnergy()}%
              </span>
            </div>
            <span class="text-green-700 dark:text-green-300 text-sm font-medium">
              Ready to catch up
            </span>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
