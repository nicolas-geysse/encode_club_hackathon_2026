/**
 * Opik Integration for Hybrid Evaluation
 *
 * Provides rich logging of evaluation results with custom metrics.
 */

import { trace, getTraceUrl, getCurrentTraceId } from '../services/opik.js';
import type {
  HybridEvaluationResult,
  HeuristicsResults,
  GEvalResult,
  EvaluationInput,
  EvaluationContext,
} from './types.js';
import { runHybridEvaluation as runEvaluation, runQuickEvaluation, runCriticalValidation } from './aggregation.js';
import type { LLMGenerateFunction } from './geval/index.js';

/**
 * Run hybrid evaluation with full Opik tracing
 */
export async function runHybridEvaluationWithTracing(
  input: EvaluationInput,
  generateFn: LLMGenerateFunction
): Promise<HybridEvaluationResult & { opikTraceId?: string }> {
  return trace('hybrid_evaluation', async (rootSpan) => {
    rootSpan.setAttributes({
      'evaluation.input_length': input.recommendation.length,
      'evaluation.has_calculations': !!input.calculations?.length,
      'evaluation.context.target_audience': input.context.targetAudience,
      'evaluation.context.financial_situation': input.context.financialSituation,
      'evaluation.context.has_loan': input.context.hasLoan,
    });

    // Step 1: Run heuristics with detailed tracing
    const heuristicsResults = await traceHeuristics(input);

    rootSpan.setAttributes({
      'heuristics.aggregated_score': heuristicsResults.aggregatedScore,
      'heuristics.critical_failed': heuristicsResults.criticalFailed,
      'heuristics.issues_count': heuristicsResults.issues.length,
    });

    // Check for veto
    if (heuristicsResults.criticalFailed || heuristicsResults.aggregatedScore < 0.3) {
      rootSpan.setAttributes({
        'evaluation.vetoed': true,
        'evaluation.veto_reason': heuristicsResults.criticalFailed
          ? 'Critical check failed'
          : 'Heuristic score below threshold',
        'evaluation.final_score': heuristicsResults.aggregatedScore,
        'evaluation.passed': false,
      });

      return {
        passed: false,
        finalScore: heuristicsResults.aggregatedScore,
        heuristicScore: heuristicsResults.aggregatedScore,
        llmScore: 0,
        vetoed: true,
        vetoReason: heuristicsResults.criticalFailed
          ? 'Check(s) critique(s) echoue(s)'
          : 'Score heuristique trop bas',
        issues: heuristicsResults.issues,
        suggestions: ['Corriger les problemes critiques avant reevaluation'],
        heuristicsResults,
        opikTraceId: getCurrentTraceId() || undefined,
      };
    }

    // Step 2: Run G-Eval with tracing
    const gEvalResult = await traceGEval(input, generateFn);

    rootSpan.setAttributes({
      'geval.aggregated_score': gEvalResult.aggregatedScore,
      'geval.average_confidence': gEvalResult.averageConfidence,
    });

    // Log individual criterion scores
    for (const result of gEvalResult.criteriaResults) {
      rootSpan.setAttributes({
        [`geval.${result.criterion}.score`]: result.normalizedScore,
        [`geval.${result.criterion}.confidence`]: result.confidence,
      });
    }

    // Step 3: Calculate final score
    const finalScore = calculateTracedFinalScore(
      heuristicsResults.aggregatedScore,
      gEvalResult
    );

    const passed = finalScore >= 0.6;

    rootSpan.setAttributes({
      'evaluation.final_score': finalScore,
      'evaluation.passed': passed,
      'evaluation.vetoed': false,
    });

    // Collect all issues
    const allIssues = [
      ...heuristicsResults.issues,
      ...gEvalResult.criteriaResults
        .filter((r) => r.normalizedScore < 0.6)
        .map((r) => `${r.criterion}: ${Math.round(r.normalizedScore * 100)}%`),
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
      opikTraceId: getCurrentTraceId() || undefined,
    };
  });
}

/**
 * Trace heuristics evaluation
 */
async function traceHeuristics(input: EvaluationInput): Promise<HeuristicsResults> {
  return trace('heuristics_evaluation', async (span) => {
    const { runAllHeuristics } = await import('./heuristics/index.js');
    const results = await runAllHeuristics(input);

    // Log each heuristic check
    for (const check of results.checks) {
      span.setAttributes({
        [`heuristic.${check.name}.passed`]: check.passed,
        [`heuristic.${check.name}.score`]: check.score,
        [`heuristic.${check.name}.is_critical`]: check.isCritical,
      });

      // Add event for failed checks
      if (!check.passed) {
        span.addEvent(`heuristic_failed_${check.name}`, {
          message: check.message,
          score: check.score,
        });
      }
    }

    return results;
  });
}

