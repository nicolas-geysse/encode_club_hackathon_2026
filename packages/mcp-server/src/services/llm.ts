/**
 * Unified LLM Service (Provider-Agnostic)
 *
 * Uses the OpenAI SDK with configurable base URL to support any OpenAI-compatible provider:
 * - Groq: https://api.groq.com/openai/v1
 * - Mistral: https://api.mistral.ai/v1
 * - OpenAI: https://api.openai.com/v1
 * - OpenRouter: https://openrouter.ai/api/v1
 *
 * Configure via environment variables:
 * - LLM_API_KEY: API key (fallback: GROQ_API_KEY)
 * - LLM_BASE_URL: Base URL (default: https://api.groq.com/openai/v1)
 * - LLM_MODEL: Model name (fallback: GROQ_MODEL, default: llama-3.1-8b-instant)
 *
 * Replaces the former groq.ts service.
 */

import OpenAI from 'openai';
import { trace, createSpan, getCurrentTraceHandle, type SpanOptions } from './opik.js';
import type { LLMProvider } from './llm-provider.js';

// =============================================================================
// Configuration - LLM_ primary, GROQ_ legacy fallback
// Note: Read env vars at request time (in initLLM), not module load time,
// because Vite SSR may not have process.env populated at import time.
// =============================================================================

let LLM_API_KEY: string | undefined;
let LLM_BASE_URL = 'https://api.groq.com/openai/v1';
let LLM_MODEL = 'llama-3.1-8b-instant';
let PROVIDER = 'groq';

/**
 * Detect provider from base URL for logging/tracing/pricing
 */
export function detectProvider(baseUrl: string): string {
  if (baseUrl.includes('groq.com')) return 'groq';
  if (baseUrl.includes('mistral.ai')) return 'mistral';
  if (baseUrl.includes('openai.com')) return 'openai';
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('together.xyz')) return 'together';
  return 'custom';
}

// =============================================================================
// Multi-provider pricing (per million tokens, USD)
// =============================================================================

const PRICING: Record<string, Record<string, { input: number; output: number }>> = {
  groq: {
    'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
    'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
    'llama-3.2-90b-vision-preview': { input: 0.9, output: 0.9 },
    'mixtral-8x7b-32768': { input: 0.24, output: 0.24 },
    default: { input: 0.15, output: 0.6 },
  },
  mistral: {
    'mistral-small-latest': { input: 0.1, output: 0.3 },
    'mistral-medium-latest': { input: 0.27, output: 0.81 },
    'mistral-large-latest': { input: 2.0, output: 6.0 },
    'ministral-3b-2512': { input: 0.04, output: 0.04 },
    'open-mistral-nemo': { input: 0.15, output: 0.15 },
    default: { input: 0.15, output: 0.45 },
  },
  openai: {
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    default: { input: 0.5, output: 1.5 },
  },
  default: {
    default: { input: 0.15, output: 0.6 },
  },
};

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const providerPricing = PRICING[PROVIDER] || PRICING['default'];
  const modelPricing = providerPricing[model] || providerPricing['default'];
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
  return inputCost + outputCost;
}

// =============================================================================
// Client Singleton
// =============================================================================

let llmClient: OpenAI | null = null;

/**
 * Initialize LLM client
 * Reads env vars at call time (not module load) for Vite SSR compatibility.
 */
export async function initLLM(): Promise<void> {
  // Read env vars now (at request time, not module load time)
  LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
  LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
  LLM_MODEL = process.env.LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  PROVIDER = detectProvider(LLM_BASE_URL);

  if (!LLM_API_KEY) {
    console.error('Warning: LLM_API_KEY not set, LLM features disabled');
    return;
  }

  llmClient = new OpenAI({
    apiKey: LLM_API_KEY,
    baseURL: LLM_BASE_URL,
  });

  console.error(
    `[LLM] Initialized: provider=${PROVIDER}, model=${LLM_MODEL}, baseURL=${LLM_BASE_URL}`
  );
}

/**
 * Get the LLM client (for direct use if needed)
 */
export function getLLMClient(): OpenAI | null {
  return llmClient;
}

/**
 * Get current model name
 */
export function getModel(): string {
  return LLM_MODEL;
}

/**
 * Get current provider name
 */
export function getProvider(): string {
  return PROVIDER;
}

