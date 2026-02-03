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
  Trash2,
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

// Phase 4 Consolidation: Extracted components
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
} from './goals';

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

// AcademicEvent and Commitment types are now imported from ./goals

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

// ComponentFormItem type is now imported from ./goals

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

  // Budget→Goals sync: Force retroplan refetch when GoalsTab is mounted
  // This ensures Goals tab has fresh data after user modifies budget in another tab
  // The tab is unmounted when switching, so we need to refetch on each mount
  onMount(() => {
    // Small delay to ensure all signals are settled after mount
    setTimeout(() => {
      goalData.refetch();
    }, 50);
  });

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

  // Component handlers now in GoalComponentsSection (Phase 4 Consolidation)
  // Academic event handlers now in AcademicEventsSection (Phase 4 Consolidation)

  // cancelEditEvent kept here for removeAcademicEvent (ConfirmDialog handler)
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

  // editAcademicEvent now in AcademicEventsSection (Phase 4 Consolidation)
  // addCommitment now in CommitmentsSection (Phase 4 Consolidation)

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

  // getTypeIcon now in GoalComponentsSection (Phase 4 Consolidation)

  // Quick presets - now imported from ./goals as DEFAULT_PRESETS

  const applyPreset = (preset: GoalPreset) => {
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
                            <Show when={goal().id}>
                              <WeeklyProgressCards
                                goal={goals().find((g) => g.id === goal().id)!}
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
                            </Show>
                          </div>
                        </Show>

                        {/* Earnings Chart */}
                        <div class="border-t border-border pt-4">
                          <h4 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <TrendingUp class="h-4 w-4" /> Earnings vs Goal
                          </h4>
                          <Show when={goal().id}>
                            <EarningsChart
                              goal={goals().find((g) => g.id === goal().id)!}
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

          {/* Goal Presets - Phase 4 Consolidation: Extracted component */}
          <Show when={!editingGoalId()}>
            <GoalPresetsSection
              selectedName={goalName}
              onSelect={applyPreset}
              currency={currency()}
              presets={DEFAULT_PRESETS}
            />
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
            {/* Goal Components - Phase 4 Consolidation: Extracted component */}
            <GoalComponentsSection
              components={components}
              setComponents={setComponents}
              newComponent={newComponent}
              setNewComponent={setNewComponent}
              currency={currency()}
              currencySymbol={currencySymbol()}
            />

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

          {/* Academic Events - Phase 4 Consolidation: Extracted component */}
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

          {/* Commitments - Phase 4 Consolidation: Extracted component */}
          <CommitmentsSection
            commitments={commitments}
            setCommitments={setCommitments}
            newCommitment={newCommitment}
            setNewCommitment={setNewCommitment}
            onDeleteRequest={(commitment) => setDeleteCommitmentConfirm(commitment)}
          />

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
