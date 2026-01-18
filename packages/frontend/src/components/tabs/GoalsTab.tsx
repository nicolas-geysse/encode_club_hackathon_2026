/**
 * Goals Tab Component
 *
 * Lists existing goals and allows creating new ones.
 * Supports complex goals with components and conditional goals.
 * Uses goalService for DuckDB persistence.
 */

import { createSignal, createMemo, Show, For, onMount } from 'solid-js';
import { goalService, type Goal, type GoalComponent } from '~/lib/goalService';
import { profileService } from '~/lib/profileService';
import { GoalTimelineList } from '~/components/GoalTimeline';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';

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
  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  const [loading, setLoading] = createSignal(true);
  const [goals, setGoals] = createSignal<Goal[]>([]);
  const [profileId, setProfileId] = createSignal<string | null>(null);
  const [showNewGoalForm, setShowNewGoalForm] = createSignal(false);
  const [editingGoalId, setEditingGoalId] = createSignal<string | null>(null);

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
  const [newCommitment, setNewCommitment] = createSignal<Partial<Commitment>>({
    type: 'class',
    name: '',
    hoursPerWeek: 2,
  });

  // Available parent goals for conditional goals
  const availableParentGoals = createMemo(() => {
    const currentId = editingGoalId();
    return goals().filter(
      (g) => g.status === 'active' && g.id !== currentId && !g.parentGoalId // Can't chain conditional goals
    );
  });

  // Load goals on mount
  onMount(async () => {
    try {
      const profile = await profileService.loadActiveProfile();
      if (profile) {
        setProfileId(profile.id);
        const userGoals = await goalService.listGoals(profile.id, { status: 'all' });
        setGoals(userGoals);

        // If no goals and we have initial data from plan, pre-fill the form
        if (userGoals.length === 0 && props.initialData?.goalName) {
          setShowNewGoalForm(true);
        }
      }

      // Set default deadline if not set
      if (!goalDeadline()) {
        const defaultDeadline = new Date();
        defaultDeadline.setDate(defaultDeadline.getDate() + 56);
        setGoalDeadline(defaultDeadline.toISOString().split('T')[0]);
      }
    } catch (error) {
      console.error('[GoalsTab] Failed to load goals:', error);
    } finally {
      setLoading(false);
    }
  });

  // Refresh goals
  const refreshGoals = async () => {
    if (!profileId()) return;
    const userGoals = await goalService.listGoals(profileId()!, { status: 'all' });
    setGoals(userGoals);
  };

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

  const handleSave = async () => {
    if (!goalName() || goalAmount() <= 0 || !goalDeadline() || !profileId()) return;

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

    // Refresh goals list
    await refreshGoals();
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
    if (!confirm('Are you sure you want to delete this goal?')) return;

    await goalService.deleteGoal(goalId);
    await refreshGoals();
  };

  const handleToggleStatus = async (goal: Goal) => {
    const newStatus = goal.status === 'completed' ? 'active' : 'completed';
    const confirmMessage =
      newStatus === 'completed'
        ? `Mark "${goal.name}" as completed?`
        : `Reactivate "${goal.name}"?`;

    if (!confirm(confirmMessage)) return;

    await goalService.updateGoal({
      id: goal.id,
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : goal.progress,
    });
    await refreshGoals();
  };

  // Handle component status update from timeline
  const handleComponentUpdate = async (
    _goalId: string,
    _componentId: string,
    _status: GoalComponent['status']
  ) => {
    // TODO: Implement API endpoint for component updates
    // For now, just refresh the goals
    await refreshGoals();
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
    <div class="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <span>🎯</span> My Goals
          </h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Set your financial goals and track progress
          </p>
        </div>
        <Show when={!showNewGoalForm() && goals().length > 0}>
          <button type="button" class="btn-primary" onClick={() => setShowNewGoalForm(true)}>
            + New Goal
          </button>
        </Show>
      </div>

      {/* Loading State */}
      <Show when={loading()}>
        <div class="card text-center py-12">
          <div class="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p class="text-slate-500 dark:text-slate-400">Loading goals...</p>
        </div>
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
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingGoalId() ? 'Edit Goal' : 'New Goal'}
            </h3>
          </Show>

          {/* Goal Presets */}
          <div class="card">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span>🎯</span> Quick goal
            </h3>
            <div class="flex gap-3 flex-wrap">
              <For each={presets}>
                {(preset) => (
                  <button
                    type="button"
                    class={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                      goalName() === preset.name
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 bg-[#FAFBFC] dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                    }`}
                    onClick={() => applyPreset(preset)}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                    <span class="text-sm text-slate-500 dark:text-slate-400">
                      ({formatCurrency(preset.amount, currency())})
                    </span>
                    <Show when={preset.components.length > 0}>
                      <span class="text-xs bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-300 px-1.5 py-0.5 rounded">
                        {preset.components.length} steps
                      </span>
                    </Show>
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* Goal Details */}
          <div class="card">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span>💰</span> Details
            </h3>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Goal name
                </label>
                <input
                  type="text"
                  class="input-field"
                  placeholder="Ex: Summer vacation"
                  value={goalName()}
                  onInput={(e) => setGoalName(e.currentTarget.value)}
                />
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Amount ({currencySymbol()})
                  </label>
                  <input
                    type="number"
                    class="input-field"
                    min="50"
                    max="10000"
                    value={goalAmount()}
                    onInput={(e) => setGoalAmount(parseInt(e.currentTarget.value) || 0)}
                  />
                </div>

                <div>
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Deadline
                  </label>
                  <input
                    type="date"
                    class="input-field"
                    value={goalDeadline() || ''}
                    onInput={(e) => setGoalDeadline(e.currentTarget.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Options Toggle */}
          <button
            type="button"
            class="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700"
            onClick={() => setShowAdvanced(!showAdvanced())}
          >
            <span>{showAdvanced() ? '▼' : '▶'}</span>
            <span>Advanced options (components, conditional goals)</span>
          </button>

          {/* Advanced Options */}
          <Show when={showAdvanced()}>
            {/* Goal Components */}
            <div class="card border-primary-200 dark:border-primary-700">
              <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span>📦</span> Goal Components
              </h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Break down your goal into smaller steps or milestones
              </p>

              <Show when={components().length > 0}>
                <div class="space-y-2 mb-4">
                  <For each={components()}>
                    {(comp) => (
                      <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                        <div class="flex items-center gap-3">
                          <span>{getTypeIcon(comp.type)}</span>
                          <div>
                            <p class="font-medium text-slate-800 dark:text-slate-200">
                              {comp.name}
                            </p>
                            <div class="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
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
                        <button
                          type="button"
                          class="text-red-500 hover:text-red-700"
                          onClick={() => removeComponent(comp.id)}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <div class="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  class="input-field"
                  placeholder="Component name"
                  value={newComponent().name}
                  onInput={(e) =>
                    setNewComponent({ ...newComponent(), name: e.currentTarget.value })
                  }
                />
                <select
                  class="input-field"
                  value={newComponent().type}
                  onChange={(e) =>
                    setNewComponent({
                      ...newComponent(),
                      type: e.currentTarget.value as GoalComponent['type'],
                    })
                  }
                >
                  <option value="milestone">🎯 Milestone</option>
                  <option value="exam">📝 Exam/Test</option>
                  <option value="time_allocation">⏰ Time allocation</option>
                  <option value="purchase">🛒 Purchase</option>
                  <option value="other">📋 Other</option>
                </select>
                <div class="relative">
                  <input
                    type="number"
                    class="input-field pr-8"
                    placeholder="Hours"
                    min="0"
                    value={newComponent().estimatedHours || ''}
                    onInput={(e) =>
                      setNewComponent({
                        ...newComponent(),
                        estimatedHours: parseInt(e.currentTarget.value) || 0,
                      })
                    }
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                    h
                  </span>
                </div>
                <input
                  type="number"
                  class="input-field"
                  placeholder={`Cost (${currencySymbol()})`}
                  min="0"
                  value={newComponent().estimatedCost || ''}
                  onInput={(e) =>
                    setNewComponent({
                      ...newComponent(),
                      estimatedCost: parseInt(e.currentTarget.value) || 0,
                    })
                  }
                />
              </div>

              <Show when={components().length > 0}>
                <div class="mt-3">
                  <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Depends on (optional)
                  </label>
                  <select
                    class="input-field"
                    multiple
                    value={newComponent().dependsOn}
                    onChange={(e) => {
                      const selected = Array.from(e.currentTarget.selectedOptions).map(
                        (o) => o.value
                      );
                      setNewComponent({ ...newComponent(), dependsOn: selected });
                    }}
                  >
                    <For each={components()}>
                      {(comp) => <option value={comp.name}>{comp.name}</option>}
                    </For>
                  </select>
                </div>
              </Show>

              <button
                type="button"
                class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
                onClick={addComponent}
              >
                + Add component
              </button>
            </div>

            {/* Conditional Goal */}
            <Show when={availableParentGoals().length > 0}>
              <div class="card border-amber-200 dark:border-amber-700">
                <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                  <span>⏳</span> Conditional Goal
                </h3>
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Make this goal start after another goal is completed
                </p>

                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Start this goal after
                    </label>
                    <select
                      class="input-field"
                      value={parentGoalId() || ''}
                      onChange={(e) => {
                        setParentGoalId(e.currentTarget.value || null);
                        if (e.currentTarget.value) {
                          setConditionType('after_completion');
                        } else {
                          setConditionType('none');
                        }
                      }}
                    >
                      <option value="">No condition (start immediately)</option>
                      <For each={availableParentGoals()}>
                        {(goal) => (
                          <option value={goal.id}>
                            {goal.name} ({formatCurrency(goal.amount, currency())})
                          </option>
                        )}
                      </For>
                    </select>
                  </div>

                  <Show when={parentGoalId()}>
                    <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                      <p class="text-sm text-amber-700 dark:text-amber-300">
                        This goal will be in "waiting" status until the selected goal is completed.
                      </p>
                    </div>
                  </Show>
                </div>
              </div>
            </Show>
          </Show>

          {/* Academic Events */}
          <div class="card">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span>📅</span> Academic events
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Add your exam periods or vacations to adapt your goals
            </p>

            <Show when={academicEvents().length > 0}>
              <div class="space-y-2 mb-4">
                <For each={academicEvents()}>
                  {(event) => (
                    <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                      <div class="flex items-center gap-3">
                        <span>
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
                          <p class="font-medium text-slate-800 dark:text-slate-200">{event.name}</p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            {new Date(event.startDate).toLocaleDateString('en-US')} -{' '}
                            {new Date(event.endDate).toLocaleDateString('en-US')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-red-500 hover:text-red-700"
                        onClick={() => removeAcademicEvent(event.id)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="grid grid-cols-2 gap-3">
              <select
                class="input-field"
                value={newEvent().type}
                onChange={(e) =>
                  setNewEvent({
                    ...newEvent(),
                    type: e.currentTarget.value as AcademicEvent['type'],
                  })
                }
              >
                <option value="exam_period">📝 Exams</option>
                <option value="vacation">🏖️ Vacation</option>
                <option value="class_intensive">📚 Intensive classes</option>
                <option value="internship">💼 Internship</option>
                <option value="project_deadline">⏰ Project deadline</option>
              </select>
              <input
                type="text"
                class="input-field"
                placeholder="Name (ex: Midterms S1)"
                value={newEvent().name}
                onInput={(e) => setNewEvent({ ...newEvent(), name: e.currentTarget.value })}
              />
              <input
                type="date"
                class="input-field"
                value={newEvent().startDate || ''}
                onInput={(e) => setNewEvent({ ...newEvent(), startDate: e.currentTarget.value })}
              />
              <input
                type="date"
                class="input-field"
                value={newEvent().endDate || ''}
                onInput={(e) => setNewEvent({ ...newEvent(), endDate: e.currentTarget.value })}
              />
            </div>
            <button
              type="button"
              class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={addAcademicEvent}
            >
              + Add this event
            </button>
          </div>

          {/* Commitments */}
          <div class="card">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
              <span>📋</span> Regular commitments
            </h3>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Indicate your activities that take time each week
            </p>

            <Show when={commitments().length > 0}>
              <div class="space-y-2 mb-4">
                <For each={commitments()}>
                  {(commitment) => (
                    <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-700 rounded-lg p-3">
                      <div class="flex items-center gap-3">
                        <span>
                          {commitment.type === 'class'
                            ? '📚'
                            : commitment.type === 'sport'
                              ? '⚽'
                              : commitment.type === 'club'
                                ? '🎭'
                                : commitment.type === 'family'
                                  ? '👨‍👩‍👧'
                                  : commitment.type === 'health'
                                    ? '🏥'
                                    : '📌'}
                        </span>
                        <div>
                          <p class="font-medium text-slate-800 dark:text-slate-200">
                            {commitment.name}
                          </p>
                          <p class="text-xs text-slate-500 dark:text-slate-400">
                            {commitment.hoursPerWeek}h/week
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        class="text-red-500 hover:text-red-700"
                        onClick={() => removeCommitment(commitment.id)}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class="grid grid-cols-3 gap-3">
              <select
                class="input-field"
                value={newCommitment().type}
                onChange={(e) =>
                  setNewCommitment({
                    ...newCommitment(),
                    type: e.currentTarget.value as Commitment['type'],
                  })
                }
              >
                <option value="class">📚 Classes</option>
                <option value="sport">⚽ Sport</option>
                <option value="club">🎭 Club/Association</option>
                <option value="family">👨‍👩‍👧 Family</option>
                <option value="health">🏥 Health</option>
                <option value="other">📌 Other</option>
              </select>
              <input
                type="text"
                class="input-field"
                placeholder="Name (ex: Basketball)"
                value={newCommitment().name}
                onInput={(e) =>
                  setNewCommitment({ ...newCommitment(), name: e.currentTarget.value })
                }
              />
              <div class="relative">
                <input
                  type="number"
                  class="input-field pr-14"
                  min="1"
                  max="40"
                  value={newCommitment().hoursPerWeek}
                  onInput={(e) =>
                    setNewCommitment({
                      ...newCommitment(),
                      hoursPerWeek: parseInt(e.currentTarget.value) || 0,
                    })
                  }
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                  h/wk
                </span>
              </div>
            </div>
            <button
              type="button"
              class="mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
              onClick={addCommitment}
            >
              + Add this commitment
            </button>
          </div>

          {/* Action Buttons */}
          <div class="flex justify-center gap-3">
            <Show when={showNewGoalForm() && goals().length > 0}>
              <button type="button" class="btn-secondary text-lg px-8 py-3" onClick={resetForm}>
                Cancel
              </button>
            </Show>
            <button
              type="button"
              class="btn-primary text-lg px-8 py-3"
              onClick={handleSave}
              disabled={!goalName() || goalAmount() <= 0 || !goalDeadline()}
            >
              {editingGoalId() ? 'Update goal' : 'Create goal'}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
