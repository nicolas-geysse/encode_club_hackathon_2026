/**
 * Goals Tab Component
 *
 * Lists existing goals and allows creating new ones.
 * Supports complex goals with components and conditional goals.
 * Uses goalService for DuckDB persistence.
 * Uses createCrudTab hook for common CRUD state management.
 */

import { createSignal, createMemo, createEffect, Show, For, onMount } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { goalService } from '~/lib/goalService';
import { useProfile, type Goal, type GoalComponent } from '~/lib/profileContext';
import { createCrudTab } from '~/hooks/createCrudTab';
import { toast } from '~/lib/notificationStore';
import { createLogger } from '~/lib/logger';

const logger = createLogger('GoalsTab');
import { GoalTimelineList } from '~/components/GoalTimeline';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import {
  Pencil,
  CheckCircle2,
  AlertCircle,
  Plus,
  Clock,
  Target,
  X,
  GraduationCap,
  Package,
  Trash2,
} from 'lucide-solid';

interface AcademicEvent {
  id: string;
  type: 'exam_period' | 'class_intensive' | 'vacation' | 'internship' | 'project_deadline';
  name: string;
  startDate: string;
  endDate: string;
}

interface Commitment {
  id: string;
  type: 'class' | 'sport' | 'club' | 'family' | 'health' | 'other';
  name: string;
  hoursPerWeek: number;
}

interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  academicEvents: AcademicEvent[];
  commitments: Commitment[];
}

interface GoalsTabProps {
  onComplete: (data: SetupData) => void;
  initialData?: Partial<SetupData>;
  currency?: Currency;
}

// Component form item
interface ComponentFormItem {
  id: string;
  name: string;
  type: GoalComponent['type'];
  estimatedHours: number;
  estimatedCost: number;
  dependsOn: string[];
}

