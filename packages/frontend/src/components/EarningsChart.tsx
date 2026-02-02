/**
 * Earnings vs Goal Chart Component
 *
 * Visualizes earnings progress against goal target using Chart.js.
 * Shows cumulative earnings, required pace, and goal amount.
 */

import { onMount, onCleanup, Show, createMemo } from 'solid-js';
import type { Goal } from '~/lib/goalService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';

// Chart.js imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';

// Register Chart.js components once
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface WeeklyEarning {
  week: number;
  weekLabel: string;
  earned: number;
  cumulative: number;
}

/**
 * Capacity-aware milestone for chart pace calculation
 * When provided, uses non-linear targets based on weekly capacity
 */
interface ChartMilestone {
  week: number;
  adjustedTarget: number;
  cumulativeTarget: number;
}

/**
 * v4.0 Phase 22: Unified stats from useGoalData hook
 * When provided, EarningsChart uses these values instead of internal calculations
 */
interface UnifiedStats {
  totalEarned: number;
  weeklyTarget: number;
  linearWeeklyNeed: number;
  cumulativeTarget: number;
  status: 'ahead' | 'on-track' | 'behind' | 'critical';
  weeksRemaining: number;
  percentComplete: number;
  onPace: boolean;
}

interface EarningsChartProps {
  goal: Goal;
  /** Weekly earnings data (if available) */
  weeklyEarnings?: WeeklyEarning[];
  /** Current total saved towards goal */
  currentSaved?: number;
  currency?: Currency;
  /** Compact mode for smaller display */
  compact?: boolean;
  /** Capacity-adjusted weekly target (from retroplan) */
  adjustedWeeklyTarget?: number;
  /** v4.0: Capacity-aware milestones from retroplan for non-linear pace line */
  milestones?: ChartMilestone[];
  /** v4.0 Phase 22: Unified stats from useGoalData hook */
  stats?: UnifiedStats;
}

