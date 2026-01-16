/**
 * Skill Arbitrage Algorithm
 *
 * Multi-criteria job scoring that balances:
 * - Rate (30%): Higher hourly rate is better
 * - Demand (25%): Higher market demand is better
 * - Effort (25%): Lower cognitive effort is better (less draining)
 * - Rest (20%): Lower rest needed is better (more sustainable)
 *
 * Core insight: The highest-paying job isn't always the best choice.
 * A sustainable job that doesn't burn you out may be better overall.
 *
 * Uses dinero.js v1 for precise money calculations (no float errors).
 */

import Dinero from 'dinero.js';
import { trace } from '../services/opik.js';

// Configure Dinero for EUR by default
Dinero.defaultCurrency = 'EUR';
Dinero.globalLocale = 'fr-FR';

// ============================================
// MONEY UTILITIES (dinero.js v1)
// ============================================
// dinero.js stores money as integer cents internally
// Example: 0.1 + 0.2 = 0.30000000000000004 (BAD with floats)
// With dinero: Dinero({ amount: 10 }).add(Dinero({ amount: 20 })) = 30 cents (GOOD)

/** Re-export Dinero type for external use */
export type Money = Dinero.Dinero;

/**
 * Create Money from cents
 * @param cents Amount in euro cents (e.g., 2250 = €22.50)
 */
export function euroCents(cents: number): Money {
  return Dinero({ amount: Math.round(cents), currency: 'EUR' });
}

/**
 * Create Money from euros
 * @param amount Amount in euros (e.g., 22.50)
 */
export function euros(amount: number): Money {
  // Convert to cents, round to avoid float issues
  return Dinero({ amount: Math.round(amount * 100), currency: 'EUR' });
}

/**
 * Format Money to display string (e.g., "22,50 €")
 */
export function formatEuro(money: Money): string {
  return money.toFormat('0,0.00 $');
}

/**
 * Get numeric value in euros for calculations
 */
export function toEuros(money: Money): number {
  return money.toUnit();
}

// ============================================
// TYPES
// ============================================

export interface Skill {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** Hourly rate in euros (e.g., 22.50). Converted to Money internally for precision. */
  hourlyRate: number;
  marketDemand: number; // 1-5
  cognitiveEffort: number; // 1-5
  restNeeded: number; // hours after work session
  score?: number;
}

/**
 * Internal representation with Money type
 * Used for precise calculations (integer cents)
 */
interface SkillInternal extends Omit<Skill, 'hourlyRate'> {
  hourlyRate: Money;
  hourlyRateEuros: number; // Keep original for display
}

export interface ArbitrageWeights {
  rate: number;
  demand: number;
  effort: number;
  rest: number;
}

export interface ArbitrageResult {
  skill: Skill;
  score: number;
  breakdown: {
    rateContribution: number;
    demandContribution: number;
    effortContribution: number;
    restContribution: number;
  };
  recommendation: string;
}

export interface SkillRanking {
  skills: ArbitrageResult[];
  topPick: ArbitrageResult | null;
  averageScore: number;
  insights: string[];
}

// ============================================
// DEFAULT WEIGHTS
// ============================================

export const DEFAULT_WEIGHTS: ArbitrageWeights = {
  rate: 0.3, // 30%
  demand: 0.25, // 25%
  effort: 0.25, // 25%
  rest: 0.2, // 20%
};

// Normalization constants
const MAX_HOURLY_RATE_EUROS = 30; // €30/h = normalized to 1.0
const MAX_DEMAND = 5;
const MAX_EFFORT = 5;
const MAX_REST_HOURS = 4;

/**
 * Convert external Skill to internal representation with Money type
 */
function toInternal(skill: Skill): SkillInternal {
  return {
    ...skill,
    hourlyRate: euros(skill.hourlyRate),
    hourlyRateEuros: skill.hourlyRate,
  };
}

// ============================================
// CORE ALGORITHM
// ============================================

