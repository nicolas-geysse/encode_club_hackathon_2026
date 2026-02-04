import { Show, For } from 'solid-js';
import { Pencil, CheckCircle2, Trash2, TrendingUp, AlertCircle, CalendarDays } from 'lucide-solid';
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
  onAdjustSavings: (week: number, amount: number) => void;
  userId?: string;

  // Chart Props
  chartStats: any;
  weeklyChartEarnings: any;
  projectedChartEarnings: any;
  chartMilestones: any;
  avgAdjustedTarget?: number;

  // Actions
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  onShowRetroplan: () => void;

  isLoading?: boolean;
}

export function ActiveGoalDashboard(props: ActiveGoalDashboardProps) {
  return (
    <div class="space-y-6">
      {/* Active Goal Header Card */}
      <Card class="border-primary/30">
        <CardContent class="p-6 space-y-6">
          {/* Header / Actions */}
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-4">
              <div class="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl">
                🎯
              </div>
              <div>
                <h3 class="text-2xl font-bold text-foreground">{props.goal.name}</h3>
                <div class="flex items-center gap-2 mt-1">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-300">
                    Active
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
                onClick={props.onToggleStatus}
                class="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                title="Mark Complete"
              >
                <CheckCircle2 class="h-4 w-4" />
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
          />

          {/* Feasibility Alert */}
          <Show
            when={
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
