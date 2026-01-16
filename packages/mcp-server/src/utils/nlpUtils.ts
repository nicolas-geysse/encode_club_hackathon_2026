/**
 * NLP Utilities (compromise)
 *
 * Natural Language Processing utilities using compromise.js
 * Provides stemming, entity extraction, and text analysis for English.
 */

import nlp from 'compromise';

// ============================================
// TYPES
// ============================================

export interface ExtractedEntities {
  people: string[];
  places: string[];
  organizations: string[];
  money: { value: number; text: string }[];
  numbers: number[];
  percentages: number[];
}

export interface TextAnalysis {
  wordCount: number;
  sentenceCount: number;
  averageWordsPerSentence: number;
  questions: string[];
  statements: string[];
}

export interface SentimentIndicators {
  hasNegation: boolean;
  positiveWords: string[];
  negativeWords: string[];
  intensifiers: string[];
}

// ============================================
// CORE NLP FUNCTIONS
// ============================================

/**
 * Parse text into a compromise document
 */
export function parse(text: string) {
  return nlp(text);
}

/**
 * Normalize text (lowercase, trim, normalize whitespace)
 */
export function normalizeText(text: string): string {
  return nlp(text).normalize().text();
}

/**
 * Get all terms with their root forms (lemmas)
 */
export function getLemmas(text: string): string[] {
  const doc = nlp(text);
  // Get normalized terms (lowercased, stripped)
  return doc.terms().out('array') as string[];
}

/**
 * Check if text contains any of the given terms (with stemming)
 * Much better than simple .includes() - handles variations
 */
export function containsAny(
  text: string,
  terms: readonly string[]
): { found: boolean; matches: string[] } {
  const doc = nlp(text);
  const matches: string[] = [];

  for (const term of terms) {
    // Use compromise's match which handles variations
    const found = doc.match(term);
    if (found.found) {
      matches.push(term);
    }
  }

  return { found: matches.length > 0, matches };
}

/**
 * Check if text contains term with negation (e.g., "not crypto", "no bitcoin")
 */
export function containsNegated(text: string, term: string): boolean {
  const doc = nlp(text);
  // Match patterns like "not X", "no X", "never X", "don't X"
  const negationPatterns = [
    `(not|no|never|don't|doesn't|won't|can't|shouldn't) .? ${term}`,
    `(without|avoid|against) .? ${term}`,
  ];

  for (const pattern of negationPatterns) {
    if (doc.match(pattern).found) {
      return true;
    }
  }

  return false;
}

// ============================================
// ENTITY EXTRACTION
// ============================================

/**
 * Extract named entities from text
 */
export function extractEntities(text: string): ExtractedEntities {
  const doc = nlp(text);

  // Extract people names
  const people = doc.people().out('array') as string[];

  // Extract places
  const places = doc.places().out('array') as string[];

  // Extract organizations
  const organizations = doc.organizations().out('array') as string[];

  // Extract money values
  const moneyMatches = doc.money().json() as Array<{ text: string }>;
  const money = moneyMatches.map((m) => {
    const numMatch = m.text.match(/[\d,.]+/);
    const value = numMatch ? parseFloat(numMatch[0].replace(',', '')) : 0;
    return { value, text: m.text };
  });

  // Extract numbers
  const numberMatches = doc.numbers().json() as Array<{ number: number }>;
  const numbers = numberMatches.map((n) => n.number).filter((n) => !isNaN(n));

  // Extract percentages
  const percentMatches = doc.match('#Percent').json() as Array<{ text: string }>;
  const percentages = percentMatches.map((p) => {
    const num = parseFloat(p.text.replace('%', ''));
    return isNaN(num) ? 0 : num;
  });

  return { people, places, organizations, money, numbers, percentages };
}

/**
 * Extract skills/topics mentioned in text
 */
export function extractTopics(text: string): string[] {
  const doc = nlp(text);

  // Get nouns that could be skills/topics
  const nouns = doc.nouns().out('array') as string[];

  // Filter out common words and keep potential skills
  const commonWords = new Set([
    'thing',
    'things',
    'way',
    'time',
    'year',
    'people',
    'money',
    'work',
  ]);

  return nouns.filter((noun) => !commonWords.has(noun.toLowerCase()) && noun.length > 2);
}

// ============================================
// TEXT ANALYSIS
// ============================================

/**
 * Analyze text structure
 */
export function analyzeText(text: string): TextAnalysis {
  const doc = nlp(text);

  const sentences = doc.sentences();
  const sentenceCount = sentences.length;
  const words = doc.terms();
  const wordCount = words.length;

  // Separate questions and statements
  const questions = sentences.if('#QuestionWord').out('array') as string[];
  const statements = sentences.ifNo('#QuestionWord').out('array') as string[];

  return {
    wordCount,
    sentenceCount,
    averageWordsPerSentence: sentenceCount > 0 ? wordCount / sentenceCount : 0,
    questions,
    statements,
  };
}

/**
 * Get sentiment indicators from text
 */
