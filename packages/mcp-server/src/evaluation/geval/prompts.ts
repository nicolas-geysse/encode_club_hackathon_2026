/**
 * G-Eval Prompts
 *
 * Prompt templates for LLM-as-Judge evaluation using Chain-of-Thought.
 */

import type { GEvalCriterion, EvaluationContext } from '../types.js';

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

  parts.push(`- Public cible: ${context.targetAudience === 'etudiant' ? 'Etudiant francais' : 'General'}`);

  if (context.financialSituation) {
    const situationMap: Record<string, string> = {
      deficit: 'En deficit (depenses > revenus)',
      serre: 'Budget serre (peu de marge)',
      equilibre: 'Budget equilibre',
      confortable: 'Budget confortable',
    };
    parts.push(`- Situation financiere: ${situationMap[context.financialSituation]}`);
  }

  if (context.hasLoan !== undefined) {
    parts.push(`- Pret etudiant: ${context.hasLoan ? 'Oui' : 'Non'}`);
  }

  if (context.yearsRemaining !== undefined) {
    parts.push(`- Annees d'etudes restantes: ${context.yearsRemaining}`);
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
    .map((c, i) => `${i + 1}. **${c.name}** (poids: ${c.weight * 100}%)
   ${c.description}

   Rubrique:
   ${c.rubric.split('\n').map(l => '   ' + l).join('\n')}`)
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
 * Parse LLM response into structured result
 */
export function parseGEvalResponse(response: string): {
  criterion?: string;
  reasoning: string;
  score: number;
  confidence: number;
} | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (
      typeof parsed.score !== 'number' ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.reasoning !== 'string'
    ) {
      return null;
    }

    // Normalize score to 1-5 range
    const score = Math.max(1, Math.min(5, Math.round(parsed.score)));
    const confidence = Math.max(0, Math.min(1, parsed.confidence));

    return {
      criterion: parsed.criterion,
      reasoning: parsed.reasoning,
      score,
      confidence,
    };
  } catch {
    return null;
  }
}

/**
 * Parse batch evaluation response
 */
export function parseBatchGEvalResponse(response: string): Array<{
  criterion: string;
  reasoning: string;
  score: number;
  confidence: number;
}> | null {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsed.evaluations)) {
      return null;
    }

    return parsed.evaluations.map((e: Record<string, unknown>) => ({
      criterion: String(e.criterion || ''),
      reasoning: String(e.reasoning || ''),
      score: Math.max(1, Math.min(5, Math.round(Number(e.score) || 3))),
      confidence: Math.max(0, Math.min(1, Number(e.confidence) || 0.5)),
    }));
  } catch {
    return null;
  }
}

export default {
  GEVAL_SYSTEM_PROMPT,
  buildCriterionPrompt,
  buildBatchEvaluationPrompt,
  parseGEvalResponse,
  parseBatchGEvalResponse,
};
