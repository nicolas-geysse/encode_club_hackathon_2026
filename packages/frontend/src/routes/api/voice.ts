/**
 * Voice API Route
 *
 * Handles audio transcription using Groq Whisper API.
 * This is a server-side API route that bridges the frontend to the MCP server tools.
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';

const logger = createLogger('Voice');

// Speech-to-text configuration (provider-agnostic)
// Supports Groq Whisper, Mistral Voxtral, or any OpenAI-compatible transcription endpoint.
// Note: Read env vars at request time, not module load time (Vite SSR compatibility)
const getSTTApiKey = () => process.env.STT_API_KEY || process.env.GROQ_API_KEY;
const getSTTBaseUrl = () => process.env.STT_BASE_URL || 'https://api.groq.com/openai/v1';
const getSTTModel = () =>
  process.env.STT_MODEL || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

interface TranscribeRequest {
  action: 'transcribe';
  audio_base64: string;
  format?: 'webm' | 'wav';
  language?: string;
}

export async function POST(event: APIEvent) {
  try {
    const body = (await event.request.json()) as TranscribeRequest;

    if (body.action !== 'transcribe') {
      return new Response(JSON.stringify({ error: true, message: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!body.audio_base64) {
      return new Response(JSON.stringify({ error: true, message: 'Missing audio data' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const apiKey = getSTTApiKey();
    if (!apiKey) {
      logger.error('STT_API_KEY/GROQ_API_KEY not found in process.env');
      return new Response(
        JSON.stringify({
          error: true,
          message: 'Speech-to-text API key not configured (set STT_API_KEY or GROQ_API_KEY)',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Convert base64 to Buffer
    const audioBuffer = Buffer.from(body.audio_base64, 'base64');
    const format = body.format || 'webm';
    const language = body.language || 'fr';

    // Create FormData for Groq API
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], {
      type: format === 'webm' ? 'audio/webm' : 'audio/wav',
    });
    formData.append('file', audioBlob, `recording.${format}`);
    formData.append('model', getSTTModel());
    formData.append('language', language);
    formData.append('response_format', 'verbose_json');

    // Call STT provider API (Groq Whisper, Mistral Voxtral, etc.)
    const sttBaseUrl = getSTTBaseUrl();
    const sttResponse = await fetch(`${sttBaseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!sttResponse.ok) {
      const errorText = await sttResponse.text();
      logger.error('STT API error', { status: sttResponse.status, error: errorText });
      return new Response(
        JSON.stringify({ error: true, message: `STT API error: ${sttResponse.status}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const transcription = await sttResponse.json();

    return new Response(
      JSON.stringify({
        text: transcription.text,
        language: transcription.language || language,
        duration: transcription.duration,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
