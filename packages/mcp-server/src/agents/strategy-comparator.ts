/**
 * Strategy Comparator Agent
 *
 * Cross-evaluates all money-making and optimization strategies.
 * Compares: selling items vs side hustles vs jobs vs optimizations.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, createStrideAgent } from './factory.js';
import { trace } from '../services/opik.js';

/**
 * Strategy types
 */
export type StrategyType = 'job' | 'hustle' | 'selling' | 'optimization';

/**
 * Unified strategy interface
 */
export interface Strategy {
  id: string;
  type: StrategyType;
  name: string;
  description: string;

  // Financial impact
  oneTimeGain: number; // For selling
  monthlyGain: number; // For recurring income
  monthlySavings: number; // For optimizations

  // Effort and requirements
  effortLevel: 'low' | 'medium' | 'high';
  timeInvestmentHours: number; // Hours per week (0 for one-time)
  startupCost: number;
  skillsRequired: string[];

  // Quality factors
  flexibility: number; // 0-1
  sustainability: number; // 0-1 (how long can this last?)
  coBenefits: string[];

  // Metadata
  source: string; // Which agent/analysis suggested this
}

/**
 * Comparison result
 */
export interface StrategyComparison {
  strategies: Array<
    Strategy & {
      scores: {
        financial: number; // Weighted financial impact
        effort: number; // Inverse of effort (higher = easier)
        flexibility: number;
        sustainability: number;
        overall: number; // Weighted average
      };
      rank: number;
      monthlyEquivalent: number; // Normalized to monthly value
      timeToGoal?: number; // Months to reach a goal
    }
  >;
  bestOverall: string;
  bestQuickWin: string; // Best for immediate need
  bestLongTerm: string; // Best for sustainability
  recommendation: string;
  comparisonMatrix: Array<{
    strategyA: string;
    strategyB: string;
    winner: string;
    reason: string;
  }>;
}

/**
 * Calculate monthly equivalent value
 */
function calculateMonthlyEquivalent(strategy: Strategy): number {
  // One-time gains spread over 12 months
  const oneTimeMonthly = strategy.oneTimeGain / 12;
  // Recurring gains
  const recurringMonthly = strategy.monthlyGain + strategy.monthlySavings;

  return Math.round(oneTimeMonthly + recurringMonthly);
}

/**
 * Calculate strategy scores
 */
function scoreStrategy(
  strategy: Strategy,
  userContext: {
    monthlyMargin: number;
    hoursAvailable: number;
    skills: string[];
    urgency: 'low' | 'medium' | 'high';
    yearsRemaining: number;
  }
): {
  financial: number;
  effort: number;
  flexibility: number;
  sustainability: number;
  overall: number;
} {
  const monthlyEquiv = calculateMonthlyEquivalent(strategy);

  // Financial score (0-1) - normalized by impact relative to margin
  const financialImpact =
    Math.abs(userContext.monthlyMargin) > 0
      ? monthlyEquiv / Math.max(Math.abs(userContext.monthlyMargin), 100)
      : monthlyEquiv / 100;
  const financial = Math.min(1, financialImpact * 0.5);

  // Effort score (inverse - lower effort = higher score)
  const effortMap = { low: 0.9, medium: 0.6, high: 0.3 };
  const timeCompatibility = strategy.timeInvestmentHours <= userContext.hoursAvailable ? 1 : 0.5;
  const effort = effortMap[strategy.effortLevel] * timeCompatibility;

  // Flexibility score
  const flexibility = strategy.flexibility;

  // Sustainability score (adjusted by years remaining)
  const sustainability = strategy.sustainability * (strategy.type === 'selling' ? 0.3 : 1);

  // Calculate overall with urgency-weighted factors
  let overall: number;
  if (userContext.urgency === 'high') {
    // Urgent: prioritize quick wins and financial impact
    overall = financial * 0.5 + effort * 0.3 + flexibility * 0.15 + sustainability * 0.05;
  } else if (userContext.urgency === 'medium') {
    // Balanced
    overall = financial * 0.35 + effort * 0.25 + flexibility * 0.2 + sustainability * 0.2;
  } else {
    // Long-term focus: prioritize sustainability
    overall = financial * 0.25 + effort * 0.2 + flexibility * 0.2 + sustainability * 0.35;
  }

  return {
    financial: Math.round(financial * 100) / 100,
    effort: Math.round(effort * 100) / 100,
    flexibility: Math.round(flexibility * 100) / 100,
    sustainability: Math.round(sustainability * 100) / 100,
    overall: Math.round(overall * 100) / 100,
  };
}

