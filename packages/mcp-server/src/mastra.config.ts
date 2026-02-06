/**
 * Mastra Configuration
 *
 * Configures Mastra framework with:
 * - OTLP telemetry export to Opik (Cloud or self-hosted)
 * - Provider-agnostic LLM model (via @ai-sdk/openai-compatible or @ai-sdk/groq)
 * - Agent registration
 */

import { Mastra } from '@mastra/core';
import { createOpenAI } from '@ai-sdk/openai';

// LLM Configuration - provider-agnostic
// Note: Read env vars lazily (not at module load) for Vite SSR compatibility.
const getLLMApiKey = () => process.env.LLM_API_KEY || process.env.GROQ_API_KEY || '';
const getLLMBaseUrl = () => process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1';
const getLLMModel = () => process.env.LLM_MODEL || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Opik Configuration
// For Opik Cloud: https://www.comet.com/opik/api/v1/private/otel
// For self-hosted: http://localhost:4318/v1/traces
const getOpikApiKey = () => process.env.OPIK_API_KEY;
const getOpikWorkspace = () => process.env.OPIK_WORKSPACE || 'default';
const getOpikOtlpEndpoint = () =>
  process.env.OPIK_OTLP_ENDPOINT ||
  (getOpikApiKey()
    ? 'https://www.comet.com/opik/api/v1/private/otel'
    : 'http://localhost:4318/v1/traces');

// Lazy model creation (resolved on first access)
let _defaultModel: unknown = null;

export function getDefaultModel(): unknown {
  if (!_defaultModel) {
    const llmProvider = createOpenAI({
      apiKey: getLLMApiKey(),
      baseURL: getLLMBaseUrl(),
    });
    _defaultModel = llmProvider(getLLMModel());
  }
  return _defaultModel;
}

// Backward compat: defaultModel as getter
export const defaultModel: unknown = null; // Use getDefaultModel() instead

// Mastra instance
// Note: telemetry config removed in Mastra 1.0.0-beta - use Opik SDK directly
export const mastra = new Mastra({});

// Export configuration (lazy)
export const config = {
  get llmModel() {
    return getLLMModel();
  },
  get opikEndpoint() {
    return getOpikOtlpEndpoint();
  },
  serviceName: 'stride-student-navigator',
};

export default mastra;
