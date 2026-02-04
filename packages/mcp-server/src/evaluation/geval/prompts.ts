/**
 * G-Eval Prompts
 *
 * Prompt templates for LLM-as-Judge evaluation using Chain-of-Thought.
 * Uses Zod schemas for robust JSON validation of LLM responses.
 */

import { z } from 'zod';
import type { GEvalCriterion, EvaluationContext } from '../types.js';

// ============================================
// ZOD SCHEMAS FOR LLM RESPONSE VALIDATION
// ============================================

/**
 * Schema for single criterion evaluation response
 */
const GEvalSingleResponseSchema = z.object({
  criterion: z.string().optional(),
  reasoning: z.string().min(1, 'Reasoning is required'),
  score: z.number().int().min(1).max(5),
  confidence: z.number().min(0).max(1),
});

/**
 * Schema for batch evaluation response
 */
const GEvalBatchResponseSchema = z.object({
  evaluations: z.array(
    z.object({
      criterion: z.string(),
      reasoning: z.string(),
      score: z.number().int().min(1).max(5),
      confidence: z.number().min(0).max(1),
    })
  ),
  overall_reasoning: z.string().optional(),
});

export type GEvalSingleResponse = z.infer<typeof GEvalSingleResponseSchema>;
export type GEvalBatchResponse = z.infer<typeof GEvalBatchResponseSchema>;

/**
 * System prompt for the G-Eval judge
 */
export const GEVAL_SYSTEM_PROMPT = `Tu es un evaluateur expert de conseils financiers pour etudiants francais.

CONTEXTE:
Tu dois evaluer des recommandations financieres destinees a des etudiants avec budget limite.
L'objectif est de s'assurer que les conseils sont:
- Adaptes a la realite etudiante (budget < 1000€/mois)
- Securises (pas de risques financiers)
- Coherents et logiques
- Actionnables immediatement

METHODE D'EVALUATION:
1. Lis attentivement le conseil et le contexte utilisateur
2. Pour chaque critere, reflechis etape par etape (Chain-of-Thought)
3. Attribue un score de 1 a 5 selon la rubrique fournie
4. Explique ton raisonnement
5. Indique ton niveau de confiance (0-1)

FORMAT DE REPONSE:
Tu DOIS repondre en JSON valide avec cette structure exacte:
{
  "criterion": "nom_du_critere",
  "reasoning": "ton raisonnement etape par etape",
  "score": 1-5,
  "confidence": 0.0-1.0
}`;

/**
 * Build evaluation prompt for a specific criterion
 */
export function buildCriterionPrompt(
  criterion: GEvalCriterion,
  recommendation: string,
  context: EvaluationContext
): string {
  const contextDescription = buildContextDescription(context);

  return `CRITERE A EVALUER: ${criterion.name}
${criterion.description}

RUBRIQUE DE NOTATION:
${criterion.rubric}

CONTEXTE UTILISATEUR:
${contextDescription}

CONSEIL A EVALUER:
"""
${recommendation}
"""

Evalue ce conseil selon le critere "${criterion.name}".
Reflechis etape par etape, puis donne ton score de 1 a 5 et ton niveau de confiance.

Reponds UNIQUEMENT en JSON valide:
{
  "criterion": "${criterion.name}",
  "reasoning": "...",
  "score": X,
  "confidence": X.XX
}`;
}

/**
 * Build human-readable context description
 */
function buildContextDescription(context: EvaluationContext): string {
  const parts: string[] = [];

  parts.push(`- Target audience: ${context.targetAudience === 'student' ? 'Student' : 'General'}`);

  if (context.financialSituation) {
    const situationMap: Record<string, string> = {
      deficit: 'In deficit (expenses > income)',
      tight: 'Tight budget (little margin)',
      balanced: 'Balanced budget',
      comfortable: 'Comfortable budget',
    };
    parts.push(`- Financial situation: ${situationMap[context.financialSituation]}`);
  }

  if (context.hasLoan !== undefined) {
    parts.push(`- Student loan: ${context.hasLoan ? 'Yes' : 'No'}`);
  }

  if (context.yearsRemaining !== undefined) {
    parts.push(`- Years of study remaining: ${context.yearsRemaining}`);
  }

  return parts.join('\n');
}