// =============================================================================
// Chat Types
// =============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// =============================================================================
// Chat Completion with Opik Tracing
// =============================================================================

/**
 * Generate a chat completion
 *
 * Uses createSpan() when called within an existing trace (for proper nesting),
 * otherwise creates a new trace() for standalone calls.
 */
export async function chat(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    /** Tags for Opik tracing (default: ['llm', PROVIDER]) */
    tags?: string[];
    /** Additional metadata for Opik tracing */
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const tags = options?.tags || ['llm', PROVIDER];
  const temperature = options?.temperature ?? 0.5;

  // Prepare input for tracing (summarize messages to avoid bloating)
  const inputData = {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content,
    })),
    model: LLM_MODEL,
    temperature,
  };

  // Core chat logic - shared between span and trace
  const executeChatCompletion = async (span: import('./opik.js').Span): Promise<string> => {
    span.setInput(inputData);
    span.setAttributes({
      model: LLM_MODEL,
      provider: PROVIDER,
      messages_count: messages.length,
      temperature,
    });

    if (!llmClient) {
      throw new Error('LLM client not initialized. Set LLM_API_KEY environment variable.');
    }

    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: options?.maxTokens || 1024,
    });

    const content = response.choices[0]?.message?.content || '';

    // Set output for Opik UI
    span.setOutput({
      content: content.length > 500 ? content.substring(0, 500) + '...' : content,
      content_length: content.length,
    });

    // Calculate cost and set token usage at root level for Opik UI display
    if (response.usage) {
      const promptTokens = response.usage.prompt_tokens || 0;
      const completionTokens = response.usage.completion_tokens || 0;
      const cost = calculateCost(LLM_MODEL, promptTokens, completionTokens);

      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage.total_tokens || 0,
      });

      span.setCost(cost);

      span.setAttributes({
        tokens_used: response.usage.total_tokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
      });
    } else {
      console.warn(`[LLM] No usage data returned for model ${LLM_MODEL}`);
      span.setAttributes({ usage_missing: true });
    }

    return content;
  };

  // Use createSpan if we're inside an existing trace (for proper nesting)
  const hasParentTrace = !!getCurrentTraceHandle();

  const spanOptions: SpanOptions = {
    tags,
    input: inputData,
    type: 'llm',
    model: LLM_MODEL,
    provider: PROVIDER,
  };

  if (hasParentTrace) {
    return createSpan('llm_chat', executeChatCompletion, spanOptions);
  } else {
    return trace('llm_chat', executeChatCompletion, {
      tags,
      metadata: {
        ...options?.metadata,
        model: LLM_MODEL,
        provider: PROVIDER,
        messages_count: messages.length,
        temperature,
      },
      input: inputData,
    });
  }
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
    /** Tags for Opik tracing (default: ['llm', PROVIDER, 'json']) */
    tags?: string[];
    /** Additional metadata for Opik tracing */
    metadata?: Record<string, unknown>;
  }
): Promise<T> {
  const tags = options?.tags || ['llm', PROVIDER, 'json'];
  const temperature = options?.temperature ?? 0.0;

  const inputData = {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content,
    })),
    model: LLM_MODEL,
    temperature,
    response_format: 'json_object',
  };

  const executeChatCompletion = async (span: import('./opik.js').Span): Promise<T> => {
    span.setInput(inputData);
    span.setAttributes({
      model: LLM_MODEL,
      provider: PROVIDER,
      messages_count: messages.length,
      temperature,
      response_format: 'json_object',
    });

    if (!llmClient) {
      throw new Error('LLM client not initialized. Set LLM_API_KEY environment variable.');
    }

    const response = await llmClient.chat.completions.create({
      model: LLM_MODEL,
      messages,
      temperature,
      max_tokens: options?.maxTokens || 1024,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';

    if (response.usage) {
      const promptTokens = response.usage.prompt_tokens || 0;
      const completionTokens = response.usage.completion_tokens || 0;
      const cost = calculateCost(LLM_MODEL, promptTokens, completionTokens);

      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: response.usage.total_tokens || 0,
      });

      span.setCost(cost);

      span.setAttributes({
        tokens_used: response.usage.total_tokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
        response_length: content.length,
      });
    }

    try {
      const parsed = JSON.parse(content) as T;
      span.setOutput({
        parsed_json: parsed,
        content_length: content.length,
      });
      return parsed;
    } catch {
      span.setAttributes({
        parse_error: true,
        raw_content: content.substring(0, 500),
      });
      span.setOutput({ error: 'JSON parse failed', raw_content: content.substring(0, 200) });
      throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}`);
    }
  };

  const hasParentTrace = !!getCurrentTraceHandle();

  const spanOptions: SpanOptions = {
    tags,
    input: inputData,
    type: 'llm',
    model: LLM_MODEL,
    provider: PROVIDER,
  };

  if (hasParentTrace) {
    return createSpan('llm_chat_json', executeChatCompletion, spanOptions);
  } else {
    return trace('llm_chat_json', executeChatCompletion, {
      tags,
      metadata: {
        ...options?.metadata,
        model: LLM_MODEL,
        provider: PROVIDER,
        messages_count: messages.length,
        temperature,
        response_format: 'json_object',
      },
      input: inputData,
    });
  }
}

// =============================================================================
// Domain-Specific Functions (Budget, Advice)
// =============================================================================

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

  const systemPrompt = `You are a financial advisor specialized for students.
Analyze the provided budget and give practical, friendly advice.
Reply in English, in a concise and actionable way.
Never recommend risky solutions or speculative investments.`;

  const userPrompt = `Analyze this student budget:

INCOME (${totalIncome}€/month):
${incomes.map((i) => `- ${i.source}: ${i.amount}€`).join('\n')}

EXPENSES (${totalExpenses}€/month):
${expenses.map((e) => `- ${e.category}: ${e.amount}€`).join('\n')}

MARGIN: ${margin}€/month (${margin >= 0 ? 'positive' : 'DEFICIT'})

Provide:
1. A summary of the situation (2-3 sentences)
2. 3 concrete recommendations to improve this budget`;

  const response = await chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const recommendations = response
    .split('\n')
    .filter((line) => line.match(/^\d+\.|^-/))
    .map((line) => line.replace(/^\d+\.|^-/, '').trim())
    .filter((line) => line.length > 0)
    .slice(0, 5);

  return {
    summary: response.split('\n')[0] || 'Analysis in progress...',
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
  const systemPrompt = `You are a friendly mentor for students.
Give personalized advice based on the profile.
Be encouraging but realistic. Reply in English.`;

  const userPrompt = `Student profile:
- Diploma: ${profile.diploma || 'Not specified'}
- Skills: ${profile.skills?.join(', ') || 'Not specified'}
- Monthly margin: ${profile.margin !== undefined ? `${profile.margin}€` : 'Not specified'}
- Student loan: ${profile.hasLoan ? `Yes (${profile.loanAmount}€)` : 'No'}

${context ? `Context: ${context}` : ''}

Provide personalized and actionable advice.`;

  return chat([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);
}

// =============================================================================
// JSON Parsing Utilities
// =============================================================================

/**
 * Safely extract and parse JSON from an LLM response.
 * Handles common issues from small models:
 * - Markdown formatting inside JSON values (**bold**, *italic*, `code`)
 * - Trailing commas
 * - Control characters
 * Returns null if no valid JSON found.
 */
export function safeParseJson<T = Record<string, unknown>>(response: string): T | null {
  // Strip markdown code fences first (```json ... ```)
  const cleaned = response.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '');

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  // Try parsing as-is first (fast path)
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    // Sanitize and retry
  }

  try {
    const sanitized = jsonMatch[0]
      .replace(/\*\*([^*]*?)\*\*/g, '$1') // **bold** → bold
      .replace(/\*([^*]*?)\*/g, '$1') // *italic* → italic
      .replace(/`([^`]*?)`/g, '$1') // `code` → code
      // eslint-disable-next-line no-control-regex
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ') // control chars (keep \n \r \t)
      .replace(/,\s*}/g, '}') // trailing comma
      .replace(/,\s*]/g, ']'); // trailing comma in arrays
    return JSON.parse(sanitized) as T;
  } catch {
    return null;
  }
}

// =============================================================================
// LLMProvider Interface Export
// =============================================================================

export const llm: LLMProvider = {
  providerName: PROVIDER,
  init: initLLM,
  chat,
  chatWithJsonMode,
};

export default llm;
