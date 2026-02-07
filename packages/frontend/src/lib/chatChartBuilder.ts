/**
 * Chat Chart Builder
 *
 * Builds UIResource chart data from projection results.
 * Used by chat API to generate visual comparisons for what-if scenarios.
 *
 * Sprint Graphiques: Added chart gallery and specific chart builders
 */

import type { UIResource } from '../types/chat';
import type { ProjectionResult } from './budgetEngine';

// =============================================================================
// Chart Type Definitions
// =============================================================================

export type ChartType =
  | 'budget_breakdown'
  | 'progress'
  | 'projection'
  | 'comparison'
  | 'energy'
  | 'skills'
  | 'missions'
  | 'capacity';

/**
 * Simulation context for charts - shows when data is from a simulated future date
 * Properties are optional to match TimeContext from timeAwareDate.ts
 */
export interface SimulationInfo {
  isSimulating?: boolean;
  offsetDays?: number;
  simulatedDate?: string;
}

export interface ChartGalleryItem {
  id: ChartType;
  label: string;
  description: string;
  icon: string;
}

/**
 * Available charts for the gallery
 */
export const AVAILABLE_CHARTS: ChartGalleryItem[] = [
  {
    id: 'budget_breakdown',
    label: 'Budget Overview',
    description: 'Income vs Expenses vs Savings',
    icon: '📊',
  },
  {
    id: 'progress',
    label: 'Savings Progress',
    description: 'Timeline towards your goal',
    icon: '📈',
  },
  {
    id: 'projection',
    label: 'Goal Projection',
    description: "When you'll reach your target",
    icon: '🎯',
  },
  {
    id: 'energy',
    label: 'Energy Timeline',
    description: 'Your energy levels over time',
    icon: '⚡',
  },
  {
    id: 'skills',
    label: 'Skill Match',
    description: 'Jobs ranked by arbitrage score',
    icon: '💼',
  },
  {
    id: 'missions',
    label: 'Mission Progress',
    description: 'Active missions status',
    icon: '✅',
  },
  {
    id: 'capacity',
    label: 'Weekly Capacity',
    description: 'Available hours next 4 weeks',
    icon: '📅',
  },
];

// =============================================================================
// Chart Gallery Builder (Sprint Graphiques)
// =============================================================================

/**
 * Build a chart gallery UIResource with buttons for available chart types
 */
export function buildChartGallery(): UIResource {
  const chartButtons: UIResource[] = AVAILABLE_CHARTS.map((chart) => ({
    type: 'action',
    params: {
      type: 'button',
      label: `${chart.icon} ${chart.label}`,
      variant: 'outline',
      action: 'show_chart',
      params: { chartType: chart.id },
    },
  }));

  return {
    type: 'grid',
    params: {
      columns: 2,
      children: chartButtons,
    },
  };
}

/**
 * Build a comparison chart UIResource from projection result
 * @param simulationInfo Optional - when provided and isSimulating is true, adds simulation indicator to title
 */
