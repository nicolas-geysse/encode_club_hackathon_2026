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
import { weeksBetween, addWeeks, toISO, formatDate, defaultDeadline90Days } from '~/lib/dateUtils';
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

        // Get plan data from profile
        const planData = profile.planData as
          | {
              setup?: SetupData;
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
            }
          | undefined;

        if (planData?.setup) {
          setSetup(planData.setup);
          setHasData(true);

          // Calculate weeks and targets using simulated date (dayjs)
          const startDate = simDate;
          const totalWeeks = weeksBetween(startDate, planData.setup.goalDeadline);
          const weeklyTarget = Math.ceil(planData.setup.goalAmount / totalWeeks);

          // Load followup data from profile or localStorage
          const storedFollowup = profile.followupData || localStorage.getItem('followupData');
          if (storedFollowup) {
            const followupData =
              typeof storedFollowup === 'string' ? JSON.parse(storedFollowup) : storedFollowup;
            setFollowup(followupData);
          } else {
            // Generate initial energy history (demo data) using dayjs
            const energyHistory: EnergyEntry[] = [];
            for (let i = 1; i <= Math.min(4, totalWeeks); i++) {
              energyHistory.push({
                week: i,
                level: 50 + Math.floor(Math.random() * 40),
                date: toISO(addWeeks(startDate, i - 1)),
              });
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
              currentAmount: 0,
              weeklyTarget,
              currentWeek: 1,
              totalWeeks,
              energyHistory,
              missions,
            });
          }
        } else if (profile.goalName && profile.goalAmount) {
          // Use goal from profile directly
          setSetup({
            goalName: profile.goalName,
            goalAmount: profile.goalAmount,
            goalDeadline: profile.goalDeadline || defaultDeadline90Days(),
          });
          setHasData(true);
        }
      } else {
        // Fallback to localStorage for backwards compatibility
        const storedPlan = localStorage.getItem('planData');
        if (storedPlan) {
          const planData = JSON.parse(storedPlan);
          if (planData.setup) {
            setSetup(planData.setup);
            setHasData(true);

            const storedFollowup = localStorage.getItem('followupData');
            if (storedFollowup) {
              setFollowup(JSON.parse(storedFollowup));
            }
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  });

  // Save followup data to both localStorage and DuckDB (debounced)
  const updateFollowup = async (updates: Partial<FollowupData>) => {
    const updated = { ...followup(), ...updates };
    setFollowup(updated);

    // Save to localStorage for backwards compatibility
    localStorage.setItem('followupData', JSON.stringify(updated));

    // Save to DuckDB via profileService
    const profile = activeProfile();
    if (profile) {
      await profileService.saveProfile({ ...profile, followupData: updated }, { setActive: false });
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
    const missions = followup().missions.map((m) => (m.id === id ? { ...m, ...updates } : m));

    // Calculate new total
    const totalEarnings = missions.reduce((sum, m) => sum + m.earningsCollected, 0);

    updateFollowup({ missions, currentAmount: totalEarnings });
  };

  const handleMissionComplete = (id: string) => {
    handleMissionUpdate(id, { status: 'completed', progress: 100 });
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

  // No data fallback component
  const NoPlanView = () => (
    <div class="card text-center py-12 max-w-md mx-auto">
      <div class="text-4xl mb-4">📋</div>
      <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">No plan yet</h2>
      <p class="text-slate-500 dark:text-slate-400 mb-6">First set up your goal in My Plan</p>
      <a href="/plan" class="btn-primary">
        Create my plan
      </a>
    </div>
  );

  return (
    <Show when={!isLoading()} fallback={<PageLoader />}>
      <Show when={hasData()} fallback={<NoPlanView />}>
        <div class="space-y-4 max-w-4xl mx-auto">
          {/* Quick Action - Top of page */}
          <div class="card bg-gradient-to-r from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20">
            <div class="flex items-center justify-between">
              <div>
                <h4 class="font-semibold text-primary-900 dark:text-primary-100">Need help?</h4>
                <p class="text-sm text-primary-600 dark:text-primary-300">
                  Bruno can help you optimize your plan
                </p>
              </div>
              <a href="/" class="btn-primary">
                Talk to Bruno
              </a>
            </div>
          </div>

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
            />
          </Show>

          {/* Section 2: Financial Breakdown (right after goal) */}
          <AnalyticsDashboard />

          {/* Section 3: Missions */}
          <div>
            <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
              <span>🎯</span> Missions
            </h3>
            <MissionList
              missions={followup().missions}
              onMissionUpdate={handleMissionUpdate}
              onMissionComplete={handleMissionComplete}
              onMissionSkip={handleMissionSkip}
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
              onAcceptPlan={handleComebackAccept}
              onDeclinePlan={() => {}}
            />
          </Show>
        </div>
      </Show>
    </Show>
  );
}
