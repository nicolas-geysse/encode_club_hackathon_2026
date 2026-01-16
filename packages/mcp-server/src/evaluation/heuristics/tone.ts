/**
 * Tone Heuristic
 *
 * Analyzes sentiment and tone of recommendations using NLP.
 * Ensures advice is encouraging but not overly optimistic.
 * Uses compromise for better text analysis (stemming, pattern matching).
 */

import type { HeuristicResult, EvaluationContext } from '../types.js';
import { containsAny, getSentimentIndicators, analyzeText } from '../../utils/nlpUtils.js';

interface ToneAnalysis {
  sentiment: number; // -1 (negative) to 1 (positive)
  isOverlyOptimistic: boolean;
  isOverlyPessimistic: boolean;
  hasAggressiveTone: boolean;
  urgencyLevel: number; // 0-1
  reassuranceLevel: number; // 0-1
}

// Positive sentiment words (English financial context)
const POSITIVE_WORDS = [
  'great',
  'excellent',
  'perfect',
  'amazing',
  'congratulations',
  'succeed',
  'success',
  'opportunity',
  'improve',
  'progress',
  'save',
  'savings',
  'comfortable',
  'secure',
  'stable',
  'growth',
  'achieve',
  'accomplish',
];

// Negative sentiment words
const NEGATIVE_WORDS = [
  'impossible',
  'failure',
  'catastrophe',
  'danger',
  'error',
  'problem',
  'risk',
  'debt',
  'deficit',
  'difficulty',
  'warning',
  'urgent',
  'critical',
  'loss',
  'broke',
];

// Overly optimistic phrases
const OVERLY_OPTIMISTIC = [
  'guaranteed',
  '100% sure',
  'without a doubt',
  'certainly',
  'you will become rich',
  'easy money',
  'no effort',
  'passive income',
  'quick financial freedom',
  'get rich quick',
  'risk-free',
];

// Aggressive/pushy tone
const AGGRESSIVE_MARKERS = [
  'you must absolutely',
  'you have to',
  'do not ever',
  'it is mandatory',
  'you have no choice',
  'stop doing',
  'never do',
  'you need to immediately',
];

// Urgency markers
const URGENCY_MARKERS = [
  'urgent',
  'now',
  'immediately',
  'right away',
  'quickly',
  'hurry',
  'last chance',
  'today',
  'asap',
  'time-sensitive',
];

// Reassurance markers
const REASSURANCE_MARKERS = [
  "don't worry",
  "it's normal",
  'no panic',
  'we can fix',
  "it's doable",
  "it's achievable",
  'you can do it',
  'step by step',
  'take your time',
  "it's okay",
  'manageable',
];

/**
 * Analyze tone of text using NLP
 */
function analyzeTone(text: string): ToneAnalysis {
  // Use NLP-based sentiment indicators
  const sentimentIndicators = getSentimentIndicators(text);

  // Also check against our specific word lists using NLP matching
  const positiveResult = containsAny(text, POSITIVE_WORDS);
  const negativeResult = containsAny(text, NEGATIVE_WORDS);

  // Combine NLP sentiment with keyword matching
  const positiveCount = positiveResult.matches.length + sentimentIndicators.positiveWords.length;
  const negativeCount = negativeResult.matches.length + sentimentIndicators.negativeWords.length;

  // Calculate sentiment score
  const totalSentiment = positiveCount + negativeCount;
  let sentiment = totalSentiment > 0 ? (positiveCount - negativeCount) / totalSentiment : 0;

  // Adjust for negation
  if (sentimentIndicators.hasNegation) {
    // Negation can flip sentiment context
    sentiment *= 0.7; // Dampen sentiment when negation is present
  }

  // Check for problematic patterns using NLP
  const overlyOptimisticResult = containsAny(text, OVERLY_OPTIMISTIC);
  const isOverlyOptimistic = overlyOptimisticResult.found;

  const isOverlyPessimistic = negativeCount >= 5 && positiveCount === 0;

  const aggressiveResult = containsAny(text, AGGRESSIVE_MARKERS);
  const hasAggressiveTone = aggressiveResult.found;

  // Calculate urgency level
  const urgencyResult = containsAny(text, URGENCY_MARKERS);
  const urgencyLevel = Math.min(1, urgencyResult.matches.length * 0.3);

  // Calculate reassurance level
  const reassuranceResult = containsAny(text, REASSURANCE_MARKERS);
  const reassuranceLevel = Math.min(1, reassuranceResult.matches.length * 0.25);

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
  const textAnalysis = analyzeText(text);

  const issues: string[] = [];
  let score = 1.0;

  // Check for overly optimistic tone
  if (analysis.isOverlyOptimistic) {
    score -= 0.3;
    issues.push('Overly optimistic tone (unrealistic promises)');
  }

  // Check for overly pessimistic tone (bad for students in deficit)
  if (analysis.isOverlyPessimistic) {
    score -= 0.2;
    issues.push('Overly pessimistic tone (may discourage)');
  }

  // Check for aggressive tone
  if (analysis.hasAggressiveTone) {
    score -= 0.25;
    issues.push('Aggressive tone detected');
  }

  // High urgency without reassurance is concerning
  if (analysis.urgencyLevel > 0.5 && analysis.reassuranceLevel < 0.2) {
    score -= 0.15;
    issues.push('Too much pressure without reassurance');
  }

  // Context-aware adjustments
  if (context?.financialSituation === 'deficit') {
    // For students in deficit, we want some positivity but with reassurance
    if (analysis.sentiment < -0.3 && analysis.reassuranceLevel < 0.3) {
      score -= 0.1;
      issues.push('Lacks reassurance for difficult situation');
    }
  }

  // Ideal sentiment is slightly positive (0.1 to 0.4)
  if (analysis.sentiment < -0.2) {
    score -= 0.1;
  } else if (analysis.sentiment > 0.6) {
    score -= 0.15; // Too positive can seem unrealistic
  }

  // Check text complexity (too many questions can seem pushy)
  if (textAnalysis.questions.length > 3) {
    score -= 0.05;
    issues.push('Too many questions');
  }

  score = Math.max(0, Math.min(1, score));
  const passed = score >= 0.6;

  const sentimentLabel =
    analysis.sentiment > 0.2 ? 'positive' : analysis.sentiment < -0.2 ? 'negative' : 'neutral';

  return {
    name: 'tone',
    passed,
    score,
    isCritical: false,
    details: {
      sentiment: Math.round(analysis.sentiment * 100) / 100,
      sentimentLabel,
      isOverlyOptimistic: analysis.isOverlyOptimistic,
      isOverlyPessimistic: analysis.isOverlyPessimistic,
      hasAggressiveTone: analysis.hasAggressiveTone,
      urgencyLevel: Math.round(analysis.urgencyLevel * 100) / 100,
      reassuranceLevel: Math.round(analysis.reassuranceLevel * 100) / 100,
      wordCount: textAnalysis.wordCount,
      questionCount: textAnalysis.questions.length,
      issues,
    },
    message:
      issues.length === 0
        ? `Appropriate tone (sentiment: ${sentimentLabel})`
        : `Tone issues: ${issues.join('; ')}`,
  };
}

export default { checkTone };
