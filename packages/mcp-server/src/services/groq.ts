/**
 * Groq LLM Service
 *
 * Provides LLM capabilities for budget analysis and advice generation
 */

import Groq from 'groq-sdk';
import { trace } from './opik.js';

// Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Groq client instance
let groqClient: Groq | null = null;

/**
 * Initialize Groq client
 */
export async function initGroq(): Promise<void> {
  if (!GROQ_API_KEY) {
    console.error('Warning: GROQ_API_KEY not set, LLM features disabled');
    return;
  }

  groqClient = new Groq({
    apiKey: GROQ_API_KEY,
  });

  console.error(`Groq initialized with model: ${MODEL}`);
}

/**
 * Chat completion interface
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Generate a chat completion
 */
export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  return trace('llm_chat', async (span) => {
    span.setAttributes({
      model: MODEL,
      messages_count: messages.length,
      temperature: options?.temperature || 0.7,
    });

    if (!groqClient) {
      throw new Error('Groq client not initialized. Set GROQ_API_KEY environment variable.');
    }

    const response = await groqClient.chat.completions.create({
      model: MODEL,
      messages,
      temperature: options?.temperature || 0.7,
      max_tokens: options?.maxTokens || 1024,
    });

    const content = response.choices[0]?.message?.content || '';

    span.setAttributes({
      tokens_used: response.usage?.total_tokens,
      completion_tokens: response.usage?.completion_tokens,
    });

    return content;
  });
}

/**
 * Analyze budget and provide insights
 */
export async function analyzeBudget(
  incomes: Array<{ source: string; amount: number }>,
  expenses: Array<{ category: string; amount: number }>
): Promise<{
  summary: string;
  totalIncome: number;
  totalExpenses: number;
  margin: number;
  recommendations: string[];
}> {
  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const margin = totalIncome - totalExpenses;

  const systemPrompt = `Tu es un conseiller financier spécialisé pour les étudiants français.
Analyse le budget fourni et donne des conseils pratiques et bienveillants.
Réponds en français, de manière concise et actionnable.
Ne recommande jamais de solutions risquées ou d'investissements spéculatifs.`;

  const userPrompt = `Analyse ce budget étudiant:

REVENUS (${totalIncome}€/mois):
${incomes.map((i) => `- ${i.source}: ${i.amount}€`).join('\n')}

DÉPENSES (${totalExpenses}€/mois):
${expenses.map((e) => `- ${e.category}: ${e.amount}€`).join('\n')}

MARGE: ${margin}€/mois (${margin >= 0 ? 'positif' : 'DÉFICIT'})

Fournis:
1. Un résumé de la situation (2-3 phrases)
2. 3 recommandations concrètes pour améliorer ce budget`;

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  // Parse recommendations from response
  const recommendations = response
    .split('\n')
    .filter((line) => line.match(/^\d+\.|^-/))
    .map((line) => line.replace(/^\d+\.|^-/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

  return {
    summary: response.split('\n')[0] || 'Analyse en cours...',
    totalIncome,
    totalExpenses,
    margin,
    recommendations,
  };
}

/**
 * Generate personalized advice based on profile
 */
export async function generateAdvice(
  profile: {
    diploma?: string;
    skills?: string[];
    margin?: number;
    hasLoan?: boolean;
    loanAmount?: number;
  },
  context?: string
): Promise<string> {
  const systemPrompt = `Tu es un mentor bienveillant pour étudiants français.
Donne des conseils personnalisés basés sur le profil.
Sois encourageant mais réaliste. Réponds en français.`;

  const userPrompt = `Profil étudiant:
- Diplôme: ${profile.diploma || 'Non renseigné'}
- Compétences: ${profile.skills?.join(', ') || 'Non renseignées'}
- Marge mensuelle: ${profile.margin !== undefined ? `${profile.margin}€` : 'Non renseignée'}
- Prêt étudiant: ${profile.hasLoan ? `Oui (${profile.loanAmount}€)` : 'Non'}

${context ? `Contexte: ${context}` : ''}

Donne un conseil personnalisé et actionnable.`;

  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}

// Export service
export const groq = {
  init: initGroq,
  chat,
  analyzeBudget,
  generateAdvice,
};

export default groq;
