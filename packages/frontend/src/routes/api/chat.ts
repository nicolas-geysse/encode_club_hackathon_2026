/**
 * Chat API Route
 *
 * Handles LLM-powered chat for onboarding and general conversation.
 * Uses Mastra agent for intelligent extraction (with Groq fallback).
 * Traces everything to Opik for observability.
 */

import type { APIEvent } from '@solidjs/start/server';
import Groq from 'groq-sdk';
import { trace, logFeedbackScores, getCurrentTraceId, type TraceOptions } from '../../lib/opik';
import { processWithMastraAgent, type ProfileData } from '../../lib/mastraAgent';

// Feature flag for Mastra agent (set to false to use legacy Groq-only approach)
const USE_MASTRA_AGENT = process.env.USE_MASTRA_AGENT !== 'false';

// Groq configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Initialize Groq client
let groqClient: Groq | null = null;

function getGroqClient(): Groq | null {
  if (!groqClient && GROQ_API_KEY) {
    groqClient = new Groq({ apiKey: GROQ_API_KEY });
  }
  return groqClient;
}

// Onboarding step types (extended for full tab population)
type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'studies'
  | 'skills'
  | 'location'
  | 'budget'
  | 'work_preferences'
  | 'goal' // NEW: Savings goal
  | 'academic_events' // NEW: Exams, vacations
  | 'inventory' // NEW: Items to sell
  | 'lifestyle' // NEW: Subscriptions
  | 'complete';

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
  name: `The user just gave their first name "{name}".
Generate a warm response of 2-3 sentences that:
1. Welcomes the user by their first name
2. Asks about their studies (level and field, e.g., "Junior CS", "Senior Law")`,

  studies: `The user studies {diploma} {field}.
Generate a response of 2-3 sentences that:
1. Comments positively on their studies
2. Asks about their skills (coding, languages, design, sports, etc.)`,

  skills: `The user has these skills: {skills}.
Generate a response of 2-3 sentences that:
1. Values their skills
2. Asks for their city of residence`,

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
- inventoryItems: items they could sell (string description or array)
- subscriptions: subscriptions they have (string description or array)

Only include fields that are clearly mentioned. If unsure, skip the field.

User message: "${'{message}'}"

