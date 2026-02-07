import { Show, For, createMemo } from 'solid-js';
import { Pencil, Trash2, TrendingUp, AlertCircle, CalendarDays, Trophy, Plus } from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { GoalMetrics } from './GoalMetrics';
import GoalComponentsList from '~/components/GoalComponentsList';
import { WeeklyProgressCards } from '~/components/WeeklyProgressCards';
import { EarningsChart } from '~/components/EarningsChart';
import { formatCurrency } from '~/lib/dateUtils';
import type { Goal } from '~/lib/profileContext';
import type { Currency } from '~/lib/dateUtils';

interface ActiveGoalDashboardProps {
  goal: Goal;
  currency: Currency;
  adjustedProgress: number;
  feasibilityScore: number | null;
  riskFactors: string[];
  maxEarnings: number | null;
  daysRemaining: number | null;
  formattedDeadline: string | null;

  // Weekly Progress Props
  weeklyEarnings: { week: number; earned: number }[];
  simulatedDate?: Date;
  hourlyRate?: number;
  incomeDay?: number;
  monthlyMargin?: number;
  savingsAdjustments?: any;
  weeklyCardsRetroplan: any;
  onAdjustSavings?: (week: number, amount: number) => void;
  userId?: string;

  // Chart Props
  chartStats: any;
  weeklyChartEarnings: any;
  projectedChartEarnings: any;
  chartMilestones: any;
  avgAdjustedTarget?: number;

  // Actions
  onEdit: () => void;
  onDelete: () => void;
  onShowRetroplan: () => void;
  onNewGoal?: () => void;

  isLoading?: boolean;
}

