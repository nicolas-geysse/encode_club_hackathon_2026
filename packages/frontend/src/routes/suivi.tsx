/**
 * Suivi Page (suivi.tsx)
 *
 * Compact dashboard: Goal Hero + Missions + Energy + Financial Breakdown
 * Uses profileService and simulationService for DuckDB persistence.
 */

import { createSignal, Show, onMount } from 'solid-js';
import { TimelineHero } from '~/components/suivi/TimelineHero';
import { EnergyHistory } from '~/components/suivi/EnergyHistory';
import { ComebackAlert } from '~/components/suivi/ComebackAlert';
import { MissionList } from '~/components/suivi/MissionList';
import { AnalyticsDashboard } from '~/components/analytics/AnalyticsDashboard';
import type { Mission } from '~/components/suivi/MissionCard';
import { profileService, type FullProfile } from '~/lib/profileService';
import { simulationService } from '~/lib/simulationService';
import { goalService, type Goal } from '~/lib/goalService';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { ClipboardList, MessageSquare, Target, Trophy } from 'lucide-solid';
import {
  weeksBetween,
  addWeeks,
  toISO,
  formatDate,
  defaultDeadline90Days,
  type Currency,
} from '~/lib/dateUtils';
import { PageLoader } from '~/components/PageLoader';

// Types
interface SetupData {
  goalName: string;
  goalAmount: number;
  goalDeadline: string;
}

interface EnergyEntry {
  week: number;
  level: number;
  date: string;
}

interface FollowupData {
  currentAmount: number;
  weeklyTarget: number;
  currentWeek: number;
  totalWeeks: number;
  energyHistory: EnergyEntry[];
  missions: Mission[];
}

/**
 * Normalize followup data to ensure all required fields exist.
 * Handles corrupted/incomplete data from localStorage or DB.
 */
const normalizeFollowup = (data: Partial<FollowupData> | null | undefined): FollowupData => ({
  currentAmount: data?.currentAmount ?? 0,
  weeklyTarget: data?.weeklyTarget ?? 0,
  currentWeek: data?.currentWeek ?? 1,
  totalWeeks: data?.totalWeeks ?? 8,
  energyHistory: Array.isArray(data?.energyHistory) ? data.energyHistory : [],
  missions: Array.isArray(data?.missions) ? data.missions : [],
});

