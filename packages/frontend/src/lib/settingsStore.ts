/**
 * Server-side Settings Store
 *
 * In-memory store that overrides process.env for runtime configuration.
 * Allows the frontend to push settings via /api/settings/apply without restarting.
 *
 * Priority: store (runtime overrides) > process.env > undefined
 */

import { createLogger } from './logger';

const logger = createLogger('SettingsStore');

const store = new Map<string, string>();

/** Whitelisted keys that can be set via the store */
const ALLOWED_KEYS = new Set([
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'GEMINI_API_KEY',
  'GROQ_API_KEY',
  'STT_API_KEY',
  'STT_BASE_URL',
  'STT_MODEL',
  'OPIK_API_KEY',
  'OPIK_WORKSPACE',
  'GOOGLE_MAPS_API_KEY',
]);

/**
 * Get a setting value: store override > process.env > undefined
 */
export function getSetting(key: string): string | undefined {
  if (store.has(key)) return store.get(key);
  return process.env[key];
}

/**
 * Bulk-set settings from the frontend. Only whitelisted keys are accepted.
 * Returns the list of keys that were actually applied.
 */
export function applySettings(settings: Record<string, string>): string[] {
  const applied: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (value) {
      store.set(key, value);
      // Also propagate to process.env so that code in other packages
      // (e.g. mcp-server's google-maps.ts) that reads process.env lazily gets the update
      process.env[key] = value;
    } else {
      store.delete(key);
      delete process.env[key];
    }
    applied.push(key);
  }
  if (applied.length > 0) {
    logger.info('Settings applied', { keys: applied });
  }
  return applied;
}

export type SettingSource = 'store' | 'env' | 'none';

/**
 * Returns the source of each whitelisted setting ('store', 'env', or 'none').
 */
export function getSettingsSources(): Record<string, SettingSource> {
  const sources: Record<string, SettingSource> = {};
  for (const key of ALLOWED_KEYS) {
    if (store.has(key)) {
      sources[key] = 'store';
    } else if (process.env[key]) {
      sources[key] = 'env';
    } else {
      sources[key] = 'none';
    }
  }
  return sources;
}

/**
 * Clear all runtime overrides.
 */
export function clearSettings(): void {
  store.clear();
  logger.info('All runtime settings cleared');
}
