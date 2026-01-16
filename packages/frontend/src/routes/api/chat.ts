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
  onboarding: `Tu es Bruno, un coach financier bienveillant et enthousiaste pour etudiants francais.
Tu poses des questions simples pour comprendre leur situation financiere.
Tu es encourageant et utilises un langage jeune mais respectueux (pas de vulgarite).
Tu t'adaptes au niveau de detail que donne l'utilisateur.
Tu ne donnes JAMAIS de conseils d'investissement risques ou speculatifs.
Reponds toujours en francais. Tes reponses sont concises (2-4 phrases max).`,

  extraction: `Tu es un assistant qui extrait des informations structurees des messages utilisateur.
Reponds UNIQUEMENT avec un JSON valide, sans texte avant ou apres.`,
};

// Step-specific prompts
const STEP_PROMPTS: Record<OnboardingStep, string> = {
  greeting: '',
  name: `L'utilisateur vient de donner son prenom "{name}".
Genere une reponse chaleureuse de 2-3 phrases qui:
1. Accueille l'utilisateur par son prenom
2. Lui demande ses etudes (niveau et domaine, ex: "L2 Info", "M1 Droit")`,

  studies: `L'utilisateur etudie en {diploma} {field}.
Genere une reponse de 2-3 phrases qui:
1. Commente positivement ses etudes
2. Lui demande ses competences (code, langues, design, sport, etc.)`,

  skills: `L'utilisateur a ces competences: {skills}.
Genere une reponse de 2-3 phrases qui:
1. Valorise ses competences
2. Lui demande sa ville de residence`,

  location: `L'utilisateur vit a {city}.
Genere une reponse de 2-3 phrases qui:
1. Mentionne sa ville
2. Lui demande son budget (combien il gagne/touche par mois, et combien il depense)`,

  budget: `L'utilisateur a {income}e de revenus et {expenses}e de depenses par mois (marge: {margin}e).
Genere une reponse de 2-3 phrases qui:
1. Commente son budget brievement (positif si marge >0, encourageant sinon)
2. Lui demande ses preferences de travail (heures max par semaine, taux horaire minimum)`,

  work_preferences: `L'utilisateur peut travailler {maxWorkHours}h/semaine, minimum {minHourlyRate}e/h.
Profil complet: {name}, {diploma} {field}, competences: {skills}, ville: {city}.
Genere une reponse de 3-4 phrases qui:
1. Resume brievement son profil
2. Le felicite d'avoir complete l'onboarding
3. L'invite a aller dans "Mon Plan" pour definir un objectif d'epargne`,

  complete: '',
};

// Extraction prompt template
const EXTRACTION_PROMPT = `Extrais les informations du message utilisateur suivant.
Retourne UNIQUEMENT un JSON valide avec les champs trouves.

Champs possibles:
- name: string (prenom)
- diploma: string (L1, L2, L3, M1, M2, BTS, DUT, Licence, Master)
- field: string (domaine d'etudes)
- city: string (ville)
- income: number (revenus mensuels en euros)
- expenses: number (depenses mensuelles en euros)
- skills: string[] (competences)
- maxWorkHours: number (heures de travail max par semaine)
- minHourlyRate: number (taux horaire minimum en euros)

Message: "{message}"
Contexte precedent: {context}

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
  const name = context.name || 'toi';
  return `Parfait ${name}! J'ai tout ce qu'il me faut.

Je t'ai cree un profil personnalise. Tu peux maintenant:
- Definir un objectif d'epargne
- Explorer les jobs qui matchent tes competences
- Optimiser ton budget

**On y va?** Clique sur "Mon Plan" pour commencer!`;
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
      return `Super ${context.name || ''}! Enchante.\n\nEt niveau etudes, t'es en quoi? (Ex: "L2 Info", "M1 Droit")`;
    case 'studies':
      return `${context.diploma || ''} ${context.field || ''}, cool!\n\nQuelles sont tes competences? (code, langues, design, sport...)`;
    case 'skills':
      return `Pas mal!\n\nTu vis ou? Quelle ville?`;
    case 'location':
      return `${context.city || ''}, je note.\n\nParlons budget: combien tu touches et depenses par mois environ?`;
    case 'budget':
      return `OK pour le budget!\n\nDerniere question: combien d'heures max par semaine tu peux bosser? Et quel taux horaire minimum?`;
    case 'work_preferences':
      return generateCompletionMessage(context);
    default:
      return 'Continuons!';
  }
}
