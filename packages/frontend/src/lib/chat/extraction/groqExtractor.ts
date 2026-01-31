/**
 * Groq LLM Extractor
 *
 * Handles LLM-based extraction using Groq with JSON mode.
 * Uses prompts from ../prompts and falls back to regex extraction.
 */

import Groq from 'groq-sdk';
import type { ProfileData, TokenUsage } from '../types';
import { GROQ_EXTRACTION_SYSTEM_PROMPT, EXTRACTION_STEP_CONTEXT } from '../prompts';
import { detectCurrencyFromCity } from './patterns';
import {
  getReferenceDate,
  calculateRelativeDateFromReference,
  type TimeContext,
} from '../../timeAwareDate';

// =============================================================================
// Groq Client Management
// =============================================================================

let groqClient: Groq | null = null;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

/**
 * Groq pricing per 1M tokens (as of 2026)
 * @see https://console.groq.com/docs/models
 */
const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.2-90b-vision-preview': { input: 0.9, output: 0.9 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  default: { input: 0.15, output: 0.6 },
};

/**
 * Get or create Groq client singleton
 */
export function getGroqClient(): Groq | null {
  if (!groqClient && process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Get the current Groq model being used
 */
export function getGroqModel(): string {
  return GROQ_MODEL;
}

/**
 * Calculate estimated cost based on token usage
 */
export function calculateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = GROQ_PRICING[model] || GROQ_PRICING['default'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// =============================================================================
// Date Parsing Utilities
// =============================================================================

const ENGLISH_MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

const FRENCH_MONTH_NAMES = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/**
 * Convert goalDeadline string to YYYY-MM-DD format
 * Handles: "in 2 months", "dans 2 mois", "2 mois", "March 2026", "in 3 weeks", etc.
 *
 * @param deadline - The deadline string to normalize
 * @param timeContext - Optional time context for simulation support
 */
export function normalizeGoalDeadline(
  deadline: string | undefined,
  timeContext?: TimeContext
): string | undefined {
  if (!deadline) return undefined;

  const lower = deadline.toLowerCase().trim();

  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return deadline;
  }

  // Relative deadlines with prefix: "in 2 months", "within 3 weeks", "dans 2 mois", "d'ici 3 semaines"
  const relativeMatch = lower.match(
    /^(?:in|within|dans|d'ici)\s+(\d+)\s+(months?|mois|weeks?|semaines?|years?|ans?|days?|jours?)$/i
  );
  if (relativeMatch) {
    return calculateRelativeDateInternal(
      parseInt(relativeMatch[1], 10),
      relativeMatch[2],
      timeContext
    );
  }

  // Relative deadlines WITHOUT prefix: "2 mois", "3 weeks", "6 months"
  const shortRelativeMatch = lower.match(
    /^(\d+)\s+(months?|mois|weeks?|semaines?|years?|ans?|days?|jours?)$/i
  );
  if (shortRelativeMatch) {
    return calculateRelativeDateInternal(
      parseInt(shortRelativeMatch[1], 10),
      shortRelativeMatch[2],
      timeContext
    );
  }

  // Get reference date for comparisons (uses simulated date if provided)
  const refDate = getReferenceDate(timeContext);

  // Try English month names
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
    const monthIndex = ENGLISH_MONTH_NAMES.indexOf(monthMatch[1].toLowerCase());
    const yearMatch = deadline.match(/20\d{2}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : refDate.getFullYear();

    const targetDate = new Date(year, monthIndex + 1, 0);
    if (targetDate < refDate) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    return targetDate.toISOString().split('T')[0];
  }

  // Try French month names
  const frenchMonthMatch = lower.match(
    /\b(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\b/i
  );
  if (frenchMonthMatch) {
    let monthName = frenchMonthMatch[1].toLowerCase();
    // Normalize accented variants
    if (monthName === 'fevrier') monthName = 'février';
    if (monthName === 'aout') monthName = 'août';
    if (monthName === 'decembre') monthName = 'décembre';

    const monthIndex = FRENCH_MONTH_NAMES.indexOf(monthName);
    if (monthIndex >= 0) {
      const yearMatch = deadline.match(/20\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : refDate.getFullYear();

      const targetDate = new Date(year, monthIndex + 1, 0);
      if (targetDate < refDate) {
        targetDate.setFullYear(targetDate.getFullYear() + 1);
      }
      return targetDate.toISOString().split('T')[0];
    }
  }

  // Try to parse as date directly
  const parsed = new Date(deadline);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  // Couldn't parse, return undefined to avoid DB errors
  console.warn(`[GroqExtractor] Could not parse goalDeadline: "${deadline}"`);
  return undefined;
}

/**
 * Calculate a date relative to reference (uses simulated date if provided)
 */
function calculateRelativeDateInternal(
  amount: number,
  unit: string,
  timeContext?: TimeContext
): string {
  const unitLower = unit.toLowerCase();

  let normalizedUnit: 'days' | 'weeks' | 'months' | 'years' = 'days';
  if (unitLower.startsWith('month') || unitLower === 'mois') {
    normalizedUnit = 'months';
  } else if (unitLower.startsWith('week') || unitLower.startsWith('semaine')) {
    normalizedUnit = 'weeks';
  } else if (unitLower.startsWith('year') || unitLower.startsWith('an')) {
    normalizedUnit = 'years';
  } else if (unitLower.startsWith('day') || unitLower.startsWith('jour')) {
    normalizedUnit = 'days';
  }

  const targetDate = calculateRelativeDateFromReference(amount, normalizedUnit, timeContext);
  return targetDate.toISOString().split('T')[0];
}

// =============================================================================
// Extraction Result Type
// =============================================================================

export interface ExtractionResult {
  data: ProfileData;
  usage: TokenUsage;
}

// =============================================================================
// Groq Extraction
// =============================================================================

/**
 * Build the extraction prompt for a specific step
 */
function getExtractionPrompt(step: string, message: string, existing: ProfileData): string {
  const stepContext = EXTRACTION_STEP_CONTEXT[step] || 'Collecting profile information.';

  return `Current step: ${step}
Context: ${stepContext}

User message: "${message}"

Already collected: ${JSON.stringify(existing, null, 2)}

Extract the relevant information and return as JSON.`;
}

/**
 * Extract data using Groq JSON mode
 * Returns null if Groq is unavailable or extraction fails
 */
export async function extractWithGroq(
  message: string,
  step: string,
  existing: ProfileData,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[],
  workingMemory?: string[],
  timeContext?: TimeContext
): Promise<ExtractionResult | null> {
  // Skip extraction for 'complete' and 'lifestyle' steps - nothing meaningful to extract
  if (step === 'complete' || step === 'lifestyle') {
    return {
      data: {},
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0 },
    };
  }

  const client = getGroqClient();
  if (!client) {
    return null;
  }

  try {
    // Build messages array with history for context
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: GROQ_EXTRACTION_SYSTEM_PROMPT },
    ];

    // Inject Working Memory (Agent Scratchpad)
    if (workingMemory && workingMemory.length > 0) {
      messages.push({
        role: 'system',
        content: `KNOWN FACTS (Working Memory):\n- ${workingMemory.join('\n- ')}\n\n(Do not re-extract these unless changed.)`,
      });
    }

    // Add recent conversation history (last 2 turns = 4 messages) for context
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-4);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role,
          content: msg.content.substring(0, 200), // Truncate to save tokens
        });
      }
    }

    // Add the current extraction prompt
    messages.push({ role: 'user', content: getExtractionPrompt(step, message, existing) });

    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      temperature: 0.0, // Deterministic for reliable extraction
      max_tokens: 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const extracted = JSON.parse(content) as ProfileData;

    // Extract token usage from response
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const estimatedCost = calculateCost(GROQ_MODEL, promptTokens, completionTokens);

    // Clean extracted data
    const cleaned = cleanExtractedData(extracted);

    // Normalize goalDeadline to YYYY-MM-DD format (time-aware for simulation)
    if (cleaned.goalDeadline) {
      cleaned.goalDeadline = normalizeGoalDeadline(cleaned.goalDeadline, timeContext);
    }

    // Auto-detect currency from city if at greeting step and not already detected
    if (step === 'greeting' && cleaned.city && !cleaned.currency) {
      const detectedCurrency = detectCurrencyFromCity(cleaned.city);
      if (detectedCurrency) {
        cleaned.currency = detectedCurrency;
      }
    }

    return {
      data: cleaned,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost,
      },
    };
  } catch (error) {
    console.error('[GroqExtractor] Extraction failed:', error);
    return null;
  }
}

/**
 * Clean extracted data: filter out empty/null values and normalize
 */
function cleanExtractedData(extracted: ProfileData): ProfileData {
  const cleaned: ProfileData = {};

  for (const [key, value] of Object.entries(extracted)) {
    if (value !== null && value !== undefined && value !== '') {
      // Strip trailing punctuation from name
      if (key === 'name' && typeof value === 'string') {
        (cleaned as Record<string, unknown>)[key] = value
          .trim()
          .replace(/[!?.,:;]+$/, '')
          .trim();
      } else if (Array.isArray(value) && value.length === 0) {
        // Keep empty arrays for "none" responses
        (cleaned as Record<string, unknown>)[key] = value;
      } else if (!Array.isArray(value) || value.length > 0) {
        (cleaned as Record<string, unknown>)[key] = value;
      }
    }
  }

  return cleaned;
}
