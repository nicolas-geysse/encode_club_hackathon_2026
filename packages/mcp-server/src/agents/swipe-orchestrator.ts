/**
 * Swipe Orchestrator Agent
 *
 * Orchestrates multiple data sources to generate personalized swipe scenarios:
 * - Trade items (sell/buy decisions)
 * - Lifestyle subscriptions (pause/cancel decisions)
 * - Job leads (apply/skip decisions)
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    SWIPE ORCHESTRATOR                          │
 * │                                                                 │
 * │  ┌───────────┐   ┌───────────┐   ┌───────────┐                │
 * │  │   Trade   │   │ Lifestyle │   │   Jobs    │                │
 * │  │   Agent   │   │   Agent   │   │   Agent   │                │
 * │  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘                │
 * │        │               │               │                       │
 * │        v               v               v                       │
 * │  ┌─────────────────────────────────────────────────────────┐  │
 * │  │              SCENARIO AGGREGATOR                         │  │
 * │  │  - Normalize scores across sources                       │  │
 * │  │  - Apply user swipe preferences                          │  │
 * │  │  - Deduplicate similar scenarios                         │  │
 * │  └─────────────────────────────────────────────────────────┘  │
 * │                          │                                     │
 * │                          v                                     │
 * │  ┌─────────────────────────────────────────────────────────┐  │
 * │  │              RANKING & SELECTION                         │  │
 * │  │  - Daily limit (5-10 scenarios)                          │  │
 * │  │  - Balance across categories                             │  │
 * │  │  - Prioritize by goal impact                             │  │
 * │  └─────────────────────────────────────────────────────────┘  │
 * │                          │                                     │
 * │                          v                                     │
 * │                   SwipeScenario[]                              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Part of Checkpoint H: Agent Orchestration for Swipe scenarios
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, createStrideAgent } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface SwipePreferences {
  effortSensitivity: number; // 0-1, higher = avoid hard work
  hourlyRatePriority: number; // 0-1, higher = prioritize pay
  timeFlexibility: number; // 0-1, higher = need flexibility
  incomeStability: number; // 0-1, higher = prefer stable income
}

export interface UserContext {
  profileId: string;
  energyLevel: number; // 0-100
  goalRemaining: number;
  daysToGoal: number;
  weeklyBudget: number;
  skills: string[];
  swipePreferences?: SwipePreferences;
  recentSwipes?: Array<{ scenarioId: string; decision: 'left' | 'right'; timestamp: string }>;
}

export type ScenarioCategory = 'sell_item' | 'lifestyle_pause' | 'job_lead' | 'side_hustle';

export interface SwipeScenario {
  id: string;
  category: ScenarioCategory;
  sourceId: string; // Original item/job ID
  title: string;
  subtitle: string;
  description: string;
  amount: number; // Money impact (positive = earn/save, negative = cost)
  goalImpact: number; // 0-1, how much this helps the goal
  effort: number; // 1-5, effort level
  urgency: number; // 0-100, time sensitivity
  confidence: number; // 0-1, how confident we are in the recommendation
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface RankedScenario extends SwipeScenario {
  finalScore: number; // Combined score after preferences
  scoreBreakdown: {
    baseScore: number;
    preferenceAdjustment: number;
    urgencyBonus: number;
    diversityPenalty: number;
  };
}

export interface SwipeSource {
  type: 'trade' | 'lifestyle' | 'jobs';
  scenarios: SwipeScenario[];
  generatedAt: string;
}

export interface DailySwipeConfig {
  maxScenarios: number; // Default 8
  minPerCategory: number; // Default 1
  maxPerCategory: number; // Default 4
  prioritizeUrgent: boolean;
  balanceCategories: boolean;
}

// ============================================================
// SCORING FUNCTIONS
// ============================================================

/**
 * Default weights for scenario scoring
 */
const DEFAULT_WEIGHTS = {
  goalImpact: 0.35,
  amount: 0.25,
  effort: 0.2,
  urgency: 0.1,
  confidence: 0.1,
};

/**
 * Adjust weights based on user preferences
 */
function adjustWeights(prefs?: SwipePreferences) {
  if (!prefs) return DEFAULT_WEIGHTS;

  const weights = { ...DEFAULT_WEIGHTS };

  // If user avoids effort, reduce effort penalty weight
  const effortInfluence = (prefs.effortSensitivity - 0.5) * 0.1;
  weights.effort = Math.max(0.1, weights.effort + effortInfluence);

  // If user prioritizes money, increase amount weight
  const moneyInfluence = (prefs.hourlyRatePriority - 0.5) * 0.1;
  weights.amount = Math.max(0.1, weights.amount + moneyInfluence);

  // Normalize to sum to 1
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(weights) as Array<keyof typeof weights>) {
    weights[key] /= sum;
  }

  return weights;
}

