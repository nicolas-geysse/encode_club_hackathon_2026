/**
 * Tone Heuristic
 *
 * Analyzes sentiment and tone of recommendations.
 * Ensures advice is encouraging but not overly optimistic.
 */

import type { HeuristicResult, EvaluationContext } from '../types.js';

interface ToneAnalysis {
  sentiment: number; // -1 (negative) to 1 (positive)
  isOverlyOptimistic: boolean;
  isOverlyPessimistic: boolean;
  hasAggressiveTone: boolean;
  urgencyLevel: number; // 0-1
  reassuranceLevel: number; // 0-1
}

// Positive sentiment words (French financial context)
const POSITIVE_WORDS = [
  'super',
  'excellent',
  'parfait',
  'genial',
  'bravo',
  'felicitations',
  'reussir',
  'succes',
  'opportunite',
  'ameliorer',
  'progres',
  'economiser',
  'epargner',
  'confortable',
  'securise',
  'stable',
];

// Negative sentiment words
const NEGATIVE_WORDS = [
  'impossible',
  'echec',
  'catastrophe',
  'danger',
  'erreur',
  'probleme',
  'risque',
  'dette',
  'deficit',
  'difficulte',
  'attention',
  'urgent',
  'critique',
];

// Overly optimistic phrases
const OVERLY_OPTIMISTIC = [
  'garanti',
  'sur a 100%',
  'sans aucun doute',
  'certainement',
  'tu vas devenir riche',
  'facile',
  'sans effort',
  'revenus passifs',
  'liberte financiere rapide',
];

// Aggressive/pushy tone
const AGGRESSIVE_MARKERS = [
  'tu dois absolument',
  'il faut imperativement',
  'ne fais surtout pas',
  "c'est obligatoire",
  "tu n'as pas le choix",
  'arrete de',
];

// Urgency markers
const URGENCY_MARKERS = [
  'urgent',
  'maintenant',
  'immediatement',
  'tout de suite',
  'vite',
  'depeche',
  'derniere chance',
  "aujourd'hui",
];

// Reassurance markers
const REASSURANCE_MARKERS = [
  "ne t'inquiete pas",
  "c'est normal",
  'pas de panique',
  'on peut corriger',
  "c'est jouable",
  "c'est faisable",
  'tu peux y arriver',
  'petit a petit',
];

/**
 * Count occurrences of patterns in text
 */
function countPatterns(text: string, patterns: string[]): number {
  const textLower = text.toLowerCase();
  return patterns.filter((p) => textLower.includes(p.toLowerCase())).length;
}

/**
 * Analyze tone of text
 */
function analyzeTone(text: string): ToneAnalysis {
  // Calculate sentiment
  const positiveCount = countPatterns(text, POSITIVE_WORDS);
  const negativeCount = countPatterns(text, NEGATIVE_WORDS);
  const totalSentiment = positiveCount + negativeCount;
  const sentiment = totalSentiment > 0 ? (positiveCount - negativeCount) / totalSentiment : 0;

  // Check for problematic patterns
  const isOverlyOptimistic = countPatterns(text, OVERLY_OPTIMISTIC) >= 1;
  const isOverlyPessimistic = negativeCount >= 5 && positiveCount === 0;
  const hasAggressiveTone = countPatterns(text, AGGRESSIVE_MARKERS) >= 1;

  // Calculate urgency level
  const urgencyCount = countPatterns(text, URGENCY_MARKERS);
  const urgencyLevel = Math.min(1, urgencyCount * 0.3);

  // Calculate reassurance level
  const reassuranceCount = countPatterns(text, REASSURANCE_MARKERS);
  const reassuranceLevel = Math.min(1, reassuranceCount * 0.25);

  return {
    sentiment,
    isOverlyOptimistic,
    isOverlyPessimistic,
    hasAggressiveTone,
    urgencyLevel,
    reassuranceLevel,
  };
}

/**
 * Run tone heuristic
 */
export function checkTone(text: string, context?: EvaluationContext): HeuristicResult {
  const analysis = analyzeTone(text);

  const issues: string[] = [];
  let score = 1.0;

  // Check for overly optimistic tone
  if (analysis.isOverlyOptimistic) {
    score -= 0.3;
    issues.push('Ton trop optimiste (promesses non-realistes)');
  }

  // Check for overly pessimistic tone (bad for students in deficit)
  if (analysis.isOverlyPessimistic) {
    score -= 0.2;
    issues.push('Ton trop pessimiste (peut decourager)');
  }

  // Check for aggressive tone
  if (analysis.hasAggressiveTone) {
    score -= 0.25;
    issues.push('Ton agressif detecte');
  }

  // High urgency without reassurance is concerning
  if (analysis.urgencyLevel > 0.5 && analysis.reassuranceLevel < 0.2) {
    score -= 0.15;
    issues.push('Trop de pression sans reassurance');
  }

  // Context-aware adjustments
  if (context?.financialSituation === 'deficit') {
    // For students in deficit, we want some positivity but with reassurance
    if (analysis.sentiment < -0.3 && analysis.reassuranceLevel < 0.3) {
      score -= 0.1;
      issues.push('Manque de reassurance pour situation difficile');
    }
  }

  // Ideal sentiment is slightly positive (0.1 to 0.4)
  if (analysis.sentiment < -0.2) {
    score -= 0.1;
  } else if (analysis.sentiment > 0.6) {
    score -= 0.15; // Too positive can seem unrealistic
  }

  score = Math.max(0, Math.min(1, score));
  const passed = score >= 0.6;

  return {
    name: 'tone',
    passed,
    score,
    isCritical: false,
    details: {
      sentiment: Math.round(analysis.sentiment * 100) / 100,
      sentimentLabel:
        analysis.sentiment > 0.2 ? 'positif' : analysis.sentiment < -0.2 ? 'negatif' : 'neutre',
      isOverlyOptimistic: analysis.isOverlyOptimistic,
      isOverlyPessimistic: analysis.isOverlyPessimistic,
      hasAggressiveTone: analysis.hasAggressiveTone,
      urgencyLevel: Math.round(analysis.urgencyLevel * 100) / 100,
      reassuranceLevel: Math.round(analysis.reassuranceLevel * 100) / 100,
      issues,
    },
    message:
      issues.length === 0
        ? `Ton adapte (sentiment: ${analysis.sentiment > 0 ? 'positif' : analysis.sentiment < 0 ? 'negatif' : 'neutre'})`
        : `Problemes de ton: ${issues.join('; ')}`,
  };
}

export default { checkTone };
