/**
 * Retroplan Panel Component
 *
 * Displays capacity-aware retroplanning data for a goal.
 * Shows week-by-week capacity, feasibility score, and risk factors.
 */

import { createSignal, createEffect, createMemo, For, Show } from 'solid-js';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { getCurrentWeekInfo } from '~/lib/weekCalculator';
import { cn } from '~/lib/cn';
import { Button } from '~/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Zap,
  Shield,
  TrendingUp,
  RefreshCw,
  X,
} from 'lucide-solid';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { createLogger } from '~/lib/logger';

const logger = createLogger('RetroplanPanel');

interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
  academicMultiplier: number;
  energyMultiplier: number;
}

interface DynamicMilestone {
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
  milestones: DynamicMilestone[];
  totalWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  frontLoadedPercentage: number;
  riskFactors: string[];
}

interface AcademicEvent {
  id: string;
  type:
    | 'exam_period'
    | 'class_intensive'
    | 'vacation'
    | 'vacation_rest'
    | 'vacation_available'
    | 'internship'
    | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
}

interface RetroplanPanelProps {
  goalId: string;
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  userId?: string;
  currency?: Currency;
  academicEvents?: AcademicEvent[];
  /** Hourly rate for earnings calculations (from profile.minHourlyRate) */
  hourlyRate?: number;
  /** Sprint 13: Simulated date for testing (defaults to current date) */
  simulatedDate?: Date;
  /** Sprint 13.7: Monthly net margin (income - expenses) for feasibility */
  monthlyMargin?: number;
  onClose?: () => void;
}

const CAPACITY_COLORS = {
  high: 'bg-green-500',
  medium: 'bg-yellow-500',
  low: 'bg-orange-500',
  protected: 'bg-red-500',
};

const CAPACITY_BG_COLORS = {
  high: 'bg-green-500/10',
  medium: 'bg-yellow-500/10',
  low: 'bg-orange-500/10',
  protected: 'bg-red-500/10',
};

const CAPACITY_TEXT_COLORS = {
  high: 'text-green-600 dark:text-green-400',
  medium: 'text-yellow-600 dark:text-yellow-400',
  low: 'text-orange-600 dark:text-orange-400',
  protected: 'text-red-600 dark:text-red-400',
};

const CAPACITY_LABELS = {
  high: 'High capacity',
  medium: 'Medium capacity',
  low: 'Low capacity',
  protected: 'Protected (exams)',
};

