/**
 * Swipe Scenarios Tools
 *
 * Implements Killer Feature #3: Swipe-based preference learning
 *
 * Tools:
 * - roll_the_dice: Compile scenarios from all tabs
 * - record_swipe: Record a swipe decision and update preferences
 * - get_preferences: Get current user preferences
 * - rerank_scenarios: Rerank scenarios based on updated preferences
 */

import { trace, getCurrentTraceId } from '../services/opik.js';

// Types
export interface Scenario {
  id: string;
  title: string;
  description: string;
  category: 'freelance' | 'tutoring' | 'selling' | 'lifestyle' | 'trade';
  weeklyHours: number;
  weeklyEarnings: number;
  effortLevel: number; // 1-5
  flexibilityScore: number; // 1-5
  hourlyRate: number;
}

export interface UserPreferences {
  effortSensitivity: number; // 0-1, higher = prefer low effort
  hourlyRatePriority: number; // 0-1, higher = prefer high pay
  timeFlexibility: number; // 0-1, higher = prefer flexible hours
  incomeStability: number; // 0-1, higher = prefer stable income
}

export interface SwipeDecision {
  scenarioId: string;
  decision: 'left' | 'right';
  timeSpent: number; // ms
}

// In-memory storage (in production, this would be in DuckDB)
let userPreferences: UserPreferences = {
  effortSensitivity: 0.5,
  hourlyRatePriority: 0.5,
  timeFlexibility: 0.5,
  incomeStability: 0.5,
};

const swipeHistory: SwipeDecision[] = [];

// Tool definitions
export const SWIPE_TOOLS = {
  roll_the_dice: {
    description:
      'Compile scenarios from all tabs (skills, inventory, lifestyle, trades) and prepare for swipe session',
    inputSchema: {
      type: 'object',
      properties: {
        skills: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              hourlyRate: { type: 'number' },
              effort: { type: 'number' },
            },
          },
          description: 'User skills with rates and effort levels',
        },
        inventory: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              estimatedValue: { type: 'number' },
            },
          },
          description: 'Items to sell',
        },
        lifestyle: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              currentCost: { type: 'number' },
              optimizedCost: { type: 'number' },
            },
          },
          description: 'Lifestyle optimizations',
        },
        trades: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              value: { type: 'number' },
            },
          },
          description: 'Trade opportunities',
        },
      },
    },
  },

  record_swipe: {
    description:
      'Record a swipe decision and update user preferences using preference learning algorithm',
    inputSchema: {
      type: 'object',
      properties: {
        scenario_id: { type: 'string', description: 'ID of the scenario' },
        decision: {
          type: 'string',
          enum: ['left', 'right'],
          description: 'Swipe direction (left=reject, right=accept)',
        },
        time_spent: { type: 'number', description: 'Time spent on decision in ms' },
        scenario: {
          type: 'object',
          description: 'Full scenario object for preference learning',
          properties: {
            effortLevel: { type: 'number' },
            hourlyRate: { type: 'number' },
            flexibilityScore: { type: 'number' },
            category: { type: 'string' },
          },
        },
      },
      required: ['scenario_id', 'decision', 'scenario'],
    },
  },

  get_preferences: {
    description: 'Get current user preferences learned from swipe history',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  rerank_scenarios: {
    description: 'Rerank scenarios based on current user preferences',
    inputSchema: {
      type: 'object',
      properties: {
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              effortLevel: { type: 'number' },
              hourlyRate: { type: 'number' },
              flexibilityScore: { type: 'number' },
              weeklyEarnings: { type: 'number' },
            },
          },
          description: 'Scenarios to rerank',
        },
      },
      required: ['scenarios'],
    },
  },
};

// Preference learning algorithm
function updatePreferences(
  currentPrefs: UserPreferences,
  scenario: Partial<Scenario>,
  decision: SwipeDecision
): UserPreferences {
  const learningRate = 0.15;
  const multiplier = decision.decision === 'right' ? 1 : -1;

  // Normalize scenario attributes to 0-1
  const normalizedEffort = (scenario.effortLevel || 3) / 5;
  const normalizedRate = (scenario.hourlyRate || 15) > 20 ? 1 : (scenario.hourlyRate || 15) / 20;
  const normalizedFlexibility = (scenario.flexibilityScore || 3) / 5;
  const stabilitySignal = scenario.category === 'freelance' ? 0.3 : 0.7;

  // Update preferences with bounded values
  const clamp = (value: number) => Math.max(0, Math.min(1, value));

  return {
    effortSensitivity: clamp(
      currentPrefs.effortSensitivity + learningRate * multiplier * (1 - normalizedEffort)
    ),
    hourlyRatePriority: clamp(
      currentPrefs.hourlyRatePriority + learningRate * multiplier * normalizedRate
    ),
    timeFlexibility: clamp(
      currentPrefs.timeFlexibility + learningRate * multiplier * normalizedFlexibility
    ),
    incomeStability: clamp(
      currentPrefs.incomeStability + learningRate * multiplier * stabilitySignal
    ),
  };
}

