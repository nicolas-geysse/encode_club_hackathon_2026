/**
 * Mastra Configuration
 *
 * Configures Mastra framework with:
 * - OTLP telemetry export to Opik self-hosted
 * - Groq LLM model
 * - Agent registration
 */

import { Mastra } from '@mastra/core';
import { createGroq } from '@ai-sdk/groq';

// LLM Configuration
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

// Opik Configuration (self-hosted)
// Frontend: http://localhost:5173
// OTLP endpoint: http://localhost:4318
const OPIK_OTLP_ENDPOINT = process.env.OPIK_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

// Create Groq model instance
export const groqModel = createGroq({
  apiKey: GROQ_API_KEY || '',
});

// Get the default model (type is LanguageModelV3 from @ai-sdk/provider)
export const defaultModel: unknown = groqModel(GROQ_MODEL);

// Mastra instance with telemetry
export const mastra = new Mastra({
  telemetry: {
    serviceName: 'stride-student-navigator',
    enabled: true,
    sampling: {
      type: 'always_on',
    },
    export: {
      type: 'otlp',
      endpoint: OPIK_OTLP_ENDPOINT,
    },
  },
});

// Export configuration
export const config = {
  groqModel: GROQ_MODEL,
  opikEndpoint: OPIK_OTLP_ENDPOINT,
  serviceName: 'stride-student-navigator',
};

export default mastra;
