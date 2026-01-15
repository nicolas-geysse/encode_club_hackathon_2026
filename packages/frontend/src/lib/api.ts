/**
 * API utilities for communicating with backend services
 */

export interface TranscriptionResult {
  text: string;
  language: string;
  duration?: number;
}

export interface ApiError {
  error: true;
  message: string;
}

/**
 * Transcribe audio using the voice API
 */
export async function transcribeAudio(
  audioBase64: string,
  format: 'webm' | 'wav' = 'webm',
  language: string = 'fr'
): Promise<TranscriptionResult> {
  const response = await fetch('/api/voice', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'transcribe',
      audio_base64: audioBase64,
      format,
      language,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Transcription failed');
  }

  return response.json();
}

/**
 * Convert a Blob to base64 string
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:audio/webm;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
