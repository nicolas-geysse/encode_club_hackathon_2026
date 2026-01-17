/**
 * Onboarding Agent with Groq JSON Mode
 *
 * Uses Groq SDK with JSON mode for reliable structured extraction.
 * Falls back to regex extraction if Groq fails.
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
  name: 'profile',
  studies: 'profile',
  skills: 'skills',
  location: 'profile',
  budget: 'profile',
  work_preferences: 'profile',
  goal: 'setup',
  academic_events: 'setup',
  inventory: 'inventory',
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

export interface ProfileData {
  name?: string;
  diploma?: string;
  field?: string;
  city?: string;
  skills?: string[];
  income?: number;
  expenses?: number;
  maxWorkHours?: number;
  minHourlyRate?: number;
  goalName?: string;
  goalAmount?: number;
  goalDeadline?: string;
  academicEvents?: AcademicEvent[];
  inventoryItems?: InventoryItem[];
  subscriptions?: Subscription[];
}

export interface OnboardingInput {
  message: string;
  currentStep: string;
  existingProfile: ProfileData;
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
- name: first name (string)
- diploma: study level like "Master", "Bachelor", "PhD", "Freshman" (string)
- field: field of study like "Computer Science", "Law" (string)
- city: city name (string)
- skills: list of skills (array of strings)
- income: monthly income in dollars/euros (number)
- expenses: monthly expenses (number)
- maxWorkHours: max hours per week for work (number)
- minHourlyRate: minimum hourly rate (number)
- goalName: what they're saving for (string)
- goalAmount: target savings amount (number)
- goalDeadline: when they want to reach the goal (string)
- academicEvents: array of {name, type} for exams/vacations
- inventoryItems: array of {name, category} for items to sell
- subscriptions: array of {name, currentCost} for subscriptions

Be generous with extraction. Accept common variations:
- "Master's in CS" → diploma: "Master", field: "Computer Science"
- "I'm Nicolas" or "Nicolas" → name: "Nicolas"
- "Paris" or "I live in Paris" → city: "Paris"
- "Python, JavaScript" or "I know Python and JS" → skills: ["Python", "JavaScript"]
- "none" or "nothing" for optional fields → empty array []

IMPORTANT: Netflix, Spotify, Amazon are subscriptions, NOT names.`;

/**
 * Get the extraction prompt for a specific step
 */
function getExtractionPrompt(step: string, message: string, existing: ProfileData): string {
  // Tell the model what we're looking for based on the current step
  const stepContext: Record<string, string> = {
    greeting: 'We are asking for their NAME.',
    name: 'We are asking about their STUDIES (diploma level and field).',
    studies: 'We are asking about their SKILLS (programming, languages, tutoring, etc.).',
    skills: 'We are asking about their CITY of residence.',
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
 * Extract data using Groq JSON mode
 */
async function extractWithGroq(
  message: string,
  step: string,
  existing: ProfileData
): Promise<ExtractionResult | null> {
  const client = getGroqClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: getExtractionPrompt(step, message, existing) },
      ],
      temperature: 0.0, // Deterministic for reliable extraction
      max_tokens: 512,
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
        if (Array.isArray(value) && value.length === 0) {
          // Keep empty arrays for "none" responses
          (cleaned as Record<string, unknown>)[key] = value;
        } else if (!Array.isArray(value) || value.length > 0) {
          (cleaned as Record<string, unknown>)[key] = value;
        }
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
    console.error('[Groq JSON] Extraction failed:', error);
    return null;
  }
}

/**
 * Process an onboarding message using Groq JSON mode
 * Falls back to regex extraction if Groq fails
 */
