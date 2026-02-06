import { createSignal, createEffect, Show } from 'solid-js';
import { Pencil, CheckCircle2, Clock, AlertCircle } from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { DatePicker } from '~/components/ui/DatePicker';
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { createDirtyState } from '~/hooks/createDirtyState';
import { formatCurrency, toISODate, todayISO } from '~/lib/dateUtils';
import type { Goal } from '~/lib/profileContext';
import type { Currency } from '~/lib/dateUtils';
import {
  AcademicEventsSection,
  CommitmentsSection,
  GoalPresetsSection,
  GoalComponentsSection,
  DEFAULT_PRESETS,
  type AcademicEvent,
  type Commitment,
  type ComponentFormItem,
  type GoalPreset,
} from './index';

interface GoalFormProps {
  mode: 'create' | 'edit';
  initialData?: Goal;
  availableParentGoals: Goal[];
  currency: Currency;
  currencySymbol: string;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function GoalForm(props: GoalFormProps) {
  // Form State
  const [goalName, setGoalName] = createSignal('');
  const [goalAmount, setGoalAmount] = createSignal(500);
  const [goalDeadline, setGoalDeadline] = createSignal('');
  const [academicEvents, setAcademicEvents] = createSignal<AcademicEvent[]>([]);
  const [commitments, setCommitments] = createSignal<Commitment[]>([]);

  // Advanced Options
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [components, setComponents] = createSignal<ComponentFormItem[]>([]);
  const [parentGoalId, setParentGoalId] = createSignal<string | null>(null);
  const [conditionType, setConditionType] = createSignal<
    'none' | 'after_completion' | 'after_date'
  >('none');

  // Sub-forms state
  const [newComponent, setNewComponent] = createSignal<Partial<ComponentFormItem>>({
    name: '',
    type: 'milestone',
    estimatedHours: 0,
    estimatedCost: 0,
    dependsOn: [],
  });

  const [newEvent, setNewEvent] = createSignal<Partial<AcademicEvent>>({
    type: 'exam_period',
    name: '',
    startDate: '',
    endDate: '',
  });
  const [editingEventId, setEditingEventId] = createSignal<string | null>(null);
  const [isSameDay, setIsSameDay] = createSignal(false);

  const [newCommitment, setNewCommitment] = createSignal<Partial<Commitment>>({
    type: 'class',
    name: '',
    hoursPerWeek: 2,
  });

  // Delete Confirmations
  const [deleteEventConfirm, setDeleteEventConfirm] = createSignal<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteCommitmentConfirm, setDeleteCommitmentConfirm] = createSignal<{
    id: string;
    name: string;
  } | null>(null);

