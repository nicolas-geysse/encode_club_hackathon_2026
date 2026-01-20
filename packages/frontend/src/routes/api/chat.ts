/**
 * Chat API Route
 *
 * Handles LLM-powered chat for onboarding and general conversation.
 * Uses Mastra agent for intelligent extraction (with Groq fallback).
 * Traces everything to Opik for observability.
 */

import type { APIEvent } from '@solidjs/start/server';
import Groq from 'groq-sdk';
import {
  trace,
  logFeedbackScores,
  getCurrentTraceId,
  getTraceUrl,
  type TraceOptions,
  type TraceContext,
} from '../../lib/opik';
import { processWithGroqExtractor, type ProfileData } from '../../lib/onboardingExtractor';
import { createLogger } from '../../lib/logger';
import type { UIResource } from '../../types/chat';
// Note: RAG context is fetched via HTTP call which returns pre-formatted context

const logger = createLogger('ChatAPI');

/**
 * Fetch RAG context for a query (non-blocking, returns empty on failure)
 * @see sprint-10-5.md Phase 2
 */
async function fetchRAGContext(queryText: string, profileId?: string): Promise<string> {
  try {
    // Try to get RAG context via internal API
    const response = await fetch(
      `${process.env.INTERNAL_API_URL || 'http://localhost:3000'}/api/rag`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queryText, profileId }),
      }
    );

    if (!response.ok) {
      return ''; // RAG not available
    }

    const data = (await response.json()) as { formattedContext?: string; available?: boolean };
    if (data.available && data.formattedContext) {
      return data.formattedContext;
    }
    return '';
  } catch {
    // RAG fetch failed - continue without it
    return '';
  }
}

// Feature flag for Groq extractor (set to false to use legacy Groq-only approach without JSON mode)
const USE_GROQ_EXTRACTOR = process.env.USE_GROQ_EXTRACTOR !== 'false';

// Groq configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Opik initialization state (run once per server instance)
let opikInitialized = false;

/**
 * Auto-initialize Opik evaluators and feedback definitions on first request
 * This sets up the LLM-as-judge evaluators and annotation queues in Opik
 */
async function ensureOpikSetup(): Promise<void> {
  if (opikInitialized) return;

  try {
    const { isOpikRestAvailable, initializeStrideOpikSetup } = await import('../../lib/opikRest');
    if (await isOpikRestAvailable()) {
      const projectName = process.env.OPIK_PROJECT || 'stride';
      await initializeStrideOpikSetup(projectName);
      opikInitialized = true;
      console.error('[Chat] Opik evaluators auto-initialized for project:', projectName);
    }
  } catch (error) {
    // Non-fatal: evaluators are optional enhancement
    console.error('[Chat] Opik setup skipped (non-fatal):', error);
    opikInitialized = true; // Mark as done to avoid retrying every request
  }
}

// Initialize Groq client
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!groqClient && GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

// Helper to get currency symbol from currency code
function getCurrencySymbol(currency?: string): string {
  switch (currency) {
    case 'EUR':
      return '\u20AC'; // €
    case 'GBP':
      return '\u00A3'; // £
    case 'USD':
    default:
      return '$';
  }
}

// Onboarding step types (extended for full tab population)
type OnboardingStep =
  | 'greeting'
  | 'region' // Added: ask for name after greeting (which asks for location/currency)
  | 'name'
  | 'studies'
  | 'skills'
  | 'certifications' // Professional certifications (BAFA, lifeguard, etc.)
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'goal' // Savings goal
  | 'academic_events' // Exams, vacations
  | 'inventory' // Items to sell
  | 'trade' // Trade opportunities (borrow, lend, swap)
  | 'lifestyle' // Subscriptions
  | 'complete';

/**
 * Chat modes:
 * - onboarding: Initial guided flow for new users
 * - conversation: Free-form chat after onboarding is complete
 * - profile-edit: User wants to update their profile
 */
type ChatMode = 'onboarding' | 'conversation' | 'profile-edit';

/**
 * Detected intent from user message
 */
interface DetectedIntent {
  mode: ChatMode;
  action?: string;
  field?: string;
  extractedValue?: unknown;
  extractedGoal?: {
    name?: string;
    amount?: number;
    deadline?: string;
  };
  /** Internal: which pattern matched (for observability) */
  _matchedPattern?: string;
}

// System prompts (from prompts.yaml - hardcoded fallback if service not available)
const SYSTEM_PROMPTS = {
  onboarding: `You are Bruno, a friendly and enthusiastic financial coach for students.
You ask simple questions to understand their financial situation.
You are encouraging and use casual but respectful language (no vulgarity).
You adapt to the level of detail the user provides.
You NEVER give risky or speculative investment advice.
Always respond in English. Keep your responses concise (2-4 sentences max).`,

  extraction: `You are an assistant that extracts structured information from user messages.
Respond ONLY with valid JSON, no text before or after.`,
};

// Step-specific prompts
const STEP_PROMPTS: Record<OnboardingStep, string> = {
  greeting: '',
  region: `The user is based in a region that uses {currency} currency.
Generate a warm, welcoming response of 2-3 sentences that:
1. Acknowledges their location (Europe/US/UK based on currency)
2. Asks for their first name

Be friendly and casual. Example: "Great! Now, what's your name? I'd love to know who I'm helping today!"`,
  name: `The user just gave their first name "{name}".
Generate a warm response of 2-3 sentences that:
1. Welcomes the user by their first name
2. Asks about their education level and field of study

Suggest examples of education levels:
- High school / Baccalauréat
- Bachelor's / Licence (year 1-3)
- Master's (year 1-2)
- PhD / Doctorate
- Vocational / BTS / DUT

Example prompt: "What are you studying? For example: 'Bachelor 2nd year Computer Science' or 'Master 1 Business'"`,

  studies: `The user studies {diploma} {field}.
Generate a response of 2-3 sentences that:
1. Comments positively on their studies
2. Asks about their skills (coding, languages, design, sports, etc.)`,

  skills: `The user has these skills: {skills}.
Generate a response of 2-3 sentences that:
1. Values their skills
2. Asks about professional certifications they might have

Mention examples like:
🇫🇷 France: BAFA, BNSSA, PSC1, SST
🇬🇧 UK: DBS, First Aid, NPLQ
🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler
🌍 International: PADI diving, TEFL teaching

Tell them to say "none" if they don't have any.`,

  certifications: `The user has certifications: {certifications}.
Generate a response of 2-3 sentences that:
1. Acknowledges their certifications (if any) or that they don't have any
2. Asks where they live (city)`,

  location: `The user lives in {city}.
Generate a response of 2-3 sentences that:
1. Mentions their city
2. Asks about their budget (monthly income and expenses)`,

  budget: `The user has ${'{income}'} income and ${'{expenses}'} expenses per month (margin: ${'{margin}'}).
Generate a response of 2-3 sentences that:
1. Briefly comments on their budget (positive if margin >0, encouraging otherwise)
2. Asks about their work preferences (max hours per week, minimum hourly rate)`,

  work_preferences: `The user can work {maxWorkHours}h/week, minimum ${'{minHourlyRate}'}/h.
Generate a response of 2-3 sentences that:
1. Acknowledges their work preferences
2. Asks about their savings goal (what they want to save for, how much, and by when)
Example goals: "emergency fund", "laptop", "vacation", "graduation security", etc.`,

  goal: `The user wants to save for "{goalName}" with a target of ${'{goalAmount}'} by {goalDeadline}.
Generate a response of 2-3 sentences that:
1. Positively comments on their goal
2. Asks about any upcoming academic events (exams, vacations, busy periods) to plan around`,

  academic_events: `The user mentioned academic events: {academicEvents}.
Generate a response of 2-3 sentences that:
1. Notes the important periods
2. Asks if they have any items they could sell (old textbooks, electronics, clothes, etc.)`,

  inventory: `The user has items to potentially sell: {inventoryItems}.
Generate a response of 2-3 sentences that:
1. Acknowledges the items
2. Asks about trade opportunities - can they borrow items instead of buying, lend to earn, or swap with friends?

Example: "Nice! Now, do you have any trade opportunities? For example:
- Borrow a friend's bike instead of buying one
- Lend your camera for some cash
- Swap textbooks with classmates"`,

  trade: `The user mentioned trade opportunities: {tradeOpportunities}.
Generate a response of 2-3 sentences that:
1. Acknowledges their trade ideas (if any) or that they don't have any
2. Asks about their current subscriptions and recurring expenses (streaming, gym, phone plan, etc.)`,

  lifestyle: `The user has these subscriptions: {subscriptions}.
Complete profile: {name}, {diploma} {field}, skills: {skills}, city: {city}, goal: {goalName} (${'{goalAmount}'}).
Generate a response of 3-4 sentences that:
1. Briefly summarizes their complete profile
2. Mentions the key insights (budget margin, goal timeline, potential optimizations)
3. Congratulates them on completing the setup
4. Invites them to go to "My Plan" where everything is ready`,

  complete: '',
};

// Extraction prompt template - simplified for better reliability
const EXTRACTION_PROMPT = `Extract info from user message. Return ONLY a JSON object, nothing else.

Fields to look for:
- name: first name (string)
- diploma: study level like "Master", "Bachelor", "PhD", "Freshman", "Senior" (string)
- field: field of study like "Computer Science", "Law", "Business" (string)
- city: city name (string)
- income: monthly income as number
- expenses: monthly expenses as number
- skills: list of skills (array of strings)
- maxWorkHours: max hours per week (number)
- minHourlyRate: minimum hourly rate (number)
- goalName: what they're saving for like "vacation", "laptop", "emergency fund" (string)
- goalAmount: how much they want to save (number)
- goalDeadline: when, like "March 2026" or "in 3 months" (string)
- academicEvents: events like exams, vacations (string description or array)
- inventoryItems: items they could sell like "old laptop", "textbooks", "clothes" (array of {name, category?, estimatedValue?})
- subscriptions: services they pay for like "Netflix", "Spotify", "gym" (array of {name, currentCost?})
- tradeOpportunities: borrow/lend/swap opportunities like "borrow bike from friend", "lend camera" (array of {type: "borrow"|"lend"|"trade"|"swap", description, withPerson?, estimatedValue?})

IMPORTANT: Even single words like "Netflix" or "gym" should be extracted as subscriptions.
Even simple phrases like "I could borrow my friend's bike" should be extracted as tradeOpportunities.

Only include fields that are clearly mentioned. If unsure, skip the field.

User message: "${'{message}'}"

JSON:`;

interface ChatRequest {
  message: string;
  step: OnboardingStep;
  /** Chat mode: onboarding, conversation, or profile-edit */
  mode?: ChatMode;
  context?: Record<string, unknown>;
  /** Thread ID for grouping conversation turns in Opik */
  threadId?: string;
  /** Profile ID for user identification */
  profileId?: string;
  /** Recent conversation history for context (last 4 turns = 8 messages) */
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
}