// Calculate scenario score based on preferences
function scoreScenario(scenario: Partial<Scenario>, prefs: UserPreferences): number {
  const effortScore = (1 - (scenario.effortLevel || 3) / 5) * prefs.effortSensitivity;
  const rateScore = Math.min(1, (scenario.hourlyRate || 0) / 25) * prefs.hourlyRatePriority;
  const flexScore = ((scenario.flexibilityScore || 3) / 5) * prefs.timeFlexibility;
  const stabilityScore = (scenario.category === 'freelance' ? 0.3 : 0.8) * prefs.incomeStability;

  return (effortScore + rateScore + flexScore + stabilityScore) / 4;
}

// Tool handlers
export async function handleSwipeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'roll_the_dice':
      return handleRollTheDice(args);
    case 'record_swipe':
      return handleRecordSwipe(args);
    case 'get_preferences':
      return handleGetPreferences();
    case 'rerank_scenarios':
      return handleRerankScenarios(args);
    default:
      throw new Error(`Unknown swipe tool: ${name}`);
  }
}

async function handleRollTheDice(args: Record<string, unknown>) {
  return trace('swipe_roll_dice', async (span) => {
    const skills =
      (args.skills as Array<{ name: string; hourlyRate: number; effort?: number }>) || [];
    const inventory = (args.inventory as Array<{ name: string; estimatedValue: number }>) || [];
    const lifestyle =
      (args.lifestyle as Array<{ name: string; currentCost: number; optimizedCost?: number }>) ||
      [];
    const trades = (args.trades as Array<{ name: string; value: number }>) || [];

    span.setAttributes({
      skills_count: skills.length,
      inventory_count: inventory.length,
      lifestyle_count: lifestyle.length,
      trades_count: trades.length,
    });

    const scenarios: Scenario[] = [];

    // Generate skill-based scenarios
    skills.forEach((skill, idx) => {
      scenarios.push({
        id: `skill_freelance_${idx}`,
        title: `Freelance ${skill.name}`,
        description: `Proposer des services en ${skill.name} sur des plateformes freelance`,
        category: 'freelance',
        weeklyHours: 5,
        weeklyEarnings: skill.hourlyRate * 5,
        effortLevel: skill.effort || 4,
        flexibilityScore: 5,
        hourlyRate: skill.hourlyRate,
      });

      scenarios.push({
        id: `skill_tutoring_${idx}`,
        title: `Cours particuliers ${skill.name}`,
        description: `Donner des cours particuliers en ${skill.name}`,
        category: 'tutoring',
        weeklyHours: 3,
        weeklyEarnings: (skill.hourlyRate - 3) * 3,
        effortLevel: (skill.effort || 4) - 1,
        flexibilityScore: 4,
        hourlyRate: skill.hourlyRate - 3,
      });
    });

    // Generate inventory-based scenarios
    inventory.forEach((item, idx) => {
      scenarios.push({
        id: `sell_${idx}`,
        title: `Vendre ${item.name}`,
        description: `Mettre en vente ${item.name} sur Leboncoin ou Vinted`,
        category: 'selling',
        weeklyHours: 1,
        weeklyEarnings: Math.round(item.estimatedValue / 2),
        effortLevel: 1,
        flexibilityScore: 5,
        hourlyRate: Math.round(item.estimatedValue / 2),
      });
    });

    // Generate lifestyle optimization scenarios
    const totalSavings = lifestyle.reduce((sum, item) => {
      if (item.optimizedCost !== undefined) {
        return sum + (item.currentCost - item.optimizedCost);
      }
      return sum;
    }, 0);

    if (totalSavings > 0) {
      scenarios.push({
        id: 'lifestyle_opt',
        title: 'Optimiser mes depenses',
        description: `Appliquer les optimisations lifestyle pour economiser ${totalSavings} euros/mois`,
        category: 'lifestyle',
        weeklyHours: 0,
        weeklyEarnings: Math.round(totalSavings / 4),
        effortLevel: 1,
        flexibilityScore: 5,
        hourlyRate: 0,
      });
    }

    // Add default scenarios if not enough
    if (scenarios.length < 4) {
      const defaults: Scenario[] = [
        {
          id: 'default_babysitting',
          title: 'Baby-sitting',
          description: 'Garder des enfants le soir ou le week-end',
          category: 'freelance',
          weeklyHours: 4,
          weeklyEarnings: 48,
          effortLevel: 2,
          flexibilityScore: 3,
          hourlyRate: 12,
        },
        {
          id: 'default_delivery',
          title: 'Livraison Uber Eats',
          description: 'Livrer des repas en velo ou scooter',
          category: 'freelance',
          weeklyHours: 6,
          weeklyEarnings: 60,
          effortLevel: 3,
          flexibilityScore: 5,
          hourlyRate: 10,
        },
      ];

      defaults.forEach((d) => {
        if (scenarios.length < 8) {
          scenarios.push(d);
        }
      });
    }

    // Score and sort by current preferences
    const scoredScenarios = scenarios.map((s) => ({
      ...s,
      score: scoreScenario(s, userPreferences),
    }));

    scoredScenarios.sort((a, b) => b.score - a.score);

    span.setAttributes({
      scenarios_generated: scoredScenarios.length,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'scenarios',
          type: 'data',
          params: {
            scenarios: scoredScenarios.slice(0, 8),
            totalCount: scoredScenarios.length,
          },
        },
        {
          id: 'message',
          type: 'text',
          params: {
            content: `J'ai compile ${scoredScenarios.length} scenarios pour toi. Swipe a droite pour accepter, a gauche pour refuser !`,
            markdown: false,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        phase: 'roll_dice',
      },
    };
  });
}

async function handleRecordSwipe(args: Record<string, unknown>) {
  return trace('swipe_record_decision', async (span) => {
    const scenarioId = args.scenario_id as string;
    const decision = args.decision as 'left' | 'right';
    const timeSpent = (args.time_spent as number) || 500;
    const scenario = args.scenario as Partial<Scenario>;

    const swipeDecision: SwipeDecision = {
      scenarioId,
      decision,
      timeSpent,
    };

    // Record in history
    swipeHistory.push(swipeDecision);

    // Update preferences
    const oldPrefs = { ...userPreferences };
    userPreferences = updatePreferences(userPreferences, scenario, swipeDecision);

    span.setAttributes({
      scenario_id: scenarioId,
      decision,
      time_spent: timeSpent,
      old_effort_sensitivity: oldPrefs.effortSensitivity,
      new_effort_sensitivity: userPreferences.effortSensitivity,
      old_rate_priority: oldPrefs.hourlyRatePriority,
      new_rate_priority: userPreferences.hourlyRatePriority,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'updated_preferences',
          type: 'data',
          params: {
            preferences: userPreferences,
            swipeCount: swipeHistory.length,
          },
        },
        {
          id: 'learning_message',
          type: 'text',
          params: {
            content: `Preference updated! ${decision === 'right' ? 'Tu aimes' : 'Tu preferes eviter'} ce type de scenario.`,
            markdown: false,
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
        phase: 'preference_learning',
      },
    };
  });
}

async function handleGetPreferences() {
  return trace('swipe_get_preferences', async (span) => {
    span.setAttributes({
      swipe_count: swipeHistory.length,
      ...userPreferences,
    });

    return {
      type: 'composite',
      components: [
        {
          id: 'preferences',
          type: 'data',
          params: {
            preferences: userPreferences,
            swipeCount: swipeHistory.length,
            interpretation: {
              effort:
                userPreferences.effortSensitivity > 0.6
                  ? 'Prefere les jobs faciles'
                  : 'OK avec les jobs difficiles',
              money:
                userPreferences.hourlyRatePriority > 0.6
                  ? 'Priorite au salaire'
                  : 'Flexible sur le salaire',
              time:
                userPreferences.timeFlexibility > 0.6
                  ? 'Besoin de flexibilite'
                  : 'Horaires fixes OK',
              stability:
                userPreferences.incomeStability > 0.6
                  ? 'Prefere les revenus stables'
                  : 'OK avec le freelance',
            },
          },
        },
      ],
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}

async function handleRerankScenarios(args: Record<string, unknown>) {
  return trace('swipe_rerank_scenarios', async (span) => {
    const scenarios = args.scenarios as Array<Partial<Scenario> & { id: string }>;

    const reranked = scenarios
      .map((s) => ({
        ...s,
        score: scoreScenario(s, userPreferences),
      }))
      .sort((a, b) => b.score - a.score);

    span.setAttributes({
      scenarios_count: scenarios.length,
      top_score: reranked[0]?.score || 0,
    });

    return {
      type: 'data',
      params: {
        rerankedScenarios: reranked,
        preferences: userPreferences,
      },
      metadata: {
        traceId: getCurrentTraceId(),
      },
    };
  });
}
