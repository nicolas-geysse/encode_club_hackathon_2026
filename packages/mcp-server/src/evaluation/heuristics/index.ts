/**
 * Heuristics Index
 *
 * Orchestrates all heuristic checks for the hybrid evaluation system.
 */

import type { HeuristicResult, HeuristicsResults, EvaluationInput } from '../types.js';

import { checkCalculations } from './calculation.js';
import { checkRiskKeywords } from './risk-keywords.js';
import { checkReadability } from './readability.js';
import { checkTone } from './tone.js';
import { checkDisclaimers } from './disclaimers.js';

// Re-export individual checks
export { checkCalculations } from './calculation.js';
export { checkRiskKeywords } from './risk-keywords.js';
export { checkReadability } from './readability.js';
export { checkTone } from './tone.js';
export { checkDisclaimers } from './disclaimers.js';

/**
 * Weights for each heuristic in the aggregated score
 */
const HEURISTIC_WEIGHTS: Record<string, number> = {
  calculation_validation: 0.3, // Most important - math must be correct
  risk_keywords: 0.25, // Safety is critical
  readability: 0.15, // Important for accessibility
  tone: 0.15, // Affects user experience
  disclaimers: 0.15, // Legal and ethical importance
};

/**
 * Run all heuristic checks
 */
export async function runAllHeuristics(input: EvaluationInput): Promise<HeuristicsResults> {
  const { recommendation, calculations, context } = input;

  // Run all checks
  const checks: HeuristicResult[] = [
    checkCalculations(calculations),
    checkRiskKeywords(recommendation, context),
    checkReadability(recommendation),
    checkTone(recommendation, context),
    checkDisclaimers(recommendation),
  ];

  // Check for critical failures
  const criticalFailures = checks.filter((c) => c.isCritical && !c.passed);
  const criticalFailed = criticalFailures.length > 0;

  // Calculate weighted aggregated score
  let totalWeight = 0;
  let weightedSum = 0;

  for (const check of checks) {
    const weight = HEURISTIC_WEIGHTS[check.name] || 0.1;
    weightedSum += check.score * weight;
    totalWeight += weight;
  }

  const aggregatedScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Collect all issues from failed checks
  const issues = checks.filter((c) => !c.passed).map((c) => c.message);

  return {
    checks,
    aggregatedScore: Math.round(aggregatedScore * 1000) / 1000,
    criticalFailed,
    issues,
  };
}

/**
 * Run quick critical checks only (for fast veto detection)
 */
export function runCriticalChecksOnly(input: EvaluationInput): HeuristicResult[] {
  const { recommendation, calculations, context } = input;

  return [checkCalculations(calculations), checkRiskKeywords(recommendation, context)];
}

/**
 * Get details about all available heuristics
 */
export function getHeuristicsInfo(): Array<{
  name: string;
  weight: number;
  isCritical: boolean;
  description: string;
}> {
  return [
    {
      name: 'calculation_validation',
      weight: HEURISTIC_WEIGHTS.calculation_validation,
      isCritical: true,
      description: 'Valide les calculs financiers (marges, projections, interets)',
    },
    {
      name: 'risk_keywords',
      weight: HEURISTIC_WEIGHTS.risk_keywords,
      isCritical: true,
      description: 'Detecte les mots-cles a risque (crypto, forex, garanti)',
    },
    {
      name: 'readability',
      weight: HEURISTIC_WEIGHTS.readability,
      isCritical: false,
      description: 'Verifie que le texte est accessible (Flesch-Kincaid)',
    },
    {
      name: 'tone',
      weight: HEURISTIC_WEIGHTS.tone,
      isCritical: false,
      description: 'Analyse le ton et le sentiment du conseil',
    },
    {
      name: 'disclaimers',
      weight: HEURISTIC_WEIGHTS.disclaimers,
      isCritical: false,
      description: 'Verifie la presence de mises en garde appropriees',
    },
  ];
}

export default {
  runAllHeuristics,
  runCriticalChecksOnly,
  getHeuristicsInfo,
  HEURISTIC_WEIGHTS,
};
