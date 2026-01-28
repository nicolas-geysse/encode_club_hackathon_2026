/**
 * Goal Timeline Component
 *
 * Visualizes goal progress, components, and dependencies.
 * Shows timeline from creation to deadline with progress milestones.
 */

import { createMemo, Show, For, createSignal, createEffect } from 'solid-js';
import { type Goal, type GoalComponent, goalService } from '~/lib/goalService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui/Tooltip';
import {
  Pencil,
  Check,
  Trash2,
  RotateCcw,
  Zap,
  TrendingUp,
  Shield,
  CheckCircle2,
} from 'lucide-solid';
import { GoalComponentsList } from './GoalComponentsList';

interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected' | 'boosted';
  effectiveHours: number;
  events?: Array<{ name: string; type: string }>;
}

interface DynamicMilestone {
  weekNumber: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: WeekCapacity;
}

interface RetroplanSummary {
  totalWeeks: number;
  boostedWeeks: number;
  highCapacityWeeks: number;
  mediumCapacityWeeks: number;
  lowCapacityWeeks: number;
  protectedWeeks: number;
  feasibilityScore: number;
  milestones: DynamicMilestone[];
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

interface GoalTimelineProps {
  goal: Goal;
  currency?: Currency;
  // BUG 8 FIX: Accept simulated date for time simulation
  simulatedDate?: Date;
  /** Academic events for protected weeks calculation */
  academicEvents?: AcademicEvent[];
  /** Hourly rate for earnings calculations (from profile.minHourlyRate) */
  hourlyRate?: number;
  /** Sprint 13.7: Monthly net margin (income - expenses) for feasibility */
  monthlyMargin?: number;
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goalId: string) => void;
  onToggleStatus?: (goal: Goal) => void;
}

const CAPACITY_COLORS = {
  boosted: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-600 dark:text-cyan-400',
    border: 'border-cyan-500/30',
    icon: '🚀',
    label: 'Boosted',
  },
  high: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/30',
    icon: '🟢',
    label: 'High',
  },
  medium: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/30',
    icon: '🟡',
    label: 'Medium',
  },
  low: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/30',
    icon: '🟠',
    label: 'Low',
  },
  protected: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/30',
    icon: '🔴',
    label: 'Protected',
  },
};