  // Dirty State Tracking
  const {
    isDirty,
    setOriginal: setDirtyOriginal,
    clear: clearDirty,
  } = createDirtyState({
    getCurrentValues: () => ({
      goalName: goalName(),
      goalAmount: goalAmount(),
      goalDeadline: goalDeadline(),
      academicEvents: academicEvents(),
      commitments: commitments(),
      components: components(),
      parentGoalId: parentGoalId(),
      conditionType: conditionType(),
    }),
  });

  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Initialize form with data
  createEffect(() => {
    if (props.initialData) {
      const g = props.initialData;
      setGoalName(g.name);
      setGoalAmount(g.amount);
      setGoalDeadline(g.deadline || '');

      const planData = g.planData as
        | { academicEvents?: AcademicEvent[]; commitments?: Commitment[] }
        | undefined;
      setAcademicEvents(planData?.academicEvents || []);
      setCommitments(planData?.commitments || []);

      if (g.components && g.components.length > 0) {
        setComponents(
          g.components.map((c: any) => ({
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

      if (g.parentGoalId) {
        setParentGoalId(g.parentGoalId);
        setConditionType(g.conditionType || 'none');
        setShowAdvanced(true);
      }
    } else {
      // Default deadline for new goals (8 weeks)
      const defaultDeadline = new Date();
      defaultDeadline.setDate(defaultDeadline.getDate() + 56);
      setGoalDeadline(toISODate(defaultDeadline));
    }

    // Set original state for dirty tracking after initialization
    // We use a small timeout to let signals settle
    setTimeout(() => setDirtyOriginal(), 0);
  });

  const handleApplyPreset = (preset: GoalPreset) => {
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

  const handleCancel = () => {
    if (isDirty()) {
      setShowUnsavedDialog(true);
    } else {
      clearDirty();
      props.onCancel();
    }
  };

  const handleDiscard = () => {
    setShowUnsavedDialog(false);
    clearDirty();
    props.onCancel();
  };

  const handleSubmit = async () => {
    if (!goalName() || goalAmount() <= 0) return;

    const planData = {
      academicEvents: academicEvents(),
      commitments: commitments(),
    };

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

    const payload = {
      name: goalName(),
      amount: goalAmount(),
      deadline: goalDeadline(),
      planData,
      components: apiComponents,
      parentGoalId: parentGoalId() || undefined,
      conditionType: conditionType(),
    };

    await props.onSave(payload);
    clearDirty();
  };

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h3 class="text-lg font-semibold text-foreground">
          {props.mode === 'edit' ? 'Edit Goal' : 'New Goal'}
        </h3>
      </div>

      <Show when={props.mode === 'create'}>
        <GoalPresetsSection
          selectedName={goalName}
          onSelect={handleApplyPreset}
          currency={props.currency}
          presets={DEFAULT_PRESETS}
        />
      </Show>

      {/* Main Details */}
      <Card>
        <CardContent class="p-6">
          <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Pencil class="h-5 w-5 text-primary" /> Details
          </h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-muted-foreground mb-1">Goal name</label>
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
                  Amount ({props.currencySymbol})
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
                <DatePicker
                  label="Deadline"
                  value={goalDeadline() || ''}
                  onChange={(date) => setGoalDeadline(date)}
                  min={todayISO()}
                  fullWidth={false}
                />
                <Show when={goalDeadline() && goalDeadline() < todayISO()}>
                  <p class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 mt-1">
                    <AlertCircle class="h-3 w-3" />
                    This deadline has passed — pick a new date
                  </p>
                </Show>
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

      <Show when={showAdvanced()}>
        <GoalComponentsSection
          components={components}
          setComponents={setComponents}
          newComponent={newComponent}
          setNewComponent={setNewComponent}
          currency={props.currency}
          currencySymbol={props.currencySymbol}
        />

        <Show when={props.availableParentGoals.length > 0}>
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
                      ...props.availableParentGoals.map((g) => ({
                        value: g.id,
                        label: `${g.name} (${formatCurrency(g.amount, props.currency)})`,
                      })),
                    ]}
                    class="w-full"
                  />
                </div>

                <Show when={parentGoalId()}>
                  <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <p class="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                      <AlertCircle class="h-4 w-4 mt-0.5" />
                      This goal will be in "waiting" status until the selected goal is completed.
                    </p>
                  </div>
                </Show>
              </div>
            </CardContent>
          </Card>
        </Show>
      </Show>

      {/* Sections */}
      <AcademicEventsSection
        events={academicEvents}
        setEvents={setAcademicEvents}
        newEvent={newEvent}
        setNewEvent={setNewEvent}
        editingEventId={editingEventId}
        setEditingEventId={setEditingEventId}
        isSameDay={isSameDay}
        setIsSameDay={setIsSameDay}
        onDeleteRequest={(event) => setDeleteEventConfirm(event)}
      />

      <CommitmentsSection
        commitments={commitments}
        setCommitments={setCommitments}
        newCommitment={newCommitment}
        setNewCommitment={setNewCommitment}
        onDeleteRequest={(commit) => setDeleteCommitmentConfirm(commit)}
      />

      {/* Actions - Sticky Footer */}
      <div class="sticky bottom-6 bg-background/95 backdrop-blur border border-border rounded-lg p-4 shadow-lg flex gap-3 z-10">
        <Button variant="outline" class="flex-1" onClick={handleCancel}>
          Cancel
        </Button>
        <Button class="flex-1" onClick={handleSubmit} disabled={!goalName() || goalAmount() <= 0}>
          <CheckCircle2 class="h-4 w-4 mr-2" />
          {props.mode === 'edit' ? 'Update Goal' : 'Create Goal'}
        </Button>
      </div>

      {/* Dialogs */}
      <ConfirmDialog
        isOpen={!!deleteEventConfirm()}
        title="Delete event?"
        message={`Delete "${deleteEventConfirm()?.name}"?`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          setAcademicEvents((prev) => prev.filter((e) => e.id !== deleteEventConfirm()?.id));
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
          setCommitments((prev) => prev.filter((c) => c.id !== deleteCommitmentConfirm()?.id));
          setDeleteCommitmentConfirm(null);
        }}
        onCancel={() => setDeleteCommitmentConfirm(null)}
      />

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog()}
        onDiscard={handleDiscard}
        onKeepEditing={() => setShowUnsavedDialog(false)}
      />
    </div>
  );
}
