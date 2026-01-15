/**
 * Readability Heuristic
 *
 * Calculates Flesch-Kincaid readability score.
 * Target for students: grade level 8-12 (accessible but not dumbed down).
 */

import type { HeuristicResult } from '../types.js';

interface ReadabilityAnalysis {
  fleschKincaidGrade: number;
  fleschReadingEase: number;
  sentenceCount: number;
  wordCount: number;
  syllableCount: number;
  averageWordsPerSentence: number;
  averageSyllablesPerWord: number;
}

/**
 * Count syllables in a French word (approximation)
 */
function countSyllables(word: string): number {
  const vowels = /[aeiouyàâäéèêëïîôùûü]/gi;
  const wordLower = word.toLowerCase();

  // Count vowel groups
  const matches = wordLower.match(vowels);
  if (!matches) return 1;

  let count = 0;
  let previousWasVowel = false;

  for (const char of wordLower) {
    const isVowel = /[aeiouyàâäéèêëïîôùûü]/.test(char);
    if (isVowel && !previousWasVowel) {
      count++;
    }
    previousWasVowel = isVowel;
  }

  // Silent 'e' at end of French words
  if (wordLower.endsWith('e') && count > 1) {
    count--;
  }

  return Math.max(1, count);
}

/**
 * Split text into sentences
 */
function countSentences(text: string): number {
  // Match sentence endings: . ? ! (with optional quotes/parentheses)
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(1, sentences.length);
}

/**
 * Split text into words
 */
function getWords(text: string): string[] {
  return text
    .replace(/[^\w\sàâäéèêëïîôùûüç'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Calculate Flesch-Kincaid metrics
 */
function analyzeReadability(text: string): ReadabilityAnalysis {
  const sentences = countSentences(text);
  const words = getWords(text);
  const wordCount = words.length;
  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const averageWordsPerSentence = wordCount / sentences;
  const averageSyllablesPerWord = syllableCount / Math.max(1, wordCount);

  // Flesch-Kincaid Grade Level (adapted for French)
  // Original: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
  const fleschKincaidGrade =
    0.39 * averageWordsPerSentence + 11.8 * averageSyllablesPerWord - 15.59;

  // Flesch Reading Ease (adapted for French)
  // Original: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const fleschReadingEase =
    206.835 - 1.015 * averageWordsPerSentence - 84.6 * averageSyllablesPerWord;

  return {
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
    fleschReadingEase: Math.round(fleschReadingEase * 10) / 10,
    sentenceCount: sentences,
    wordCount,
    syllableCount,
    averageWordsPerSentence: Math.round(averageWordsPerSentence * 10) / 10,
    averageSyllablesPerWord: Math.round(averageSyllablesPerWord * 100) / 100,
  };
}

/**
 * Run readability heuristic
 */
export function checkReadability(
  text: string,
  targetGradeMin = 8,
  targetGradeMax = 12
): HeuristicResult {
  const analysis = analyzeReadability(text);

  // Score based on grade level
  // Perfect score if grade is in target range
  // Penalty for being too complex or too simple
  let score: number;
  let message: string;

  const grade = analysis.fleschKincaidGrade;

  if (grade >= targetGradeMin && grade <= targetGradeMax) {
    score = 1.0;
    message = `Niveau de lecture adapte (grade ${grade})`;
  } else if (grade < targetGradeMin) {
    // Too simple
    const diff = targetGradeMin - grade;
    score = Math.max(0.5, 1 - diff * 0.1);
    message = `Texte peut-etre trop simple (grade ${grade}, cible ${targetGradeMin}-${targetGradeMax})`;
  } else {
    // Too complex
    const diff = grade - targetGradeMax;
    score = Math.max(0.3, 1 - diff * 0.15);
    message = `Texte trop complexe (grade ${grade}, cible ${targetGradeMin}-${targetGradeMax})`;
  }

  // Also check reading ease (0-100, higher = easier)
  // Students should have 50-70 range
  const readingEase = analysis.fleschReadingEase;
  if (readingEase < 30) {
    score *= 0.8; // Very difficult
    message += '; texte tres difficile a lire';
  } else if (readingEase > 80) {
    score *= 0.9; // Very easy, might be too simple
  }

  const passed = score >= 0.7;

  return {
    name: 'readability',
    passed,
    score,
    isCritical: false, // Readability is not a veto condition
    details: {
      fleschKincaidGrade: analysis.fleschKincaidGrade,
      fleschReadingEase: analysis.fleschReadingEase,
      targetRange: { min: targetGradeMin, max: targetGradeMax },
      stats: {
        sentences: analysis.sentenceCount,
        words: analysis.wordCount,
        syllables: analysis.syllableCount,
        avgWordsPerSentence: analysis.averageWordsPerSentence,
        avgSyllablesPerWord: analysis.averageSyllablesPerWord,
      },
    },
    message,
  };
}

export default { checkReadability };
