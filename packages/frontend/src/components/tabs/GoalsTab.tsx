/**
 * Goals Tab Component
 *
 * Lists existing goals and allows creating new ones.
 * Supports complex goals with components and conditional goals.
 * Uses goalService for DuckDB persistence.
 *
 * Refactored v5.0: Dashboard-first design with isolated components.
 */

import { createSignal, createMemo, createEffect, createResource, Show, onMount } from 'solid-js';
import { useSearchParams } from '@solidjs/router';
import { goalService } from '~/lib/goalService';
import { profileService } from '~/lib/profileService';
import { useProfile, type Goal } from '~/lib/profileContext';
import { createLogger } from '~/lib/logger';

const logger = createLogger('GoalsTab');
import { ConfirmDialog } from '~/components/ui/ConfirmDialog';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Plus, Target } from 'lucide-solid';
import { RetroplanPanel } from '~/components/RetroplanPanel';
import { SavingsAdjustModal } from '~/components/suivi/SavingsAdjustModal';
import type { Mission } from '~/components/suivi/MissionCard';
import { type OneTimeGains, getEmptyOneTimeGains } from '~/lib/progressCalculator';
import { useGoalData } from '~/hooks/useGoalData';
import type { EarningEvent } from '~/types/earnings';

// New Components
import { GoalForm } from './goals/GoalForm';
import { ActiveGoalDashboard } from './goals/ActiveGoalDashboard';
import { OtherGoalsList } from './goals/OtherGoalsList';
import type { Currency } from '~/lib/dateUtils';
import { getCurrencySymbol } from '~/lib/dateUtils';
import type { AcademicEvent } from './goals';

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
  savingsAdjustments?: Record<string, SavingsAdjustment>;
}

interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
  academicEvents: AcademicEvent[];
  commitments: any[]; // using explicit imports in GoalForm
}

interface GoalsTabProps {
  onComplete: (data: SetupData) => void;
  initialData?: Partial<SetupData>;
  currency?: Currency;
  onDirtyChange?: (isDirty: boolean) => void;
  simulatedDate?: Date;
}

