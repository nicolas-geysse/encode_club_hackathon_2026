/**
 * Settings Status API
 *
 * Returns which API keys are configured and their source (store, env, or none).
 * Also returns the active LLM/STT configuration.
 * Does NOT return actual key values for security.
 */

import type { APIEvent } from '@solidjs/start/server';
import { getSetting, getSettingsSources } from '~/lib/settingsStore';

export async function GET(_event: APIEvent): Promise<Response> {
  const sources = getSettingsSources();

  // Legacy boolean format for backwards compatibility
  const configured: Record<string, boolean> = {};
  for (const [key, source] of Object.entries(sources)) {
    configured[key] = source !== 'none';
  }

  // Active configuration (what the server is actually using)
  const llmBaseUrl = getSetting('LLM_BASE_URL') || 'https://api.groq.com/openai/v1';
  const sttBaseUrl = getSetting('STT_BASE_URL') || 'https://api.groq.com/openai/v1';

  const active = {
    llm: {
      model: getSetting('LLM_MODEL') || getSetting('GROQ_MODEL') || 'llama-3.1-8b-instant',
      baseUrl: llmBaseUrl,
      provider: detectProviderFromUrl(llmBaseUrl),
      hasKey: !!(getSetting('LLM_API_KEY') || getSetting('GROQ_API_KEY')),
    },
    stt: {
      model: getSetting('STT_MODEL') || 'whisper-large-v3-turbo',
      baseUrl: sttBaseUrl,
      provider: detectProviderFromUrl(sttBaseUrl),
      hasKey: !!(getSetting('STT_API_KEY') || getSetting('GROQ_API_KEY')),
    },
    googleMaps: {
      hasKey: !!getSetting('GOOGLE_MAPS_API_KEY'),
    },
  };

  return new Response(JSON.stringify({ configured, sources, active }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function detectProviderFromUrl(baseUrl: string): string {
  if (baseUrl.includes('groq.com')) return 'groq';
  if (baseUrl.includes('mistral.ai')) return 'mistral';
  if (baseUrl.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (baseUrl.includes('openai.com')) return 'openai';
  return 'custom';
}
