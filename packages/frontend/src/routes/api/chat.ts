/**
 * Chat API Route
 *
 * Handles LLM-powered chat for onboarding and general conversation.
 * Uses Groq for completion and Opik for tracing.
 */

import type { APIEvent } from '@solidjs/start/server';
import Groq from 'groq-sdk';

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

// Onboarding step types
type OnboardingStep =
  | 'greeting'
  | 'name'
  | 'studies'
  | 'skills'
  | 'location'
  | 'budget'
  | 'work_preferences'
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

  budget: `The user has {income}€ income and {expenses}€ expenses per month (margin: {margin}€).
Generate a response of 2-3 sentences that:
1. Briefly comments on their budget (positive if margin >0, encouraging otherwise)
2. Asks about their work preferences (max hours per week, minimum hourly rate)`,

  work_preferences: `The user can work {maxWorkHours}h/week, minimum {minHourlyRate}€/h.
Complete profile: {name}, {diploma} {field}, skills: {skills}, city: {city}.
Generate a response of 3-4 sentences that:
1. Briefly summarizes their profile
2. Congratulates them on completing the onboarding
3. Invites them to go to "My Plan" to set a savings goal`,

  complete: '',
};

// Extraction prompt template
const EXTRACTION_PROMPT = `Extract information from the following user message.
Return ONLY valid JSON with the found fields.

Possible fields:
- name: string (first name)
- diploma: string (Freshman, Sophomore, Junior, Senior, Graduate, etc.)
- field: string (field of study)
- city: string (city)
- income: number (monthly income in euros)
- expenses: number (monthly expenses in euros)
- skills: string[] (skills)
- maxWorkHours: number (max work hours per week)
- minHourlyRate: number (minimum hourly rate in euros)

Message: "{message}"
Previous context: {context}

JSON:`;

interface ChatRequest {
  message: string;
  step: OnboardingStep;
  context?: Record<string, unknown>;
}

interface ChatResponse {
  response: string;
  extractedData: Record<string, unknown>;
  nextStep: OnboardingStep;
}

// POST: Handle chat message
export async function POST(event: APIEvent) {
  const startTime = Date.now();

  try {
    const body = (await event.request.json()) as ChatRequest;
    const { message, step, context = {} } = body;

    if (!message || !step) {
      return new Response(
        JSON.stringify({ error: true, message: 'message and step are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const client = getGroqClient();
    if (!client) {
      // Fallback: return simple response without LLM
      return new Response(JSON.stringify(getFallbackResponse(message, step, context)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Extract data from user message
    const extractedData = await extractDataFromMessage(client, message, context);

    // Merge with existing context
    const updatedContext = { ...context, ...extractedData };

    // Step 2: Determine next step
    const nextStep = getNextStep(step);

    // Step 3: Generate response for next step
    let response: string;
    if (nextStep === 'complete') {
      response = generateCompletionMessage(updatedContext);
    } else {
      response = await generateStepResponse(client, nextStep, updatedContext);
    }

    const result: ChatResponse = {
      response,
      extractedData,
      nextStep,
    };

    // Log trace info
    console.error(`[Chat API] Step: ${step} -> ${nextStep}, Duration: ${Date.now() - startTime}ms`);

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
  try {
    const prompt = EXTRACTION_PROMPT.replace('{message}', message).replace(
      '{context}',
      JSON.stringify(context)
    );

    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.extraction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1, // Low temperature for consistent extraction
      max_tokens: 256,
    });

    const content = completion.choices[0]?.message?.content || '{}';

    // Try to parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return {};
  } catch (error) {
    console.error('Extraction error:', error);
    // Fallback: try basic regex extraction
    return extractDataWithRegex(message);
  }
}

// Generate response for a specific step
async function generateStepResponse(
  client: Groq,
  step: OnboardingStep,
  context: Record<string, unknown>
): Promise<string> {
  const promptTemplate = STEP_PROMPTS[step];
  if (!promptTemplate) {
    return 'Continuons!';
  }

  // Interpolate context into prompt
  let prompt = promptTemplate;
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    const stringValue = Array.isArray(value) ? value.join(', ') : String(value || '');
    prompt = prompt.split(placeholder).join(stringValue);
  }

  // Calculate margin if we have income and expenses
  if (context.income && context.expenses) {
    const margin = Number(context.income) - Number(context.expenses);
    prompt = prompt.split('{margin}').join(String(margin));
  }

  try {
    const completion = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.onboarding },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return completion.choices[0]?.message?.content || 'Continuons!';
  } catch (error) {
    console.error('Response generation error:', error);
    return getFallbackStepResponse(step, context);
  }
}

// Get next step in the flow
function getNextStep(currentStep: OnboardingStep): OnboardingStep {
  const flow: OnboardingStep[] = [
    'greeting',
    'name',
    'studies',
    'skills',
    'location',
    'budget',
    'work_preferences',
    'complete',
  ];
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

// Basic regex extraction fallback
function extractDataWithRegex(message: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const lower = message.toLowerCase();

  // Name (first word that looks like a name)
  const nameMatch = message.match(/^([A-Z][a-z]+)/);
  if (nameMatch) {
    data.name = nameMatch[1];
  }

  // Diploma
  const diplomaMatch = lower.match(/\b(l[1-3]|m[1-2]|bts|dut|licence|master)\b/i);
  if (diplomaMatch) {
    data.diploma = diplomaMatch[1].toUpperCase();
  }

  // Field
  if (lower.includes('info') || lower.includes('dev')) data.field = 'Informatique';
  else if (lower.includes('droit')) data.field = 'Droit';
  else if (lower.includes('commerce') || lower.includes('business')) data.field = 'Commerce';
  else if (lower.includes('langue')) data.field = 'Langues';

  // Numbers (income, expenses, hours, rate)
  const numbers = message.match(/(\d+)/g);
  if (numbers) {
    const nums = numbers.map(Number);
    // Heuristics: larger numbers are likely income/expenses, smaller are hours/rate
    for (const num of nums) {
      if (num >= 200 && !data.income) data.income = num;
      else if (num >= 100 && data.income && !data.expenses) data.expenses = num;
      else if (num <= 30 && num > 5 && !data.maxWorkHours) data.maxWorkHours = num;
      else if (num <= 30 && num > 5 && data.maxWorkHours && !data.minHourlyRate)
        data.minHourlyRate = num;
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
  const extractedData = extractDataWithRegex(message);
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
      return `Got it for the budget!\n\nLast question: how many hours max per week can you work? And what's your minimum hourly rate?`;
    case 'work_preferences':
      return generateCompletionMessage(context);
    default:
      return "Let's continue!";
  }
}
