/**
 * LLM Module
 *
 * Unified LLM client supporting multiple OpenAI-compatible providers.
 */

export {
  getLLMClient,
  resetLLMClient,
  getModel,
  getProvider,
  isConfigured,
  chat,
  chatJson,
  calculateCost,
  OpenAI,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
} from './client';
