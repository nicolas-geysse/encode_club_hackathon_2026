/**
 * Suivi Page (suivi.tsx)
 *
 * Compact dashboard: Goal Hero + Missions + Energy + Financial Breakdown
 * Uses profileService and simulationService for DuckDB persistence.
 */

import { createSignal, createMemo, createEffect, Show, onMount, onCleanup, on } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { TimelineHero } from '~/components/suivi/TimelineHero';
import { getCurrentWeekInfo } from '~/lib/weekCalculator';
import { MissionList } from '~/components/suivi/MissionList';
import { CompletedGoalsSummary } from '~/components/suivi/CompletedGoalsSummary';
import { BrunoTips } from '~/components/suivi/BrunoTips';
import { RetroplanPanel } from '~/components/RetroplanPanel';
import { SavingsAdjustModal } from '~/components/suivi/SavingsAdjustModal';
import type { Mission } from '~/components/suivi/MissionCard';
import { profileService, type FullProfile } from '~/lib/profileService';
import { goalService, type Goal } from '~/lib/goalService';
import { useProfile } from '~/lib/profileContext';
import { useSimulation } from '~/lib/simulationContext';
import { eventBus } from '~/lib/eventBus';
import { createLogger } from '~/lib/logger';
import { updateAchievements, onAchievementUnlock } from '~/lib/achievements';
import { celebrateGoalAchieved, celebrateGoldAchievement, celebrateComeback } from '~/lib/confetti';
import { toastPopup } from '~/components/ui/Toast';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { ClipboardList, Target } from 'lucide-solid';
import {
  weeksBetween,
  addWeeks,
  toISO,
  formatDate,
  defaultDeadline90Days,
  formatCurrency,
  type Currency,
} from '~/lib/dateUtils';
import { PageLoader } from '~/components/PageLoader';
import {
  type OneTimeGains,
  calculateTotalProgress,
  getEmptyOneTimeGains,
} from '~/lib/progressCalculator';
// Note: checkAutoCredit replaced by inline multi-month logic in Sprint 13.9

const logger = createLogger('SuiviPage');

// ============================================================================
// Helper functions for BrunoTips props
// ============================================================================

/**
 * Detect region from city name for location-aware tips
 */
function detectRegion(city: string): 'france' | 'uk' | 'us' | 'europe' | undefined {
  const cityLower = city.toLowerCase();

  // France
  if (
    ['paris', 'lyon', 'marseille', 'toulouse', 'nice', 'bordeaux', 'lille', 'nantes'].some((c) =>
      cityLower.includes(c)
    )
  ) {
    return 'france';
  }

  // UK
  if (
    ['london', 'manchester', 'birmingham', 'leeds', 'glasgow', 'edinburgh', 'bristol'].some((c) =>
      cityLower.includes(c)
    )
  ) {
    return 'uk';
  }

  // US
  if (
    [
      'new york',
      'los angeles',
      'chicago',
      'houston',
      'phoenix',
      'philadelphia',
      'san francisco',
      'boston',
    ].some((c) => cityLower.includes(c))
  ) {
    return 'us';
  }

  return 'europe';
}

/**
 * Extract skills from planData for job matching
 */
function extractSkills(planData: Record<string, unknown> | null | undefined): string[] | undefined {
  if (!planData) return undefined;

  const skills: string[] = [];

  // Extract from skills array
  if (Array.isArray(planData.skills)) {
    for (const skill of planData.skills) {
      if (typeof skill === 'object' && skill !== null && 'name' in skill) {
        skills.push(String(skill.name));
      }
    }
  }

  // Extract from lifestyle/services
  if (Array.isArray(planData.lifestyle)) {
    for (const item of planData.lifestyle) {
      if (typeof item === 'object' && item !== null && 'type' in item) {
        const type = String(item.type);
        if (['babysitting', 'tutoring', 'dog_walking', 'cleaning'].includes(type)) {
          skills.push(type);
        }
      }
    }
  }

  return skills.length > 0 ? skills : undefined;
}

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
  energyHistory: EnergyEntry[];
  missions: Mission[];
  // Sprint 13.8: Monthly savings tracking
  savingsCredits?: Record<string, number>; // monthKey "2026-01" -> amount credited
  savingsAdjustments?: Record<number, SavingsAdjustment>; // weekNumber -> adjustment
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
  savingsCredits: data?.savingsCredits ?? {},
  savingsAdjustments: data?.savingsAdjustments ?? {},
});