export function buildProjectionChart(
  projection: ProjectionResult,
  currencySymbol: string = '$',
  simulationInfo?: SimulationInfo,
  financialContext?: { currentSaved: number; goalAmount: number }
): UIResource {
  // Add simulation indicator to title if simulating
  const simSuffix = simulationInfo?.isSimulating
    ? ` (Simulated +${simulationInfo.offsetDays ?? 0}d)`
    : '';

  if (!projection.scenarioPath) {
    // No scenario — build a 3-dataset line chart (like buildProgressChart but richer)
    const currentSaved = financialContext?.currentSaved ?? 0;
    const goalAmount =
      financialContext?.goalAmount ?? Math.round(projection.currentPath.projectedTotal * 1.2);
    const weeksRemaining = projection.timeInfo.weeksRemaining;
    const weeklyContribution = projection.currentPath.monthlyMargin / 4.33;

    const numPoints = Math.min(Math.max(weeksRemaining, 4), 16);
    const labels: string[] = [];
    const projectedData: number[] = [];
    const goalLine: number[] = [];
    const requiredPaceData: number[] = [];

    // Required pace: linear from currentSaved → goalAmount over weeksRemaining
    const weeklyPaceNeeded = weeksRemaining > 0 ? (goalAmount - currentSaved) / weeksRemaining : 0;

    let accumulated = currentSaved;
    for (let i = 0; i <= numPoints; i++) {
      labels.push(i === 0 ? 'Now' : `W${i}`);
      projectedData.push(Math.round(accumulated));
      goalLine.push(goalAmount);
      requiredPaceData.push(Math.round(currentSaved + weeklyPaceNeeded * i));
      accumulated += weeklyContribution;
    }

    return {
      type: 'chart',
      params: {
        type: 'line',
        title: `Goal Projection${simSuffix}`,
        data: {
          labels,
          datasets: [
            {
              label: 'Projected Savings',
              data: projectedData,
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              borderColor: 'rgb(59, 130, 246)',
            },
            {
              label: 'Goal',
              data: goalLine,
              backgroundColor: 'transparent',
              borderColor: 'rgba(34, 197, 94, 0.6)',
            },
            {
              label: 'Required Pace',
              data: requiredPaceData,
              backgroundColor: 'transparent',
              borderColor: 'rgba(251, 191, 36, 0.6)',
            },
          ],
        },
      },
    };
  }

  return {
    type: 'chart',
    params: {
      type: 'comparison',
      title: `Goal Projection Comparison${simSuffix}`,
      data: {
        labels: ['Current Path', 'With Changes'],
        datasets: [
          {
            label: 'Projected Amount',
            data: [
              Math.round(projection.currentPath.projectedTotal),
              Math.round(projection.scenarioPath.projectedTotal),
            ],
            backgroundColor: [
              projection.currentPath.success ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
              projection.scenarioPath.success
                ? 'rgba(34, 197, 94, 0.5)'
                : 'rgba(251, 191, 36, 0.5)',
            ],
            borderColor: [
              projection.currentPath.success ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
              projection.scenarioPath.success ? 'rgb(34, 197, 94)' : 'rgb(251, 191, 36)',
            ],
          },
        ],
      },
      summary: {
        currentWeeks: projection.currentPath.weeksToGoal,
        scenarioWeeks: projection.scenarioPath.weeksToGoal,
        weeksSaved: projection.delta?.weeks || 0,
      },
    },
  };
}

/**
 * Build a progress chart showing saved amount over time
 * @param simulationInfo Optional - when provided and isSimulating is true, adds simulation indicator to title
 * @param oneTimeGains Optional - one-time gains from trades (added to starting point, not accumulated weekly)
 */
export function buildProgressChart(
  currentSaved: number,
  goalAmount: number,
  weeksRemaining: number,
  weeklyContribution: number,
  _currencySymbol: string = '$',
  simulationInfo?: SimulationInfo,
  oneTimeGains: number = 0
): UIResource {
  // Generate data points for the next N weeks
  const numPoints = Math.min(weeksRemaining, 12);
  const labels: string[] = [];
  const data: number[] = [];
  const goalLine: number[] = [];
  const requiredPaceData: number[] = [];

  // Required pace: linear from current position → goalAmount over weeksRemaining
  const startingPoint = currentSaved + oneTimeGains;
  const weeklyPaceNeeded = weeksRemaining > 0 ? (goalAmount - startingPoint) / weeksRemaining : 0;

  // oneTimeGains is a CONSTANT addition to the starting point.
  // It represents already-realized gains (completed trades, current borrow savings).
  let accumulated = startingPoint;
  for (let i = 0; i <= numPoints; i++) {
    labels.push(i === 0 ? 'Now' : `Week ${i}`);
    data.push(Math.round(accumulated));
    goalLine.push(goalAmount);
    requiredPaceData.push(Math.round(startingPoint + weeklyPaceNeeded * i));
    accumulated += weeklyContribution;
  }

  // Build title with simulation and trades indicators
  const hasOneTimeGains = oneTimeGains > 0;
  const baseTitle = simulationInfo?.isSimulating
    ? `Savings Projection (Simulated +${simulationInfo.offsetDays ?? 0}d)`
    : 'Savings Projection';
  const title = hasOneTimeGains ? `${baseTitle} (incl. trades)` : baseTitle;

  return {
    type: 'chart',
    params: {
      type: 'line',
      title,
      data: {
        labels,
        datasets: [
          {
            label: 'Projected Savings',
            data,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgb(59, 130, 246)',
          },
          {
            label: 'Goal',
            data: goalLine,
            backgroundColor: 'transparent',
            borderColor: 'rgba(34, 197, 94, 0.5)',
          },
          {
            label: 'Required Pace',
            data: requiredPaceData,
            backgroundColor: 'transparent',
            borderColor: 'rgba(251, 191, 36, 0.6)',
          },
        ],
      },
    },
  };
}