/**
 * Calculate arbitrage score for a single skill
 *
 * Formula:
 *   score = (rate_weight * norm_rate +
 *            demand_weight * norm_demand +
 *            effort_weight * (1 - norm_effort) +
 *            rest_weight * (1 - norm_rest)) * 10
 *
 * Returns score between 0-10
 *
 * Uses Dinero.js internally for precise money comparisons.
 */
export function calculateArbitrageScore(
  skill: Skill,
  weights: ArbitrageWeights = DEFAULT_WEIGHTS
): ArbitrageResult {
  // Convert to internal representation with Dinero
  const internal = toInternal(skill);

  // Normalize inputs to 0-1 scale
  // For rate: use toEuros for precise conversion, cap at max
  const rateEuros = toEuros(internal.hourlyRate);
  const normalizedRate = Math.min(rateEuros / MAX_HOURLY_RATE_EUROS, 1);
  const normalizedDemand = skill.marketDemand / MAX_DEMAND;
  // Invert effort and rest (lower is better)
  const normalizedEffort = 1 - skill.cognitiveEffort / MAX_EFFORT;
  const normalizedRest = 1 - skill.restNeeded / MAX_REST_HOURS;

  // Calculate contributions
  const rateContribution = weights.rate * normalizedRate;
  const demandContribution = weights.demand * normalizedDemand;
  const effortContribution = weights.effort * normalizedEffort;
  const restContribution = weights.rest * normalizedRest;

  // Total score scaled to 0-10
  const score =
    (rateContribution + demandContribution + effortContribution + restContribution) * 10;

  // Generate recommendation
  const recommendation = generateRecommendation(skill, score);

  return {
    skill: { ...skill, score },
    score,
    breakdown: {
      rateContribution: rateContribution * 10,
      demandContribution: demandContribution * 10,
      effortContribution: effortContribution * 10,
      restContribution: restContribution * 10,
    },
    recommendation,
  };
}

/**
 * Rank multiple skills by arbitrage score
 */
export async function rankSkills(
  skills: Skill[],
  weights: ArbitrageWeights = DEFAULT_WEIGHTS
): Promise<SkillRanking> {
  return trace('skill_arbitrage_ranking', async (span) => {
    if (skills.length === 0) {
      return {
        skills: [],
        topPick: null,
        averageScore: 0,
        insights: ['Aucune compétence à évaluer'],
      };
    }

    // Calculate scores for all skills
    const results = skills
      .map((skill) => calculateArbitrageScore(skill, weights))
      .sort((a, b) => b.score - a.score);

    const averageScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
    const topPick = results[0] || null;

    // Generate insights
    const insights = generateInsights(results, weights);

    span.setAttributes({
      'arbitrage.skills_count': skills.length,
      'arbitrage.average_score': averageScore,
      'arbitrage.top_pick': topPick?.skill.name || 'none',
      'arbitrage.top_score': topPick?.score || 0,
    });

    return {
      skills: results,
      topPick,
      averageScore,
      insights,
    };
  });
}

// ============================================
// ADAPTIVE WEIGHTS
// ============================================

/**
 * Adjust weights based on user preferences (from swipe learning)
 */
export function adjustWeights(
  baseWeights: ArbitrageWeights,
  preferences: {
    effortSensitivity?: number; // 0-1, higher = prefer low effort
    hourlyRatePriority?: number; // 0-1, higher = prioritize rate
    timeFlexibility?: number; // 0-1, higher = prefer flexible hours
  }
): ArbitrageWeights {
  const { effortSensitivity = 0.5, hourlyRatePriority = 0.5, timeFlexibility = 0.5 } = preferences;

  // Adjust weights based on preferences while keeping total = 1
  const adjustedRate = baseWeights.rate * (0.5 + hourlyRatePriority);
  const adjustedEffort = baseWeights.effort * (0.5 + effortSensitivity);
  const adjustedRest = baseWeights.rest * (0.5 + timeFlexibility);
  const adjustedDemand = baseWeights.demand;

  // Normalize to sum to 1
  const total = adjustedRate + adjustedDemand + adjustedEffort + adjustedRest;

  return {
    rate: adjustedRate / total,
    demand: adjustedDemand / total,
    effort: adjustedEffort / total,
    rest: adjustedRest / total,
  };
}