interface ChatResponse {
  response: string;
  extractedData: Record<string, unknown>;
  nextStep: OnboardingStep;
  /** Detected intent from the message */
  intent?: DetectedIntent;
  /** Trace ID for this turn (useful for feedback) */
  traceId?: string;
  /** Opik trace URL for "Explain This" feature */
  traceUrl?: string;
  /** Source of the response: 'groq' (JSON mode), 'groq_legacy' (text mode), or 'fallback' (regex) */
  source?: 'groq' | 'groq_legacy' | 'fallback';
  /** MCP-UI interactive component to render in chat */
  uiResource?: UIResource;
}

/**
 * Generate a UI resource for the response based on context
 * Returns interactive MCP-UI components for specific scenarios
 */
function generateUIResourceForResponse(
  extractedData: Record<string, unknown>,
  currentStep: OnboardingStep,
  _response: string
): UIResource | undefined {
  // Goal confirmation form - when goal data is extracted
  if (currentStep === 'goal' && extractedData.goalName && extractedData.goalAmount) {
    return {
      type: 'form',
      params: {
        title: 'Confirm Your Goal',
        fields: [
          { name: 'goalName', label: 'Goal', type: 'text', value: extractedData.goalName },
          { name: 'goalAmount', label: 'Amount', type: 'number', value: extractedData.goalAmount },
          {
            name: 'goalDeadline',
            label: 'Deadline',
            type: 'date',
            value: extractedData.goalDeadline || '',
          },
        ],
        submitLabel: 'Confirm Goal',
      },
    };
  }

  // Onboarding complete summary
  if (currentStep === 'complete' || currentStep === 'lifestyle') {
    const summaryData: Record<string, string> = {};
    if (extractedData.name) summaryData['Name'] = String(extractedData.name);
    if (extractedData.goalName) summaryData['Goal'] = String(extractedData.goalName);
    if (extractedData.goalAmount) summaryData['Target'] = `$${extractedData.goalAmount}`;

    // Only show summary if we have data
    if (Object.keys(summaryData).length > 0) {
      return {
        type: 'composite',
        components: [
          {
            type: 'metric',
            params: {
              title: 'Profile Ready',
              value: Object.keys(summaryData).length,
              unit: 'fields completed',
            },
          },
          {
            type: 'action',
            params: {
              type: 'button',
              label: 'Go to My Plan',
              variant: 'primary',
              action: 'navigate',
              params: { to: '/plan' },
            },
          },
        ],
      };
    }
  }

  // Budget analysis - when income/expenses extracted
  if (currentStep === 'budget' && extractedData.income && extractedData.expenses) {
    const income = Number(extractedData.income);
    const expenses = Number(extractedData.expenses);
    const margin = income - expenses;

    return {
      type: 'grid',
      params: {
        columns: 2,
        children: [
          {
            type: 'metric',
            params: {
              title: 'Monthly Income',
              value: income,
              unit: '$',
            },
          },
          {
            type: 'metric',
            params: {
              title: 'Monthly Expenses',
              value: expenses,
              unit: '$',
            },
          },
          {
            type: 'metric',
            params: {
              title: 'Monthly Margin',
              value: margin,
              unit: '$',
              trend: { direction: margin >= 0 ? 'up' : 'down' },
            },
          },
        ],
      },
    };
  }

  // Skills list - when skills extracted
  if (
    currentStep === 'skills' &&
    Array.isArray(extractedData.skills) &&
    extractedData.skills.length > 0
  ) {
    return {
      type: 'table',
      params: {
        title: 'Your Skills',
        columns: [{ key: 'skill', label: 'Skill' }],
        rows: (extractedData.skills as string[]).map((skill) => ({ skill })),
      },
    };
  }

  return undefined;
}

