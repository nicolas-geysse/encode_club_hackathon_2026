/**
 * Completed Goals Summary Component
 *
 * Container that orchestrates the list of completed goals:
 * - Fetches completed goals via goalService
 * - Computes stats per goal (duration, avg energy, missions)
 * - Renders responsive grid of CompletedGoalCard
 * - Manages modal state for detail view
 */

import { createSignal, createResource, For, Show, createMemo } from 'solid-js';
import { goalService, type Goal } from '~/lib/goalService';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { Trophy, Plus, Loader2 } from 'lucide-solid';
import { type Currency } from '~/lib/dateUtils';
import { CompletedGoalCard } from './CompletedGoalCard';
import { CompletedGoalDetailModal } from './CompletedGoalDetailModal';
import type { Mission } from './MissionCard';

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

interface CompletedGoalsSummaryProps {
  profileId: string;
  currency: Currency;
  followupData: FollowupData | null;
  onCreateNewGoal: () => void;
}

/**
 * Compute stats for a completed goal
 */
function computeGoalStats(
  goal: Goal,
  missions: Mission[],
  energyHistory: EnergyEntry[]
): {
  weeks: number;
  goalMissions: Mission[];
  avgEnergy: number | null;
} {
  const startDate = new Date(goal.createdAt || goal.updatedAt || new Date());
  const endDate = new Date(goal.updatedAt || new Date());

  // Duration in weeks
  const days = Math.max(
    1,
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  const weeks = Math.max(1, Math.ceil(days / 7));

  // Missions during the goal period
  const goalMissions = missions.filter((m) => {
    const missionDate = new Date(m.startDate);
    return missionDate >= startDate && missionDate <= endDate;
  });

  // Energy average during goal period
  const goalEnergy = energyHistory.filter((e) => {
    const entryDate = new Date(e.date);
    return entryDate >= startDate && entryDate <= endDate;
  });

  const avgEnergy =
    goalEnergy.length > 0
      ? Math.round(goalEnergy.reduce((sum, e) => sum + e.level, 0) / goalEnergy.length)
      : null;

  return { weeks, goalMissions, avgEnergy };
}

export function CompletedGoalsSummary(props: CompletedGoalsSummaryProps) {
  // Fetch completed goals
  const [completedGoals] = createResource(
    () => props.profileId,
    async (profileId) => {
      if (!profileId) return [];
      return goalService.listGoals(profileId, { status: 'completed' });
    }
  );

  // Modal state
  const [selectedGoal, setSelectedGoal] = createSignal<Goal | null>(null);

  // Precomputed stats for all goals
  const goalsWithStats = createMemo(() => {
    const goals = completedGoals() || [];
    const missions = props.followupData?.missions || [];
    const energyHistory = props.followupData?.energyHistory || [];

    return goals.map((goal) => ({
      goal,
      ...computeGoalStats(goal, missions, energyHistory),
    }));
  });

  // Get stats for the selected goal
  const selectedGoalStats = createMemo(() => {
    const goal = selectedGoal();
    if (!goal) return null;

    const found = goalsWithStats().find((g) => g.goal.id === goal.id);
    return found || null;
  });

  return (
    <div class="space-y-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
            <Trophy class="h-5 w-5 text-green-500" />
          </div>
          <div>
            <h2 class="text-xl font-bold text-foreground">Completed Goals</h2>
            <p class="text-sm text-muted-foreground">
              You've achieved {completedGoals()?.length || 0} goal
              {(completedGoals()?.length || 0) !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Button onClick={props.onCreateNewGoal} class="gap-2">
          <Plus class="h-4 w-4" />
          New Goal
        </Button>
      </div>

      {/* Loading state */}
      <Show when={completedGoals.loading}>
        <Card class="max-w-md mx-auto text-center">
          <CardContent class="py-12 flex flex-col items-center">
            <Loader2 class="h-8 w-8 animate-spin text-muted-foreground mb-4" />
            <p class="text-muted-foreground">Loading completed goals...</p>
          </CardContent>
        </Card>
      </Show>

      {/* Goals Grid */}
      <Show when={!completedGoals.loading && goalsWithStats().length > 0}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <For each={goalsWithStats()}>
            {(item) => (
              <CompletedGoalCard
                goal={item.goal}
                timeTakenWeeks={item.weeks}
                avgEnergy={item.avgEnergy}
                missionCount={item.goalMissions.length}
                currency={props.currency}
                onClick={() => setSelectedGoal(item.goal)}
              />
            )}
          </For>
        </div>
      </Show>

      {/* Empty state (shouldn't happen if this component is shown, but just in case) */}
      <Show when={!completedGoals.loading && (completedGoals()?.length || 0) === 0}>
        <Card class="max-w-md mx-auto text-center">
          <CardContent class="py-12 flex flex-col items-center">
            <Trophy class="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 class="font-semibold text-foreground mb-2">No completed goals yet</h3>
            <p class="text-sm text-muted-foreground mb-6">
              Complete your first goal to see it here
            </p>
            <Button onClick={props.onCreateNewGoal}>Create a Goal</Button>
          </CardContent>
        </Card>
      </Show>

      {/* Detail Modal */}
      <Show when={selectedGoal() && selectedGoalStats()}>
        <CompletedGoalDetailModal
          isOpen={!!selectedGoal()}
          onClose={() => setSelectedGoal(null)}
          goal={selectedGoal()!}
          missions={selectedGoalStats()!.goalMissions}
          energyHistory={
            props.followupData?.energyHistory.filter((e) => {
              const goal = selectedGoal()!;
              const startDate = new Date(goal.createdAt || goal.updatedAt || new Date());
              const endDate = new Date(goal.updatedAt || new Date());
              const entryDate = new Date(e.date);
              return entryDate >= startDate && entryDate <= endDate;
            }) || []
          }
          currency={props.currency}
          timeTakenWeeks={selectedGoalStats()!.weeks}
          avgEnergy={selectedGoalStats()!.avgEnergy}
        />
      </Show>
    </div>
  );
}
