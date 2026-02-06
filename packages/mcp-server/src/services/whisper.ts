/**
 * Speech-to-Text Service (Provider-Agnostic)
 *
 * Supports any provider with an OpenAI-compatible /v1/audio/transcriptions endpoint:
 * - Groq Whisper: https://api.groq.com/openai/v1
 * - Mistral Voxtral: https://api.mistral.ai/v1
 *
 * Configure via environment variables:
 * - STT_API_KEY: API key (fallback: GROQ_API_KEY)
 * - STT_BASE_URL: Base URL (default: https://api.groq.com/openai/v1)
 * - STT_MODEL: Model name (fallback: GROQ_WHISPER_MODEL, default: whisper-large-v3-turbo)
 */

import { trace } from './opik.js';
import { chat } from './llm.js';

// =============================================================================
// Configuration - STT_ primary, GROQ_ legacy fallback
// Note: Read env vars at request time (in initSTT), not module load time,
// because Vite SSR may not have process.env populated at import time.
// =============================================================================

let STT_API_KEY: string | undefined;
let STT_BASE_URL = 'https://api.groq.com/openai/v1';
let STT_MODEL = 'whisper-large-v3-turbo';

/**
 * Get STT configuration (exported for testing)
 */
export function getSTTConfig() {
  return {
    apiKey: STT_API_KEY,
    baseUrl: STT_BASE_URL,
    model: STT_MODEL,
  };
}

/**
 * Initialize STT service (validate config)
 * Reads env vars at call time (not module load) for Vite SSR compatibility.
 */
export async function initSTT(): Promise<void> {
  STT_API_KEY = process.env.STT_API_KEY || process.env.GROQ_API_KEY;
  STT_BASE_URL = process.env.STT_BASE_URL || 'https://api.groq.com/openai/v1';
  STT_MODEL = process.env.STT_MODEL || process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo';

  if (!STT_API_KEY) {
    console.error('[STT] Warning: STT_API_KEY/GROQ_API_KEY not set, transcription disabled');
    return;
  }
  console.error(`[STT] Initialized: model=${STT_MODEL}, baseURL=${STT_BASE_URL}`);
}

// =============================================================================
// Types
// =============================================================================

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

// =============================================================================
// Transcription
// =============================================================================

/**
 * Transcribe audio to text using the configured STT provider.
 * Uses fetch with multipart/form-data (compatible with both Groq Whisper and Mistral Voxtral).
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options?: {
    language?: string;
    filename?: string;
    prompt?: string;
  }
): Promise<TranscriptionResult> {
  return trace('stt_transcription', async (span) => {
    const language = options?.language || 'fr';
    const filename = options?.filename || 'recording.webm';

    span.setAttributes({
      'stt.model': STT_MODEL,
      'stt.language': language,
      'stt.audio_size_bytes': audioBuffer.length,
      'stt.base_url': STT_BASE_URL,
    });

    if (!STT_API_KEY) {
      throw new Error('STT not configured. Set STT_API_KEY or GROQ_API_KEY environment variable.');
    }

    try {
      // Build multipart form data
      const formData = new FormData();
      const ext = filename.split('.').pop() || 'webm';
      const mimeType = ext === 'wav' ? 'audio/wav' : ext === 'mp3' ? 'audio/mpeg' : 'audio/webm';
      const audioBlob = new Blob([audioBuffer], { type: mimeType });
      formData.append('file', audioBlob, filename);
      formData.append('model', STT_MODEL);
      formData.append('language', language);
      formData.append('response_format', 'verbose_json');
      if (options?.prompt) {
        formData.append('prompt', options.prompt);
      }

      const response = await fetch(`${STT_BASE_URL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${STT_API_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`STT API error ${response.status}: ${errorText}`);
      }

      const transcription = (await response.json()) as {
        text: string;
        language?: string;
        duration?: number;
      };

      const result: TranscriptionResult = {
        text: transcription.text,
        language: transcription.language || language,
        duration: transcription.duration,
      };

      span.setAttributes({
        'stt.transcript_length': result.text.length,
        'stt.detected_language': result.language,
        'stt.duration_seconds': result.duration || 0,
      });

      return result;
    } catch (error) {
      span.setAttributes({
        'stt.error': true,
        'stt.error_message': error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  });
}

/**
 * Transcribe audio and analyze the content for budget/goal context
 */
export async function transcribeAndAnalyze(
  audioBuffer: Buffer,
  context: 'budget' | 'goal' | 'question' = 'question'
): Promise<{
  transcript: string;
  analysis: string;
  extractedData?: Record<string, unknown>;
}> {
  return trace('stt_transcribe_and_analyze', async (span) => {
    span.setAttributes({
      'analysis.context': context,
    });

    // First transcribe
    const transcription = await transcribeAudio(audioBuffer);

    // Then analyze based on context
    let analysisPrompt = '';
    switch (context) {
      case 'budget':
        analysisPrompt = `Analyze this text and extract budget information:
- Income sources and amounts
- Expense categories and amounts
- Financial concerns mentioned

Text: "${transcription.text}"

Reply in JSON with "incomes" and "expenses" if found, otherwise provide a "summary".`;
        break;
      case 'goal':
        analysisPrompt = `Analyze this text and extract the financial goal:
- Target amount (in euros)
- Desired deadline (in weeks/months)
- Goal name/description
- Constraints mentioned

Text: "${transcription.text}"

Reply in JSON with "goalAmount", "deadline", "goalName", "constraints" if found.`;
        break;
      default:
        analysisPrompt = `Analyze this student question and provide a helpful response:

Question: "${transcription.text}"

Reply concisely and actionably.`;
    }

    const analysis = await chat([
      {
        role: 'system',
        content: 'You are a financial assistant for students. Reply in English.',
      },
      { role: 'user', content: analysisPrompt },
    ]);

    let extractedData: Record<string, unknown> | undefined;
    try {
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // JSON extraction failed, that's OK
    }

    span.setAttributes({
      'analysis.has_extracted_data': !!extractedData,
    });

    return {
      transcript: transcription.text,
      analysis,
      extractedData,
    };
  });
}
