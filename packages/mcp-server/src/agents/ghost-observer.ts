/**
 * Ghost Observer Agent
 *
 * Behavioral analysis agent that learns from swipe actions:
 * - Detects rejection patterns (5+ rejects on same criteria)
 * - Filters out scenarios user consistently rejects
 * - Generates behavior insights for personalization
 *
 * Mantra: "Listen to what users DO, not what they SAY."
 *
 * Part of Checkpoint H.5: Guardrail Agents
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';
import type { SwipeScenario, ScenarioCategory } from './swipe-orchestrator.js';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface SwipeHistory {
  scenarioId: string;
  category: ScenarioCategory;
  sourceId: string;
  decision: 'left' | 'right';
  timestamp: string;
  metadata: {
    effort: number;
    amount: number;
    tags: string[];
  };
}

export type PatternType = 'category' | 'effort_level' | 'amount_range' | 'tag';

export interface RejectionPattern {
  type: PatternType;
  value: string;
  rejectionCount: number;
  acceptanceCount: number;
  lastRejected: string;
  confidence: number;
  isBlocking: boolean;
}

export interface GhostObserverOutput {
  filteredScenarios: SwipeScenario[];
  blockedScenarios: SwipeScenario[];
  patterns: RejectionPattern[];
  insights: string[];
}

// ============================================================
// CONFIGURATION
// ============================================================

export const GHOST_CONFIG = {
  // Detection thresholds
  MIN_REJECTIONS_FOR_PATTERN: 3,
  HIGH_CONFIDENCE_THRESHOLD: 5,
  PATTERN_DECAY_DAYS: 14,

  // Actions
  BLOCK_CONFIDENCE: 0.7,
  PENALIZE_CONFIDENCE: 0.5,
  SCORE_PENALTY: 0.3,

  // Amount ranges
  AMOUNT_RANGES: [
    { label: 'low', min: 0, max: 30 },
    { label: 'medium', min: 30, max: 100 },
    { label: 'high', min: 100, max: Infinity },
  ],

  // Effort levels
  EFFORT_LEVELS: [
    { label: 'easy', min: 1, max: 2 },
    { label: 'medium', min: 3, max: 3 },
    { label: 'hard', min: 4, max: 5 },
  ],
};

// ============================================================
// ANALYSIS FUNCTIONS
// ============================================================

/**
 * Get amount range label
 */
function getAmountRange(amount: number): string {
  for (const range of GHOST_CONFIG.AMOUNT_RANGES) {
    if (amount >= range.min && amount < range.max) {
      return range.label;
    }
  }
  return 'high';
}

/**
 * Get effort level label
 */
function getEffortLevel(effort: number): string {
  for (const level of GHOST_CONFIG.EFFORT_LEVELS) {
    if (effort >= level.min && effort <= level.max) {
      return level.label;
    }
  }
  return 'hard';
}

/**
 * Detect rejection patterns from swipe history
 */
function detectPatterns(swipes: SwipeHistory[]): RejectionPattern[] {
  const patterns: Map<string, { rejections: number; acceptances: number; lastDate: string }> =
    new Map();

  // Count by dimension
  for (const swipe of swipes) {
    const dimensions: Array<{ type: PatternType; value: string }> = [
      { type: 'category', value: swipe.category },
      { type: 'effort_level', value: getEffortLevel(swipe.metadata.effort) },
      { type: 'amount_range', value: getAmountRange(swipe.metadata.amount) },
      ...swipe.metadata.tags.map((tag) => ({ type: 'tag' as PatternType, value: tag })),
    ];

    for (const dim of dimensions) {
      const key = `${dim.type}:${dim.value}`;
      const current = patterns.get(key) || { rejections: 0, acceptances: 0, lastDate: '' };

      if (swipe.decision === 'left') {
        current.rejections++;
        current.lastDate = swipe.timestamp;
      } else {
        current.acceptances++;
      }

      patterns.set(key, current);
    }
  }

  // Convert to RejectionPattern array
  const result: RejectionPattern[] = [];

  for (const [key, data] of patterns.entries()) {
    const [type, value] = key.split(':') as [PatternType, string];
    const total = data.rejections + data.acceptances;

    if (data.rejections >= GHOST_CONFIG.MIN_REJECTIONS_FOR_PATTERN) {
      const confidence = data.rejections / total;
      result.push({
        type,
        value,
        rejectionCount: data.rejections,
        acceptanceCount: data.acceptances,
        lastRejected: data.lastDate,
        confidence,
        isBlocking: confidence >= GHOST_CONFIG.BLOCK_CONFIDENCE,
      });
    }
  }

  // Sort by confidence
  result.sort((a, b) => b.confidence - a.confidence);

  return result;
}

