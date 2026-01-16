/**
 * Suivi Page (suivi.tsx)
 *
 * Unified dashboard: Timeline Hero + Retroplan + Energy + Missions
 * Now uses profileService and simulationService for DuckDB persistence.
 */

import { createSignal, Show, onMount } from 'solid-js';
import { TimelineHero } from '~/components/suivi/TimelineHero';
import { EnergyHistory } from '~/components/suivi/EnergyHistory';
import { ComebackAlert } from '~/components/suivi/ComebackAlert';
import { MissionList } from '~/components/suivi/MissionList';
import type { Mission } from '~/components/suivi/MissionCard';
import { profileService, type FullProfile } from '~/lib/profileService';
import { simulationService } from '~/lib/simulationService';

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

  onMount(async () => {
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

        // Calculate weeks and targets using simulated date
        const startDate = simDate;
        const endDate = new Date(planData.setup.goalDeadline);
        const totalWeeks = Math.max(
          1,
          Math.ceil((endDate.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000))
        );
        const weeklyTarget = Math.ceil(planData.setup.goalAmount / totalWeeks);

        // Load followup data from profile or localStorage
        const storedFollowup = profile.followupData || localStorage.getItem('followupData');
        if (storedFollowup) {
          const followupData =
            typeof storedFollowup === 'string' ? JSON.parse(storedFollowup) : storedFollowup;
          setFollowup(followupData);
        } else {
          // Generate initial energy history (demo data)
          const energyHistory: EnergyEntry[] = [];
          for (let i = 1; i <= Math.min(4, totalWeeks); i++) {
            energyHistory.push({
              week: i,
              level: 50 + Math.floor(Math.random() * 40),
              date: new Date(startDate.getTime() + (i - 1) * 7 * 24 * 60 * 60 * 1000).toISOString(),
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
                    earningsCollected: trade.status === 'active' ? Math.round(trade.value / 2) : 0,
                  });
                } else if (trade.type === 'lend' && trade.dueDate) {
                  missions.push({
                    id: `mission_trade_lend_${index}`,
                    title: `Rendre ${trade.name}`,
                    description: `Rendre ${trade.name} prete a ${trade.partner} avant le ${new Date(trade.dueDate).toLocaleDateString('fr-FR')}`,
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
                description: 'Premiere mission de freelance cette semaine',
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
                  title: `Vendre ${unsoldItem.name}`,
                  description: 'Mettre en vente et trouver un acheteur',
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
              title: 'Cours particuliers',
              description: 'Trouver un eleve et donner des cours',
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
          goalDeadline:
            profile.goalDeadline || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
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
      history.push({ week, level, date: new Date().toISOString() });
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
      title: `Rattrapage Semaine ${i + 1}`,
      description: 'Mission de rattrapage post-exams',
      category: 'freelance',
      weeklyHours: Math.round(cap / 10),
      weeklyEarnings: Math.round((cap / totalCapacity) * deficit),
      status: 'active' as const,
      progress: 0,
      startDate: new Date().toISOString(),
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
      <h2 class="text-xl font-bold text-slate-900 mb-2">Pas encore de plan</h2>
      <p class="text-slate-500 mb-6">Configure d'abord ton objectif dans Mon Plan</p>
      <a href="/plan" class="btn-primary">
        Creer mon plan
      </a>
    </div>
  );

  return (
    <Show when={hasData()} fallback={<NoPlanView />}>
      <div class="space-y-6 max-w-4xl mx-auto">
        {/* Timeline Hero - uses simulated date */}
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
          />
        </Show>

        {/* Two-column layout for Energy and Comeback */}
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Energy History */}
          <div>
            <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>⚡</span> Energie
            </h3>
            <EnergyHistory history={followup().energyHistory} onEnergyUpdate={handleEnergyUpdate} />
          </div>

          {/* Comeback Alert (if applicable) */}
          <div>
            <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>🚀</span> Mode Comeback
            </h3>
            <ComebackAlert
              energyHistory={followup().energyHistory.map((e) => e.level)}
              weeklyDeficit={(setup()?.goalAmount || 500) - followup().currentAmount}
              capacities={[90, 80, 70]}
              onAcceptPlan={handleComebackAccept}
              onDeclinePlan={() => {}}
            />

            {/* Fallback when no comeback detected */}
            <Show when={followup().energyHistory.filter((e) => e.level < 40).length < 3}>
              <div class="card bg-slate-50 text-center py-8">
                <div class="text-3xl mb-3">😊</div>
                <p class="text-slate-600">
                  Pas de mode comeback necessaire.
                  <br />
                  Continue comme ca !
                </p>
              </div>
            </Show>
          </div>
        </div>

        {/* Missions */}
        <div>
          <h3 class="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <span>🎯</span> Missions
          </h3>
          <MissionList
            missions={followup().missions}
            onMissionUpdate={handleMissionUpdate}
            onMissionComplete={handleMissionComplete}
            onMissionSkip={handleMissionSkip}
          />
        </div>

        {/* Quick Actions */}
        <div class="card bg-gradient-to-r from-primary-50 to-primary-100">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-semibold text-primary-900">Besoin d'aide ?</h4>
              <p class="text-sm text-primary-600">Bruno peut t'aider a optimiser ton plan</p>
            </div>
            <a href="/" class="btn-primary">
              Parler a Bruno
            </a>
          </div>
        </div>
      </div>
    </Show>
  );
}
