/**
 * LLM Module
 *
 * Unified LLM client supporting multiple OpenAI-compatible providers.
 */

export {
  getLLMClient,
  getModel,
  getProvider,
  isConfigured,
  chat,
  chatJson,
  calculateCost,
  LLM_PROVIDER,
  OpenAI,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
} from './client';
