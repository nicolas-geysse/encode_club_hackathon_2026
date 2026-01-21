/**
 * Response Evaluation
 *
 * Heuristic-based evaluation of chat responses for safety and quality.
 * Used both for response filtering and Opik feedback logging.
 */

import { HIGH_RISK_KEYWORDS, SAFE_KEYWORDS } from '../extraction/patterns';

export interface EvaluationResult {
  passed: boolean;
  score: number;
  issues: string[];
}

/**
 * Quick evaluation of chat response using heuristics
 * Non-blocking, returns null on error
 */
export async function runResponseEvaluation(
  response: string,
  _context: Record<string, unknown>
): Promise<EvaluationResult | null> {
  try {
    const responseLower = response.toLowerCase();

    // Check for high-risk keywords
    const foundHighRisk: string[] = [];
    for (const keyword of HIGH_RISK_KEYWORDS) {
      if (responseLower.includes(keyword.toLowerCase())) {
        foundHighRisk.push(keyword);
      }
    }

    // Check for safe keywords
    const foundSafe: string[] = [];
    for (const keyword of SAFE_KEYWORDS) {
      if (responseLower.includes(keyword.toLowerCase())) {
        foundSafe.push(keyword);
      }
    }

    // Calculate score
    const baseScore = 0.7; // Good base for onboarding chat
    const riskPenalty = foundHighRisk.length * 0.15;
    const safeBonus = Math.min(0.2, foundSafe.length * 0.05);
    const score = Math.max(0, Math.min(1, baseScore - riskPenalty + safeBonus));

    const issues: string[] = [];
    if (foundHighRisk.length > 0) {
      issues.push(`High-risk keywords found: ${foundHighRisk.join(', ')}`);
    }

    // Check response length
    if (response.length < 50) {
      issues.push('Response too short');
    } else if (response.length > 1000) {
      issues.push('Response too long');
    }

    return {
      passed: score >= 0.6 && foundHighRisk.length === 0,
      score: Math.round(score * 100) / 100,
      issues,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if response contains high-risk keywords
 */
export function hasHighRiskContent(text: string): boolean {
  const lower = text.toLowerCase();
  return HIGH_RISK_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/**
 * Check if response contains safe/encouraged keywords
 */
export function hasSafeContent(text: string): boolean {
  const lower = text.toLowerCase();
  return SAFE_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/**
 * Calculate a simple quality score for text
 */
export function calculateQualityScore(text: string): number {
  let score = 0.5; // Base score

  // Length checks
  if (text.length >= 50 && text.length <= 500) {
    score += 0.2;
  }

  // Has structure (sentences, questions)
  if (text.includes('.') || text.includes('?')) {
    score += 0.1;
  }

  // Risk content penalty
  if (hasHighRiskContent(text)) {
    score -= 0.3;
  }

  // Safe content bonus
  if (hasSafeContent(text)) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}
