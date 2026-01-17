/**
 * Mastra Configuration
 *
 * Configures Mastra framework with:
 * - OTLP telemetry export to Opik (Cloud or self-hosted)
 * - Groq LLM model
 * - Agent registration
 */

import { Mastra } from '@mastra/core';
import { createGroq } from '@ai-sdk/groq';

// LLM Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Opik Configuration
// For Opik Cloud: https://www.comet.com/opik/api/v1/private/otel
// For self-hosted: http://localhost:4318/v1/traces
const OPIK_API_KEY = process.env.OPIK_API_KEY;
const OPIK_WORKSPACE = process.env.OPIK_WORKSPACE || 'default';
const OPIK_OTLP_ENDPOINT =
  process.env.OPIK_OTLP_ENDPOINT ||
  (OPIK_API_KEY
    ? 'https://www.comet.com/opik/api/v1/private/otel'
    : 'http://localhost:4318/v1/traces');

// Create Groq model instance
export const groqModel = createGroq({
  apiKey: GROQ_API_KEY || '',
});

// Get the default model (type is LanguageModelV3 from @ai-sdk/provider)
export const defaultModel: unknown = groqModel(GROQ_MODEL);

// Build telemetry config based on whether we're using Opik Cloud or self-hosted
const telemetryConfig = OPIK_API_KEY
  ? {
      serviceName: 'stride-student-navigator',
      enabled: true,
      sampling: { type: 'always_on' as const },
      export: {
        type: 'otlp' as const,
        endpoint: OPIK_OTLP_ENDPOINT,
        headers: {
          Authorization: OPIK_API_KEY,
          'Comet-Workspace': OPIK_WORKSPACE,
        },
      },
    }
  : {
      serviceName: 'stride-student-navigator',
      enabled: true,
      sampling: { type: 'always_on' as const },
      export: {
        type: 'otlp' as const,
        endpoint: OPIK_OTLP_ENDPOINT,
      },
    };

// Mastra instance with telemetry
export const mastra = new Mastra({
  telemetry: telemetryConfig,
});

// Export configuration
export const config = {
  groqModel: GROQ_MODEL,
  opikEndpoint: OPIK_OTLP_ENDPOINT,
  serviceName: 'stride-student-navigator',
};

export default mastra;
