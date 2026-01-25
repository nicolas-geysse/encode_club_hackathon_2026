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
import { Pencil, Check, Trash2, RotateCcw, Zap, CalendarClock } from 'lucide-solid';

interface WeekCapacity {
  weekNumber: number;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
}

interface GoalTimelineProps {
  goal: Goal;
  currency?: Currency;
  // BUG 8 FIX: Accept simulated date for time simulation
  simulatedDate?: Date;
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goalId: string) => void;
  onToggleStatus?: (goal: Goal) => void;
  onViewRetroplan?: (goal: Goal) => void;
}

const CAPACITY_COLORS = {
  high: {
    bg: 'bg-green-500/10',
    text: 'text-green-600 dark:text-green-400',
    border: 'border-green-500/30',
  },
  medium: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-600 dark:text-yellow-400',
    border: 'border-yellow-500/30',
  },
  low: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    border: 'border-orange-500/30',
  },
  protected: {
    bg: 'bg-red-500/10',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-500/30',
  },
};

export function GoalTimeline(props: GoalTimelineProps) {
  const currency = () => props.currency || 'USD';
  const [showDeleteConfirm, setShowDeleteConfirm] = createSignal(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = createSignal(false);
  const [capacity, setCapacity] = createSignal<WeekCapacity | null>(null);

  // Fetch capacity for active goals
  createEffect(() => {
    if (props.goal.status === 'active' && props.goal.deadline) {
      fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_week_capacity',
          goalId: props.goal.id,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.capacity) setCapacity(data.capacity);
        })
        .catch(() => {
          /* ignore */
        });
    }
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

  // Calculate total cost from components
  const totalCost = createMemo(() => goalService.calculateGoalTotalCost(props.goal));

  // Calculate total hours from components
  const totalHours = createMemo(() => goalService.calculateGoalTotalHours(props.goal));

  // Calculate component progress (reserved for future timeline visualization)
  const _componentProgress = createMemo(() => goalService.calculateComponentProgress(props.goal));
  void _componentProgress; // Suppress unused warning - will be used in future

  // Get status color
  const getStatusColor = (status: GoalComponent['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'in_progress':
        return 'bg-primary-500';
      case 'pending':
        return 'bg-slate-300 dark:bg-slate-600';
      default:
        return 'bg-slate-300';
    }
  };

  // Get status icon
  const getStatusIcon = (status: GoalComponent['status']) => {
    switch (status) {
      case 'completed':
        return '✓';
      case 'in_progress':
        return '●';
      case 'pending':
        return '○';
      default:
        return '○';
    }
  };

  // Get component type icon
  const getTypeIcon = (type: GoalComponent['type']) => {
    switch (type) {
      case 'exam':
        return '📝';
      case 'time_allocation':
        return '⏰';
      case 'purchase':
        return '🛒';
      case 'milestone':
        return '🎯';
      case 'other':
        return '📋';
      default:
        return '📋';
    }
  };

  // Check if a component can be started (dependencies met)
  const canStartComponent = (component: GoalComponent): boolean => {
    if (!component.dependsOn || component.dependsOn.length === 0) return true;

    const components = props.goal.components || [];
    return component.dependsOn.every((depName) => {
      const dep = components.find((c) => c.name === depName);
      return dep?.status === 'completed';
    });
  };

  // Handle component status toggle
  const handleComponentClick = (component: GoalComponent) => {
    if (!component.id || !canStartComponent(component)) return;

    let newStatus: GoalComponent['status'];
    switch (component.status) {
      case 'pending':
        newStatus = 'in_progress';
        break;
      case 'in_progress':
        newStatus = 'completed';
        break;
      case 'completed':
        newStatus = 'pending';
        break;
      default:
        newStatus = 'pending';
    }

    props.onComponentUpdate?.(props.goal.id, component.id, newStatus);
  };

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

      {/* Capacity Indicator (for active goals) */}
      <Show when={props.goal.status === 'active' && capacity()}>
        {(cap) => {
          const colors = CAPACITY_COLORS[cap().capacityCategory];
          return (
            <div
              class={`flex items-center justify-between p-3 rounded-lg mb-4 border ${colors.bg} ${colors.border}`}
            >
              <div class="flex items-center gap-3">
                <Zap class={`h-5 w-5 ${colors.text}`} />
                <div>
                  <div class="flex items-center gap-2">
                    <span class={`text-sm font-bold uppercase ${colors.text}`}>
                      {cap().capacityCategory} capacity
                    </span>
                    <span class="text-xs text-muted-foreground">Week {cap().weekNumber}</span>
                  </div>
                  <span class="text-xs text-muted-foreground">
                    {cap().effectiveHours}h available this week
                  </span>
                </div>
              </div>
              <Show when={props.onViewRetroplan}>
                <button
                  type="button"
                  onClick={() => props.onViewRetroplan?.(props.goal)}
                  class={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${colors.text} hover:bg-black/5 dark:hover:bg-white/5`}
                >
                  <CalendarClock class="h-3.5 w-3.5" />
                  View plan
                </button>
              </Show>
            </div>
          );
        }}
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

      {/* Components Section */}
      <Show when={props.goal.components && props.goal.components.length > 0}>
        <div class="border-t border-slate-200 dark:border-slate-600 pt-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300">
              Components ({props.goal.components?.filter((c) => c.status === 'completed').length}/
              {props.goal.components?.length})
            </h4>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              <Show when={totalHours() > 0}>
                <span class="mr-3">{totalHours()}h total</span>
              </Show>
              <Show when={totalCost() > props.goal.amount}>
                <span>{formatCurrency(totalCost(), currency())} total cost</span>
              </Show>
            </div>
          </div>

          {/* Component Progress */}
          <div class="mb-4">
            <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden flex">
              <For each={props.goal.components}>
                {(component) => (
                  <div
                    class={`h-full transition-all duration-300 ${getStatusColor(component.status)}`}
                    style={{ width: `${100 / (props.goal.components?.length || 1)}%` }}
                  />
                )}
              </For>
            </div>
          </div>

          {/* Component List */}
          <div class="space-y-2">
            <For each={props.goal.components}>
              {(component, index) => {
                const canStart = () => canStartComponent(component);
                const isBlocked = () => !canStart() && component.status === 'pending';

                return (
                  <div
                    class={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isBlocked()
                        ? 'bg-slate-100 dark:bg-slate-700/50 opacity-60'
                        : 'bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer'
                    }`}
                    onClick={() => !isBlocked() && handleComponentClick(component)}
                  >
                    {/* Status indicator */}
                    <div
                      class={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${getStatusColor(component.status)}`}
                    >
                      {getStatusIcon(component.status)}
                    </div>

                    {/* Component info */}
                    <div class="flex-1">
                      <div class="flex items-center gap-2">
                        <span>{getTypeIcon(component.type)}</span>
                        <span
                          class={`font-medium ${
                            component.status === 'completed'
                              ? 'text-slate-500 line-through'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {component.name}
                        </span>
                      </div>
                      <div class="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <Show when={component.estimatedHours}>
                          <span>⏱️ {component.estimatedHours}h</span>
                        </Show>
                        <Show when={component.estimatedCost}>
                          <span>💰 {formatCurrency(component.estimatedCost!, currency())}</span>
                        </Show>
                        <Show when={isBlocked()}>
                          <span class="text-amber-600 dark:text-amber-400">
                            🔒 Requires: {component.dependsOn?.join(', ')}
                          </span>
                        </Show>
                      </div>
                    </div>

                    {/* Connection line to next */}
                    <Show when={index() < (props.goal.components?.length || 0) - 1}>
                      <div class="absolute left-7 top-full h-2 w-0.5 bg-slate-300 dark:bg-slate-500" />
                    </Show>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

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
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
  onEdit?: (goal: Goal) => void;
  onDelete?: (goalId: string) => void;
  onToggleStatus?: (goal: Goal) => void;
  onViewRetroplan?: (goal: Goal) => void;
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
              {(goal) => (
                <GoalTimeline
                  goal={goal}
                  currency={props.currency}
                  simulatedDate={props.simulatedDate}
                  onComponentUpdate={props.onComponentUpdate}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                  onToggleStatus={props.onToggleStatus}
                  onViewRetroplan={props.onViewRetroplan}
                />
              )}
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
              {(goal) => (
                <GoalTimeline
                  goal={goal}
                  currency={props.currency}
                  simulatedDate={props.simulatedDate}
                  onComponentUpdate={props.onComponentUpdate}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                  onToggleStatus={props.onToggleStatus}
                  onViewRetroplan={props.onViewRetroplan}
                />
              )}
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
              {(goal) => (
                <GoalTimeline
                  goal={goal}
                  currency={props.currency}
                  simulatedDate={props.simulatedDate}
                  onComponentUpdate={props.onComponentUpdate}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                  onToggleStatus={props.onToggleStatus}
                  onViewRetroplan={props.onViewRetroplan}
                />
              )}
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
              {(goal) => (
                <GoalTimeline
                  goal={goal}
                  currency={props.currency}
                  simulatedDate={props.simulatedDate}
                  onComponentUpdate={props.onComponentUpdate}
                  onEdit={props.onEdit}
                  onDelete={props.onDelete}
                  onToggleStatus={props.onToggleStatus}
                  onViewRetroplan={props.onViewRetroplan}
                />
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