// POST: Handle chat message
export async function POST(event: APIEvent) {
  // Auto-initialize Opik evaluators on first request (non-blocking)
  ensureOpikSetup().catch(() => {});

  try {
    const body = (await event.request.json()) as ChatRequest;
    const {
      message,
      step,
      mode = 'onboarding',
      context = {},
      threadId,
      profileId,
      conversationHistory,
    } = body;

    if (!message || !step) {
      return new Response(
        JSON.stringify({ error: true, message: 'message and step are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Handle conversation mode (after onboarding is complete)
    if (mode === 'conversation' || mode === 'profile-edit') {
      const conversationResult = await handleConversationMode(
        message,
        mode,
        context,
        threadId,
        profileId
      );
      return new Response(JSON.stringify(conversationResult), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build trace options with threadId for conversation grouping
    const traceOptions: TraceOptions = {
      source: 'frontend_api',
      threadId: threadId, // Groups all turns of a conversation in Opik UI
      input: {
        message: message.substring(0, 500),
        step,
        mode,
        profileId,
      },
      tags: ['onboarding', step],
    };

    // Try Groq extractor with JSON mode first (if enabled)
    if (USE_GROQ_EXTRACTOR) {
      try {
        const groqResult = await processWithGroqExtractor({
          message,
          currentStep: step,
          existingProfile: context as ProfileData,
          threadId, // Pass threadId for conversation grouping in Opik
          conversationHistory, // Pass history for context awareness
        });

        // Get trace ID for response
        const traceId = getCurrentTraceId();

        // Log automatic feedback scores based on extraction quality
        if (traceId) {
          const extractedCount = Object.keys(groqResult.extractedData).length;
          const didAdvance = groqResult.nextStep !== step;

          // Non-blocking feedback logging
          logFeedbackScores(traceId, [
            {
              name: 'extraction_success',
              value: extractedCount > 0 ? 1 : 0,
              reason:
                extractedCount > 0 ? `Extracted ${extractedCount} fields` : 'No fields extracted',
            },
            {
              name: 'conversation_progress',
              value: didAdvance ? 1 : 0.5,
              reason: didAdvance ? 'Advanced to next step' : 'Stayed on same step',
            },
          ]).catch(() => {});
        }

        // Convert to ChatResponse format - use actual source from result
        const extractedData = groqResult.extractedData as Record<string, unknown>;
        const nextStep = groqResult.nextStep as OnboardingStep;
        const uiResource = generateUIResourceForResponse(extractedData, step, groqResult.response);

        const result: ChatResponse = {
          response: groqResult.response,
          extractedData,
          nextStep,
          traceId: traceId || undefined,
          source: groqResult.source === 'groq' ? 'groq' : 'fallback',
          uiResource,
        };

        console.error(`[Chat] Response source: ${groqResult.source}`);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (groqError) {
        console.error('[Chat] Groq extractor failed, falling back to legacy:', groqError);
        // Fall through to legacy Groq approach
      }
    }

    // Legacy Groq-only approach (fallback)
    const client = getGroqClient();
    if (!client) {
      // Fallback: return simple response without LLM
      console.error('[Chat] Response from fallback (no LLM)');
      const fallbackResult = getFallbackResponse(message, step, context);
      const fallbackUiResource = generateUIResourceForResponse(
        fallbackResult.extractedData,
        step,
        fallbackResult.response
      );
      return new Response(
        JSON.stringify({ ...fallbackResult, source: 'fallback', uiResource: fallbackUiResource }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Wrap entire chat flow with trace
    const result = await trace(
      'chat.onboarding.legacy',
      async (span) => {
        span.setAttributes({
          'chat.step': step,
          'chat.message_length': message.length,
          'chat.context_keys': Object.keys(context).length,
          'chat.mode': 'legacy_groq',
          'chat.profile_id': profileId || 'anonymous',
        });
        // threadId is handled by trace options

        // Step 1: Extract data from user message
        const extractedData = await extractDataFromMessage(client, message, context);

        // Merge with existing context
        const updatedContext = { ...context, ...extractedData };

        // Step 2: Determine next step (only advances if relevant data was extracted)
        const nextStep = getNextStep(step, extractedData);
        const didAdvance = nextStep !== step;

        // Step 3: Generate response
        let response: string;
        if (nextStep === 'complete') {
          response = generateCompletionMessage(updatedContext);
        } else if (!didAdvance) {
          // Didn't advance - generate a clarification message
          response = await generateClarificationMessage(client, step, updatedContext);
        } else {
          response = await generateStepResponse(client, nextStep, updatedContext);
        }

        // Step 4: Quick evaluation of response (non-blocking)
        const evaluation = await runResponseEvaluation(response, updatedContext);
        if (evaluation) {
          span.setAttributes({
            'evaluation.passed': evaluation.passed,
            'evaluation.score': evaluation.score,
            'evaluation.issues_count': evaluation.issues.length,
          });
        }

        span.setAttributes({
          'chat.next_step': nextStep,
          'chat.did_advance': didAdvance,
          'chat.extracted_fields': Object.keys(extractedData).length,
          'chat.extracted_keys': Object.keys(extractedData).join(','),
          'chat.response_length': response.length,
          // Add input/output for better Opik visibility
          'input.message': message.substring(0, 500),
          'input.step': step,
          'output.response': response.substring(0, 500),
          'output.next_step': nextStep,
        });

        // Get trace ID for feedback
        const currentTraceId = getCurrentTraceId();

        // Log feedback scores for legacy path too
        if (currentTraceId) {
          const extractedCount = Object.keys(extractedData).length;
          logFeedbackScores(currentTraceId, [
            {
              name: 'extraction_success',
              value: extractedCount > 0 ? 1 : 0,
              reason:
                extractedCount > 0 ? `Extracted ${extractedCount} fields` : 'No fields extracted',
            },
            {
              name: 'conversation_progress',
              value: didAdvance ? 1 : 0.5,
              reason: didAdvance ? 'Advanced to next step' : 'Stayed on same step',
            },
          ]).catch(() => {});
        }

        // Generate UI resource for legacy path
        const legacyUiResource = generateUIResourceForResponse(extractedData, step, response);

        return {
          response,
          extractedData,
          nextStep,
          traceId: currentTraceId || undefined,
          source: 'groq_legacy',
          uiResource: legacyUiResource,
        } as ChatResponse;
      },
      traceOptions // Use full trace options with threadId
    );

    console.error('[Chat] Response from Groq (legacy path)');
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Extract structured data from user message using LLM
async function extractDataFromMessage(
  client: Groq,
  message: string,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  return trace('chat.extraction', async (span) => {
    span.setAttributes({
      'extraction.message_length': message.length,
      'extraction.model': GROQ_MODEL,
    });

    // First try regex extraction for common patterns (faster and more reliable)
    const regexData = extractDataWithRegex(message, context);

    try {
      const prompt = EXTRACTION_PROMPT.replace('{message}', message);

      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.extraction },
          { role: 'user', content: prompt },
        ],
        temperature: 0.0, // Zero temperature for deterministic extraction
        max_tokens: 512,
      });

      const content = completion.choices[0]?.message?.content || '{}';
      span.setAttributes({
        'extraction.response_length': content.length,
        'extraction.tokens_used': completion.usage?.total_tokens ?? 0,
      });

      // Try to parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const extracted = JSON.parse(jsonMatch[0]);
          // Merge LLM extraction with regex extraction (regex takes priority for found fields)
          const merged = { ...extracted, ...regexData };
          span.setAttributes({
            'extraction.fields_found': Object.keys(merged).length,
            'extraction.llm_fields': Object.keys(extracted).length,
            'extraction.regex_fields': Object.keys(regexData).length,
            'extraction.method': 'llm+regex',
            'input.message': message.substring(0, 200),
            'output.extracted': JSON.stringify(merged).substring(0, 500),
          });
          return merged;
        } catch (parseError) {
          console.error('JSON parse error:', parseError, 'Content:', content);
        }
      }

      // LLM didn't return valid JSON, use regex only
      span.setAttributes({
        'extraction.fields_found': Object.keys(regexData).length,
        'extraction.method': 'regex_only',
      });
      return regexData;
    } catch (error) {
      console.error('Extraction error:', error);
      span.setAttributes({
        'extraction.fields_found': Object.keys(regexData).length,
        'extraction.method': 'regex_fallback',
      });
      return regexData;
    }
  });
}

// Generate response for a specific step
async function generateStepResponse(
  client: Groq,
  step: OnboardingStep,
  context: Record<string, unknown>
): Promise<string> {
  return trace('chat.generation', async (span) => {
    span.setAttributes({
      'generation.step': step,
      'generation.model': GROQ_MODEL,
    });

    const promptTemplate = STEP_PROMPTS[step];
    if (!promptTemplate) {
      span.setAttributes({ 'generation.fallback': 'no_template' });
      return "Let's continue!";
    }

    // Interpolate context into prompt
    let prompt = promptTemplate;
    for (const [key, value] of Object.entries(context)) {
      const placeholder = `{${key}}`;
      const stringValue = Array.isArray(value)
        ? value.length > 0
          ? value.join(', ')
          : 'some items'
        : String(value || '');
      prompt = prompt.split(placeholder).join(stringValue);
    }

    // Calculate margin if we have income and expenses
    if (context.income && context.expenses) {
      const margin = Number(context.income) - Number(context.expenses);
      prompt = prompt.split('{margin}').join(String(margin));
    }

    // Clean up any remaining unresolved placeholders with sensible defaults
    prompt = prompt
      .replace(/\{goalName\}/g, 'your goal')
      .replace(/\{goalAmount\}/g, 'your target amount')
      .replace(/\{goalDeadline\}/g, 'your deadline')
      .replace(/\{academicEvents\}/g, 'your academic schedule')
      .replace(/\{inventoryItems\}/g, 'some items')
      .replace(/\{subscriptions\}/g, 'your subscriptions')
      .replace(/\{name\}/g, 'there')
      .replace(/\{diploma\}/g, '')
      .replace(/\{field\}/g, 'your field')
      .replace(/\{skills\}/g, 'your skills')
      .replace(/\{city\}/g, 'your city')
      .replace(/\{income\}/g, 'your income')
      .replace(/\{expenses\}/g, 'your expenses')
      .replace(/\{margin\}/g, 'your margin')
      .replace(/\{maxWorkHours\}/g, '15')
      .replace(/\{minHourlyRate\}/g, '15')
      .replace(/\{[a-zA-Z_]+\}/g, ''); // Remove any remaining placeholders

    try {
      const completion = await client.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPTS.onboarding },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400, // Increased for fuller responses
      });

      const response = completion.choices[0]?.message?.content || "Let's continue!";
      span.setAttributes({
        'generation.response_length': response.length,
        'generation.tokens_used': completion.usage?.total_tokens ?? 0,
        'generation.method': 'llm',
      });

      return response;
    } catch (error) {
      console.error('Response generation error:', error);
      span.setAttributes({ 'generation.method': 'fallback' });
      return getFallbackStepResponse(step, context);
    }
  });
}

// Get next step in the flow (only advances if relevant data was extracted)
function getNextStep(
  currentStep: OnboardingStep,
  extractedData: Record<string, unknown> = {}
): OnboardingStep {
  const flow: OnboardingStep[] = [
    'greeting',
    'region', // After greeting (location/currency), ask for name
    'name',
    'studies',
    'skills',
    'certifications',
    'location',
    'budget',
    'work_preferences',
    'goal',
    'academic_events',
    'inventory',
    'trade', // Trade opportunities (borrow, lend, swap)
    'lifestyle',
    'complete',
  ];

  // Define what data is required for each step to advance
  const requiredFields: Record<OnboardingStep, string[]> = {
    greeting: ['currency'], // Greeting asks "where are you based?" → extracts currency
    region: ['name'], // Region step asks for name
    name: ['diploma', 'field'],
    studies: ['skills'],
    skills: ['certifications'], // Can be empty array for "none"
    certifications: ['city'],
    location: ['income', 'expenses'],
    budget: ['maxWorkHours', 'minHourlyRate'],
    work_preferences: ['goalName', 'goalAmount', 'goalDeadline'],
    goal: [], // academic_events is optional, always advance
    academic_events: [], // inventory is optional, always advance
    inventory: [], // trade is optional, always advance
    trade: [], // subscriptions is optional, always advance
    lifestyle: [],
    complete: [],
  };

  const required = requiredFields[currentStep] || [];

  // Check if at least one required field was extracted (or step has no requirements)
  const hasRequiredData =
    required.length === 0 ||
    required.some(
      (field) =>
        extractedData[field] !== undefined &&
        extractedData[field] !== null &&
        extractedData[field] !== ''
    );

  if (!hasRequiredData) {
    // Stay on current step - didn't get the expected data
    return currentStep;
  }

  const currentIndex = flow.indexOf(currentStep);
  return flow[Math.min(currentIndex + 1, flow.length - 1)];
}

// Generate completion message
function generateCompletionMessage(context: Record<string, unknown>): string {
  const name = context.name || 'you';
  return `Perfect ${name}! I have everything I need.

I've created a personalized profile for you. You can now:
- Set a savings goal
- Explore jobs that match your skills
- Optimize your budget

**Ready to go?** Click on "My Plan" to get started!`;
}

// Generate clarification message when user input wasn't understood
async function generateClarificationMessage(
  client: Groq,
  step: OnboardingStep,
  _context: Record<string, unknown>
): Promise<string> {
  // Direct clarification messages for each step
  const clarifications: Record<OnboardingStep, string> = {
    greeting:
      "I didn't catch where you're based. Are you in the US, Europe, or UK? This helps me show amounts in the right currency.",
    region: "What's your name? I'd love to know who I'm helping today!",
    name: "I'd love to know about your studies! What's your education level and field?\n\nExamples:\n- Bachelor 2nd year Computer Science\n- Master 1 Business\n- PhD Physics\n- Vocational BTS Marketing",
    studies:
      "I'd love to know your skills! What are you good at? (coding languages, languages, design, sports, tutoring...)",
    skills:
      "Do you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')",
    certifications: 'Where do you live? Just tell me the city name.',
    location:
      'I need to understand your budget. How much do you earn per month? And roughly how much do you spend?',
    budget:
      "I need your work preferences. How many hours can you work per week maximum? And what's your minimum hourly rate?",
    work_preferences:
      "What's your savings goal? Tell me what you're saving for (vacation, laptop, emergency fund...), how much you want to save, and by when.",
    goal: "Any upcoming exams, vacations, or busy periods I should know about? Or just say 'none' to continue.",
    academic_events:
      "Do you have any items you could sell for extra cash? (textbooks, electronics, clothes...) Or say 'nothing' to skip.",
    inventory:
      "Any trade opportunities? (Borrow a friend's bike, lend your camera, swap textbooks...) Or say 'none' to skip.",
    trade:
      "What subscriptions do you currently pay for? (Netflix, Spotify, gym, phone...) Or say 'none' to continue.",
    lifestyle: 'Let me know if you want to add anything else, or we can wrap up!',
    complete: '',
  };

  // Try LLM for a more natural response, fall back to static
  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.onboarding },
        {
          role: 'user',
          content: `The user's message wasn't clear enough. Politely ask again for: ${clarifications[step]}
Keep it short and friendly (1-2 sentences).`,
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content || clarifications[step];
  } catch {
    return clarifications[step];
  }
}

// Enhanced regex extraction with context awareness
function extractDataWithRegex(
  message: string,
  context?: Record<string, unknown>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lower = message.toLowerCase();

  const original = message;

  // Name - look for capitalized words or after "I'm", "my name is", "call me"
  // Exclude common service/product names that aren't personal names
  const serviceNames = [
    'netflix',
    'spotify',
    'amazon',
    'google',
    'apple',
    'microsoft',
    'facebook',
    'instagram',
    'twitter',
    'youtube',
    'disney',
    'hulu',
    'hbo',
    'prime',
    'uber',
    'lyft',
    'doordash',
    'grubhub',
    'venmo',
    'paypal',
    'cash',
    'adobe',
    'dropbox',
    'notion',
    'slack',
    'zoom',
    'discord',
    'playstation',
    'xbox',
    'nintendo',
    'steam',
    'twitch',
    'hello',
    'thanks',
    'okay',
    'sure',
    'great',
    'good',
    'yes',
    'no',
  ];

  const namePatterns = [
    /(?:i'?m|my name is|call me|i am)\s+([A-Z][a-z]+)/i,
    /^([A-Z][a-z]{2,15})(?:\s|$|,|!)/,
  ];
  for (const pattern of namePatterns) {
    const match = original.match(pattern);
    if (match && match[1].length >= 2) {
      const candidate = match[1];
      // Skip if it's a known service/product name
      if (!serviceNames.includes(candidate.toLowerCase())) {
        data.name = candidate;
        break;
      }
    }
  }

  // Currency detection based on region/location (for greeting step)
  // US/America → USD, Europe/EU/France/Germany/etc → EUR, UK/Britain/England → GBP
  if (
    lower.match(
      /\b(us|usa|united states|america|american|states|california|new york|texas|florida)\b/i
    )
  ) {
    data.currency = 'USD';
  } else if (
    lower.match(/\b(uk|united kingdom|britain|british|england|english|scotland|wales|london)\b/i)
  ) {
    data.currency = 'GBP';
  } else if (
    lower.match(
      /\b(europe|european|eu|france|french|germany|german|spain|spanish|italy|italian|netherlands|dutch|belgium|austria|portugal|ireland|paris|berlin|madrid|amsterdam)\b/i
    )
  ) {
    data.currency = 'EUR';
  }

  // Diploma / Study level
  const diplomaPatterns: [RegExp, string][] = [
    [/\b(master'?s?|msc|m\.?s\.?)\b/i, 'Master'],
    [/\b(bachelor'?s?|bsc|b\.?s\.?|ba|b\.?a\.?)\b/i, 'Bachelor'],
    [/\b(phd|ph\.?d\.?|doctorate)\b/i, 'PhD'],
    [/\b(freshman|1st year|first year)\b/i, 'Freshman'],
    [/\b(sophomore|2nd year|second year)\b/i, 'Sophomore'],
    [/\b(junior|3rd year|third year)\b/i, 'Junior'],
    [/\b(senior|4th year|fourth year|final year)\b/i, 'Senior'],
    [/\b(graduate|grad student)\b/i, 'Graduate'],
    [/\b(l[1-3]|m[1-2]|bts|dut|licence)\b/i, 'Bachelor'],
  ];
  for (const [pattern, diploma] of diplomaPatterns) {
    if (pattern.test(lower)) {
      data.diploma = diploma;
      break;
    }
  }

  // Field of study
  const fieldPatterns: [RegExp, string][] = [
    [/\b(computer science|cs|comp sci|computing|informatics)\b/i, 'Computer Science'],
    [/\b(software engineering|software dev)\b/i, 'Software Engineering'],
    [/\b(data science|data analytics)\b/i, 'Data Science'],
    [/\b(law|legal|juridique|droit)\b/i, 'Law'],
    [/\b(business|commerce|management|mba)\b/i, 'Business'],
    [/\b(economics|econ)\b/i, 'Economics'],
    [/\b(medicine|medical|med school)\b/i, 'Medicine'],
    [/\b(engineering|engineer)\b/i, 'Engineering'],
    [/\b(psychology|psych)\b/i, 'Psychology'],
    [/\b(biology|bio)\b/i, 'Biology'],
    [/\b(mathematics|math|maths)\b/i, 'Mathematics'],
    [/\b(physics)\b/i, 'Physics'],
    [/\b(chemistry|chem)\b/i, 'Chemistry'],
    [/\b(marketing)\b/i, 'Marketing'],
    [/\b(finance|financial)\b/i, 'Finance'],
    [/\b(art|arts|design)\b/i, 'Arts & Design'],
  ];
  for (const [pattern, field] of fieldPatterns) {
    if (pattern.test(lower)) {
      data.field = field;
      break;
    }
  }

  // Cities (common student cities)
  const cityPatterns: [RegExp, string][] = [
    [/\b(london)\b/i, 'London'],
    [/\b(paris)\b/i, 'Paris'],
    [/\b(new york|nyc)\b/i, 'New York'],
    [/\b(los angeles|la)\b/i, 'Los Angeles'],
    [/\b(san francisco|sf)\b/i, 'San Francisco'],
    [/\b(boston)\b/i, 'Boston'],
    [/\b(chicago)\b/i, 'Chicago'],
    [/\b(berlin)\b/i, 'Berlin'],
    [/\b(amsterdam)\b/i, 'Amsterdam'],
    [/\b(barcelona)\b/i, 'Barcelona'],
    [/\b(madrid)\b/i, 'Madrid'],
    [/\b(tokyo)\b/i, 'Tokyo'],
    [/\b(sydney)\b/i, 'Sydney'],
    [/\b(toronto)\b/i, 'Toronto'],
    [/\b(montreal)\b/i, 'Montreal'],
    [/\b(lyon)\b/i, 'Lyon'],
    [/\b(marseille)\b/i, 'Marseille'],
    [/\b(lille)\b/i, 'Lille'],
    [/\b(bordeaux)\b/i, 'Bordeaux'],
  ];
  for (const [pattern, city] of cityPatterns) {
    if (pattern.test(lower)) {
      data.city = city;
      break;
    }
  }

  // Skills (programming languages, tools, soft skills)
  const skillsList: string[] = [];
  const skillPatterns: [RegExp, string][] = [
    [/\b(typescript|ts)\b/i, 'TypeScript'],
    [/\b(javascript|js)\b/i, 'JavaScript'],
    [/\b(python|py)\b/i, 'Python'],
    [/\b(java)\b(?!script)/i, 'Java'],
    [/\b(c\+\+|cpp)\b/i, 'C++'],
    [/\b(c#|csharp)\b/i, 'C#'],
    [/\b(ruby)\b/i, 'Ruby'],
    [/\b(go|golang)\b/i, 'Go'],
    [/\b(rust)\b/i, 'Rust'],
    [/\b(swift)\b/i, 'Swift'],
    [/\b(kotlin)\b/i, 'Kotlin'],
    [/\b(php)\b/i, 'PHP'],
    [/\b(sql)\b/i, 'SQL'],
    [/\b(react)\b/i, 'React'],
    [/\b(vue)\b/i, 'Vue'],
    [/\b(angular)\b/i, 'Angular'],
    [/\b(node|nodejs)\b/i, 'Node.js'],
    [/\b(english)\b/i, 'English'],
    [/\b(french|français)\b/i, 'French'],
    [/\b(spanish|español)\b/i, 'Spanish'],
    [/\b(german|deutsch)\b/i, 'German'],
    [/\b(chinese|mandarin)\b/i, 'Chinese'],
    [/\b(design|figma|photoshop)\b/i, 'Design'],
    [/\b(tutoring|teaching)\b/i, 'Tutoring'],
    [/\b(writing|copywriting)\b/i, 'Writing'],
  ];
  for (const [pattern, skill] of skillPatterns) {
    if (pattern.test(lower)) {
      skillsList.push(skill);
    }
  }
  if (skillsList.length > 0) {
    data.skills = skillsList;
  }

  // Numbers with context
  const numbers = original.match(/\d+/g)?.map(Number) || [];

  // Goal name detection
  const goalPatterns: [RegExp, string][] = [
    [/\b(vacation|holiday|trip|travel)\b/i, 'Vacation'],
    [/\b(laptop|computer|macbook|pc)\b/i, 'New Laptop'],
    [/\b(emergency fund|rainy day|safety net)\b/i, 'Emergency Fund'],
    [/\b(car|vehicle)\b/i, 'Car'],
    [/\b(phone|iphone|smartphone)\b/i, 'New Phone'],
    [/\b(apartment|rent|deposit|housing)\b/i, 'Housing Deposit'],
    [/\b(graduation|degree|diploma)\b/i, 'Graduation'],
    [/\b(savings?|save)\b/i, 'Savings'],
  ];
  for (const [pattern, goal] of goalPatterns) {
    if (pattern.test(lower)) {
      data.goalName = goal;
      break;
    }
  }

  // Goal deadline (months) - convert to YYYY-MM-DD
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
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
    const monthIndex = monthNames.indexOf(monthMatch[1].toLowerCase());
    const yearMatch = original.match(/20\d{2}/);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

    // Create date for the last day of the target month
    const targetDate = new Date(year, monthIndex + 1, 0);
    // If the date is in the past, use next year
    if (targetDate < new Date()) {
      targetDate.setFullYear(targetDate.getFullYear() + 1);
    }
    data.goalDeadline = targetDate.toISOString().split('T')[0];
  }

  // Relative deadlines - convert to YYYY-MM-DD
  const relativeDeadline = lower.match(/\b(in|within)\s+(\d+)\s+(months?|weeks?|years?)\b/i);
  if (relativeDeadline) {
    const amount = parseInt(relativeDeadline[2], 10);
    const unit = relativeDeadline[3].toLowerCase();
    const targetDate = new Date();

    if (unit.startsWith('month')) {
      targetDate.setMonth(targetDate.getMonth() + amount);
    } else if (unit.startsWith('week')) {
      targetDate.setDate(targetDate.getDate() + amount * 7);
    } else if (unit.startsWith('year')) {
      targetDate.setFullYear(targetDate.getFullYear() + amount);
    }

    data.goalDeadline = targetDate.toISOString().split('T')[0];
  }

  // Income and expenses with better detection
  const incomeMatch = lower.match(/(?:earn|make|income|salary|receive)[^\d]*(\d+)/i);
  const expenseMatch = lower.match(/(?:spend|expense|cost|pay)[^\d]*(\d+)/i);

  if (incomeMatch) {
    data.income = parseInt(incomeMatch[1]);
  }
  if (expenseMatch) {
    data.expenses = parseInt(expenseMatch[1]);
  }

  // If message contains "same" or similar, expenses = income
  if (
    lower.includes('same amount') ||
    lower.includes('spend the same') ||
    lower.includes('same as')
  ) {
    if (data.income && !data.expenses) {
      data.expenses = data.income;
    } else if (context?.income && !data.expenses) {
      data.expenses = context.income;
    }
  }

  // Hours and rate
  const hoursMatch = lower.match(/(\d+)\s*(?:hours?|h)\s*(?:per|\/|a)?\s*week/i);
  if (hoursMatch) {
    data.maxWorkHours = parseInt(hoursMatch[1]);
  }

  const rateMatch =
    lower.match(/(\d+)\s*[€$£]?\s*(?:per|\/|an?)?\s*hour/i) ||
    lower.match(/[€$£]\s*(\d+)\s*(?:per|\/|an?)?\s*hour/i);
  if (rateMatch) {
    data.minHourlyRate = parseInt(rateMatch[1]);
  }

  // Fallback: if we have numbers but no specific matches, use heuristics
  // Check both data (current message) AND context (previous messages) for existing values
  const hasIncome = data.income || context?.income;
  const hasExpenses = data.expenses || context?.expenses;
  const hasMaxWorkHours = data.maxWorkHours || context?.maxWorkHours;
  const hasMinHourlyRate = data.minHourlyRate || context?.minHourlyRate;

  // Debug logging for expense extraction
  logger.debug('[extractDataWithRegex] Context:', {
    income: context?.income,
    expenses: context?.expenses,
    hasIncome,
    hasExpenses,
    numbers,
    message: message.substring(0, 50),
  });

  if (numbers.length > 0 && (!hasIncome || !hasExpenses || !hasMaxWorkHours)) {
    for (const num of numbers) {
      // Income: 500-10000 range, only if not already set
      if (num >= 500 && num <= 10000 && !hasIncome && !data.income) {
        logger.debug('[extractDataWithRegex] Setting income', { value: num });
        data.income = num;
      }
      // Expenses: 100-5000 range, only if income is already known (from context or current message)
      else if (
        num >= 100 &&
        num <= 5000 &&
        (hasIncome || data.income) &&
        !hasExpenses &&
        !data.expenses
      ) {
        logger.debug('[extractDataWithRegex] Setting expenses', { value: num });
        data.expenses = num;
      }
      // Max work hours: 5-40 range
      else if (num >= 5 && num <= 40 && !hasMaxWorkHours && !data.maxWorkHours) {
        data.maxWorkHours = num;
      }
      // Min hourly rate: 8-100 range, only if work hours already set
      else if (
        num >= 8 &&
        num <= 100 &&
        (hasMaxWorkHours || data.maxWorkHours) &&
        !hasMinHourlyRate &&
        !data.minHourlyRate
      ) {
        data.minHourlyRate = num;
      }
      // Goal amount: 100-50000 range
      else if (num >= 100 && num <= 50000 && !data.goalAmount && !context?.goalAmount) {
        data.goalAmount = num;
      }
    }
  }

  // ==========================================================================
  // SUBSCRIPTIONS - Common streaming services, utilities, memberships
  // ==========================================================================
  const subscriptionPatterns: [RegExp, { name: string; currentCost?: number }][] = [
    // Streaming services
    [/\b(netflix)\b/i, { name: 'Netflix', currentCost: 15 }],
    [/\b(spotify)\b/i, { name: 'Spotify', currentCost: 10 }],
    [/\b(amazon prime|prime video|prime)\b/i, { name: 'Amazon Prime', currentCost: 15 }],
    [/\b(disney\+?|disney plus)\b/i, { name: 'Disney+', currentCost: 10 }],
    [/\b(hbo max|hbo)\b/i, { name: 'HBO Max', currentCost: 15 }],
    [/\b(hulu)\b/i, { name: 'Hulu', currentCost: 12 }],
    [/\b(apple music|apple tv)\b/i, { name: 'Apple Services', currentCost: 10 }],
    [/\b(youtube premium|youtube music)\b/i, { name: 'YouTube Premium', currentCost: 12 }],
    [/\b(twitch)\b/i, { name: 'Twitch', currentCost: 5 }],
    [/\b(crunchyroll|funimation)\b/i, { name: 'Anime Streaming', currentCost: 8 }],
    // Fitness
    [/\b(gym|fitness|planet fitness|basic fit)\b/i, { name: 'Gym membership', currentCost: 30 }],
    [/\b(peloton)\b/i, { name: 'Peloton', currentCost: 40 }],
    // Productivity/Cloud
    [/\b(dropbox)\b/i, { name: 'Dropbox', currentCost: 10 }],
    [/\b(icloud)\b/i, { name: 'iCloud', currentCost: 3 }],
    [/\b(google one|google drive)\b/i, { name: 'Google One', currentCost: 3 }],
    [/\b(notion)\b/i, { name: 'Notion', currentCost: 8 }],
    [/\b(adobe|creative cloud)\b/i, { name: 'Adobe Creative Cloud', currentCost: 55 }],
    // Gaming
    [/\b(xbox game pass|game pass)\b/i, { name: 'Xbox Game Pass', currentCost: 15 }],
    [/\b(playstation plus|ps plus|psn)\b/i, { name: 'PlayStation Plus', currentCost: 10 }],
    [/\b(nintendo online|switch online)\b/i, { name: 'Nintendo Online', currentCost: 4 }],
    // Phone/Internet
    [/\b(phone plan|mobile plan|cell plan)\b/i, { name: 'Phone plan', currentCost: 50 }],
    [/\b(internet|wifi|broadband)\b/i, { name: 'Internet', currentCost: 50 }],
    // Food delivery
    [/\b(uber eats)\b/i, { name: 'Uber Eats', currentCost: 10 }],
    [/\b(doordash)\b/i, { name: 'DoorDash', currentCost: 10 }],
    [/\b(deliveroo)\b/i, { name: 'Deliveroo', currentCost: 10 }],
  ];

  const subscriptionsList: { name: string; currentCost: number }[] = [];
  for (const [pattern, sub] of subscriptionPatterns) {
    if (pattern.test(lower)) {
      subscriptionsList.push({ name: sub.name, currentCost: sub.currentCost || 10 });
    }
  }
  if (subscriptionsList.length > 0) {
    data.subscriptions = subscriptionsList;
  }

  // ==========================================================================
  // TRADE OPPORTUNITIES - Borrow, lend, swap, trade patterns
  // ==========================================================================
  const tradeOpportunities: {
    type: 'borrow' | 'lend' | 'trade' | 'swap';
    description: string;
    withPerson?: string;
  }[] = [];

  // Pattern: "borrow X from Y" or "borrow my friend's X"
  // Sprint 2 Bug #3 fix: Simplified patterns to catch more cases like "borrow camping gear from alex"
  const borrowPatterns = [
    // Simple direct pattern: "borrow [item] from [person]"
    /borrow\s+([a-z][a-z\s]{2,30}?)\s+from\s+([a-z]+)/gi,
    // Pattern without person: "borrow [item]" at end of sentence
    /borrow\s+(?:a |my |the )?([a-z][a-z\s]{2,25})(?:\.|,|!|$)/gi,
    // Friend's item: "my friend's X"
    /(?:my |use )?(friend|roommate|brother|sister|parent)'?s?\s+([a-z][a-z\s]{2,20})/gi,
  ];

  for (const pattern of borrowPatterns) {
    pattern.lastIndex = 0; // Reset regex state
    let match;
    while ((match = pattern.exec(lower)) !== null) {
      const captureIndex = match[2] && pattern.source.includes('from') ? 1 : match[1] ? 1 : 2;
      const personIndex = pattern.source.includes('from') ? 2 : undefined;
      const item = (match[captureIndex] || '').trim().replace(/\s+/g, ' ');

      // Skip common words and too-short items
      if (item.length > 2 && !['the', 'a', 'an', 'some', 'it', 'this', 'that'].includes(item)) {
        const person = personIndex ? match[personIndex]?.trim() : undefined;
        tradeOpportunities.push({
          type: 'borrow',
          description: `Borrow ${item}`,
          withPerson: person,
        });
        break; // Avoid duplicate matches from multiple patterns
      }
    }
  }

  // Pattern: "lend my X" or "lend out my X"
  const lendPatterns = [
    /(?:can |could |i'll |i will |i might )?lend\s+(?:out )?\s*(?:my )?([a-z\s]+?)(?:\s+(?:to|for)\s+([a-z]+))?(?:\.|,|$)/gi,
    /rent\s+(?:out )?\s*(?:my )?([a-z\s]+)/gi,
  ];

  for (const pattern of lendPatterns) {
    let match;
    while ((match = pattern.exec(lower)) !== null) {
      if (match[1] && match[1].length > 2) {
        const item = match[1].trim().replace(/\s+/g, ' ');
        if (!['the', 'a', 'an', 'some', 'it'].includes(item)) {
          tradeOpportunities.push({
            type: 'lend',
            description: `Lend ${item}`,
            withPerson: match[2] || undefined,
          });
        }
      }
    }
  }

  // Pattern: "swap X with Y" or "trade X for Y"
  const swapPatterns = [
    /(?:swap|trade|exchange)\s+(?:my )?([a-z\s]+?)(?:\s+(?:with|for)\s+([a-z\s]+))?(?:\.|,|$)/gi,
  ];

  for (const pattern of swapPatterns) {
    let match;
    while ((match = pattern.exec(lower)) !== null) {
      if (match[1] && match[1].length > 2) {
        const item = match[1].trim().replace(/\s+/g, ' ');
        if (!['the', 'a', 'an', 'some', 'it'].includes(item)) {
          tradeOpportunities.push({
            type: 'swap',
            description: `Swap ${item}`,
          });
        }
      }
    }
  }

  if (tradeOpportunities.length > 0) {
    data.tradeOpportunities = tradeOpportunities;
  }

  // ==========================================================================
  // INVENTORY ITEMS - Things to sell
  // ==========================================================================
  const inventoryPatterns: [RegExp, { name: string; category: string; estimatedValue?: number }][] =
    [
      // Electronics
      [
        /\b(old laptop|laptop|macbook|computer|pc)\b/i,
        { name: 'Old laptop', category: 'electronics', estimatedValue: 200 },
      ],
      [
        /\b(old phone|iphone|smartphone|android)\b/i,
        { name: 'Old phone', category: 'electronics', estimatedValue: 150 },
      ],
      [/\b(tablet|ipad)\b/i, { name: 'Tablet', category: 'electronics', estimatedValue: 150 }],
      [
        /\b(headphones|airpods|earbuds)\b/i,
        { name: 'Headphones', category: 'electronics', estimatedValue: 50 },
      ],
      [/\b(camera|dslr)\b/i, { name: 'Camera', category: 'electronics', estimatedValue: 300 }],
      [/\b(monitor|screen)\b/i, { name: 'Monitor', category: 'electronics', estimatedValue: 100 }],
      [
        /\b(gaming console|playstation|xbox|nintendo switch)\b/i,
        { name: 'Gaming console', category: 'electronics', estimatedValue: 200 },
      ],
      // Books
      [
        /\b(textbooks?|books?|coursebooks?)\b/i,
        { name: 'Textbooks', category: 'books', estimatedValue: 50 },
      ],
      // Clothing
      [
        /\b(clothes|clothing|shirts?|jeans|jackets?|shoes)\b/i,
        { name: 'Clothes', category: 'clothing', estimatedValue: 50 },
      ],
      [
        /\b(designer|brand|luxury)\s+(?:clothes|items?|bags?)\b/i,
        { name: 'Designer items', category: 'clothing', estimatedValue: 200 },
      ],
      // Sports
      [/\b(bike|bicycle)\b/i, { name: 'Bicycle', category: 'sports', estimatedValue: 150 }],
      [
        /\b(skateboard|skates|rollerblades)\b/i,
        { name: 'Skateboard/Skates', category: 'sports', estimatedValue: 50 },
      ],
      [
        /\b(gym equipment|weights|dumbbells)\b/i,
        { name: 'Gym equipment', category: 'sports', estimatedValue: 100 },
      ],
      // Furniture
      [
        /\b(furniture|desk|chair|lamp|shelf)\b/i,
        { name: 'Furniture', category: 'furniture', estimatedValue: 75 },
      ],
      // Other
      [
        /\b(musical instrument|guitar|piano|keyboard)\b/i,
        { name: 'Musical instrument', category: 'other', estimatedValue: 200 },
      ],
    ];

  const inventoryList: { name: string; category: string; estimatedValue: number }[] = [];
  for (const [pattern, item] of inventoryPatterns) {
    if (pattern.test(lower)) {
      inventoryList.push({
        name: item.name,
        category: item.category,
        estimatedValue: item.estimatedValue || 50,
      });
    }
  }
  if (inventoryList.length > 0) {
    data.inventoryItems = inventoryList;
  }

  // ==========================================================================
  // Simple yes/no detection for inventory/subscriptions
  // ==========================================================================
  if (lower.match(/\b(yes|yeah|yep|sure|of course|i do|i have)\b/i)) {
    // Check context to see what question was asked
    // This is a simple acknowledgment, LLM will need to get details
  }

  // Handle "none" / "nothing" / "no" responses for optional steps
  if (lower.match(/\b(none|nothing|no|nope|i don't|don't have|not really)\b/i)) {
    // Mark as explicitly empty for optional fields
    const currentStep = context?.step as string;
    if (currentStep === 'inventory' && !data.inventoryItems) {
      data.inventoryItems = [];
    }
    if (currentStep === 'trade' && !data.tradeOpportunities) {
      data.tradeOpportunities = [];
    }
    if (currentStep === 'lifestyle' && !data.subscriptions) {
      data.subscriptions = [];
    }
  }

  return data;
}

// Fallback response when LLM is unavailable
function getFallbackResponse(
  message: string,
  step: OnboardingStep,
  context: Record<string, unknown>
): ChatResponse {
  const extractedData = extractDataWithRegex(message, context);
  const nextStep = getNextStep(step);
  const updatedContext = { ...context, ...extractedData };

  return {
    response: getFallbackStepResponse(nextStep, updatedContext),
    extractedData,
    nextStep,
  };
}

// Fallback responses for each step
function getFallbackStepResponse(step: OnboardingStep, context: Record<string, unknown>): string {
  switch (step) {
    case 'region':
      return `Got it! Now, what's your name? I'd love to know who I'm helping today!`;
    case 'name':
      return `Great ${context.name || ''}! Nice to meet you.\n\nWhat are you studying? (e.g., "Bachelor 2nd year Computer Science", "Master 1 Business")`;
    case 'studies':
      return `${context.diploma || ''} ${context.field || ''}, cool!\n\nWhat are your skills? (coding, languages, design, sports...)`;
    case 'skills':
      return `Nice skills!\n\nDo you have any professional certifications?\n\n🇫🇷 France: BAFA, BNSSA, PSC1, SST\n🇬🇧 UK: DBS, First Aid, NPLQ\n🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler\n🌍 International: PADI diving, TEFL teaching\n\n(List any you have, or say 'none')`;
    case 'certifications':
      return `Got it!\n\nWhere do you live? What city?`;
    case 'location':
      return `${context.city || ''}, noted.\n\nLet's talk budget: how much do you earn and spend per month roughly?`;
    case 'budget':
      return `Got it for the budget!\n\nHow many hours max per week can you work? And what's your minimum hourly rate?`;
    case 'work_preferences':
      return `Perfect, ${context.maxWorkHours || 15}h/week works!\n\nNow, what's your savings goal? What do you want to save for, how much, and by when? (e.g., "emergency fund $1000 by June")`;
    case 'goal':
      return `Great goal!\n\nAny important academic events coming up? (exams, vacations, busy periods)`;
    case 'academic_events':
      return `Thanks for sharing that!\n\nDo you have any items you could sell? (old textbooks, electronics, clothes, etc.)`;
    case 'inventory':
      return `Good to know!\n\nAny trade opportunities? (Borrow a friend's bike, lend your camera, swap textbooks with classmates...)`;
    case 'trade':
      return `Got it!\n\nWhat subscriptions or recurring expenses do you have? (streaming, gym, phone plan, etc.)`;
    case 'lifestyle':
      return generateCompletionMessage(context);
    default:
      return "Let's continue!";
  }
}

// Risk keywords for evaluation
const HIGH_RISK_KEYWORDS = [
  'crypto',
  'bitcoin',
  'ethereum',
  'nft',
  'forex',
  'trading',
  'options',
  'leverage',
  'guaranteed',
  'no risk',
  'high return',
  'invest all',
  'all-in',
  'borrow to invest',
];

const SAFE_KEYWORDS = [
  'savings',
  'budget',
  'save',
  'student aid',
  'scholarship',
  'student job',
  'tutoring',
  'freelance',
  'roommate',
];

// Quick evaluation of chat response (heuristics only, non-blocking)
async function runResponseEvaluation(
  response: string,
  _context: Record<string, unknown>
): Promise<{ passed: boolean; score: number; issues: string[] } | null> {
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

    // Check response length (too short or too long)
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
    console.error('Evaluation error:', error);
    return null;
  }
}

// =============================================================================
// Conversation Mode (Post-Onboarding)
// =============================================================================

/**
 * Find the first incomplete step in onboarding based on context
 * Used to resume onboarding from where the user left off
 */
function findFirstIncompleteStep(ctx: Record<string, unknown>): OnboardingStep {
  if (!ctx.currency) return 'greeting'; // First, get location/currency
  if (!ctx.name) return 'region'; // Then, get name
  if (!ctx.diploma && !ctx.field) return 'name';
  if (!ctx.skills || (Array.isArray(ctx.skills) && ctx.skills.length === 0)) return 'studies';
  if (!ctx.city) return 'skills';
  if (!ctx.income && !ctx.expenses) return 'location';
  if (!ctx.maxWorkHours && !ctx.minHourlyRate) return 'budget';
  if (!ctx.goalName && !ctx.goalAmount) return 'work_preferences';
  // Optional steps: academic_events, inventory, lifestyle - always allow skipping
  return 'complete';
}

/**
 * Get the question for a specific onboarding step
 */
function getStepQuestion(step: OnboardingStep, ctx: Record<string, unknown>): string {
  const questions: Record<OnboardingStep, string> = {
    greeting:
      'Where are you based? (US, Europe, or UK) This helps me show amounts in the right currency.',
    region: "What's your name? I'd love to know who I'm helping today!",
    name: `Nice to meet you${ctx.name ? `, ${ctx.name}` : ''}! What are you studying? (e.g., "Junior CS", "Senior Law")`,
    studies: 'What are your skills? (coding, languages, design, sports...)',
    skills:
      "Do you have any professional certifications? (BAFA, lifeguard, CPR, TEFL, etc.) Say 'none' if you don't have any.",
    certifications: 'Where do you live? What city?',
    location: 'How much do you earn and spend per month roughly?',
    budget: "How many hours max per week can you work? And what's your minimum hourly rate?",
    work_preferences:
      "What's your savings goal? What do you want to save for, how much, and by when?",
    goal: 'Any important academic events coming up? (exams, vacations, busy periods)',
    academic_events:
      'Do you have any items you could sell? (old textbooks, electronics, clothes...)',
    inventory:
      "Any trade opportunities? (Borrow a friend's bike, lend your camera, swap textbooks...)",
    trade: 'What subscriptions do you have? (streaming, gym, phone plan...)',
    lifestyle: "Perfect! We're almost done. Any last details?",
    complete: '',
  };
  return questions[step] || "Let's continue!";
}

/**
 * Detect user intent from message in conversation mode
 */
function detectIntent(message: string, _context: Record<string, unknown>): DetectedIntent {
  const lower = message.toLowerCase();

  // CONTINUE/COMPLETE ONBOARDING: User wants to continue from where they left off
  if (
    lower.match(/\b(continue|continuer|poursuivre|compléter?|complete|finish|finir|terminer)\b/i) &&
    lower.match(/\b(onboarding|setup|profil|profile|inscription)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'continue_onboarding',
      _matchedPattern: 'continue_onboarding_explicit',
    };
  }

  // Direct phrases: "ok on complète", "let's continue", "on continue"
  if (
    lower.match(/\b(ok\s+)?on\s+(continue|complète|termine)\b/i) ||
    lower.match(/\blet'?s?\s+(continue|finish|complete)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'continue_onboarding',
      _matchedPattern: 'continue_phrase',
    };
  }

  // RESTART ONBOARDING (new profile): User wants to create a completely new profile
  if (
    lower.match(/\b(new profile|nouveau profil|fresh start|from scratch)\b/i) ||
    lower.match(/\b(reset|effacer|supprimer).*\b(profile?|profil|data|données)\b/i)
  ) {
    return {
      mode: 'onboarding',
      action: 'restart_new_profile',
      _matchedPattern: 'new_profile_explicit',
    };
  }

  // RE-ONBOARDING (update profile): User wants to redo onboarding but keep same profile
  // Pattern 1: Explicit restart keywords
  if (lower.match(/\b(restart|recommencer|start over|start again)\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'restart_keyword',
    };
  }
  // Pattern 2: "redo onboarding" variants
  if (lower.match(/\bredo\b.*\bonboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'redo_onboarding',
    };
  }
  // Pattern 3: French "je veux recommencer"
  if (lower.match(/\bje (veux|voudrais|souhaite) recommencer\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'french_recommencer',
    };
  }
  // Pattern 4: Update all/profile
  if (lower.match(/\b(update|mettre à jour).*\b(all|tout|profile?|profil)\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'update_all_profile',
    };
  }
  // Pattern 5: NEW - "full onboarding", "complete onboarding", "new onboarding", "whole onboarding"
  if (lower.match(/\b(full|complete|new|whole)\s+(new\s+)?onboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'full_onboarding',
    };
  }
  // Pattern 6: NEW - French "refaire/reprendre l'onboarding"
  if (lower.match(/\b(refaire|reprendre)\s+(l[''])?onboarding\b/i)) {
    return {
      mode: 'onboarding',
      action: 'restart_update_profile',
      _matchedPattern: 'french_refaire_onboarding',
    };
  }

  // RE-ONBOARDING: User gives their name again (might want to update or restart)
  // Only trigger if message is SHORT and looks like just a name
  const isShortNameMessage =
    message.length < 30 &&
    lower.match(/^(?:je (?:suis|m'appelle)|my name is|i'm|i am|call me)?\s*([a-zA-ZÀ-ÿ]+)$/i);
  if (isShortNameMessage) {
    const nameMatch = message.match(
      /(?:je (?:suis|m'appelle)|my name is|i'm|i am|call me)?\s*([a-zA-ZÀ-ÿ]+)$/i
    );
    const extractedName = nameMatch ? nameMatch[1].trim() : message.trim();
    // Only if it looks like a proper name (capitalized, no numbers)
    if (extractedName.match(/^[A-ZÀ-ÿ][a-zà-ÿ]+$/)) {
      return {
        mode: 'profile-edit',
        action: 'update_name',
        field: 'name',
        extractedValue: extractedName,
        _matchedPattern: 'short_name_message',
      };
    }
  }

  // Profile edit intents
  if (lower.match(/\b(change|update|edit|modify)\b.*\b(my|the)\b/i)) {
    // Detect which field they want to update
    if (lower.match(/\b(city|location|live|move)\b/i)) {
      // Try to extract the new city value
      const cityMatch = lower.match(/(?:to|in)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'city',
        extractedValue: cityMatch ? cityMatch[1] : undefined,
        _matchedPattern: 'edit_city',
      };
    }
    if (lower.match(/\b(name)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'name',
        _matchedPattern: 'edit_name',
      };
    }
    if (lower.match(/\b(skills?)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'skills',
        _matchedPattern: 'edit_skills',
      };
    }
    if (lower.match(/\b(work|hours|rate)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'work_preferences',
        _matchedPattern: 'edit_work_prefs',
      };
    }
    if (lower.match(/\b(budget|income|expense|spend)\b/i)) {
      return {
        mode: 'profile-edit',
        action: 'update',
        field: 'budget',
        _matchedPattern: 'edit_budget',
      };
    }
    // Generic profile edit
    return { mode: 'profile-edit', action: 'update', _matchedPattern: 'edit_generic' };
  }

  // IMPLICIT BUDGET UPDATE: Detect direct income/expense statements without "update/change"
  // E.g., "new income 2000", "income 2000", "mon revenu est de 3000", "I earn 2500"
  const budgetKeywords =
    /\b(income|revenu|salaire|salary|earn|gagne|expense|dépense|loyer|rent|spend)\b/i;
  const hasAmount = /[$€£]?\s*\d+/;
  if (budgetKeywords.test(lower) && hasAmount.test(message)) {
    return {
      mode: 'profile-edit',
      action: 'update',
      field: 'budget',
      _matchedPattern: 'implicit_budget_update',
    };
  }

  // New goal intents - try to extract goal details
  if (lower.match(/\b(new goal|add goal|save for|want to buy|saving for|save \$|save €)\b/i)) {
    // Try to extract amount: "$500", "500$", "500 dollars", "€500", etc.
    const amountMatch = message.match(
      /[$€]?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:[$€]|dollars?|euros?)?/i
    );
    const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : undefined;

    // Try to extract goal name: "for a laptop", "for vacation", "to buy a car"
    const nameMatch = message.match(
      /(?:for\s+(?:a\s+)?|to\s+buy\s+(?:a\s+)?|saving\s+for\s+(?:a\s+)?)([a-zA-Z0-9\s]+?)(?:\s+by|\s+until|\s+before|\s*$)/i
    );
    const goalName = nameMatch ? nameMatch[1].trim() : undefined;

    // Try to extract deadline: "by June", "until December", "before summer"
    const deadlineMatch = message.match(
      /(?:by|until|before)\s+([a-zA-Z]+(?:\s+\d{1,2})?(?:,?\s*\d{4})?)/i
    );
    const deadline = deadlineMatch ? deadlineMatch[1].trim() : undefined;

    return {
      mode: 'conversation',
      action: 'new_goal',
      extractedGoal: {
        name: goalName,
        amount,
        deadline,
      },
      _matchedPattern: 'new_goal',
    };
  }

  // Progress check intents
  if (lower.match(/\b(progress|how.*(doing|going)|status|where.*am)\b/i)) {
    return { mode: 'conversation', action: 'check_progress', _matchedPattern: 'check_progress' };
  }

  // Advice intents
  if (lower.match(/\b(advice|help|suggest|recommend|how can i|tips?)\b/i)) {
    return { mode: 'conversation', action: 'get_advice', _matchedPattern: 'get_advice' };
  }

  // Plan/goal related questions
  if (lower.match(/\b(my plan|my goal|current goal)\b/i)) {
    return { mode: 'conversation', action: 'view_plan', _matchedPattern: 'view_plan' };
  }

  // Default conversation - no specific intent matched (fallback)
  return { mode: 'conversation', _matchedPattern: 'default_fallback' };
}

/**
 * Handle conversation mode chat (after onboarding)
 */
async function handleConversationMode(
  message: string,
  currentMode: ChatMode,
  context: Record<string, unknown>,
  threadId?: string,
  profileId?: string
): Promise<ChatResponse> {
  // Pre-detect intent for tags
  const preIntent = detectIntent(message, context);

  const traceOptions: TraceOptions = {
    source: 'frontend_api',
    threadId,
    input: {
      message: message.substring(0, 500),
      mode: currentMode,
      profileId,
      goalName: context.goalName,
      goalAmount: context.goalAmount,
    },
    tags: [
      'conversation',
      currentMode,
      `action:${preIntent.action || 'general'}`,
      preIntent.field ? `field:${preIntent.field}` : undefined,
    ].filter(Boolean) as string[],
  };

  return trace(
    'chat.conversation',
    async (ctx: TraceContext) => {
      // Span 1: Intent Detection (type: tool - it's a processing step)
      const intent = await ctx.createChildSpan(
        'chat.intent_detection',
        async (span) => {
          const detected = preIntent;
          // Determine if this is a fallback (no specific intent matched)
          const isFallback = detected._matchedPattern === 'default_fallback' || !detected.action;
          span.setAttributes({
            detected_mode: detected.mode,
            detected_action: detected.action || 'general',
            detected_field: detected.field || 'none',
            message_length: message.length,
            // NEW: Enhanced observability for intent detection
            message_preview: message.substring(0, 100),
            is_fallback: isFallback,
            matched_pattern: detected._matchedPattern || 'unknown',
          });
          span.setOutput({ intent: detected, is_fallback: isFallback });
          return detected;
        },
        { type: 'tool', input: { message: message.substring(0, 200) } }
      );

      // Span 2: Profile/Context Lookup (type: tool)
      await ctx.createChildSpan(
        'chat.context_lookup',
        async (span) => {
          span.setAttributes({
            profile_id: profileId || 'anonymous',
            has_name: Boolean(context.name),
            has_goal: Boolean(context.goalName),
            goal_amount: context.goalAmount || 0,
            context_keys: Object.keys(context).length,
          });
          span.setOutput({ profile_id: profileId, has_profile: Boolean(context.name) });
        },
        { type: 'tool', input: { profileId } }
      );

      // Log intent detection feedback scores for evaluation and dashboard
      const isFallback = intent._matchedPattern === 'default_fallback' || !intent.action;
      const traceIdForFeedback = ctx.getTraceId();
      if (traceIdForFeedback) {
        // Non-blocking: log multiple feedback scores for intent detection quality
        logFeedbackScores(traceIdForFeedback, [
          {
            name: 'intent_detection_confidence',
            value: isFallback ? 0.2 : 1.0, // Low confidence for fallback, high for matched pattern
            reason: isFallback
              ? `Fallback: "${message.substring(0, 50)}..."`
              : `Pattern: ${intent._matchedPattern}, action: ${intent.action}`,
          },
          {
            name: 'intent_is_fallback',
            value: isFallback ? 0 : 1, // 0 = fallback (bad), 1 = detected (good)
            reason: intent._matchedPattern || 'no_pattern',
          },
        ]).catch(() => {}); // Non-blocking
      }

      ctx.setAttributes({
        'chat.mode': currentMode,
        'chat.intent.mode': intent.mode,
        'chat.intent.action': intent.action || 'none',
        'chat.intent.field': intent.field || 'none',
        'user.profile_id': profileId || 'anonymous',
        'user.has_goal': Boolean(context.goalName),
      });

      // Generate response based on intent
      let response: string;
      const extractedData: Record<string, unknown> = {};

      switch (intent.action) {
        case 'restart_new_profile': {
          // Signal frontend to reset ALL state and create a new profile
          response = `No problem! Let's start with a brand new profile. 🆕\n\n**What's your name?**`;
          const newProfileTraceId = ctx.getTraceId();
          const result = {
            response,
            extractedData: { _restartNewProfile: true },
            nextStep: 'greeting' as OnboardingStep, // Start at greeting to collect name
            source: 'groq' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'restart_new_profile' },
            traceId: newProfileTraceId || undefined,
            traceUrl: newProfileTraceId ? getTraceUrl(newProfileTraceId) : undefined,
          };
          ctx.setOutput({ response: response.substring(0, 300), action: 'restart_new_profile' });
          return result;
        }

        case 'restart_update_profile': {
          // Signal frontend to restart onboarding but KEEP the same profile ID (update mode)
          response = `Sure! Let's update your profile information. 🔄\n\n**What's your name?** (currently: ${context.name || 'not set'})`;
          const updateProfileTraceId = ctx.getTraceId();
          const result = {
            response,
            extractedData: { _restartUpdateProfile: true },
            nextStep: 'greeting' as OnboardingStep, // Start from greeting to ask name first
            source: 'groq' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'restart_update_profile' },
            traceId: updateProfileTraceId || undefined,
            traceUrl: updateProfileTraceId ? getTraceUrl(updateProfileTraceId) : undefined,
          };
          ctx.setOutput({ response: response.substring(0, 300), action: 'restart_update_profile' });
          return result;
        }

        case 'continue_onboarding': {
          // Find where user left off and resume from there
          const incompleteStep = findFirstIncompleteStep(context);
          const continueTraceId = ctx.getTraceId();
          const continueTraceUrl = continueTraceId ? getTraceUrl(continueTraceId) : undefined;
          if (incompleteStep === 'complete') {
            response = `Your profile is already complete! 🎉 You can:\n\n- **View your plan** - Go to "My Plan"\n- **Update something** - "Change my city to Paris"\n- **Set a new goal** - "I want to save for a laptop"`;
            const result = {
              response,
              extractedData: {},
              nextStep: 'complete' as OnboardingStep,
              source: 'groq' as const,
              intent: { mode: 'conversation' as ChatMode, action: 'continue_onboarding' },
              traceId: continueTraceId || undefined,
              traceUrl: continueTraceUrl,
            };
            ctx.setOutput({ response: response.substring(0, 300), action: 'continue_complete' });
            return result;
          }
          const stepQuestion = getStepQuestion(incompleteStep, context);
          response = `Let's continue! 📝\n\n${stepQuestion}`;
          const result = {
            response,
            extractedData: { _continueOnboarding: true, _resumeAtStep: incompleteStep },
            nextStep: incompleteStep,
            source: 'groq' as const,
            intent: { mode: 'onboarding' as ChatMode, action: 'continue_onboarding' },
            traceId: continueTraceId || undefined,
            traceUrl: continueTraceUrl,
          };
          ctx.setOutput({
            response: response.substring(0, 300),
            action: 'continue_onboarding',
            resumeAt: incompleteStep,
          });
          return result;
        }

        case 'update_name':
          if (intent.extractedValue) {
            extractedData.name = intent.extractedValue;
            response = `Got it! I've updated your name to **${intent.extractedValue}**. 👋\n\nIs there anything else you'd like to change?`;
          } else {
            response = `What would you like to change your name to?`;
          }
          break;

        case 'update':
          if (intent.field === 'city' && intent.extractedValue) {
            extractedData.city = intent.extractedValue;
            response = `Done! I've updated your city to **${intent.extractedValue}**. 🏙️\n\nYou can see this change in the **Profile** tab.`;
          } else if (intent.field === 'budget') {
            // BUG 12 FIX (v2): Proximity-based extraction - associate amounts with nearest keywords
            // Fixes: "Mon loyer est de 800€ et je gagne 3000€" now correctly extracts income=3000, expense=800
            const lower = message.toLowerCase();

            // Keywords with their positions in the string
            const incomeKeywords = [
              'income',
              'earn',
              'salary',
              'get',
              'receive',
              'make',
              'gagne',
              'revenu',
              'salaire',
            ];
            const expenseKeywords = [
              'expense',
              'spend',
              'pay',
              'cost',
              'rent',
              'loyer',
              'dépense',
              'paye',
              'charges',
            ];

            // Find all keyword positions
            type KeywordType = 'income' | 'expense';
            const findKeywordPositions = (
              keywords: string[],
              type: KeywordType
            ): { type: KeywordType; pos: number }[] => {
              const positions: { type: KeywordType; pos: number }[] = [];
              for (const kw of keywords) {
                const regex = new RegExp(`\\b${kw}\\b`, 'gi');
                let match;
                while ((match = regex.exec(lower)) !== null) {
                  positions.push({ type, pos: match.index });
                }
              }
              return positions;
            };

            const incomePositions = findKeywordPositions(incomeKeywords, 'income');
            const expensePositions = findKeywordPositions(expenseKeywords, 'expense');
            const allKeywords = [...incomePositions, ...expensePositions].sort(
              (a, b) => a.pos - b.pos
            );

            // Find all amounts with their positions
            const amountRegex = /[$€£]?\s*(\d[\d,.\s]*)/g;
            const amountsWithPos: { value: number; pos: number }[] = [];
            let amtMatch;
            while ((amtMatch = amountRegex.exec(message)) !== null) {
              const value = parseInt(amtMatch[1].replace(/[^\d]/g, ''), 10);
              if (value > 0) {
                amountsWithPos.push({ value, pos: amtMatch.index });
              }
            }

            // Associate each amount with nearest keyword (proximity-based)
            let detectedIncome: number | null = null;
            let detectedExpense: number | null = null;

            for (const amt of amountsWithPos) {
              let nearestKeyword: { type: KeywordType; pos: number } | null = null;
              let minDistance = Infinity;

              for (const kw of allKeywords) {
                const distance = Math.abs(amt.pos - kw.pos);
                if (distance < minDistance) {
                  minDistance = distance;
                  nearestKeyword = kw;
                }
              }

              if (nearestKeyword) {
                if (nearestKeyword.type === 'income') {
                  detectedIncome = amt.value;
                } else {
                  detectedExpense = amt.value;
                }
              }
            }

            // Fallback: if no keywords found but amounts exist, try to infer from single keyword presence
            if (detectedIncome === null && detectedExpense === null && amountsWithPos.length > 0) {
              const hasIncomeKw = incomePositions.length > 0;
              const hasExpenseKw = expensePositions.length > 0;

              if (hasIncomeKw && !hasExpenseKw) {
                detectedIncome = amountsWithPos[0].value;
              } else if (hasExpenseKw && !hasIncomeKw) {
                detectedExpense = amountsWithPos[0].value;
              } else {
                // No keywords at all - default to income (most common update)
                detectedIncome = amountsWithPos[0].value;
              }
            }

            // Build response based on what was detected
            if (detectedIncome !== null && detectedExpense !== null) {
              extractedData.income = detectedIncome;
              extractedData.expenses = detectedExpense;
              response = `Done! I've updated your budget: income **${detectedIncome}**, expenses **${detectedExpense}**. 💰\n\nYou can see this change in the **Profile** tab.`;
            } else if (detectedIncome !== null) {
              extractedData.income = detectedIncome;
              response = `Done! I've updated your monthly income to **${detectedIncome}**. 💰\n\nYou can see this change in the **Profile** tab.`;
            } else if (detectedExpense !== null) {
              extractedData.expenses = detectedExpense;
              response = `Done! I've updated your monthly expenses to **${detectedExpense}**. 💸\n\nYou can see this change in the **Profile** tab.`;
            } else {
              response = `Sure, I can help you update your budget. What's your new monthly income (and expenses if you want)?`;
            }
          } else if (intent.field === 'work_preferences') {
            // Extract work hours and hourly rate
            const hoursMatch = message.match(/(\d+)\s*h(?:ours?)?/i);
            const rateMatch = message.match(/[$€£]?\s*(\d+)\s*(?:\/h|per\s*h|hourly|€\/h|[$]\/h)/i);

            if (hoursMatch) {
              extractedData.maxWorkHours = parseInt(hoursMatch[1], 10);
            }
            if (rateMatch) {
              extractedData.minHourlyRate = parseInt(rateMatch[1], 10);
            }

            if (extractedData.maxWorkHours || extractedData.minHourlyRate) {
              const updates = [];
              if (extractedData.maxWorkHours)
                updates.push(`max hours: **${extractedData.maxWorkHours}h/week**`);
              if (extractedData.minHourlyRate)
                updates.push(`min rate: **${extractedData.minHourlyRate}/h**`);
              response = `Done! I've updated your work preferences: ${updates.join(', ')}. ⏰\n\nYou can see this change in the **Profile** tab.`;
            } else {
              response = `Sure, I can help you update your work preferences. What's your max hours per week and/or minimum hourly rate?`;
            }
          } else if (intent.field) {
            response = `Sure, I can help you update your ${intent.field.replace('_', ' ')}. What's the new value?`;
          } else {
            response = `I can help you update your profile. What would you like to change?\n\n- Name, diploma, city, skills\n- Work preferences (hours, hourly rate)\n- Budget (income, expenses)`;
          }
          break;

        case 'new_goal': {
          const extractedGoal = intent.extractedGoal;
          const hasName = extractedGoal?.name && extractedGoal.name.length > 0;
          const hasAmount = extractedGoal?.amount && extractedGoal.amount > 0;

          if (hasName && hasAmount) {
            // We have enough info to create the goal
            const goalName = extractedGoal.name!;
            const goalAmount = extractedGoal.amount!;

            // Parse deadline or default to 3 months from now
            let deadlineDate: Date;
            if (extractedGoal.deadline) {
              // Try to parse the deadline string
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
              const monthMatch = extractedGoal.deadline.toLowerCase();
              const monthIndex = monthNames.findIndex((m) => monthMatch.includes(m));
              if (monthIndex !== -1) {
                const year = new Date().getFullYear();
                const targetMonth = monthIndex;
                deadlineDate = new Date(year, targetMonth + 1, 0); // Last day of month
                if (deadlineDate < new Date()) {
                  deadlineDate = new Date(year + 1, targetMonth + 1, 0); // Next year
                }
              } else {
                deadlineDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 3 months
              }
            } else {
              deadlineDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 3 months
            }

            const deadline = deadlineDate.toISOString().split('T')[0];

            // Store goal data in extractedData for the frontend to save
            extractedData.newGoal = {
              name: goalName,
              amount: goalAmount,
              deadline,
              status: 'active',
              priority: 1,
            };

            const currencySymbol = getCurrencySymbol(context.currency as string);
            response = `I've created a new goal for you!\n\n🎯 **${goalName}**\n💰 Target: ${currencySymbol}${goalAmount}\n📅 Deadline: ${deadline}\n\nYou can view and manage this goal in the **Goals** tab of My Plan!`;
          } else if (hasName || hasAmount) {
            // Partial info - ask for the missing piece
            const currencySymbol = getCurrencySymbol(context.currency as string);
            if (hasName && !hasAmount) {
              response = `Great, saving for **${extractedGoal?.name}**! How much do you need to save for it?`;
            } else {
              response = `Got it, ${currencySymbol}${extractedGoal?.amount}! What are you saving for?`;
            }
          } else {
            const currencySymbol = getCurrencySymbol(context.currency as string);
            response = `Great idea to set a new goal! Tell me:\n\n1. **What** are you saving for?\n2. **How much** do you need?\n3. **By when** do you need it?\n\nFor example: "Save ${currencySymbol}500 for a vacation by June"`;
          }
          break;
        }

        case 'check_progress': {
          const goalName = context.goalName || 'your goal';
          const goalAmount = context.goalAmount || 'your target';
          const currencySymbol = getCurrencySymbol(context.currency as string);
          response = `You're working towards **${goalName}** with a target of **${currencySymbol}${goalAmount}**.\n\nHead to **My Plan** to see your detailed progress, timeline, and weekly targets!`;
          break;
        }

        case 'get_advice':
          response = `Here are some tips to save more:\n\n- **Track expenses** - Small purchases add up\n- **Cook at home** - Campus cafeteria is cheaper than restaurants\n- **Sell unused items** - Textbooks, electronics, clothes\n- **Freelance your skills** - Even a few hours/week helps\n\nWant me to analyze your specific situation?`;
          break;

        case 'view_plan':
          response = `Your plan is ready in **My Plan**! There you can:\n\n- View your savings timeline\n- Track weekly progress\n- See job recommendations\n- Explore "what if" scenarios\n\nClick on "My Plan" to get started!`;
          break;

        default: {
          // Span 3: LLM Generation (type: llm with model and provider)
          response = await ctx.createChildSpan(
            'chat.llm_generation',
            async (span) => {
              const client = getGroqClient();
              if (client) {
                try {
                  // Fetch RAG context for personalized response (non-blocking)
                  const ragContext = await fetchRAGContext(message, profileId);
                  const ragSection = ragContext
                    ? `\n${ragContext}\nUse this context from similar students to personalize your advice.\n`
                    : '';

                  span.setAttributes({
                    'rag.available': ragContext.length > 0,
                    'rag.context_length': ragContext.length,
                  });

                  const completion = await client.chat.completions.create({
                    model: GROQ_MODEL,
                    messages: [
                      {
                        role: 'system',
                        content: `${SYSTEM_PROMPTS.onboarding}

The user has already completed onboarding. Their profile: ${JSON.stringify(context)}.
${ragSection}
Help them with general questions about their finances, savings plan, or profile.
Keep responses concise (2-3 sentences). Suggest going to "My Plan" for detailed information.`,
                      },
                      { role: 'user', content: message },
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
                  });

                  const llmResponse =
                    completion.choices[0]?.message?.content ||
                    "I'm here to help! You can ask about your plan, update your profile, or get savings advice.";

                  // Set span attributes for LLM call
                  span.setAttributes({
                    response_length: llmResponse.length,
                    used_llm: true,
                  });

                  // Set token usage for Opik cost tracking
                  if (completion.usage) {
                    span.setUsage({
                      prompt_tokens: completion.usage.prompt_tokens || 0,
                      completion_tokens: completion.usage.completion_tokens || 0,
                      total_tokens: completion.usage.total_tokens || 0,
                    });
                  }

                  span.setOutput({ response: llmResponse.substring(0, 200) });
                  return llmResponse;
                } catch {
                  span.setAttributes({ error: true, used_llm: false });
                  return "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **My Plan** for your personalized recommendations.";
                }
              } else {
                span.setAttributes({ error: false, used_llm: false, reason: 'no_client' });
                return "I'm here to help! You can ask about your plan, update your profile, or get savings advice. Check out **My Plan** for your personalized recommendations.";
              }
            },
            {
              type: 'llm',
              model: GROQ_MODEL,
              provider: 'groq',
              input: { message: message.substring(0, 200) },
            }
          );
        }
      }

      const traceId = getCurrentTraceId();
      const traceUrl = traceId ? getTraceUrl(traceId) : undefined;
      ctx.setAttributes({
        'chat.response_length': response.length,
        'chat.extracted_fields': Object.keys(extractedData).length,
      });
      ctx.setOutput({ response: response.substring(0, 300), intent });

      return {
        response,
        extractedData,
        nextStep: 'complete' as OnboardingStep,
        intent,
        traceId: traceId || undefined,
        traceUrl,
        source: 'groq' as const,
      };
    },
    traceOptions
  );
}