/**
 * Check if scenario matches a blocking pattern
 */
function matchesPattern(scenario: SwipeScenario, pattern: RejectionPattern): boolean {
  switch (pattern.type) {
    case 'category':
      return scenario.category === pattern.value;
    case 'effort_level':
      return getEffortLevel(scenario.effort) === pattern.value;
    case 'amount_range':
      return getAmountRange(scenario.amount) === pattern.value;
    case 'tag':
      return scenario.tags.includes(pattern.value);
    default:
      return false;
  }
}

/**
 * Filter scenarios based on rejection patterns
 */
function filterByPatterns(
  scenarios: SwipeScenario[],
  patterns: RejectionPattern[]
): { passed: SwipeScenario[]; blocked: SwipeScenario[] } {
  const blockingPatterns = patterns.filter((p) => p.isBlocking);
  const passed: SwipeScenario[] = [];
  const blocked: SwipeScenario[] = [];

  for (const scenario of scenarios) {
    const matchedBlocking = blockingPatterns.find((p) => matchesPattern(scenario, p));

    if (matchedBlocking) {
      blocked.push(scenario);
    } else {
      passed.push(scenario);
    }
  }

  return { passed, blocked };
}

/**
 * Generate human-readable behavior insights
 */
function generateInsights(patterns: RejectionPattern[]): string[] {
  const insights: string[] = [];

  // Category insights
  const categoryPatterns = patterns.filter((p) => p.type === 'category' && p.isBlocking);
  for (const p of categoryPatterns) {
    if (p.value === 'job_lead') {
      insights.push(`Tu rejettes systématiquement les offres d'emploi (${p.rejectionCount}x)`);
    } else if (p.value === 'lifestyle_pause') {
      insights.push(`Tu préfères garder tes abonnements plutôt que les couper`);
    } else if (p.value === 'sell_item') {
      insights.push(`Tu hésites à vendre tes affaires - c'est normal, on s'attache !`);
    }
  }

  // Effort insights
  const effortPatterns = patterns.filter((p) => p.type === 'effort_level' && p.isBlocking);
  for (const p of effortPatterns) {
    if (p.value === 'hard') {
      insights.push(`Tu évites les options demandant beaucoup d'effort - on adapte !`);
    } else if (p.value === 'easy') {
      insights.push(`Tu cherches des défis - les options faciles ne t'intéressent pas`);
    }
  }

  // Amount insights
  const amountPatterns = patterns.filter((p) => p.type === 'amount_range');
  const highAccepted = amountPatterns.find(
    (p) => p.value === 'high' && p.acceptanceCount > p.rejectionCount
  );
  const lowRejected = amountPatterns.find((p) => p.value === 'low' && p.isBlocking);

  if (highAccepted) {
    insights.push(`Tu priorises les gros gains - les petites sommes te motivent moins`);
  }
  if (lowRejected) {
    insights.push(`Les petits montants ne valent pas ton temps - on se concentre sur le gros`);
  }

  // Preference summary
  const totalAccepted = patterns.reduce((sum, p) => sum + p.acceptanceCount, 0);
  const totalRejected = patterns.reduce((sum, p) => sum + p.rejectionCount, 0);

  if (totalAccepted > totalRejected * 2) {
    insights.push(`Tu es plutôt ouvert aux suggestions - bravo ! 🎯`);
  } else if (totalRejected > totalAccepted * 2) {
    insights.push(`Tu es sélectif - on affine les propositions pour toi`);
  }

  return insights;
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Detect rejection patterns from swipe history
 */
export const detectRejectionPatternsTool = createTool({
  id: 'detect_rejection_patterns',
  description: 'Analyze swipe history to detect what user consistently rejects',
  inputSchema: z.object({
    recentSwipes: z.array(
      z.object({
        scenarioId: z.string(),
        category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
        sourceId: z.string(),
        decision: z.enum(['left', 'right']),
        timestamp: z.string(),
        metadata: z.object({
          effort: z.number(),
          amount: z.number(),
          tags: z.array(z.string()),
        }),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.detect_rejection_patterns', async (ctx) => {
      setPromptAttributes(ctx, 'ghost-observer');

      const patterns = detectPatterns(input.recentSwipes);
      const blockingPatterns = patterns.filter((p) => p.isBlocking);
      const insights = generateInsights(patterns);

      ctx.setAttributes({
        'input.swipes_count': input.recentSwipes.length,
        'output.patterns_count': patterns.length,
        'output.blocking_patterns': blockingPatterns.length,
        'output.insights_count': insights.length,
      });

      return {
        patterns,
        blockingPatterns,
        insights,
        summary: {
          totalSwipes: input.recentSwipes.length,
          acceptRate:
            input.recentSwipes.filter((s) => s.decision === 'right').length /
            input.recentSwipes.length,
        },
      };
    });
  },
});

/**
 * Tool: Filter scenarios based on detected patterns
 */
export const filterByPatternsTool = createTool({
  id: 'filter_by_patterns',
  description: 'Remove scenarios that match blocking rejection patterns',
  inputSchema: z.object({
    candidateScenarios: z.array(
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
    patterns: z.array(
      z.object({
        type: z.enum(['category', 'effort_level', 'amount_range', 'tag']),
        value: z.string(),
        rejectionCount: z.number(),
        acceptanceCount: z.number(),
        lastRejected: z.string(),
        confidence: z.number(),
        isBlocking: z.boolean(),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.filter_by_patterns', async (ctx) => {
      setPromptAttributes(ctx, 'ghost-observer');

      const { passed, blocked } = filterByPatterns(input.candidateScenarios, input.patterns);

      ctx.setAttributes({
        'input.scenarios_count': input.candidateScenarios.length,
        'input.patterns_count': input.patterns.length,
        'output.passed_count': passed.length,
        'output.blocked_count': blocked.length,
      });

      return {
        passed,
        blocked,
        filterRate:
          input.candidateScenarios.length > 0
            ? blocked.length / input.candidateScenarios.length
            : 0,
      };
    });
  },
});

/**
 * Tool: Generate behavior insights
 */
export const generateBehaviorInsightsTool = createTool({
  id: 'generate_behavior_insights',
  description: 'Generate human-readable insights about user behavior',
  inputSchema: z.object({
    patterns: z.array(
      z.object({
        type: z.enum(['category', 'effort_level', 'amount_range', 'tag']),
        value: z.string(),
        rejectionCount: z.number(),
        acceptanceCount: z.number(),
        lastRejected: z.string(),
        confidence: z.number(),
        isBlocking: z.boolean(),
      })
    ),
    profileId: z.string(),
  }),
  execute: async (input) => {
    return trace('tool.generate_behavior_insights', async (ctx) => {
      setPromptAttributes(ctx, 'ghost-observer');

      const insights = generateInsights(input.patterns);

      ctx.setAttributes({
        'input.patterns_count': input.patterns.length,
        'input.profile_id': input.profileId,
        'output.insights_count': insights.length,
      });

      return {
        insights,
        profileId: input.profileId,
        generatedAt: new Date().toISOString(),
      };
    });
  },
});

/**
 * Combined ghost observer tool
 */
export const ghostObserverTool = createTool({
  id: 'ghost_observer',
  description: 'Full behavioral analysis: detect patterns + filter scenarios + generate insights',
  inputSchema: z.object({
    recentSwipes: z.array(
      z.object({
        scenarioId: z.string(),
        category: z.enum(['sell_item', 'lifestyle_pause', 'job_lead', 'side_hustle']),
        sourceId: z.string(),
        decision: z.enum(['left', 'right']),
        timestamp: z.string(),
        metadata: z.object({
          effort: z.number(),
          amount: z.number(),
          tags: z.array(z.string()),
        }),
      })
    ),
    candidateScenarios: z.array(
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
    profileId: z.string(),
  }),
  execute: async (input): Promise<GhostObserverOutput> => {
    return trace('ghost_observer.full_analysis', async (ctx) => {
      setPromptAttributes(ctx, 'ghost-observer');

      // Step 1: Detect patterns
      const patterns = detectPatterns(input.recentSwipes);

      // Step 2: Filter scenarios
      const { passed, blocked } = filterByPatterns(input.candidateScenarios, patterns);

      // Step 3: Generate insights
      const insights = generateInsights(patterns);

      ctx.setAttributes({
        'input.swipes_count': input.recentSwipes.length,
        'input.scenarios_count': input.candidateScenarios.length,
        'output.patterns_count': patterns.length,
        'output.filtered_count': passed.length,
        'output.blocked_count': blocked.length,
        'output.insights_count': insights.length,
      });

      ctx.setOutput({
        patterns_detected: patterns.length,
        scenarios_blocked: blocked.length,
        scenarios_passed: passed.length,
        top_insights: insights.slice(0, 3),
      });

      return {
        filteredScenarios: passed,
        blockedScenarios: blocked,
        patterns,
        insights,
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('detect_rejection_patterns', detectRejectionPatternsTool);
registerTool('filter_by_patterns', filterByPatternsTool);
registerTool('generate_behavior_insights', generateBehaviorInsightsTool);
registerTool('ghost_observer', ghostObserverTool);

// ============================================================
// EXPORTS
// ============================================================

export default {
  detectRejectionPatternsTool,
  filterByPatternsTool,
  generateBehaviorInsightsTool,
  ghostObserverTool,
  GHOST_CONFIG,
};