export function EarningsChart(props: EarningsChartProps) {
  const currency = () => props.currency || 'USD';
  let canvasRef: HTMLCanvasElement | undefined;
  let chartInstance: ChartJS | null = null;

  // Generate projected data points
  const generateChartData = () => {
    const goal = props.goal;
    const goalAmount = goal.amount;
    const currentSaved =
      props.currentSaved ?? Math.round((goalAmount * (goal.progress || 0)) / 100);

    // Calculate weeks until deadline
    const now = new Date();
    const deadline = goal.deadline
      ? new Date(goal.deadline)
      : new Date(now.getTime() + 8 * 7 * 24 * 60 * 60 * 1000);
    const totalWeeks = Math.max(
      1,
      Math.ceil((deadline.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000))
    );
    const weeksCount = Math.min(totalWeeks + 1, 12); // Show max 12 weeks

    // Generate labels (week numbers)
    const labels: string[] = [];
    const requiredPace: number[] = [];
    const projectedEarnings: number[] = [];
    const actualEarnings: number[] = [];

    const weeklyRequired = (goalAmount - currentSaved) / Math.max(1, totalWeeks);
    const currentWeeklyRate = props.weeklyEarnings?.length
      ? props.weeklyEarnings.reduce((sum, w) => sum + w.earned, 0) / props.weeklyEarnings.length
      : weeklyRequired; // Assume on pace if no data

    for (let i = 0; i <= weeksCount; i++) {
      labels.push(i === 0 ? 'Now' : `W${i}`);

      // Required pace line: use capacity-aware milestones if provided, else linear
      if (props.milestones && props.milestones.length > 0) {
        // v4.0: Capacity-aware pace from milestones
        // Find milestone for week i (milestones are 1-indexed)
        const milestone = props.milestones.find((m) => m.week === i);
        if (milestone) {
          requiredPace.push(Math.min(goalAmount, Math.round(milestone.cumulativeTarget)));
        } else if (i === 0) {
          // Week 0 = current savings
          requiredPace.push(currentSaved);
        } else {
          // Week beyond milestones - use last milestone or cap at goal
          const lastMilestone = props.milestones[props.milestones.length - 1];
          requiredPace.push(
            Math.min(goalAmount, Math.round(lastMilestone?.cumulativeTarget ?? goalAmount))
          );
        }
      } else {
        // Fallback: linear pace (existing behavior)
        const requiredCumulative = Math.min(goalAmount, currentSaved + weeklyRequired * i);
        requiredPace.push(Math.round(requiredCumulative));
      }

      // Projected at current rate
      const projectedCumulative = Math.min(goalAmount * 1.2, currentSaved + currentWeeklyRate * i);
      projectedEarnings.push(Math.round(projectedCumulative));

      // Actual earnings (only for past weeks)
      if (props.weeklyEarnings && i <= props.weeklyEarnings.length) {
        const actualCumulative = props.weeklyEarnings
          .slice(0, i)
          .reduce((sum, w) => sum + w.earned, currentSaved);
        actualEarnings.push(actualCumulative);
      }
    }

    return {
      labels,
      requiredPace,
      projectedEarnings,
      actualEarnings,
      goalAmount,
      currentSaved,
      weeklyRequired,
      currentWeeklyRate,
      totalWeeks,
    };
  };

  // Safely destroy any existing chart on the canvas
  const destroyExistingChart = () => {
    // First try our tracked instance
    if (chartInstance) {
      try {
        chartInstance.destroy();
      } catch {
        // Ignore errors
      }
      chartInstance = null;
    }

    // Also check Chart.js's internal registry
    if (canvasRef) {
      const existingChart = ChartJS.getChart(canvasRef);
      if (existingChart) {
        try {
          existingChart.destroy();
        } catch {
          // Ignore errors
        }
      }
    }
  };

  // Create chart
  const createChart = () => {
    if (!canvasRef) return;

    // Always destroy existing chart first
    destroyExistingChart();

    const data = generateChartData();
    const ctx = canvasRef.getContext('2d');
    if (!ctx) return;

    const chartData: ChartData<'line'> = {
      labels: data.labels,
      datasets: [
        // Goal line (horizontal dashed)
        {
          label: 'Goal',
          data: data.labels.map(() => data.goalAmount),
          borderColor: 'rgb(239, 68, 68)',
          borderWidth: 2,
          borderDash: [5, 5],
          pointRadius: 0,
          fill: false,
        },
        // Required pace line
        {
          label: 'Required Pace',
          data: data.requiredPace,
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
        // Projected earnings
        {
          label: 'Projected',
          data: data.projectedEarnings,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.15)',
          borderWidth: 2,
          pointRadius: 3,
          pointBackgroundColor: 'rgb(34, 197, 94)',
          fill: true,
          tension: 0.3,
        },
        // Actual earnings (if available)
        ...(data.actualEarnings.length > 0
          ? [
              {
                label: 'Actual',
                data: data.actualEarnings,
                borderColor: 'rgb(59, 130, 246)',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderWidth: 3,
                pointRadius: 4,
                pointBackgroundColor: 'rgb(59, 130, 246)',
                fill: true,
              },
            ]
          : []),
      ],
    };

    const options: ChartOptions<'line'> = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: !props.compact,
          position: 'top',
          labels: {
            boxWidth: 12,
            padding: 8,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.parsed.y ?? 0;
              return `${context.dataset.label}: ${formatCurrency(value, currency())}`;
            },
          },
        },
      },
      scales: {
        x: {
          display: true,
          grid: { display: false },
          ticks: {
            font: { size: 10 },
            color: 'rgb(148, 163, 184)',
          },
        },
        y: {
          display: true,
          beginAtZero: true,
          max: Math.ceil(data.goalAmount * 1.1),
          grid: {
            color: 'rgba(148, 163, 184, 0.1)',
          },
          ticks: {
            font: { size: 10 },
            color: 'rgb(148, 163, 184)',
            callback: (value) => {
              if (typeof value === 'number') {
                return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toString();
              }
              return value;
            },
          },
        },
      },
    };

    try {
      chartInstance = new ChartJS(ctx, {
        type: 'line',
        data: chartData,
        options,
      });
    } catch (err) {
      console.warn('Chart creation failed, retrying...', err);
      // If creation fails, force cleanup and retry once
      destroyExistingChart();
      try {
        chartInstance = new ChartJS(ctx, {
          type: 'line',
          data: chartData,
          options,
        });
      } catch {
        // Give up
      }
    }
  };

  // Initialize chart on mount with delay
  onMount(() => {
    // Delay to ensure DOM is ready
    const timer = setTimeout(() => {
      createChart();
    }, 100);

    return () => clearTimeout(timer);
  });

  // Cleanup on unmount
  onCleanup(() => {
    destroyExistingChart();
  });

  // Calculate summary stats - prefer unified stats from hook if provided
  const stats = createMemo(() => {
    // Phase 22: Use unified stats from hook if available
    if (props.stats) {
      const weeksToGoal =
        props.stats.onPace && props.stats.weeklyTarget > 0
          ? Math.ceil((props.goal.amount - props.stats.totalEarned) / props.stats.weeklyTarget)
          : null;

      return {
        currentSaved: props.stats.totalEarned,
        goalAmount: props.goal.amount,
        weeklyRequired: props.stats.weeklyTarget, // Use capacity-aware target, not linear
        currentWeeklyRate: props.stats.weeklyTarget,
        onPace: props.stats.onPace,
        percentComplete: props.stats.percentComplete,
        weeksToGoal,
        totalWeeks: props.stats.weeksRemaining,
      };
    }

    // Fallback to internal calculation (backward compatibility)
    const data = generateChartData();
    const onPace = data.currentWeeklyRate >= data.weeklyRequired * 0.9;
    const percentComplete = Math.round((data.currentSaved / data.goalAmount) * 100);
    const weeksToGoal =
      data.currentWeeklyRate > 0
        ? Math.ceil((data.goalAmount - data.currentSaved) / data.currentWeeklyRate)
        : null;

    return {
      currentSaved: data.currentSaved,
      goalAmount: data.goalAmount,
      weeklyRequired: data.weeklyRequired,
      currentWeeklyRate: data.currentWeeklyRate,
      onPace,
      percentComplete,
      weeksToGoal,
      totalWeeks: data.totalWeeks,
    };
  });

  return (
    <div class="space-y-3">
      {/* Stats summary */}
      <Show when={!props.compact}>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div
            class="bg-muted/50 rounded-lg p-2"
            title="Sum of all your income sources toward this goal (missions, savings, sales)"
          >
            <p class="text-[10px] text-muted-foreground uppercase">Total Earned</p>
            <p class="text-sm font-bold text-green-600 dark:text-green-400">
              {formatCurrency(stats().currentSaved, currency())}
            </p>
          </div>
          <div
            class="bg-muted/50 rounded-lg p-2"
            title="Amount adjusted based on your availability this week (capacity-aware calculation)"
          >
            <p class="text-[10px] text-muted-foreground uppercase">This Week's Target</p>
            <p class="text-sm font-bold text-amber-600 dark:text-amber-400">
              {formatCurrency(Math.round(stats().weeklyRequired), currency())}
              <Show
                when={
                  props.adjustedWeeklyTarget &&
                  Math.abs(props.adjustedWeeklyTarget - stats().weeklyRequired) > 10
                }
              >
                <span class="text-[9px] font-normal text-muted-foreground"> avg</span>
              </Show>
            </p>
            <Show
              when={
                props.adjustedWeeklyTarget &&
                Math.abs(props.adjustedWeeklyTarget - stats().weeklyRequired) > 10
              }
            >
              <p class="text-[9px] text-muted-foreground mt-0.5">
                Adjusted: {formatCurrency(Math.round(props.adjustedWeeklyTarget!), currency())}
              </p>
            </Show>
          </div>
          <div
            class="bg-muted/50 rounded-lg p-2"
            title="Based on cumulative progress: Ahead (105%+), On Track (90%+), Behind (40%+), Critical (<40%)"
          >
            <p class="text-[10px] text-muted-foreground uppercase">Status</p>
            <p
              class={`text-sm font-bold ${
                props.stats?.status === 'ahead' || stats().onPace
                  ? 'text-green-600 dark:text-green-400'
                  : props.stats?.status === 'critical'
                    ? 'text-red-600 dark:text-red-400'
                    : props.stats?.status === 'behind'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-red-600 dark:text-red-400'
              }`}
            >
              {props.stats?.status === 'ahead'
                ? '🚀 Ahead'
                : props.stats?.status === 'on-track' || stats().onPace
                  ? '✓ On Track'
                  : props.stats?.status === 'behind'
                    ? '⚠ Behind'
                    : '🔴 Critical'}
            </p>
            <p
              class="text-[9px] text-muted-foreground mt-0.5"
              title="Estimate based on your current earning rate"
            >
              {stats().weeksToGoal ? `Est. ${stats().weeksToGoal} weeks` : ''}
            </p>
          </div>
        </div>
      </Show>

      {/* Chart */}
      <div class={props.compact ? 'h-32' : 'h-48'}>
        <canvas ref={canvasRef} />
      </div>

      {/* Compact summary */}
      <Show when={props.compact}>
        <div class="flex justify-between text-xs text-muted-foreground">
          <span>{stats().percentComplete}% complete</span>
          <Show when={stats().weeksToGoal}>
            <span>~{stats().weeksToGoal}w to goal</span>
          </Show>
        </div>
      </Show>
    </div>
  );
}

export default EarningsChart;
