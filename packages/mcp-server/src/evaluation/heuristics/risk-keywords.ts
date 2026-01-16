/**
 * Risk Keywords Heuristic
 *
 * Detects high-risk financial keywords and safe keywords.
 * Uses compromise NLP for better matching (stemming, negation detection).
 * Critical failures (multiple high-risk without disclaimers) trigger veto.
 */

import type { HeuristicResult, EvaluationContext } from '../types.js';
import { HIGH_RISK_KEYWORDS, SAFE_KEYWORDS } from '../types.js';
import { analyzeFinancialRisk, containsNegated, containsAny } from '../../utils/nlpUtils.js';

interface KeywordAnalysis {
  highRiskFound: string[];
  safeFound: string[];
  negatedRiskTerms: string[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Analyze text for risk keywords using NLP
 * Uses compromise for stemming and negation detection
 */
function analyzeKeywords(text: string): KeywordAnalysis {
  // Use NLP-based risk analysis
  const nlpAnalysis = analyzeFinancialRisk(text);

  // Also check against the original keyword lists for backward compatibility
  const highRiskResult = containsAny(text, HIGH_RISK_KEYWORDS);
  const safeResult = containsAny(text, SAFE_KEYWORDS);

  // Combine NLP results with keyword matching
  const highRiskFound = [...new Set([...nlpAnalysis.riskTerms, ...highRiskResult.matches])];
  const safeFound = [...new Set([...nlpAnalysis.safeTerms, ...safeResult.matches])];

  // Track negated risk terms (mentioned but warned against)
  const negatedRiskTerms: string[] = [];
  for (const term of highRiskFound) {
    if (containsNegated(text, term)) {
      negatedRiskTerms.push(term);
    }
  }

  // Filter out negated terms from high risk (they're warnings, not recommendations)
  const actualHighRisk = highRiskFound.filter((term) => !negatedRiskTerms.includes(term));

  // Calculate risk score (0 = safe, 1 = very risky)
  const baseRiskScore = actualHighRisk.length * 0.3;
  const safeBonus = safeFound.length * -0.1;
  const negationBonus = negatedRiskTerms.length * -0.05; // Slight bonus for warning about risks
  const riskScore = Math.max(0, Math.min(1, 0.3 + baseRiskScore + safeBonus + negationBonus));

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore < 0.2) {
    riskLevel = 'low';
  } else if (riskScore < 0.4) {
    riskLevel = 'medium';
  } else if (riskScore < 0.7) {
    riskLevel = 'high';
  } else {
    riskLevel = 'critical';
  }

  return {
    highRiskFound: actualHighRisk,
    safeFound,
    negatedRiskTerms,
    riskScore,
    riskLevel,
  };
}

/**
 * Run risk keywords heuristic
 */
export function checkRiskKeywords(text: string, context?: EvaluationContext): HeuristicResult {
  const analysis = analyzeKeywords(text);
  let { riskScore } = analysis;

  const issues: string[] = [];
  const warnings: string[] = [];

  // Adjust score based on context
  if (context?.financialSituation === 'deficit') {
    if (analysis.highRiskFound.length > 0) {
      riskScore += 0.2;
      issues.push('Risky recommendation for student in deficit');
    }
  }

  if (context?.hasLoan) {
    // Use NLP to check for loan-related content
    const hasLoanContent = containsAny(text, ['borrow', 'loan', 'credit', 'debt']).found;
    if (hasLoanContent) {
      riskScore += 0.15;
      warnings.push('Warning: student already has a loan');
    }
  }

  // Clamp risk score
  riskScore = Math.max(0, Math.min(1, riskScore));

  if (analysis.highRiskFound.length > 0) {
    issues.push(`Risk keywords found: ${analysis.highRiskFound.join(', ')}`);
  }

  if (analysis.negatedRiskTerms.length > 0) {
    // Add positive note for warning about risks
    warnings.push(`Good: warned against ${analysis.negatedRiskTerms.join(', ')}`);
  }

  // Determine if this is critical (veto-worthy)
  // Critical if: multiple high-risk keywords OR critical risk level
  const isCritical = analysis.highRiskFound.length >= 2 || analysis.riskLevel === 'critical';
  const passed = riskScore < 0.5;

  return {
    name: 'risk_keywords',
    passed,
    score: 1 - riskScore, // Invert: high score = low risk
    isCritical,
    details: {
      highRiskFound: analysis.highRiskFound,
      safeFound: analysis.safeFound,
      negatedRiskTerms: analysis.negatedRiskTerms,
      riskLevel: analysis.riskLevel,
      rawRiskScore: analysis.riskScore,
      adjustedRiskScore: riskScore,
      contextAdjustments: {
        financialSituation: context?.financialSituation,
        hasLoan: context?.hasLoan,
      },
      issues,
      warnings,
    },
    message: passed
      ? analysis.safeFound.length > 0
        ? `Safe content (${analysis.safeFound.slice(0, 3).join(', ')})`
        : 'No risk keywords detected'
      : `Risk level ${analysis.riskLevel}: ${issues.join('; ')}`,
  };
}

export default { checkRiskKeywords };
