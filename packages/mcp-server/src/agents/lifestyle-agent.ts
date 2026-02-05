/**
 * Lifestyle Agent
 *
 * Analyzes subscriptions and recurring expenses to suggest optimizations:
 * - Detect underused subscriptions
 * - Identify overlapping services (multiple streaming)
 * - Suggest pause strategies based on goal urgency
 * - Recommend free alternatives
 *
 * Part of Checkpoint H: Agent Orchestration for Swipe scenarios
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, createStrideAgent } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';

// ============================================================
// FREE ALTERNATIVES DATABASE
// ============================================================

/**
 * Free alternatives organized by subscription category
 * Used by the agent to suggest replacements when pausing/canceling
 */
export const FREE_ALTERNATIVES: Record<string, string[]> = {
  streaming: [
    'YouTube (free)',
    'Tubi',
    'Pluto TV',
    'Plex (free movies)',
    'Mediathèques (Arte, France TV)',
  ],
  music: ['YouTube Music (free tier)', 'Spotify (free with ads)', 'SoundCloud', 'Radio France'],
  fitness: ['YouTube workouts', 'Nike Training Club (free)', 'Running/walking', 'Campus gym'],
  food_delivery: ['Cook at home', 'Meal prep Sundays', 'Campus cafeteria', 'Batch cooking'],
  news: ['Google News', 'Library digital access', 'RSS feeds', 'Social media feeds'],
  cloud_storage: ['Google Drive 15GB', 'Clean up old photos', 'External hard drive'],
  gaming: [
    'Free-to-play games',
    'Epic Games free weekly',
    'Steam free weekends',
    'Game Pass trials',
  ],
  transport: ['Walking', 'Biking', 'Carpooling', 'Student discounts'],
  software: ['Open source alternatives', 'Student licenses', 'Web-based tools'],
  telecom: ['WiFi calling', 'Campus WiFi', 'Low-cost prepaid plans'],
};

/**
 * Category overlap mapping - services that can replace each other
 */
export const CATEGORY_OVERLAPS: Record<string, string[]> = {
  streaming: ['Netflix', 'Disney+', 'Prime Video', 'HBO Max', 'Paramount+', 'Apple TV+', 'Canal+'],
  music: ['Spotify', 'Apple Music', 'Deezer', 'YouTube Music Premium', 'Tidal'],
  cloud_storage: ['iCloud', 'Google One', 'Dropbox', 'OneDrive'],
};

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface LifestyleItem {
  id: string;
  name: string;
  category: string;
  currentCost: number;
  pausedMonths?: number;
  lastUsed?: string;
  usageFrequency?: 'daily' | 'weekly' | 'monthly' | 'rarely';
}

export interface GoalContext {
  goalAmount: number;
  currentAmount: number;
  remainingAmount: number;
  daysToGoal: number;
  monthsRemaining: number;
}

export interface PauseSuggestion {
  itemId: string;
  itemName: string;
  action: 'pause' | 'reduce' | 'cancel' | 'keep';
  recommendedMonths?: number;
  savings: number;
  goalImpact: number;
  urgency: number;
  reason: string;
  alternativeFree?: string;
}

export interface LifestyleAgentInput {
  lifestyle: LifestyleItem[];
  goalContext: GoalContext;
  energyLevel?: number;
}

export interface LifestyleAgentOutput {
  suggestions: PauseSuggestion[];
  totalPotentialSavings: number;
  priorityOrder: string[];
}

export interface SubscriptionAnalysis {
  patterns: {
    underused: LifestyleItem[];
    overlapping: Array<{ category: string; items: LifestyleItem[]; wastedAmount: number }>;
    highCost: LifestyleItem[];
  };
  categoryBreakdown: Record<string, { count: number; totalCost: number }>;
  usageScore: number; // 0-1: how well subscriptions are utilized
  wasteScore: number; // 0-1: how much is wasted on overlaps
}

// ============================================================
// ANALYSIS FUNCTIONS
// ============================================================

/**
 * Analyze subscriptions for waste patterns
 */
