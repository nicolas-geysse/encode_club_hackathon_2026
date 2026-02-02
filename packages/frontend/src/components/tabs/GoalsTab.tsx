/**
 * Goals Tab Component
 *
 * Lists existing goals and allows creating new ones.
 * Supports complex goals with components and conditional goals.
 * Uses goalService for DuckDB persistence.
 * Uses createCrudTab hook for common CRUD state management.
 */

import {
  createSignal,
  createMemo,
  createEffect,
  createResource,
  Show,
  For,
  onMount,
} from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { goalService } from '~/lib/goalService';
import { profileService } from '~/lib/profileService';
import { useProfile, type Goal, type GoalComponent } from '~/lib/profileContext';
import { createCrudTab } from '~/hooks/createCrudTab';
import { createDirtyState } from '~/hooks/createDirtyState';
import { UnsavedChangesDialog } from '~/components/ui/UnsavedChangesDialog';
import { createLogger } from '~/lib/logger';

const logger = createLogger('GoalsTab');
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { formatCurrency, getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Select } from '~/components/ui/Select';
import { DatePicker } from '~/components/ui/DatePicker';
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
  Check,
  TrendingUp,
  RotateCcw,
} from 'lucide-solid';
import { RetroplanPanel } from '~/components/RetroplanPanel';
import { WeeklyProgressCards } from '~/components/WeeklyProgressCards';
import { EarningsChart } from '~/components/EarningsChart';
import { SavingsAdjustModal } from '~/components/suivi/SavingsAdjustModal';
import GoalComponentsList from '~/components/GoalComponentsList';
import type { Mission } from '~/components/suivi/MissionCard';
import {
  calculateTotalProgress,
  type OneTimeGains,
  getEmptyOneTimeGains,
} from '~/lib/progressCalculator';
import { useGoalData } from '~/hooks/useGoalData';
import type { EarningEvent } from '~/types/earnings';

// FollowupData structure from /suivi page (stored in profile.followupData)
interface SavingsAdjustment {
  amount: number;
  note?: string;
  adjustedAt: string;
}

interface FollowupData {
  currentAmount: number;
  weeklyTarget: number;
  currentWeek: number;
  totalWeeks: number;
  missions: Mission[];
  savingsAdjustments?: Record<number, SavingsAdjustment>;
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
  /** Callback when dirty state changes (for parent to track unsaved changes) */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Sprint 13: Simulated date for testing (defaults to current date) */
  simulatedDate?: Date;
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
  const refreshProfile = () => context.refreshProfile({ silent: true });

  // Bug 3 Fix: Use profile context for income/lifestyle data (for pig badges)
  const contextIncome = () => context.income();
  const contextLifestyle = () => context.lifestyle();

  // Currency from props, defaults to USD
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

  // Derived profileId from context
  const profileId = () => profile()?.id || null;

  // Combine context loading with local initialization
  const loading = () => context.loading();

  // Bug 3 Fix: Calculate monthly margin from actual DB data (income_items - lifestyle_items)
  const monthlyMargin = createMemo(() => {
    const incomeItems = contextIncome();
    const lifestyleItems = contextLifestyle();

    const incomeTotal = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const expensesTotal = lifestyleItems
      .filter((item) => item.pausedMonths === 0) // Only count active expenses
      .reduce((sum, item) => sum + item.currentCost, 0);

    // Return undefined if no data (to preserve fallback behavior)
    if (incomeTotal === 0 && expensesTotal === 0) {
      return undefined;
    }

    return incomeTotal - expensesTotal;
  });

  // Get followup data from profile for weekly earnings (used by WeeklyProgressCards)
  const followupData = () => profile()?.followupData as FollowupData | undefined;

  // Get the active goal as an accessor for useGoalData hook
  const activeGoal = createMemo(() => goals().find((g) => g.status === 'active'));

  // Create profile accessor that normalizes null to undefined (for hook compatibility)
  const profileAccessor = createMemo(() => profile() ?? undefined);

  // Create simulated date accessor for reactive time simulation
  const simulatedDateAccessor = () => props.simulatedDate;