export default function SuiviPage() {
  const [isLoading, setIsLoading] = createSignal(true);
  const [hasData, setHasData] = createSignal(false);
  const [setup, setSetup] = createSignal<SetupData | null>(null);
  const [activeProfile, setActiveProfile] = createSignal<FullProfile | null>(null);
  const [currentDate, setCurrentDate] = createSignal<Date>(new Date());
  const [followup, setFollowup] = createSignal<FollowupData>({
    currentAmount: 0,
    weeklyTarget: 0,
    currentWeek: 1,
    totalWeeks: 8,
    energyHistory: [],
    missions: [],
  });

  // Sprint 3 Bug B fix: Track current goal for progress sync
  const [currentGoal, setCurrentGoal] = createSignal<Goal | null>(null);

  // Sprint 9.5: Track completed goals for "all goals completed" message
  const [completedGoalsCount, setCompletedGoalsCount] = createSignal(0);

  // Get currency from profile
  const currency = (): Currency => (activeProfile()?.currency as Currency) || 'USD';

  // Compute total hours from missions
  const totalHours = () => {
    return followup().missions.reduce((sum, m) => sum + m.hoursCompleted, 0);
  };

  // Check if comeback conditions are met (for showing full ComebackAlert)
  const showComebackAlert = () => {
    const history = followup().energyHistory.map((e) => e.level);
    if (history.length < 3) return false;
    const current = history[history.length - 1] ?? 0;
    const previous = history[history.length - 2] ?? 50;
    const lowWeeks = history.filter((e) => e < 40).length;
    return lowWeeks >= 2 && current > 80 && previous < 50;
  };

  onMount(async () => {
    try {
      // Get the current (possibly simulated) date
      const simDate = await simulationService.getCurrentDate();
      setCurrentDate(simDate);

      // Load profile from DuckDB
      const profile = await profileService.loadActiveProfile();

      if (profile) {
        setActiveProfile(profile);

        // Sprint 2.3 Fix: Load goal from goals table (single source of truth)
        // NO localStorage fallback to prevent cross-profile contamination
        const primaryGoal = await goalService.getPrimaryGoal(profile.id);

        // Get planData from profile ONLY (no localStorage to prevent contamination)
        const planData = (profile.planData || {}) as {
          skills?: Array<{ name: string; hourlyRate: number }>;
          inventory?: Array<{ name: string; estimatedValue: number; sold: boolean }>;
          selectedScenarios?: Array<{
            id: string;
            title: string;
            description: string;
            category: string;
            weeklyHours: number;
            weeklyEarnings: number;
            effortLevel: number;
            flexibilityScore: number;
            hourlyRate: number;
          }>;
          trades?: Array<{
            id: string;
            type: string;
            name: string;
            partner: string;
            value: number;
            status: string;
            dueDate?: string;
          }>;
        };

        // Use goal from goals table as primary source of truth
        if (primaryGoal) {
          // Sprint 3 Bug B fix: Store goal reference for progress sync
          setCurrentGoal(primaryGoal);

          setSetup({
            goalName: primaryGoal.name,
            goalAmount: primaryGoal.amount,
            goalDeadline: primaryGoal.deadline || defaultDeadline90Days(),
          });
          setHasData(true);

          // Calculate weeks and targets using simulated date (dayjs)
          // Sprint 2.3 Fix: Use primaryGoal data, not planData.setup
          const startDate = simDate;
          const goalDeadline = primaryGoal.deadline || defaultDeadline90Days();
          const totalWeeks = weeksBetween(startDate, goalDeadline);
          const weeklyTarget = Math.ceil(primaryGoal.amount / Math.max(1, totalWeeks));

          // Load followup data from profile ONLY (no localStorage fallback to prevent cross-profile contamination)
          let existingFollowup = profile.followupData
            ? typeof profile.followupData === 'string'
              ? JSON.parse(profile.followupData)
              : profile.followupData
            : null;

          // ALWAYS check selectedScenarios and merge new missions (fixes cache issue after swipe)
          const currentScenarios = planData?.selectedScenarios || [];

          if (currentScenarios.length > 0 && existingFollowup) {
            const existingMissionTitles = new Set(
              (existingFollowup.missions || []).map((m: Mission) => m.title)
            );

            // Create missions for scenarios that don't have a mission yet
            const newMissions: Mission[] = [];
            currentScenarios.forEach((scenario, index) => {
              if (!existingMissionTitles.has(scenario.title)) {
                newMissions.push({
                  id: `mission_swipe_${Date.now()}_${index}`,
                  title: scenario.title,
                  description: scenario.description,
                  category: scenario.category as Mission['category'],
                  weeklyHours: scenario.weeklyHours,
                  weeklyEarnings: scenario.weeklyEarnings,
                  status: 'active',
                  progress: 0,
                  startDate: new Date().toISOString(),
                  hoursCompleted: 0,
                  earningsCollected: 0,
                });
              }
            });

            // Merge: existing missions + new missions
            if (newMissions.length > 0) {
              existingFollowup = {
                ...existingFollowup,
                missions: [...(existingFollowup.missions || []), ...newMissions],
              };
            }
          }

          // Bug A Fix: Check if we need to generate missions even when existingFollowup exists
          // This handles the case where followup data exists but missions array is empty
          const needsMissionGeneration =
            !existingFollowup ||
            !existingFollowup.missions ||
            existingFollowup.missions.length === 0;

          if (existingFollowup && !needsMissionGeneration) {
            setFollowup(normalizeFollowup(existingFollowup));
          } else {
            // Generate initial energy history (demo data) using dayjs
            const energyHistory: EnergyEntry[] = existingFollowup?.energyHistory || [];
            if (energyHistory.length === 0) {
              for (let i = 1; i <= Math.min(4, totalWeeks); i++) {
                energyHistory.push({
                  week: i,
                  level: 50 + Math.floor(Math.random() * 40),
                  date: toISO(addWeeks(startDate, i - 1)),
                });
              }
            }

            // Create missions from selectedScenarios (swipe results) first
            const missions: Mission[] = [];

            // Priority 1: Use selectedScenarios from swipe if available
            if (planData.selectedScenarios && planData.selectedScenarios.length > 0) {
              planData.selectedScenarios.forEach((scenario, index) => {
                missions.push({
                  id: `mission_swipe_${index}`,
                  title: scenario.title,
                  description: scenario.description,
                  category: scenario.category as Mission['category'],
                  weeklyHours: scenario.weeklyHours,
                  weeklyEarnings: scenario.weeklyEarnings,
                  status: 'active',
                  progress: 0,
                  startDate: startDate.toISOString(),
                  hoursCompleted: 0,
                  earningsCollected: 0,
                });
              });
            }

            // Priority 2: Add trade-based missions for active borrows/lends
            if (planData.trades && planData.trades.length > 0) {
              planData.trades
                .filter((t) => t.status === 'active' || t.status === 'pending')
                .forEach((trade, index) => {
                  if (trade.type === 'borrow') {
                    missions.push({
                      id: `mission_trade_borrow_${index}`,
                      title: `Recuperer ${trade.name}`,
                      description: `Recuperer ${trade.name} emprunte a ${trade.partner}`,
                      category: 'trade',
                      weeklyHours: 1,
                      weeklyEarnings: trade.value, // Savings count as earnings
                      status: 'active',
                      progress: trade.status === 'active' ? 50 : 0,
                      startDate: startDate.toISOString(),
                      hoursCompleted: trade.status === 'active' ? 0.5 : 0,
                      earningsCollected:
                        trade.status === 'active' ? Math.round(trade.value / 2) : 0,
                    });
                  } else if (trade.type === 'lend' && trade.dueDate) {
                    missions.push({
                      id: `mission_trade_lend_${index}`,
                      title: `Return ${trade.name}`,
                      description: `Return ${trade.name} lent to ${trade.partner} before ${formatDate(trade.dueDate)}`,
                      category: 'trade',
                      weeklyHours: 1,
                      weeklyEarnings: 0,
                      status: 'active',
                      progress: 0,
                      startDate: startDate.toISOString(),
                      hoursCompleted: 0,
                      earningsCollected: 0,
                    });
                  }
                });
            }

            // Fallback: Use skills/inventory if no swipe scenarios
            if (missions.length === 0) {
              if (planData.skills && planData.skills.length > 0) {
                missions.push({
                  id: 'mission_skill_1',
                  title: `Freelance ${planData.skills[0].name}`,
                  description: 'First freelance mission this week',
                  category: 'freelance',
                  weeklyHours: 5,
                  weeklyEarnings: planData.skills[0].hourlyRate * 5,
                  status: 'active',
                  progress: 20,
                  startDate: startDate.toISOString(),
                  hoursCompleted: 1,
                  earningsCollected: planData.skills[0].hourlyRate,
                });
              }

              if (planData.inventory && planData.inventory.length > 0) {
                const unsoldItem = planData.inventory.find((i) => !i.sold);
                if (unsoldItem) {
                  missions.push({
                    id: 'mission_sell_1',
                    title: `Sell ${unsoldItem.name}`,
                    description: 'List for sale and find a buyer',
                    category: 'selling',
                    weeklyHours: 2,
                    weeklyEarnings: unsoldItem.estimatedValue,
                    status: 'active',
                    progress: 0,
                    startDate: startDate.toISOString(),
                    hoursCompleted: 0,
                    earningsCollected: 0,
                  });
                }
              }
            }

            // Default missions if still none
            if (missions.length === 0) {
              missions.push({
                id: 'mission_default_1',
                title: 'Tutoring',
                description: 'Find a student and give tutoring sessions',
                category: 'tutoring',
                weeklyHours: 3,
                weeklyEarnings: 45,
                status: 'active',
                progress: 0,
                startDate: startDate.toISOString(),
                hoursCompleted: 0,
                earningsCollected: 0,
              });
            }

            setFollowup({
              currentAmount: existingFollowup?.currentAmount ?? 0,
              weeklyTarget,
              currentWeek: existingFollowup?.currentWeek ?? 1,
              totalWeeks,
              energyHistory,
              missions,
            });
          }
        } else {
          // Sprint 9.5: No active goal - check if there are completed goals
          const allGoals = await goalService.listGoals(profile.id, { status: 'all' });
          const completedGoals = allGoals.filter((g) => g.status === 'completed');
          setCompletedGoalsCount(completedGoals.length);
        }
        // Sprint 2.3 Fix: Removed fallback to profile.goalName/goalAmount
        // The goals table is now the single source of truth for goal data
        // If no goal exists in the goals table, user needs to create one via Goals tab
      } else {
        // No profile found - user needs to complete onboarding first
        // (No localStorage fallback to prevent cross-profile contamination)
      }
    } finally {
      setIsLoading(false);
    }
  });

  // Save followup data to DuckDB only (no localStorage to prevent cross-profile contamination)
  const updateFollowup = async (updates: Partial<FollowupData>) => {
    const updated = { ...followup(), ...updates };
    setFollowup(updated);

    // Save to DuckDB via profileService (single source of truth)
    const profile = activeProfile();
    if (profile) {
      await profileService.saveProfile({ ...profile, followupData: updated }, { setActive: false });

      // Sprint 3 Bug B fix: Sync progress to goals table
      // This ensures Goals tab shows correct progress (not always 0%)
      const goal = currentGoal();
      const goalAmount = setup()?.goalAmount;
      if (goal && goalAmount && goalAmount > 0) {
        const progressPercent = Math.min(
          100,
          Math.round((updated.currentAmount / goalAmount) * 100)
        );
        await goalService.updateGoalProgress(goal.id, progressPercent);
      }
    }
  };

  const handleEnergyUpdate = (week: number, level: number) => {
    const history = [...followup().energyHistory];
    const existingIndex = history.findIndex((e) => e.week === week);

    if (existingIndex >= 0) {
      history[existingIndex] = { ...history[existingIndex], level };
    } else {
      history.push({ week, level, date: toISO(new Date()) });
    }

    updateFollowup({ energyHistory: history.sort((a, b) => a.week - b.week) });
  };

  const handleMissionUpdate = (id: string, updates: Partial<Mission>) => {
    const missions = followup().missions.map((m) => {
      if (m.id !== id) return m;

      // Handle Restoration (Undo)
      if (updates.status === 'active' && m.status === 'completed') {
        // If we have a previous state, restore it
        if (m.previousState) {
          return {
            ...m,
            ...updates,
            hoursCompleted: m.previousState.hoursCompleted,
            earningsCollected: m.previousState.earningsCollected,
            previousState: undefined, // Clear backup after restore
          };
        }
        // If no backup (legacy), we must decide.
        // User complained about "100%" sticking.
        // But reverting to 0 is also risky.
        // Let's assume if no backup, we revert to 0 (clean slate) OR we keep it.
        // Given the user feedback, keeping it is bad. Reverting to 0 allows them to re-log.
        // It's safer to revert to 0 if we assume "Complete" implies "Auto-filled".
        // But let's rely on backup primarily.
      }

      // Handle Skip undoing (User said "si on fait undo... on n'a plus le nomre d'heures").
      // Skip preserves values. So restoring from skip is easy (just status change).
      // existing code `...m, ...updates` handles this if we don't override input.

      return { ...m, ...updates };
    });

    // Calculate new total
    const totalEarnings = missions.reduce((sum, m) => sum + m.earningsCollected, 0);

    updateFollowup({ missions, currentAmount: totalEarnings });
  };

  const handleMissionComplete = (id: string) => {
    // Fill remaining hours/earnings to match target
    const mission = followup().missions.find((m) => m.id === id);
    if (!mission) return;

    handleMissionUpdate(id, {
      status: 'completed',
      progress: 100,
      hoursCompleted: mission.weeklyHours,
      earningsCollected: mission.weeklyEarnings,
      // Save backup state before overwriting
      previousState: {
        hoursCompleted: mission.hoursCompleted,
        earningsCollected: mission.earningsCollected,
      },
    });
  };

  const handleMissionSkip = (id: string) => {
    handleMissionUpdate(id, { status: 'skipped' });
  };

  const handleComebackAccept = () => {
    // Add comeback plan to missions
    const capacities = [90, 80, 70];
    const deficit = (setup()?.goalAmount || 500) - followup().currentAmount;
    const totalCapacity = capacities.reduce((a, b) => a + b, 0);

    const catchUpMissions: Mission[] = capacities.map((cap, i) => ({
      id: `comeback_${Date.now()}_${i}`,
      title: `Catch-up Week ${i + 1}`,
      description: 'Post-exam catch-up mission',
      category: 'freelance',
      weeklyHours: Math.round(cap / 10),
      weeklyEarnings: Math.round((cap / totalCapacity) * deficit),
      status: 'active' as const,
      progress: 0,
      startDate: toISO(new Date()),
      hoursCompleted: 0,
      earningsCollected: 0,
    }));

    updateFollowup({
      missions: [...followup().missions, ...catchUpMissions],
    });
  };

  const handleMissionDelete = (id: string) => {
    const missions = followup().missions.filter((m) => m.id !== id);
    updateFollowup({ missions });
  };

  // No data fallback component
  const NoPlanView = () => (
    <Card class="max-w-md mx-auto text-center">
      <CardContent class="py-12 flex flex-col items-center">
        <div class="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <ClipboardList class="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 class="text-xl font-bold text-foreground mb-2">No plan yet</h2>
        <p class="text-muted-foreground mb-6">First set up your goal in My Plan</p>
        <Button as="a" href="/plan">
          Create my plan
        </Button>
      </CardContent>
    </Card>
  );

  // Sprint 9.5: All goals completed view
  const AllGoalsCompletedView = () => (
    <Card class="max-w-md mx-auto text-center border-green-500/20 bg-green-500/5">
      <CardContent class="py-12 flex flex-col items-center">
        <div class="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <Trophy class="h-8 w-8 text-green-500" />
        </div>
        <h2 class="text-xl font-bold text-foreground mb-2">All goals completed!</h2>
        <p class="text-muted-foreground mb-6">
          You've completed {completedGoalsCount()} goal{completedGoalsCount() > 1 ? 's' : ''}.
          Create a new goal in "My Goals" to continue your journey.
        </p>
        <Button as="a" href="/plan?tab=goals">
          Create New Goal
        </Button>
      </CardContent>
    </Card>
  );

  // Sprint 9.5: Determine which fallback to show
  const FallbackView = () => (
    <Show when={completedGoalsCount() > 0} fallback={<NoPlanView />}>
      <AllGoalsCompletedView />
    </Show>
  );

  return (
    <Show when={!isLoading()} fallback={<PageLoader />}>
      <Show when={hasData()} fallback={<FallbackView />}>
        <div class="space-y-6">
          {/* Quick Action - Top of page */}
          <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
            <CardContent class="p-6 flex items-center justify-between">
              <div class="flex items-center gap-4">
                <div class="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                  <MessageSquare class="h-5 w-5" />
                </div>
                <div>
                  <h4 class="font-semibold text-foreground">Need help?</h4>
                  <p class="text-sm text-muted-foreground">Bruno can help you optimize your plan</p>
                </div>
              </div>
              <Button as="a" href="/">
                Talk to Bruno
              </Button>
            </CardContent>
          </Card>

          {/* Section 1: Goal Hero + Key Metrics */}
          <Show when={setup()}>
            <TimelineHero
              goalName={setup()!.goalName}
              goalAmount={setup()!.goalAmount}
              currentAmount={followup().currentAmount}
              startDate={currentDate().toISOString()}
              endDate={setup()!.goalDeadline}
              weeklyTarget={followup().weeklyTarget}
              currentWeek={followup().currentWeek}
              totalWeeks={followup().totalWeeks}
              totalHours={totalHours()}
              currency={currency()}
            />
          </Show>

          {/* Section 2: Financial Breakdown (right after goal) */}
          <AnalyticsDashboard profileId={activeProfile()?.id} currency={currency()} />

          {/* Section 3: Missions */}
          <div>
            <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target class="h-5 w-5 text-primary" /> Missions
            </h3>
            <MissionList
              missions={followup().missions}
              currency={currency()}
              onMissionUpdate={handleMissionUpdate}
              onMissionComplete={handleMissionComplete}
              onMissionSkip={handleMissionSkip}
              onMissionDelete={handleMissionDelete}
            />
          </div>

          {/* Section 4: Energy (compact) */}
          <EnergyHistory history={followup().energyHistory} onEnergyUpdate={handleEnergyUpdate} />

          {/* Full Comeback Alert (only when conditions met) */}
          <Show when={showComebackAlert()}>
            <ComebackAlert
              energyHistory={followup().energyHistory.map((e) => e.level)}
              weeklyDeficit={(setup()?.goalAmount || 500) - followup().currentAmount}
              capacities={[90, 80, 70]}
              currency={currency()}
              onAcceptPlan={handleComebackAccept}
              onDeclinePlan={() => {}}
            />
          </Show>
        </div>
      </Show>
    </Show>
  );
}