/**
 * Build batch evaluation prompt for all criteria at once
 * More efficient but may reduce quality
 */
export function buildBatchEvaluationPrompt(
  criteria: GEvalCriterion[],
  recommendation: string,
  context: EvaluationContext
): string {
  const contextDescription = buildContextDescription(context);

  const criteriaDescriptions = criteria
    .map(
      (c, i) => `${i + 1}. **${c.name}** (poids: ${c.weight * 100}%)
   ${c.description}

   Rubrique:
   ${c.rubric
     .split('\n')
     .map((l) => '   ' + l)
     .join('\n')}`
    )
    .join('\n\n');

  return `Tu dois evaluer ce conseil financier selon ${criteria.length} criteres.

CONTEXTE UTILISATEUR:
${contextDescription}

CONSEIL A EVALUER:
"""
${recommendation}
"""

CRITERES D'EVALUATION:
${criteriaDescriptions}

Pour CHAQUE critere:
1. Reflechis etape par etape
2. Attribue un score de 1 a 5
3. Indique ta confiance (0-1)

Reponds en JSON avec cette structure EXACTE:
{
  "evaluations": [
    {
      "criterion": "appropriateness",
      "reasoning": "...",
      "score": X,
      "confidence": X.XX
    },
    {
      "criterion": "safety",
      "reasoning": "...",
      "score": X,
      "confidence": X.XX
    },
    {
      "criterion": "coherence",
      "reasoning": "...",
      "score": X,
      "confidence": X.XX
    },
    {
      "criterion": "actionability",
      "reasoning": "...",
      "score": X,
      "confidence": X.XX
    }
  ],
  "overall_reasoning": "Resume global de l'evaluation"
}`;
}

/**
 * Extract JSON from LLM response (handles markdown code blocks)
 */
function extractJsonFromResponse(response: string): string | null {
  // Try markdown code block first
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? jsonMatch[0] : null;
}

/**
 * Parse LLM response into structured result using Zod validation
 */
export function parseGEvalResponse(response: string): GEvalSingleResponse | null {
  try {
    const jsonStr = extractJsonFromResponse(response);
    if (!jsonStr) {
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    // Validate with Zod schema - handles type coercion and range checking
    const result = GEvalSingleResponseSchema.safeParse(parsed);

    if (!result.success) {
      // Log validation errors in development
      if (process.env.NODE_ENV === 'development') {
        console.warn('[G-Eval] Validation failed:', result.error.flatten());
      }
      return null;
    }

    return result.data;
  } catch (e) {
    // Log parse errors in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('[G-Eval] JSON parse failed:', e);
    }
    return null;
  }
}

/**
 * Parse batch evaluation response using Zod validation
 */
export function parseBatchGEvalResponse(
  response: string
): GEvalBatchResponse['evaluations'] | null {
  try {
    const jsonStr = extractJsonFromResponse(response);
    if (!jsonStr) {
      return null;
    }

    const parsed = JSON.parse(jsonStr);

    // Validate with Zod schema
    const result = GEvalBatchResponseSchema.safeParse(parsed);

    if (!result.success) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[G-Eval] Batch validation failed:', result.error.flatten());
      }
      return null;
    }

    return result.data.evaluations;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[G-Eval] Batch JSON parse failed:', e);
    }
    return null;
  }
}

// Export schemas for external use
export { GEvalSingleResponseSchema, GEvalBatchResponseSchema };

export default {
  GEVAL_SYSTEM_PROMPT,
  buildCriterionPrompt,
  buildBatchEvaluationPrompt,
  parseGEvalResponse,
  parseBatchGEvalResponse,
  // Schemas
  GEvalSingleResponseSchema,
  GEvalBatchResponseSchema,
};
