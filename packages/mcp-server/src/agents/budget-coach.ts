/**
 * Budget Coach Agent
 *
 * Analyzes student budget and provides personalized advice.
 * Uses LLM for natural language understanding and recommendations.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { defaultModel as _defaultModel } from '../mastra.config.js';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';

// === Tool Definitions ===

/**
 * Analyze budget tool
 */
export const analyzeBudgetTool = createTool({
  id: 'analyze_budget',
  description: "Analyse le budget mensuel d'un etudiant (revenus vs depenses)",
  inputSchema: z.object({
    incomes: z.array(
      z.object({
        source: z.string().describe('Source de revenu (APL, Parents, Job, Bourse)'),
        amount: z.number().describe('Montant mensuel en euros'),
      })
    ),
    expenses: z.array(
      z.object({
        category: z.string().describe('Categorie de depense (Loyer, Alimentation, Transport)'),
        amount: z.number().describe('Montant mensuel en euros'),
      })
    ),
  }),
  execute: async ({ context }) => {
    const totalIncome = context.incomes.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = context.expenses.reduce((sum, e) => sum + e.amount, 0);
    const margin = totalIncome - totalExpenses;

    // Categorize expenses
    const expenseBreakdown = context.expenses.reduce(
      (acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    // Calculate percentages
    const expensePercentages = Object.entries(expenseBreakdown).map(([category, amount]) => ({
      category,
      amount,
      percentage: Math.round((amount / totalExpenses) * 100),
    }));

    // Determine status
    const status = margin >= 0 ? 'positif' : 'deficit';
    const severity =
      margin < -100 ? 'critique' : margin < 0 ? 'attention' : margin < 50 ? 'serré' : 'confortable';

    return {
      totalIncome,
      totalExpenses,
      margin,
      status,
      severity,
      expenseBreakdown: expensePercentages,
      incomeBreakdown: context.incomes,
      savingsRate: totalIncome > 0 ? Math.round((margin / totalIncome) * 100) : 0,
    };
  },
});

/**
 * Generate advice tool
 */
export const generateAdviceTool = createTool({
  id: 'generate_advice',
  description: 'Genere des conseils personnalises bases sur le profil etudiant',
  inputSchema: z.object({
    diploma: z.string().optional().describe('Diplome actuel'),
    skills: z.array(z.string()).optional().describe('Competences'),
    margin: z.number().optional().describe('Marge mensuelle en euros'),
    hasLoan: z.boolean().optional().describe('A un pret etudiant'),
    loanAmount: z.number().optional().describe('Montant du pret'),
    context: z.string().optional().describe('Contexte additionnel'),
  }),
  execute: async ({ context }) => {
    const advice: string[] = [];

    // Generate advice based on margin
    if (context.margin !== undefined) {
      if (context.margin < 0) {
        advice.push(
          'Priorite: reduire le deficit. Cherche des aides (APL, bourses) ou un petit job compatible.'
        );
        advice.push('Conseil: verifie ton eligibilite aux aides CROUS et CAF.');
      } else if (context.margin < 50) {
        advice.push(
          "Ta marge est serree. Constitution d'un petit coussin de securite recommandee."
        );
        advice.push(
          'Astuce: les optimisations budget (CROUS, coloc) peuvent liberer 100-200e/mois.'
        );
      } else if (context.margin < 200) {
        advice.push('Bon equilibre! Tu peux commencer a epargner regulierement.');
        advice.push('Objectif: viser 3 mois de depenses en reserve de securite.');
      } else {
        advice.push('Excellente marge! Tu as de la flexibilite pour investir en toi-meme.');
        advice.push('Idee: formations, certifications, ou experiences qui boostent ton CV.');
      }
    }

    // Advice based on loan
    if (context.hasLoan && context.loanAmount) {
      advice.push(
        `Pret etudiant de ${context.loanAmount}e: commence a planifier le remboursement des maintenant.`
      );
      advice.push(
        'Strategie: des que possible, augmente tes revenus pour accelerer le remboursement.'
      );
    }

    // Skills-based advice
    if (context.skills && context.skills.length > 0) {
      advice.push(
        `Tes competences (${context.skills.slice(0, 3).join(', ')}) sont monetisables: freelance, tutorat, stages.`
      );
    }

    return {
      advice,
      priority: context.margin && context.margin < 0 ? 'urgente' : 'normale',
      profile: {
        diploma: context.diploma,
        skills: context.skills,
        financialStatus: context.margin && context.margin < 0 ? 'deficit' : 'equilibre',
      },
    };
  },
});

/**
 * Find optimizations tool
 */
export const findOptimizationsTool = createTool({
  id: 'find_optimizations',
  description: 'Trouve des optimisations budget basees sur le knowledge graph',
  inputSchema: z.object({
    expenseCategories: z.array(z.string()).describe('Categories de depenses a optimiser'),
    currentExpenses: z.record(z.number()).optional().describe('Depenses actuelles par categorie'),
    constraints: z.array(z.string()).optional().describe('Contraintes (ex: "pas de coloc")'),
  }),
  execute: async ({ context }) => {
    // Optimization database
    const optimizations: Record<
      string,
      Array<{
        solution: string;
        savingsPct: number;
        effort: string;
        condition: string;
      }>
    > = {
      loyer: [
        { solution: 'Colocation', savingsPct: 0.3, effort: 'moyen', condition: 'bon coloc' },
        {
          solution: 'Residence CROUS',
          savingsPct: 0.4,
          effort: 'faible',
          condition: 'eligibilite',
        },
        { solution: 'APL', savingsPct: 0.25, effort: 'faible', condition: 'declaration CAF' },
      ],
      alimentation: [
        { solution: 'Resto U CROUS', savingsPct: 0.5, effort: 'faible', condition: 'proximite' },
        {
          solution: 'Batch cooking',
          savingsPct: 0.3,
          effort: 'moyen',
          condition: 'temps disponible',
        },
        {
          solution: 'Applis anti-gaspi',
          savingsPct: 0.2,
          effort: 'faible',
          condition: 'disponibilite stocks',
        },
      ],
      transport: [
        { solution: 'Velo/Marche', savingsPct: 0.8, effort: 'moyen', condition: 'ville adaptee' },
        {
          solution: 'Carte jeune SNCF',
          savingsPct: 0.3,
          effort: 'faible',
          condition: 'voyages reguliers',
        },
        {
          solution: 'Covoiturage',
          savingsPct: 0.5,
          effort: 'moyen',
          condition: 'trajets compatibles',
        },
      ],
      telephone: [
        {
          solution: 'Forfait etudiant',
          savingsPct: 0.4,
          effort: 'faible',
          condition: 'changement operateur',
        },
        {
          solution: 'Forfait famille',
          savingsPct: 0.5,
          effort: 'faible',
          condition: 'accord famille',
        },
      ],
    };

    const results: Array<{
      expense: string;
      solution: string;
      savingsPct: number;
      potentialSavings: number;
      effort: string;
      condition: string;
    }> = [];

    for (const category of context.expenseCategories) {
      const categoryLower = category.toLowerCase();
      const opts = optimizations[categoryLower] || [];
      const currentAmount =
        context.currentExpenses?.[categoryLower] || context.currentExpenses?.[category] || 0;

      // Filter out constrained solutions
      const constraints = context.constraints || [];
      const filteredOpts = opts.filter((o) => {
        const solutionLower = o.solution.toLowerCase();
        return !constraints.some((c) => solutionLower.includes(c.toLowerCase()));
      });

      for (const opt of filteredOpts) {
        results.push({
          expense: category,
          solution: opt.solution,
          savingsPct: opt.savingsPct,
          potentialSavings: Math.round(currentAmount * opt.savingsPct),
          effort: opt.effort,
          condition: opt.condition,
        });
      }
    }

    // Sort by potential savings
    results.sort((a, b) => b.potentialSavings - a.potentialSavings);

    const totalPotentialSavings = results.reduce((sum, r) => sum + r.potentialSavings, 0);

    return {
      optimizations: results.slice(0, 10),
      totalPotentialSavings,
      topRecommendation: results[0] || null,
    };
  },
});

// Register tools
registerTool('analyze_budget', analyzeBudgetTool);
registerTool('generate_advice', generateAdviceTool);
registerTool('find_optimizations', findOptimizationsTool);

/**
 * Create Budget Coach agent instance
 */
export async function createBudgetCoachAgent(): Promise<Agent> {
  const config = getAgentConfig('budget-coach');
  if (!config) {
    throw new Error('Budget Coach agent config not found');
  }
  return createStrideAgent(config);
}

export default {
  analyzeBudgetTool,
  generateAdviceTool,
  findOptimizationsTool,
  createBudgetCoachAgent,
};
