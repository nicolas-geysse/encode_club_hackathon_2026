/**
 * Gemini LLM Service
 *
 * Provides LLM capabilities via Google's Gemini API with full Opik tracing.
 * Follows the same pattern as groq.ts for consistency.
 */

import { GoogleGenerativeAI, type GenerativeModel, type Content } from '@google/generative-ai';
import { trace, createSpan, getCurrentTraceHandle, type SpanOptions } from './opik.js';
import type { LLMProvider, ChatMessage, LLMOptions } from './llm-provider.js';

// Configuration - read lazily to avoid race conditions with .env loading
const getConfig = () => ({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
});

// Gemini pricing per million tokens (USD)
// Prices as of January 2026 - https://ai.google.dev/pricing
const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-1.5-flash': { input: 0.075, output: 0.3 },
  'gemini-1.5-flash-8b': { input: 0.0375, output: 0.15 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  default: { input: 0.5, output: 1.5 },
};

/**
 * Calculate estimated cost based on token usage
 */
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = GEMINI_PRICING[model] || GEMINI_PRICING['default'];
  const inputCost = (promptTokens / 1_000_000) * pricing.input;
  const outputCost = (completionTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

// Gemini client instance
let genAI: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

/**
 * Initialize Gemini client
 */
export async function initGemini(): Promise<void> {
  const config = getConfig();

  if (!config.apiKey) {
    console.error('Warning: GEMINI_API_KEY not set, Gemini features disabled');
    return;
  }

  genAI = new GoogleGenerativeAI(config.apiKey);
  model = genAI.getGenerativeModel({ model: config.model });

  console.error(`Gemini initialized with model: ${config.model}`);
}

/**
 * Convert ChatMessage array to Gemini Content format
 * Gemini uses 'user' and 'model' roles, not 'assistant'
 */
function convertToGeminiFormat(messages: ChatMessage[]): {
  systemInstruction: string | undefined;
  history: Content[];
  lastMessage: string;
} {
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  // Convert to Gemini history format (all except the last message)
  const history: Content[] = nonSystemMessages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const lastMessage = nonSystemMessages[nonSystemMessages.length - 1]?.content || '';

  return {
    systemInstruction: systemMessage?.content,
    history,
    lastMessage,
  };
}

/**
 * Generate a chat completion
 *
 * Uses createSpan() when called within an existing trace (for proper nesting),
 * otherwise creates a new trace() for standalone calls.
 */
export async function chat(messages: ChatMessage[], options?: LLMOptions): Promise<string> {
  const config = getConfig();
  const MODEL = config.model;
  const tags = options?.tags || ['llm', 'gemini'];
  const temperature = options?.temperature ?? 0.5;

  // Prepare input for tracing (summarize messages to avoid bloating)
  const inputData = {
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content,
    })),
    model: MODEL,
    temperature,
  };

  // Core chat logic - shared between span and trace
  const executeChatCompletion = async (span: import('./opik.js').Span): Promise<string> => {
    span.setInput(inputData);
    span.setAttributes({
      model: MODEL,
      messages_count: messages.length,
      temperature,
    });

    if (!genAI || !model) {
      throw new Error('Gemini client not initialized. Set GEMINI_API_KEY environment variable.');
    }

    const { systemInstruction, history, lastMessage } = convertToGeminiFormat(messages);

    // Create a chat session with history
    const chatSession = model.startChat({
      history,
      systemInstruction: systemInstruction || undefined,
      generationConfig: {
        temperature,
        maxOutputTokens: options?.maxTokens || 1024,
      },
    });

    const result = await chatSession.sendMessage(lastMessage);
    const response = result.response;
    const text = response.text();

    // Set output for Opik UI
    span.setOutput({
      content: text.length > 500 ? text.substring(0, 500) + '...' : text,
      content_length: text.length,
    });

    // Calculate cost and set token usage
    if (response.usageMetadata) {
      const promptTokens = response.usageMetadata.promptTokenCount || 0;
      const completionTokens = response.usageMetadata.candidatesTokenCount || 0;
      const totalTokens = response.usageMetadata.totalTokenCount || 0;
      const cost = calculateCost(MODEL, promptTokens, completionTokens);

      // Set usage separately from cost (Opik SDK requirement)
      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });

      // Cost goes in separate field
      span.setCost(cost);

      span.setAttributes({
        tokens_used: totalTokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
      });
    }

    return text;
  };

  // Use createSpan if we're inside an existing trace (for proper nesting)
  // Otherwise create a new top-level trace
  const hasParentTrace = !!getCurrentTraceHandle();

  // Span options with type, model, and provider for proper Opik display
  const spanOptions: SpanOptions = {
    tags,
    input: inputData,
    type: 'llm',
    model: MODEL,
    provider: 'gemini',
  };

  if (hasParentTrace) {
    return createSpan('gemini_chat', executeChatCompletion, spanOptions);
  } else {
    return trace('gemini_chat', executeChatCompletion, {
      tags,
      metadata: {
        ...options?.metadata,
        model: MODEL,
        messages_count: messages.length,
        temperature,
      },
      input: inputData,
    });
  }
}