export async function processWithMastraAgent(input: OnboardingInput): Promise<OnboardingOutput> {
  // Build trace options with input for Opik visibility
  // Include tab tag to show which tab this step feeds
  const targetTab = STEP_TO_TAB[input.currentStep] || 'unknown';
  const traceOptions: TraceOptions = {
    source: 'groq_json_mode',
    input: {
      message: input.message,
      currentStep: input.currentStep,
      existingProfile: input.existingProfile,
    },
    tags: ['onboarding', input.currentStep, `tab:${targetTab}`],
  };

  return trace(
    'onboarding.extraction',
    async (span) => {
      span.setAttributes({
        'input.step': input.currentStep,
        'input.message_length': input.message.length,
        'llm.model': GROQ_MODEL,
      });

      // Try Groq JSON mode first
      const groqResult = await extractWithGroq(
        input.message,
        input.currentStep,
        input.existingProfile
      );

      let extractedData: ProfileData;
      let source: 'groq' | 'fallback';
      let tokenUsage: TokenUsage | null = null;

      if (groqResult && Object.keys(groqResult.data).length > 0) {
        extractedData = groqResult.data;
        tokenUsage = groqResult.usage;
        source = 'groq';

        // Set attributes for metadata (non-usage info)
        span.setAttributes({
          'output.method': 'groq_json_mode',
          'output.extracted_fields': Object.keys(extractedData).length,
          'output.extracted_keys': Object.keys(extractedData).join(','),
          'llm.model': GROQ_MODEL,
          'llm.cost.total': tokenUsage.estimatedCost,
        });

        // Use setUsage() for token counts - this sets at root level for proper Opik display
        span.setUsage({
          prompt_tokens: tokenUsage.promptTokens,
          completion_tokens: tokenUsage.completionTokens,
          total_tokens: tokenUsage.totalTokens,
        });
      } else if (groqResult) {
        // Groq returned but no data extracted - still log usage
        tokenUsage = groqResult.usage;
        extractedData = extractWithRegex(input.message, input.currentStep, input.existingProfile);
        source = 'fallback';
        span.setAttributes({
          'output.method': 'regex_fallback',
          'output.extracted_fields': Object.keys(extractedData).length,
          'output.groq_empty': true,
          'llm.model': GROQ_MODEL,
          'llm.cost.total': tokenUsage.estimatedCost,
        });

        // Still set usage even when falling back to regex
        span.setUsage({
          prompt_tokens: tokenUsage.promptTokens,
          completion_tokens: tokenUsage.completionTokens,
          total_tokens: tokenUsage.totalTokens,
        });
      } else {
        // Groq failed completely
        extractedData = extractWithRegex(input.message, input.currentStep, input.existingProfile);
        source = 'fallback';
        span.setAttributes({
          'output.method': 'regex_fallback',
          'output.extracted_fields': Object.keys(extractedData).length,
          'output.groq_failed': true,
        });
      }

      const hasExtracted = Object.keys(extractedData).length > 0;

      // Determine next step
      const nextStep = hasExtracted ? getNextStep(input.currentStep) : input.currentStep;
      const didAdvance = nextStep !== input.currentStep;

      // Generate appropriate response
      const response = hasExtracted
        ? getAdvanceMessage(nextStep, { ...input.existingProfile, ...extractedData })
        : getClarificationMessage(input.currentStep);

      span.setAttributes({
        'output.next_step': nextStep,
        'output.did_advance': didAdvance,
        'output.source': source,
      });

      const result: OnboardingOutput = {
        response,
        extractedData,
        nextStep,
        isComplete: nextStep === 'complete',
        profileData: { ...input.existingProfile, ...extractedData },
        source,
      };

      // Set output for Opik UI (includes usage summary)
      span.setOutput({
        response: result.response,
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
 * - At 'greeting': collecting NAME
 * - At 'name': collecting STUDIES
 * - At 'studies': collecting SKILLS
 * - etc.
 */
function getClarificationMessage(step: string): string {
  const clarifications: Record<string, string> = {
    // At greeting step, we're collecting NAME
    greeting: "I didn't catch your name. What should I call you?",
    // At name step, we're collecting STUDIES (not name!)
    name: "I need to know about your studies. What's your level (Bachelor, Master, PhD) and field?",
    // At studies step, we're collecting SKILLS
    studies: 'What skills do you have? (coding, languages, music, sports...)',
    // At skills step, we're collecting LOCATION
    skills: 'Where do you live? Just tell me the city name.',
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
 * - step='greeting' → we're collecting NAME
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
      // At greeting step, we're collecting NAME
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
      // At skills step (skills were just collected), we're collecting LOCATION
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

      if (extracted.goalAmount && !extracted.goalName) {
        extracted.goalName = 'Savings Goal';
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
          .map((name) => ({ name, type: 'busy' as const }));
        if (events.length > 0) {
          extracted.academicEvents = events;
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
      // At inventory step, we're collecting LIFESTYLE (subscriptions)
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
 * Flow: greeting→name→studies→skills→location→budget→work_preferences→goal→academic_events→inventory→lifestyle→complete
 * - At 'greeting': collect name → advance to 'name'
 * - At 'name': collect studies → advance to 'studies'
 * - etc.
 */
function getAdvanceMessage(nextStep: string, profile: ProfileData): string {
  const name = profile.name || '';

  const messages: Record<string, string> = {
    // Advancing TO 'name' means we just got the name, now ask for studies
    name: `Nice to meet you${name ? `, ${name}` : ''}! What are you studying? (level and field)`,
    // Advancing TO 'studies' means we just got studies, now ask for skills
    studies: `Great${name ? `, ${name}` : ''}! What skills do you have? (coding, languages, tutoring, music...)`,
    // Advancing TO 'skills' means we just got skills, now ask for location
    skills: `Awesome skills! Where do you live?`,
    // Advancing TO 'location' means we just got location, now ask for budget
    location: `Got it! Now about your budget - how much do you earn and spend per month?`,
    // Advancing TO 'budget' means we just got budget, now ask for work preferences
    budget: `Thanks! How many hours per week can you work, and what's your minimum hourly rate?`,
    // Advancing TO 'work_preferences' means we just got work prefs, now ask for goal
    work_preferences: `Perfect! What's your savings goal? (what, how much, by when)`,
    // Advancing TO 'goal' means we just got goal, now ask for academic events
    goal: `Great goal! Any upcoming exams or busy periods to plan around? (or say 'none')`,
    // Advancing TO 'academic_events' means we just got events, now ask for inventory
    academic_events: `Noted! Any items you could sell for extra cash? (textbooks, electronics... or 'none')`,
    // Advancing TO 'inventory' means we just got inventory, now ask for lifestyle
    inventory: `Thanks! What subscriptions do you pay for? (Netflix, Spotify, gym... or 'none')`,
    // Advancing TO 'lifestyle' means we just got subscriptions, now ask for confirmation
    lifestyle: `Almost done! Anything else you'd like to add? (or say 'done')`,
    // Advancing TO 'complete' means onboarding is done
    complete: `Your profile is complete${name ? `, ${name}` : ''}! Head to "My Plan" to see your personalized strategies.`,
  };

  return messages[nextStep] || `Great${name ? `, ${name}` : ''}! Let's continue.`;
}

export default {
  processWithMastraAgent,
};
