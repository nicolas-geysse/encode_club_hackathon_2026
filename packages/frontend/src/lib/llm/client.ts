/**
 * Unified LLM Client
 *
 * Uses the OpenAI SDK with configurable base URL to support any OpenAI-compatible provider:
 * - Groq: https://api.groq.com/openai/v1
 * - Mistral: https://api.mistral.ai/v1
 * - OpenAI: https://api.openai.com/v1
 * - OpenRouter: https://openrouter.ai/api/v1
 *
 * Configure via environment variables:
 * - LLM_API_KEY: API key for the provider
 * - LLM_BASE_URL: Base URL for the provider (defaults to Groq)
 * - LLM_MODEL: Model to use (defaults to llama-3.1-8b-instant)
 *
 * Legacy support: Falls back to GROQ_API_KEY/GROQ_MODEL if LLM_ vars not set.
 */

// Load .env from monorepo root (for SSR context where Vite envDir doesn't apply)
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') }); // Try current dir first
config({ path: resolve(process.cwd(), '../../.env') }); // Then monorepo root

import OpenAI from 'openai';
import { createLogger } from '../logger';

const logger = createLogger('LLMClient');

// =============================================================================
// Configuration
// =============================================================================

// Support both new LLM_ prefix and legacy GROQ_ prefix
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY;
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const LLM_MODEL = process.env.LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Detect provider from base URL for logging/tracing
function detectProvider(baseUrl: string): string {
  if (baseUrl.includes('groq.com')) return 'groq';
  if (baseUrl.includes('mistral.ai')) return 'mistral';
  if (baseUrl.includes('openai.com')) return 'openai';
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('together.xyz')) return 'together';
  return 'custom';
}

export const LLM_PROVIDER = detectProvider(LLM_BASE_URL);

// =============================================================================
// Pricing (for cost estimation in traces)
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
    'codestral-latest': { input: 0.3, output: 0.9 },
    'open-mistral-nemo': { input: 0.15, output: 0.15 },
    default: { input: 0.15, output: 0.45 },
  },
  openai: {
    'gpt-4o': { input: 2.5, output: 10.0 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    default: { input: 0.5, output: 1.5 },
  },
  default: {
    default: { input: 0.15, output: 0.6 },
  },
};

/**
 * Calculate estimated cost based on token usage
 */
export function calculateCost(promptTokens: number, completionTokens: number): number {
  const providerPricing = PRICING[LLM_PROVIDER] || PRICING['default'];
  const modelPricing = providerPricing[LLM_MODEL] || providerPricing['default'];
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
  return inputCost + outputCost;
}

// =============================================================================
// Client Singleton
// =============================================================================

let client: OpenAI | null = null;

/**
 * Get or create the LLM client singleton
 */
export function getLLMClient(): OpenAI | null {
  if (!client && LLM_API_KEY) {
    client = new OpenAI({
      apiKey: LLM_API_KEY,
      baseURL: LLM_BASE_URL,
    });
    logger.info('LLM client initialized', {
      provider: LLM_PROVIDER,
      model: LLM_MODEL,
      baseUrl: LLM_BASE_URL.replace(/\/v1$/, ''),
    });
  }
  return client;
}

/**
 * Get the current model name
 */
export function getModel(): string {
  return LLM_MODEL;
}

/**
 * Get the current provider name
 */
export function getProvider(): string {
  return LLM_PROVIDER;
}

/**
 * Check if LLM is configured
 */
export function isConfigured(): boolean {
  return !!LLM_API_KEY;
}

// =============================================================================
// Chat Types
// =============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ChatResult {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    estimatedCost: number;
  };
}

// =============================================================================
// Chat Functions
// =============================================================================

/**
 * Send a chat completion request
 */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<ChatResult> {
  const llm = getLLMClient();
  if (!llm) {
    throw new Error('LLM client not initialized. Set LLM_API_KEY environment variable.');
  }

  const response = await llm.chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens || 1024,
    ...(options.jsonMode && { response_format: { type: 'json_object' as const } }),
  });

  const content = response.choices[0]?.message?.content || '';
  const promptTokens = response.usage?.prompt_tokens || 0;
  const completionTokens = response.usage?.completion_tokens || 0;
  const totalTokens = response.usage?.total_tokens || 0;

  return {
    content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost: calculateCost(promptTokens, completionTokens),
    },
  };
}

/**
 * Send a chat completion request with JSON mode
 */
export async function chatJson<T = Record<string, unknown>>(
  messages: ChatMessage[],
  options: Omit<ChatOptions, 'jsonMode'> = {}
): Promise<{ data: T; usage: ChatResult['usage'] }> {
  const result = await chat(messages, {
    ...options,
    jsonMode: true,
    temperature: options.temperature ?? 0.0,
  });

  try {
    const data = JSON.parse(result.content) as T;
    return { data, usage: result.usage };
  } catch {
    throw new Error(`Failed to parse JSON response: ${result.content.substring(0, 200)}`);
  }
}

// =============================================================================
// Re-export for backwards compatibility
// =============================================================================

export { OpenAI };
