/**
 * Settings Apply API
 *
 * POST: Receives settings from the frontend and applies them to the in-memory store.
 * This allows runtime switching of LLM/STT providers without server restart.
 */

import type { APIEvent } from '@solidjs/start/server';
import { applySettings } from '~/lib/settingsStore';
import { resetLLMClient } from '~/lib/llm';

export async function POST(event: APIEvent): Promise<Response> {
  try {
    const body = (await event.request.json()) as { settings?: Record<string, string> };

    if (!body.settings || typeof body.settings !== 'object') {
      return new Response(JSON.stringify({ success: false, message: 'Missing settings object' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const applied = applySettings(body.settings);

    // Reset the LLM client so it picks up new config on next call
    resetLLMClient();

    return new Response(JSON.stringify({ success: true, applied }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
