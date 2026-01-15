/**
 * G-Eval Index
 *
 * LLM-as-Judge evaluation orchestrator using the G-Eval pattern.
 */

import type {
  GEvalResult,
  GEvalCriterionResult,
  EvaluationContext,
} from '../types.js';
import { STUDENT_GEVAL_CRITERIA } from './criteria.js';
import {
  GEVAL_SYSTEM_PROMPT,
  buildBatchEvaluationPrompt,
  parseBatchGEvalResponse,
  buildCriterionPrompt,
  parseGEvalResponse,
} from './prompts.js';

// Re-export
export { STUDENT_GEVAL_CRITERIA, getCriterion, getCriteriaNames } from './criteria.js';
export {
  GEVAL_SYSTEM_PROMPT,
  buildCriterionPrompt,
  buildBatchEvaluationPrompt,
} from './prompts.js';

/**
 * LLM generation function type
 * This should be provided by the caller (e.g., Groq, OpenAI)
 */
export type LLMGenerateFunction = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

/**
 * Normalize score from 1-5 to 0-1
 */
function normalizeScore(score: number): number {
  return (score - 1) / 4;
}

/**
 * Run G-Eval for all criteria (batch mode - more efficient)
 */
export async function runGEvalBatch(
  recommendation: string,
  context: EvaluationContext,
  generateFn: LLMGenerateFunction
): Promise<GEvalResult> {
  const prompt = buildBatchEvaluationPrompt(
    STUDENT_GEVAL_CRITERIA,
    recommendation,
    context
  );

  const response = await generateFn(GEVAL_SYSTEM_PROMPT, prompt);
  const parsed = parseBatchGEvalResponse(response);

  if (!parsed) {
    // Fallback to default scores if parsing fails
    return createFallbackResult('Parsing error: could not parse LLM response');
  }

  const criteriaResults: GEvalCriterionResult[] = STUDENT_GEVAL_CRITERIA.map((criterion) => {
    const result = parsed.find((r) => r.criterion === criterion.name);

    if (!result) {
      return {
        criterion: criterion.name,
        score: 3,
        normalizedScore: 0.5,
        confidence: 0.5,
        reasoning: 'Criterion not evaluated',
      };
    }

    return {
      criterion: criterion.name,
      score: result.score,
      normalizedScore: normalizeScore(result.score),
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  });

  // Calculate weighted average
  let weightedSum = 0;
  let confidenceSum = 0;

  for (let i = 0; i < STUDENT_GEVAL_CRITERIA.length; i++) {
    const criterion = STUDENT_GEVAL_CRITERIA[i];
    const result = criteriaResults[i];
    weightedSum += result.normalizedScore * criterion.weight;
    confidenceSum += result.confidence;
  }

  const aggregatedScore = weightedSum;
  const averageConfidence = confidenceSum / STUDENT_GEVAL_CRITERIA.length;

  // Build overall reasoning
  const overallReasoning = criteriaResults
    .map((r) => `${r.criterion}: ${r.score}/5 - ${r.reasoning.slice(0, 100)}...`)
    .join('\n');

  return {
    criteriaResults,
    aggregatedScore: Math.round(aggregatedScore * 1000) / 1000,
    averageConfidence: Math.round(averageConfidence * 100) / 100,
    overallReasoning,
  };
}

/**
 * Run G-Eval for each criterion individually (higher quality, slower)
 */
export async function runGEvalIndividual(
  recommendation: string,
  context: EvaluationContext,
  generateFn: LLMGenerateFunction
): Promise<GEvalResult> {
  const criteriaResults: GEvalCriterionResult[] = [];

  for (const criterion of STUDENT_GEVAL_CRITERIA) {
    const prompt = buildCriterionPrompt(criterion, recommendation, context);
    const response = await generateFn(GEVAL_SYSTEM_PROMPT, prompt);
    const parsed = parseGEvalResponse(response);

    if (parsed) {
      criteriaResults.push({
        criterion: criterion.name,
        score: parsed.score,
        normalizedScore: normalizeScore(parsed.score),
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
      });
    } else {
      criteriaResults.push({
        criterion: criterion.name,
        score: 3,
        normalizedScore: 0.5,
        confidence: 0.5,
        reasoning: 'Parsing error',
      });
    }
  }

  // Calculate aggregated score
  let weightedSum = 0;
  let confidenceSum = 0;

  for (let i = 0; i < STUDENT_GEVAL_CRITERIA.length; i++) {
    const criterion = STUDENT_GEVAL_CRITERIA[i];
    const result = criteriaResults[i];
    weightedSum += result.normalizedScore * criterion.weight;
    confidenceSum += result.confidence;
  }

  const aggregatedScore = weightedSum;
  const averageConfidence = confidenceSum / STUDENT_GEVAL_CRITERIA.length;

  const overallReasoning = criteriaResults
    .map((r) => `${r.criterion}: ${r.score}/5`)
    .join(', ');

  return {
    criteriaResults,
    aggregatedScore: Math.round(aggregatedScore * 1000) / 1000,
    averageConfidence: Math.round(averageConfidence * 100) / 100,
    overallReasoning,
  };
}

/**
 * Create fallback result when G-Eval fails
 */
function createFallbackResult(reason: string): GEvalResult {
  return {
    criteriaResults: STUDENT_GEVAL_CRITERIA.map((c) => ({
      criterion: c.name,
      score: 3,
      normalizedScore: 0.5,
      confidence: 0.3,
      reasoning: reason,
    })),
    aggregatedScore: 0.5,
    averageConfidence: 0.3,
    overallReasoning: reason,
  };
}

/**
 * Run G-Eval with automatic mode selection
 * Uses batch mode by default for efficiency
 */
export async function runGEval(
  recommendation: string,
  context: EvaluationContext,
  generateFn: LLMGenerateFunction,
  options?: { useBatchMode?: boolean }
): Promise<GEvalResult> {
  const useBatch = options?.useBatchMode ?? true;

  try {
    if (useBatch) {
      return await runGEvalBatch(recommendation, context, generateFn);
    } else {
      return await runGEvalIndividual(recommendation, context, generateFn);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createFallbackResult(`G-Eval error: ${errorMessage}`);
  }
}

export default {
  runGEval,
  runGEvalBatch,
  runGEvalIndividual,
  STUDENT_GEVAL_CRITERIA,
};