/**
 * Generate head-to-head comparisons
 */
function generateComparisons(
  strategies: Array<Strategy & { scores: { overall: number } }>
): Array<{ strategyA: string; strategyB: string; winner: string; reason: string }> {
  const comparisons: Array<{
    strategyA: string;
    strategyB: string;
    winner: string;
    reason: string;
  }> = [];

  // Compare top strategies across different types
  const byType = new Map<StrategyType, (typeof strategies)[0]>();
  for (const s of strategies) {
    const existing = byType.get(s.type);
    if (!existing || s.scores.overall > existing.scores.overall) {
      byType.set(s.type, s);
    }
  }

  const types = Array.from(byType.entries());
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const [typeA, stratA] = types[i];
      const [typeB, stratB] = types[j];

      const winner = stratA.scores.overall > stratB.scores.overall ? stratA : stratB;
      const loser = winner === stratA ? stratB : stratA;

      let reason: string;
      if (winner.type === 'selling' && loser.type !== 'selling') {
        reason = 'Gain immediat vs revenu recurrent';
      } else if (winner.type === 'job' && loser.type === 'hustle') {
        reason = 'Plus stable et meilleur pour le CV';
      } else if (winner.type === 'hustle' && loser.type === 'job') {
        reason = 'Plus flexible et demarre plus vite';
      } else if (winner.type === 'optimization') {
        reason = 'Zero effort supplementaire, economies garanties';
      } else {
        reason = `Score global: ${winner.scores.overall} vs ${loser.scores.overall}`;
      }

      comparisons.push({
        strategyA: stratA.name,
        strategyB: stratB.name,
        winner: winner.name,
        reason,
      });
    }
  }

  return comparisons;
}

/**
 * Compare all strategies
 */
export async function compareStrategies(
  strategies: Strategy[],
  userContext: {
    monthlyMargin: number;
    hoursAvailable: number;
    skills: string[];
    urgency: 'low' | 'medium' | 'high';
    yearsRemaining: number;
    goalAmount?: number;
  }
): Promise<StrategyComparison> {
  return trace('strategy_comparison', async (span) => {
    span.setAttributes({
      'comparison.strategies_count': strategies.length,
      'comparison.urgency': userContext.urgency,
      'comparison.monthly_margin': userContext.monthlyMargin,
    });

    // Score all strategies
    const scoredStrategies = strategies.map((s) => {
      const scores = scoreStrategy(s, userContext);
      const monthlyEquivalent = calculateMonthlyEquivalent(s);

      let timeToGoal: number | undefined;
      if (userContext.goalAmount && monthlyEquivalent > 0) {
        timeToGoal = Math.ceil(userContext.goalAmount / monthlyEquivalent);
      }

      return {
        ...s,
        scores,
        monthlyEquivalent,
        timeToGoal,
        rank: 0, // Will be set after sorting
      };
    });

    // Sort by overall score
    scoredStrategies.sort((a, b) => b.scores.overall - a.scores.overall);

    // Assign ranks
    scoredStrategies.forEach((s, i) => {
      s.rank = i + 1;
    });

    // Find best for different criteria
    const bestOverall = scoredStrategies[0];
    const bestQuickWin =
      [...scoredStrategies]
        .filter((s) => s.type === 'selling' || s.effortLevel === 'low')
        .sort((a, b) => b.scores.financial - a.scores.financial)[0] || bestOverall;
    const bestLongTerm = [...scoredStrategies].sort(
      (a, b) => b.scores.sustainability - a.scores.sustainability
    )[0];

    // Generate comparisons
    const comparisonMatrix = generateComparisons(scoredStrategies);

    // Generate recommendation
    let recommendation: string;
    if (userContext.urgency === 'high' && userContext.monthlyMargin < 0) {
      recommendation = `URGENT: ${bestQuickWin.name} pour un gain rapide de ~${bestQuickWin.monthlyEquivalent}€/mois. `;
      recommendation += `Combine avec ${bestLongTerm.name} pour stabiliser.`;
    } else if (bestOverall.type === 'selling') {
      recommendation = `Commence par vendre (${bestOverall.name}) pour un boost de ${bestOverall.oneTimeGain}€, `;
      recommendation += `puis passe a ${scoredStrategies.find((s) => s.type !== 'selling')?.name || 'un revenu recurrent'}.`;
    } else {
      recommendation = `${bestOverall.name} est ta meilleure option (~${bestOverall.monthlyEquivalent}€/mois). `;
      if (bestOverall !== bestLongTerm) {
        recommendation += `Pour le long terme, considere ${bestLongTerm.name}.`;
      }
    }

    span.setAttributes({
      'comparison.best_overall': bestOverall.name,
      'comparison.best_quick': bestQuickWin.name,
      'comparison.best_longterm': bestLongTerm.name,
    });

    return {
      strategies: scoredStrategies,
      bestOverall: bestOverall.name,
      bestQuickWin: bestQuickWin.name,
      bestLongTerm: bestLongTerm.name,
      recommendation,
      comparisonMatrix,
    };
  });
}

