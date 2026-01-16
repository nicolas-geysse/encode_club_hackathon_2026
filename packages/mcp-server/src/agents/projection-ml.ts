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

// === Tool Definitions ===

/**
 * Predict graduation balance tool
 */
export const predictGraduationBalanceTool = createTool({
  id: 'predict_graduation_balance',
  description: 'Predit le solde financier a la fin des etudes',
  inputSchema: z.object({
    monthlyIncome: z.number().describe('Revenu mensuel total'),
    monthlyExpenses: z.number().describe('Depenses mensuelles totales'),
    yearsRemaining: z.number().describe('Annees restantes avant diplome'),
    jobHoursWeekly: z.number().optional().describe('Heures de job par semaine'),
    jobHourlyRate: z.number().optional().describe('Taux horaire du job'),
    optimizationsApplied: z.array(z.string()).optional().describe('Optimisations appliquees'),
    currentSavings: z.number().optional().describe('Epargne actuelle'),
  }),
  execute: async ({ context }) => {
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
        name: 'Situation actuelle',
        monthlyMargin: currentMargin,
        finalBalance: (context.currentSavings || 0) + currentMargin * months,
      },
      withJob: {
        name: 'Avec job additionnel',
        monthlyMargin: currentMargin + additionalJobIncome,
        finalBalance:
          (context.currentSavings || 0) + (currentMargin + additionalJobIncome) * months,
      },
      optimized: {
        name: 'Avec optimisations',
        monthlyMargin: projectedMonthlyMargin,
        finalBalance: finalBalance,
      },
    };

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
          ? "Augmente tes revenus (job) ou reduis tes depenses pour eviter l'endettement."
          : finalBalance < 1000
            ? "Situation equilibree mais fragile. Un petit job ou des optimisations securiseraient ta fin d'etudes."
            : 'Bonne trajectoire! Tu devrais finir tes etudes avec une epargne confortable.',
      modelVersion: '1.0.0-formula',
    };
  },
});

/**
 * Simulate scenarios tool
 */
export const simulateScenariosTool = createTool({
  id: 'simulate_scenarios',
  description: 'Simule differents scenarios financiers (what-if analysis)',
  inputSchema: z.object({
    baseScenario: z.object({
      monthlyIncome: z.number(),
      monthlyExpenses: z.number(),
      yearsRemaining: z.number(),
      currentSavings: z.number().optional(),
    }),
    variations: z.array(
      z.object({
        name: z.string().describe('Nom du scenario'),
        incomeChange: z.number().optional().describe('Changement de revenu mensuel'),
        expenseChange: z.number().optional().describe('Changement de depenses mensuel'),
        jobHoursWeekly: z.number().optional().describe('Heures de job additionnel'),
        jobHourlyRate: z.number().optional().describe('Taux horaire'),
      })
    ),
  }),
  execute: async ({ context }) => {
    const { baseScenario, variations } = context;
    const months = baseScenario.yearsRemaining * 12;
    const currentSavings = baseScenario.currentSavings || 0;

    // Calculate base scenario
    const baseMargin = baseScenario.monthlyIncome - baseScenario.monthlyExpenses;
    const baseFinalBalance = currentSavings + baseMargin * months;

    const results = [
      {
        name: 'Situation actuelle',
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
        sortedByBalance[0].name !== 'Situation actuelle'
          ? `Le scenario "${sortedByBalance[0].name}" offre le meilleur resultat (+${sortedByBalance[0].differenceFromBase}€).`
          : 'Ta situation actuelle est deja optimale parmi les scenarios testes.',
    };
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