/**
 * Generate a chat completion with JSON mode
 * Adds instruction to return valid JSON and parses the response
 *
 * Note: Gemini doesn't have native JSON mode like OpenAI/Groq,
 * so we add explicit instructions to the prompt.
 */
export async function chatWithJsonMode<T = Record<string, unknown>>(
  messages: ChatMessage[],
  options?: LLMOptions
): Promise<T> {
  const config = getConfig();
  const MODEL = config.model;
  const tags = options?.tags || ['llm', 'gemini', 'json'];
  const temperature = options?.temperature ?? 0.0; // Lower temperature for JSON

  // Add JSON instruction to the last message
  const jsonMessages = [...messages];
  const lastIdx = jsonMessages.length - 1;
  if (lastIdx >= 0) {
    jsonMessages[lastIdx] = {
      ...jsonMessages[lastIdx],
      content:
        jsonMessages[lastIdx].content +
        '\n\nIMPORTANT: Respond with valid JSON only. No markdown, no explanations, just the JSON object.',
    };
  }

  // Prepare input for tracing
  const inputData = {
    messages: jsonMessages.map((m) => ({
      role: m.role,
      content: m.content.length > 200 ? m.content.substring(0, 200) + '...' : m.content,
    })),
    model: MODEL,
    temperature,
    response_format: 'json_object',
  };

  // Core chat logic
  const executeChatCompletion = async (span: import('./opik.js').Span): Promise<T> => {
    span.setInput(inputData);
    span.setAttributes({
      model: MODEL,
      messages_count: jsonMessages.length,
      temperature,
      response_format: 'json_object',
    });

    if (!genAI || !model) {
      throw new Error('Gemini client not initialized. Set GEMINI_API_KEY environment variable.');
    }

    const { systemInstruction, history, lastMessage } = convertToGeminiFormat(jsonMessages);

    // Add JSON output format instruction to system prompt
    const enhancedSystemInstruction = systemInstruction
      ? `${systemInstruction}\n\nYou MUST respond with valid JSON only.`
      : 'You MUST respond with valid JSON only.';

    const chatSession = model.startChat({
      history,
      systemInstruction: enhancedSystemInstruction,
      generationConfig: {
        temperature,
        maxOutputTokens: options?.maxTokens || 1024,
        responseMimeType: 'application/json', // Gemini 1.5+ supports this
      },
    });

    const result = await chatSession.sendMessage(lastMessage);
    const response = result.response;
    const content = response.text();

    // Calculate cost and set token usage
    if (response.usageMetadata) {
      const promptTokens = response.usageMetadata.promptTokenCount || 0;
      const completionTokens = response.usageMetadata.candidatesTokenCount || 0;
      const totalTokens = response.usageMetadata.totalTokenCount || 0;
      const cost = calculateCost(MODEL, promptTokens, completionTokens);

      span.setUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
      });

      span.setCost(cost);

      span.setAttributes({
        tokens_used: totalTokens,
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        estimated_cost_usd: cost,
        response_length: content.length,
      });
    }

    try {
      // Clean potential markdown code blocks
      const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanContent) as T;
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

  // Use createSpan if we're inside an existing trace
  const hasParentTrace = !!getCurrentTraceHandle();

  // Span options with type, model, and provider
  const spanOptions: SpanOptions = {
    tags,
    input: inputData,
    type: 'llm',
    model: MODEL,
    provider: 'gemini',
  };

  if (hasParentTrace) {
    return createSpan('gemini_chat_json', executeChatCompletion, spanOptions);
  } else {
    return trace('gemini_chat_json', executeChatCompletion, {
      tags,
      metadata: {
        ...options?.metadata,
        model: MODEL,
        messages_count: jsonMessages.length,
        temperature,
        response_format: 'json_object',
      },
      input: inputData,
    });
  }
}

/**
 * Export as LLMProvider interface for unified access
 */
export const gemini: LLMProvider = {
  providerName: 'gemini',
  init: initGemini,
  chat,
  chatWithJsonMode,
};

export default gemini;
