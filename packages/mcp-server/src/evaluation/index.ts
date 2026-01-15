/**
 * Hybrid Evaluation System
 *
 * Combines heuristic checks + LLM-as-Judge (G-Eval) for evaluating
 * student financial recommendations.
 *
 * Features:
 * - Fast heuristic checks (calculation, risk keywords, readability, tone, disclaimers)
 * - LLM-as-Judge with G-Eval pattern (4 criteria: appropriateness, safety, coherence, actionability)
 * - Veto logic for critical failures
 * - Full Opik integration for observability
 */

// Types
export type {
  HeuristicResult,
  HeuristicsResults,
  GEvalCriterion,
  GEvalCriterionResult,
  GEvalResult,
  HybridEvaluationResult,
  EvaluationContext,
  EvaluationInput,
  AggregationConfig,
} from './types.js';

export {
  DEFAULT_AGGREGATION_CONFIG,
  HIGH_RISK_KEYWORDS,
  SAFE_KEYWORDS,
} from './types.js';

// Heuristics
export {
  runAllHeuristics,
  runCriticalChecksOnly,
  getHeuristicsInfo,
  checkCalculations,
  checkRiskKeywords,
  checkReadability,
  checkTone,
  checkDisclaimers,
} from './heuristics/index.js';

// G-Eval
export {
  runGEval,
  runGEvalBatch,
  runGEvalIndividual,
  STUDENT_GEVAL_CRITERIA,
  getCriterion,
  getCriteriaNames,
  GEVAL_SYSTEM_PROMPT,
  buildCriterionPrompt,
  buildBatchEvaluationPrompt,
} from './geval/index.js';

export type { LLMGenerateFunction } from './geval/index.js';

// Aggregation
export {
  runHybridEvaluation,
  runQuickEvaluation,
  runCriticalValidation,
} from './aggregation.js';

// Opik Integration
export {
  runHybridEvaluationWithTracing,
  getEvaluationMetrics,
} from './opik-integration.js';

/**
 * Quick start: Run full evaluation with tracing
 *
 * @example
 * ```typescript
 * import { runHybridEvaluationWithTracing } from './evaluation';
 *
 * const result = await runHybridEvaluationWithTracing(
 *   {
 *     recommendation: "Je te recommande le Livret A pour ton épargne...",
 *     context: {
 *       targetAudience: 'etudiant',
 *       financialSituation: 'serre',
 *       hasLoan: false,
 *     }
 *   },
 *   async (systemPrompt, userPrompt) => {
 *     // Your LLM call here
 *     return await callLLM(systemPrompt, userPrompt);
 *   }
 * );
 *
 * console.log(result.passed, result.finalScore);
 * ```
 */