export function GoalTimeline(props: GoalTimelineProps) {
  const currency = () => props.currency || 'USD';
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = createSignal(false);
  const [retroplan, setRetroplan] = createSignal<RetroplanSummary | null>(null);
  const [loadingRetroplan, setLoadingRetroplan] = createSignal(false);
  const [showAllWeeks, setShowAllWeeks] = createSignal(false);

  // Fetch full retroplan for active goals (always regenerate to ensure fresh data)
  createEffect(() => {
    const goalId = props.goal.id;
    const status = props.goal.status;
    const deadline = props.goal.deadline;
    const amount = props.goal.amount;
    // Sprint 13.8 Fix: Track simulatedDate for reactivity - re-fetch when date changes
    const simDate = props.simulatedDate;
    // Track academicEvents for reactivity
    void (props.academicEvents?.length || 0);

    if (status === 'active' && deadline && amount) {
      setLoadingRetroplan(true);
      fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_retroplan',
          goalId,
          goalAmount: amount,
          deadline,
          academicEvents: props.academicEvents || [],
          // Pass hourlyRate from profile for consistent feasibility calculations
          hourlyRate: props.hourlyRate,
          // Sprint 13.7: Pass monthly margin for combined feasibility calculation
          monthlyMargin: props.monthlyMargin,
          // Sprint 13.8 Fix: Pass simulated date and goal start date for correct week calculations
          simulatedDate: simDate?.toISOString(),
          goalStartDate: props.goal.createdAt,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.retroplan) setRetroplan(data.retroplan);
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => setLoadingRetroplan(false));
    }
  });

  // Get current week's capacity from retroplan
  const currentWeekCapacity = createMemo(() => {
    const plan = retroplan();
    if (!plan?.milestones?.length) return null;
    // Return first milestone (current week)
    return plan.milestones[0]?.capacity || null;
  });

  // BUG 8 FIX: Use simulated date if provided for time calculations
  const currentDate = createMemo(() => props.simulatedDate || new Date());

  // Calculate days remaining
  const daysRemaining = createMemo(() => {
    if (!props.goal.deadline) return null;
    const deadline = new Date(props.goal.deadline);
    const now = currentDate();
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  });

  // Calculate total cost from components (reserved for future summary display)
  const _totalCost = createMemo(() => goalService.calculateGoalTotalCost(props.goal));
  void _totalCost;

  // Calculate total hours from components (reserved for future summary display)
  const _totalHours = createMemo(() => goalService.calculateGoalTotalHours(props.goal));
  void _totalHours;

  // Calculate component progress (reserved for future timeline visualization)
  const _componentProgress = createMemo(() => goalService.calculateComponentProgress(props.goal));
  void _componentProgress;

  // Calculate timeline progress percentage
  // BUG 8 FIX: Use simulated date for timeline progress
  const timelineProgress = createMemo(() => {
    if (!props.goal.deadline || !props.goal.createdAt) return 0;

    const start = new Date(props.goal.createdAt).getTime();
    const end = new Date(props.goal.deadline).getTime();
    const now = currentDate().getTime();

    if (now >= end) return 100;
    if (now <= start) return 0;

    return Math.round(((now - start) / (end - start)) * 100);
  });

  // Format deadline with day name
  const formattedDeadline = createMemo(() => {
    if (!props.goal.deadline) return null;
    return new Date(props.goal.deadline).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  });

  // Get status badge color
  const getGoalStatusColor = (status: Goal['status']) => {
    switch (status) {
      case 'active':
        return 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300';
      case 'waiting':
        return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
      case 'completed':
        return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300';
      case 'paused':
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
      default:
        return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400';
    }
  };

  // Deadline urgency color
  const getDeadlineColor = () => {
    const days = daysRemaining();
    if (days === null) return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
    if (days <= 0) return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
    if (days <= 7) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
    return 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300';
  };

  return (
    <div class={`card ${props.goal.status === 'completed' ? 'opacity-70' : ''}`}>
      {/* Header Row */}
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <span class="text-2xl">
            {props.goal.status === 'completed'
              ? '✅'
              : props.goal.status === 'waiting'
                ? '⏳'
                : props.goal.status === 'paused'
                  ? '📦'
                  : '🎯'}
          </span>
          <div>
            <h3
              class={`text-lg font-bold ${props.goal.status === 'completed' ? 'line-through text-slate-500' : 'text-slate-900 dark:text-slate-100'}`}
            >
              {props.goal.name}
            </h3>
            <span
              class={`inline-block px-2 py-0.5 text-xs font-medium rounded-full mt-1 ${getGoalStatusColor(props.goal.status)}`}
            >
              {props.goal.status.charAt(0).toUpperCase() + props.goal.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div class="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                class="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                onClick={() => props.onEdit?.(props.goal)}
              >
                <Pencil class="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Edit Goal</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                class={`h-8 w-8 flex items-center justify-center rounded-md transition-colors ${
                  props.goal.status === 'completed' || props.goal.status === 'paused'
                    ? 'text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                    : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                }`}
                onClick={() => setShowCompleteConfirm(true)}
              >
                <Show
                  when={props.goal.status === 'completed' || props.goal.status === 'paused'}
                  fallback={<Check class="h-4 w-4" />}
                >
                  <RotateCcw class="h-4 w-4" />
                </Show>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {props.goal.status === 'completed' || props.goal.status === 'paused'
                ? 'Reactivate Goal'
                : 'Mark as Completed'}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger>
              <button
                type="button"
                class="h-8 w-8 flex items-center justify-center rounded-md text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Delete Goal</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div class="grid grid-cols-3 gap-4 mb-4">
        {/* Amount */}
        <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Target
          </p>
          <p class="text-xl font-bold text-slate-900 dark:text-slate-100">
            {formatCurrency(props.goal.amount, currency())}
          </p>
        </div>

        {/* Deadline - More prominent */}
        <div class={`rounded-lg p-3 text-center ${getDeadlineColor()}`}>
          <p class="text-xs uppercase tracking-wider mb-1 opacity-80">Deadline</p>
          <Show when={props.goal.deadline} fallback={<p class="text-lg font-bold">Not set</p>}>
            <p class="text-lg font-bold">{formattedDeadline()}</p>
            <p class="text-sm font-medium mt-0.5">
              {daysRemaining() !== null && daysRemaining()! > 0
                ? `${daysRemaining()} days left`
                : daysRemaining() === 0
                  ? 'Due today!'
                  : `${Math.abs(daysRemaining()!)} days overdue`}
            </p>
          </Show>
        </div>

        {/* Progress */}
        <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
          <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
            Progress
          </p>
          <p class="text-xl font-bold text-primary-600 dark:text-primary-400">
            {props.goal.progress || 0}%
          </p>
        </div>
      </div>

      {/* Inline Retroplan Stats (for active goals) */}
      <Show when={props.goal.status === 'active' && props.goal.deadline}>
        <div class="mb-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
          {/* Loading state */}
          <Show when={loadingRetroplan() && !retroplan()}>
            <div class="flex items-center justify-center py-4">
              <div class="animate-spin w-5 h-5 border-2 border-primary border-t-transparent rounded-full" />
              <span class="ml-2 text-sm text-muted-foreground">Calculating plan...</span>
            </div>
          </Show>

          {/* Retroplan data */}
          <Show when={retroplan()}>
            {(plan) => {
              const feasibility = plan().feasibilityScore;
              const feasibilityColor =
                feasibility >= 0.8
                  ? 'text-green-600 dark:text-green-400'
                  : feasibility >= 0.6
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : feasibility >= 0.4
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-red-600 dark:text-red-400';
              const feasibilityLabel =
                feasibility >= 0.8
                  ? 'Very achievable'
                  : feasibility >= 0.6
                    ? 'Achievable'
                    : feasibility >= 0.4
                      ? 'Challenging'
                      : 'Very challenging';

              // Helper to format week date range
              const formatWeekRange = (startDate: string) => {
                const start = new Date(startDate);
                const end = new Date(start);
                end.setDate(end.getDate() + 6);
                const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
                return `${start.toLocaleDateString('en-US', opts)} - ${end.toLocaleDateString('en-US', opts)}`;
              };

              // Weeks to display (first 4 by default, all if expanded)
              const displayedWeeks = () =>
                showAllWeeks() ? plan().milestones : plan().milestones.slice(0, 4);

              return (
                <>
                  {/* Header: Feasibility score + summary badges */}
                  <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div class="flex items-center gap-2">
                      <CheckCircle2 class={`h-5 w-5 ${feasibilityColor}`} />
                      <span class={`text-lg font-bold ${feasibilityColor}`}>
                        {Math.round(feasibility * 100)}%
                      </span>
                      <span class="text-sm text-muted-foreground">{feasibilityLabel}</span>
                    </div>
                    <div class="flex flex-wrap gap-1.5 text-xs">
                      <Show when={plan().boostedWeeks > 0}>
                        <span class="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                          🚀 {plan().boostedWeeks}
                        </span>
                      </Show>
                      <span class="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                        🟢 {plan().highCapacityWeeks}
                      </span>
                      <Show when={plan().mediumCapacityWeeks > 0}>
                        <span class="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                          🟡 {plan().mediumCapacityWeeks}
                        </span>
                      </Show>
                      <Show when={plan().lowCapacityWeeks > 0}>
                        <span class="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400">
                          🟠 {plan().lowCapacityWeeks}
                        </span>
                      </Show>
                      <Show when={plan().protectedWeeks > 0}>
                        <span class="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                          🔴 {plan().protectedWeeks}
                        </span>
                      </Show>
                    </div>
                  </div>

                  {/* Week-by-week breakdown */}
                  <div class="space-y-2">
                    <For each={displayedWeeks()}>
                      {(milestone, index) => {
                        const cat = milestone.capacity.capacityCategory;
                        const colors = CAPACITY_COLORS[cat];
                        const isCurrentWeek = index() === 0;
                        const events = milestone.capacity.events || [];

                        return (
                          <div
                            class={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
                              isCurrentWeek
                                ? `${colors.bg} ${colors.border} border-2`
                                : 'bg-background border-border'
                            }`}
                          >
                            {/* Status icon */}
                            <span class="text-lg flex-shrink-0" title={colors.label}>
                              {colors.icon}
                            </span>

                            {/* Week info */}
                            <div class="flex-1 min-w-0">
                              <div class="flex items-center gap-2 flex-wrap">
                                <span
                                  class={`font-medium ${isCurrentWeek ? colors.text : 'text-foreground'}`}
                                >
                                  W{milestone.weekNumber}
                                </span>
                                <span class="text-xs text-muted-foreground">
                                  {formatWeekRange(milestone.capacity.weekStartDate)}
                                </span>
                                {isCurrentWeek && (
                                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                                    NOW
                                  </span>
                                )}
                              </div>
                              {/* Events affecting this week */}
                              <Show when={events.length > 0}>
                                <div class="flex flex-wrap gap-1 mt-1">
                                  <For each={events}>
                                    {(event) => (
                                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                        {event.name}
                                      </span>
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </div>

                            {/* Capacity & Target */}
                            <div class="text-right flex-shrink-0">
                              <div class={`text-sm font-bold ${colors.text}`}>
                                {milestone.capacity.effectiveHours}h
                              </div>
                              <div class="text-xs text-muted-foreground">
                                {formatCurrency(milestone.adjustedTarget, currency())}
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                  </div>

                  {/* Show more/less button */}
                  <Show when={plan().totalWeeks > 4}>
                    <button
                      type="button"
                      class="mt-3 w-full text-center text-xs text-primary hover:text-primary/80 font-medium py-1"
                      onClick={() => setShowAllWeeks(!showAllWeeks())}
                    >
                      {showAllWeeks() ? `Show less ▲` : `Show all ${plan().totalWeeks} weeks ▼`}
                    </button>
                  </Show>

                  {/* Legend */}
                  <div class="mt-3 pt-3 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                    <span>🚀 Vacation (available)</span>
                    <span>🟢 Normal</span>
                    <span>🟡 Medium</span>
                    <span>🟠 Busy</span>
                    <span>🔴 Protected/Rest</span>
                  </div>
                </>
              );
            }}
          </Show>

          {/* No retroplan yet */}
          <Show when={!loadingRetroplan() && !retroplan()}>
            <div class="text-center py-2 text-sm text-muted-foreground">
              Set a deadline to see your capacity plan
            </div>
          </Show>
        </div>
      </Show>

      {/* Progress Bar */}
      <div class="mb-4">
        <div class="h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500"
            style={{ width: `${props.goal.progress || 0}%` }}
          />
        </div>
      </div>

      {/* Time Elapsed Bar */}
      <Show when={props.goal.deadline}>
        <div class="mb-4">
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Time elapsed</span>
            <span
              class={
                timelineProgress() > (props.goal.progress || 0)
                  ? 'text-amber-600'
                  : 'text-green-600'
              }
            >
              {timelineProgress() > (props.goal.progress || 0)
                ? '⚠️ Behind schedule'
                : '✓ On track'}
            </span>
          </div>
          <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
            <div
              class={`h-full transition-all duration-500 ${
                timelineProgress() > (props.goal.progress || 0) ? 'bg-amber-500' : 'bg-green-500'
              }`}
              style={{ width: `${timelineProgress()}%` }}
            />
          </div>
        </div>
      </Show>

      {/* Components Section - Using GoalComponentsList for interactive management */}
      <div class="border-t border-slate-200 dark:border-slate-600 pt-4">
        <GoalComponentsList
          goalId={props.goal.id}
          currency={currency()}
          onProgressUpdate={(_newProgress) => {
            // Trigger parent refresh when components change
            if (props.onComponentUpdate && props.goal.components?.[0]?.id) {
              props.onComponentUpdate(
                props.goal.id,
                props.goal.components[0].id,
                props.goal.components[0].status
              );
            }
          }}
        />
      </div>

      {/* Savings Summary */}
      <div class="border-t border-slate-200 dark:border-slate-600 pt-4 mt-4">
        <div class="grid grid-cols-3 gap-4 text-center">
          <div>
            <p class="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(
                Math.round((props.goal.amount * (props.goal.progress || 0)) / 100),
                currency()
              )}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Saved</p>
          </div>
          <div>
            <p class="text-lg font-bold text-slate-600 dark:text-slate-300">
              {formatCurrency(
                props.goal.amount -
                  Math.round((props.goal.amount * (props.goal.progress || 0)) / 100),
                currency()
              )}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
          </div>
          <div>
            <Show
              when={daysRemaining() !== null && daysRemaining()! > 0}
              fallback={
                <>
                  <p class="text-lg font-bold text-slate-400">-</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Per week</p>
                </>
              }
            >
              <p class="text-lg font-bold text-primary-600 dark:text-primary-400">
                {formatCurrency(
                  Math.ceil(
                    (props.goal.amount -
                      Math.round((props.goal.amount * (props.goal.progress || 0)) / 100)) /
                      Math.max(1, daysRemaining()! / 7)
                  ),
                  currency()
                )}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Per week</p>
            </Show>
          </div>
        </div>
      </div>

      {/* Conditional Goal Info */}
      <Show when={props.goal.parentGoalId}>
        <div class="mt-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
          <div class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <span>⏳</span>
            <span>This goal will activate after completing the parent goal</span>
          </div>
        </div>
      </Show>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showDeleteConfirm()}
        title="Delete Goal"
        message={`Are you sure you want to delete "${props.goal.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          props.onDelete?.(props.goal.id);
          setShowDeleteConfirm(false);
        }}
      />

      <ConfirmDialog
        isOpen={showCompleteConfirm()}
        title={
          props.goal.status === 'completed' || props.goal.status === 'paused'
            ? 'Reactivate Goal'
            : 'Complete Goal'
        }
        message={
          props.goal.status === 'completed'
            ? `Are you sure you want to reactivate "${props.goal.name}"?`
            : props.goal.status === 'paused'
              ? `Reactivating "${props.goal.name}" will archive your current active goal. Continue?`
              : `Are you sure you want to mark "${props.goal.name}" as completed?`
        }
        confirmLabel={
          props.goal.status === 'completed' || props.goal.status === 'paused'
            ? 'Reactivate'
            : 'Complete'
        }
        variant={
          props.goal.status === 'paused'
            ? 'warning'
            : props.goal.status === 'completed'
              ? 'default'
              : 'success'
        }
        onCancel={() => setShowCompleteConfirm(false)}
        onConfirm={() => {
          props.onToggleStatus?.(props.goal);
          setShowCompleteConfirm(false);
        }}
      />
    </div>
  );
}

/**
 * Goal Timeline List - Shows multiple goals with their timelines
 */
interface GoalTimelineListProps {
  goals: Goal[];
  currency?: Currency;
  // BUG 8 FIX: Accept simulated date for time simulation
  simulatedDate?: Date;
  /** Academic events for protected weeks calculation */
  academicEvents?: AcademicEvent[];
  /** Hourly rate for earnings calculations (from profile.minHourlyRate) */
  hourlyRate?: number;
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goalId: string) => void;
  onToggleStatus?: (goal: Goal) => void;
}

export function GoalTimelineList(props: GoalTimelineListProps) {
  // Sort goals: active first, then by priority, then by deadline
  const sortedGoals = createMemo(() => {
    return [...props.goals].sort((a, b) => {
      // Active goals first
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;

      // Then by priority
      if (a.priority !== b.priority) return a.priority - b.priority;

      // Then by deadline
      if (a.deadline && b.deadline) {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }

      return 0;
    });
  });

  // Group goals by status
  const goalsByStatus = createMemo(() => {
    const groups: Record<string, Goal[]> = {
      active: [],
      waiting: [],
      completed: [],
      paused: [],
    };

    for (const goal of sortedGoals()) {
      groups[goal.status]?.push(goal);
    }

    return groups;
  });

  return (
    <div class="space-y-6">
      {/* Active Goals */}
      <Show when={goalsByStatus().active.length > 0}>
        <div>
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Active Goals ({goalsByStatus().active.length})
          </h3>
          <div class="space-y-4">
            <For each={goalsByStatus().active}>
              {(goal) => {
                // Extract academic events from goal's planData (not form state)
                const goalPlanData = goal.planData as
                  | { academicEvents?: AcademicEvent[] }
                  | undefined;
                const goalAcademicEvents =
                  goalPlanData?.academicEvents || props.academicEvents || [];
                return (
                  <GoalTimeline
                    goal={goal}
                    currency={props.currency}
                    simulatedDate={props.simulatedDate}
                    onComponentUpdate={props.onComponentUpdate}
                    onEdit={props.onEdit}
                    onDelete={props.onDelete}
                    onToggleStatus={props.onToggleStatus}
                    academicEvents={goalAcademicEvents}
                    hourlyRate={props.hourlyRate}
                  />
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Waiting Goals */}
      <Show when={goalsByStatus().waiting.length > 0}>
        <div>
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Waiting ({goalsByStatus().waiting.length})
          </h3>
          <div class="space-y-4 opacity-75">
            <For each={goalsByStatus().waiting}>
              {(goal) => {
                const goalPlanData = goal.planData as
                  | { academicEvents?: AcademicEvent[] }
                  | undefined;
                const goalAcademicEvents =
                  goalPlanData?.academicEvents || props.academicEvents || [];
                return (
                  <GoalTimeline
                    goal={goal}
                    currency={props.currency}
                    simulatedDate={props.simulatedDate}
                    onComponentUpdate={props.onComponentUpdate}
                    onEdit={props.onEdit}
                    onDelete={props.onDelete}
                    onToggleStatus={props.onToggleStatus}
                    academicEvents={goalAcademicEvents}
                    hourlyRate={props.hourlyRate}
                  />
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Completed Goals */}
      <Show when={goalsByStatus().completed.length > 0}>
        <div>
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Completed ({goalsByStatus().completed.length})
          </h3>
          <div class="space-y-4 opacity-60">
            <For each={goalsByStatus().completed}>
              {(goal) => {
                const goalPlanData = goal.planData as
                  | { academicEvents?: AcademicEvent[] }
                  | undefined;
                const goalAcademicEvents =
                  goalPlanData?.academicEvents || props.academicEvents || [];
                return (
                  <GoalTimeline
                    goal={goal}
                    currency={props.currency}
                    simulatedDate={props.simulatedDate}
                    onComponentUpdate={props.onComponentUpdate}
                    onEdit={props.onEdit}
                    onDelete={props.onDelete}
                    onToggleStatus={props.onToggleStatus}
                    academicEvents={goalAcademicEvents}
                    hourlyRate={props.hourlyRate}
                  />
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* Sprint 9.5: Archived (Paused) Goals */}
      <Show when={goalsByStatus().paused.length > 0}>
        <div>
          <h3 class="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            Archived ({goalsByStatus().paused.length})
          </h3>
          <div class="space-y-4 opacity-50">
            <For each={goalsByStatus().paused}>
              {(goal) => {
                const goalPlanData = goal.planData as
                  | { academicEvents?: AcademicEvent[] }
                  | undefined;
                const goalAcademicEvents =
                  goalPlanData?.academicEvents || props.academicEvents || [];
                return (
                  <GoalTimeline
                    goal={goal}
                    currency={props.currency}
                    simulatedDate={props.simulatedDate}
                    onComponentUpdate={props.onComponentUpdate}
                    onEdit={props.onEdit}
                    onDelete={props.onDelete}
                    onToggleStatus={props.onToggleStatus}
                    academicEvents={goalAcademicEvents}
                    hourlyRate={props.hourlyRate}
                  />
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
