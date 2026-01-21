/**
 * Completed Goal Detail Modal
 *
 * Full-screen modal showing detailed information about a completed goal:
 * - Header with name, completion date, and status badge
 * - Metrics: amount, duration, hours worked
 * - Contributing missions list
 * - Mini energy graph
 */

import { Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Dynamic } from 'solid-js/web';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import {
  X,
  Trophy,
  Clock,
  Zap,
  DollarSign,
  Calendar,
  CheckCircle2,
  Briefcase,
  GraduationCap,
  Package,
  Home,
  Repeat,
} from 'lucide-solid';
import { formatCurrency, formatDate, type Currency } from '~/lib/dateUtils';
import { cn } from '~/lib/cn';
import type { Goal } from '~/lib/goalService';
import type { Mission } from './MissionCard';

interface EnergyEntry {
  week: number;
  level: number;
  date: string;
}

interface CompletedGoalDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  goal: Goal;
  missions: Mission[];
  energyHistory: EnergyEntry[];
  currency: Currency;
  timeTakenWeeks: number;
  avgEnergy: number | null;
}

export function CompletedGoalDetailModal(props: CompletedGoalDetailModalProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'freelance':
        return Briefcase;
      case 'tutoring':
        return GraduationCap;
      case 'selling':
        return Package;
      case 'lifestyle':
        return Home;
      case 'trade':
        return Repeat;
      default:
        return Briefcase;
    }
  };

  const getEnergyColor = (level: number) => {
    if (level >= 70) return 'bg-green-500';
    if (level >= 50) return 'bg-yellow-500';
    if (level >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const totalHoursWorked = () => props.missions.reduce((sum, m) => sum + m.hoursCompleted, 0);

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div
          class="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) props.onClose();
          }}
        >
          <div class="bg-card dark:bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl scale-100 animate-in zoom-in-95 duration-200 flex flex-col">
            {/* Header */}
            <div class="p-6 border-b border-border bg-gradient-to-r from-green-500/10 to-green-500/5 flex-shrink-0">
              <div class="flex items-start justify-between">
                <div class="flex items-center gap-4">
                  <div class="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center">
                    <Trophy class="h-7 w-7 text-green-500" />
                  </div>
                  <div>
                    <h2 class="text-xl font-bold text-foreground">{props.goal.name}</h2>
                    <div class="flex items-center gap-3 mt-1">
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs font-medium rounded-full">
                        <CheckCircle2 class="h-3 w-3" />
                        Completed
                      </span>
                      <Show when={props.goal.updatedAt}>
                        <span class="text-sm text-muted-foreground flex items-center gap-1">
                          <Calendar class="h-3.5 w-3.5" />
                          {formatDate(props.goal.updatedAt!)}
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" class="h-8 w-8 p-0" onClick={props.onClose}>
                  <X class="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Scrollable content */}
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Key Metrics */}
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card class="bg-muted/50">
                  <CardContent class="p-4 text-center">
                    <DollarSign class="h-5 w-5 text-green-500 mx-auto mb-2" />
                    <div class="text-lg font-bold text-foreground">
                      {formatCurrency(props.goal.amount, props.currency)}
                    </div>
                    <div class="text-xs text-muted-foreground">Goal Amount</div>
                  </CardContent>
                </Card>

                <Card class="bg-muted/50">
                  <CardContent class="p-4 text-center">
                    <Clock class="h-5 w-5 text-blue-500 mx-auto mb-2" />
                    <div class="text-lg font-bold text-foreground">
                      {props.timeTakenWeeks} week{props.timeTakenWeeks !== 1 ? 's' : ''}
                    </div>
                    <div class="text-xs text-muted-foreground">Duration</div>
                  </CardContent>
                </Card>

                <Card class="bg-muted/50">
                  <CardContent class="p-4 text-center">
                    <Briefcase class="h-5 w-5 text-purple-500 mx-auto mb-2" />
                    <div class="text-lg font-bold text-foreground">{totalHoursWorked()}h</div>
                    <div class="text-xs text-muted-foreground">Hours Worked</div>
                  </CardContent>
                </Card>

                <Card class="bg-muted/50">
                  <CardContent class="p-4 text-center">
                    <Zap class="h-5 w-5 text-yellow-500 mx-auto mb-2" />
                    <div class="text-lg font-bold text-foreground">
                      {props.avgEnergy !== null ? `${props.avgEnergy}%` : 'N/A'}
                    </div>
                    <div class="text-xs text-muted-foreground">Avg Energy</div>
                  </CardContent>
                </Card>
              </div>

              {/* Energy Graph (mini) */}
              <Show when={props.energyHistory.length > 0}>
                <div>
                  <h3 class="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Zap class="h-4 w-4 text-yellow-500" />
                    Energy During Goal
                  </h3>
                  <Card>
                    <CardContent class="p-4">
                      {/* Mini bar chart */}
                      <div class="flex items-end gap-1 h-16">
                        <For each={props.energyHistory.slice(-12)}>
                          {(entry) => (
                            <div class="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                              <div
                                class={cn(
                                  'w-full rounded-t-sm transition-all hover:opacity-80',
                                  getEnergyColor(entry.level)
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
                      </div>
                      <div class="flex justify-between text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                        <span>
                          Min:{' '}
                          <strong class="text-foreground">
                            {Math.min(...props.energyHistory.map((e) => e.level))}%
                          </strong>
                        </span>
                        <span>
                          Max:{' '}
                          <strong class="text-foreground">
                            {Math.max(...props.energyHistory.map((e) => e.level))}%
                          </strong>
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </Show>

              {/* Missions List */}
              <Show when={props.missions.length > 0}>
                <div>
                  <h3 class="font-semibold text-foreground mb-3 flex items-center gap-2">
                    <CheckCircle2 class="h-4 w-4 text-green-500" />
                    Contributing Missions ({props.missions.length})
                  </h3>
                  <div class="space-y-2">
                    <For each={props.missions}>
                      {(mission) => {
                        const Icon = () => getCategoryIcon(mission.category);
                        return (
                          <Card class="bg-muted/30 border-muted">
                            <CardContent class="p-3 flex items-center gap-3">
                              <div class="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground flex-shrink-0">
                                <Dynamic component={Icon()} class="h-4 w-4" />
                              </div>
                              <div class="flex-1 min-w-0">
                                <div class="font-medium text-foreground text-sm truncate">
                                  {mission.title}
                                </div>
                                <div class="text-xs text-muted-foreground">
                                  {mission.hoursCompleted}h •{' '}
                                  {formatCurrency(mission.earningsCollected, props.currency)}
                                </div>
                              </div>
                              <span
                                class={cn(
                                  'px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-full flex-shrink-0',
                                  mission.status === 'completed'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                    : mission.status === 'skipped'
                                      ? 'bg-muted text-muted-foreground'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                )}
                              >
                                {mission.status}
                              </span>
                            </CardContent>
                          </Card>
                        );
                      }}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Empty state for missions */}
              <Show when={props.missions.length === 0}>
                <div class="text-center py-8 text-muted-foreground">
                  <Briefcase class="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No missions recorded for this goal period</p>
                </div>
              </Show>
            </div>

            {/* Footer */}
            <div class="p-4 border-t border-border bg-muted/30 flex-shrink-0">
              <Button class="w-full" onClick={props.onClose}>
                Close
              </Button>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