export function GoalsTab(props: GoalsTabProps) {
  // URL params for deep linking (e.g., /plan?tab=goals&action=new)
  const [searchParams] = useSearchParams();

  // Use ProfileContext for goals (single source of truth, handles DATA_CHANGED)
  const context = useProfile();
  const goals = () => context.goals();
  const profile = () => context.profile();

  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  // Derived profileId from context
  const profileId = () => profile()?.id || null;

  // Combine context loading with local initialization
  const loading = () => context.loading();

  // Use createCrudTab hook for common CRUD state management
  const crud = createCrudTab<Goal>({
    getItemId: (goal) => goal.id,
    getItemName: (goal) => goal.name,
  });

  // Destructure for convenience (aliased to match original names)
  const {
    showAddForm: showNewGoalForm,
    setShowAddForm: setShowNewGoalForm,
    editingId: editingGoalId,
    setEditingId: setEditingGoalId,
  } = crud;

  // Form state
  const [goalName, setGoalName] = createSignal(props.initialData?.goalName || '');
  const [goalAmount, setGoalAmount] = createSignal(props.initialData?.goalAmount || 500);
  const [goalDeadline, setGoalDeadline] = createSignal(props.initialData?.goalDeadline || '');
  const [academicEvents, setAcademicEvents] = createSignal<AcademicEvent[]>(
    props.initialData?.academicEvents || []
  );
  const [commitments, setCommitments] = createSignal<Commitment[]>(
    props.initialData?.commitments || []
  );

  // Advanced goal options
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [components, setComponents] = createSignal<ComponentFormItem[]>([]);
  const [parentGoalId, setParentGoalId] = createSignal<string | null>(null);
  const [conditionType, setConditionType] = createSignal<
    'none' | 'after_completion' | 'after_date'
  >('none');

  // New component form
  const [newComponent, setNewComponent] = createSignal<Partial<ComponentFormItem>>({
    name: '',
    type: 'milestone',
    estimatedHours: 0,
    estimatedCost: 0,
    dependsOn: [],
  });

  // New event/commitment forms
  const [newEvent, setNewEvent] = createSignal<Partial<AcademicEvent>>({
    type: 'exam_period',
    name: '',
    startDate: '',
    endDate: '',
  });
  const [isSameDay, setIsSameDay] = createSignal(false);
  const [newCommitment, setNewCommitment] = createSignal<Partial<Commitment>>({
    type: 'class',
    name: '',
    hoursPerWeek: 2,
  });

  // Feature J: Delete confirmation state for events and commitments
  const [deleteEventConfirm, setDeleteEventConfirm] = createSignal<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteCommitmentConfirm, setDeleteCommitmentConfirm] = createSignal<{
    id: string;
    name: string;
  } | null>(null);

  // Sprint 9.5: Single active goal confirmation state
  const [replaceGoalConfirm, setReplaceGoalConfirm] = createSignal<Goal | null>(null);

  // Available parent goals for conditional goals
  const availableParentGoals = createMemo(() => {
    const currentId = editingGoalId();
    return goals().filter(
      (g) => g.status === 'active' && g.id !== currentId && !g.parentGoalId // Can't chain conditional goals
    );
  });

  // BUG O FIX: Sync form fields when initialData changes (race condition fix)
  // This handles the case where plan.tsx loads goal data async AFTER GoalsTab renders
  // Bug E Fix: Only sync if current value is empty to prevent overwriting user edits
  createEffect(() => {
    const deadline = props.initialData?.goalDeadline;
    if (deadline && !goalDeadline()) {
      setGoalDeadline(deadline);
    }
    const name = props.initialData?.goalName;
    if (name && !goalName()) {
      setGoalName(name);
    }
    const amount = props.initialData?.goalAmount;
    if (amount && goalAmount() === 500) {
      // Only update if still at default value
      setGoalAmount(amount);
    }
    if (props.initialData?.academicEvents && academicEvents().length === 0) {
      setAcademicEvents(props.initialData.academicEvents);
    }
    if (props.initialData?.commitments && commitments().length === 0) {
      setCommitments(props.initialData.commitments);
    }
  });

  // ProfileContext handles DATA_CHANGED events and refreshes goals
  // GoalsTab just uses the context's goals signal (single source of truth)

  // Initialize form state on mount
  onMount(() => {
    logger.info('GoalsTab mounted, using ProfileContext for goals');

    // BUG O FIX: Only set default deadline if no initialData provided AND no existing deadline
    if (!goalDeadline() && !props.initialData?.goalDeadline) {
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 56);
      setGoalDeadline(defaultDeadline.toISOString().split('T')[0]);
    }

    // Auto-open form if action=new is in URL (from "New Goal" button on suivi page)
    const action = Array.isArray(searchParams.action)
      ? searchParams.action[0]
      : searchParams.action;
    if (action === 'new') {
      setShowNewGoalForm(true);
    }
  });

  // Show new goal form if no goals and we have initial data
  createEffect(() => {
    const currentGoals = goals();
    if (currentGoals.length === 0 && props.initialData?.goalName && !showNewGoalForm()) {
      setShowNewGoalForm(true);
    }
  });

  // Feature K: Auto-complete goals when progress reaches 100%
  // FIX: Track processed goal IDs to prevent duplicate auto-complete calls
  // which could cause flickering when the effect re-runs after DATA_CHANGED
  const processedAutoCompleteGoals = new Set<string>();

  createEffect(() => {
    const currentGoals = goals();
    for (const goal of currentGoals) {
      if (goal.progress >= 100 && goal.status === 'active') {
        // Skip if already processed (prevents duplicate calls during refresh cycles)
        if (processedAutoCompleteGoals.has(goal.id)) continue;
        processedAutoCompleteGoals.add(goal.id);

        // Auto-mark as completed and show celebration
        // goalService.updateGoal emits DATA_CHANGED, ProfileContext handles refresh
        goalService.updateGoal({ id: goal.id, status: 'completed' }).then(() => {
          toast.success('Goal achieved!', `"${goal.name}" has been completed!`);
        });
      }
    }
  });

  // refreshGoals is now from ProfileContext (single source of truth)

  // Component handlers
  const addComponent = () => {
    const comp = newComponent();
    if (!comp.name) return;

    setComponents([
      ...components(),
      {
        id: `comp_${Date.now()}`,
        name: comp.name || '',
        type: comp.type || 'milestone',
        estimatedHours: comp.estimatedHours || 0,
        estimatedCost: comp.estimatedCost || 0,
        dependsOn: comp.dependsOn || [],
      },
    ]);
    setNewComponent({
      name: '',
      type: 'milestone',
      estimatedHours: 0,
      estimatedCost: 0,
      dependsOn: [],
    });
  };

  const removeComponent = (id: string) => {
    setComponents(components().filter((c) => c.id !== id));
  };

  const addAcademicEvent = () => {
    const event = newEvent();
    if (!event.name || !event.startDate || !event.endDate) return;

    setAcademicEvents([
      ...academicEvents(),
      { ...event, id: `event_${Date.now()}` } as AcademicEvent,
    ]);
    setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
  };

  const removeAcademicEvent = (id: string) => {
    setAcademicEvents(academicEvents().filter((e) => e.id !== id));
  };

  // Bug F Fix: Add edit functionality for academic events
  const editAcademicEvent = (event: AcademicEvent) => {
    setNewEvent({
      type: event.type,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    setIsSameDay(event.startDate === event.endDate);
    removeAcademicEvent(event.id);
  };

  const addCommitment = () => {
    const commitment = newCommitment();
    if (!commitment.name || !commitment.hoursPerWeek) return;

    setCommitments([...commitments(), { ...commitment, id: `commit_${Date.now()}` } as Commitment]);
    setNewCommitment({ type: 'class', name: '', hoursPerWeek: 2 });
  };

  const removeCommitment = (id: string) => {
    setCommitments(commitments().filter((c) => c.id !== id));
  };

  const resetForm = () => {
    setGoalName('');
    setGoalAmount(500);
    const defaultDeadline = new Date();
    defaultDeadline.setDate(defaultDeadline.getDate() + 56);
    setGoalDeadline(defaultDeadline.toISOString().split('T')[0]);
    setAcademicEvents([]);
    setCommitments([]);
    setComponents([]);
    setParentGoalId(null);
    setConditionType('none');
    setShowAdvanced(false);
    setEditingGoalId(null);
    setShowNewGoalForm(false);
  };

  // Sprint 9.5: Archive all active goals (used before creating new one)
  const archiveActiveGoals = async () => {
    const activeGoals = goals().filter((g) => g.status === 'active');
    for (const oldGoal of activeGoals) {
      await goalService.updateGoal({
        id: oldGoal.id,
        status: 'paused', // Archived, not deleted
      });
    }
  };

  // Sprint 9.5: Handle replace goal confirmation (separated to avoid Solid reactivity warnings)
  const handleReplaceGoalConfirm = () => {
    setReplaceGoalConfirm(null);
    archiveActiveGoals().then(() => performSave());
  };

  // Sprint 9.5: Actual save logic (called after confirmation if needed)
  const performSave = async () => {
    const planData = {
      academicEvents: academicEvents(),
      commitments: commitments(),
    };

    // Convert form components to API format
    const apiComponents =
      components().length > 0
        ? components().map((c) => ({
            name: c.name,
            type: c.type,
            estimatedHours: c.estimatedHours || undefined,
            estimatedCost: c.estimatedCost || undefined,
            status: 'pending' as const,
            dependsOn: c.dependsOn.length > 0 ? c.dependsOn : undefined,
          }))
        : undefined;

    if (editingGoalId()) {
      // Update existing goal
      await goalService.updateGoal({
        id: editingGoalId()!,
        name: goalName(),
        amount: goalAmount(),
        deadline: goalDeadline(),
        planData,
        parentGoalId: parentGoalId() || undefined,
        conditionType: conditionType(),
      });
    } else {
      // Create new goal
      await goalService.createGoal({
        profileId: profileId()!,
        name: goalName(),
        amount: goalAmount(),
        deadline: goalDeadline(),
        planData,
        components: apiComponents,
        parentGoalId: parentGoalId() || undefined,
        conditionType: conditionType(),
        status: conditionType() !== 'none' && parentGoalId() ? 'waiting' : 'active',
      });
    }

    // Note: goalService emits DATA_CHANGED, debounced listener handles refresh
    resetForm();

    // Also call onComplete for backward compatibility with plan.tsx
    props.onComplete({
      goalName: goalName(),
      goalAmount: goalAmount(),
      goalDeadline: goalDeadline(),
      academicEvents: academicEvents(),
      commitments: commitments(),
    });
  };

  const handleSave = async () => {
    if (!goalName() || goalAmount() <= 0 || !goalDeadline() || !profileId()) return;

    // Sprint 9.5: Check for existing active goals before creating (not when editing)
    if (!editingGoalId()) {
      const activeGoals = goals().filter((g) => g.status === 'active');

      if (activeGoals.length > 0) {
        // Show confirmation dialog - actual save happens in onConfirm
        setReplaceGoalConfirm(activeGoals[0]);
        return;
      }
    }

    // No active goals to replace, proceed directly
    await performSave();
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setGoalName(goal.name);
    setGoalAmount(goal.amount);
    setGoalDeadline(goal.deadline || '');

    // Load plan data if available
    const planData = goal.planData as
      | { academicEvents?: AcademicEvent[]; commitments?: Commitment[] }
      | undefined;
    setAcademicEvents(planData?.academicEvents || []);
    setCommitments(planData?.commitments || []);

    // Load components
    if (goal.components && goal.components.length > 0) {
      setComponents(
        goal.components.map((c) => ({
          id: c.id || `comp_${Date.now()}`,
          name: c.name,
          type: c.type,
          estimatedHours: c.estimatedHours || 0,
          estimatedCost: c.estimatedCost || 0,
          dependsOn: c.dependsOn || [],
        }))
      );
      setShowAdvanced(true);
    }

    // Load conditional settings
    if (goal.parentGoalId) {
      setParentGoalId(goal.parentGoalId);
      setConditionType(goal.conditionType || 'none');
      setShowAdvanced(true);
    }

    setShowNewGoalForm(true);
  };

  const handleDelete = async (goalId: string) => {
    // Note: ConfirmDialog is already shown by GoalTimelineItem, no need for browser confirm()
    // goalService.deleteGoal emits DATA_CHANGED, debounced listener handles refresh
    await goalService.deleteGoal(goalId);
  };

  const handleToggleStatus = async (goal: Goal) => {
    // Sprint 9.5: Handle toggle for all statuses (completed, paused, active)
    let newStatus: 'active' | 'completed' | 'paused';

    if (goal.status === 'active') {
      newStatus = 'completed';
    } else {
      // Both 'completed' and 'paused' goals can be reactivated
      newStatus = 'active';
    }

    // Sprint 9.5: If reactivating (making active), archive any current active goals first
    if (newStatus === 'active') {
      await archiveActiveGoals();
    }

    // goalService.updateGoal emits DATA_CHANGED, debounced listener handles refresh
    await goalService.updateGoal({
      id: goal.id,
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : goal.progress,
    });
  };

  // Handle component status update from timeline
  const handleComponentUpdate = async (
    goalId: string,
    componentId: string,
    status: GoalComponent['status']
  ) => {
    try {
      // Call the goal-components API to update the status
      const response = await fetch('/api/goal-components', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: componentId, status }),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error('Update failed', error.message || 'Could not update component.');
        return;
      }

      // Note: API emits DATA_CHANGED via eventBus, debounced listener handles refresh
    } catch {
      toast.error('Update failed', 'Could not update component.');
    }
  };

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

  // Quick presets - now with components for complex goals
  const presets = [
    { name: 'Vacation', amount: 500, icon: '🏖️', components: [] },
    {
      name: "Driver's license",
      amount: 1500,
      icon: '🚗',
      components: [
        {
          name: 'Theory classes',
          type: 'time_allocation' as const,
          estimatedHours: 10,
          estimatedCost: 50,
        },
        { name: 'Code exam', type: 'exam' as const, estimatedHours: 2, estimatedCost: 30 },
        {
          name: 'Driving lessons (20h)',
          type: 'time_allocation' as const,
          estimatedHours: 20,
          estimatedCost: 800,
        },
        {
          name: 'Driving test',
          type: 'exam' as const,
          estimatedHours: 1,
          estimatedCost: 100,
          dependsOn: ['Code exam', 'Driving lessons (20h)'],
        },
      ],
    },
    { name: 'Computer', amount: 800, icon: '💻', components: [] },
    { name: 'Emergency fund', amount: 1000, icon: '🛡️', components: [] },
  ];

  const applyPreset = (preset: (typeof presets)[0]) => {
    setGoalName(preset.name);
    setGoalAmount(preset.amount);

    if (preset.components.length > 0) {
      setShowAdvanced(true);
      setComponents(
        preset.components.map((c, i) => ({
          id: `comp_${Date.now()}_${i}`,
          name: c.name,
          type: c.type,
          estimatedHours: c.estimatedHours || 0,
          estimatedCost: c.estimatedCost || 0,
          dependsOn: c.dependsOn || [],
        }))
      );
    }
  };

  return (
    <div class="p-6 space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-foreground flex items-center gap-2">
            <Target class="h-6 w-6 text-primary" /> My Goals
          </h2>
          <p class="text-sm text-muted-foreground mt-1">
            Set your financial goals and track progress
          </p>
        </div>
        <Show when={!showNewGoalForm() && goals().length > 0}>
          <Button onClick={() => setShowNewGoalForm(true)}>
            <Plus class="h-4 w-4 mr-2" /> New Goal
          </Button>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={loading()}>
        <Card class="text-center py-12">
          <CardContent>
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p class="text-muted-foreground">Loading goals...</p>
          </CardContent>
        </Card>
      </Show>

      {/* Goals Timeline */}
      <Show when={!loading() && goals().length > 0 && !showNewGoalForm()}>
        <GoalTimelineList
          goals={goals()}
          currency={currency()}
          onComponentUpdate={handleComponentUpdate}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />
      </Show>

      {/* Empty State / New Goal Form */}
      <Show when={!loading() && (goals().length === 0 || showNewGoalForm())}>
        <div class="space-y-6">
          {/* Form Header */}
          <Show when={showNewGoalForm() && goals().length > 0}>
            <h3 class="text-lg font-semibold text-foreground">
              {editingGoalId() ? 'Edit Goal' : 'New Goal'}
            </h3>
          </Show>

          {/* Goal Presets */}
          <Card>
            <CardContent class="p-6">
              <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Target class="h-5 w-5 text-primary" /> Quick goal
              </h3>
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <For each={presets}>
                  {(preset) => (
                    <button
                      type="button"
                      class={`p-3 rounded-xl border transition-all flex flex-col items-center gap-2 text-center hover:scale-[1.02] active:scale-[0.98] ${
                        goalName() === preset.name
                          ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
                          : 'border-border bg-card hover:border-primary/50 text-foreground'
                      }`}
                      onClick={() => applyPreset(preset)}
                    >
                      <span class="text-2xl mb-1">{preset.icon}</span>
                      <div class="flex flex-col">
                        <span class="font-medium text-sm">{preset.name}</span>
                        <span class="text-xs text-muted-foreground">
                          {formatCurrency(preset.amount, currency())}
                        </span>
                      </div>
                      <Show when={preset.components.length > 0}>
                        <span class="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1">
                          {preset.components.length} steps
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </CardContent>
          </Card>

          {/* Goal Details */}
          <Card>
            <CardContent class="p-6">
              <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Pencil class="h-5 w-5 text-primary" /> Details
              </h3>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-muted-foreground mb-1">
                    Goal name
                  </label>
                  <Input
                    type="text"
                    placeholder="Ex: Summer vacation"
                    value={goalName()}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setGoalName(e.currentTarget.value)
                    }
                  />
                </div>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Amount ({currencySymbol()})
                    </label>
                    <Input
                      type="number"
                      min="50"
                      max="10000"
                      value={goalAmount()}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setGoalAmount(parseInt(e.currentTarget.value) || 0)
                      }
                    />
                  </div>

                  <div>
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Deadline
                    </label>
                    <Input
                      type="date"
                      value={goalDeadline() || ''}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setGoalDeadline(e.currentTarget.value)
                      }
                      min={new Date().toISOString().split('T')[0]}
                      class="dark:[color-scheme:dark]"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            class="flex items-center gap-2 text-sm text-primary hover:text-primary/80"
            onClick={() => setShowAdvanced(!showAdvanced())}
          >
            <span>{showAdvanced() ? '▼' : '▶'}</span>
            <span>Advanced options (components, conditional goals)</span>
          </button>

          {/* Advanced Options */}
          <Show when={showAdvanced()}>
            {/* Goal Components */}
            <Card class="border-primary/20">
              <CardContent class="p-6">
                <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                  <Package class="h-5 w-5 text-primary" /> Goal Components
                </h3>
                <p class="text-sm text-muted-foreground mb-4">
                  Break down your goal into smaller steps or milestones
                </p>

                <Show when={components().length > 0}>
                  <div class="space-y-2 mb-4">
                    <For each={components()}>
                      {(comp) => (
                        <div class="flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border">
                          <div class="flex items-center gap-3">
                            <span class="text-xl">{getTypeIcon(comp.type)}</span>
                            <div>
                              <p class="font-medium text-foreground">{comp.name}</p>
                              <div class="flex gap-3 text-xs text-muted-foreground">
                                <Show when={comp.estimatedHours > 0}>
                                  <span>{comp.estimatedHours}h</span>
                                </Show>
                                <Show when={comp.estimatedCost > 0}>
                                  <span>{formatCurrency(comp.estimatedCost, currency())}</span>
                                </Show>
                                <Show when={comp.dependsOn.length > 0}>
                                  <span class="text-amber-600">
                                    Requires: {comp.dependsOn.join(', ')}
                                  </span>
                                </Show>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={() => removeComponent(comp.id)}
                          >
                            <X class="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    type="text"
                    placeholder="Component name"
                    value={newComponent().name}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewComponent({ ...newComponent(), name: e.currentTarget.value })
                    }
                  />
                  <Select
                    value={newComponent().type}
                    onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                      setNewComponent({
                        ...newComponent(),
                        type: e.currentTarget.value as GoalComponent['type'],
                      })
                    }
                    options={[
                      { value: 'milestone', label: '🎯 Milestone' },
                      { value: 'exam', label: '📝 Exam/Test' },
                      { value: 'time_allocation', label: '⏰ Time allocation' },
                      { value: 'purchase', label: '🛒 Purchase' },
                      { value: 'other', label: '📋 Other' },
                    ]}
                    class="w-full"
                  />
                  <div class="relative">
                    <Input
                      type="number"
                      placeholder="Hours"
                      min="0"
                      value={newComponent().estimatedHours || ''}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setNewComponent({
                          ...newComponent(),
                          estimatedHours: parseInt(e.currentTarget.value) || 0,
                        })
                      }
                      class="pr-8"
                    />
                    <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                      h
                    </span>
                  </div>
                  <Input
                    type="number"
                    placeholder={`Cost (${currencySymbol()})`}
                    min="0"
                    value={newComponent().estimatedCost || ''}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewComponent({
                        ...newComponent(),
                        estimatedCost: parseInt(e.currentTarget.value) || 0,
                      })
                    }
                  />
                </div>

                <Show when={components().length > 0}>
                  <div class="mt-3">
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Depends on (optional)
                    </label>
                    <div class="relative">
                      <select
                        class="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        multiple
                        value={newComponent().dependsOn}
                        onChange={(e: Event & { currentTarget: HTMLSelectElement }) => {
                          const selected = Array.from(e.currentTarget.selectedOptions).map(
                            (o: HTMLOptionElement) => o.value
                          );
                          setNewComponent({ ...newComponent(), dependsOn: selected });
                        }}
                      >
                        <For each={components()}>
                          {(comp) => <option value={comp.name}>{comp.name}</option>}
                        </For>
                      </select>
                    </div>
                  </div>
                </Show>

                <Button
                  variant="outline"
                  size="sm"
                  class="mt-3 w-full border-dashed"
                  onClick={addComponent}
                >
                  <Plus class="h-4 w-4 mr-2" /> Add component
                </Button>
              </CardContent>
            </Card>

            {/* Conditional Goal */}
            <Show when={availableParentGoals().length > 0}>
              <Card class="border-amber-200 dark:border-amber-800">
                <CardContent class="p-6">
                  <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Clock class="h-5 w-5 text-amber-600" /> Conditional Goal
                  </h3>
                  <p class="text-sm text-muted-foreground mb-4">
                    Make this goal start after another goal is completed
                  </p>

                  <div class="space-y-4">
                    <div>
                      <label class="block text-sm font-medium text-muted-foreground mb-1">
                        Start this goal after
                      </label>
                      <Select
                        value={parentGoalId() || ''}
                        onChange={(e: Event & { currentTarget: HTMLSelectElement }) => {
                          setParentGoalId(e.currentTarget.value || null);
                          if (e.currentTarget.value) {
                            setConditionType('after_completion');
                          } else {
                            setConditionType('none');
                          }
                        }}
                        options={[
                          { value: '', label: 'No condition (start immediately)' },
                          ...availableParentGoals().map((g) => ({
                            value: g.id,
                            label: `${g.name} (${formatCurrency(g.amount, currency())})`,
                          })),
                        ]}
                        class="w-full"
                      />
                    </div>

                    <Show when={parentGoalId()}>
                      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        <p class="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                          <AlertCircle class="h-4 w-4 mt-0.5" />
                          This goal will be in "waiting" status until the selected goal is
                          completed.
                        </p>
                      </div>
                    </Show>
                  </div>
                </CardContent>
              </Card>
            </Show>
          </Show>

          {/* Academic Events */}
          {/* Academic Events */}
          <Card>
            <CardContent class="p-6">
              <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <GraduationCap class="h-5 w-5 text-primary" /> Academic events
              </h3>
              <p class="text-sm text-muted-foreground mb-4">
                Add your exam periods or vacations to adapt your goals
              </p>

              <Show when={academicEvents().length > 0}>
                <div class="space-y-2 mb-4">
                  <For each={academicEvents()}>
                    {(event) => (
                      <div class="flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border">
                        <div class="flex items-center gap-3">
                          <span class="text-xl">
                            {event.type === 'exam_period'
                              ? '📝'
                              : event.type === 'vacation'
                                ? '🏖️'
                                : event.type === 'internship'
                                  ? '💼'
                                  : event.type === 'project_deadline'
                                    ? '⏰'
                                    : '📚'}
                          </span>
                          <div>
                            <p class="font-medium text-foreground">{event.name}</p>
                            <p class="text-xs text-muted-foreground">
                              {new Date(event.startDate).toLocaleDateString()} -{' '}
                              {new Date(event.endDate).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div class="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            class="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8"
                            onClick={() => editAcademicEvent(event)}
                            title="Edit event"
                          >
                            <Pencil class="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                            onClick={() =>
                              setDeleteEventConfirm({ id: event.id, name: event.name })
                            }
                            title="Delete event"
                          >
                            <Trash2 class="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <Select
                  value={newEvent().type}
                  onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                    setNewEvent({
                      ...newEvent(),
                      type: e.currentTarget.value as AcademicEvent['type'],
                    })
                  }
                  options={[
                    { value: 'exam_period', label: '📝 Exam period' },
                    { value: 'vacation', label: '🏖️ Vacation' },
                    { value: 'internship', label: '💼 Internship' },
                    { value: 'class_intensive', label: '📚 Intensive class' },
                    { value: 'project_deadline', label: '⏰ Deadline' },
                  ]}
                  class="w-full"
                />
                <Input
                  type="text"
                  placeholder="Event name"
                  value={newEvent().name}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setNewEvent({ ...newEvent(), name: e.currentTarget.value })
                  }
                />

                {/* Dates Section - Spans 2 columns to allow side-by-side date pickers with checkbox */}
                <div class="col-span-1 md:col-span-2 flex items-start gap-4">
                  <div class="flex-1">
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      Start date
                    </label>
                    <Input
                      type="date"
                      value={newEvent().startDate}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setNewEvent({
                          ...newEvent(),
                          startDate: e.currentTarget.value,
                          endDate: isSameDay() ? e.currentTarget.value : newEvent().endDate,
                        })
                      }
                      class="dark:[color-scheme:dark]"
                    />
                  </div>

                  <div class="flex flex-col justify-end h-full pb-2">
                    <label
                      class="flex flex-col items-center gap-1 cursor-pointer"
                      title="The event ends on the same day"
                    >
                      <input
                        type="checkbox"
                        class="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4"
                        checked={isSameDay()}
                        onChange={(e) => {
                          setIsSameDay(e.currentTarget.checked);
                          if (e.currentTarget.checked) {
                            setNewEvent({ ...newEvent(), endDate: newEvent().startDate });
                          }
                        }}
                      />
                      <span class="text-[10px] text-muted-foreground whitespace-nowrap">
                        Same day
                      </span>
                    </label>
                  </div>

                  <div class="flex-1">
                    <label class="block text-sm font-medium text-muted-foreground mb-1">
                      End date
                    </label>
                    <Input
                      type="date"
                      value={newEvent().endDate}
                      disabled={isSameDay()}
                      onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                        setNewEvent({ ...newEvent(), endDate: e.currentTarget.value })
                      }
                      class={`dark:[color-scheme:dark] ${isSameDay() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                class="mt-3 w-full border-dashed"
                onClick={addAcademicEvent}
              >
                <Plus class="h-4 w-4 mr-2" /> Add event
              </Button>
            </CardContent>
          </Card>

          {/* Commitments */}
          <Card>
            <CardContent class="p-6">
              <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Clock class="h-5 w-5 text-primary" /> Current Commitments
              </h3>
              <p class="text-sm text-muted-foreground mb-4">
                Regular activities that take up your time
              </p>

              <Show when={commitments().length > 0}>
                <div class="space-y-2 mb-4">
                  <For each={commitments()}>
                    {(commitment) => (
                      <div class="flex items-center justify-between bg-muted/50 rounded-lg p-3 border border-border">
                        <div class="flex items-center gap-3">
                          <span class="text-xl">
                            {commitment.type === 'sport'
                              ? '⚽'
                              : commitment.type === 'class'
                                ? '📚'
                                : commitment.type === 'club'
                                  ? '👥'
                                  : '📌'}
                          </span>
                          <div>
                            <p class="font-medium text-foreground">{commitment.name}</p>
                            <p class="text-xs text-muted-foreground">
                              {commitment.hoursPerWeek}h / week
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          class="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                          onClick={() =>
                            setDeleteCommitmentConfirm({
                              id: commitment.id,
                              name: commitment.name,
                            })
                          }
                          title="Delete commitment"
                        >
                          <Trash2 class="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select
                  value={newCommitment().type}
                  onChange={(e: Event & { currentTarget: HTMLSelectElement }) =>
                    setNewCommitment({
                      ...newCommitment(),
                      type: e.currentTarget.value as Commitment['type'],
                    })
                  }
                  options={[
                    { value: 'class', label: '📚 Class' },
                    { value: 'sport', label: '⚽ Sport' },
                    { value: 'club', label: '👥 Club' },
                    { value: 'family', label: '🏠 Family' },
                    { value: 'health', label: '❤️ Health' },
                    { value: 'other', label: '📌 Other' },
                  ]}
                  class="w-full"
                />

                <Input
                  type="text"
                  placeholder="Activity name"
                  value={newCommitment().name}
                  onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                    setNewCommitment({ ...newCommitment(), name: e.currentTarget.value })
                  }
                />

                <div class="relative">
                  <Input
                    type="number"
                    min="1"
                    max="168"
                    placeholder="Hours/week"
                    value={newCommitment().hoursPerWeek || ''}
                    onInput={(e: InputEvent & { currentTarget: HTMLInputElement }) =>
                      setNewCommitment({
                        ...newCommitment(),
                        hoursPerWeek: parseInt(e.currentTarget.value) || 0,
                      })
                    }
                    class="pr-8"
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm pointer-events-none">
                    h
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                class="mt-3 w-full border-dashed"
                onClick={addCommitment}
              >
                <Plus class="h-4 w-4 mr-2" /> Add commitment
              </Button>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div class="flex gap-4">
            <Button
              variant="outline"
              class="flex-1 bg-[#F4F4F5] hover:bg-[#E4E4E7] dark:bg-[#27272A] dark:hover:bg-[#3F3F46] border-border"
              onClick={resetForm}
            >
              Cancel
            </Button>
            <Button class="flex-1" onClick={handleSave} disabled={!goalName() || goalAmount() <= 0}>
              <CheckCircle2 class="h-4 w-4 mr-2" />
              {editingGoalId() ? 'Update Goal' : 'Create Goal'}
            </Button>
          </div>
        </div>
      </Show>

      {/* Feature J: Delete confirmation dialogs */}
      <ConfirmDialog
        isOpen={!!deleteEventConfirm()}
        title="Delete event?"
        message={`Delete "${deleteEventConfirm()?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          removeAcademicEvent(deleteEventConfirm()!.id);
          setDeleteEventConfirm(null);
        }}
        onCancel={() => setDeleteEventConfirm(null)}
      />
      <ConfirmDialog
        isOpen={!!deleteCommitmentConfirm()}
        title="Delete commitment?"
        message={`Delete "${deleteCommitmentConfirm()?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          removeCommitment(deleteCommitmentConfirm()!.id);
          setDeleteCommitmentConfirm(null);
        }}
        onCancel={() => setDeleteCommitmentConfirm(null)}
      />

      {/* Sprint 9.5: Replace goal confirmation */}
      <ConfirmDialog
        isOpen={!!replaceGoalConfirm()}
        title="Replace current goal?"
        message={`You already have an active goal: "${replaceGoalConfirm()?.name}". Creating a new goal will archive it. Continue?`}
        confirmLabel="Replace"
        variant="warning"
        onConfirm={handleReplaceGoalConfirm}
        onCancel={() => setReplaceGoalConfirm(null)}
      />
    </div>
  );
}
