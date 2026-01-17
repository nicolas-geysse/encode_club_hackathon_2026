/**
 * Projection ML Agent
 *
 * Predicts financial outcomes for students using formula-based projections.
 * Provides probability estimates and confidence intervals.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import { trace } from '../services/opik.js';

// === Tool Definitions ===

/**
 * Predict graduation balance tool
 */
export const predictGraduationBalanceTool = createTool({
  id: 'predict_graduation_balance',
  description: 'Predict the financial balance at graduation',
  inputSchema: z.object({
    monthlyIncome: z.number().describe('Total monthly income'),
    monthlyExpenses: z.number().describe('Total monthly expenses'),
    yearsRemaining: z.number().describe('Years remaining before graduation'),
    jobHoursWeekly: z.number().optional().describe('Job hours per week'),
    jobHourlyRate: z.number().optional().describe('Job hourly rate'),
    optimizationsApplied: z.array(z.string()).optional().describe('Applied optimizations'),
    currentSavings: z.number().optional().describe('Current savings'),
  }),
  execute: async ({ context }) => {
    return trace('tool.predict_graduation_balance', async (span) => {
      span.setAttributes({
        'input.monthly_income': context.monthlyIncome,
        'input.monthly_expenses': context.monthlyExpenses,
        'input.years_remaining': context.yearsRemaining,
        'input.current_savings': context.currentSavings ?? 0,
      });

      // Calculate base projections
      const currentMargin = context.monthlyIncome - context.monthlyExpenses;

      // Calculate additional job income
      const additionalJobIncome =
        context.jobHoursWeekly && context.jobHourlyRate
          ? context.jobHoursWeekly * context.jobHourlyRate * 4
          : 0;

      // Estimate optimization savings
      const optimizationSavings = (context.optimizationsApplied || []).length * 50; // avg 50€ per optimization

      // Projected monthly margin
      const projectedMonthlyMargin = currentMargin + additionalJobIncome + optimizationSavings;

      // Calculate projections
      const months = context.yearsRemaining * 12;
      const finalBalance = (context.currentSavings || 0) + projectedMonthlyMargin * months;

      // Calculate probability of being debt-free
      // Based on margin: negative margin = low probability, high margin = high probability
      const baseProbability = 0.5;
      const marginImpact = Math.min(0.4, Math.max(-0.4, (projectedMonthlyMargin / 500) * 0.4));
      const probabilityDebtFree = Math.min(0.99, Math.max(0.01, baseProbability + marginImpact));

      // Confidence interval (±20% for uncertainty)
      const uncertaintyFactor = 0.2;
      const confidenceLow = Math.round(finalBalance * (1 - uncertaintyFactor));
      const confidenceHigh = Math.round(finalBalance * (1 + uncertaintyFactor));

      // Scenario comparison
      const scenarios = {
        current: {
          name: 'Current situation',
          monthlyMargin: currentMargin,
          finalBalance: (context.currentSavings || 0) + currentMargin * months,
        },
        withJob: {
          name: 'With additional job',
          monthlyMargin: currentMargin + additionalJobIncome,
          finalBalance:
            (context.currentSavings || 0) + (currentMargin + additionalJobIncome) * months,
        },
        optimized: {
          name: 'With optimizations',
          monthlyMargin: projectedMonthlyMargin,
          finalBalance: finalBalance,
        },
      };

      span.setAttributes({
        'output.final_balance': finalBalance,
        'output.probability_debt_free': Math.round(probabilityDebtFree * 100),
        'output.projected_monthly_margin': projectedMonthlyMargin,
        'output.months_remaining': months,
      });

      return {
        prediction: {
          finalBalance,
          probabilityDebtFree: Math.round(probabilityDebtFree * 100),
          confidenceInterval: {
            low: confidenceLow,
            high: confidenceHigh,
          },
        },
        breakdown: {
          currentMargin,
          additionalJobIncome,
          optimizationSavings,
          projectedMonthlyMargin,
          months,
        },
        scenarios,
        recommendation:
          finalBalance < 0
            ? 'Increase your income (job) or reduce your expenses to avoid debt.'
            : finalBalance < 1000
              ? 'Balanced but fragile situation. A small job or optimizations would secure your graduation.'
              : 'Good trajectory! You should finish your studies with comfortable savings.',
        modelVersion: '1.0.0-formula',
      };
    });
  },
});

