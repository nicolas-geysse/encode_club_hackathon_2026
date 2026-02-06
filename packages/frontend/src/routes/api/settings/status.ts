/**
 * Settings Status API
 *
 * Returns which API keys are configured via environment variables.
 * Does NOT return the actual key values for security.
 */

import type { APIEvent } from '@solidjs/start/server';

export async function GET(_event: APIEvent): Promise<Response> {
  // Check which keys are configured (without exposing values)
  const configured: Record<string, boolean> = {
    LLM_API_KEY: !!process.env.LLM_API_KEY,
    GROQ_API_KEY: !!process.env.GROQ_API_KEY,
    OPIK_API_KEY: !!process.env.OPIK_API_KEY,
    OPIK_WORKSPACE: !!process.env.OPIK_WORKSPACE,
    GOOGLE_MAPS_API_KEY: !!process.env.GOOGLE_MAPS_API_KEY,
  };

  return new Response(JSON.stringify({ configured }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
