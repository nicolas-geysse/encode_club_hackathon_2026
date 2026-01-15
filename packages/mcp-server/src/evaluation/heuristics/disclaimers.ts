/**
 * Disclaimers Heuristic
 *
 * Checks that risky recommendations include appropriate disclaimers.
 * Required when high-risk keywords are detected.
 */

import type { HeuristicResult } from '../types.js';
import { HIGH_RISK_KEYWORDS } from '../types.js';

// Expected disclaimer patterns for different risk types
const DISCLAIMER_PATTERNS = {
  investment: [
    'risque de perte',
    'capital non garanti',
    'peut fluctuer',
    'performance passee',
    'ne constitue pas un conseil',
  ],
  general: [
    'attention',
    'prudence',
    'selon ta situation',
    'consulte un conseiller',
    'informe-toi',
    'fais tes recherches',
  ],
  crypto: [
    'tres volatile',
    'risque eleve',
    'peut perdre toute valeur',
    'n\'investis que ce que tu peux perdre',
  ],
};

interface DisclaimerAnalysis {
  hasHighRiskContent: boolean;
  highRiskKeywordsFound: string[];
  disclaimersFound: string[];
  disclaimerCoverage: number; // 0-1, ratio of required disclaimers present
  missingDisclaimers: string[];
}

/**
 * Analyze text for disclaimers vs risk content
 */
function analyzeDisclaimers(text: string): DisclaimerAnalysis {
  const textLower = text.toLowerCase();

  // Find high-risk keywords
  const highRiskKeywordsFound: string[] = [];
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (textLower.includes(keyword.toLowerCase())) {
      highRiskKeywordsFound.push(keyword);
    }
  }

  const hasHighRiskContent = highRiskKeywordsFound.length > 0;

  // Find all disclaimers present
  const disclaimersFound: string[] = [];
  const allDisclaimers = [
    ...DISCLAIMER_PATTERNS.investment,
    ...DISCLAIMER_PATTERNS.general,
    ...DISCLAIMER_PATTERNS.crypto,
  ];

  for (const disclaimer of allDisclaimers) {
    if (textLower.includes(disclaimer.toLowerCase())) {
      disclaimersFound.push(disclaimer);
    }
  }

  // Determine required disclaimers based on content
  const requiredDisclaimers: string[] = [];

  if (hasHighRiskContent) {
    // Always need general disclaimers for risky content
    requiredDisclaimers.push(...DISCLAIMER_PATTERNS.general);

    // Check for specific high-risk categories
    const hasCryptoContent =
      highRiskKeywordsFound.some((k) =>
        ['crypto', 'bitcoin', 'ethereum', 'nft'].includes(k)
      );

    if (hasCryptoContent) {
      requiredDisclaimers.push(...DISCLAIMER_PATTERNS.crypto);
    }

    const hasInvestmentContent =
      highRiskKeywordsFound.some((k) =>
        ['trading', 'forex', 'options', 'investis tout'].includes(k)
      );

    if (hasInvestmentContent) {
      requiredDisclaimers.push(...DISCLAIMER_PATTERNS.investment);
    }
  }

  // Calculate coverage
  const missingDisclaimers: string[] = [];
  if (hasHighRiskContent) {
    // At minimum, need at least one general disclaimer
    const hasAnyGeneralDisclaimer = DISCLAIMER_PATTERNS.general.some((d) =>
      textLower.includes(d.toLowerCase())
    );

    if (!hasAnyGeneralDisclaimer) {
      missingDisclaimers.push('au moins un avertissement general');
    }

    // Check specific disclaimers
    for (const req of requiredDisclaimers) {
      if (!textLower.includes(req.toLowerCase())) {
        missingDisclaimers.push(req);
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
        message: 'Pas de contenu a risque, disclaimers non requis',
      },
      message: 'Contenu securise, pas de disclaimer requis',
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
    },
    message: passed
      ? `Disclaimers adequats (${analysis.disclaimersFound.length} trouves)`
      : `Disclaimers insuffisants: manque ${analysis.missingDisclaimers.slice(0, 3).join(', ')}`,
  };
}

export default { checkDisclaimers };