export default function SuiviPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = createSignal(true);
  const [hasData, setHasData] = createSignal(false);
  const [setup, setSetup] = createSignal<SetupData | null>(null);
  const [activeProfile, setActiveProfile] = createSignal<FullProfile | null>(null);
  const [followup, setFollowup] = createSignal<FollowupData>({
    currentAmount: 0,
    weeklyTarget: 0,
    currentWeek: 1,
    totalWeeks: 8,
    energyHistory: [],
    missions: [],
  });

  // Sprint 13.8 Fix: Use profile context for income/lifestyle data
  const { income: contextIncome, lifestyle: contextLifestyle } = useProfile();

  // Sprint 13.8 Fix: Use SimulationContext for reactive date updates
  const { currentDate } = useSimulation();

  // Sprint 13.8 Fix: Calculate monthly margin from actual DB data (income_items + lifestyle_items)
  // This replaces calculateMonthlyMargin(planData) which was unreliable
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

  // Sprint 3 Bug B fix: Track current goal for progress sync
  const [currentGoal, setCurrentGoal] = createSignal<Goal | null>(null);

  // Sprint 9.5: Track completed goals for "all goals completed" message
  const [completedGoalsCount, setCompletedGoalsCount] = createSignal(0);

  // Bugfix: One-time gains from trades and paused subscriptions (fetched from Budget API)
  const [oneTimeGains, setOneTimeGains] = createSignal<OneTimeGains>(getEmptyOneTimeGains());

  const [showRetroplan, setShowRetroplan] = createSignal(false);

  // Sprint 13.8: Savings adjustment modal state
  const [showSavingsAdjust, setShowSavingsAdjust] = createSignal(false);
  const [adjustingWeek, setAdjustingWeek] = createSignal<{
    weekNumber: number;
    amount: number;
  } | null>(null);

  // Get currency from profile
  const currency = (): Currency => (activeProfile()?.currency as Currency) || 'USD';

  // Compute total hours from missions
  const totalHours = () => {
    return followup().missions.reduce((sum, m) => sum + m.hoursCompleted, 0);
  };

  // Sprint 13: Calculate weekly earnings from completed missions
  // TODO: In future, track by actual week when mission was completed
  const weeklyEarningsFromMissions = (): Array<{ week: number; earned: number }> => {
    const missions = followup().missions.filter((m) => m.status === 'completed');
    if (missions.length === 0) return [];

    // For now, attribute all earnings to current week
    // (missions don't have explicit weekNumber, would need date calculation)
    const currentWeek = followup().currentWeek || 1;
    const totalEarned = missions.reduce((sum, m) => sum + m.earningsCollected, 0);

    return totalEarned > 0 ? [{ week: currentWeek, earned: totalEarned }] : [];
  };

  // Sprint 13: Calculate current week number for EnergyHistory highlighting
  // Sprint 13.6 Fix: Use goal.createdAt as start date, not currentDate()
  const currentWeekNumber = (): number => {
    const goal = currentGoal();
    if (!goal?.deadline) return followup().currentWeek || 1;

    // Use goal creation date as the start, not the current date
    const goalStartDate = goal.createdAt || currentDate().toISOString();
    const weekInfo = getCurrentWeekInfo(goalStartDate, followup().totalWeeks, currentDate());
    return weekInfo.weekNumber;
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

  const loadData = async (options: { silent?: boolean } = {}) => {
    // Only show loading spinner on initial load, not on background refreshes
    if (!options.silent) {
      setIsLoading(true);
    }
    try {
      // Sprint 13.8 Fix: Use currentDate from SimulationContext (reactive)
      // The context updates automatically when SIMULATION_UPDATED is emitted
      const simDate = currentDate();

      // Load profile from DuckDB
      const profile = await profileService.loadActiveProfile();

      if (profile) {
        setActiveProfile(profile);

        // Bugfix: Fetch budget data for one-time gains (trades, paused subscriptions)
        try {
          const budgetResponse = await fetch(`/api/budget?profileId=${profile.id}`);
          if (budgetResponse.ok) {
            const budgetData = await budgetResponse.json();
            const gains = budgetData.budget?.oneTimeGains || getEmptyOneTimeGains();
            setOneTimeGains({
              tradeSales: gains.tradeSales || 0,
              tradeBorrow: gains.tradeBorrow || 0,
              pausedSavings: gains.pausedSavings || 0,
            });
            logger.info('Loaded one-time gains from budget API', { oneTimeGains: gains });
          }
        } catch (err) {
          logger.warn('Failed to fetch budget data for one-time gains', { error: err });
          // Keep using empty gains as fallback
        }

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

          // Calculate weeks and targets
          // Sprint 13.6 Fix: Use goal.createdAt as start date for consistent week tracking
          // totalWeeks = weeks from goal creation to deadline (fixed)
          // currentWeek = dynamically calculated based on days since goal creation
          const goalDeadline = primaryGoal.deadline || defaultDeadline90Days();
          const goalStartDate = primaryGoal.createdAt ? new Date(primaryGoal.createdAt) : simDate;
          const totalWeeks = weeksBetween(goalStartDate, goalDeadline);
          const weeklyTarget = Math.ceil(primaryGoal.amount / Math.max(1, totalWeeks));

          // Calculate current week number dynamically
          const weekInfo = getCurrentWeekInfo(goalStartDate.toISOString(), totalWeeks, simDate);
          const calculatedCurrentWeek = weekInfo.weekNumber;

          // For mission start dates, use current simulated date (when mission is created)
          const startDate = simDate;

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
            // Sprint 13.6 Fix: Always update currentWeek dynamically
            const updatedFollowup = {
              ...normalizeFollowup(existingFollowup),
              currentWeek: calculatedCurrentWeek,
              totalWeeks, // Also update totalWeeks in case it changed
              weeklyTarget, // Also update weeklyTarget
            };
            setFollowup(updatedFollowup);
          } else {
            // Track if we generate initial data (to persist and avoid flickering on refresh)
            let generatedInitialData = false;

            // Generate initial energy history (demo data) using dayjs
            const energyHistory: EnergyEntry[] = existingFollowup?.energyHistory || [];
            if (energyHistory.length === 0) {
              generatedInitialData = true;
              for (let i = 1; i <= Math.min(4, totalWeeks); i++) {
                energyHistory.push({
                  week: i,
                  level: 50 + Math.floor(Math.random() * 40),
                  date: toISO(addWeeks(goalStartDate, i - 1)),
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

            const newFollowupData = {
              currentAmount: existingFollowup?.currentAmount ?? 0,
              weeklyTarget,
              // Sprint 13.6 Fix: Use dynamically calculated week, not stored value
              currentWeek: calculatedCurrentWeek,
              totalWeeks,
              energyHistory,
              missions,
            };
            setFollowup(newFollowupData);

            // Persist generated data to DB to avoid flickering on refresh
            if (generatedInitialData && profile) {
              profileService
                .saveProfile({ ...profile, followupData: newFollowupData }, { setActive: false })
                .catch(() => {
                  // Ignore save errors - data is already in local state
                });
            }
          }
        } else {
          // Sprint 9.5: No active goal - check if there are completed goals
          const allGoals = await goalService.listGoals(profile.id, { status: 'all' });
          const completedGoals = allGoals.filter((g) => g.status === 'completed');
          setCompletedGoalsCount(completedGoals.length);
          setHasData(false); // Make sure hasData is false so fallback shows
        }
        // Sprint 2.3 Fix: Removed fallback to profile.goalName/goalAmount
        // The goals table is now the single source of truth for goal data
        // If no goal exists in the goals table, user needs to create one via Goals tab
      } else {
        // No profile found - user needs to complete onboarding first
        setHasData(false);
        setActiveProfile(null);
        setSetup(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  onMount(() => {
    // Event Bus Subscriptions (Sync registration to ensure cleanup works)
    const unsubReset = eventBus.on('DATA_RESET', async () => {
      logger.info('DATA_RESET received, reloading...');
      await loadData(); // Full reload with spinner for reset
    });

    const unsubProfile = eventBus.on('PROFILE_SWITCHED', async () => {
      logger.info('PROFILE_SWITCHED received, reloading...');
      await loadData(); // Full reload with spinner for profile switch
    });

    // Cleanup must be registered synchronously inside the reactive scope
    onCleanup(() => {
      unsubReset();
      unsubProfile();
    });

    // Initial load (Async)
    loadData().then(() => {
      // Sprint 13.8: Check for auto-credit after data loads
      // Small delay to ensure followup data is set
      setTimeout(() => {
        checkAndApplyAutoCredit();
      }, 100);
    });
  });

  // Check achievements and trigger celebrations
  const checkAndCelebrateAchievements = (context: Record<string, unknown>) => {
    const { newlyUnlocked } = updateAchievements(context);

    for (const achievement of newlyUnlocked) {
      // Determine celebration type based on achievement
      if (achievement.id === 'goal_achieved') {
        celebrateGoalAchieved();
      } else if (achievement.tier === 'gold') {
        celebrateGoldAchievement();
      } else if (achievement.id === 'comeback_king') {
        celebrateComeback();
      }

      // Show toast for all achievements
      onAchievementUnlock(achievement, {
        showToast: (type, title, message) => {
          if (type === 'success') {
            toastPopup.success(title, message);
          } else {
            toastPopup.info(title, message);
          }
        },
        celebrateGold: celebrateGoldAchievement,
      });
    }
  };

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
      // Bugfix: Include one-time gains in progress calculation
      const goal = currentGoal();
      const goalAmount = setup()?.goalAmount;
      if (goal && goalAmount && goalAmount > 0) {
        const totalProgress = calculateTotalProgress(updated.currentAmount, oneTimeGains());
        const progressPercent = Math.min(100, Math.round((totalProgress / goalAmount) * 100));
        await goalService.updateGoalProgress(goal.id, progressPercent);

        // Check achievements after progress update
        const totalEarnings = updated.missions.reduce((sum, m) => sum + m.earningsCollected, 0);
        const completedMissions = updated.missions.filter((m) => m.status === 'completed').length;
        const weeklyMissionsTotal = updated.missions.filter((m) => m.status !== 'skipped').length;

        checkAndCelebrateAchievements({
          earningsCollected: totalEarnings,
          currentAmount: updated.currentAmount,
          goalAmount: goalAmount,
          weeklyMissionsCompleted: completedMissions,
          weeklyMissionsTotal: weeklyMissionsTotal,
          energyHistory: updated.energyHistory.map((e) => ({ level: e.level })),
          activeMissions: updated.missions.filter((m) => m.status === 'active'),
        });
      }
    }
  };

  // Sprint 13.8: Handle savings adjustment
  const handleOpenSavingsAdjust = (weekNumber: number, currentAmount: number) => {
    setAdjustingWeek({ weekNumber, amount: currentAmount });
    setShowSavingsAdjust(true);
  };

  const handleSavingsAdjust = async (amount: number, note?: string) => {
    const week = adjustingWeek();
    if (!week) return;

    const currentAdjustments = followup().savingsAdjustments || {};
    const updatedAdjustments = {
      ...currentAdjustments,
      [week.weekNumber]: {
        amount,
        note,
        adjustedAt: new Date().toISOString(),
      },
    };

    // Calculate the difference from original amount
    const originalAmount = week.amount;
    const difference = amount - originalAmount;

    // Update followup with new adjustment and adjusted currentAmount
    await updateFollowup({
      savingsAdjustments: updatedAdjustments,
      currentAmount: followup().currentAmount + difference,
    });

    setShowSavingsAdjust(false);
    setAdjustingWeek(null);

    toastPopup.success(
      'Savings adjusted',
      `Week ${week.weekNumber} savings updated to ${formatCurrency(amount, currency())}`
    );
  };

  // Sprint 13.9: Recalculate currentWeek when simulation time changes
  const recalculateCurrentWeek = async () => {
    const goal = currentGoal();
    if (!goal?.deadline) return;

    const simDate = currentDate();
    const goalStartDate = goal.createdAt ? new Date(goal.createdAt) : simDate;
    const totalWeeks = weeksBetween(goalStartDate, goal.deadline);

    const weekInfo = getCurrentWeekInfo(goalStartDate.toISOString(), totalWeeks, simDate);
    const weeklyTarget = Math.ceil(goal.amount / Math.max(1, totalWeeks));

    // Update followup with new week calculation
    const updatedFollowup = {
      ...followup(),
      currentWeek: weekInfo.weekNumber,
      totalWeeks,
      weeklyTarget,
    };

    setFollowup(updatedFollowup);

    // Persist to DuckDB
    await updateFollowup({
      currentWeek: weekInfo.weekNumber,
      totalWeeks,
      weeklyTarget,
    });

    logger.info('Week recalculated on simulation change', {
      week: weekInfo.weekNumber,
      totalWeeks,
      simulatedDate: simDate.toISOString(),
    });
  };

  // Sprint 13.9: Check for auto-credit - handles multiple months when simulating large time jumps
  // Sprint 13.15 Fix: Also handles removing credits when simulation is reset or time goes backward
  const checkAndApplyAutoCredit = async () => {
    const profile = activeProfile();
    if (!profile) return;

    // Use reactive monthlyMargin from context (income_items - lifestyle_items)
    const margin = monthlyMargin();
    if (!margin || margin <= 0) return;

    const goal = currentGoal();
    if (!goal) return;

    const incomeDay = profile.incomeDay ?? 15;
    const savingsCredits = followup().savingsCredits || {};
    const simDate = currentDate();

    // Fix: Check all months from goal creation to simulated date
    const goalStartDate = new Date(goal.createdAt || new Date().toISOString());
    let netChange = 0;
    const updatedCredits = { ...savingsCredits };

    // 1. Identify all months that SHOULD be credited based on current simulation date
    const expectedCreditedMonths = new Set<string>();

    // Iterate from goal start to current simulated date
    const currentMonth = new Date(goalStartDate.getFullYear(), goalStartDate.getMonth(), 1);
    const endMonth = new Date(simDate.getFullYear(), simDate.getMonth(), 1);

    while (currentMonth <= endMonth) {
      const monthKey = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

      const incomeDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), incomeDay);

      // Credit condition: simDate must be past incomeDate for this month, AND incomeDate must be valid relative to goal start
      const hasPassedIncomeDay = simDate >= incomeDate;
      const isAfterGoalStart = incomeDate >= goalStartDate;

      if (hasPassedIncomeDay && isAfterGoalStart) {
        expectedCreditedMonths.add(monthKey);
      }

      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    // 2. Add missing credits
    for (const monthKey of expectedCreditedMonths) {
      if (!updatedCredits[monthKey]) {
        updatedCredits[monthKey] = margin;
        netChange += margin;
        logger.info('Auto-crediting month', { monthKey, amount: margin });
      }
    }

    // 3. Remove invalid credits (future months or not-yet-reached income days)
    // This handles the Simulation Reset case where we go back in time
    for (const monthKey of Object.keys(updatedCredits)) {
      if (!expectedCreditedMonths.has(monthKey)) {
        const removedAmount = updatedCredits[monthKey];
        delete updatedCredits[monthKey];
        netChange -= removedAmount;
        logger.info('Removing credit for invalid month (time rewind)', {
          monthKey,
          amount: removedAmount,
        });
      }
    }

    // Only update if changes occurred
    if (netChange !== 0) {
      logger.info('Applying auto-credit changes', { netChange });

      await updateFollowup({
        savingsCredits: updatedCredits,
        currentAmount: followup().currentAmount + netChange,
      });

      if (netChange > 0) {
        toastPopup.success(
          'Month Completed!',
          `+${formatCurrency(netChange, currency())} added to savings`
        );
      } else {
        // Optional: toast for rollback? Maybe too noisy.
        logger.info('Savings rolled back due to simulation reset');
      }
    }
  };

  // Sprint 13.10: Reactive effect for simulation time changes
  // Uses SolidJS `on` helper with defer:true to skip initial run
  // This runs ONLY when currentDate() actually changes (not on mount)
  // Fixes race condition: eventBus listener ran before SimulationContext updated currentDate()
  createEffect(
    on(
      currentDate,
      async (simDate, prevDate) => {
        // Skip if no previous date (handled by defer:true, but extra safety)
        if (!prevDate) return;

        // Skip if date didn't actually change
        if (simDate.getTime() === prevDate.getTime()) return;

        const goal = currentGoal();
        const profile = activeProfile();

        if (!goal?.deadline || !profile) return;

        logger.info('Simulation date changed via createEffect', {
          from: prevDate.toISOString(),
          to: simDate.toISOString(),
        });

        // Recalculate week and check auto-credits
        await recalculateCurrentWeek();
        await checkAndApplyAutoCredit();
      },
      { defer: true }
    )
  );

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
    const now = new Date().toISOString();
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
            completedAt: undefined, // Clear completion timestamp on undo
            updatedAt: now,
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

      return { ...m, ...updates, updatedAt: now };
    });

    // Calculate new total
    const totalEarnings = missions.reduce((sum, m) => sum + m.earningsCollected, 0);

    updateFollowup({ missions, currentAmount: totalEarnings });

    // Check if comeback plan is fully completed
    if (updates.status === 'completed') {
      checkComebackCompletion();
    }
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
      // Set completion timestamp for earnings date attribution
      completedAt: new Date().toISOString(),
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

    // Celebrate comeback mode activation
    celebrateComeback();
    toastPopup.success('Comeback Mode Activated!', 'Your personalized catch-up plan is ready!');
  };

  // Handle comeback plan completion (all catch-up missions done)
  const checkComebackCompletion = () => {
    const missions = followup().missions;
    const comebackMissions = missions.filter((m) => m.id.startsWith('comeback_'));
    const allCompleted =
      comebackMissions.length > 0 && comebackMissions.every((m) => m.status === 'completed');

    if (allCompleted) {
      checkAndCelebrateAchievements({
        comebackPlanCompleted: true,
      });
    }
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

  // Sprint 9.5: All goals completed view - now uses CompletedGoalsSummary
  const AllGoalsCompletedView = () => (
    <CompletedGoalsSummary
      profileId={activeProfile()?.id || ''}
      currency={currency()}
      followupData={followup()}
      onCreateNewGoal={() => navigate('/plan?tab=goals&action=new')}
    />
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
          {/* Bruno Tips - Data-driven insights with AI-powered tips */}
          <BrunoTips
            profileId={activeProfile()?.id || ''}
            missions={followup().missions}
            currentEnergy={
              followup().energyHistory.length > 0
                ? followup().energyHistory[followup().energyHistory.length - 1].level
                : 50
            }
            energyHistory={followup().energyHistory}
            currentAmount={followup().currentAmount}
            goalAmount={setup()?.goalAmount || 0}
            weeklyTarget={followup().weeklyTarget}
            currency={currency()}
            useLLM={true}
            location={
              activeProfile()?.city
                ? {
                    city: activeProfile()!.city || '',
                    currency: (activeProfile()?.currency as 'USD' | 'EUR' | 'GBP') || 'EUR',
                    region: detectRegion(activeProfile()?.city || ''),
                  }
                : undefined
            }
            skills={extractSkills(activeProfile()?.planData)}
            monthlyMargin={monthlyMargin()}
          />

          {/* Section 1: Goal Hero + Key Metrics */}
          <Show when={setup()}>
            <TimelineHero
              goalName={setup()!.goalName}
              goalAmount={setup()!.goalAmount}
              currentAmount={followup().currentAmount}
              // Sprint 13.6 Fix: Use goal creation date as start, not current date
              startDate={currentGoal()?.createdAt || currentDate().toISOString()}
              endDate={setup()!.goalDeadline}
              weeklyTarget={followup().weeklyTarget}
              currentWeek={followup().currentWeek}
              totalWeeks={followup().totalWeeks}
              totalHours={totalHours()}
              currency={currency()}
              currentSimulatedDate={currentDate().toISOString()}
              oneTimeGains={oneTimeGains()}
            />
          </Show>

          {/* Sprint 13: Weekly Progress Timeline - HIDDEN FOR SIMPLIFICATION
          <Show when={currentGoal()}>
            <div class="mt-4">
              <WeeklyProgressCards
                goal={currentGoal()!}
                currency={currency()}
                weeklyEarnings={weeklyEarningsFromMissions()}
                hourlyRate={activeProfile()?.minHourlyRate}
                simulatedDate={currentDate()}
                incomeDay={activeProfile()?.incomeDay}
                monthlyMargin={monthlyMargin()}
                savingsAdjustments={followup().savingsAdjustments}
                onAdjustSavings={handleOpenSavingsAdjust}
                userId={activeProfile()?.id}
              />
            </div>
          </Show>
          */}

          {/* Capacity Forecast Card - HIDDEN FOR SIMPLIFICATION
          <Show when={currentGoal()}>
            <CapacityForecast
              goalId={currentGoal()!.id}
              userId={activeProfile()?.id}
              onViewDetails={() => setShowRetroplan(true)}
            />
          </Show>
          */}

          {/* Predictive Alerts - Warn about upcoming difficult weeks - HIDDEN FOR SIMPLIFICATION
          <Show when={currentGoal()}>
            <PredictiveAlerts
              goalId={currentGoal()!.id}
              userId={activeProfile()?.id}
              onViewPlan={() => setShowRetroplan(true)}
            />
          </Show>
          */}

          {/* Section 2: Energy (MOVED UP - leading indicator) - HIDDEN FOR SIMPLIFICATION
          <EnergyHistory
            history={followup().energyHistory}
            onEnergyUpdate={handleEnergyUpdate}
            currentWeek={currentWeekNumber()}
          />
          */}

          {/* Full Comeback Alert (only when conditions met) - inline with Energy - HIDDEN FOR SIMPLIFICATION
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
          */}

          {/* Section 3: Financial Breakdown (after energy for context) - HIDDEN FOR SIMPLIFICATION
          <AnalyticsDashboard profileId={activeProfile()?.id} currency={currency()} />
          */}

          {/* Section 4: Missions */}
          <div>
            <h3 class="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target class="h-5 w-5 text-primary" /> Missions
            </h3>
            <MissionList
              missions={followup().missions}
              currency={currency()}
              daysRemaining={
                setup()
                  ? Math.max(
                      0,
                      Math.ceil(
                        (new Date(setup()!.goalDeadline).getTime() - currentDate().getTime()) /
                          (1000 * 60 * 60 * 24)
                      )
                    )
                  : 0
              }
              weeklyTarget={followup().weeklyTarget}
              onMissionUpdate={handleMissionUpdate}
              onMissionComplete={handleMissionComplete}
              onMissionSkip={handleMissionSkip}
              onMissionDelete={handleMissionDelete}
            />
          </div>
        </div>

        {/* Retroplan Modal */}
        <Show when={showRetroplan() && currentGoal()}>
          {(() => {
            const goal = currentGoal()!;
            // Extract academic events from goal's planData for protected weeks calculation
            const goalPlanData = goal.planData as Record<string, unknown> | undefined;
            const goalAcademicEvents =
              (goalPlanData?.academicEvents as Array<{
                id: string;
                type:
                  | 'exam_period'
                  | 'class_intensive'
                  | 'vacation'
                  | 'internship'
                  | 'project_deadline';
                name: string;
                startDate: string;
                endDate: string;
              }>) || [];

            return (
              <div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div class="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <RetroplanPanel
                    goalId={goal.id}
                    goalName={goal.name}
                    goalAmount={goal.amount}
                    goalDeadline={goal.deadline || ''}
                    userId={activeProfile()?.id}
                    currency={currency()}
                    academicEvents={goalAcademicEvents}
                    hourlyRate={activeProfile()?.minHourlyRate}
                    simulatedDate={currentDate()}
                    onClose={() => setShowRetroplan(false)}
                  />
                </div>
              </div>
            );
          })()}
        </Show>

        {/* Sprint 13.8: Savings Adjust Modal */}
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
      </Show>
    </Show>
  );
}
