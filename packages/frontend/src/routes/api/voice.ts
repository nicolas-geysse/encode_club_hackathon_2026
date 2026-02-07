/**
 * Voice API Route
 *
 * Handles audio transcription using Groq Whisper API.
 * This is a server-side API route that bridges the frontend to the MCP server tools.
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';
import { getSetting } from '~/lib/settingsStore';

const logger = createLogger('Voice');

// Speech-to-text configuration (provider-agnostic)
// Supports Groq Whisper, Mistral Voxtral, or any OpenAI-compatible transcription endpoint.
// Uses settingsStore for runtime overrides (falls back to process.env).
// STT key resolution: explicit STT key > LLM key (for Mistral Voxtral) > Groq key (legacy)
const getSTTApiKey = () =>
  getSetting('STT_API_KEY') || getSetting('LLM_API_KEY') || getSetting('GROQ_API_KEY');
const getSTTBaseUrl = () => getSetting('STT_BASE_URL') || 'https://api.groq.com/openai/v1';
const getSTTModel = () => getSetting('STT_MODEL') || 'whisper-large-v3-turbo';

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
    const sttModel = getSTTModel();
    const isMistral = getSTTBaseUrl().includes('mistral.ai');

    // Mistral Voxtral only supports: mp3, wav, m4a, flac, ogg (NOT webm)
    // If recording is webm and provider is Mistral, re-wrap as ogg (webm/opus is ogg-compatible)
    const effectiveFormat = isMistral && format === 'webm' ? 'ogg' : format;
    const mimeTypes: Record<string, string> = {
      webm: 'audio/webm',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      flac: 'audio/flac',
    };

    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], {
      type: mimeTypes[effectiveFormat] || 'audio/webm',
    });
    formData.append('file', audioBlob, `recording.${effectiveFormat}`);
    formData.append('model', sttModel);
    formData.append('language', language);
    // response_format=verbose_json is Whisper-specific, Mistral doesn't support it
    if (!isMistral) {
      formData.append('response_format', 'verbose_json');
    }

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