  // Use centralized hook for goal data (v4.0 Goals Tab Fix)
  // Note: ESLint reactivity warning is a false positive - hook uses these accessors
  // inside createResource which is a tracked scope. This is the correct SolidJS pattern.
  // eslint-disable-next-line solid/reactivity
  const goalData = useGoalData(
    activeGoal,
    profileAccessor,
    {
      includeSimulation: false,
      simulatedDateAccessor, // Reactive: re-fetches retroplan when simulation date changes
    },
    // Pass income/lifestyle accessors for reactive margin calculation
    // This ensures Goals tab updates when Budget tab changes income/expenses
    contextIncome,
    contextLifestyle
  );

  // Memoized retroplan for WeeklyProgressCards - ensures reactive updates when data loads
  // This fixes the initial load bug where exam week didn't show reduced target
  const weeklyCardsRetroplan = createMemo(() => {
    const rp = goalData.retroplan();
    if (!rp) return null;
    return {
      milestones: rp.milestones,
      feasibilityScore: rp.feasibilityScore,
    };
  });

  // Memoized data for EarningsChart - ensures reactive updates
  const chartMilestones = createMemo(() => goalData.milestones());
  const chartStats = createMemo(() => goalData.stats());

  // === EARNINGS TRANSFORMATION UTILITIES ===
  // Convert EarningEvent[] from hook to formats needed by child components

  /**
   * Transform EarningEvent[] to weekly format for WeeklyProgressCards
   * Groups earnings by week number and sums amounts
   */
  const transformEarningsToWeekly = (
    events: EarningEvent[]
  ): Array<{ week: number; earned: number }> => {
    const weekMap = new Map<number, number>();
    for (const event of events) {
      const current = weekMap.get(event.weekNumber) || 0;
      weekMap.set(event.weekNumber, current + event.amount);
    }
    return Array.from(weekMap.entries())
      .map(([week, earned]) => ({ week, earned }))
      .sort((a, b) => a.week - b.week);
  };

  // Derive weekly earnings from hook data (replaces old missions-only transform)
  const weeklyEarnings = createMemo(() => {
    return transformEarningsToWeekly(goalData.earnings());
  });

  /**
   * Interface for EarningsChart weekly data
   * Includes weekLabel and cumulative for chart rendering
   */
  interface ChartWeeklyEarning {
    week: number;
    weekLabel: string;
    earned: number;
    cumulative: number;
  }

  /**
   * Transform EarningEvent[] to chart format for EarningsChart
   * Includes cumulative totals and week labels
   *
   * Ensures correct week attribution (EARN-01, EARN-02, EARN-03):
   * - Monthly savings at correct weeks (via hook earnings)
   * - Completed trades at completion date (via hook earnings)
   * - Missions at correct week (via completedAt/updatedAt in aggregator)
   */
  const transformEarningsToChartFormat = (events: EarningEvent[]): ChartWeeklyEarning[] => {
    const weekMap = new Map<number, number>();

    for (const event of events) {
      const current = weekMap.get(event.weekNumber) || 0;
      weekMap.set(event.weekNumber, current + event.amount);
    }

    const weeks = Array.from(weekMap.keys()).sort((a, b) => a - b);
    let cumulative = 0;

    return weeks.map((week) => {
      const earned = weekMap.get(week) || 0;
      cumulative += earned;
      return {
        week,
        weekLabel: `W${week}`,
        earned,
        cumulative,
      };
    });
  };

  // Derive chart-format earnings from hook data (past earnings for "Actual" line)
  const chartWeeklyEarnings = createMemo(() => {
    return transformEarningsToChartFormat(goalData.earnings());
  });

  // Derive projected earnings including future scheduled (for "Projected" line)
  const projectedChartWeeklyEarnings = createMemo(() => {
    return transformEarningsToChartFormat(goalData.projectedEarnings());
  });

  // Fetch budget data for one-time gains (trades + paused subscriptions)
  const [budgetData] = createResource(
    () => profileId(),
    async (id) => {
      if (!id) return null;
      try {
        const response = await fetch(`/api/budget?profileId=${id}`);
        if (!response.ok) return null;
        return response.json();
      } catch {
        return null;
      }
    }
  );

  // Extract oneTimeGains from budget response for progress calculation
  const oneTimeGains = (): OneTimeGains => {
    const budget = budgetData()?.budget;
    if (!budget?.oneTimeGains) return getEmptyOneTimeGains();
    return {
      tradeSales: budget.oneTimeGains.tradeSales || 0,
      tradeBorrow: budget.oneTimeGains.tradeBorrow || 0,
      pausedSavings: budget.oneTimeGains.pausedSavings || 0,
    };
  };

