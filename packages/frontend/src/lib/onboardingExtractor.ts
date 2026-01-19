/**
 * Onboarding Extractor (formerly mastraAgent.ts)
 *
 * Uses Groq SDK with JSON mode for reliable structured extraction from user messages.
 * Falls back to regex extraction if Groq fails.
 *
 * Note: Despite the misleading original filename, this module uses Groq directly
 * (not Mastra). The real Mastra agents are in /packages/mcp-server/src/agents/
 * but are not used by the frontend onboarding flow.
 *
 * Features:
 * - Groq JSON mode for structured profile data extraction
 * - Conversation history support for context-aware extraction
 * - Agentic tracing with Opik (child spans for LLM, tool, response)
 * - Regex fallback when Groq is unavailable
 */

import Groq from 'groq-sdk';
import { trace, type TraceOptions } from './opik';

// Groq client singleton
let groqClient: Groq | null = null;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

/**
 * Mapping from onboarding steps to the tabs they populate
 * This helps with tracing and debugging which tab each step feeds
 */
const STEP_TO_TAB: Record<string, string> = {
  greeting: 'profile',
  region: 'profile', // Currency/region selection
  name: 'profile',
  studies: 'profile',
  skills: 'skills',
  certifications: 'skills', // Certifications also feed the skills tab
  location: 'profile',
  budget: 'profile',
  work_preferences: 'profile',
  goal: 'setup',
  academic_events: 'setup',
  inventory: 'inventory',
  trade: 'trade', // Trade opportunities (borrow, lend, trade, sell, cut)
  lifestyle: 'lifestyle',
  complete: 'setup',
};