/**
 * Trade potential data for budget chart
 */
export interface TradePotential {
  /** Potential from items available for sale (pending sell trades) */
  sellPotential: number;
  /** Potential savings from borrowing items (pending borrow trades) */
  borrowPotential: number;
}

/**
 * Build a budget breakdown chart
 * Optionally includes trade potential (sell items + borrow savings)
 */
export function buildBudgetBreakdownChart(
  income: number,
  expenses: number,
  savings: number,
  _currencySymbol: string = '$',
  tradePotential?: TradePotential
): UIResource {
  // Base labels and data
  const labels = ['Income', 'Expenses', 'Savings'];
  const data = [income, expenses, savings];
  const backgroundColors = [
    'rgba(34, 197, 94, 0.5)', // green - income
    'rgba(239, 68, 68, 0.5)', // red - expenses
    'rgba(59, 130, 246, 0.5)', // blue - savings
  ];
  const borderColors = ['rgb(34, 197, 94)', 'rgb(239, 68, 68)', 'rgb(59, 130, 246)'];

  // Add trade potential if available
  if (tradePotential && (tradePotential.sellPotential > 0 || tradePotential.borrowPotential > 0)) {
    if (tradePotential.sellPotential > 0) {
      labels.push('Sell Potential');
      data.push(tradePotential.sellPotential);
      backgroundColors.push('rgba(251, 191, 36, 0.5)'); // amber
      borderColors.push('rgb(251, 191, 36)');
    }
    if (tradePotential.borrowPotential > 0) {
      labels.push('Borrow Savings');
      data.push(tradePotential.borrowPotential);
      backgroundColors.push('rgba(168, 85, 247, 0.5)'); // purple
      borderColors.push('rgb(168, 85, 247)');
    }
  }

  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Monthly Budget Breakdown',
      data: {
        labels,
        datasets: [
          {
            label: 'Amount',
            data,
            backgroundColor: backgroundColors,
            borderColor: borderColors,
          },
        ],
      },
    },
  };
}

/**
 * Build a scenario comparison grid (multiple scenarios)
 */
export function buildScenarioGrid(
  scenarios: Array<{
    name: string;
    projectedAmount: number;
    weeksToGoal: number | null;
    success: boolean;
  }>,
  _currencySymbol: string = '$'
): UIResource {
  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Scenario Comparison',
      data: {
        labels: scenarios.map((s) => s.name),
        datasets: [
          {
            label: 'Projected Amount',
            data: scenarios.map((s) => Math.round(s.projectedAmount)),
            backgroundColor: scenarios.map((s) =>
              s.success ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            ),
            borderColor: scenarios.map((s) =>
              s.success ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'
            ),
          },
        ],
      },
    },
  };
}

// =============================================================================
// Energy Chart Builder (Sprint Graphiques)
// =============================================================================

export interface EnergyLogEntry {
  date: string;
  level: number;
}

/**
 * Build an energy timeline chart
 * Shows energy levels over time with threshold lines
 */
