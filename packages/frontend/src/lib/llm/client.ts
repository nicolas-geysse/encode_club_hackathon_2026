/**
 * Unified LLM Client
 *
 * Uses the OpenAI SDK with configurable base URL to support any OpenAI-compatible provider:
 * - Groq: https://api.groq.com/openai/v1
 * - Mistral: https://api.mistral.ai/v1
 * - Google Gemini: https://generativelanguage.googleapis.com/v1beta/openai/
 * - OpenAI: https://api.openai.com/v1
 * - OpenRouter: https://openrouter.ai/api/v1
 *
 * All configuration is read lazily via settingsStore (runtime overrides > process.env).
 * Call resetLLMClient() after changing settings to force re-creation.
 */

import OpenAI from 'openai';
import { createLogger } from '../logger';
import { getSetting } from '../settingsStore';

const logger = createLogger('LLMClient');

// =============================================================================
// Lazy Configuration Getters
// =============================================================================

function getLLMApiKey(): string | undefined {
  return getSetting('LLM_API_KEY') || getSetting('GROQ_API_KEY');
}

function getLLMBaseUrl(): string {
  return getSetting('LLM_BASE_URL') || 'https://api.groq.com/openai/v1';
}

function getLLMModelName(): string {
  return getSetting('LLM_MODEL') || getSetting('GROQ_MODEL') || 'llama-3.1-8b-instant';
}

// Detect provider from base URL for logging/tracing
function detectProvider(baseUrl: string): string {
  if (baseUrl.includes('groq.com')) return 'groq';
  if (baseUrl.includes('mistral.ai')) return 'mistral';
  if (baseUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (baseUrl.includes('openai.com')) return 'openai';
  if (baseUrl.includes('openrouter.ai')) return 'openrouter';
  if (baseUrl.includes('together.xyz')) return 'together';
  return 'custom';
}

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
    'ministral-3b-2512': { input: 0.04, output: 0.04 },
    'mistral-small-latest': { input: 0.1, output: 0.3 },
    'mistral-medium-latest': { input: 0.27, output: 0.81 },
    'mistral-large-latest': { input: 2.0, output: 6.0 },
    'codestral-latest': { input: 0.3, output: 0.9 },
    'open-mistral-nemo': { input: 0.15, output: 0.15 },
    default: { input: 0.15, output: 0.45 },
  },
  gemini: {
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    default: { input: 0.15, output: 0.6 },
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
  const provider = getProvider();
  const model = getModel();
  const providerPricing = PRICING[provider] || PRICING['default'];
  const modelPricing = providerPricing[model] || providerPricing['default'];
  const inputCost = (promptTokens / 1_000_000) * modelPricing.input;
  const outputCost = (completionTokens / 1_000_000) * modelPricing.output;
  return inputCost + outputCost;
}

// =============================================================================
// Client Singleton (auto-recreated when config changes)
// =============================================================================

let client: OpenAI | null = null;
let clientConfig: { apiKey: string; baseUrl: string } | null = null;

/**
 * Get or create the LLM client singleton.
 * Auto-recreates the client if apiKey or baseUrl have changed since last creation.
 */
export function getLLMClient(): OpenAI | null {
  const apiKey = getLLMApiKey();
  if (!apiKey) return null;

  const baseUrl = getLLMBaseUrl();

  // Auto-recreate if config changed
  if (
    client &&
    clientConfig &&
    (clientConfig.apiKey !== apiKey || clientConfig.baseUrl !== baseUrl)
  ) {
    logger.info('LLM config changed, recreating client', {
      oldProvider: detectProvider(clientConfig.baseUrl),
      newProvider: detectProvider(baseUrl),
    });
    client = null;
    clientConfig = null;
  }

  if (!client) {
    client = new OpenAI({ apiKey, baseURL: baseUrl });
    clientConfig = { apiKey, baseUrl };
    logger.info('LLM client initialized', {
      provider: detectProvider(baseUrl),
      model: getLLMModelName(),
      baseUrl: baseUrl.replace(/\/v1\/?$/, ''),
    });
  }

  return client;
}

/**
 * Force-reset the LLM client. Call after applySettings() so the next
 * getLLMClient() call creates a fresh client with updated config.
 */
export function resetLLMClient(): void {
  client = null;
  clientConfig = null;
}

/**
 * Get the current model name
 */
export function getModel(): string {
  return getLLMModelName();
}

/**
 * Get the current provider name
 */
export function getProvider(): string {
  return detectProvider(getLLMBaseUrl());
}

/**
 * Check if LLM is configured
 */
export function isConfigured(): boolean {
  return !!getLLMApiKey();
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

  const model = getLLMModelName();
  const response = await llm.chat.completions.create({
    model,
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