// Groq pricing per 1M tokens (as of 2026)
// See: https://console.groq.com/docs/models
const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI OSS models on Groq
  'openai/gpt-oss-120b': { input: 0.15, output: 0.6 },
  // Llama models
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.2-90b-vision-preview': { input: 0.9, output: 0.9 },
  // Mixtral
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  // Default fallback
  default: { input: 0.15, output: 0.6 },
};

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = GROQ_PRICING[model] || GROQ_PRICING['default'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

function getGroqClient(): Groq | null {
  if (!groqClient && process.env.GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

/**
 * Token usage information from Groq API
 */
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

// Re-export types for convenience
export interface AcademicEvent {
  name: string;
  type: 'exam' | 'vacation' | 'busy';
  startDate?: string;
  endDate?: string;
  duration?: string; // "1 day", "1 week", "3 hours", etc.
  difficulty?: 1 | 2 | 3 | 4 | 5; // 1=easy, 5=very hard (for exams)
}

export interface InventoryItem {
  name: string;
  category: string;
  estimatedValue?: number;
}

export interface Subscription {
  name: string;
  currentCost: number;
}

export interface TradeOpportunity {
  type: 'borrow' | 'lend' | 'trade' | 'sell' | 'cut';
  description: string;
  withPerson?: string; // e.g., "Alex" for "borrow from Alex"
  forWhat?: string; // e.g., "web design" for "trade tutoring for web design"
  estimatedValue?: number;
}

export interface ProfileData {
  name?: string;
  diploma?: string;
  field?: string;
  city?: string;
  currency?: 'USD' | 'EUR' | 'GBP'; // User's preferred currency based on region
  skills?: string[];
  certifications?: string[]; // Certification codes like 'BAFA', 'PSC1', 'TEFL'
  income?: number;
  expenses?: number;
  maxWorkHours?: number;
  minHourlyRate?: number;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: AcademicEvent[];
  inventoryItems?: InventoryItem[];
  tradeOpportunities?: TradeOpportunity[];
  subscriptions?: Subscription[];
  missingInfo?: string[]; // Fields that need clarification (e.g., ["field of study"])
}

export interface OnboardingInput {
  message: string;
  currentStep: string;
  existingProfile: ProfileData;
  /** Thread ID for grouping related traces in Opik */
  threadId?: string;
  /** Recent conversation history for context (last 2 turns = 4 messages) */
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

export interface OnboardingOutput {
  response: string;
  extractedData: ProfileData;
  nextStep: string;
  isComplete: boolean;
  profileData: ProfileData;
  /** Actual source used: 'groq' if Groq JSON mode worked, 'fallback' if regex extraction */
  source: 'groq' | 'fallback';
}

/**
 * System prompts for extraction
 */
const EXTRACTION_SYSTEM_PROMPT = `You are an extraction assistant. Extract profile information from user messages.
Return ONLY a JSON object with the extracted fields. Only include fields that are clearly mentioned.

Available fields:
- currency: "USD", "EUR", or "GBP" based on user's region/country
  Extract from: "US", "America", "dollar" → "USD"
                "UK", "Britain", "pound", "£" → "GBP"
                "Europe", "France", "Germany", "euro", "€" → "EUR"
- name: first name (string)
- diploma: study level like "Master", "Bachelor", "PhD", "Freshman" (string)
- field: field of study like "Computer Science", "Law" (string)
  IMPORTANT: If user gives diploma level without field (e.g., "Master 1"), extract the diploma and add "field of study" to missingInfo array
- missingInfo: array of strings listing important missing information (e.g., ["field of study"])
- city: city name (string)
- skills: list of skills (array of strings)
- certifications: professional certification codes (array of strings)
- income: monthly income in dollars/euros (number)
- expenses: monthly expenses (number)
- maxWorkHours: max hours per week for work (number)
- minHourlyRate: minimum hourly rate (number)
- goalName: what they're saving for (string)
- goalAmount: target savings amount (number)
- goalDeadline: when they want to reach the goal (string)
- academicEvents: array of {name, type, startDate?, duration?, difficulty?} for exams/vacations
  Extract relative dates when mentioned: "exam next week" → calculate startDate from today
  Extract duration if mentioned: "for 3 hours", "1 day exam", "week-long vacation" → duration: "3 hours", "1 day", "1 week"
  For exams, extract difficulty if mentioned: "easy exam", "very hard final" → difficulty: 1-5 (1=easy, 5=very hard)
- inventoryItems: array of {name, category, estimatedValue?} for items to sell
  IMPORTANT: Always extract the monetary value if mentioned. Examples:
  "laptop 1000€" → { name: "laptop", estimatedValue: 1000 }
  "phone worth $500" → { name: "phone", estimatedValue: 500 }
  "old books" → { name: "old books" } (no value = user will estimate later)
- subscriptions: array of {name, currentCost} for subscriptions

Be generous with extraction. Accept common variations:
- "Master's in CS" → diploma: "Master", field: "Computer Science"
- "I'm Nicolas" or "Nicolas" → name: "Nicolas"
- "Paris" or "I live in Paris" → city: "Paris"
- "Python, JavaScript" or "I know Python and JS" → skills: ["Python", "JavaScript"]
- "none" or "nothing" for optional fields → empty array []

IMPORTANT: Remove trailing punctuation (!?.,-;:) from names.
Example: "Kiki !" → name: "Kiki"

Common certifications to recognize:
- France: BAFA, BNSSA, PSC1, SST
- UK: DBS (check), Paediatric First Aid, NPLQ
- US: CPR/First Aid, Lifeguard, Food Handler
- International: PADI (diving), SSI, TEFL/TESOL

IMPORTANT: Netflix, Spotify, Amazon are subscriptions, NOT names.`;

/**
 * Get the extraction prompt for a specific step
 */
function getExtractionPrompt(step: string, message: string, existing: ProfileData): string {
  // Tell the model what we're looking for based on the current step
  const stepContext: Record<string, string> = {
    greeting:
      'We are asking for their REGION/CURRENCY (US, UK, or Europe). Extract currency: USD, EUR, or GBP.',
    region: 'We are asking for their NAME.',
    name: 'We are asking about their STUDIES (diploma level and field).',
    studies: 'We are asking about their SKILLS (programming, languages, tutoring, etc.).',
    skills:
      'We are asking about their CERTIFICATIONS (BAFA, lifeguard, CPR, TEFL, etc.). "none" means empty array.',
    certifications: 'We are asking about their CITY of residence.',
    location: 'We are asking about their BUDGET (monthly income and expenses).',
    budget: 'We are asking about WORK PREFERENCES (max hours per week, minimum hourly rate).',
    work_preferences: 'We are asking about their SAVINGS GOAL (what, how much, deadline).',
    goal: 'We are asking about ACADEMIC EVENTS (exams, vacations, busy periods). "none" means empty array.',
    academic_events: 'We are asking about INVENTORY items to sell. "none" means empty array.',
    inventory:
      'We are asking about SUBSCRIPTIONS (Netflix, Spotify, gym, etc.). "none" means empty array.',
    lifestyle: 'Profile is almost complete. Accept any acknowledgment.',
  };

  return `Current step: ${step}
Context: ${stepContext[step] || 'Collecting profile information.'}

User message: "${message}"

Already collected: ${JSON.stringify(existing, null, 2)}

Extract the relevant information and return as JSON.`;
}

/**
 * Extraction result with token usage
 */
interface ExtractionResult {
  data: ProfileData;
  usage: TokenUsage;
}

/**
 * Convert goalDeadline string to YYYY-MM-DD format
 * Handles: "in 2 months", "dans 2 mois", "2 mois", "March 2026", "in 3 weeks", etc.
 */
function normalizeGoalDeadline(deadline: string | undefined): string | undefined {
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
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const targetDate = new Date();

    if (unit.startsWith('month') || unit === 'mois') {
      targetDate.setMonth(targetDate.getMonth() + amount);
    } else if (unit.startsWith('week') || unit.startsWith('semaine')) {
      targetDate.setDate(targetDate.getDate() + amount * 7);
    } else if (unit.startsWith('year') || unit.startsWith('an')) {
      targetDate.setFullYear(targetDate.getFullYear() + amount);
    } else if (unit.startsWith('day') || unit.startsWith('jour')) {
      targetDate.setDate(targetDate.getDate() + amount);
    }

    return targetDate.toISOString().split('T')[0];
  }

  // Relative deadlines WITHOUT prefix: "2 mois", "3 weeks", "6 months"
  // This handles cases where user says "vacation €1000 dans 2 mois" and LLM extracts just "2 mois"
  const shortRelativeMatch = lower.match(
    /^(\d+)\s+(months?|mois|weeks?|semaines?|years?|ans?|days?|jours?)$/i
  );
  if (shortRelativeMatch) {
    const amount = parseInt(shortRelativeMatch[1], 10);
    const unit = shortRelativeMatch[2].toLowerCase();
    const targetDate = new Date();

    if (unit.startsWith('month') || unit === 'mois') {
      targetDate.setMonth(targetDate.getMonth() + amount);
    } else if (unit.startsWith('week') || unit.startsWith('semaine')) {
      targetDate.setDate(targetDate.getDate() + amount * 7);
    } else if (unit.startsWith('year') || unit.startsWith('an')) {
      targetDate.setFullYear(targetDate.getFullYear() + amount);
    } else if (unit.startsWith('day') || unit.startsWith('jour')) {
      targetDate.setDate(targetDate.getDate() + amount);
    }

    return targetDate.toISOString().split('T')[0];
  }

  // Month name + optional year: "March 2026", "June", "December 2025", "mars 2026", "juin"
  const monthNames = [
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
  const frenchMonthNames = [
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

  // Try English month names
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
    const monthIndex = monthNames.indexOf(monthMatch[1].toLowerCase());
    const yearMatch = deadline.match(/20\d{2}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

    // Create date for the last day of the target month
    const targetDate = new Date(year, monthIndex + 1, 0);
    // If the date is in the past, use next year
    if (targetDate < new Date()) {
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

    const monthIndex = frenchMonthNames.indexOf(monthName);
    if (monthIndex >= 0) {
      const yearMatch = deadline.match(/20\d{2}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

      const targetDate = new Date(year, monthIndex + 1, 0);
      if (targetDate < new Date()) {
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
  console.warn(`[MastraAgent] Could not parse goalDeadline: "${deadline}"`);
  return undefined;
}

/**
 * Extract data using Groq JSON mode
 * Now includes conversation history for better context awareness
 */
async function extractWithGroq(
  message: string,
  step: string,
  existing: ProfileData,
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
): Promise<ExtractionResult | null> {
  // Skip extraction for 'complete' and 'lifestyle' steps - nothing meaningful to extract
  // This avoids wasting tokens and the "max completion tokens reached" error
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
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    ];

    // Add recent conversation history (last 2 turns = 4 messages) for context
    // Reduced from 8 to 4 to save tokens and avoid "max completion tokens reached" error
    if (conversationHistory && conversationHistory.length > 0) {
      // Add a condensed version of recent history
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
      max_tokens: 1024, // Increased from 512 to avoid "max completion tokens reached" error
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const extracted = JSON.parse(content) as ProfileData;

    // Extract token usage from response
    const promptTokens = response.usage?.prompt_tokens || 0;
    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    const estimatedCost = calculateCost(GROQ_MODEL, promptTokens, completionTokens);

    // Filter out empty/null values
    const cleaned: ProfileData = {};
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== '') {
        // Strip trailing punctuation from name (fixes "Kiki !" becoming "Kiki")
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

    // Normalize goalDeadline to YYYY-MM-DD format
    if (cleaned.goalDeadline) {
      cleaned.goalDeadline = normalizeGoalDeadline(cleaned.goalDeadline);
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
    console.error('[Groq JSON] Extraction failed:', error);
    return null;
  }
}

/**
 * Process an onboarding message using Groq JSON mode
 * Falls back to regex extraction if Groq fails
 *
 * Trace hierarchy (for Opik agentic tracing):
 * - agent.onboarding (parent trace)
 *   ├── agent.llm_extraction (child span, type: llm)
 *   ├── agent.data_merge (child span, type: tool)
 *   └── agent.response_generation (child span, type: general)
 */
export async function processWithGroqExtractor(input: OnboardingInput): Promise<OnboardingOutput> {
  // Build trace options with input for Opik visibility
  // Include tab tag to show which tab this step feeds
  const targetTab = STEP_TO_TAB[input.currentStep] || 'unknown';
  const traceOptions: TraceOptions = {
    source: 'groq_json_mode',
    threadId: input.threadId, // Pass threadId for conversation grouping in Opik
    input: {
      message: input.message,
      currentStep: input.currentStep,
      existingProfile: input.existingProfile,
      historyLength: input.conversationHistory?.length || 0,
    },
    tags: ['onboarding', 'agent', input.currentStep, `tab:${targetTab}`],
  };

  return trace(
    'agent.onboarding',
    async (ctx) => {
      ctx.setAttributes({
        'agent.step': input.currentStep,
        'agent.message_length': input.message.length,
        'agent.has_history': (input.conversationHistory?.length || 0) > 0,
        'agent.target_tab': targetTab,
      });

      // Child span 1: LLM Extraction (type: llm)
      const extractionResult = await ctx.createChildSpan(
        'agent.llm_extraction',
        async (span) => {
          span.setAttributes({
            'extraction.step': input.currentStep,
            'extraction.message_preview': input.message.substring(0, 100),
            'extraction.history_length': input.conversationHistory?.length || 0,
          });

          // Try Groq JSON mode first (with conversation history for context)
          const groqResult = await extractWithGroq(
            input.message,
            input.currentStep,
            input.existingProfile,
            input.conversationHistory
          );

          if (groqResult && Object.keys(groqResult.data).length > 0) {
            // Groq succeeded with data
            span.setUsage({
              prompt_tokens: groqResult.usage.promptTokens,
              completion_tokens: groqResult.usage.completionTokens,
              total_tokens: groqResult.usage.totalTokens,
            });
            span.setCost(groqResult.usage.estimatedCost);
            span.setOutput({
              method: 'groq_json_mode',
              extracted_fields: Object.keys(groqResult.data).length,
              extracted_keys: Object.keys(groqResult.data).join(','),
            });
            return { data: groqResult.data, usage: groqResult.usage, source: 'groq' as const };
          } else if (groqResult) {
            // Groq returned but no data extracted - fall back to regex
            span.setUsage({
              prompt_tokens: groqResult.usage.promptTokens,
              completion_tokens: groqResult.usage.completionTokens,
              total_tokens: groqResult.usage.totalTokens,
            });
            span.setCost(groqResult.usage.estimatedCost);
            const regexData = extractWithRegex(
              input.message,
              input.currentStep,
              input.existingProfile
            );
            span.setOutput({
              method: 'regex_fallback',
              reason: 'groq_empty',
              extracted_fields: Object.keys(regexData).length,
            });
            return { data: regexData, usage: groqResult.usage, source: 'fallback' as const };
          } else {
            // Groq failed completely - use regex only
            const regexData = extractWithRegex(
              input.message,
              input.currentStep,
              input.existingProfile
            );
            span.setOutput({
              method: 'regex_fallback',
              reason: 'groq_failed',
              extracted_fields: Object.keys(regexData).length,
            });
            return { data: regexData, usage: null, source: 'fallback' as const };
          }
        },
        {
          type: 'llm',
          model: GROQ_MODEL,
          provider: 'groq',
          input: { message: input.message.substring(0, 200), step: input.currentStep },
        }
      );

      const extractedData = extractionResult.data;
      const tokenUsage = extractionResult.usage;
      const source = extractionResult.source;

      const hasExtracted = Object.keys(extractedData).length > 0;

      // Child span 2: Data Merge (type: tool)
      const { nextStep, mergedProfile } = await ctx.createChildSpan(
        'agent.data_merge',
        async (span) => {
          span.setAttributes({
            'merge.extracted_fields': Object.keys(extractedData).length,
            'merge.has_data': hasExtracted,
          });

          // Determine next step
          const nextStep = hasExtracted ? getNextStep(input.currentStep) : input.currentStep;
          const didAdvance = nextStep !== input.currentStep;

          // Merge profile data
          const mergedProfile = { ...input.existingProfile, ...extractedData };

          span.setOutput({
            next_step: nextStep,
            did_advance: didAdvance,
            merged_fields: Object.keys(mergedProfile).filter(
              (k) => mergedProfile[k as keyof ProfileData] !== undefined
            ).length,
          });

          return { nextStep, didAdvance, mergedProfile };
        },
        {
          type: 'tool',
          input: { extracted_keys: Object.keys(extractedData).join(',') },
        }
      );

      // Child span 3: Response Generation (type: general)
      const response = await ctx.createChildSpan(
        'agent.response_generation',
        async (span) => {
          span.setAttributes({
            'response.has_extracted': hasExtracted,
            'response.next_step': nextStep,
          });

          let response = hasExtracted
            ? getAdvanceMessage(nextStep, mergedProfile)
            : getClarificationMessage(input.currentStep);

          // Check for missing info and append clarifying question
          const missingInfo = extractedData.missingInfo as string[] | undefined;
          if (missingInfo && missingInfo.length > 0) {
            const missingText = missingInfo.join(' and ');
            response += `\n\nCould you also tell me your ${missingText}?`;
            span.setAttributes({ 'response.has_missing_info': true });
          }

          span.setOutput({
            response_length: response.length,
            response_preview: response.substring(0, 100),
          });

          return response;
        },
        { type: 'general' }
      );

      // Set parent trace attributes and output
      ctx.setAttributes({
        'agent.source': source,
        'agent.next_step': nextStep,
        'agent.extracted_fields': Object.keys(extractedData).length,
      });

      if (tokenUsage) {
        ctx.setUsage({
          prompt_tokens: tokenUsage.promptTokens,
          completion_tokens: tokenUsage.completionTokens,
          total_tokens: tokenUsage.totalTokens,
        });
        ctx.setCost(tokenUsage.estimatedCost);
      }

      const result: OnboardingOutput = {
        response,
        extractedData,
        nextStep,
        isComplete: nextStep === 'complete',
        profileData: mergedProfile,
        source,
      };

      // Set output for Opik UI
      ctx.setOutput({
        response: result.response.substring(0, 300),
        extractedData: result.extractedData,
        nextStep: result.nextStep,
        isComplete: result.isComplete,
        source: result.source,
        ...(tokenUsage && {
          usage: {
            prompt_tokens: tokenUsage.promptTokens,
            completion_tokens: tokenUsage.completionTokens,
            total_tokens: tokenUsage.totalTokens,
            estimated_cost_usd: tokenUsage.estimatedCost,
          },
        }),
      });

      return result;
    },
    traceOptions
  );
}

/**
 * Clarification messages for each step (fallback)
 *
 * When extraction fails, we stay on the same step and re-ask for the data we need.
 * Key = current step (what we're trying to collect AT this step)
 *
 * - At 'greeting': collecting REGION/CURRENCY
 * - At 'region': collecting NAME
 * - At 'name': collecting STUDIES
 * - At 'studies': collecting SKILLS
 * - etc.
 */
function getClarificationMessage(step: string): string {
  const clarifications: Record<string, string> = {
    // At greeting step, we're collecting REGION/CURRENCY
    greeting:
      'Just need to know your region! Are you in the US, UK, or Europe? (This helps me show amounts in your currency)',
    // At region step, we're collecting NAME
    region: "I didn't catch your name. What should I call you?",
    // At name step, we're collecting STUDIES (not name!)
    name: "I'd love to know about your studies! What's your education level and field?\n\nExamples: Bachelor 2nd year Computer Science, Master 1 Business, PhD Physics",
    // At studies step, we're collecting SKILLS
    studies: 'What skills do you have? (coding, languages, music, sports...)',
    // At skills step, we're collecting CERTIFICATIONS
    skills:
      "Do you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')",
    // At certifications step, we're collecting LOCATION
    certifications: 'Where do you live? Just tell me the city name.',
    // At location step, we're collecting BUDGET
    location: 'How much do you earn and spend per month? (two numbers, like "800 and 600")',
    // At budget step, we're collecting WORK PREFERENCES
    budget: "How many hours can you work per week? And what's your minimum hourly rate?",
    // At work_preferences step, we're collecting GOAL
    work_preferences: "What's your savings goal? What are you saving for, how much, and by when?",
    // At goal step, we're collecting ACADEMIC EVENTS
    goal: "Any upcoming exams or busy periods? Or say 'none' to continue.",
    // At academic_events step, we're collecting INVENTORY
    academic_events: "Any items you could sell? (textbooks, electronics...) Or 'none' to skip.",
    // At inventory step, we're collecting LIFESTYLE/SUBSCRIPTIONS
    inventory: "What subscriptions do you pay for? (Netflix, Spotify, gym...) Or 'none'.",
    // At lifestyle step, we're COMPLETING
    lifestyle: "Got it! Say 'done' to complete your profile.",
    complete: "Your profile is complete! Head to 'My Plan' to see your strategies.",
  };

  return clarifications[step] || 'Tell me more about yourself.';
}

/**
 * Extract data using regex patterns (fallback when Mastra agent unavailable)
 *
 * IMPORTANT: Step names indicate what was JUST collected, not what we're collecting.
 * - step='greeting' → we're collecting CURRENCY/REGION
 * - step='region' → we're collecting NAME
 * - step='name' → we're collecting STUDIES (diploma/field)
 * - step='studies' → we're collecting SKILLS
 * etc.
 */
function extractWithRegex(message: string, step: string, _existing: ProfileData): ProfileData {
  const extracted: ProfileData = {};
  const msg = message.trim();

  // Service names to exclude from name extraction
  const serviceNames = [
    'netflix',
    'spotify',
    'amazon',
    'disney',
    'apple',
    'google',
    'youtube',
    'hbo',
    'prime',
    'hulu',
  ];
  const isServiceName = (name: string) => serviceNames.some((s) => name.toLowerCase().includes(s));

  // Helper: extract studies (diploma + field)
  const extractStudies = (): void => {
    const diplomaPatterns =
      /\b(master'?s?|bachelor'?s?|licence|phd|ph\.?d\.?|doctorate|doctorat|freshman|sophomore|junior|senior|undergrad|graduate|postgrad|l1|l2|l3|m1|m2|bts|dut|iut|1st year|2nd year|3rd year|4th year|5th year|bac\+\d)\b/i;
    const fieldPatterns =
      /\b(computer science|computer|computing|cs|compsci|software|programming|informatique|info|law|legal|droit|business|mba|commerce|finance|accounting|comptabilité|medicine|medical|médecine|nursing|infirmier|engineering|ingénieur|mechanical|mécanique|electrical|électrique|civil|economics|econ|économie|psychology|psych|psychologie|biology|bio|biologie|physics|physique|chemistry|chimie|chem|math|mathematics|mathématiques|arts|fine arts|beaux-arts|music|musique|history|histoire|literature|littérature|philosophy|philosophie|sociology|sociologie|political science|sciences po|communications|communication|journalism|journalisme|marketing|architecture|design)\b/i;

    const diplomaMatch = msg.match(diplomaPatterns);
    if (diplomaMatch) {
      extracted.diploma = diplomaMatch[1];
    }

    const fieldMatch = msg.match(fieldPatterns);
    if (fieldMatch) {
      extracted.field = fieldMatch[1];
    }

    // If we got diploma but no specific field, try to extract the rest as field
    if (extracted.diploma && !extracted.field) {
      // Remove the diploma from the message and use the rest as field
      const remainingText = msg
        .replace(diplomaPatterns, '')
        .replace(/\bin\b/i, '')
        .trim();
      if (remainingText.length >= 2 && remainingText.length <= 50) {
        extracted.field = remainingText
          .split(/\s+/)
          .slice(0, 4)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      }
    }

    // If nothing specific found, accept any text as field of study
    if (!extracted.diploma && !extracted.field && msg.length >= 2 && msg.length <= 100) {
      const words = msg.trim().split(/\s+/);
      if (words.length >= 2) {
        extracted.diploma = words[0];
        extracted.field = words.slice(1).join(' ');
      } else {
        extracted.field = msg.trim();
      }
    }
  };

  // Helper: extract name
  const extractName = (): void => {
    const words = msg.split(/\s+/);
    const nameCandidate = words.find(
      (w) => w.length >= 2 && /^[A-Z][a-z]+$/.test(w) && !isServiceName(w)
    );
    if (nameCandidate) {
      extracted.name = nameCandidate;
    } else if (words.length === 1 && words[0].length >= 2 && !isServiceName(words[0])) {
      extracted.name = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
    }
  };

  switch (step) {
    case 'greeting': {
      // At greeting step, we're collecting CURRENCY/REGION
      const lower = msg.toLowerCase();
      if (
        lower.includes('us') ||
        lower.includes('america') ||
        lower.includes('dollar') ||
        lower.includes('united states')
      ) {
        extracted.currency = 'USD';
      } else if (
        lower.includes('uk') ||
        lower.includes('britain') ||
        lower.includes('pound') ||
        lower.includes('£') ||
        lower.includes('england') ||
        lower.includes('scotland') ||
        lower.includes('wales')
      ) {
        extracted.currency = 'GBP';
      } else if (
        lower.includes('euro') ||
        lower.includes('europe') ||
        lower.includes('€') ||
        lower.includes('france') ||
        lower.includes('germany') ||
        lower.includes('italy') ||
        lower.includes('spain') ||
        lower.includes('netherlands') ||
        lower.includes('belgium') ||
        lower.includes('portugal') ||
        lower.includes('austria') ||
        lower.includes('ireland')
      ) {
        extracted.currency = 'EUR';
      }
      break;
    }

    case 'region': {
      // At region step, we're collecting NAME
      extractName();
      break;
    }

    case 'name': {
      // At name step (name was just collected), we're collecting STUDIES
      extractStudies();
      break;
    }

    case 'studies': {
      // At studies step (studies were just collected), we're collecting SKILLS
      // Extract skills - first try known keywords, then accept any input
      const skillKeywords = [
        'python',
        'javascript',
        'java',
        'sql',
        'react',
        'node',
        'typescript',
        'c++',
        'c#',
        'ruby',
        'php',
        'swift',
        'kotlin',
        'rust',
        'go',
        'html',
        'css',
        'guitar',
        'piano',
        'music',
        'tutoring',
        'teaching',
        'writing',
        'english',
        'french',
        'spanish',
        'german',
        'italian',
        'chinese',
        'japanese',
        'translation',
        'data entry',
        'excel',
        'word',
        'powerpoint',
        'cooking',
        'sports',
        'photography',
        'video editing',
        'graphic design',
        'web design',
        'marketing',
        'sales',
        'babysitting',
        'cleaning',
        'driving',
        'delivery',
      ];

      const foundSkills = skillKeywords.filter((skill) =>
        msg.toLowerCase().includes(skill.toLowerCase())
      );

      if (foundSkills.length > 0) {
        extracted.skills = foundSkills;
      } else if (msg.length >= 2 && msg.length <= 200) {
        // Accept any comma-separated or "and"-separated list as skills
        const customSkills = msg
          .split(/[,;&]|\band\b/i)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2 && s.length <= 30)
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase());

        if (customSkills.length > 0) {
          extracted.skills = customSkills;
        } else {
          // Single skill without separator
          extracted.skills = [msg.trim()];
        }
      }
      break;
    }

    case 'skills': {
      // At skills step (skills were just collected), we're collecting CERTIFICATIONS
      // Certification patterns for auto-detection
      const certPatterns: Array<{ pattern: RegExp; code: string }> = [
        // France
        { pattern: /\bBAFA\b/i, code: 'BAFA' },
        { pattern: /\bBNSSA\b/i, code: 'BNSSA' },
        { pattern: /\bPSC1\b/i, code: 'PSC1' },
        { pattern: /\bSST\b/i, code: 'SST' },
        // UK
        { pattern: /\bDBS\b/i, code: 'DBS' },
        { pattern: /\b(?:paediatric|pediatric)\s+first\s+aid\b/i, code: 'PFA' },
        { pattern: /\bNPLQ\b/i, code: 'NPLQ' },
        // US
        { pattern: /\bCPR\b/i, code: 'CPR_AHA' },
        { pattern: /\blifeguard\b/i, code: 'LIFEGUARD_RC' },
        { pattern: /\bfood\s+handler\b/i, code: 'FOOD_HANDLER' },
        // International
        { pattern: /\bPADI\s*(?:OW|open\s*water)?\b/i, code: 'PADI_OW' },
        { pattern: /\bPADI\s*(?:DM|divemaster)\b/i, code: 'PADI_DM' },
        { pattern: /\bSSI\b/i, code: 'SSI_OW' },
        { pattern: /\bTEFL\b|\bTESOL\b/i, code: 'TEFL' },
        { pattern: /\bfirst\s*aid\b/i, code: 'PSC1' }, // Generic first aid defaults to PSC1
      ];

      if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(msg)) {
        extracted.certifications = [];
      } else {
        const detected: string[] = [];
        for (const { pattern, code } of certPatterns) {
          if (pattern.test(msg) && !detected.includes(code)) {
            detected.push(code);
          }
        }
        if (detected.length > 0) {
          extracted.certifications = detected;
        } else if (msg.length >= 2 && msg.length <= 100) {
          // Accept any comma-separated list as certification names
          const customCerts = msg
            .split(/[,;&]|\band\b/i)
            .map((s) => s.trim().toUpperCase())
            .filter((s) => s.length >= 2 && s.length <= 20);
          if (customCerts.length > 0) {
            extracted.certifications = customCerts;
          }
        }
      }
      break;
    }

    case 'certifications': {
      // At certifications step (certifications were just collected), we're collecting LOCATION
      const knownCities =
        /\b(paris|lyon|marseille|toulouse|bordeaux|lille|nantes|nice|montpellier|strasbourg|new york|london|berlin|tokyo|los angeles|chicago|boston|san francisco|seattle|madrid|barcelona|rome|amsterdam|brussels|vienna|munich|dublin|lisbon|prague|warsaw|budapest|athens|stockholm|oslo|copenhagen|helsinki|zurich|geneva|milan|vancouver|toronto|montreal|sydney|melbourne)\b/i;

      const knownMatch = msg.match(knownCities);
      if (knownMatch) {
        extracted.city = knownMatch[1]
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
      } else if (msg.length > 0 && msg.length <= 50) {
        const cleanCity = msg
          .replace(/[^\w\s-]/g, '')
          .trim()
          .split(/\s+/)
          .slice(0, 3)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        if (cleanCity.length >= 2) {
          extracted.city = cleanCity;
        }
      }
      break;
    }

    case 'location': {
      // At location step (location was just collected), we're collecting BUDGET
      const incomeMatch = msg.match(/(?:earn|income|receive|make|get|gagne|revenu)[^\d]*(\d+)/i);
      const expenseMatch = msg.match(/(?:spend|expense|pay|cost|dépense|paye)[^\d]*(\d+)/i);
      const numbersMatch = msg.match(/(\d+)/g);

      if (incomeMatch) {
        extracted.income = parseInt(incomeMatch[1], 10);
      }
      if (expenseMatch) {
        extracted.expenses = parseInt(expenseMatch[1], 10);
      }

      if (!extracted.income && !extracted.expenses && numbersMatch) {
        if (numbersMatch.length >= 2) {
          extracted.income = parseInt(numbersMatch[0], 10);
          extracted.expenses = parseInt(numbersMatch[1], 10);
        } else if (numbersMatch.length === 1) {
          extracted.income = parseInt(numbersMatch[0], 10);
          extracted.expenses = 0;
        }
      }

      if (/\b(none|nothing|rien|pas|zero|0)\b/i.test(msg)) {
        if (!extracted.income) extracted.income = 0;
        if (!extracted.expenses) extracted.expenses = 0;
      }
      break;
    }

    case 'budget': {
      // At budget step (budget was just collected), we're collecting WORK PREFERENCES
      const hoursMatch = msg.match(/(\d+)\s*(?:hours?|h|heures?)/i);
      const rateMatch = msg.match(
        /(?:\$|€)?(\d+)\s*(?:\/h|per hour|hourly|de l'heure|€\/h|\$\/h)/i
      );
      const numbersMatch = msg.match(/(\d+)/g);

      if (hoursMatch) {
        extracted.maxWorkHours = parseInt(hoursMatch[1], 10);
      }
      if (rateMatch) {
        extracted.minHourlyRate = parseInt(rateMatch[1], 10);
      }

      if (
        !extracted.maxWorkHours &&
        !extracted.minHourlyRate &&
        numbersMatch &&
        numbersMatch.length >= 2
      ) {
        extracted.maxWorkHours = parseInt(numbersMatch[0], 10);
        extracted.minHourlyRate = parseInt(numbersMatch[1], 10);
      } else if (
        !extracted.maxWorkHours &&
        !extracted.minHourlyRate &&
        numbersMatch &&
        numbersMatch.length === 1
      ) {
        extracted.maxWorkHours = parseInt(numbersMatch[0], 10);
        extracted.minHourlyRate = 12;
      }
      break;
    }

    case 'work_preferences': {
      // At work_preferences step, we're collecting GOAL
      const amountMatch = msg.match(/(?:\$|€)?(\d+)/);
      const goalKeywords = [
        'vacation',
        'vacances',
        'laptop',
        'ordinateur',
        'phone',
        'téléphone',
        'car',
        'voiture',
        'emergency',
        'urgence',
        'savings',
        'épargne',
        'trip',
        'voyage',
        'rent',
        'loyer',
        'deposit',
        'caution',
        'scooter',
        'bike',
        'vélo',
        'moto',
        'concert',
        'festival',
        'game',
        'console',
        'camera',
        'appareil',
      ];

      if (amountMatch) {
        extracted.goalAmount = parseInt(amountMatch[1], 10);
      }

      for (const keyword of goalKeywords) {
        if (msg.toLowerCase().includes(keyword)) {
          extracted.goalName = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          break;
        }
      }

      // If only amount provided without purpose, ask for clarification instead of auto-filling
      if (extracted.goalAmount && !extracted.goalName) {
        extracted.missingInfo = [
          ...(extracted.missingInfo || []),
          'goal purpose (what are you saving for?)',
        ];
      }
      break;
    }

    case 'goal': {
      // At goal step, we're collecting ACADEMIC EVENTS
      if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(msg)) {
        extracted.academicEvents = [];
      } else if (msg.length >= 2) {
        const events = msg
          .split(/[,;&]|\band\b/i)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2)
          .map((text) => {
            const lower = text.toLowerCase();

            // Determine type
            let type: 'exam' | 'vacation' | 'busy' = 'busy';
            if (/\b(exam|test|final|midterm|quiz|partiel|examen)\b/i.test(text)) {
              type = 'exam';
            } else if (/\b(vacation|holiday|break|vacances|congé)\b/i.test(text)) {
              type = 'vacation';
            }

            // Parse duration
            let duration: string | undefined;
            const durationMatch = text.match(
              /(\d+)\s*(hour|hr|h|day|week|month|heure|jour|semaine|mois)s?/i
            );
            if (durationMatch) {
              const num = durationMatch[1];
              const unit = durationMatch[2].toLowerCase();
              const unitMap: Record<string, string> = {
                hour: 'hour',
                hr: 'hour',
                h: 'hour',
                heure: 'hour',
                day: 'day',
                jour: 'day',
                week: 'week',
                semaine: 'week',
                month: 'month',
                mois: 'month',
              };
              duration = `${num} ${unitMap[unit] || unit}${parseInt(num) > 1 ? 's' : ''}`;
            }

            // Parse difficulty for exams
            let difficulty: 1 | 2 | 3 | 4 | 5 | undefined;
            if (type === 'exam') {
              if (/\b(very\s*easy|super\s*easy|trivial)\b/i.test(lower)) {
                difficulty = 1;
              } else if (/\b(easy|simple|facile)\b/i.test(lower)) {
                difficulty = 2;
              } else if (/\b(medium|moderate|normal|moyen)\b/i.test(lower)) {
                difficulty = 3;
              } else if (/\b(hard|difficult|tough|dur|difficile)\b/i.test(lower)) {
                difficulty = 4;
              } else if (/\b(very\s*hard|super\s*hard|brutal|killer)\b/i.test(lower)) {
                difficulty = 5;
              }
            }

            // Clean up name (remove parsed parts)
            const name = text
              .replace(/\d+\s*(hour|hr|h|day|week|month|heure|jour|semaine|mois)s?/gi, '')
              .replace(
                /\b(very\s*)?(easy|hard|simple|difficult|tough|medium|moderate|normal|facile|dur|difficile|moyen|brutal|killer|super\s*easy|super\s*hard|trivial)\b/gi,
                ''
              )
              .trim();

            return { name: name || text, type, duration, difficulty };
          });

        if (events.length > 0) {
          extracted.academicEvents = events;

          // If any exam doesn't have difficulty, add to missingInfo
          const examsWithoutDifficulty = events.filter((e) => e.type === 'exam' && !e.difficulty);
          if (examsWithoutDifficulty.length > 0) {
            const examNames = examsWithoutDifficulty.map((e) => e.name).join(', ');
            extracted.missingInfo = [
              ...(extracted.missingInfo || []),
              `how difficult is ${examNames}? (1=easy, 5=very hard)`,
            ];
          }
        }
      }
      break;
    }

    case 'academic_events': {
      // At academic_events step, we're collecting INVENTORY
      if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(msg)) {
        extracted.inventoryItems = [];
      } else if (msg.length >= 2) {
        const items = msg
          .split(/[,;&]|\band\b/i)
          .map((s) => s.trim())
          .filter((s) => s.length >= 2)
          .map((name) => ({ name, category: 'other' }));
        if (items.length > 0) {
          extracted.inventoryItems = items;
        }
      }
      break;
    }

    case 'inventory': {
      // At inventory step, we're collecting TRADE opportunities
      if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(msg)) {
        extracted.tradeOpportunities = [];
      } else if (msg.length >= 2) {
        const trades: TradeOpportunity[] = [];

        // Parse "borrow X from Y (saving Z€)"
        // Bug G Fix: Enhanced regex to capture optional monetary value in parentheses
        const borrowMatches = msg.matchAll(
          /borrow\s+(.+?)\s+from\s+(\w+)(?:\s*\(?[^)]*?(\d+)[€$£]?[^)]*?\))?/gi
        );
        for (const match of borrowMatches) {
          trades.push({
            type: 'borrow',
            description: match[1].trim(),
            withPerson: match[2].trim(),
            estimatedValue: match[3] ? parseInt(match[3], 10) : undefined,
          });
        }

        // Parse "lend X to Y"
        const lendMatches = msg.matchAll(/lend\s+(.+?)\s+to\s+(\w+)/gi);
        for (const match of lendMatches) {
          trades.push({
            type: 'lend',
            description: match[1].trim(),
            withPerson: match[2].trim(),
          });
        }

        // Parse "trade X for Y"
        const tradeMatches = msg.matchAll(/trade\s+(.+?)\s+for\s+(.+)/gi);
        for (const match of tradeMatches) {
          trades.push({
            type: 'trade',
            description: match[1].trim(),
            forWhat: match[2].trim(),
          });
        }

        // If no structured patterns found, treat as generic trade descriptions
        if (trades.length === 0) {
          const items = msg
            .split(/[,;&]|\band\b/i)
            .map((s) => s.trim())
            .filter((s) => s.length >= 2);
          for (const item of items) {
            trades.push({
              type: 'trade',
              description: item,
            });
          }
        }

        if (trades.length > 0) {
          extracted.tradeOpportunities = trades;
        }
      }
      break;
    }

    case 'trade': {
      // At trade step, we're collecting LIFESTYLE (subscriptions)
      if (/\b(none|nothing|rien|pas|no|non|skip)\b/i.test(msg)) {
        extracted.subscriptions = [];
      } else if (msg.length >= 2) {
        const subPatterns =
          /\b(netflix|spotify|amazon|disney|apple|youtube|hbo|hulu|gym|salle|phone|téléphone|internet|cloud|adobe|microsoft|playstation|xbox|nintendo)\b/gi;
        const matches = msg.match(subPatterns);

        if (matches) {
          extracted.subscriptions = [...new Set(matches.map((m) => m.toLowerCase()))].map(
            (name) => ({
              name: name.charAt(0).toUpperCase() + name.slice(1),
              currentCost: 10,
            })
          );
        } else {
          const subs = msg
            .split(/[,;&]|\band\b/i)
            .map((s) => s.trim())
            .filter((s) => s.length >= 2)
            .map((name) => ({ name, currentCost: 10 }));
          if (subs.length > 0) {
            extracted.subscriptions = subs;
          }
        }
      }
      break;
    }

    case 'lifestyle': {
      // At lifestyle step, we're COMPLETE - any response is acknowledgment
      // Mark as having subscriptions (empty array if not already set)
      if (!extracted.subscriptions) {
        extracted.subscriptions = [];
      }
      break;
    }
  }

  return extracted;
}

/**
 * Get the next step in the onboarding flow
 */
function getNextStep(currentStep: string): string {
  const flow = [
    'greeting', // collect currency/region
    'region', // collect name (new step)
    'name', // collect studies
    'studies',
    'skills',
    'certifications',
    'location',
    'budget',
    'work_preferences',
    'goal',
    'academic_events',
    'inventory',
    'trade', // collect trade opportunities (borrow, lend, trade, sell, cut)
    'lifestyle',
    'complete',
  ];

  const currentIndex = flow.indexOf(currentStep);
  if (currentIndex === -1 || currentIndex >= flow.length - 1) {
    return 'complete';
  }
  return flow[currentIndex + 1];
}

/**
 * Messages when advancing to the next step
 *
 * Key = step we're moving TO
 * Message = asks for what we collect AT that step
 *
 * Flow: greeting→region→name→studies→skills→certifications→location→budget→work_preferences→goal→academic_events→inventory→trade→lifestyle→complete
 * - At 'greeting': collect currency/region → advance to 'region'
 * - At 'region': collect name → advance to 'name'
 * - At 'name': collect studies → advance to 'studies'
 * - etc.
 */
function getAdvanceMessage(nextStep: string, profile: ProfileData): string {
  const name = profile.name || '';
  const currencySymbol = profile.currency === 'EUR' ? '€' : profile.currency === 'GBP' ? '£' : '$';

  const messages: Record<string, string> = {
    // Advancing TO 'region' means we just got currency, now ask for name
    region: `Got it! I'll show amounts in ${currencySymbol}. What's your name?`,
    // Advancing TO 'name' means we just got the name, now ask for studies
    name: `Nice to meet you${name ? `, ${name}` : ''}! What are you studying?\n\nTell me your education level and field (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`,
    // Advancing TO 'studies' means we just got studies, now ask for skills
    studies: `Great${name ? `, ${name}` : ''}! What skills do you have? (coding, languages, tutoring, music...)`,
    // Advancing TO 'skills' means we just got skills, now ask for certifications
    skills: `Awesome skills! Do you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`,
    // Advancing TO 'certifications' means we just got certifications, now ask for location
    certifications: `Got it! Where do you live?`,
    // Advancing TO 'location' means we just got location, now ask for budget
    location: `Got it! Now about your budget - how much do you earn and spend per month? (in ${currencySymbol})`,
    // Advancing TO 'budget' means we just got budget, now ask for work preferences
    budget: `Thanks! How many hours per week can you work, and what's your minimum hourly rate? (in ${currencySymbol}/h)`,
    // Advancing TO 'work_preferences' means we just got work prefs, now ask for goal
    work_preferences: `Perfect! What's your savings goal? (what, how much in ${currencySymbol}, by when)`,
    // Advancing TO 'goal' means we just got goal, now ask for academic events
    goal: `Great goal! Any upcoming exams or busy periods to plan around? (or say 'none')`,
    // Advancing TO 'academic_events' means we just got events, now ask for inventory
    academic_events: `Noted! Any items you could sell for extra cash? (textbooks, electronics... or 'none')`,
    // Advancing TO 'inventory' means we just got inventory, now ask for trade
    inventory: `Thanks! Are there things you could borrow instead of buying, or skills you could trade with friends?\n\n📥 "borrow camping gear from Alex"\n🔄 "trade tutoring for web design"\n\n(or say 'none')`,
    // Advancing TO 'trade' means we just got trade info, now ask for subscriptions (lifestyle)
    trade: `Got it! What subscriptions do you pay for? (Netflix, Spotify, gym... or 'none')`,
    // Advancing TO 'lifestyle' means we just got subscriptions, now ask for confirmation
    lifestyle: `Almost done! Anything else you'd like to add? (or say 'done')`,
    // Advancing TO 'complete' means onboarding is done
    complete: `Your profile is complete${name ? `, ${name}` : ''}! Head to "My Plan" to see your personalized strategies.`,
  };

  return messages[nextStep] || `Great${name ? `, ${name}` : ''}! Let's continue.`;
}

export default {
  processWithGroqExtractor,
};
