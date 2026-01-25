/**
 * Goal Components List
 *
 * Displays sub-tasks/components for a goal with checkboxes,
 * status indicators, and dependency visualization.
 */

import { createSignal, createEffect, Show, For } from 'solid-js';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import {
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  Trash2,
  BookOpen,
  Clock4,
  ShoppingCart,
  Flag,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Lock,
} from 'lucide-solid';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { createLogger } from '~/lib/logger';
import { toastPopup } from '~/components/ui/Toast';

const logger = createLogger('GoalComponentsList');

interface GoalComponent {
  id: string;
  goalId: string;
  name: string;
  type: 'exam' | 'time_allocation' | 'purchase' | 'milestone' | 'other';
  estimatedHours?: number;
  estimatedCost?: number;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt?: string;
  dependsOn?: string[];
  createdAt?: string;
}

interface GoalComponentsListProps {
  goalId: string;
  currency?: Currency;
  compact?: boolean;
  onProgressUpdate?: (progress: number) => void;
}

const TYPE_CONFIG = {
  exam: {
    icon: BookOpen,
    label: 'Exam',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  time_allocation: {
    icon: Clock4,
    label: 'Time',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
  },
  purchase: {
    icon: ShoppingCart,
    label: 'Purchase',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-500/10',
  },
  milestone: {
    icon: Flag,
    label: 'Milestone',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  other: {
    icon: MoreHorizontal,
    label: 'Other',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-500/10',
  },
};

const STATUS_CONFIG = {
  pending: {
    icon: Circle,
    label: 'Pending',
    color: 'text-gray-400',
  },
  in_progress: {
    icon: Clock,
    label: 'In Progress',
    color: 'text-yellow-500',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    color: 'text-green-500',
  },
};

export function GoalComponentsList(props: GoalComponentsListProps) {
  const [components, setComponents] = createSignal<GoalComponent[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [expanded, setExpanded] = createSignal(true);
  const [showAddForm, setShowAddForm] = createSignal(false);

  // Form state
  const [newName, setNewName] = createSignal('');
  const [newType, setNewType] = createSignal<GoalComponent['type']>('milestone');
  const [newHours, setNewHours] = createSignal<number | undefined>(undefined);
  const [newCost, setNewCost] = createSignal<number | undefined>(undefined);

  const currency = () => props.currency || 'EUR';

  const fetchComponents = async () => {
    if (!props.goalId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/goal-components?goalId=${props.goalId}`);
      if (response.ok) {
        const data = await response.json();
        setComponents(data);
      }
    } catch (err) {
      logger.error('Failed to fetch components', { error: err });
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.goalId) {
      fetchComponents();
    }
  });

  // Calculate progress
  const progress = () => {
    const comps = components();
    if (comps.length === 0) return 0;
    const completed = comps.filter((c) => c.status === 'completed').length;
    return Math.round((completed / comps.length) * 100);
  };

  // Check if a component is blocked by dependencies
  const isBlocked = (component: GoalComponent): boolean => {
    if (!component.dependsOn || component.dependsOn.length === 0) return false;

    const comps = components();
    return component.dependsOn.some((depId) => {
      const dep = comps.find((c) => c.id === depId);
      return dep && dep.status !== 'completed';
    });
  };

  // Get blocking component names
  const getBlockingComponents = (component: GoalComponent): string[] => {
    if (!component.dependsOn) return [];

    const comps = components();
    return component.dependsOn
      .map((depId) => comps.find((c) => c.id === depId))
      .filter((dep) => dep && dep.status !== 'completed')
      .map((dep) => dep!.name);
  };

  const toggleStatus = async (component: GoalComponent) => {
    if (isBlocked(component)) {
      const blocking = getBlockingComponents(component);
      toastPopup.error('Blocked', `Complete "${blocking[0]}" first`);
      return;
    }

    const newStatus =
      component.status === 'completed'
        ? 'pending'
        : component.status === 'pending'
          ? 'in_progress'
          : 'completed';

    try {
      const response = await fetch('/api/goal-components', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: component.id, status: newStatus }),
      });

      if (response.ok) {
        await fetchComponents();
        const newProgress = progress();
        props.onProgressUpdate?.(newProgress);

        if (newStatus === 'completed') {
          toastPopup.success('Completed!', `"${component.name}" marked as done`);
        }
      }
    } catch (err) {
      logger.error('Failed to update component', { error: err });
      toastPopup.error('Error', 'Failed to update status');
    }
  };

  const addComponent = async () => {
    if (!newName().trim()) {
      toastPopup.error('Error', 'Name is required');
      return;
    }

    try {
      const response = await fetch('/api/goal-components', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: props.goalId,
          name: newName(),
          type: newType(),
          estimatedHours: newHours(),
          estimatedCost: newCost(),
        }),
      });

      if (response.ok) {
        await fetchComponents();
        setShowAddForm(false);
        resetForm();
        toastPopup.success('Added', 'New step added to your goal');
      }
    } catch (err) {
      logger.error('Failed to add component', { error: err });
      toastPopup.error('Error', 'Failed to add step');
    }
  };

  const deleteComponent = async (id: string) => {
    try {
      const response = await fetch(`/api/goal-components?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await fetchComponents();
        toastPopup.success('Deleted', 'Step removed');
      }
    } catch (err) {
      logger.error('Failed to delete component', { error: err });
      toastPopup.error('Error', 'Failed to delete step');
    }
  };

  const resetForm = () => {
    setNewName('');
    setNewType('other');
    setNewHours(undefined);
    setNewCost(undefined);
  };

  // Compact view: just a progress bar with expandable list
  const CompactView = () => (
    <button type="button" class="w-full text-left" onClick={() => setExpanded(!expanded())}>
      <div class="flex items-center gap-2">
        <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div class="h-full bg-primary transition-all" style={{ width: `${progress()}%` }} />
        </div>
        <span class="text-xs text-muted-foreground">
          {components().filter((c) => c.status === 'completed').length}/{components().length}
        </span>
        {expanded() ? (
          <ChevronUp class="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown class="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      <Show when={expanded()}>
        <div class="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
          <For each={components()}>
            {(component) => {
              const statusConfig = STATUS_CONFIG[component.status];
              const blocked = isBlocked(component);

              return (
                <div
                  class={`flex items-center gap-2 p-1.5 rounded text-sm ${
                    blocked ? 'opacity-50' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleStatus(component)}
                    class={`${statusConfig.color} hover:scale-110 transition-transform`}
                    disabled={blocked}
                  >
                    {blocked ? <Lock class="h-4 w-4" /> : <statusConfig.icon class="h-4 w-4" />}
                  </button>
                  <span
                    class={`flex-1 ${component.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}
                  >
                    {component.name}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </button>
  );

  // Full view: card with all details
  const FullView = () => (
    <Card class="border-border">
      <CardHeader class="pb-2">
        <div class="flex items-center justify-between">
          <CardTitle class="text-sm font-medium">Goal Steps</CardTitle>
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">{progress()}% complete</span>
            <Button
              variant="ghost"
              size="icon"
              class="h-6 w-6"
              onClick={() => setShowAddForm(true)}
            >
              <Plus class="h-4 w-4" />
            </Button>
          </div>
        </div>
        {/* Progress bar */}
        <div class="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
          <div class="h-full bg-primary transition-all" style={{ width: `${progress()}%` }} />
        </div>
      </CardHeader>

      <CardContent class="space-y-2">
        <Show when={loading()}>
          <div class="text-center py-4 text-sm text-muted-foreground">Loading...</div>
        </Show>

        <Show when={!loading() && components().length === 0}>
          <div class="text-center py-4 text-sm text-muted-foreground">
            No steps added yet. Break down your goal into smaller tasks.
          </div>
        </Show>

        <Show when={!loading() && components().length > 0}>
          <div class="space-y-2">
            <For each={components()}>
              {(component) => {
                const typeConfig = TYPE_CONFIG[component.type] || TYPE_CONFIG.other;
                const statusConfig = STATUS_CONFIG[component.status];
                const TypeIcon = typeConfig.icon;
                const StatusIcon = statusConfig.icon;
                const blocked = isBlocked(component);
                const blockingNames = getBlockingComponents(component);

                return (
                  <div
                    class={`flex items-center gap-3 p-2 rounded-lg border ${
                      component.status === 'completed'
                        ? 'bg-green-500/5 border-green-500/20'
                        : blocked
                          ? 'bg-muted/30 border-muted'
                          : 'bg-background border-border hover:bg-muted/50'
                    } transition-colors`}
                  >
                    {/* Status toggle */}
                    <button
                      type="button"
                      onClick={() => toggleStatus(component)}
                      class={`${statusConfig.color} hover:scale-110 transition-transform`}
                      disabled={blocked}
                      title={
                        blocked ? `Blocked by: ${blockingNames.join(', ')}` : statusConfig.label
                      }
                    >
                      {blocked ? <Lock class="h-5 w-5" /> : <StatusIcon class="h-5 w-5" />}
                    </button>

                    {/* Content */}
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span
                          class={`text-sm ${
                            component.status === 'completed'
                              ? 'line-through text-muted-foreground'
                              : blocked
                                ? 'text-muted-foreground'
                                : ''
                          }`}
                        >
                          {component.name}
                        </span>
                        <span
                          class={`px-1.5 py-0.5 rounded text-xs ${typeConfig.bgColor} ${typeConfig.color}`}
                        >
                          <TypeIcon class="h-3 w-3 inline mr-0.5" />
                          {typeConfig.label}
                        </span>
                      </div>

                      {/* Meta info */}
                      <div class="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <Show when={component.estimatedHours}>
                          <span>{component.estimatedHours}h</span>
                        </Show>
                        <Show when={component.estimatedCost}>
                          <span>{formatCurrency(component.estimatedCost!, currency())}</span>
                        </Show>
                        <Show when={blocked}>
                          <span class="text-amber-600">Blocked by: {blockingNames[0]}</span>
                        </Show>
                      </div>
                    </div>

                    {/* Delete button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      class="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteComponent(component.id)}
                    >
                      <Trash2 class="h-3 w-3" />
                    </Button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>

        {/* Add Form */}
        <Show when={showAddForm()}>
          <div class="p-3 bg-muted/30 rounded-lg border border-border space-y-3">
            <Input
              placeholder="Step name (e.g., Pass AWS certification)"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              class="h-8 text-sm"
            />

            <div class="flex flex-wrap gap-1">
              <For each={Object.entries(TYPE_CONFIG)}>
                {([key, config]) => (
                  <Button
                    variant={newType() === key ? 'default' : 'outline'}
                    size="sm"
                    class="h-6 text-xs"
                    onClick={() => setNewType(key as GoalComponent['type'])}
                  >
                    <config.icon class="h-3 w-3 mr-1" />
                    {config.label}
                  </Button>
                )}
              </For>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-xs text-muted-foreground">Estimated Hours</label>
                <Input
                  type="number"
                  placeholder="Hours"
                  value={newHours() ?? ''}
                  onInput={(e) =>
                    setNewHours(e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
                  }
                  class="h-8 text-sm"
                />
              </div>
              <div>
                <label class="text-xs text-muted-foreground">Estimated Cost</label>
                <Input
                  type="number"
                  placeholder="Cost"
                  value={newCost() ?? ''}
                  onInput={(e) =>
                    setNewCost(e.currentTarget.value ? Number(e.currentTarget.value) : undefined)
                  }
                  class="h-8 text-sm"
                />
              </div>
            </div>

            <div class="flex gap-2">
              <Button size="sm" class="text-xs" onClick={addComponent}>
                Add Step
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-xs"
                onClick={() => {
                  setShowAddForm(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );

  // Single return with conditional rendering
  return (
    <Show when={props.compact && components().length > 0} fallback={<FullView />}>
      <CompactView />
    </Show>
  );
}

export default GoalComponentsList;
