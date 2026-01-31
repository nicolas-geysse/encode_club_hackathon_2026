/**
 * Chat Chart Builder
 *
 * Builds UIResource chart data from projection results.
 * Used by chat API to generate visual comparisons for what-if scenarios.
 */

import type { UIResource } from '../types/chat';
import type { ProjectionResult } from './budgetEngine';

/**
 * Build a comparison chart UIResource from projection result
 */
export function buildProjectionChart(
  projection: ProjectionResult,
  currencySymbol: string = '$'
): UIResource {
  if (!projection.scenarioPath) {
    // No scenario to compare - return simple metric instead
    return {
      type: 'metric',
      params: {
        title: 'Current Projection',
        value: Math.round(projection.currentPath.projectedTotal),
        unit: currencySymbol,
        subtitle: projection.currentPath.success ? 'Goal achievable' : 'Need more savings',
      },
    };
  }

  return {
    type: 'chart',
    params: {
      type: 'comparison',
      title: 'Goal Projection Comparison',
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
 */
export function buildProgressChart(
  currentSaved: number,
  goalAmount: number,
  weeksRemaining: number,
  weeklyContribution: number,
  _currencySymbol: string = '$'
): UIResource {
  // Generate data points for the next N weeks
  const numPoints = Math.min(weeksRemaining, 12);
  const labels: string[] = [];
  const data: number[] = [];
  const goalLine: number[] = [];

  let accumulated = currentSaved;
  for (let i = 0; i <= numPoints; i++) {
    labels.push(i === 0 ? 'Now' : `Week ${i}`);
    data.push(Math.round(accumulated));
    goalLine.push(goalAmount);
    accumulated += weeklyContribution;
  }

  return {
    type: 'chart',
    params: {
      type: 'line',
      title: 'Savings Projection',
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
        ],
      },
    },
  };
}

/**
 * Build a budget breakdown chart
 */
export function buildBudgetBreakdownChart(
  income: number,
  expenses: number,
  savings: number,
  _currencySymbol: string = '$'
): UIResource {
  return {
    type: 'chart',
    params: {
      type: 'bar',
      title: 'Monthly Budget Breakdown',
      data: {
        labels: ['Income', 'Expenses', 'Savings'],
        datasets: [
          {
            label: 'Amount',
            data: [income, expenses, savings],
            backgroundColor: [
              'rgba(34, 197, 94, 0.5)',
              'rgba(239, 68, 68, 0.5)',
              'rgba(59, 130, 246, 0.5)',
            ],
            borderColor: ['rgb(34, 197, 94)', 'rgb(239, 68, 68)', 'rgb(59, 130, 246)'],
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