export function GoalsTab(props: GoalsTabProps) {
  // URL params for deep linking
  const [searchParams] = useSearchParams();

  // Profile Context
  const context = useProfile();
  const goals = () => context.goals();
  const profile = () => context.profile();
  const refreshProfile = () => context.refreshProfile({ silent: true });

  const contextIncome = () => context.income();
  const contextLifestyle = () => context.lifestyle();

  const currency = () => props.currency || 'USD';
  const profileId = () => profile()?.id || null;
  const loading = () => context.loading();

  // Monthly Margin Calculation
  const monthlyMargin = createMemo(() => {
    const incomeItems = contextIncome();
    const lifestyleItems = contextLifestyle();

    const incomeTotal = incomeItems.reduce((sum, item) => sum + item.amount, 0);
    const expensesTotal = lifestyleItems
      .filter((item) => item.pausedMonths === 0)
      .reduce((sum, item) => sum + item.currentCost, 0);

    if (incomeTotal === 0 && expensesTotal === 0) return undefined;
    return incomeTotal - expensesTotal;
  });

  const followupData = () => profile()?.followupData as FollowupData | undefined;

  // Active Goal Accessor
  const activeGoal = createMemo(() => goals().find((g) => g.status === 'active'));
  const otherGoals = createMemo(() => goals().filter((g) => g.status !== 'active'));

  // Profile Accessor for Hooks
  const profileAccessor = createMemo(() => profile() ?? undefined);
  const simulatedDateAccessor = () => props.simulatedDate;

  // Use Goal Data Hook
  // eslint-disable-next-line solid/reactivity
  const goalData = useGoalData(
    activeGoal,
    profileAccessor,
    {
      includeSimulation: false,
      simulatedDateAccessor,
    },
    contextIncome,
    contextLifestyle
  );

  // Force refetch on mount
  onMount(() => {
    setTimeout(() => {
      goalData.refetch();
    }, 50);

    // Auto-open new goal form if action=new
    const action = Array.isArray(searchParams.action)
      ? searchParams.action[0]
      : searchParams.action;
    if (action === 'new') {
      setShowNewGoalForm(true);
    }
  });

  // UI State
  const [showNewGoalForm, setShowNewGoalForm] = createSignal(false);
  const [editingGoalId, setEditingGoalId] = createSignal<string | null>(null);
  const [showRetroplan, setShowRetroplan] = createSignal<Goal | null>(null);

  // Savings Adjust Modal State
  const [showSavingsAdjust, setShowSavingsAdjust] = createSignal(false);
  const [adjustingWeek, setAdjustingWeek] = createSignal<{
    weekNumber: number;
    amount: number;
  } | null>(null);

  const [replaceGoalConfirm, setReplaceGoalConfirm] = createSignal<Goal | null>(null);
  const [pendingSavePayload, setPendingSavePayload] = createSignal<any>(null);

  // Reset UI logic
  const resetMode = () => {
    setShowNewGoalForm(false);
    setEditingGoalId(null);
    setPendingSavePayload(null);
    setReplaceGoalConfirm(null);
  };

  // --- Handlers ---

  const handleEdit = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setShowNewGoalForm(true);
  };

  const handleDelete = async (goalId: string) => {
    await goalService.deleteGoal(goalId);
  };

  const handleToggleStatus = async (goal: Goal) => {
    let newStatus: 'active' | 'completed' | 'paused';
    if (goal.status === 'active') {
      newStatus = 'completed';
    } else {
      newStatus = 'active';
    }

    if (newStatus === 'active') {
      const activeGoals = goals().filter((g) => g.status === 'active');
      for (const oldGoal of activeGoals) {
        await goalService.updateGoal({
          id: oldGoal.id,
          status: 'paused',
        });
      }
    }

    await goalService.updateGoal({
      id: goal.id,
      status: newStatus,
      progress: newStatus === 'completed' ? 100 : goal.progress,
    });
  };

  const handleSaveGoal = async (payload: any) => {
    // If creating new active goal, check for existing active goals
    if (!editingGoalId() && (payload.conditionType === 'none' || !payload.conditionType)) {
      const activeGoals = goals().filter((g) => g.status === 'active');
      if (activeGoals.length > 0) {
        setPendingSavePayload(payload);
        setReplaceGoalConfirm(activeGoals[0]);
        return;
      }
    }
    await performSave(payload);
  };

  const performSave = async (payload: any) => {
    // Verify user
    if (!profileId()) return;

    if (editingGoalId()) {
      await goalService.updateGoal({
        id: editingGoalId()!,
        ...payload,
      });
    } else {
      await goalService.createGoal({
        profileId: profileId()!,
        ...payload,
        status: payload.conditionType !== 'none' && payload.parentGoalId ? 'waiting' : 'active',
      });
    }

    // Sync profile generic fields
    const currentProfile = profile();
    if (currentProfile) {
      try {
        await profileService.saveProfile(
          {
            ...currentProfile,
            id: profileId()!,
            goalName: payload.name,
            goalAmount: payload.amount,
            goalDeadline: payload.deadline,
          },
          { setActive: false }
        );
        await refreshProfile();
      } catch (err) {
        logger.warn('Failed to sync profile', { error: err });
      }
    }

    props.onComplete({
      goalName: payload.name,
      goalAmount: payload.amount,
      goalDeadline: payload.deadline,
      academicEvents: payload.planData.academicEvents,
      commitments: payload.planData.commitments,
    });

    resetMode();
  };

  const handleReplaceGoalConfirm = async () => {
    // Archive old goal
    if (replaceGoalConfirm()) {
      await goalService.updateGoal({
        id: replaceGoalConfirm()!.id,
        status: 'paused',
      });
    }
    // Proceed with save
    if (pendingSavePayload()) {
      await performSave(pendingSavePayload());
    }
    setReplaceGoalConfirm(null);
  };

  // --- Derived Metrics & Data (moved from monolithic component) ---

  // Restore original progress calculation logic (per user request)
  // This separates "Visual Progress" from "Backend Calculated Progress" to match legacy behavior
  const [budgetData] = createResource(
    () => profileId(),
    async (id) => {
      if (!id) return null;
      try {
        const res = await fetch(`/api/budget?profileId=${id}`);
        return res.ok ? res.json() : null;
      } catch {
        return null;
      }
    }
  );

  const oneTimeGains = (): OneTimeGains => {
    const b = budgetData()?.budget;
    if (!b?.oneTimeGains) return getEmptyOneTimeGains();
    return b.oneTimeGains;
  };

  const adjustedProgress = (goal: Goal): number => {
    // Dynamic progress from hook (reactive to date/savings changes).
    // This allows the progress to update immediately when simulating future dates or adjusting savings.
    const stats = goalData.stats();

    logger.debug('Dynamic Progress', {
      percentComplete: stats.percentComplete,
      totalEarned: stats.totalEarned,
      isSimulated: !!props.simulatedDate,
      missionEarnings: profile()?.followupData?.currentAmount,
    });

    return stats.percentComplete;
  };

  // Stats for charts
  const weeklyCardsRetroplan = createMemo(() => {
    const rp = goalData.retroplan();
    if (!rp) return null;
    return { milestones: rp.milestones, feasibilityScore: rp.feasibilityScore };
  });

  // Stable Feasibility Score: prevents "Calculating..." flash
  // Uses signal + effect for persistent caching of last valid value
  const [cachedFeasibilityScore, setCachedFeasibilityScore] = createSignal<number | null>(null);

  createEffect(() => {
    const rp = goalData.retroplan();
    if (rp && typeof rp.feasibilityScore === 'number') {
      setCachedFeasibilityScore(rp.feasibilityScore);
    }
  });

  const transformEarningsToWeekly = (events: EarningEvent[]) => {
    const map = new Map<number, number>();
    events.forEach((e) => map.set(e.weekNumber, (map.get(e.weekNumber) || 0) + e.amount));
    return Array.from(map.entries())
      .map(([week, earned]) => ({ week, earned }))
      .sort((a, b) => a.week - b.week);
  };

  const weeklyEarnings = createMemo(() => transformEarningsToWeekly(goalData.earnings()));

  const transformToChart = (events: EarningEvent[]) => {
    const map = new Map();
    events.forEach((e) => map.set(e.weekNumber, (map.get(e.weekNumber) || 0) + e.amount));
    const weeks = Array.from(map.keys()).sort((a, b) => a - b);
    let cumulative = 0;
    return weeks.map((week) => {
      const earned = map.get(week) || 0;
      cumulative += earned;
      return { week, weekLabel: `W${week}`, earned, cumulative };
    });
  };

  const chartWeeklyEarnings = createMemo(() => transformToChart(goalData.earnings()));
  const projectedChartEarnings = createMemo(() => transformToChart(goalData.projectedEarnings()));

  const avgAdjustedTarget = createMemo(() => {
    const m = goalData.retroplan()?.milestones;
    if (!m) return null;
    const targets = m.map((x) => x.adjustedTarget).filter((t): t is number => t != null && t > 0);
    return targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : null;
  });

  const maxEarnings = createMemo(() => {
    const m = goalData.retroplan()?.milestones;
    return m
      ? Math.round(m.reduce((sum, x) => sum + (x.capacity?.maxEarningPotential || 0), 0))
      : null;
  });

  // --- Handlers for Savings Adjust ---
  const handleSavingsAdjust = async (amount: number, note?: string) => {
    const week = adjustingWeek();
    if (!week) return;
    const currentFollowup: Partial<FollowupData> = followupData() || {};
    const updated = {
      ...currentFollowup,
      savingsAdjustments: {
        ...(currentFollowup.savingsAdjustments || {}),
        [week.weekNumber]: { amount, note, adjustedAt: new Date().toISOString() },
      },
    };

    const p = profile();
    if (p) {
      await profileService.saveProfile({ ...p, followupData: updated }, { setActive: false });
      await refreshProfile();
      goalData.refetch();
    }
    setShowSavingsAdjust(false);
    setAdjustingWeek(null);
  };

  // --- Render ---

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

      {/* Loading */}
      <Show when={loading()}>
        <Card class="text-center py-12">
          <CardContent>
            <div class="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p class="text-muted-foreground">Loading goals...</p>
          </CardContent>
        </Card>
      </Show>

      {/* Main Content Switch */}
      <Show when={!loading()}>
        <Show
          when={showNewGoalForm()}
          fallback={
            /* VIEW MODE */
            <Show
              when={goals().length > 0}
              fallback={
                /* EMPTY STATE */
                <Card class="border-dashed">
                  <CardContent class="p-6 text-center">
                    <p class="text-muted-foreground mb-3">
                      No active goal. Create a new one to get started.
                    </p>
                    <Button onClick={() => setShowNewGoalForm(true)}>
                      <Plus class="h-4 w-4 mr-2" /> New Goal
                    </Button>
                  </CardContent>
                </Card>
              }
            >
              <div class="space-y-8">
                {/* ACTIVE GOAL DASHBOARD */}
                <Show when={activeGoal()}>
                  {(goal) => (
                    <ActiveGoalDashboard
                      goal={goal()}
                      currency={currency()}
                      adjustedProgress={adjustedProgress(goal())}
                      feasibilityScore={cachedFeasibilityScore()}
                      riskFactors={goalData.retroplan()?.riskFactors ?? []}
                      maxEarnings={maxEarnings()}
                      daysRemaining={null} // Calculated inside component if null
                      formattedDeadline={null} // Calculated inside component if null
                      weeklyEarnings={weeklyEarnings()}
                      simulatedDate={props.simulatedDate}
                      hourlyRate={profile()?.minHourlyRate}
                      incomeDay={profile()?.incomeDay}
                      monthlyMargin={monthlyMargin()}
                      savingsAdjustments={followupData()?.savingsAdjustments}
                      weeklyCardsRetroplan={weeklyCardsRetroplan()}
                      onAdjustSavings={(week, amount) => {
                        setAdjustingWeek({ weekNumber: week, amount });
                        setShowSavingsAdjust(true);
                      }}
                      userId={profileId() || undefined}
                      chartStats={goalData.stats()}
                      weeklyChartEarnings={chartWeeklyEarnings()}
                      projectedChartEarnings={projectedChartEarnings()}
                      chartMilestones={goalData.milestones()}
                      avgAdjustedTarget={avgAdjustedTarget() || undefined}
                      onEdit={() => handleEdit(goal())}
                      onToggleStatus={() => handleToggleStatus(goal())}
                      onDelete={() => handleDelete(goal().id)}
                      onShowRetroplan={() => setShowRetroplan(goal())}
                      isLoading={goalData.loading()}
                    />
                  )}
                </Show>

                {/* OTHER GOALS LIST */}
                <OtherGoalsList
                  goals={otherGoals()}
                  currency={currency()}
                  onEdit={handleEdit}
                  onReactivate={handleToggleStatus}
                  onDelete={handleDelete}
                />
              </div>
            </Show>
          }
        >
          {/* EDIT MODE */}
          <GoalForm
            mode={editingGoalId() ? 'edit' : 'create'}
            initialData={
              editingGoalId() ? goals().find((g) => g.id === editingGoalId()) : undefined
            }
            availableParentGoals={goals().filter(
              (g) => g.status === 'active' && g.id !== editingGoalId()
            )}
            currency={currency()}
            currencySymbol={getCurrencySymbol(currency())}
            onSave={handleSaveGoal}
            onCancel={resetMode}
          />
        </Show>
      </Show>

      {/* Modals */}
      <Show when={showRetroplan()}>
        {(goal) => (
          <div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <RetroplanPanel
                goalId={goal().id}
                goalName={goal().name}
                goalAmount={goal().amount}
                goalDeadline={goal().deadline || ''}
                userId={profileId() || undefined}
                currency={currency()}
                academicEvents={(goal().planData as any)?.academicEvents || []}
                hourlyRate={profile()?.minHourlyRate}
                simulatedDate={props.simulatedDate}
                monthlyMargin={monthlyMargin()}
                onClose={() => setShowRetroplan(null)}
              />
            </div>
          </div>
        )}
      </Show>

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

      <ConfirmDialog
        isOpen={!!replaceGoalConfirm()}
        title="Replace current goal?"
        message={`You already have an active goal: "${replaceGoalConfirm()?.name}". Creating a new goal will archive it. Continue?`}
        confirmLabel="Replace"
        variant="warning"
        onConfirm={handleReplaceGoalConfirm}
        onCancel={() => {
          setReplaceGoalConfirm(null);
          setPendingSavePayload(null);
        }}
      />
    </div>
  );
}
