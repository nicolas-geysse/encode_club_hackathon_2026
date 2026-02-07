/**
 * Provider Presets
 *
 * Shared configuration for LLM and STT providers.
 * Used by settings.tsx (UI) and app.tsx (auto-apply on startup).
 */

export interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  defaultModel: string;
  apiKeyField: string;
  models: string[];
  consoleUrl: string;
}

export const LLM_PROVIDERS: ProviderPreset[] = [
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'ministral-3b-2512',
    apiKeyField: 'LLM_API_KEY',
    models: ['ministral-3b-2512', 'mistral-small-latest', 'mistral-large-latest'],
    consoleUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.1-8b-instant',
    apiKeyField: 'GROQ_API_KEY',
    models: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    consoleUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    defaultModel: 'gemini-2.5-flash',
    apiKeyField: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash'],
    consoleUrl: 'https://aistudio.google.com/apikey',
  },
];

export const STT_PROVIDERS: ProviderPreset[] = [
  {
    id: 'groq-whisper',
    name: 'Groq Whisper',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'whisper-large-v3-turbo',
    apiKeyField: 'GROQ_API_KEY',
    models: ['whisper-large-v3-turbo', 'whisper-large-v3'],
    consoleUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'mistral-voxtral',
    name: 'Mistral Voxtral',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'voxtral-mini-2602',
    apiKeyField: 'LLM_API_KEY',
    models: ['voxtral-mini-2602'],
    consoleUrl: 'https://console.mistral.ai/api-keys',
  },
];

export interface ProviderConfig {
  llmProvider: string;
  llmModel: string;
  sttProvider: string;
  sttModel: string;
}

/**
 * Compute the settings object to send to /api/settings/apply
 * from a provider config + API keys map.
 */
export function computeSettingsFromConfig(
  config: ProviderConfig,
  apiKeys: Record<string, string>
): Record<string, string> {
  const settings: Record<string, string> = {};

  // LLM settings
  const llmPreset = LLM_PROVIDERS.find((p) => p.id === config.llmProvider);
  if (llmPreset) {
    settings.LLM_BASE_URL = llmPreset.baseUrl;
    settings.LLM_MODEL = config.llmModel || llmPreset.defaultModel;
    // Set the appropriate API key for LLM
    const llmKey = apiKeys[llmPreset.apiKeyField];
    if (llmKey) {
      settings[llmPreset.apiKeyField] = llmKey;
      // Also set LLM_API_KEY for providers that use a different field name
      if (llmPreset.apiKeyField !== 'LLM_API_KEY') {
        settings.LLM_API_KEY = llmKey;
      }
    }
  }

  // STT settings
  const sttPreset = STT_PROVIDERS.find((p) => p.id === config.sttProvider);
  if (sttPreset) {
    settings.STT_BASE_URL = sttPreset.baseUrl;
    settings.STT_MODEL = config.sttModel || sttPreset.defaultModel;
    // Resolve STT API key: try the preset's field, then fall back to the LLM key
    // (e.g., Mistral Voxtral uses LLM_API_KEY which may already be set by the LLM section)
    const sttKey =
      apiKeys[sttPreset.apiKeyField] || settings[sttPreset.apiKeyField] || settings.LLM_API_KEY;
    if (sttKey) {
      settings.STT_API_KEY = sttKey;
    }
  }

  // Pass through non-provider keys (OPIK, Google Maps)
  for (const key of ['OPIK_API_KEY', 'OPIK_WORKSPACE', 'GOOGLE_MAPS_API_KEY']) {
    if (apiKeys[key]) {
      settings[key] = apiKeys[key];
    }
  }

  return settings;
}