// ============================================
// HELPERS
// ============================================

function generateRecommendation(skill: Skill, score: number): string {
  if (score >= 7) {
    return `Excellent choix ! ${skill.name} offre un bon équilibre gains/effort.`;
  }
  if (score >= 5) {
    return `${skill.name} est correct. Considère si l'effort en vaut la peine.`;
  }
  if (score >= 3) {
    return `${skill.name} pourrait être épuisant. Privilégie si tu as besoin d'argent rapidement.`;
  }
  return `${skill.name} n'est pas optimal. Cherche des alternatives si possible.`;
}

function generateInsights(results: ArbitrageResult[], _weights: ArbitrageWeights): string[] {
  const insights: string[] = [];

  if (results.length === 0) return insights;

  const top = results[0];
  const worst = results[results.length - 1];

  // Top pick insight
  insights.push(
    `🏆 ${top.skill.name} est ton meilleur arbitrage avec un score de ${top.score.toFixed(1)}/10`
  );

  // Rate vs effort trade-off (using dinero.js v1 for comparison)
  const highRateThreshold = euros(25); // €25/h threshold
  const highRateLowScore = results.find((r) => {
    const skillRate = euros(r.skill.hourlyRate);
    return skillRate.greaterThanOrEqual(highRateThreshold) && r.score < results[0].score - 1;
  });
  if (highRateLowScore) {
    const formattedRate = formatEuro(euros(highRateLowScore.skill.hourlyRate));
    insights.push(
      `💡 ${highRateLowScore.skill.name} paie bien (${formattedRate}/h) mais ` +
        `l'effort élevé fait baisser son score`
    );
  }

  // Low effort hidden gem
  const lowEffortGem = results.find(
    (r) => r.skill.cognitiveEffort <= 2 && r.score >= 5 && r !== top
  );
  if (lowEffortGem) {
    insights.push(
      `✨ ${lowEffortGem.skill.name} est peu fatigant et reste rentable - bon pour les périodes d'exams`
    );
  }

  // Score spread warning
  if (results.length > 1 && top.score - worst.score > 3) {
    insights.push(
      `⚠️ Écart important entre tes compétences. Focus sur ${top.skill.name} pour maximiser ton temps.`
    );
  }

  return insights;
}

// ============================================
// SKILL TEMPLATES (for quick add)
// ============================================

export const SKILL_TEMPLATES: Partial<Skill>[] = [
  { name: 'Python', hourlyRate: 25, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'SQL Coaching', hourlyRate: 22, marketDemand: 4, cognitiveEffort: 3, restNeeded: 1 },
  { name: 'JavaScript', hourlyRate: 23, marketDemand: 5, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Excel', hourlyRate: 18, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  {
    name: 'Cours particuliers',
    hourlyRate: 20,
    marketDemand: 5,
    cognitiveEffort: 3,
    restNeeded: 1,
  },
  {
    name: 'Traduction Anglais',
    hourlyRate: 15,
    marketDemand: 3,
    cognitiveEffort: 2,
    restNeeded: 0.5,
  },
  { name: 'Design Graphique', hourlyRate: 22, marketDemand: 3, cognitiveEffort: 4, restNeeded: 2 },
  { name: 'Data Entry', hourlyRate: 12, marketDemand: 4, cognitiveEffort: 1, restNeeded: 0.5 },
  { name: 'Social Media', hourlyRate: 16, marketDemand: 4, cognitiveEffort: 2, restNeeded: 1 },
  { name: 'Redaction Web', hourlyRate: 18, marketDemand: 3, cognitiveEffort: 3, restNeeded: 1 },
];

export default {
  // Core algorithm
  calculateArbitrageScore,
  rankSkills,
  adjustWeights,
  DEFAULT_WEIGHTS,
  SKILL_TEMPLATES,
  // Money utilities (dinero.js)
  euroCents,
  euros,
  formatEuro,
  toEuros,
};
