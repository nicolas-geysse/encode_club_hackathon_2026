/**
 * Text-to-Speech API Route
 *
 * POST /api/tts
 * Converts text to speech using Groq's Orpheus TTS model.
 *
 * Request body:
 * - text: string - The text to convert to speech
 * - voice?: string - Voice to use (default: "daniel")
 *
 * Returns: audio/wav binary data
 */

import type { APIEvent } from '@solidjs/start/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TTS_ENDPOINT = 'https://api.groq.com/openai/v1/audio/speech';

// Orpheus TTS model voices
// See: https://console.groq.com/docs/text-to-speech/orpheus#vocal-directions
// Supports vocal directions like [professionally], [friendly], [excited], etc.
const ORPHEUS_VOICES = [
  'tara', // Warm, friendly female
  'leah', // Clear, professional female
  'jess', // Energetic female
  'leo', // Confident male
  'dan', // Casual male
  'mia', // Soft female
  'zac', // Deep male
  'zoe', // Bright female
  'austin', // Professional male - best for business/e-learning
] as const;
type OrpheusVoice = (typeof ORPHEUS_VOICES)[number];

interface TTSRequest {
  text: string;
  voice?: OrpheusVoice;
}

export async function POST(event: APIEvent) {
  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: TTSRequest = await event.request.json();

    if (!body.text || typeof body.text !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid "text" field' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Limit text length to prevent abuse
    const text = body.text.slice(0, 1000);
    const voice = body.voice && ORPHEUS_VOICES.includes(body.voice) ? body.voice : 'austin'; // Default: professional male voice

    // Add professional vocal direction for Bruno's coaching tone
    // Orpheus supports: [professionally], [friendly], [excited], [sad], [angry], [whisper], etc.
    const textWithDirection = `[professionally] ${text}`;

    // Call Groq TTS API with Orpheus model
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'canopylabs/orpheus-v1-english',
        voice,
        input: textWithDirection,
        response_format: 'wav',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] Groq API error:', response.status, errorText);
      return new Response(
        JSON.stringify({
          error: 'TTS generation failed',
          details: errorText,
        }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Return the audio data directly
    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    return new Response(
      JSON.stringify({
        error: 'TTS generation failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
