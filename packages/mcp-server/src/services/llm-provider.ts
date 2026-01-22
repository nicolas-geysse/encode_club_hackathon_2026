/**
 * LLM Provider Abstraction
 *
 * Defines a common interface for LLM providers (Groq, Gemini, etc.)
 * allowing easy switching via environment variable.
 */

/**
 * Message format for chat completions
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Options for LLM calls
 */
export interface LLMOptions {
  /** Temperature for response generation (0-1) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
  /** Tags for Opik tracing */
  tags?: string[];
  /** Additional metadata for tracing */
  metadata?: Record<string, unknown>;
}

/**
 * Common interface for all LLM providers
 */
export interface LLMProvider {
  /** Provider identifier */
  providerName: 'groq' | 'gemini';

  /** Initialize the provider (load API key, create client) */
  init(): Promise<void>;

  /** Simple chat completion */
  chat(messages: ChatMessage[], options?: LLMOptions): Promise<string>;

  /** Chat completion with JSON mode (forces valid JSON response) */
  chatWithJsonMode<T>(messages: ChatMessage[], options?: LLMOptions): Promise<T>;
}