/**
 * Simulate scenarios tool
 */
export const simulateScenariosTool = createTool({
  id: 'simulate_scenarios',
  description: 'Simulate different financial scenarios (what-if analysis)',
  inputSchema: z.object({
    baseScenario: z.object({
      monthlyIncome: z.number(),
      monthlyExpenses: z.number(),
      yearsRemaining: z.number(),
      currentSavings: z.number().optional(),
    }),
    variations: z.array(
      z.object({
        name: z.string().describe('Scenario name'),
        incomeChange: z.number().optional().describe('Monthly income change'),
        expenseChange: z.number().optional().describe('Monthly expense change'),
        jobHoursWeekly: z.number().optional().describe('Additional job hours'),
        jobHourlyRate: z.number().optional().describe('Hourly rate'),
      })
    ),
  }),
  execute: async ({ context }) => {
    return trace('tool.simulate_scenarios', async (span) => {
      const { baseScenario, variations } = context;

      span.setAttributes({
        'input.base_monthly_income': baseScenario.monthlyIncome,
        'input.base_monthly_expenses': baseScenario.monthlyExpenses,
        'input.years_remaining': baseScenario.yearsRemaining,
        'input.variations_count': variations.length,
      });

      const months = baseScenario.yearsRemaining * 12;
      const currentSavings = baseScenario.currentSavings || 0;

      // Calculate base scenario
      const baseMargin = baseScenario.monthlyIncome - baseScenario.monthlyExpenses;
      const baseFinalBalance = currentSavings + baseMargin * months;

      const results = [
        {
          name: 'Current situation',
          monthlyMargin: baseMargin,
          finalBalance: baseFinalBalance,
          differenceFromBase: 0,
          probabilityDebtFree: Math.round(
            Math.min(0.99, Math.max(0.01, 0.5 + (baseMargin / 500) * 0.4)) * 100
          ),
        },
      ];

      // Calculate each variation
      for (const variation of variations) {
        const incomeChange = variation.incomeChange || 0;
        const expenseChange = variation.expenseChange || 0;
        const jobIncome =
          variation.jobHoursWeekly && variation.jobHourlyRate
            ? variation.jobHoursWeekly * variation.jobHourlyRate * 4
            : 0;

        const newMargin = baseMargin + incomeChange - expenseChange + jobIncome;
        const newFinalBalance = currentSavings + newMargin * months;

        results.push({
          name: variation.name,
          monthlyMargin: newMargin,
          finalBalance: newFinalBalance,
          differenceFromBase: newFinalBalance - baseFinalBalance,
          probabilityDebtFree: Math.round(
            Math.min(0.99, Math.max(0.01, 0.5 + (newMargin / 500) * 0.4)) * 100
          ),
        });
      }

      // Sort by final balance
      const sortedByBalance = [...results].sort((a, b) => b.finalBalance - a.finalBalance);

      span.setAttributes({
        'output.scenarios_count': results.length,
        'output.best_scenario': sortedByBalance[0].name,
        'output.best_final_balance': sortedByBalance[0].finalBalance,
        'output.worst_final_balance': sortedByBalance[sortedByBalance.length - 1].finalBalance,
      });

      return {
        scenarios: results,
        bestScenario: sortedByBalance[0],
        worstScenario: sortedByBalance[sortedByBalance.length - 1],
        summary: {
          totalScenariosSimulated: results.length,
          rangeOfOutcomes: {
            min: sortedByBalance[sortedByBalance.length - 1].finalBalance,
            max: sortedByBalance[0].finalBalance,
          },
        },
        recommendation:
          sortedByBalance[0].name !== 'Current situation'
            ? `The "${sortedByBalance[0].name}" scenario offers the best result (+$${sortedByBalance[0].differenceFromBase}).`
            : 'Your current situation is already optimal among the tested scenarios.',
      };
    });
  },
});

// Register tools
registerTool('predict_graduation_balance', predictGraduationBalanceTool);
registerTool('simulate_scenarios', simulateScenariosTool);

/**
 * Create Projection ML agent instance
 */
export async function createProjectionMLAgent(): Promise<Agent> {
  const config = getAgentConfig('projection-ml');
  if (!config) {
    throw new Error('Projection ML agent config not found');
  }
  return createStrideAgent(config);
}

export default {
  predictGraduationBalanceTool,
  simulateScenariosTool,
  createProjectionMLAgent,
};
