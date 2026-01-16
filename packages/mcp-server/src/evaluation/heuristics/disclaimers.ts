/**
 * Disclaimers Heuristic
 *
 * Checks that risky recommendations include appropriate disclaimers.
 * Required when high-risk keywords are detected.
 * Uses compromise NLP for better pattern matching.
 */

import type { HeuristicResult } from '../types.js';
import { containsAny, analyzeFinancialRisk, containsNegated } from '../../utils/nlpUtils.js';

// Expected disclaimer patterns for different risk types
const DISCLAIMER_PATTERNS = {
  investment: [
    'risk of loss',
    'capital not guaranteed',
    'may fluctuate',
    'past performance',
    'not financial advice',
    'consult a professional',
    'do your own research',
  ],
  general: [
    'caution',
    'be careful',
    'depending on your situation',
    'consult an advisor',
    'inform yourself',
    'do your research',
    'at your own risk',
    'consider carefully',
  ],
  crypto: [
    'highly volatile',
    'high risk',
    'may lose all value',
    'only invest what you can afford to lose',
    'speculative',
    'not regulated',
  ],
};

interface DisclaimerAnalysis {
  hasHighRiskContent: boolean;
  highRiskKeywordsFound: string[];
  disclaimersFound: string[];
  disclaimerCoverage: number; // 0-1, ratio of required disclaimers present
  missingDisclaimers: string[];
  hasNegatedRisk: boolean;
}

/**
 * Analyze text for disclaimers vs risk content using NLP
 */
function analyzeDisclaimers(text: string): DisclaimerAnalysis {
  // Use NLP-based financial risk analysis
  const riskAnalysis = analyzeFinancialRisk(text);

  const hasHighRiskContent = riskAnalysis.riskTerms.length > 0;
  const highRiskKeywordsFound = riskAnalysis.riskTerms;

  // Find all disclaimers present using NLP matching
  const disclaimersFound: string[] = [];
  const allDisclaimers = [
    ...DISCLAIMER_PATTERNS.investment,
    ...DISCLAIMER_PATTERNS.general,
    ...DISCLAIMER_PATTERNS.crypto,
  ];

  for (const disclaimer of allDisclaimers) {
    const result = containsAny(text, [disclaimer]);
    if (result.found) {
      disclaimersFound.push(disclaimer);
    }
  }

  // Determine required disclaimers based on content
  const requiredDisclaimers: string[] = [];

  if (hasHighRiskContent) {
    // Always need general disclaimers for risky content
    requiredDisclaimers.push(...DISCLAIMER_PATTERNS.general);

    // Check for specific high-risk categories
    const cryptoTerms = ['crypto', 'bitcoin', 'ethereum', 'nft'];
    const hasCryptoContent = highRiskKeywordsFound.some((k) =>
      cryptoTerms.some((c) => k.toLowerCase().includes(c))
    );

    if (hasCryptoContent) {
      requiredDisclaimers.push(...DISCLAIMER_PATTERNS.crypto);
    }

    const investmentTerms = ['trading', 'forex', 'options', 'margin', 'leverage'];
    const hasInvestmentContent = highRiskKeywordsFound.some((k) =>
      investmentTerms.some((i) => k.toLowerCase().includes(i))
    );

    if (hasInvestmentContent) {
      requiredDisclaimers.push(...DISCLAIMER_PATTERNS.investment);
    }
  }

  // Calculate coverage
  const missingDisclaimers: string[] = [];
  if (hasHighRiskContent) {
    // At minimum, need at least one general disclaimer
    const generalResult = containsAny(text, DISCLAIMER_PATTERNS.general);
    const hasAnyGeneralDisclaimer = generalResult.found;

    if (!hasAnyGeneralDisclaimer) {
      missingDisclaimers.push('at least one general warning');
    }

    // Check specific disclaimers
    for (const req of requiredDisclaimers) {
      const result = containsAny(text, [req]);
      if (!result.found) {
        missingDisclaimers.push(req);
      }
    }
  }

  // Check if risk terms are negated (e.g., "don't invest in crypto")
  let hasNegatedRisk = riskAnalysis.hasNegatedRisk;
  if (!hasNegatedRisk && highRiskKeywordsFound.length > 0) {
    // Double-check with our negation detection
    for (const term of highRiskKeywordsFound) {
      if (containsNegated(text, term)) {
        hasNegatedRisk = true;
        break;
      }
    }
  }

  const disclaimerCoverage =
    hasHighRiskContent && requiredDisclaimers.length > 0
      ? disclaimersFound.length / requiredDisclaimers.length
      : 1.0;

  return {
    hasHighRiskContent,
    highRiskKeywordsFound,
    disclaimersFound,
    disclaimerCoverage: Math.min(1, disclaimerCoverage),
    missingDisclaimers: [...new Set(missingDisclaimers)].slice(0, 5),
    hasNegatedRisk,
  };
}

/**
 * Run disclaimers heuristic
 */
export function checkDisclaimers(text: string): HeuristicResult {
  const analysis = analyzeDisclaimers(text);

  // If no high-risk content, no disclaimers needed
  if (!analysis.hasHighRiskContent) {
    return {
      name: 'disclaimers',
      passed: true,
      score: 1.0,
      isCritical: false,
      details: {
        hasHighRiskContent: false,
        message: 'No risky content, disclaimers not required',
      },
      message: 'Safe content, no disclaimer required',
    };
  }

  // If risk terms are negated (warnings against risky behavior), that's good
  if (analysis.hasNegatedRisk) {
    // Give bonus for warning against risks
    const bonusScore = Math.min(1, 0.8 + analysis.disclaimersFound.length * 0.1);
    return {
      name: 'disclaimers',
      passed: true,
      score: bonusScore,
      isCritical: false,
      details: {
        hasHighRiskContent: true,
        highRiskKeywordsFound: analysis.highRiskKeywordsFound,
        disclaimersFound: analysis.disclaimersFound,
        hasNegatedRisk: true,
        message: 'Risk terms are negated (warning against risky behavior)',
      },
      message: `Good: warns against risky behavior`,
    };
  }

  // High-risk content requires disclaimers
  const hasMinimalDisclaimers = analysis.disclaimersFound.length >= 1;
  const hasGoodCoverage = analysis.disclaimerCoverage >= 0.5;

  let score = analysis.disclaimerCoverage;

  // Bonus for having multiple disclaimers
  if (analysis.disclaimersFound.length >= 3) {
    score = Math.min(1, score + 0.1);
  }

  // Penalty for having risky content with NO disclaimers
  if (analysis.disclaimersFound.length === 0) {
    score = 0.2;
  }

  const passed = hasMinimalDisclaimers && hasGoodCoverage;

  return {
    name: 'disclaimers',
    passed,
    score,
    isCritical: false, // Missing disclaimers is serious but not veto-worthy alone
    details: {
      hasHighRiskContent: true,
      highRiskKeywordsFound: analysis.highRiskKeywordsFound,
      disclaimersFound: analysis.disclaimersFound,
      missingDisclaimers: analysis.missingDisclaimers,
      disclaimerCoverage: Math.round(analysis.disclaimerCoverage * 100) / 100,
      hasNegatedRisk: analysis.hasNegatedRisk,
    },
    message: passed
      ? `Adequate disclaimers (${analysis.disclaimersFound.length} found)`
      : `Insufficient disclaimers: missing ${analysis.missingDisclaimers.slice(0, 3).join(', ')}`,
  };
}

export default { checkDisclaimers };
