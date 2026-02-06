/**
 * Centralized Configuration for Stride Frontend
 *
 * All environment variables and app configuration in one place.
 * Uses Vite's import.meta.env for build-time env injection.
 */

export const config = {
  // API Configuration
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3001',

  // App Identity
  appName: import.meta.env.VITE_APP_NAME || 'Stride',

  // LLM Configuration (for display purposes)
  llmModel:
    import.meta.env.VITE_LLM_MODEL || import.meta.env.VITE_GROQ_MODEL || 'ministral-3b-2512',

  // Feature Flags
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,

  // Debug
  debug: import.meta.env.VITE_DEBUG === 'true',
} as const;

/**
 * Get the full model display name
 */
export function getModelDisplayName(): string {
  return config.llmModel;
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return config.isDev;
}
