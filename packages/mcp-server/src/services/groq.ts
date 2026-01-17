/**
 * Groq LLM Service
 *
 * Provides LLM capabilities for budget analysis, advice generation,
 * and speech-to-text transcription via Whisper.
 */

import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';
import { trace } from './opik.js';

// Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Groq pricing per million tokens (USD)
// Prices as of 2024 - https://groq.com/pricing
const GROQ_PRICING: Record<string, { input: number; output: number }> = {
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  'llama-3.2-90b-vision-preview': { input: 0.9, output: 0.9 },
  'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
  'gemma2-9b-it': { input: 0.2, output: 0.2 },
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

    // Calculate cost and set token usage at root level for Opik UI display
    if (response.usage) {
      const promptTokens = response.usage.prompt_tokens || 0;
      const completionTokens = response.usage.completion_tokens || 0;
      const cost = calculateCost(MODEL, promptTokens, completionTokens);

      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage.total_tokens || 0,
        cost,
      });

      // Also keep in attributes for metadata
      span.setAttributes({
        tokens_used: response.usage.total_tokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
        model: MODEL,
      });
    }

    return content;
  });
}

/**
 * Generate a chat completion with JSON mode
 * Forces the model to return valid JSON - useful for structured extraction
 */
export async function chatWithJsonMode<T = Record<string, unknown>>(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
  }
): Promise<T> {
  return trace('llm_chat_json', async (span) => {
    span.setAttributes({
      model: MODEL,
      messages_count: messages.length,
      temperature: options?.temperature || 0.0,
      response_format: 'json_object',
    });

    if (!groqClient) {
      throw new Error('Groq client not initialized. Set GROQ_API_KEY environment variable.');
    }

    const response = await groqClient.chat.completions.create({
      model: MODEL,
      messages,
      temperature: options?.temperature || 0.0, // Low temperature for deterministic extraction
      max_tokens: options?.maxTokens || 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';

    // Calculate cost and set token usage at root level for Opik UI display
    if (response.usage) {
      const promptTokens = response.usage.prompt_tokens || 0;
      const completionTokens = response.usage.completion_tokens || 0;
      const cost = calculateCost(MODEL, promptTokens, completionTokens);

      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage.total_tokens || 0,
        cost,
      });

      // Also keep in attributes for metadata
      span.setAttributes({
        tokens_used: response.usage.total_tokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
        model: MODEL,
        response_length: content.length,
      });
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      span.setAttributes({
        parse_error: true,
        raw_content: content.substring(0, 500),
      });
      throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}`);
    }
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

// Whisper model for transcription
const WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

/**
 * Transcription result interface
 */
export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

/**
 * Transcribe audio to text using Whisper via Groq API
 *
 * @param audioBuffer - Audio file as Buffer (supports wav, webm, mp3, etc.)
 * @param options - Transcription options
 * @returns Transcription result with text and metadata
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options?: {
    language?: string;
    filename?: string;
    prompt?: string;
  }
): Promise<TranscriptionResult> {
  return trace('whisper_transcription', async (span) => {
    const language = options?.language || 'fr';
    const filename = options?.filename || 'recording.webm';

    span.setAttributes({
      'whisper.model': WHISPER_MODEL,
      'whisper.language': language,
      'whisper.audio_size_bytes': audioBuffer.length,
    });

    if (!groqClient) {
      throw new Error('Groq client not initialized. Set GROQ_API_KEY environment variable.');
    }

    try {
      // Convert Buffer to File for Groq API
      const audioFile = await toFile(audioBuffer, filename);

      const transcription = await groqClient.audio.transcriptions.create({
        model: WHISPER_MODEL,
        file: audioFile,
        language,
        response_format: 'verbose_json',
        prompt: options?.prompt,
      });

      // Cast to any to access verbose_json properties not in base type
      const verboseResult = transcription as unknown as {
        text: string;
        language?: string;
        duration?: number;
      };

      const result: TranscriptionResult = {
        text: verboseResult.text,
        language: verboseResult.language || language,
        duration: verboseResult.duration,
      };

      span.setAttributes({
        'whisper.transcript_length': result.text.length,
        'whisper.detected_language': result.language,
        'whisper.duration_seconds': result.duration || 0,
      });

      return result;
    } catch (error) {
      span.setAttributes({
        'whisper.error': true,
        'whisper.error_message': error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
}

/**
 * Transcribe audio and analyze the content for budget/goal context
 *
 * @param audioBuffer - Audio file as Buffer
 * @param context - Analysis context (budget, goal, question)
 * @returns Transcript with contextual analysis
 */
export async function transcribeAndAnalyze(
  audioBuffer: Buffer,
  context: 'budget' | 'goal' | 'question' = 'question'
): Promise<{
  transcript: string;
  analysis: string;
  extractedData?: Record<string, unknown>;
}> {
  return trace('whisper_transcribe_and_analyze', async (span) => {
    span.setAttributes({
      'analysis.context': context,
    });

    // First transcribe
    const transcription = await transcribeAudio(audioBuffer);

    // Then analyze based on context
    let analysisPrompt = '';
    switch (context) {
      case 'budget':
        analysisPrompt = `Analyse ce texte et extrait les informations budgétaires:
- Sources de revenus et montants
- Catégories de dépenses et montants
- Préoccupations financières mentionnées

Texte: "${transcription.text}"

Réponds en JSON avec "incomes" et "expenses" si trouvés, sinon donne un "summary".`;
        break;
      case 'goal':
        analysisPrompt = `Analyse ce texte et extrait l'objectif financier:
- Montant cible (en euros)
- Délai souhaité (en semaines/mois)
- Nom/description de l'objectif
- Contraintes mentionnées

Texte: "${transcription.text}"

Réponds en JSON avec "goalAmount", "deadline", "goalName", "constraints" si trouvés.`;
        break;
      default:
        analysisPrompt = `Analyse cette question d'étudiant et fournis une réponse utile:

Question: "${transcription.text}"

Réponds de manière concise et actionnable.`;
    }

    const analysis = await chat([
      {
        role: 'system',
        content: 'Tu es un assistant financier pour étudiants. Réponds en français.',
      },
      { role: 'user', content: analysisPrompt },
    ]);

    // Try to extract JSON data if present
    let extractedData: Record<string, unknown> | undefined;
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON extraction failed, that's OK
    }

    span.setAttributes({
      'analysis.has_extracted_data': !!extractedData,
    });

    return {
      transcript: transcription.text,
      analysis,
      extractedData,
    };
  });
}

// Export service
export const groq = {
  init: initGroq,
  chat,
  chatWithJsonMode,
  analyzeBudget,
  generateAdvice,
  transcribeAudio,
  transcribeAndAnalyze,
};

export default groq;