/**
 * Create strategies from different sources
 */
export function createStrategyFromJob(
  job: {
    id: string;
    name: string;
    hourlyRate: number;
    flexibility: number;
    skills: string[];
    coBenefit?: string;
  },
  hoursPerWeek: number
): Strategy {
  return {
    id: `job_${job.id}`,
    type: 'job',
    name: job.name,
    description: `Job etudiant: ${job.name}`,
    oneTimeGain: 0,
    monthlyGain: Math.round(job.hourlyRate * hoursPerWeek * 4),
    monthlySavings: 0,
    effortLevel: 'medium',
    timeInvestmentHours: hoursPerWeek,
    startupCost: 0,
    skillsRequired: job.skills,
    flexibility: job.flexibility,
    sustainability: 0.8,
    coBenefits: job.coBenefit ? [job.coBenefit] : [],
    source: 'job-matcher',
  };
}

export function createStrategyFromHustle(
  hustle: {
    id: string;
    name: string;
    hourlyRate: { min: number; max: number };
    effort: 'low' | 'medium' | 'high';
    flexibility: number;
    startupCost: number;
    coBenefit: string;
  },
  hoursPerWeek: number
): Strategy {
  const avgRate = (hustle.hourlyRate.min + hustle.hourlyRate.max) / 2;
  return {
    id: `hustle_${hustle.id}`,
    type: 'hustle',
    name: hustle.name,
    description: `Side hustle: ${hustle.name}`,
    oneTimeGain: 0,
    monthlyGain: Math.round(avgRate * hoursPerWeek * 4),
    monthlySavings: 0,
    effortLevel: hustle.effort,
    timeInvestmentHours: hoursPerWeek,
    startupCost: hustle.startupCost,
    skillsRequired: [],
    flexibility: hustle.flexibility,
    sustainability: 0.6,
    coBenefits: [hustle.coBenefit],
    source: 'money-maker',
  };
}

export function createStrategyFromSelling(item: {
  name: string;
  estimatedPrice: number;
  platform: string;
}): Strategy {
  return {
    id: `sell_${item.name.toLowerCase().replace(/\s/g, '_')}`,
    type: 'selling',
    name: `Vendre: ${item.name}`,
    description: `Vendre ${item.name} sur ${item.platform}`,
    oneTimeGain: item.estimatedPrice,
    monthlyGain: 0,
    monthlySavings: 0,
    effortLevel: 'low',
    timeInvestmentHours: 0,
    startupCost: 0,
    skillsRequired: [],
    flexibility: 1,
    sustainability: 0.1, // One-time
    coBenefits: ['Desencombre'],
    source: 'money-maker',
  };
}

export function createStrategyFromOptimization(opt: {
  expense: string;
  solution: string;
  savingsPct: number;
  currentAmount: number;
}): Strategy {
  const savings = Math.round(opt.currentAmount * opt.savingsPct);
  return {
    id: `opt_${opt.solution.toLowerCase().replace(/\s/g, '_')}`,
    type: 'optimization',
    name: opt.solution,
    description: `Reduire ${opt.expense} via ${opt.solution}`,
    oneTimeGain: 0,
    monthlyGain: 0,
    monthlySavings: savings,
    effortLevel: 'low',
    timeInvestmentHours: 0,
    startupCost: 0,
    skillsRequired: [],
    flexibility: 0.7,
    sustainability: 0.9,
    coBenefits: [],
    source: 'budget-coach',
  };
}

// === Tool Definitions ===

/**
 * Compare strategies tool
 */
