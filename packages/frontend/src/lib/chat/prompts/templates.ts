/**
 * Prompt Templates
 *
 * System prompts and step-specific prompts for the onboarding chat.
 */

import type { OnboardingStep } from '../types';

// =============================================================================
// System Prompts
// =============================================================================

export const SYSTEM_PROMPTS = {
  onboarding: `You are Bruno, a friendly and enthusiastic financial coach for students.
You ask simple questions to understand their financial situation.
You are encouraging and use casual but respectful language (no vulgarity).
You adapt to the level of detail the user provides.
You NEVER give risky or speculative investment advice.
Always respond in English. Keep your responses concise (2-4 sentences max).`,

  extraction: `You are an assistant that extracts structured information from user messages.
Respond ONLY with valid JSON, no text before or after.`,
};

// =============================================================================
// Step Prompts (for LLM response generation)
// =============================================================================

/**
 * Step-specific prompts for generating responses
 * OPTIMIZED: City is now asked first (greeting step) to enable early background data fetching
 */
export const STEP_PROMPTS: Record<OnboardingStep, string> = {
  greeting: '', // Initial greeting asks for city
  currency_confirm: `The user's city didn't match a known region for auto-detection.
Generate a short response of 1-2 sentences asking which currency they use:
- USD (US)
- GBP (UK)
- EUR (Europe)

Be friendly and concise. Example: "I couldn't detect your region automatically. Are you in the US (USD), UK (GBP), or Europe (EUR)?"`,
  name: `The user lives in {city} ({currency}).
Generate a warm response of 2-3 sentences that:
1. Acknowledges their city
2. Asks for their first name

Be friendly and casual. Example: "Great, {city}! What's your name? I'd love to know who I'm helping today!"`,
  studies: `The user just gave their first name "{name}".
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

  skills: `The user studies {diploma} {field}.
Generate a response of 2-3 sentences that:
1. Comments positively on their studies
2. Asks about their skills (coding, languages, design, sports, etc.)`,

  certifications: `The user has these skills: {skills}.
Generate a response of 2-3 sentences that:
1. Values their skills
2. Asks about professional certifications they might have

Mention examples like:
🇫🇷 France: BAFA, BNSSA, PSC1, SST
🇬🇧 UK: DBS, First Aid, NPLQ
🇺🇸 US: CPR/First Aid, Lifeguard, Food Handler
🌍 International: PADI diving, TEFL teaching

Tell them to say "none" if they don't have any.`,

  budget: `The user has \${income} income and \${expenses} expenses per month (margin: \${margin}).
Generate a response of 2-3 sentences that:
1. Briefly comments on their budget (positive if margin >0, encouraging otherwise)
2. Asks about their work preferences (max hours per week, minimum hourly rate)`,

  work_preferences: `The user can work {maxWorkHours}h/week, minimum \${minHourlyRate}/h.
Generate a response of 2-3 sentences that:
1. Acknowledges their work preferences
2. Asks about their savings goal (what they want to save for, how much, and by when)
Example goals: "emergency fund", "laptop", "vacation", "graduation security", etc.`,

  goal: `The user wants to save for "{goalName}" with a target of \${goalAmount} by {goalDeadline}.
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
Complete profile: {name}, {diploma} {field}, skills: {skills}, city: {city}, goal: {goalName} (\${goalAmount}).
Generate a response of 3-4 sentences that:
1. Briefly summarizes their complete profile
2. Mentions the key insights (budget margin, goal timeline, potential optimizations)
3. Congratulates them on completing the setup
4. Invites them to go to "My Plan" where everything is ready`,

  complete: '',
};

// =============================================================================
// Extraction Prompt Template
// =============================================================================

export const EXTRACTION_PROMPT = `Extract info from user message. Return ONLY a JSON object, nothing else.

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

User message: "\${message}"

JSON:`;

// =============================================================================
// Groq Extraction System Prompt
// =============================================================================

export const GROQ_EXTRACTION_SYSTEM_PROMPT = `You are an extraction assistant. Extract profile information from user messages.
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
- inventoryItems: array of {name, category, estimatedValue?} for items to sell
- subscriptions: array of {name, currentCost} for subscriptions

Be generous with extraction. Accept common variations:
- "Master's in CS" → diploma: "Master", field: "Computer Science"
- "I'm Nicolas" or "Nicolas" → name: "Nicolas"
- "Paris" or "I live in Paris" → city: "Paris"
- "Python, JavaScript" or "I know Python and JS" → skills: ["Python", "JavaScript"]
- "none" or "nothing" for optional fields → empty array []

IMPORTANT: Remove trailing punctuation (!?.,-;:) from names.
Example: "Kiki !" → name: "Kiki"

IMPORTANT: Netflix, Spotify, Amazon are subscriptions, NOT names.`;

// =============================================================================
// Step-Specific Extraction Contexts
// =============================================================================

export const EXTRACTION_STEP_CONTEXT: Record<string, string> = {
  greeting:
    'We are asking for their CITY of residence. Extract city name and auto-detect currency from known cities (Paris→EUR, London→GBP, New York→USD).',
  currency_confirm:
    'We are asking for their CURRENCY preference (US/USD, UK/GBP, or Europe/EUR). Extract currency: USD, EUR, or GBP.',
  name: 'We are asking for their NAME.',
  studies: 'We are asking about their STUDIES (diploma level and field).',
  skills: 'We are asking about their SKILLS (programming, languages, tutoring, etc.).',
  certifications:
    'We are asking about their CERTIFICATIONS (BAFA, lifeguard, CPR, TEFL, etc.). "none" means empty array.',
  budget: 'We are asking about their BUDGET (monthly income and expenses).',
  work_preferences:
    'We are asking about WORK PREFERENCES (max hours per week, minimum hourly rate).',
  goal: 'We are asking about their SAVINGS GOAL (what, how much, deadline).',
  academic_events:
    'We are asking about ACADEMIC EVENTS (exams, vacations, busy periods). "none" means empty array.',
  inventory: 'We are asking about INVENTORY items to sell. "none" means empty array.',
  trade:
    'We are asking about TRADE opportunities (borrow, lend, swap with friends). "none" means empty array.',
  lifestyle:
    'We are asking about SUBSCRIPTIONS (Netflix, Spotify, gym, etc.). "none" means empty array.',
  complete: 'Profile is complete. Accept any acknowledgment.',
};