export function buildEnergyChart(
  energyLogs: EnergyLogEntry[],
  _title: string = 'Energy Timeline'
): UIResource {
  // Sort logs by date and take last 12 entries
  const sortedLogs = [...energyLogs]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(-12);

  if (sortedLogs.length === 0) {
    return {
      type: 'metric',
      params: {
        title: 'No Energy Data',
        value: '-',
        subtitle: 'Start tracking your energy levels',
      },
    };
  }

  // Format labels as short dates
  const labels = sortedLogs.map((log) => {
    const date = new Date(log.date);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  });

  const data = sortedLogs.map((log) => log.level);

  // Threshold lines
  const lowThreshold = sortedLogs.map(() => 40);
  const highThreshold = sortedLogs.map(() => 80);

  return {
    type: 'chart',
    params: {
      type: 'line',
      title: 'Energy Timeline',
      data: {
        labels,
        datasets: [
          {
            label: 'Energy Level',
            data,
            backgroundColor: 'rgba(251, 191, 36, 0.2)',
            borderColor: 'rgb(251, 191, 36)',
          },
          {
            label: 'Low Threshold',
            data: lowThreshold,
            backgroundColor: 'transparent',
            borderColor: 'rgba(239, 68, 68, 0.4)',
          },
          {
            label: 'Recovery Threshold',
            data: highThreshold,
            backgroundColor: 'transparent',
            borderColor: 'rgba(34, 197, 94, 0.4)',
          },
        ],
      },
    },
  };
}

// =============================================================================
// Skill Arbitrage Chart Builder (Phase 3.1)
// =============================================================================

export interface SkillJobMatch {
  jobTitle: string;
  score: number;
  rateScore: number;
  demandScore: number;
  effortScore: number;
  restScore: number;
  hourlyRate: number;
}

export function buildSkillArbitrageChart(
  matches: SkillJobMatch[],
  currencySymbol: string
): UIResource {
  const top5 = matches.slice(0, 5);

  if (top5.length === 0) {
    return {
      type: 'metric',
      params: {
        title: 'No Job Matches',
        value: '-',
        subtitle: 'Add skills to see job matches',
      },
    };
  }

  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Top 5 Job Matches (Skill Arbitrage)',
      data: {
        labels: top5.map((m) => `${m.jobTitle} (${currencySymbol}${m.hourlyRate}/h)`),
        datasets: [
          {
            label: 'Rate (30%)',
            data: top5.map((m) => m.rateScore * 30),
            backgroundColor: 'rgba(34,197,94,0.6)',
          },
          {
            label: 'Demand (25%)',
            data: top5.map((m) => m.demandScore * 25),
            backgroundColor: 'rgba(59,130,246,0.6)',
          },
          {
            label: 'Low Effort (25%)',
            data: top5.map((m) => m.effortScore * 25),
            backgroundColor: 'rgba(251,191,36,0.6)',
          },
          {
            label: 'Rest Impact (20%)',
            data: top5.map((m) => m.restScore * 20),
            backgroundColor: 'rgba(168,85,247,0.6)',
          },
        ],
      },
    },
  };
}

// =============================================================================
// Mission Progress Chart Builder (Phase 3.2)
// =============================================================================

export interface MissionSummary {
  title: string;
  progress: number;
  earnings: number;
  target: number;
  category: string;
}

export function buildMissionChart(missions: MissionSummary[]): UIResource {
  if (missions.length === 0) {
    return {
      type: 'metric',
      params: {
        title: 'No Active Missions',
        value: '-',
        subtitle: 'Go to Swipe to discover opportunities',
      },
    };
  }

  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Active Missions',
      data: {
        labels: missions.map((m) => m.title),
        datasets: [
          {
            label: 'Progress',
            data: missions.map((m) => m.progress),
            backgroundColor: missions.map((m) =>
              m.progress > 75
                ? 'rgba(34,197,94,0.6)'
                : m.progress > 25
                  ? 'rgba(251,191,36,0.6)'
                  : 'rgba(239,68,68,0.6)'
            ),
          },
        ],
      },
    },
  };
}

// =============================================================================
// Weekly Capacity Chart Builder (Phase 3.3)
// =============================================================================

export interface WeekCapacity {
  weekLabel: string;
  protectedHours: number;
  committedHours: number;
  availableHours: number;
}

