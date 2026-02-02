/**
 * Earnings vs Goal Chart Component
 *
 * Visualizes earnings progress against goal target using Chart.js.
 * Shows cumulative earnings, required pace, and goal amount.
 */

import { onMount, onCleanup, Show, createMemo, createEffect, on } from 'solid-js';
import type { Goal } from '~/lib/goalService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { GOAL_STATUS_THRESHOLDS } from '~/lib/goalStatus';

// Chart.js imports
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';

// Register Chart.js components once - LineController is required for line charts
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  LineController,
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
  /** Weekly earnings data (if available) - past earnings only */
  weeklyEarnings?: WeeklyEarning[];
  /** Projected weekly earnings including future scheduled (for projection line) */
  projectedWeeklyEarnings?: WeeklyEarning[];
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
  /** Monthly margin (income - expenses). If negative, shows deficit impact on chart */
  monthlyMargin?: number;
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
    // Calculate actual earning rate from past data (for stats display)
    const currentWeeklyRate = props.weeklyEarnings?.length
      ? props.weeklyEarnings.reduce((sum, w) => sum + w.earned, 0) / props.weeklyEarnings.length
      : 0;

    // Calculate weekly deficit if margin is negative
    // This will be subtracted from Projected/Actual to show net progress
    const monthlyMargin = props.monthlyMargin ?? 0;
    const weeklyDeficit = monthlyMargin < 0 ? Math.abs(monthlyMargin) / 4.33 : 0;

    for (let i = 0; i <= weeksCount; i++) {
      labels.push(i === 0 ? 'Now' : `W${i}`);

      // IMPORTANT: Chart index i maps to goal week (i + 1)
      // because weeks are 1-indexed: chart[0]="Now"=week1, chart[1]="W1"=week2, etc.
      const goalWeek = i + 1;

      // Required pace line: use capacity-aware milestones if provided, else linear
      // Note: Don't cap at goalAmount - with negative margin, cumulativeTarget can exceed goal
      // because it represents total WORK earnings needed (goal + deficit compensation)
      if (props.milestones && props.milestones.length > 0) {
        // v4.0: Capacity-aware pace from milestones
        const milestone = props.milestones.find((m) => m.week === goalWeek);
        if (milestone) {
          requiredPace.push(Math.round(milestone.cumulativeTarget));
        } else if (i === 0) {
          // No milestone for week 1 - start from 0
          requiredPace.push(0);
        } else {
          // Week beyond milestones - use last milestone value
          const lastMilestone = props.milestones[props.milestones.length - 1];
          requiredPace.push(Math.round(lastMilestone?.cumulativeTarget ?? goalAmount));
        }
      } else {
        // Fallback: linear pace (existing behavior)
        const requiredCumulative = currentSaved + weeklyRequired * i;
        requiredPace.push(Math.round(requiredCumulative));
      }

      // Cumulative deficit at this week (only if margin is negative)
      const cumulativeDeficit = weeklyDeficit * i;

      // Projected earnings: use scheduled future earnings if available
      // This shows when savings will actually arrive (at income day each month)
      // With negative margin, subtract cumulative deficit to show NET progress
      if (props.projectedWeeklyEarnings && props.projectedWeeklyEarnings.length > 0) {
        // Find the latest projected entry for week <= goalWeek
        const relevantProjected = [...props.projectedWeeklyEarnings]
          .reverse()
          .find((w) => w.week <= goalWeek);

        if (relevantProjected) {
          // Subtract deficit to show net (can go negative)
          const netProjected = relevantProjected.cumulative - cumulativeDeficit;
          projectedEarnings.push(Math.round(netProjected));
        } else {
          // Before first scheduled earning - show deficit impact
          projectedEarnings.push(Math.round(-cumulativeDeficit));
        }
      } else {
        // Fallback: no projection data, show current minus deficit
        projectedEarnings.push(Math.round(currentSaved - cumulativeDeficit));
      }

      // Actual earnings (past earnings only)
      // weeklyEarnings already has cumulative totals calculated correctly
      // With negative margin, subtract cumulative deficit to show NET progress
      if (props.weeklyEarnings && props.weeklyEarnings.length > 0) {
        // Find the latest earnings entry at or before this goal week
        const relevantEntry = [...props.weeklyEarnings].reverse().find((w) => w.week <= goalWeek);

        if (relevantEntry) {
          // Use the pre-calculated cumulative, minus deficit to show net
          const netActual = relevantEntry.cumulative - cumulativeDeficit;
          actualEarnings.push(Math.round(netActual));
        } else {
          // Before first earnings - show deficit impact
          actualEarnings.push(Math.round(-cumulativeDeficit));
        }
      }
    }

    // Calculate min/max values for Y-axis scaling
    // Include all data series + goalAmount to ensure proper scale
    // With negative margin, values can go negative
    const allValues = [...requiredPace, ...projectedEarnings, ...actualEarnings, goalAmount];
    const validValues = allValues.filter((v) => v != null && !isNaN(v));
    const maxDataValue = Math.max(...validValues);
    const minDataValue = Math.min(...validValues, 0); // Include 0 to ensure axis includes it

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
      maxValue: Math.ceil(maxDataValue * 1.1), // 10% padding above max
      minValue: minDataValue < 0 ? Math.floor(minDataValue * 1.1) : 0, // 10% padding below min if negative
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
          min: data.minValue, // Can be negative with monthly deficit
          max: data.maxValue, // Dynamic: adapts to required pace (can exceed goalAmount with negative margin)
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

  // Update chart when relevant props change
  // This ensures the chart reflects the latest data without requiring a page refresh
  createEffect(
    on(
      // Track these reactive props
      () => [
        props.milestones,
        props.stats,
        props.weeklyEarnings,
        props.projectedWeeklyEarnings,
        props.monthlyMargin,
        props.goal?.amount,
        props.goal?.deadline,
      ],
      () => {
        // Skip if chart hasn't been created yet (onMount handles initial creation)
        if (!chartInstance || !canvasRef) return;

        // Regenerate chart data with new props
        const data = generateChartData();
        const chartData = chartInstance.data;

        // Update datasets
        if (chartData.labels) {
          chartData.labels = data.labels;
        }

        // Update each dataset's data
        if (chartData.datasets[0]) chartData.datasets[0].data = data.requiredPace;
        if (chartData.datasets[1]) chartData.datasets[1].data = data.projectedEarnings;
        if (chartData.datasets[2]) chartData.datasets[2].data = data.actualEarnings;

        // Update Y-axis scale if needed
        const maxDataValue = Math.max(
          data.goalAmount,
          ...data.requiredPace,
          ...data.projectedEarnings,
          ...data.actualEarnings
        );
        const minDataValue = Math.min(0, ...data.projectedEarnings, ...data.actualEarnings);

        if (chartInstance.options.scales?.y) {
          chartInstance.options.scales.y.max = Math.ceil(maxDataValue * 1.1);
          chartInstance.options.scales.y.min =
            minDataValue < 0 ? Math.floor(minDataValue * 1.1) : 0;
        }

        // Trigger chart update
        chartInstance.update('none'); // 'none' disables animations for immediate update
      },
      { defer: true } // Don't run on initial mount (onMount handles that)
    )
  );

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
            title={`Based on cumulative progress: Ahead (${Math.round(GOAL_STATUS_THRESHOLDS.AHEAD * 100)}%+), On Track (${Math.round(GOAL_STATUS_THRESHOLDS.ON_TRACK * 100)}%+), Behind (${Math.round(GOAL_STATUS_THRESHOLDS.BEHIND * 100)}%+), Critical (<${Math.round(GOAL_STATUS_THRESHOLDS.BEHIND * 100)}%)`}
          >
            <p class="text-[10px] text-muted-foreground uppercase">Status</p>
            <p
              class={`text-sm font-bold ${
                props.stats?.status === 'ahead'
                  ? 'text-green-600 dark:text-green-400'
                  : props.stats?.status === 'on-track'
                    ? 'text-primary'
                    : props.stats?.status === 'behind'
                      ? 'text-amber-600 dark:text-amber-400'
                      : props.stats?.status === 'critical'
                        ? 'text-red-600 dark:text-red-400'
                        : stats().onPace
                          ? 'text-primary'
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

      {/* Chart Legend */}
      <Show when={!props.compact}>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border/50">
          <span class="flex items-center gap-1">
            <span class="inline-block w-4 h-0.5 bg-red-500" style={{ 'border-style': 'dashed' }} />
            Goal target ({formatCurrency(props.goal.amount, currency())})
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block w-4 h-0.5 bg-yellow-500" />
            Required pace
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block w-4 h-0.5 bg-green-500" />
            Projected
          </span>
          <Show when={props.weeklyEarnings && props.weeklyEarnings.length > 0}>
            <span class="flex items-center gap-1">
              <span class="inline-block w-4 h-0.5 bg-blue-500" />
              Actual
            </span>
          </Show>
        </div>
      </Show>

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