export function ActiveGoalDashboard(props: ActiveGoalDashboardProps) {
  const goalAchieved = createMemo(() => props.adjustedProgress >= 100);

  const daysToReach = createMemo(() => {
    if (!goalAchieved()) return null;
    const created = props.goal.createdAt;
    if (!created) return null;
    const start = new Date(created);
    const now = props.simulatedDate || new Date();
    return Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  });

  return (
    <div class="space-y-6">
      {/* Active Goal Header Card */}
      <Card
        class={
          goalAchieved()
            ? 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 via-amber-500/10 to-orange-500/10'
            : 'border-primary/30'
        }
      >
        <CardContent class="p-6 space-y-6">
          {/* Victory Banner */}
          <Show when={goalAchieved()}>
            <div class="px-4 py-3 bg-yellow-500/15 rounded-lg flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
              <div class="flex items-center gap-2">
                <Trophy class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                <span class="font-bold text-yellow-700 dark:text-yellow-300 text-sm">
                  {daysToReach()
                    ? `Reached in ${daysToReach()} day${daysToReach()! > 1 ? 's' : ''}! Congrats!`
                    : 'Goal Achieved! Congrats!'}
                </span>
                <Trophy class="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <Show when={props.onNewGoal}>
                <Button
                  size="sm"
                  onClick={props.onNewGoal}
                  class="bg-yellow-600 hover:bg-yellow-700 text-white h-7 text-xs px-3"
                >
                  <Plus class="h-3.5 w-3.5 mr-1" /> New Goal
                </Button>
              </Show>
            </div>
          </Show>

          {/* Header / Actions */}
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div
                class={`h-12 w-12 rounded-full flex items-center justify-center text-2xl ${
                  goalAchieved() ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-primary/10'
                }`}
              >
                {goalAchieved() ? '🏆' : '🎯'}
              </div>
              <div>
                <h3 class="text-2xl font-bold text-foreground">{props.goal.name}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span
                    class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      goalAchieved()
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                        : 'bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300'
                    }`}
                  >
                    {goalAchieved() ? 'Achieved' : 'Active'}
                  </span>
                  <span class="text-sm text-muted-foreground">
                    {formatCurrency(props.goal.amount, props.currency)} target
                  </span>
                </div>
              </div>
            </div>

            <div class="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={props.onShowRetroplan}
                title="View detailed timeline"
                class="gap-2"
              >
                <CalendarDays class="h-4 w-4" />
                Retroplan
              </Button>
              <div class="h-6 w-px bg-border mx-2" />
              <Button variant="ghost" size="icon" onClick={props.onEdit} title="Edit">
                <Pencil class="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={props.onDelete}
                class="text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Delete"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Metrics Grid */}
          <GoalMetrics
            goal={props.goal}
            currency={props.currency}
            adjustedProgress={props.adjustedProgress}
            feasibilityScore={props.feasibilityScore}
            simulatedDate={props.simulatedDate}
            isLoading={props.isLoading}
            goalAchieved={goalAchieved()}
          />

          {/* Feasibility Alert — hidden when goal achieved */}
          <Show
            when={
              !goalAchieved() &&
              props.feasibilityScore !== null &&
              props.feasibilityScore! < 0.5 &&
              props.riskFactors.length > 0
            }
          >
            <div
              class={`rounded-lg p-4 border ${props.feasibilityScore! < 0.15 ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/40'}`}
            >
              <div class="flex items-start gap-3">
                <AlertCircle
                  class={`h-5 w-5 mt-0.5 flex-shrink-0 ${props.feasibilityScore! < 0.15 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
                />
                <div class="flex-1 min-w-0">
                  <p
                    class={`text-sm font-medium ${props.feasibilityScore! < 0.15 ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}
                  >
                    {props.feasibilityScore! < 0.15
                      ? 'Goal exceeds your earning capacity'
                      : 'Goal requires maximum effort'}
                  </p>
                  <Show when={props.maxEarnings}>
                    <p class="text-xs text-muted-foreground mt-1">
                      Max earnings possible:{' '}
                      <span class="font-medium">
                        {formatCurrency(props.maxEarnings!, props.currency)}
                      </span>{' '}
                      (goal: {formatCurrency(props.goal.amount, props.currency)})
                    </p>
                  </Show>
                  <ul class="mt-2 text-xs space-y-1">
                    <For each={props.riskFactors.slice(0, 3)}>
                      {(factor) => <li class="text-muted-foreground">• {factor}</li>}
                    </For>
                  </ul>
                  <p class="text-xs text-muted-foreground mt-2 italic">
                    Consider: extending deadline, reducing goal, or increasing work hours/rate
                  </p>
                </div>
              </div>
            </div>
          </Show>
        </CardContent>
      </Card>

      {/* Main Content Sections */}
      <div class="space-y-6">
        {/* Sub-Components List */}
        <Show when={(props.goal.components?.length ?? 0) > 0}>
          <Card class="border-primary/30">
            <CardContent class="p-6">
              <GoalComponentsList
                goalId={props.goal.id}
                currency={props.currency}
                onProgressUpdate={() => {
                  // Handled by parent refresh logic usually, but here we might need a callback
                }}
              />
            </CardContent>
          </Card>
        </Show>

        {/* Weekly Progress - Full Width */}
        <Show when={props.goal.deadline}>
          <Card class="border-primary/30">
            <CardContent class="p-6">
              <h4 class="text-sm font-medium text-muted-foreground mb-4">📅 Weekly Progress</h4>
              <WeeklyProgressCards
                goal={props.goal}
                currency={props.currency}
                hourlyRate={props.hourlyRate}
                weeklyEarnings={props.weeklyEarnings}
                simulatedDate={props.simulatedDate}
                incomeDay={props.incomeDay}
                monthlyMargin={props.monthlyMargin}
                savingsAdjustments={props.savingsAdjustments}
                onAdjustSavings={props.onAdjustSavings}
                userId={props.userId}
                retroplan={props.weeklyCardsRetroplan}
              />
            </CardContent>
          </Card>
        </Show>

        {/* Chart - Full Width */}
        <Card class="border-primary/30">
          <CardContent class="p-6">
            <h4 class="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
              <TrendingUp class="h-4 w-4" /> Earnings vs Goal
            </h4>
            <div class="w-full">
              <EarningsChart
                goal={props.goal}
                currency={props.currency}
                adjustedWeeklyTarget={props.avgAdjustedTarget}
                currentSaved={props.chartStats.totalEarned}
                weeklyEarnings={props.weeklyChartEarnings}
                projectedWeeklyEarnings={props.projectedChartEarnings}
                milestones={props.chartMilestones}
                stats={props.chartStats}
                monthlyMargin={props.monthlyMargin}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