  // Calculate adjusted progress including one-time gains
  const adjustedProgress = (goal: Goal): number => {
    // Get base progress percentage from the goal
    const baseProgress = goal.progress || 0;
    const goalAmount = goal.amount || 0;

    // Reverse calculate current amount from stored progress percentage
    const currentAmount = (baseProgress / 100) * goalAmount;

    // Calculate total progress including one-time gains
    const totalProgress = calculateTotalProgress(currentAmount, oneTimeGains());

    // Return percentage capped at 100%
    return goalAmount > 0 ? Math.min(100, Math.round((totalProgress / goalAmount) * 100)) : 0;
  };

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
  // Flag to prevent re-initialization during user typing (e.g., typing "500" while entering "5000")
  const [amountInitialized, setAmountInitialized] = createSignal(!!props.initialData?.goalAmount);
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

  // Dirty state tracking for unsaved changes dialog
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

  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = createSignal(false);

  // Notify parent when dirty state changes
  createEffect(() => {
    props.onDirtyChange?.(isDirty());
  });

  // New event/commitment forms
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

  // Retroplan panel state
  const [showRetroplan, setShowRetroplan] = createSignal<Goal | null>(null);

  // Savings adjustment modal state
  const [showSavingsAdjust, setShowSavingsAdjust] = createSignal(false);
  const [adjustingWeek, setAdjustingWeek] = createSignal<{
    weekNumber: number;
    amount: number;
  } | null>(null);

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
    if (amount && !amountInitialized()) {
      // Only update if not yet initialized (prevents reset during user typing)
      setGoalAmount(amount);
      setAmountInitialized(true);
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
      openNewGoalForm();
    }
  });

  // Show new goal form if no goals and we have initial data (only after loading completes)
  createEffect(() => {
    const currentGoals = goals();
    const isLoading = loading();
    if (
      !isLoading &&
      currentGoals.length === 0 &&
      props.initialData?.goalName &&
      !showNewGoalForm()
    ) {
      openNewGoalForm();
    }
  });

  // refreshGoals is now from ProfileContext (single source of truth)
  // NOTE: Auto-completion (Feature K) was removed - it caused race conditions
  // when navigating away and back (client-side Set was reset, causing re-completion).
  // Users should manually mark goals as complete via the checkmark button.

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

  const addOrUpdateAcademicEvent = () => {
    const event = newEvent();
    if (!event.name || !event.startDate || !event.endDate) return;

    const editingId = editingEventId();
    if (editingId) {
      // Update existing event
      setAcademicEvents(
        academicEvents().map((e) =>
          e.id === editingId ? ({ ...event, id: editingId } as AcademicEvent) : e
        )
      );
      setEditingEventId(null);
    } else {
      // Add new event
      setAcademicEvents([
        ...academicEvents(),
        { ...event, id: `event_${Date.now()}` } as AcademicEvent,
      ]);
    }
    // Reset form
    setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
    setIsSameDay(false);
  };

  const cancelEditEvent = () => {
    setEditingEventId(null);
    setNewEvent({ type: 'exam_period', name: '', startDate: '', endDate: '' });
    setIsSameDay(false);
  };

  const removeAcademicEvent = (id: string) => {
    setAcademicEvents(academicEvents().filter((e) => e.id !== id));
    // If we're editing this event, cancel the edit
    if (editingEventId() === id) {
      cancelEditEvent();
    }
  };

  // Edit event: populate form but DON'T remove from list
  const editAcademicEvent = (event: AcademicEvent) => {
    setEditingEventId(event.id);
    setNewEvent({
      type: event.type,
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    setIsSameDay(event.startDate === event.endDate);
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
    setAmountInitialized(false); // Allow re-initialization from props
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
    clearDirty(); // Clear dirty state when form closes
  };

  // Handle cancel - shows confirmation dialog if there are unsaved changes
  const handleCancel = () => {
    if (isDirty()) {
      setShowUnsavedDialog(true);
    } else {
      resetForm();
    }
  };

  // Discard changes and close form (called from unsaved changes dialog)
  const handleDiscardChanges = () => {
    setShowUnsavedDialog(false);
    resetForm();
  };

  // Open new goal form with dirty state tracking
  const openNewGoalForm = () => {
    setShowNewGoalForm(true);
    // Capture initial empty/default state for dirty tracking
    setDirtyOriginal();
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
        components: apiComponents,
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

    // Capture values BEFORE resetForm() since it clears the signals
    const savedGoalName = goalName();
    const savedGoalAmount = goalAmount();
    const savedGoalDeadline = goalDeadline();
    const savedAcademicEvents = academicEvents();
    const savedCommitments = commitments();

    // Note: goalService emits DATA_CHANGED, debounced listener handles refresh
    resetForm();

    // Sync profile's goalAmount/goalName/goalDeadline for consistency with Setup tab
    // This ensures the primary goal info is reflected on the profile
    const currentProfile = profile();
    if (currentProfile && profileId()) {
      try {
        await profileService.saveProfile(
          {
            ...currentProfile,
            id: profileId()!,
            goalName: savedGoalName,
            goalAmount: savedGoalAmount,
            goalDeadline: savedGoalDeadline,
          },
          { setActive: false }
        );
        logger.debug('Profile synced with goal data');

        // Refresh the profile context so other tabs see the updated values
        await refreshProfile();
      } catch (syncError) {
        // Non-critical - goal was saved successfully
        logger.warn('Failed to sync profile with goal', { syncError });
      }
    }

    // Also call onComplete for backward compatibility with plan.tsx
    props.onComplete({
      goalName: savedGoalName,
      goalAmount: savedGoalAmount,
      goalDeadline: savedGoalDeadline,
      academicEvents: savedAcademicEvents,
      commitments: savedCommitments,
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
    setAmountInitialized(true); // Prevent re-initialization from props
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
    // Capture the loaded values as the "original" for dirty state tracking
    // Must be called after all setters have been invoked
    setDirtyOriginal();
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

  // Savings adjustment handlers
  const handleOpenSavingsAdjust = (weekNumber: number, currentAmount: number) => {
    setAdjustingWeek({ weekNumber, amount: currentAmount });
    setShowSavingsAdjust(true);
  };

  const handleSavingsAdjust = async (amount: number, note?: string) => {
    const week = adjustingWeek();
    if (!week) return;

    const currentFollowup: Partial<FollowupData> = followupData() || {};
    const currentAdjustments = currentFollowup.savingsAdjustments || {};

    const updatedFollowup = {
      ...currentFollowup,
      savingsAdjustments: {
        ...currentAdjustments,
        [week.weekNumber]: { amount, note, adjustedAt: new Date().toISOString() },
      },
    };

    const currentProfile = profile();
    if (currentProfile) {
      await profileService.saveProfile(
        { ...currentProfile, followupData: updatedFollowup },
        { setActive: false }
      );
      await refreshProfile();
      // Force retroplan refetch to update weekly targets with new savings adjustments
      goalData.refetch();
    }

    setShowSavingsAdjust(false);
    setAdjustingWeek(null);
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
          <Button onClick={openNewGoalForm}>
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

      {/* Active Goal with Weekly Progress + Chart */}
      <Show when={!loading() && goals().length > 0 && !showNewGoalForm()}>
        {(() => {
          // Note: activeGoal memo is now defined at component level for hook use
          const otherGoals = () => goals().filter((g) => g.status !== 'active');

          return (
            <div class="space-y-6">
              {/* Active Goal Section */}
              <Show when={activeGoal()}>
                {(goal) => {
                  // v4.0: Derive feasibility data from hook instead of inline fetch
                  // The useGoalData hook handles retroplan fetching via createResource
                  const feasibility = () => goalData.retroplan()?.feasibilityScore ?? null;
                  const riskFactors = () => goalData.retroplan()?.riskFactors ?? [];

                  // Calculate max earnings from hook milestones
                  const maxEarnings = createMemo(() => {
                    const milestones = goalData.retroplan()?.milestones;
                    if (!milestones) return null;
                    const total = milestones.reduce(
                      (sum, m) => sum + (m.capacity?.maxEarningPotential || 0),
                      0
                    );
                    return Math.round(total);
                  });

                  // Calculate average adjusted target from hook milestones
                  const avgAdjustedTarget = createMemo(() => {
                    const milestones = goalData.retroplan()?.milestones;
                    if (!milestones) return null;
                    const adjustedTargets = milestones
                      .map((m) => m.adjustedTarget)
                      .filter((t): t is number => t != null && t > 0);
                    if (adjustedTargets.length === 0) return null;
                    const avgTarget =
                      adjustedTargets.reduce((a, b) => a + b, 0) / adjustedTargets.length;
                    return Math.round(avgTarget);
                  });

                  // Calculate days remaining
                  // Sprint 13.17: Use simulatedDate for time-aware days remaining calculation
                  const daysRemaining = () => {
                    if (!goal().deadline) return null;
                    const deadline = new Date(goal().deadline!);
                    const now = props.simulatedDate || new Date();
                    const diffTime = deadline.getTime() - now.getTime();
                    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  };

                  // Format deadline
                  const formattedDeadline = () => {
                    if (!goal().deadline) return null;
                    return new Date(goal().deadline!).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    });
                  };

                  // Deadline color based on urgency
                  const getDeadlineColor = () => {
                    const days = daysRemaining();
                    if (days === null)
                      return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';
                    if (days <= 0)
                      return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300';
                    if (days <= 7)
                      return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300';
                    return 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300';
                  };

                  // Feasibility color and label - styled like capacity breakdown
                  const getFeasibilityInfo = () => {
                    const score = feasibility();
                    if (score === null)
                      return {
                        bg: 'bg-slate-100 dark:bg-slate-700/50',
                        border: 'border-slate-200 dark:border-slate-600',
                        text: 'text-slate-600 dark:text-slate-300',
                        label: '...',
                        icon: '⏳',
                      };
                    if (score >= 0.8)
                      return {
                        bg: 'bg-green-500/10',
                        border: 'border-green-500/40',
                        text: 'text-green-600 dark:text-green-400',
                        label: 'Very achievable',
                        icon: '🚀',
                      };
                    if (score >= 0.6)
                      return {
                        bg: 'bg-emerald-500/10',
                        border: 'border-emerald-500/40',
                        text: 'text-emerald-600 dark:text-emerald-400',
                        label: 'Achievable',
                        icon: '✅',
                      };
                    if (score >= 0.4)
                      return {
                        bg: 'bg-amber-500/10',
                        border: 'border-amber-500/40',
                        text: 'text-amber-600 dark:text-amber-400',
                        label: 'Challenging',
                        icon: '⚠️',
                      };
                    if (score >= 0.15)
                      return {
                        bg: 'bg-red-500/10',
                        border: 'border-red-500/40',
                        text: 'text-red-600 dark:text-red-400',
                        label: 'Very hard',
                        icon: '🔴',
                      };
                    // Below 15% - essentially impossible
                    return {
                      bg: 'bg-red-500/20',
                      border: 'border-red-500/60',
                      text: 'text-red-700 dark:text-red-300',
                      label: 'Unrealistic',
                      icon: '❌',
                    };
                  };

                  return (
                    <Card class="border-primary/30">
                      <CardContent class="p-4 space-y-4">
                        {/* Header Row */}
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-3">
                            <span class="text-2xl">🎯</span>
                            <div>
                              <h3 class="text-lg font-bold text-foreground">{goal().name}</h3>
                              <span class="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                                Active
                              </span>
                            </div>
                          </div>
                          <div class="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(goal())}
                              title="Edit"
                            >
                              <Pencil class="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleStatus(goal())}
                              class="text-green-600"
                              title="Mark Complete"
                            >
                              <CheckCircle2 class="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(goal().id)}
                              class="text-destructive"
                              title="Delete"
                            >
                              <Trash2 class="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Key Metrics Row - Target, Deadline, Progress, Achievable */}
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {/* Target */}
                          <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                              Target
                            </p>
                            <p class="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {formatCurrency(goal().amount, currency())}
                            </p>
                          </div>

                          {/* Deadline */}
                          <div class={`rounded-lg p-3 text-center ${getDeadlineColor()}`}>
                            <p class="text-xs uppercase tracking-wider mb-1 opacity-80">Deadline</p>
                            <Show
                              when={goal().deadline}
                              fallback={<p class="text-lg font-bold">Not set</p>}
                            >
                              <p class="text-lg font-bold">{formattedDeadline()}</p>
                              <p class="text-xs font-medium mt-0.5">
                                {daysRemaining() !== null && daysRemaining()! > 0
                                  ? `${daysRemaining()}d left`
                                  : daysRemaining() === 0
                                    ? 'Today!'
                                    : `${Math.abs(daysRemaining()!)}d overdue`}
                              </p>
                            </Show>
                          </div>

                          {/* Progress (includes one-time gains from trades/paused subs) */}
                          <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
                            <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                              Progress
                            </p>
                            <p class="text-lg font-bold text-primary-600 dark:text-primary-400">
                              {adjustedProgress(goal())}%
                            </p>
                          </div>

                          {/* Achievable */}
                          <div
                            class={`rounded-lg p-3 text-center border-2 ${getFeasibilityInfo().bg} ${getFeasibilityInfo().border}`}
                          >
                            <p
                              class={`text-xs uppercase tracking-wider mb-1 ${getFeasibilityInfo().text} opacity-80`}
                            >
                              Achievable
                            </p>
                            <p class={`text-lg font-bold ${getFeasibilityInfo().text}`}>
                              {getFeasibilityInfo().icon}{' '}
                              {feasibility() !== null
                                ? `${Math.round(feasibility()! * 100)}%`
                                : '...'}
                            </p>
                            <p class={`text-xs font-medium mt-0.5 ${getFeasibilityInfo().text}`}>
                              {getFeasibilityInfo().label}
                            </p>
                          </div>
                        </div>

                        {/* Feasibility Alert - shown when goal exceeds earning capacity */}
                        <Show
                          when={
                            feasibility() !== null &&
                            feasibility()! < 0.5 &&
                            riskFactors().length > 0
                          }
                        >
                          <div
                            class={`rounded-lg p-3 border ${feasibility()! < 0.15 ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/40'}`}
                          >
                            <div class="flex items-start gap-2">
                              <AlertCircle
                                class={`h-5 w-5 mt-0.5 flex-shrink-0 ${feasibility()! < 0.15 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
                              />
                              <div class="flex-1 min-w-0">
                                <p
                                  class={`text-sm font-medium ${feasibility()! < 0.15 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}
                                >
                                  {feasibility()! < 0.15
                                    ? 'Goal exceeds your earning capacity'
                                    : 'Goal requires maximum effort'}
                                </p>
                                <Show when={maxEarnings()}>
                                  <p class="text-xs text-muted-foreground mt-1">
                                    Max earnings possible:{' '}
                                    <span class="font-medium">
                                      {formatCurrency(maxEarnings()!, currency())}
                                    </span>{' '}
                                    (goal: {formatCurrency(goal().amount, currency())})
                                  </p>
                                </Show>
                                <ul class="mt-2 text-xs space-y-1">
                                  <For each={riskFactors().slice(0, 3)}>
                                    {(factor) => <li class="text-muted-foreground">• {factor}</li>}
                                  </For>
                                </ul>
                                <p class="text-xs text-muted-foreground mt-2 italic">
                                  Consider: extending deadline, reducing goal, or increasing work
                                  hours/rate
                                </p>
                              </div>
                            </div>
                          </div>
                        </Show>

                        {/* Goal Components */}
                        <Show when={(goal().components?.length ?? 0) > 0}>
                          <div class="border-t border-border pt-4">
                            <GoalComponentsList
                              goalId={goal().id}
                              currency={currency()}
                              onProgressUpdate={() => {
                                // Refresh goals list when component status changes
                                refreshProfile();
                              }}
                            />
                          </div>
                        </Show>

                        {/* Weekly Progress Cards (horizontal scroll) */}
                        <Show when={goal().deadline}>
                          <div class="border-t border-border pt-4">
                            <h4 class="text-sm font-medium text-muted-foreground mb-3">
                              📅 Weekly Progress
                            </h4>
                            <Show when={goal().id} keyed>
                              {(goalId) => (
                                <WeeklyProgressCards
                                  goal={goals().find((g) => g.id === goalId)!}
                                  currency={currency()}
                                  hourlyRate={profile()?.minHourlyRate}
                                  weeklyEarnings={weeklyEarnings()}
                                  simulatedDate={props.simulatedDate}
                                  incomeDay={profile()?.incomeDay}
                                  monthlyMargin={monthlyMargin()}
                                  savingsAdjustments={followupData()?.savingsAdjustments}
                                  onAdjustSavings={handleOpenSavingsAdjust}
                                  userId={profileId() || undefined}
                                  retroplan={weeklyCardsRetroplan()}
                                />
                              )}
                            </Show>
                          </div>
                        </Show>

                        {/* Earnings Chart */}
                        <div class="border-t border-border pt-4">
                          <h4 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <TrendingUp class="h-4 w-4" /> Earnings vs Goal
                          </h4>
                          <Show when={goal().id} keyed>
                            {(goalId) => (
                              <EarningsChart
                                goal={goals().find((g) => g.id === goalId)!}
                                currency={currency()}
                                adjustedWeeklyTarget={avgAdjustedTarget() ?? undefined}
                                currentSaved={
                                  chartStats().totalEarned || followupData()?.currentAmount
                                }
                                weeklyEarnings={chartWeeklyEarnings()}
                                projectedWeeklyEarnings={projectedChartWeeklyEarnings()}
                                milestones={chartMilestones()}
                                stats={chartStats()}
                                monthlyMargin={monthlyMargin()}
                              />
                            )}
                          </Show>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }}
              </Show>

              {/* Other Goals (completed, paused, waiting) */}
              <Show when={otherGoals().length > 0}>
                <div>
                  <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                    Other Goals ({otherGoals().length})
                  </h3>
                  <div class="space-y-2">
                    <For each={otherGoals()}>
                      {(goal) => (
                        <Card class="opacity-70 hover:opacity-100 transition-opacity">
                          <CardContent class="p-3">
                            <div class="flex items-center justify-between">
                              <div class="flex items-center gap-3">
                                <span class="text-xl">
                                  {goal.status === 'completed'
                                    ? '✅'
                                    : goal.status === 'paused'
                                      ? '📦'
                                      : '⏳'}
                                </span>
                                <div>
                                  <h4 class="font-medium text-foreground">{goal.name}</h4>
                                  <p class="text-xs text-muted-foreground">
                                    {formatCurrency(goal.amount, currency())} • {goal.progress || 0}
                                    % • {goal.status}
                                  </p>
                                </div>
                              </div>
                              <div class="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleEdit(goal)}
                                  class="h-8 w-8"
                                  title="Edit goal"
                                >
                                  <Pencil class="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleStatus(goal)}
                                  class="h-8 w-8 text-amber-600"
                                  title="Reactivate goal"
                                >
                                  <RotateCcw class="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(goal.id)}
                                  class="h-8 w-8 text-destructive"
                                  title="Delete goal"
                                >
                                  <Trash2 class="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* No active goal message */}
              <Show when={!activeGoal() && otherGoals().length > 0}>
                <Card class="border-dashed">
                  <CardContent class="p-6 text-center">
                    <p class="text-muted-foreground mb-3">
                      No active goal. Reactivate one or create a new goal.
                    </p>
                    <Button onClick={openNewGoalForm}>
                      <Plus class="h-4 w-4 mr-2" /> New Goal
                    </Button>
                  </CardContent>
                </Card>
              </Show>
            </div>
          );
        })()}
      </Show>

      {/* Retroplan Panel Modal */}
      <Show when={showRetroplan()}>
        {(goal) => {
          // Extract academic events from goal's planData
          const goalPlanData = goal().planData as { academicEvents?: AcademicEvent[] } | undefined;
          const goalAcademicEvents = goalPlanData?.academicEvents || [];

          return (
            <div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <RetroplanPanel
                  goalId={goal().id}
                  goalName={goal().name}
                  goalAmount={goal().amount}
                  goalDeadline={goal().deadline || ''}
                  userId={profileId() || undefined}
                  currency={currency()}
                  academicEvents={goalAcademicEvents}
                  hourlyRate={profile()?.minHourlyRate}
                  simulatedDate={props.simulatedDate}
                  monthlyMargin={monthlyMargin()}
                  onClose={() => setShowRetroplan(null)}
                />
              </div>
            </div>
          );
        }}
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
          {/* Quick Presets - only show when creating a new goal, not editing */}
          <Show when={!editingGoalId()}>
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
          </Show>

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
                    <DatePicker
                      label="Deadline"
                      value={goalDeadline() || ''}
                      onChange={(date) => setGoalDeadline(date)}
                      min={new Date().toISOString().split('T')[0]}
                      fullWidth={false}
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
                    {(event) => {
                      const isEditing = () => editingEventId() === event.id;
                      return (
                        <div
                          class={`flex items-center justify-between rounded-lg p-3 border transition-colors ${
                            isEditing()
                              ? 'bg-primary/10 border-primary ring-2 ring-primary/20'
                              : 'bg-muted/50 border-border'
                          }`}
                        >
                          <div class="flex items-center gap-3">
                            <span class="text-xl">
                              {event.type === 'exam_period'
                                ? '📝'
                                : event.type === 'vacation' || event.type === 'vacation_available'
                                  ? '🏖️'
                                  : event.type === 'vacation_rest'
                                    ? '📵'
                                    : event.type === 'internship'
                                      ? '💼'
                                      : event.type === 'project_deadline'
                                        ? '⏰'
                                        : '📚'}
                            </span>
                            <div>
                              <p class="font-medium text-foreground">
                                {event.name}
                                {isEditing() && (
                                  <span class="ml-2 text-xs text-primary font-normal">
                                    (editing)
                                  </span>
                                )}
                              </p>
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
                              class={`h-8 w-8 ${
                                isEditing()
                                  ? 'text-primary bg-primary/10'
                                  : 'text-muted-foreground hover:text-primary hover:bg-primary/10'
                              }`}
                              onClick={() =>
                                isEditing() ? cancelEditEvent() : editAcademicEvent(event)
                              }
                              title={isEditing() ? 'Cancel edit' : 'Edit event'}
                            >
                              {isEditing() ? <X class="h-4 w-4" /> : <Pencil class="h-4 w-4" />}
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
                      );
                    }}
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
                    { value: 'vacation_rest', label: '📵 Vacation (rest)' },
                    { value: 'vacation_available', label: '🏖️ Vacation (available)' },
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

                {/* Dates Section - Range DatePicker with "Same day" checkbox */}
                <div class="col-span-1 md:col-span-2">
                  <div class="flex items-end gap-3">
                    <div class="flex-1">
                      <label class="block text-sm font-medium text-muted-foreground mb-1">
                        Dates
                      </label>
                      <DatePicker
                        mode="range"
                        startValue={newEvent().startDate}
                        endValue={isSameDay() ? newEvent().startDate : newEvent().endDate}
                        onRangeChange={(start, end) => {
                          setNewEvent({
                            ...newEvent(),
                            startDate: start,
                            endDate: isSameDay() ? start : end,
                          });
                        }}
                      />
                    </div>
                    <label
                      class="flex flex-col items-center gap-1 cursor-pointer pb-2"
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
                </div>
              </div>

              <div class="flex gap-2 mt-3">
                <Button
                  variant={editingEventId() ? 'default' : 'outline'}
                  size="sm"
                  class={`flex-1 ${editingEventId() ? '' : 'border-dashed'}`}
                  onClick={addOrUpdateAcademicEvent}
                >
                  {editingEventId() ? (
                    <>
                      <Check class="h-4 w-4 mr-2" /> Update event
                    </>
                  ) : (
                    <>
                      <Plus class="h-4 w-4 mr-2" /> Add event
                    </>
                  )}
                </Button>
                <Show when={editingEventId()}>
                  <Button variant="outline" size="sm" onClick={cancelEditEvent}>
                    Cancel
                  </Button>
                </Show>
              </div>
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
              onClick={handleCancel}
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

      {/* Unsaved changes confirmation */}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog()}
        onDiscard={handleDiscardChanges}
        onKeepEditing={() => setShowUnsavedDialog(false)}
      />

      {/* Savings adjustment modal */}
      <Show when={adjustingWeek()}>
        <SavingsAdjustModal
          isOpen={showSavingsAdjust()}
          weekNumber={adjustingWeek()!.weekNumber}
          expectedAmount={monthlyMargin() || 0}
          currentAmount={adjustingWeek()!.amount}
          currency={currency()}
          onSave={handleSavingsAdjust}
          onClose={() => {
            setShowSavingsAdjust(false);
            setAdjustingWeek(null);
          }}
        />
      </Show>
    </div>
  );
}
