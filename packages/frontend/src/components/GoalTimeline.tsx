/**
 * Goal Timeline Component
 *
 * Visualizes goal progress, components, and dependencies.
 * Shows timeline from creation to deadline with progress milestones.
 */

import { createSignal, createMemo, Show, For } from 'solid-js';
import { type Goal, type GoalComponent, goalService } from '~/lib/goalService';

interface GoalTimelineProps {
  goal: Goal;
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
}

export function GoalTimeline(props: GoalTimelineProps) {
  const [expanded, setExpanded] = createSignal(true);

  // Calculate days remaining
  const daysRemaining = createMemo(() => {
    if (!props.goal.deadline) return null;
    const deadline = new Date(props.goal.deadline);
    const now = new Date();
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
  const timelineProgress = createMemo(() => {
    if (!props.goal.deadline || !props.goal.createdAt) return 0;

    const start = new Date(props.goal.createdAt).getTime();
    const end = new Date(props.goal.deadline).getTime();
    const now = Date.now();

    if (now >= end) return 100;
    if (now <= start) return 0;

    return Math.round(((now - start) / (end - start)) * 100);
  });

  return (
    <div class="card">
      {/* Header */}
      <div
        class="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-3">
          <span class="text-2xl">
            {props.goal.status === 'completed'
              ? '✅'
              : props.goal.status === 'waiting'
                ? '⏳'
                : '🎯'}
          </span>
          <div>
            <h3 class="font-bold text-slate-900 dark:text-slate-100">{props.goal.name}</h3>
            <div class="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
              <span>${props.goal.amount}</span>
              <Show when={props.goal.deadline}>
                <span>
                  {daysRemaining() !== null && daysRemaining()! > 0
                    ? `${daysRemaining()} days left`
                    : daysRemaining() === 0
                      ? 'Due today!'
                      : 'Overdue'}
                </span>
              </Show>
              <span>{props.goal.progress || 0}% complete</span>
            </div>
          </div>
        </div>
        <button type="button" class="text-slate-400 hover:text-slate-600">
          {expanded() ? '▼' : '▶'}
        </button>
      </div>

      <Show when={expanded()}>
        <div class="mt-4 space-y-4">
          {/* Main Progress Bar */}
          <div>
            <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Progress</span>
              <span>{props.goal.progress || 0}%</span>
            </div>
            <div class="h-3 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all duration-500"
                style={{ width: `${props.goal.progress || 0}%` }}
              />
            </div>
          </div>

          {/* Timeline Bar (time elapsed) */}
          <Show when={props.goal.deadline}>
            <div>
              <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                <span>Time elapsed</span>
                <span>{timelineProgress()}%</span>
              </div>
              <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                <div
                  class={`h-full transition-all duration-500 ${
                    timelineProgress() > (props.goal.progress || 0)
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${timelineProgress()}%` }}
                />
              </div>
              <p class="text-xs text-slate-400 mt-1">
                {timelineProgress() > (props.goal.progress || 0)
                  ? '⚠️ Behind schedule'
                  : '✓ On track'}
              </p>
            </div>
          </Show>

          {/* Components Section */}
          <Show when={props.goal.components && props.goal.components.length > 0}>
            <div class="border-t border-slate-200 dark:border-slate-600 pt-4">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Components (
                  {props.goal.components?.filter((c) => c.status === 'completed').length}/
                  {props.goal.components?.length})
                </h4>
                <div class="text-xs text-slate-500 dark:text-slate-400">
                  <Show when={totalHours() > 0}>
                    <span class="mr-3">{totalHours()}h total</span>
                  </Show>
                  <Show when={totalCost() > props.goal.amount}>
                    <span>${totalCost()} total cost</span>
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
                              <span>💰 ${component.estimatedCost}</span>
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

          {/* Conditional Goal Info */}
          <Show when={props.goal.parentGoalId}>
            <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
              <div class="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                <span>⏳</span>
                <span>This goal will activate after completing the parent goal</span>
              </div>
            </div>
          </Show>

          {/* Quick Stats */}
          <div class="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-600">
            <div class="text-center">
              <p class="text-2xl font-bold text-primary-600 dark:text-primary-400">
                ${Math.round((props.goal.amount * (props.goal.progress || 0)) / 100)}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Saved</p>
            </div>
            <div class="text-center">
              <p class="text-2xl font-bold text-slate-600 dark:text-slate-300">
                $
                {props.goal.amount -
                  Math.round((props.goal.amount * (props.goal.progress || 0)) / 100)}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400">Remaining</p>
            </div>
            <div class="text-center">
              <Show when={daysRemaining() !== null && daysRemaining()! > 0}>
                <p class="text-2xl font-bold text-slate-600 dark:text-slate-300">
                  $
                  {Math.ceil(
                    (props.goal.amount -
                      Math.round((props.goal.amount * (props.goal.progress || 0)) / 100)) /
                      (daysRemaining()! / 7)
                  )}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">Per week</p>
              </Show>
              <Show when={!daysRemaining() || daysRemaining()! <= 0}>
                <p class="text-2xl font-bold text-slate-600 dark:text-slate-300">-</p>
                <p class="text-xs text-slate-500 dark:text-slate-400">Per week</p>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}

/**
 * Goal Timeline List - Shows multiple goals with their timelines
 */
interface GoalTimelineListProps {
  goals: Goal[];
  onComponentUpdate?: (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => void;
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
              {(goal) => <GoalTimeline goal={goal} onComponentUpdate={props.onComponentUpdate} />}
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
              {(goal) => <GoalTimeline goal={goal} onComponentUpdate={props.onComponentUpdate} />}
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
              {(goal) => <GoalTimeline goal={goal} onComponentUpdate={props.onComponentUpdate} />}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