JSON:`;

interface ChatRequest {
  message: string;
  step: OnboardingStep;
  context?: Record<string, unknown>;
  /** Thread ID for grouping conversation turns in Opik */
  threadId?: string;
  /** Profile ID for user identification */
  profileId?: string;
}

interface ChatResponse {
  response: string;
  extractedData: Record<string, unknown>;
  nextStep: OnboardingStep;
  /** Trace ID for this turn (useful for feedback) */
  traceId?: string;
}

// POST: Handle chat message
export async function POST(event: APIEvent) {
  try {
    const body = (await event.request.json()) as ChatRequest;
    const { message, step, context = {}, threadId, profileId } = body;

    if (!message || !step) {
      return new Response(
        JSON.stringify({ error: true, message: 'message and step are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build trace options with threadId for conversation grouping
    const traceOptions: TraceOptions = {
      source: 'frontend_api',
      threadId: threadId, // Groups all turns of a conversation in Opik UI
      input: {
        message: message.substring(0, 500),
        step,
        profileId,
      },
      tags: ['onboarding', step],
    };

    // Try Mastra agent first (if enabled)
    if (USE_MASTRA_AGENT) {
      try {
        const mastraResult = await processWithMastraAgent({
          message,
          currentStep: step,
          existingProfile: context as ProfileData,
        });

        // Get trace ID for response
        const traceId = getCurrentTraceId();

        // Log automatic feedback scores based on extraction quality
        if (traceId) {
          const extractedCount = Object.keys(mastraResult.extractedData).length;
          const didAdvance = mastraResult.nextStep !== step;

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

        // Convert to ChatResponse format
        const result: ChatResponse = {
          response: mastraResult.response,
          extractedData: mastraResult.extractedData,
          nextStep: mastraResult.nextStep as OnboardingStep,
          traceId: traceId || undefined,
        };

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (mastraError) {
        console.error('Mastra agent failed, falling back to Groq:', mastraError);
        // Fall through to legacy Groq approach
      }
    }

    // Legacy Groq-only approach (fallback)
    const client = getGroqClient();
    if (!client) {
      // Fallback: return simple response without LLM
      return new Response(JSON.stringify(getFallbackResponse(message, step, context)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
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

        return {
          response,
          extractedData,
          nextStep,
          traceId: currentTraceId || undefined,
        } as ChatResponse;
      },
      traceOptions // Use full trace options with threadId
    );

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
    'name',
    'studies',
    'skills',
    'location',
    'budget',
    'work_preferences',
    'goal',
    'academic_events',
    'inventory',
    'lifestyle',
    'complete',
  ];

  // Define what data is required for each step to advance
  const requiredFields: Record<OnboardingStep, string[]> = {
    greeting: ['name'],
    name: ['diploma', 'field'],
    studies: ['skills'],
    skills: ['city'],
    location: ['income', 'expenses'],
    budget: ['maxWorkHours', 'minHourlyRate'],
    work_preferences: ['goalName', 'goalAmount', 'goalDeadline'],
    goal: [], // academic_events is optional, always advance
    academic_events: [], // inventory is optional, always advance
    inventory: [], // subscriptions is optional, always advance
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
    greeting: "I didn't catch your name. What should I call you?",
    name: "I need to know about your studies. What's your level (Bachelor, Master, PhD) and field (like Computer Science, Law, Business)?",
    studies:
      "I'd love to know your skills! What are you good at? (coding languages, languages, design, sports, tutoring...)",
    skills: 'Where do you live? Just tell me the city name.',
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
  const moneyMatch = original.match(/(\d+)\s*[€$£]/g) || original.match(/[€$£]\s*(\d+)/g);
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

  // Goal deadline (months)
  const monthMatch = lower.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/i
  );
  if (monthMatch) {
    const month = monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1).toLowerCase();
    const yearMatch = original.match(/20\d{2}/);
    data.goalDeadline = yearMatch ? `${month} ${yearMatch[0]}` : `${month} 2026`;
  }
  // Relative deadlines
  const relativeDeadline = lower.match(/\b(in|within)\s+(\d+)\s+(months?|weeks?|years?)\b/i);
  if (relativeDeadline) {
    data.goalDeadline = `in ${relativeDeadline[2]} ${relativeDeadline[3]}`;
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
  if (numbers.length > 0 && !data.income && !data.expenses && !data.maxWorkHours) {
    for (const num of numbers) {
      if (num >= 500 && num <= 10000 && !data.income) {
        data.income = num;
      } else if (num >= 100 && num <= 5000 && data.income && !data.expenses) {
        data.expenses = num;
      } else if (num >= 5 && num <= 40 && !data.maxWorkHours) {
        data.maxWorkHours = num;
      } else if (num >= 8 && num <= 100 && data.maxWorkHours && !data.minHourlyRate) {
        data.minHourlyRate = num;
      } else if (num >= 100 && num <= 50000 && !data.goalAmount) {
        data.goalAmount = num;
      }
    }
  }

  // Simple yes/no detection for inventory/subscriptions
  if (lower.match(/\b(yes|yeah|yep|sure|of course|i do|i have)\b/i)) {
    // Check context to see what question was asked
    // This is a simple acknowledgment, LLM will need to get details
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
    case 'name':
      return `Great ${context.name || ''}! Nice to meet you.\n\nWhat are you studying? (e.g., "Junior CS", "Senior Law")`;
    case 'studies':
      return `${context.diploma || ''} ${context.field || ''}, cool!\n\nWhat are your skills? (coding, languages, design, sports...)`;
    case 'skills':
      return `Nice!\n\nWhere do you live? What city?`;
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
      return `Good to know!\n\nWhat subscriptions or recurring expenses do you have? (streaming, gym, phone plan, etc.)`;
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
  context: Record<string, unknown>
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
