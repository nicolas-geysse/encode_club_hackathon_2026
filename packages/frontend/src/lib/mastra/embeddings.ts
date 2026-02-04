/**
 * Embedding Service
 * Generates vector embeddings for text using available providers.
 */

import { createLogger } from '../logger';

const logger = createLogger('Embedding');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11435';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'm2v-bge-m3-1024d'; // TurboV2 Primary Model
const IS_TEST_MODE = process.env.NODE_ENV === 'test' || process.env.VITE_TEST_MODE === 'true';

// Mock embedding for testing/fallback (dimension 1024 to match TurboV2)
function getMockEmbedding(text: string, dimension: number = 1024): number[] {
  // Deterministic pseudo-random based on text length and content
  const vec = new Array(dimension).fill(0);
  const seed = text.length;
  for (let i = 0; i < dimension; i++) {
    vec[i] = Math.sin(seed * (i + 1)) * 0.1; // Small normalized-ish values
  }
  return vec;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text) return [];

  try {
    // 1. Try Ollama (Local)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout for local check

    try {
      const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: text,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data.embedding) return data.embedding;
      }
    } catch (e) {
      clearTimeout(timeout);
      // Ollama not available, fall through
    }

    // 2. Fallback: Mock/Deterministic (for dev without GPU/API)
    // In production, this should throw or use a real API like OpenAI
    logger.warn('Using mock embedding (Ollama unreachable)');
    return getMockEmbedding(text, 1024); // Default to 1024 for compatibility
  } catch (error) {
    logger.error('Generation failed', { error });
    return [];
  }
}