function analyzeSubscriptions(
  lifestyle: LifestyleItem[],
  goalContext: GoalContext
): SubscriptionAnalysis {
  const now = new Date();

  // Detect underused subscriptions (not used in 30+ days or rarely used)
  const underused = lifestyle.filter((item) => {
    if (item.usageFrequency === 'rarely') return true;
    if (item.lastUsed) {
      const lastUsedDate = new Date(item.lastUsed);
      const daysSinceUse = Math.floor(
        (now.getTime() - lastUsedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      return daysSinceUse > 30;
    }
    return false;
  });

  // Detect overlapping subscriptions in same category
  const overlapping: Array<{ category: string; items: LifestyleItem[]; wastedAmount: number }> = [];
  for (const [category, serviceNames] of Object.entries(CATEGORY_OVERLAPS)) {
    const matchingItems = lifestyle.filter((item) =>
      serviceNames.some((name) => item.name.toLowerCase().includes(name.toLowerCase()))
    );
    if (matchingItems.length > 1) {
      // Keep the most used one, mark others as wasted
      const sorted = [...matchingItems].sort((a, b) => {
        const freqOrder = { daily: 0, weekly: 1, monthly: 2, rarely: 3 };
        return (
          (freqOrder[a.usageFrequency || 'rarely'] || 3) -
          (freqOrder[b.usageFrequency || 'rarely'] || 3)
        );
      });
      const wastedItems = sorted.slice(1);
      const wastedAmount = wastedItems.reduce((sum, item) => sum + item.currentCost, 0);
      overlapping.push({ category, items: wastedItems, wastedAmount });
    }
  }

  // Detect high-cost relative to goal
  const monthlyBudget = goalContext.remainingAmount / Math.max(1, goalContext.monthsRemaining);
  const highCost = lifestyle.filter((item) => item.currentCost > monthlyBudget * 0.1); // >10% of monthly budget

  // Calculate category breakdown
  const categoryBreakdown: Record<string, { count: number; totalCost: number }> = {};
  for (const item of lifestyle) {
    if (!categoryBreakdown[item.category]) {
      categoryBreakdown[item.category] = { count: 0, totalCost: 0 };
    }
    categoryBreakdown[item.category].count++;
    categoryBreakdown[item.category].totalCost += item.currentCost;
  }

  // Calculate scores
  const totalItems = lifestyle.length;
  const usageScore = totalItems > 0 ? 1 - underused.length / totalItems : 1;
  const totalOverlapWaste = overlapping.reduce((sum, o) => sum + o.wastedAmount, 0);
  const totalCost = lifestyle.reduce((sum, item) => sum + item.currentCost, 0);
  const wasteScore = totalCost > 0 ? totalOverlapWaste / totalCost : 0;

  return {
    patterns: { underused, overlapping, highCost },
    categoryBreakdown,
    usageScore,
    wasteScore,
  };
}

/**
 * Suggest pause/cancel strategy for an item
 */
function suggestPauseStrategy(
  item: LifestyleItem,
  goalContext: GoalContext,
  energyLevel?: number,
  analysis?: SubscriptionAnalysis
): PauseSuggestion {
  const goalImpact =
    goalContext.remainingAmount > 0
      ? (item.currentCost * Math.max(1, goalContext.monthsRemaining)) / goalContext.remainingAmount
      : 0;

  let action: PauseSuggestion['action'] = 'keep';
  let recommendedMonths: number | undefined;
  let reason = '';
  let urgency = 0;

  const isUnderused =
    item.usageFrequency === 'rarely' ||
    (item.lastUsed && new Date(item.lastUsed) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const isOverlapping = analysis?.patterns.overlapping.some((o) =>
    o.items.some((i) => i.id === item.id)
  );

  // Decision logic
  if (isOverlapping) {
    action = 'cancel';
    reason = `Tu as plusieurs services ${item.category} - celui-ci fait doublon.`;
    urgency = 80;
  } else if (isUnderused) {
    if (item.currentCost > 15) {
      action = 'cancel';
      reason = `${item.name} n'est presque plus utilisé et coûte cher.`;
      urgency = 70;
    } else {
      action = 'pause';
      recommendedMonths = 3;
      reason = `${item.name} est peu utilisé. Pause de 3 mois pour tester si ça te manque.`;
      urgency = 50;
    }
  } else if (goalImpact > 0.1) {
    // High impact on goal
    if (energyLevel !== undefined && energyLevel < 40 && item.category === 'fitness') {
      action = 'pause';
      recommendedMonths = 1;
      reason = `Ton énergie est basse - pause la salle 1 mois, reprends quand tu vas mieux.`;
      urgency = 60;
    } else if (goalContext.daysToGoal < 60) {
      action = 'pause';
      recommendedMonths = Math.ceil(goalContext.monthsRemaining);
      reason = `Objectif proche ! Pause temporaire jusqu'à l'atteinte de ton goal.`;
      urgency = 85;
    } else {
      action = 'reduce';
      reason = `Cherche un plan moins cher ou partage le compte.`;
      urgency = 40;
    }
  }

  // Get free alternative
  const alternatives = FREE_ALTERNATIVES[item.category];
  const alternativeFree =
    alternatives && alternatives.length > 0
      ? alternatives[Math.floor(Math.random() * alternatives.length)]
      : undefined;

  // Calculate savings
  const monthsOfSavings =
    action === 'cancel'
      ? Math.max(1, goalContext.monthsRemaining)
      : action === 'pause' && recommendedMonths
        ? recommendedMonths
        : action === 'reduce'
          ? Math.max(1, goalContext.monthsRemaining) * 0.3 // Assume 30% reduction
          : 0;
  const savings = item.currentCost * monthsOfSavings;

  return {
    itemId: item.id,
    itemName: item.name,
    action,
    recommendedMonths,
    savings: Math.round(savings * 100) / 100,
    goalImpact: Math.round(goalImpact * 100) / 100,
    urgency,
    reason,
    alternativeFree,
  };
}

/**
 * Calculate total savings impact
 */
function calculateSavingsImpact(
  suggestions: PauseSuggestion[],
  goalContext: GoalContext
): {
  totalSavings: number;
  goalImpact: number;
  timeline: string;
  priorityOrder: string[];
} {
  const actionableSuggestions = suggestions.filter((s) => s.action !== 'keep');
  const totalSavings = actionableSuggestions.reduce((sum, s) => sum + s.savings, 0);
  const goalImpact =
    goalContext.remainingAmount > 0 ? totalSavings / goalContext.remainingAmount : 0;

  // Sort by urgency for priority
  const priorityOrder = [...actionableSuggestions]
    .sort((a, b) => b.urgency - a.urgency)
    .map((s) => s.itemId);

  // Generate timeline message
  let timeline = '';
  if (goalImpact >= 0.5) {
    timeline = `En appliquant ces changements, tu atteins 50% de ton objectif plus vite !`;
  } else if (goalImpact >= 0.2) {
    timeline = `Ces optimisations représentent ${Math.round(goalImpact * 100)}% de ton objectif.`;
  } else if (totalSavings > 0) {
    timeline = `Tu économises ${totalSavings}€ - chaque euro compte !`;
  } else {
    timeline = `Tes abonnements sont déjà bien optimisés.`;
  }

  return { totalSavings, goalImpact, timeline, priorityOrder };
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Analyze subscriptions for patterns
 */
export const analyzeSubscriptionsTool = createTool({
  id: 'analyze_subscriptions',
  description: 'Analyze subscriptions to detect underused, overlapping, and high-cost patterns',
  inputSchema: z.object({
    lifestyle: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        currentCost: z.number(),
        pausedMonths: z.number().optional(),
        lastUsed: z.string().optional(),
        usageFrequency: z.enum(['daily', 'weekly', 'monthly', 'rarely']).optional(),
      })
    ),
    goalContext: z.object({
      goalAmount: z.number(),
      currentAmount: z.number(),
      remainingAmount: z.number(),
      daysToGoal: z.number(),
      monthsRemaining: z.number(),
    }),
  }),
  execute: async (input) => {
    return trace('tool.analyze_subscriptions', async (ctx) => {
      setPromptAttributes(ctx, 'lifestyle-agent');
      ctx.setAttributes({
        'input.items_count': input.lifestyle.length,
        'input.goal_remaining': input.goalContext.remainingAmount,
        'input.months_remaining': input.goalContext.monthsRemaining,
      });

      const analysis = analyzeSubscriptions(input.lifestyle, input.goalContext);

      ctx.setAttributes({
        'output.underused_count': analysis.patterns.underused.length,
        'output.overlapping_count': analysis.patterns.overlapping.length,
        'output.high_cost_count': analysis.patterns.highCost.length,
        'output.usage_score': analysis.usageScore,
        'output.waste_score': analysis.wasteScore,
      });

      return analysis;
    });
  },
});

/**
 * Tool: Suggest pause strategy for an item
 */
export const suggestPauseStrategyTool = createTool({
  id: 'suggest_pause_strategy',
  description: 'Suggest whether to pause, reduce, cancel, or keep a subscription',
  inputSchema: z.object({
    item: z.object({
      id: z.string(),
      name: z.string(),
      category: z.string(),
      currentCost: z.number(),
      pausedMonths: z.number().optional(),
      lastUsed: z.string().optional(),
      usageFrequency: z.enum(['daily', 'weekly', 'monthly', 'rarely']).optional(),
    }),
    goalContext: z.object({
      goalAmount: z.number(),
      currentAmount: z.number(),
      remainingAmount: z.number(),
      daysToGoal: z.number(),
      monthsRemaining: z.number(),
    }),
    energyLevel: z.number().optional(),
  }),
  execute: async (input) => {
    return trace('tool.suggest_pause_strategy', async (ctx) => {
      setPromptAttributes(ctx, 'lifestyle-agent');
      ctx.setAttributes({
        'input.item_name': input.item.name,
        'input.item_cost': input.item.currentCost,
        'input.energy_level': input.energyLevel ?? 'not_provided',
      });

      const suggestion = suggestPauseStrategy(input.item, input.goalContext, input.energyLevel);

      ctx.setAttributes({
        'output.action': suggestion.action,
        'output.savings': suggestion.savings,
        'output.urgency': suggestion.urgency,
      });

      return suggestion;
    });
  },
});

/**
 * Tool: Calculate total savings impact
 */
export const calculateSavingsImpactTool = createTool({
  id: 'calculate_savings_impact',
  description: 'Calculate the total savings and goal impact from suggestions',
  inputSchema: z.object({
    suggestions: z.array(
      z.object({
        itemId: z.string(),
        itemName: z.string(),
        action: z.enum(['pause', 'reduce', 'cancel', 'keep']),
        recommendedMonths: z.number().optional(),
        savings: z.number(),
        goalImpact: z.number(),
        urgency: z.number(),
        reason: z.string(),
        alternativeFree: z.string().optional(),
      })
    ),
    goalContext: z.object({
      goalAmount: z.number(),
      currentAmount: z.number(),
      remainingAmount: z.number(),
      daysToGoal: z.number(),
      monthsRemaining: z.number(),
    }),
  }),
  execute: async (input) => {
    return trace('tool.calculate_savings_impact', async (ctx) => {
      setPromptAttributes(ctx, 'lifestyle-agent');
      ctx.setAttributes({
        'input.suggestions_count': input.suggestions.length,
        'input.actionable_count': input.suggestions.filter((s) => s.action !== 'keep').length,
      });

      const impact = calculateSavingsImpact(input.suggestions, input.goalContext);

      ctx.setAttributes({
        'output.total_savings': impact.totalSavings,
        'output.goal_impact': impact.goalImpact,
        'output.priority_count': impact.priorityOrder.length,
      });

      return impact;
    });
  },
});

/**
 * Combined analysis tool for full lifestyle optimization
 */
export const lifestyleOptimizationTool = createTool({
  id: 'lifestyle_optimization',
  description: 'Complete lifestyle analysis: detect patterns + suggest actions + calculate impact',
  inputSchema: z.object({
    lifestyle: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        category: z.string(),
        currentCost: z.number(),
        pausedMonths: z.number().optional(),
        lastUsed: z.string().optional(),
        usageFrequency: z.enum(['daily', 'weekly', 'monthly', 'rarely']).optional(),
      })
    ),
    goalContext: z.object({
      goalAmount: z.number(),
      currentAmount: z.number(),
      remainingAmount: z.number(),
      daysToGoal: z.number(),
      monthsRemaining: z.number(),
    }),
    energyLevel: z.number().optional(),
  }),
  execute: async (input): Promise<LifestyleAgentOutput> => {
    return trace('lifestyle_full_optimization', async (ctx) => {
      setPromptAttributes(ctx, 'lifestyle-agent');
      ctx.setAttributes({
        'input.items_count': input.lifestyle.length,
        'input.goal_remaining': input.goalContext.remainingAmount,
        'input.energy_level': input.energyLevel ?? 'not_provided',
      });

      // Step 1: Analyze patterns
      const analysis = analyzeSubscriptions(input.lifestyle, input.goalContext);

      // Step 2: Generate suggestions for each item
      const suggestions: PauseSuggestion[] = input.lifestyle.map((item) =>
        suggestPauseStrategy(item, input.goalContext, input.energyLevel, analysis)
      );

      // Step 3: Calculate total impact
      const impact = calculateSavingsImpact(suggestions, input.goalContext);

      ctx.setAttributes({
        'output.suggestions_count': suggestions.length,
        'output.actionable_count': suggestions.filter((s) => s.action !== 'keep').length,
        'output.total_savings': impact.totalSavings,
        'output.goal_impact': impact.goalImpact,
      });

      ctx.setOutput({
        analysis_summary: {
          underused: analysis.patterns.underused.length,
          overlapping: analysis.patterns.overlapping.length,
          high_cost: analysis.patterns.highCost.length,
        },
        total_savings: impact.totalSavings,
        goal_impact_percent: Math.round(impact.goalImpact * 100),
        timeline: impact.timeline,
      });

      return {
        suggestions,
        totalPotentialSavings: impact.totalSavings,
        priorityOrder: impact.priorityOrder,
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('analyze_subscriptions', analyzeSubscriptionsTool);
registerTool('suggest_pause_strategy', suggestPauseStrategyTool);
registerTool('calculate_savings_impact', calculateSavingsImpactTool);
registerTool('lifestyle_optimization', lifestyleOptimizationTool);

// ============================================================
// AGENT FACTORY
// ============================================================

/**
 * Create Lifestyle Agent instance
 */
export async function createLifestyleAgent(): Promise<Agent> {
  const config = {
    id: 'lifestyle-agent',
    name: 'Lifestyle Optimizer',
    description: 'Analyze and optimize subscriptions and recurring expenses',
    instructions: `Tu es un expert en optimisation des dépenses récurrentes pour étudiants.

RÔLE:
- Analyser les abonnements et dépenses mensuelles
- Détecter les gaspillages (sous-utilisation, doublons)
- Suggérer des pauses/annulations stratégiques
- Proposer des alternatives gratuites

MÉTHODE:
1. Identifier les abonnements peu utilisés
2. Détecter les chevauchements (Netflix + Disney+ = doublon)
3. Évaluer l'impact sur l'objectif d'épargne
4. Prioriser les actions par urgence

RÈGLES:
- Si énergie < 40%: suggérer pause fitness (récupération d'abord)
- Si objectif proche (<60j): priorité aux grosses économies
- Toujours proposer une alternative gratuite
- Ton bienveillant, pas culpabilisant

TON:
- Encourageant et pragmatique
- Focus sur les gains faciles
- Pas de jugement sur les choix de vie`,
    toolNames: [
      'analyze_subscriptions',
      'suggest_pause_strategy',
      'calculate_savings_impact',
      'lifestyle_optimization',
    ],
  };

  return createStrideAgent(config);
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  analyzeSubscriptionsTool,
  suggestPauseStrategyTool,
  calculateSavingsImpactTool,
  lifestyleOptimizationTool,
  createLifestyleAgent,
  FREE_ALTERNATIVES,
  CATEGORY_OVERLAPS,
};