export function buildCapacityChart(weeks: WeekCapacity[]): UIResource {
  if (weeks.length === 0) {
    return {
      type: 'metric',
      params: {
        title: 'No Capacity Data',
        value: '-',
        subtitle: 'Set your max weekly hours and academic events',
      },
    };
  }

  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Weekly Capacity (next 4 weeks)',
      data: {
        labels: weeks.map((w) => w.weekLabel),
        datasets: [
          {
            label: 'Protected',
            data: weeks.map((w) => w.protectedHours),
            backgroundColor: 'rgba(239,68,68,0.6)',
          },
          {
            label: 'Committed',
            data: weeks.map((w) => w.committedHours),
            backgroundColor: 'rgba(59,130,246,0.6)',
          },
          {
            label: 'Available',
            data: weeks.map((w) => w.availableHours),
            backgroundColor: 'rgba(34,197,94,0.6)',
          },
        ],
      },
    },
  };
}

// =============================================================================
// Capabilities Discovery UI
// =============================================================================

/**
 * Build a capabilities discovery UI showing all available features
 * Organized in 3 sections: Profile & Budget, What-If Scenarios, Charts
 */
export function buildCapabilitiesUI(): UIResource {
  // Section 1: Profile & Budget actions
  const profileButtons: UIResource[] = [
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Update Income',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'update my income' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Update Expenses',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'update my expenses' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Update Goal',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'update my goal' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Add Skill',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'add a skill' },
      },
    },
  ];

  // Section 2: What-If Scenarios
  const scenarioButtons: UIResource[] = [
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Work Extra Hours',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'what if I work 5 hours per week' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Sell Something',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'what if I sell my old laptop' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Cut Subscription',
        variant: 'outline',
        action: 'send_message',
        params: { message: 'what if I cancel a subscription' },
      },
    },
    {
      type: 'action',
      params: {
        type: 'button',
        label: 'Swipe Strategies',
        variant: 'outline',
        action: 'navigate',
        params: { to: '/swipe' },
      },
    },
  ];

  // Section 3: Charts (reuse AVAILABLE_CHARTS)
  const chartButtons: UIResource[] = AVAILABLE_CHARTS.map((chart) => ({
    type: 'action',
    params: {
      type: 'button',
      label: `${chart.icon} ${chart.label}`,
      variant: 'outline',
      action: 'show_chart',
      params: { chartType: chart.id },
    },
  }));

  return {
    type: 'composite',
    components: [
      {
        type: 'metric',
        params: {
          title: 'Profile & Budget',
          value: '',
          subtitle: 'Update your financial info',
        },
      },
      {
        type: 'grid',
        params: { columns: 2, children: profileButtons },
      },
      {
        type: 'metric',
        params: {
          title: 'What-If Scenarios',
          value: '',
          subtitle: 'Simulate changes to your plan',
        },
      },
      {
        type: 'grid',
        params: { columns: 2, children: scenarioButtons },
      },
      {
        type: 'metric',
        params: {
          title: 'Charts & Visualizations',
          value: '',
          subtitle: 'See your data visually',
        },
      },
      {
        type: 'grid',
        params: { columns: 2, children: chartButtons },
      },
    ],
  };
}

// =============================================================================
// Deep Links Helper (Phase 3.4)
// =============================================================================

/**
 * Wrap a chart UIResource with action buttons as a composite
 */
export function buildChartWithLinks(
  chart: UIResource,
  links: Array<{
    label: string;
    to?: string;
    action?: string;
    actionParams?: Record<string, unknown>;
  }>
): UIResource {
  return {
    type: 'composite',
    components: [
      chart,
      {
        type: 'grid',
        params: {
          columns: Math.min(links.length, 3),
          children: links.map((l) => ({
            type: 'action' as const,
            params: l.to
              ? { type: 'button', label: l.label, action: 'navigate', params: { to: l.to } }
              : {
                  type: 'button',
                  label: l.label,
                  action: l.action || '',
                  params: l.actionParams,
                },
          })),
        },
      },
    ],
  };
}
