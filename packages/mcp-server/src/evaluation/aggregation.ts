/**
 * Hybrid Evaluation Aggregation
 *
 * Combines heuristic and G-Eval scores with veto logic.
 */

import type {
  HybridEvaluationResult,
  HeuristicsResults,
  GEvalResult,
  AggregationConfig,
  EvaluationInput,
  DEFAULT_AGGREGATION_CONFIG,
} from './types.js';
import { runAllHeuristics, runCriticalChecksOnly } from './heuristics/index.js';
import { runGEval, type LLMGenerateFunction } from './geval/index.js';

export { DEFAULT_AGGREGATION_CONFIG } from './types.js';

/**
 * Check if any critical heuristic failed (triggers veto)
 */
function checkForVeto(
  heuristicsResults: HeuristicsResults,
  config: AggregationConfig
): { vetoed: boolean; reason?: string } {
  // Check for critical failures
  if (heuristicsResults.criticalFailed) {
    const criticalFailures = heuristicsResults.checks
      .filter((c) => c.isCritical && !c.passed)
      .map((c) => c.name);

    return {
      vetoed: true,
      reason: `Check(s) critique(s) echoue(s): ${criticalFailures.join(', ')}`,
    };
  }

  // Check if heuristic score is below veto threshold
  if (heuristicsResults.aggregatedScore < config.vetoThreshold) {
    return {
      vetoed: true,
      reason: `Score heuristique trop bas (${Math.round(heuristicsResults.aggregatedScore * 100)}% < ${config.vetoThreshold * 100}%)`,
    };
  }

  return { vetoed: false };
}

/**
 * Calculate final score from heuristics and G-Eval
 */
function calculateFinalScore(
  heuristicScore: number,
  gEvalResult: GEvalResult | undefined,
  config: AggregationConfig
): number {
  // If no G-Eval result, use only heuristic score
  if (!gEvalResult) {
    return heuristicScore;
  }

  let effectiveLlmWeight = config.llmWeight;

  // Adjust LLM weight based on confidence
  if (config.confidenceWeighting.enabled) {
    const avgConfidence = gEvalResult.averageConfidence;
    if (avgConfidence < config.confidenceWeighting.minConfidence) {
      // Reduce LLM weight if confidence is low
      effectiveLlmWeight *= avgConfidence / config.confidenceWeighting.minConfidence;
    }
  }

  // Normalize weights
  const totalWeight = config.heuristicWeight + effectiveLlmWeight;
  const normalizedHeuristicWeight = config.heuristicWeight / totalWeight;
  const normalizedLlmWeight = effectiveLlmWeight / totalWeight;

  // Calculate weighted average
  const finalScore =
    heuristicScore * normalizedHeuristicWeight +
    gEvalResult.aggregatedScore * normalizedLlmWeight;

  return Math.round(finalScore * 1000) / 1000;
}

/**
 * Generate suggestions based on evaluation results
 */
function generateSuggestions(
  heuristicsResults: HeuristicsResults,
  gEvalResult?: GEvalResult
): string[] {
  const suggestions: string[] = [];

  // From heuristics
  for (const check of heuristicsResults.checks) {
    if (!check.passed) {
      switch (check.name) {
        case 'calculation_validation':
          suggestions.push('Verifier et corriger les calculs financiers');
          break;
        case 'risk_keywords':
          suggestions.push('Retirer ou attenuer les elements a risque');
          break;
        case 'readability':
          suggestions.push('Simplifier le langage pour le rendre plus accessible');
          break;
        case 'tone':
          suggestions.push('Ajuster le ton pour etre plus equilibre et rassurant');
          break;
        case 'disclaimers':
          suggestions.push('Ajouter des mises en garde appropriees');
          break;
      }
    }
  }

  // From G-Eval
  if (gEvalResult) {
    for (const result of gEvalResult.criteriaResults) {
      if (result.normalizedScore < 0.6) {
        switch (result.criterion) {
          case 'appropriateness':
            suggestions.push('Adapter davantage le conseil au contexte etudiant');
            break;
          case 'safety':
            suggestions.push('Renforcer la securite des recommandations');
            break;
          case 'coherence':
            suggestions.push('Ameliorer la structure et la logique du conseil');
            break;
          case 'actionability':
            suggestions.push('Ajouter des etapes concretes et des ressources specifiques');
            break;
        }
      }
    }
  }

  // Remove duplicates and limit
  return [...new Set(suggestions)].slice(0, 5);
}

/**
 * Run full hybrid evaluation
 */
export async function runHybridEvaluation(
  input: EvaluationInput,
  generateFn: LLMGenerateFunction,
  config: AggregationConfig = {
    heuristicWeight: 0.60,
    llmWeight: 0.40,
    vetoThreshold: 0.3,
    passThreshold: 0.6,
    confidenceWeighting: {
      enabled: true,
      minConfidence: 0.5,
    },
  }
): Promise<HybridEvaluationResult> {
  // Step 1: Run all heuristics
  const heuristicsResults = await runAllHeuristics(input);

  // Step 2: Check for veto
  const vetoCheck = checkForVeto(heuristicsResults, config);

  if (vetoCheck.vetoed) {
    // Early return - skip G-Eval if vetoed
    return {
      passed: false,
      finalScore: heuristicsResults.aggregatedScore,
      heuristicScore: heuristicsResults.aggregatedScore,
      llmScore: 0,
      vetoed: true,
      vetoReason: vetoCheck.reason,
      issues: heuristicsResults.issues,
      suggestions: generateSuggestions(heuristicsResults),
      heuristicsResults,
      gEvalResult: undefined,
    };
  }

  // Step 3: Run G-Eval (only if not vetoed)
  const gEvalResult = await runGEval(input.recommendation, input.context, generateFn);

  // Step 4: Calculate final score
  const finalScore = calculateFinalScore(
    heuristicsResults.aggregatedScore,
    gEvalResult,
    config
  );

  // Step 5: Determine pass/fail
  const passed = finalScore >= config.passThreshold;

  // Step 6: Collect all issues
  const allIssues = [
    ...heuristicsResults.issues,
    ...gEvalResult.criteriaResults
      .filter((r) => r.normalizedScore < 0.6)
      .map((r) => `${r.criterion}: score ${Math.round(r.normalizedScore * 100)}%`),
  ];

  return {
    passed,
    finalScore,
    heuristicScore: heuristicsResults.aggregatedScore,
    llmScore: gEvalResult.aggregatedScore,
    vetoed: false,
    issues: allIssues,
    suggestions: generateSuggestions(heuristicsResults, gEvalResult),
    heuristicsResults,
    gEvalResult,
  };
}

/**
 * Run quick evaluation (heuristics only, for fast feedback)
 */
export async function runQuickEvaluation(
  input: EvaluationInput
): Promise<{
  passed: boolean;
  score: number;
  criticalFailed: boolean;
  issues: string[];
}> {
  const results = await runAllHeuristics(input);

  return {
    passed: results.aggregatedScore >= 0.6 && !results.criticalFailed,
    score: results.aggregatedScore,
    criticalFailed: results.criticalFailed,
    issues: results.issues,
  };
}

/**
 * Run critical checks only (fastest, for real-time validation)
 */
export function runCriticalValidation(
  input: EvaluationInput
): { passed: boolean; issues: string[] } {
  const criticalResults = runCriticalChecksOnly(input);
  const failed = criticalResults.filter((r) => !r.passed);

  return {
    passed: failed.length === 0,
    issues: failed.map((r) => r.message),
  };
}

export default {
  runHybridEvaluation,
  runQuickEvaluation,
  runCriticalValidation,
};