/**
 * Calculate base score for a scenario
 */
function calculateBaseScore(scenario: SwipeScenario, weights: typeof DEFAULT_WEIGHTS): number {
  // Normalize components to 0-1 scale
  const goalImpactNorm = Math.min(1, scenario.goalImpact);
  const amountNorm = Math.min(1, Math.abs(scenario.amount) / 500); // Cap at 500€
  const effortNorm = 1 - (scenario.effort - 1) / 4; // Invert: low effort = high score
  const urgencyNorm = scenario.urgency / 100;
  const confidenceNorm = scenario.confidence;

  return (
    weights.goalImpact * goalImpactNorm +
    weights.amount * amountNorm +
    weights.effort * effortNorm +
    weights.urgency * urgencyNorm +
    weights.confidence * confidenceNorm
  );
}

/**
 * Score and rank scenarios
 */
function rankScenarios(
  scenarios: SwipeScenario[],
  context: UserContext,
  config: DailySwipeConfig
): RankedScenario[] {
  const weights = adjustWeights(context.swipePreferences);

  // Track category counts for diversity
  const categoryCounts: Record<ScenarioCategory, number> = {
    sell_item: 0,
    lifestyle_pause: 0,
    job_lead: 0,
    side_hustle: 0,
  };

  const ranked: RankedScenario[] = scenarios.map((scenario) => {
    const baseScore = calculateBaseScore(scenario, weights);

    // Preference adjustment based on energy
    let preferenceAdjustment = 0;
    if (context.energyLevel < 40 && scenario.effort > 3) {
      preferenceAdjustment = -0.2; // Penalize high-effort when tired
    } else if (context.energyLevel > 70 && scenario.effort > 3) {
      preferenceAdjustment = 0.05; // Slight bonus for hard work when energized
    }

    // Urgency bonus for time-sensitive items
    let urgencyBonus = 0;
    if (config.prioritizeUrgent && scenario.urgency > 80) {
      urgencyBonus = 0.15;
    }

    // Diversity penalty (applied later after sorting)
    const diversityPenalty = 0;

    const finalScore = Math.min(1, Math.max(0, baseScore + preferenceAdjustment + urgencyBonus));

    return {
      ...scenario,
      finalScore,
      scoreBreakdown: {
        baseScore,
        preferenceAdjustment,
        urgencyBonus,
        diversityPenalty,
      },
    };
  });

  // Sort by final score
  ranked.sort((a, b) => b.finalScore - a.finalScore);

  // Apply diversity and limits
  const selected: RankedScenario[] = [];
  for (const scenario of ranked) {
    if (selected.length >= config.maxScenarios) break;

    const catCount = categoryCounts[scenario.category];
    if (catCount >= config.maxPerCategory) continue;

    // Apply diversity penalty if category is over-represented
    if (config.balanceCategories && catCount >= 2) {
      scenario.scoreBreakdown.diversityPenalty = -0.1;
      scenario.finalScore -= 0.1;
    }

    selected.push(scenario);
    categoryCounts[scenario.category]++;
  }

  return selected;
}

/**
 * Deduplicate similar scenarios (same item, different actions)
 */
