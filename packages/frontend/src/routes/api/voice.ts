/**
 * Voice API Route
 *
 * Handles audio transcription using Groq Whisper API.
 * This is a server-side API route that bridges the frontend to the MCP server tools.
 */

import type { APIEvent } from '@solidjs/start/server';

// Environment-based API URL for MCP server (if we add HTTP support later)
// For now, we'll make direct calls to Groq API from here
// Note: Read env vars at request time, not module load time (Vite SSR compatibility)
const getGroqApiKey = () => process.env.GROQ_API_KEY;
const getWhisperModel = () => process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

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

    const apiKey = getGroqApiKey();
    if (!apiKey) {
      console.error('[Voice API] GROQ_API_KEY not found in process.env');
      return new Response(JSON.stringify({ error: true, message: 'GROQ_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
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
    formData.append('model', getWhisperModel());
    formData.append('language', language);
    formData.append('response_format', 'verbose_json');

    // Call Groq Whisper API
    const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', errorText);
      return new Response(
        JSON.stringify({ error: true, message: `Groq API error: ${groqResponse.status}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const transcription = await groqResponse.json();

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
    console.error('Voice API error:', error);
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