export function RetroplanPanel(props: RetroplanPanelProps) {
  const [retroplan, setRetroplan] = createSignal<Retroplan | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const currency = () => props.currency || 'USD';

  // Sprint 13: Calculate current week number from simulated date
  const currentWeekNumber = createMemo(() => {
    const plan = retroplan();
    if (!plan?.milestones?.length) return 0;

    // Get start date from first milestone
    const startDate = plan.milestones[0]?.capacity.weekStartDate;
    if (!startDate) return 0;

    const weekInfo = getCurrentWeekInfo(startDate, plan.milestones.length, props.simulatedDate);
    return weekInfo.weekNumber;
  });

  // Fetch or generate retroplan
  // Always regenerate to ensure latest goal parameters and academic events are used
  const fetchRetroplan = async (forceRegenerate = false) => {
    setLoading(true);
    setError(null);

    try {
      // If not forcing regeneration, try to get existing retroplan
      if (!forceRegenerate) {
        const getResponse = await fetch('/api/retroplan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_retroplan',
            goalId: props.goalId,
            userId: props.userId || 'default',
          }),
        });

        if (getResponse.ok) {
          const data = await getResponse.json();
          if (data.retroplan) {
            setRetroplan(data.retroplan);
            return;
          }
        }
      }

      // Generate new retroplan (always when forceRegenerate=true or when not found)
      const genResponse = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_retroplan',
          goalId: props.goalId,
          goalAmount: props.goalAmount,
          deadline: props.goalDeadline,
          userId: props.userId || 'default',
          // Pass academic events for protected weeks calculation
          academicEvents: props.academicEvents || [],
          // Pass hourlyRate from profile for consistent feasibility calculations
          hourlyRate: props.hourlyRate,
          // Sprint 13.7: Pass monthly margin for combined feasibility calculation
          monthlyMargin: props.monthlyMargin,
          // Sprint 13.8 Fix: Pass simulated date for correct week calculations
          simulatedDate: props.simulatedDate?.toISOString(),
        }),
      });

      if (!genResponse.ok) {
        throw new Error('Failed to generate retroplan');
      }

      const data = await genResponse.json();
      setRetroplan(data.retroplan);
    } catch (err) {
      logger.error('Failed to fetch retroplan', { error: err });
      setError('Failed to load retroplan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load retroplan on mount and when goal parameters change
  // Always regenerate to ensure we have the latest data matching current props
  createEffect(() => {
    const goalId = props.goalId;
    const goalAmount = props.goalAmount;
    const goalDeadline = props.goalDeadline;
    // Sprint 13.8 Fix: Track simulatedDate for reactivity - re-fetch when date changes
    void (props.simulatedDate?.toISOString() || '');
    // Track academicEvents for reactivity (void to silence unused warning)
    void (props.academicEvents?.length || 0);

    if (goalId && goalAmount && goalDeadline) {
      // Always regenerate - the backend retroplan might have been generated with different params
      // This ensures the displayed data always matches the current goal configuration
      fetchRetroplan(true);
    }
  });

  // Calculate feasibility color
  const getFeasibilityColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.6) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 0.4) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getFeasibilityLabel = (score: number) => {
    if (score >= 0.8) return 'Very achievable';
    if (score >= 0.6) return 'Achievable';
    if (score >= 0.4) return 'Challenging';
    return 'Very challenging';
  };

  return (
    <Card class="border-primary/20">
      <CardHeader class="pb-4">
        <div class="flex items-center justify-between">
          <CardTitle class="flex items-center gap-2">
            <Calendar class="h-5 w-5 text-primary" />
            Capacity Retroplan
          </CardTitle>
          <div class="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              onClick={() => fetchRetroplan(true)}
              disabled={loading()}
              title="Refresh retroplan (force regenerate)"
            >
              <RefreshCw class={`h-4 w-4 ${loading() ? 'animate-spin' : ''}`} />
            </Button>
            <Show when={props.onClose}>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                onClick={props.onClose}
                title="Close"
              >
                <X class="h-4 w-4" />
              </Button>
            </Show>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-6">
        {/* Loading State */}
        <Show when={loading()}>
          <div class="flex items-center justify-center py-8">
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </Show>

        {/* Error State */}
        <Show when={error()}>
          <div class="text-center py-8">
            <AlertTriangle class="h-8 w-8 text-destructive mx-auto mb-2" />
            <p class="text-sm text-muted-foreground">{error()}</p>
            <Button variant="outline" size="sm" class="mt-4" onClick={() => fetchRetroplan(true)}>
              Try again
            </Button>
          </div>
        </Show>

        {/* Retroplan Content */}
        <Show when={retroplan() && !loading()}>
          {/* Summary Stats */}
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Feasibility Score */}
            <div class="text-center p-3 rounded-lg bg-muted/50">
              <div class="flex items-center justify-center gap-1 mb-1">
                <CheckCircle2
                  class={`h-4 w-4 ${getFeasibilityColor(retroplan()!.feasibilityScore)}`}
                />
                <span class="text-xs text-muted-foreground">Feasibility</span>
              </div>
              <div
                class={`text-2xl font-bold ${getFeasibilityColor(retroplan()!.feasibilityScore)}`}
              >
                {Math.round(retroplan()!.feasibilityScore * 100)}%
              </div>
              <div class="text-xs text-muted-foreground">
                {getFeasibilityLabel(retroplan()!.feasibilityScore)}
              </div>
            </div>

            {/* Front-loaded Percentage */}
            <div class="text-center p-3 rounded-lg bg-muted/50">
              <div class="flex items-center justify-center gap-1 mb-1">
                <TrendingUp class="h-4 w-4 text-blue-500" />
                <span class="text-xs text-muted-foreground">Front-loaded</span>
              </div>
              <div class="text-2xl font-bold text-foreground">
                {Math.round(retroplan()!.frontLoadedPercentage)}%
              </div>
              <div class="text-xs text-muted-foreground">in first half</div>
            </div>

            {/* Total Weeks */}
            <div class="text-center p-3 rounded-lg bg-muted/50">
              <div class="flex items-center justify-center gap-1 mb-1">
                <Calendar class="h-4 w-4 text-primary" />
                <span class="text-xs text-muted-foreground">Timeline</span>
              </div>
              <div class="text-2xl font-bold text-foreground">{retroplan()!.totalWeeks}</div>
              <div class="text-xs text-muted-foreground">weeks total</div>
            </div>

            {/* Protected Weeks */}
            <div class="text-center p-3 rounded-lg bg-muted/50">
              <div class="flex items-center justify-center gap-1 mb-1">
                <Shield class="h-4 w-4 text-red-500" />
                <span class="text-xs text-muted-foreground">Protected</span>
              </div>
              <div class="text-2xl font-bold text-foreground">{retroplan()!.protectedWeeks}</div>
              <div class="text-xs text-muted-foreground">weeks (exams)</div>
            </div>
          </div>

          {/* Capacity Legend */}
          <div class="flex flex-wrap gap-3 justify-center text-xs">
            <For each={Object.entries(CAPACITY_LABELS)}>
              {([key, label]) => (
                <div class="flex items-center gap-1.5">
                  <div
                    class={`w-3 h-3 rounded-full ${CAPACITY_COLORS[key as keyof typeof CAPACITY_COLORS]}`}
                  />
                  <span class="text-muted-foreground">{label}</span>
                </div>
              )}
            </For>
          </div>

          {/* Week-by-week Capacity Timeline */}
          <div class="space-y-2">
            <h4 class="text-sm font-medium text-foreground">Weekly Capacity</h4>
            <div class="flex gap-1 overflow-x-auto pb-2">
              <For each={retroplan()!.milestones}>
                {(milestone) => {
                  const isCurrentWeek = milestone.weekNumber === currentWeekNumber();
                  return (
                    <Tooltip>
                      <TooltipTrigger>
                        <div
                          class={cn(
                            'flex flex-col items-center min-w-[36px] relative',
                            isCurrentWeek && 'pt-4'
                          )}
                        >
                          {/* Sprint 13: Mascot for current week */}
                          {isCurrentWeek && (
                            <span class="absolute -top-0 text-sm animate-bounce-slow">🚶</span>
                          )}
                          <div
                            class={cn(
                              'w-7 rounded-t-md',
                              CAPACITY_COLORS[milestone.capacity.capacityCategory],
                              isCurrentWeek && 'ring-2 ring-green-500 ring-offset-1'
                            )}
                            style={{
                              height: `${Math.max(20, milestone.capacity.capacityScore * 0.8)}px`,
                            }}
                          />
                          <div
                            class={cn(
                              'text-[10px] mt-1',
                              isCurrentWeek
                                ? 'font-bold text-green-600 dark:text-green-400'
                                : 'text-muted-foreground'
                            )}
                          >
                            W{milestone.weekNumber}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div class="text-xs space-y-1">
                          <div class="font-medium">
                            Week {milestone.weekNumber}
                            {isCurrentWeek && ' (current)'}
                          </div>
                          <div>{CAPACITY_LABELS[milestone.capacity.capacityCategory]}</div>
                          <div>{milestone.capacity.effectiveHours}h available</div>
                          <div>Target: {formatCurrency(milestone.adjustedTarget, currency())}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                }}
              </For>
            </div>
          </div>

          {/* Milestones Table */}
          <div class="space-y-2">
            <h4 class="text-sm font-medium text-foreground">Weekly Targets</h4>
            <div class="max-h-48 overflow-y-auto rounded-lg border border-border">
              <table class="w-full text-sm">
                <thead class="bg-muted/50 sticky top-0">
                  <tr>
                    <th class="text-left p-2 font-medium">Week</th>
                    <th class="text-left p-2 font-medium">Capacity</th>
                    <th class="text-right p-2 font-medium">Target</th>
                    <th class="text-right p-2 font-medium">Cumulative</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={retroplan()!.milestones}>
                    {(milestone) => {
                      const isCurrentWeek = milestone.weekNumber === currentWeekNumber();
                      return (
                        <tr
                          class={cn(
                            'border-t border-border hover:bg-muted/30',
                            isCurrentWeek && 'bg-green-500/10 ring-1 ring-inset ring-green-500/30'
                          )}
                        >
                          <td class="p-2">
                            <span
                              class={cn(
                                'font-medium',
                                isCurrentWeek && 'text-green-600 dark:text-green-400'
                              )}
                            >
                              {isCurrentWeek && '🚶 '}W{milestone.weekNumber}
                            </span>
                            <span class="text-xs text-muted-foreground ml-1">
                              {new Date(milestone.capacity.weekStartDate).toLocaleDateString(
                                'en-US',
                                { month: 'short', day: 'numeric' }
                              )}
                            </span>
                          </td>
                          <td class="p-2">
                            <span
                              class={`px-2 py-0.5 rounded-full text-xs ${CAPACITY_BG_COLORS[milestone.capacity.capacityCategory]} ${CAPACITY_TEXT_COLORS[milestone.capacity.capacityCategory]}`}
                            >
                              {milestone.capacity.capacityCategory.toUpperCase()}
                            </span>
                          </td>
                          <td class="p-2 text-right font-mono">
                            {formatCurrency(milestone.adjustedTarget, currency())}
                          </td>
                          <td class="p-2 text-right font-mono text-muted-foreground">
                            {formatCurrency(milestone.cumulativeTarget, currency())}
                          </td>
                        </tr>
                      );
                    }}
                  </For>
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk Factors */}
          <Show when={retroplan()!.riskFactors.length > 0}>
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-foreground flex items-center gap-2">
                <AlertTriangle class="h-4 w-4 text-amber-500" />
                Risk Factors
              </h4>
              <ul class="space-y-1">
                <For each={retroplan()!.riskFactors}>
                  {(risk) => (
                    <li class="text-sm text-muted-foreground flex items-start gap-2">
                      <Zap class="h-3 w-3 text-amber-500 mt-1 shrink-0" />
                      {risk}
                    </li>
                  )}
                </For>
              </ul>
            </div>
          </Show>

          {/* Capacity Breakdown */}
          <div class="grid grid-cols-4 gap-2 text-center text-xs">
            <div class={`p-2 rounded-lg ${CAPACITY_BG_COLORS.high}`}>
              <div class={`font-bold text-lg ${CAPACITY_TEXT_COLORS.high}`}>
                {retroplan()!.highCapacityWeeks}
              </div>
              <div class="text-muted-foreground">High</div>
            </div>
            <div class={`p-2 rounded-lg ${CAPACITY_BG_COLORS.medium}`}>
              <div class={`font-bold text-lg ${CAPACITY_TEXT_COLORS.medium}`}>
                {retroplan()!.mediumCapacityWeeks}
              </div>
              <div class="text-muted-foreground">Medium</div>
            </div>
            <div class={`p-2 rounded-lg ${CAPACITY_BG_COLORS.low}`}>
              <div class={`font-bold text-lg ${CAPACITY_TEXT_COLORS.low}`}>
                {retroplan()!.lowCapacityWeeks}
              </div>
              <div class="text-muted-foreground">Low</div>
            </div>
            <div class={`p-2 rounded-lg ${CAPACITY_BG_COLORS.protected}`}>
              <div class={`font-bold text-lg ${CAPACITY_TEXT_COLORS.protected}`}>
                {retroplan()!.protectedWeeks}
              </div>
              <div class="text-muted-foreground">Protected</div>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}

export default RetroplanPanel;