function deduplicateScenarios(scenarios: SwipeScenario[]): SwipeScenario[] {
  const seen = new Map<string, SwipeScenario>();

  for (const scenario of scenarios) {
    const key = `${scenario.category}:${scenario.sourceId}`;
    const existing = seen.get(key);

    if (!existing || scenario.goalImpact > existing.goalImpact) {
      seen.set(key, scenario);
    }
  }

  return Array.from(seen.values());
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Gather scenarios from all sources
 */
export const gatherSourcesTool = createTool({
  id: 'gather_swipe_sources',
  description: 'Aggregate swipe scenarios from trade, lifestyle, and jobs sources',
  inputSchema: z.object({
    sources: z.array(
      z.object({
        type: z.enum(['trade', 'lifestyle', 'jobs']),
        scenarios: z.array(
          z.object({
            id: z.string(),
            category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
            sourceId: z.string(),
            title: z.string(),
            subtitle: z.string(),
            description: z.string(),
            amount: z.number(),
            goalImpact: z.number(),
            effort: z.number(),
            urgency: z.number(),
            confidence: z.number(),
            tags: z.array(z.string()),
            metadata: z.record(z.string(), z.unknown()),
          })
        ),
        generatedAt: z.string(),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.gather_swipe_sources', async (ctx) => {
      setPromptAttributes(ctx, 'swipe-orchestrator');

      const allScenarios: SwipeScenario[] = [];
      const sourceStats: Record<string, number> = {};

      for (const source of input.sources) {
        allScenarios.push(...source.scenarios);
        sourceStats[source.type] = source.scenarios.length;
      }

      const deduplicated = deduplicateScenarios(allScenarios);

      ctx.setAttributes({
        'input.source_count': input.sources.length,
        'input.total_scenarios': allScenarios.length,
        'output.deduplicated_count': deduplicated.length,
        source_stats: JSON.stringify(sourceStats),
      });

      return {
        scenarios: deduplicated,
        sourceStats,
        totalBeforeDedup: allScenarios.length,
        totalAfterDedup: deduplicated.length,
      };
    });
  },
});

/**
 * Tool: Rank scenarios based on user context and preferences
 */
export const rankScenariosTool = createTool({
  id: 'rank_scenarios',
  description: 'Score and rank scenarios based on user preferences and context',
  inputSchema: z.object({
    scenarios: z.array(
      z.object({
        id: z.string(),
        category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
        sourceId: z.string(),
        title: z.string(),
        subtitle: z.string(),
        description: z.string(),
        amount: z.number(),
        goalImpact: z.number(),
        effort: z.number(),
        urgency: z.number(),
        confidence: z.number(),
        tags: z.array(z.string()),
        metadata: z.record(z.string(), z.unknown()),
      })
    ),
    context: z.object({
      profileId: z.string(),
      energyLevel: z.number(),
      goalRemaining: z.number(),
      daysToGoal: z.number(),
      weeklyBudget: z.number(),
      skills: z.array(z.string()),
      swipePreferences: z
        .object({
          effortSensitivity: z.number(),
          hourlyRatePriority: z.number(),
          timeFlexibility: z.number(),
          incomeStability: z.number(),
        })
        .optional(),
    }),
    config: z
      .object({
        maxScenarios: z.number().default(8),
        minPerCategory: z.number().default(1),
        maxPerCategory: z.number().default(4),
        prioritizeUrgent: z.boolean().default(true),
        balanceCategories: z.boolean().default(true),
      })
      .optional(),
  }),
  execute: async (input) => {
    return trace('tool.rank_scenarios', async (ctx) => {
      setPromptAttributes(ctx, 'swipe-orchestrator');

      const config: DailySwipeConfig = {
        maxScenarios: input.config?.maxScenarios ?? 8,
        minPerCategory: input.config?.minPerCategory ?? 1,
        maxPerCategory: input.config?.maxPerCategory ?? 4,
        prioritizeUrgent: input.config?.prioritizeUrgent ?? true,
        balanceCategories: input.config?.balanceCategories ?? true,
      };

      const ranked = rankScenarios(input.scenarios, input.context, config);

      ctx.setAttributes({
        'input.scenarios_count': input.scenarios.length,
        'input.energy_level': input.context.energyLevel,
        'input.has_preferences': !!input.context.swipePreferences,
        'output.ranked_count': ranked.length,
        'output.top_score': ranked[0]?.finalScore ?? 0,
        'output.avg_score':
          ranked.length > 0 ? ranked.reduce((sum, s) => sum + s.finalScore, 0) / ranked.length : 0,
      });

      return {
        ranked,
        config,
        appliedWeights: adjustWeights(input.context.swipePreferences),
      };
    });
  },
});

/**
 * Tool: Generate daily swipe deck
 */
export const generateDailySwipeTool = createTool({
  id: 'generate_daily_swipe',
  description: 'Generate a balanced daily swipe deck from multiple sources',
  inputSchema: z.object({
    sources: z.array(
      z.object({
        type: z.enum(['trade', 'lifestyle', 'jobs']),
        scenarios: z.array(
          z.object({
            id: z.string(),
            category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
            sourceId: z.string(),
            title: z.string(),
            subtitle: z.string(),
            description: z.string(),
            amount: z.number(),
            goalImpact: z.number(),
            effort: z.number(),
            urgency: z.number(),
            confidence: z.number(),
            tags: z.array(z.string()),
            metadata: z.record(z.string(), z.unknown()),
          })
        ),
        generatedAt: z.string(),
      })
    ),
    context: z.object({
      profileId: z.string(),
      energyLevel: z.number(),
      goalRemaining: z.number(),
      daysToGoal: z.number(),
      weeklyBudget: z.number(),
      skills: z.array(z.string()),
      swipePreferences: z
        .object({
          effortSensitivity: z.number(),
          hourlyRatePriority: z.number(),
          timeFlexibility: z.number(),
          incomeStability: z.number(),
        })
        .optional(),
    }),
    config: z
      .object({
        maxScenarios: z.number().default(8),
        minPerCategory: z.number().default(1),
        maxPerCategory: z.number().default(4),
        prioritizeUrgent: z.boolean().default(true),
        balanceCategories: z.boolean().default(true),
      })
      .optional(),
  }),
  execute: async (input) => {
    return trace('swipe_orchestrator.generate_daily', async (ctx) => {
      setPromptAttributes(ctx, 'swipe-orchestrator');

      // Step 1: Gather and deduplicate
      const allScenarios: SwipeScenario[] = [];
      const sourceStats: Record<string, number> = {};

      for (const source of input.sources) {
        allScenarios.push(...source.scenarios);
        sourceStats[source.type] = source.scenarios.length;
      }

      const deduplicated = deduplicateScenarios(allScenarios);

      // Step 2: Rank and select
      const config: DailySwipeConfig = {
        maxScenarios: input.config?.maxScenarios ?? 8,
        minPerCategory: input.config?.minPerCategory ?? 1,
        maxPerCategory: input.config?.maxPerCategory ?? 4,
        prioritizeUrgent: input.config?.prioritizeUrgent ?? true,
        balanceCategories: input.config?.balanceCategories ?? true,
      };

      const ranked = rankScenarios(deduplicated, input.context, config);

      // Calculate summary stats
      const categoryDistribution: Record<ScenarioCategory, number> = {
        sell_item: 0,
        lifestyle_pause: 0,
        job_lead: 0,
        side_hustle: 0,
      };
      let totalAmount = 0;
      let avgGoalImpact = 0;

      for (const scenario of ranked) {
        categoryDistribution[scenario.category]++;
        totalAmount += scenario.amount;
        avgGoalImpact += scenario.goalImpact;
      }
      avgGoalImpact = ranked.length > 0 ? avgGoalImpact / ranked.length : 0;

      ctx.setAttributes({
        'input.sources_count': input.sources.length,
        'input.total_scenarios': allScenarios.length,
        'input.energy_level': input.context.energyLevel,
        'output.deck_size': ranked.length,
        'output.total_potential_amount': totalAmount,
        'output.avg_goal_impact': avgGoalImpact,
        'output.category_sell_item': categoryDistribution.sell_item,
        'output.category_lifestyle_pause': categoryDistribution.lifestyle_pause,
        'output.category_job_lead': categoryDistribution.job_lead,
      });

      ctx.setOutput({
        deck_size: ranked.length,
        total_potential_amount: Math.round(totalAmount),
        avg_goal_impact_percent: Math.round(avgGoalImpact * 100),
        category_distribution: categoryDistribution,
      });

      return {
        scenarios: ranked,
        summary: {
          deckSize: ranked.length,
          sourceStats,
          categoryDistribution,
          totalPotentialAmount: totalAmount,
          avgGoalImpact,
          generatedAt: new Date().toISOString(),
        },
      };
    });
  },
});

/**
 * Tool: Process swipe decision and update preferences
 */
export const processSwipeDecisionTool = createTool({
  id: 'process_swipe_decision',
  description: 'Process a swipe decision and calculate preference updates',
  inputSchema: z.object({
    scenarioId: z.string(),
    scenario: z.object({
      category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
      amount: z.number(),
      effort: z.number(),
      urgency: z.number(),
      tags: z.array(z.string()),
    }),
    decision: z.enum(['left', 'right']), // left = skip, right = accept
    currentPreferences: z.object({
      effortSensitivity: z.number(),
      hourlyRatePriority: z.number(),
      timeFlexibility: z.number(),
      incomeStability: z.number(),
    }),
    swipeCount: z.number(), // Total swipes so far (for learning rate)
  }),
  execute: async (input) => {
    return trace('tool.process_swipe_decision', async (ctx) => {
      setPromptAttributes(ctx, 'swipe-orchestrator');

      const { scenario, decision, currentPreferences, swipeCount } = input;

      // Learning rate decreases as we get more data
      const learningRate = Math.max(0.01, 0.1 / Math.log(swipeCount + 2));

      // Calculate preference deltas based on decision
      const newPrefs = { ...currentPreferences };

      if (decision === 'right') {
        // User accepted this scenario
        if (scenario.effort >= 4) {
          // Accepted high-effort → decrease effort sensitivity
          newPrefs.effortSensitivity = Math.max(0, newPrefs.effortSensitivity - learningRate * 0.5);
        }
        if (scenario.amount > 50) {
          // Accepted high-value → increase rate priority
          newPrefs.hourlyRatePriority = Math.min(
            1,
            newPrefs.hourlyRatePriority + learningRate * 0.3
          );
        }
        if (scenario.category === 'job_lead' && scenario.tags.includes('flexible')) {
          newPrefs.timeFlexibility = Math.min(1, newPrefs.timeFlexibility + learningRate * 0.2);
        }
      } else {
        // User rejected this scenario
        if (scenario.effort >= 4) {
          // Rejected high-effort → increase effort sensitivity
          newPrefs.effortSensitivity = Math.min(1, newPrefs.effortSensitivity + learningRate * 0.5);
        }
        if (scenario.amount > 50) {
          // Rejected high-value → might not care about money as much
          // But be careful, could just be wrong timing
          newPrefs.hourlyRatePriority = Math.max(
            0,
            newPrefs.hourlyRatePriority - learningRate * 0.1
          );
        }
      }

      ctx.setAttributes({
        'input.scenario_category': scenario.category,
        'input.scenario_effort': scenario.effort,
        'input.scenario_amount': scenario.amount,
        'input.decision': decision,
        'input.swipe_count': swipeCount,
        'output.learning_rate': learningRate,
        'output.effort_sensitivity_delta':
          newPrefs.effortSensitivity - currentPreferences.effortSensitivity,
        'output.hourly_rate_priority_delta':
          newPrefs.hourlyRatePriority - currentPreferences.hourlyRatePriority,
      });

      return {
        updatedPreferences: newPrefs,
        learningRate,
        changes: {
          effortSensitivity: newPrefs.effortSensitivity - currentPreferences.effortSensitivity,
          hourlyRatePriority: newPrefs.hourlyRatePriority - currentPreferences.hourlyRatePriority,
          timeFlexibility: newPrefs.timeFlexibility - currentPreferences.timeFlexibility,
          incomeStability: newPrefs.incomeStability - currentPreferences.incomeStability,
        },
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('gather_swipe_sources', gatherSourcesTool);
registerTool('rank_scenarios', rankScenariosTool);
registerTool('generate_daily_swipe', generateDailySwipeTool);
registerTool('process_swipe_decision', processSwipeDecisionTool);

// ============================================================
// AGENT FACTORY
// ============================================================

/**
 * Create Swipe Orchestrator Agent instance
 */
export async function createSwipeOrchestratorAgent(): Promise<Agent> {
  const config = {
    id: 'swipe-orchestrator',
    name: 'Swipe Orchestrator',
    description: 'Orchestrate swipe scenarios from multiple sources',
    instructions: `Tu es l'orchestrateur des scénarios de swipe pour aider les étudiants à prendre des décisions financières.

RÔLE:
- Agréger les scénarios depuis Trade, Lifestyle et Jobs
- Scorer et prioriser selon les préférences utilisateur
- Générer un deck quotidien équilibré
- Apprendre des décisions de swipe

RÈGLES:
1. Maximum 8 scénarios par jour (éviter la fatigue)
2. Au moins 1 scénario par catégorie disponible
3. Prioriser les urgents (vente limitée, deadline proche)
4. Adapter à l'énergie: si énergie < 40%, favoriser low-effort

SCORING:
- goalImpact (35%): contribution à l'objectif
- amount (25%): montant en jeu
- effort (20%): facilité d'exécution
- urgency (10%): temps limité
- confidence (10%): fiabilité de l'estimation

APPRENTISSAGE:
- Chaque swipe ajuste les préférences
- Swipe droite sur high-effort → diminue effort_sensitivity
- Swipe gauche sur high-pay → diminue hourly_rate_priority`,
    toolNames: [
      'gather_swipe_sources',
      'rank_scenarios',
      'generate_daily_swipe',
      'process_swipe_decision',
    ],
  };

  return createStrideAgent(config);
}

// ============================================================
// EXPORTS
// ============================================================

export default {
  gatherSourcesTool,
  rankScenariosTool,
  generateDailySwipeTool,
  processSwipeDecisionTool,
  createSwipeOrchestratorAgent,
};