export const compareStrategiesTool = createTool({
  id: 'compare_strategies',
  description: 'Compare toutes les strategies (jobs vs hustles vs ventes vs optimisations)',
  inputSchema: z.object({
    strategies: z.array(
      z.object({
        id: z.string(),
        type: z.enum(['job', 'hustle', 'selling', 'optimization']),
        name: z.string(),
        description: z.string(),
        oneTimeGain: z.number(),
        monthlyGain: z.number(),
        monthlySavings: z.number(),
        effortLevel: z.enum(['low', 'medium', 'high']),
        timeInvestmentHours: z.number(),
        startupCost: z.number(),
        skillsRequired: z.array(z.string()),
        flexibility: z.number(),
        sustainability: z.number(),
        coBenefits: z.array(z.string()),
        source: z.string(),
      })
    ),
    context: z.object({
      monthlyMargin: z.number(),
      hoursAvailable: z.number(),
      skills: z.array(z.string()),
      urgency: z.enum(['low', 'medium', 'high']),
      yearsRemaining: z.number(),
      goalAmount: z.number().optional(),
    }),
  }),
  execute: async ({ context }) => {
    return compareStrategies(context.strategies, context.context);
  },
});

/**
 * Quick strategy comparison tool
 */
export const quickComparisonTool = createTool({
  id: 'quick_strategy_comparison',
  description: "Comparaison rapide: quel est le meilleur moyen d'ameliorer ma situation?",
  inputSchema: z.object({
    // Jobs available
    jobs: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          hourlyRate: z.number(),
          flexibility: z.number(),
          skills: z.array(z.string()),
          coBenefit: z.string().optional(),
        })
      )
      .optional(),
    // Items to sell
    itemsToSell: z
      .array(
        z.object({
          name: z.string(),
          estimatedPrice: z.number(),
          platform: z.string(),
        })
      )
      .optional(),
    // Optimizations
    optimizations: z
      .array(
        z.object({
          expense: z.string(),
          solution: z.string(),
          savingsPct: z.number(),
          currentAmount: z.number(),
        })
      )
      .optional(),
    // User context
    profile: z.object({
      monthlyMargin: z.number(),
      hoursAvailable: z.number(),
      skills: z.array(z.string()),
      urgency: z.enum(['low', 'medium', 'high']).default('medium'),
      yearsRemaining: z.number(),
    }),
  }),
  execute: async ({ context }) => {
    const strategies: Strategy[] = [];

    // Convert jobs to strategies
    if (context.jobs) {
      for (const job of context.jobs) {
        strategies.push(createStrategyFromJob(job, context.profile.hoursAvailable));
      }
    }

    // Convert items to sell to strategies
    if (context.itemsToSell) {
      for (const item of context.itemsToSell) {
        strategies.push(createStrategyFromSelling(item));
      }
    }

    // Convert optimizations to strategies
    if (context.optimizations) {
      for (const opt of context.optimizations) {
        strategies.push(createStrategyFromOptimization(opt));
      }
    }

    if (strategies.length === 0) {
      return {
        error: 'Aucune strategie a comparer',
        suggestion: 'Ajoute des jobs, objets a vendre, ou optimisations',
      };
    }

    return compareStrategies(strategies, {
      ...context.profile,
      urgency: context.profile.urgency || 'medium',
    });
  },
});

// Register tools
registerTool('compare_strategies', compareStrategiesTool);
registerTool('quick_strategy_comparison', quickComparisonTool);

/**
 * Create Strategy Comparator agent
 */
export async function createStrategyComparatorAgent(): Promise<Agent> {
  const config = {
    id: 'strategy-comparator',
    name: 'Strategy Comparator',
    description: 'Compare toutes les options pour ameliorer ta situation financiere',
    instructions: `Tu es un expert en comparaison de strategies financieres pour etudiants.

ROLE:
- Comparer jobs vs side hustles vs ventes vs optimisations
- Identifier la meilleure strategie selon le contexte
- Proposer des combinaisons optimales

METHODE:
1. Normaliser toutes les options en "equivalent mensuel"
2. Scorer sur: impact financier, effort, flexibilite, durabilite
3. Adapter les poids selon l'urgence
4. Generer des comparaisons tete-a-tete

CRITERES DE SCORING:
- Financial: impact sur le budget mensuel
- Effort: temps et energie requis
- Flexibility: compatibilite avec les cours
- Sustainability: peut durer combien de temps?

OUTPUT:
- Classement des strategies
- Best overall / Best quick win / Best long term
- Matrice de comparaison
- Recommandation personnalisee`,
    toolNames: ['compare_strategies', 'quick_strategy_comparison'],
  };

  return createStrideAgent(config);
}

export default {
  compareStrategiesTool,
  quickComparisonTool,
  compareStrategies,
  createStrategyFromJob,
  createStrategyFromHustle,
  createStrategyFromSelling,
  createStrategyFromOptimization,
  createStrategyComparatorAgent,
};
