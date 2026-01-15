/**
 * Risk Keywords Heuristic
 *
 * Detects high-risk financial keywords and safe keywords.
 * Critical failures (multiple high-risk without disclaimers) trigger veto.
 */

import type { HeuristicResult, EvaluationContext } from '../types.js';
import { HIGH_RISK_KEYWORDS, SAFE_KEYWORDS } from '../types.js';

interface KeywordAnalysis {
  highRiskFound: string[];
  safeFound: string[];
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Analyze text for risk keywords
 */
function analyzeKeywords(text: string): KeywordAnalysis {
  const textLower = text.toLowerCase();

  const highRiskFound: string[] = [];
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      highRiskFound.push(keyword);
    }
  }

  const safeFound: string[] = [];
  for (const keyword of SAFE_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      safeFound.push(keyword);
    }
  }

  // Calculate risk score (0 = safe, 1 = very risky)
  const baseRiskScore = highRiskFound.length * 0.3;
  const safeBonus = safeFound.length * -0.1;
  const riskScore = Math.max(0, Math.min(1, 0.3 + baseRiskScore + safeBonus));

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
    highRiskFound,
    safeFound,
    riskScore,
    riskLevel,
  };
}

/**
 * Run risk keywords heuristic
 */
export function checkRiskKeywords(
  text: string,
  context?: EvaluationContext
): HeuristicResult {
  const analysis = analyzeKeywords(text);
  let { riskScore } = analysis;

  const issues: string[] = [];
  const warnings: string[] = [];

  // Adjust score based on context
  if (context?.financialSituation === 'deficit') {
    if (analysis.highRiskFound.length > 0) {
      riskScore += 0.2;
      issues.push('Recommandation risquee pour un etudiant en deficit');
    }
  }

  if (context?.hasLoan) {
    const textLower = text.toLowerCase();
    if (textLower.includes('emprunte') || textLower.includes('credit')) {
      riskScore += 0.15;
      warnings.push('Attention: etudiant a deja un pret');
    }
  }

  // Clamp risk score
  riskScore = Math.max(0, Math.min(1, riskScore));

  if (analysis.highRiskFound.length > 0) {
    issues.push(`Mots-cles a risque: ${analysis.highRiskFound.join(', ')}`);
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
        ? `Contenu securise (${analysis.safeFound.slice(0, 3).join(', ')})`
        : 'Aucun mot-cle a risque detecte'
      : `Niveau de risque ${analysis.riskLevel}: ${issues.join('; ')}`,
  };
}

export default { checkRiskKeywords };