/**
 * Trace G-Eval LLM-as-Judge evaluation
 */
async function traceGEval(
  input: EvaluationInput,
  generateFn: LLMGenerateFunction
): Promise<GEvalResult> {
  return trace('geval_llm_judge', async (span) => {
    const { runGEval } = await import('./geval/index.js');

    span.setAttributes({
      'geval.mode': 'batch',
      'geval.criteria_count': 4,
    });

    const startTime = Date.now();
    const result = await runGEval(input.recommendation, input.context, generateFn);
    const duration = Date.now() - startTime;

    span.setAttributes({
      'geval.duration_ms': duration,
      'geval.aggregated_score': result.aggregatedScore,
      'geval.average_confidence': result.averageConfidence,
    });

    // Log each criterion result
    for (const criterionResult of result.criteriaResults) {
      span.addEvent(`geval_criterion_${criterionResult.criterion}`, {
        score: criterionResult.score,
        normalized_score: criterionResult.normalizedScore,
        confidence: criterionResult.confidence,
        reasoning_preview: criterionResult.reasoning.slice(0, 200),
      });
    }

    return result;
  });
}

/**
 * Calculate final score with tracing
 */
function calculateTracedFinalScore(
  heuristicScore: number,
  gEvalResult: GEvalResult
): number {
  const heuristicWeight = 0.6;
  const llmWeight = 0.4;

  // Adjust LLM weight based on confidence
  let effectiveLlmWeight = llmWeight;
  if (gEvalResult.averageConfidence < 0.5) {
    effectiveLlmWeight *= gEvalResult.averageConfidence / 0.5;
  }

  const totalWeight = heuristicWeight + effectiveLlmWeight;
  const finalScore =
    (heuristicScore * heuristicWeight + gEvalResult.aggregatedScore * effectiveLlmWeight) /
    totalWeight;

  return Math.round(finalScore * 1000) / 1000;
}

/**
 * Generate suggestions based on results
 */
function generateSuggestions(
  heuristicsResults: HeuristicsResults,
  gEvalResult: GEvalResult
): string[] {
  const suggestions: string[] = [];

  // From heuristics
  for (const check of heuristicsResults.checks) {
    if (!check.passed) {
      switch (check.name) {
        case 'calculation_validation':
          suggestions.push('Verifier les calculs financiers');
          break;
        case 'risk_keywords':
          suggestions.push('Attenuer les elements a risque');
          break;
        case 'readability':
          suggestions.push('Simplifier le langage');
          break;
        case 'tone':
          suggestions.push('Ajuster le ton');
          break;
        case 'disclaimers':
          suggestions.push('Ajouter des mises en garde');
          break;
      }
    }
  }

  // From G-Eval
  for (const result of gEvalResult.criteriaResults) {
    if (result.normalizedScore < 0.6) {
      switch (result.criterion) {
        case 'appropriateness':
          suggestions.push('Adapter au contexte etudiant');
          break;
        case 'safety':
          suggestions.push('Renforcer la securite');
          break;
        case 'coherence':
          suggestions.push('Ameliorer la structure');
          break;
        case 'actionability':
          suggestions.push('Ajouter des etapes concretes');
          break;
      }
    }
  }

  return [...new Set(suggestions)].slice(0, 5);
}

/**
 * Get evaluation metrics for Opik dashboard
 */
export function getEvaluationMetrics(result: HybridEvaluationResult): Record<string, number> {
  const metrics: Record<string, number> = {
    'evaluation.final_score': result.finalScore,
    'evaluation.heuristic_score': result.heuristicScore,
    'evaluation.llm_score': result.llmScore,
    'evaluation.passed': result.passed ? 1 : 0,
    'evaluation.vetoed': result.vetoed ? 1 : 0,
    'evaluation.issues_count': result.issues.length,
  };

  // Add individual heuristic scores
  for (const check of result.heuristicsResults.checks) {
    metrics[`heuristic.${check.name}.score`] = check.score;
  }

  // Add G-Eval scores if available
  if (result.gEvalResult) {
    for (const criterion of result.gEvalResult.criteriaResults) {
      metrics[`geval.${criterion.criterion}.score`] = criterion.normalizedScore;
      metrics[`geval.${criterion.criterion}.confidence`] = criterion.confidence;
    }
  }

  return metrics;
}

export default {
  runHybridEvaluationWithTracing,
  getEvaluationMetrics,
};