export function getSentimentIndicators(text: string): SentimentIndicators {
  const doc = nlp(text);

  // Check for negation
  const hasNegation = doc.match('(not|no|never|none|nothing|neither|nobody|nowhere)').found;

  // Positive words (simplified list - compromise doesn't have built-in sentiment)
  const positivePatterns = [
    'good',
    'great',
    'excellent',
    'amazing',
    'wonderful',
    'fantastic',
    'awesome',
    'perfect',
    'best',
    'love',
    'happy',
    'safe',
    'secure',
    'stable',
    'growth',
    'profit',
    'success',
    'save',
    'savings',
  ];

  const negativePatterns = [
    'bad',
    'terrible',
    'awful',
    'horrible',
    'worst',
    'hate',
    'risky',
    'dangerous',
    'volatile',
    'loss',
    'debt',
    'fail',
    'scam',
    'fraud',
    'crash',
    'bubble',
  ];

  const intensifiers = ['very', 'extremely', 'really', 'absolutely', 'totally', 'completely'];

  const positiveWords: string[] = [];
  const negativeWords: string[] = [];
  const foundIntensifiers: string[] = [];

  for (const word of positivePatterns) {
    if (doc.match(word).found) positiveWords.push(word);
  }

  for (const word of negativePatterns) {
    if (doc.match(word).found) negativeWords.push(word);
  }

  for (const word of intensifiers) {
    if (doc.match(word).found) foundIntensifiers.push(word);
  }

  return {
    hasNegation,
    positiveWords,
    negativeWords,
    intensifiers: foundIntensifiers,
  };
}

// ============================================
// RISK DETECTION (FINANCIAL)
// ============================================

/**
 * High-risk financial terms
 */
const HIGH_RISK_TERMS = [
  'crypto',
  'cryptocurrency',
  'bitcoin',
  'ethereum',
  'nft',
  'trading',
  'forex',
  'leverage',
  'margin',
  'gambling',
  'betting',
  'casino',
  'lottery',
  'mlm',
  'pyramid',
  'ponzi',
  'get rich quick',
  'guaranteed returns',
  'high yield',
];

/**
 * Safe financial terms
 */
const SAFE_TERMS = [
  'savings',
  'budget',
  'emergency fund',
  'diversify',
  'index fund',
  'compound interest',
  'dollar cost averaging',
  'retirement',
  'insurance',
];

/**
 * Analyze financial risk in text
 */
export function analyzeFinancialRisk(text: string): {
  riskLevel: 'low' | 'medium' | 'high';
  riskTerms: string[];
  safeTerms: string[];
  hasNegatedRisk: boolean;
} {
  const doc = nlp(text);

  const riskTerms: string[] = [];
  const safeTerms: string[] = [];
  let hasNegatedRisk = false;

  // Check for high-risk terms
  for (const term of HIGH_RISK_TERMS) {
    if (doc.match(term).found) {
      // Check if it's negated
      if (containsNegated(text, term)) {
        hasNegatedRisk = true;
      } else {
        riskTerms.push(term);
      }
    }
  }

  // Check for safe terms
  for (const term of SAFE_TERMS) {
    if (doc.match(term).found) {
      safeTerms.push(term);
    }
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (riskTerms.length >= 3) {
    riskLevel = 'high';
  } else if (riskTerms.length >= 1) {
    riskLevel = 'medium';
  }

  // Lower risk if terms are negated
  if (hasNegatedRisk && riskLevel !== 'low') {
    riskLevel = riskLevel === 'high' ? 'medium' : 'low';
  }

  return { riskLevel, riskTerms, safeTerms, hasNegatedRisk };
}

// ============================================
// SKILL MATCHING
// ============================================

/**
 * Skill synonyms for better matching
 */
const SKILL_SYNONYMS: Record<string, string[]> = {
  javascript: ['js', 'node', 'nodejs', 'node.js', 'react', 'vue', 'angular', 'typescript', 'ts'],
  python: ['py', 'django', 'flask', 'pandas', 'numpy'],
  java: ['spring', 'kotlin', 'android'],
  'web development': ['web dev', 'frontend', 'backend', 'fullstack', 'full stack', 'html', 'css'],
  'data science': ['data analysis', 'machine learning', 'ml', 'ai', 'analytics'],
  design: ['ui', 'ux', 'graphic design', 'figma', 'photoshop', 'illustrator'],
  writing: ['content writing', 'copywriting', 'blogging', 'technical writing'],
  tutoring: ['teaching', 'coaching', 'mentoring', 'lessons'],
};

/**
 * Match skills with fuzzy/synonym matching
 */
export function matchSkills(
  userSkills: string[],
  requiredSkills: string[]
): {
  matched: string[];
  partial: string[];
  missing: string[];
} {
  const matched: string[] = [];
  const partial: string[] = [];
  const missing: string[] = [];

  const userSkillsLower = userSkills.map((s) => s.toLowerCase());
  const userSkillsDoc = nlp(userSkills.join(' '));

  for (const required of requiredSkills) {
    const requiredLower = required.toLowerCase();

    // Direct match
    if (userSkillsLower.includes(requiredLower)) {
      matched.push(required);
      continue;
    }

    // Check synonyms
    let foundSynonym = false;
    for (const [canonical, synonyms] of Object.entries(SKILL_SYNONYMS)) {
      if (requiredLower === canonical || synonyms.includes(requiredLower)) {
        // Check if user has canonical or any synonym
        if (
          userSkillsLower.includes(canonical) ||
          synonyms.some((syn) => userSkillsLower.includes(syn))
        ) {
          matched.push(required);
          foundSynonym = true;
          break;
        }
      }
    }

    if (foundSynonym) continue;

    // Partial match using NLP
    if (userSkillsDoc.match(required).found) {
      partial.push(required);
    } else {
      missing.push(required);
    }
  }

  return { matched, partial, missing };
}

export default {
  parse,
  normalizeText,
  getLemmas,
  containsAny,
  containsNegated,
  extractEntities,
  extractTopics,
  analyzeText,
  getSentimentIndicators,
  analyzeFinancialRisk,
  matchSkills,
  HIGH_RISK_TERMS,
  SAFE_TERMS,
};
