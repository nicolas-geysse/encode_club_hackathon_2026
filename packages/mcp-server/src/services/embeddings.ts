/**
 * Embedding Service - External embedding generation via Ollama-compatible API
 *
 * Uses an external service (deposium-embeddings-turbov2) for embedding generation.
 * This avoids loading the ~500MB-1GB BGE-M3 model in-process.
 *
 * Model: m2v-bge-m3-1024d (1024 dimensions) for multilingual support.
 */

import { maybeTrace, maybeCreateSpan } from './opik.js';

// Configuration - same format as frontend/src/lib/mastra/embeddings.ts
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11435';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'm2v-bge-m3-1024d';
const EMBEDDING_DIMENSIONS = 1024;
const REQUEST_TIMEOUT_MS = 10000; // 10s timeout

let serviceDisabled = false;

/**
 * Generate embedding for a single text via external service
 *
 * @param text - Text to embed
 * @returns 1024-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (serviceDisabled || !text) {
    return [];
  }

  return maybeTrace('embeddings.generate', async (span) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      // Truncate text if too long (BGE-M3 max ~8192 tokens)
      const truncatedText = text.slice(0, 8000);

      const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: truncatedText,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        console.error(`[Embeddings] Service error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = (await response.json()) as { embedding?: number[] };
      const embedding: number[] = data.embedding || [];

      span.setAttributes({
        'text.length': text.length,
        'text.truncated': text.length > 8000,
        'embedding.dimensions': embedding.length,
        model: EMBEDDING_MODEL,
        service: OLLAMA_URL,
      });

      // Verify dimensions
      if (embedding.length > 0 && embedding.length !== EMBEDDING_DIMENSIONS) {
        console.error(
          `[Embeddings] Warning: Expected ${EMBEDDING_DIMENSIONS} dims, got ${embedding.length}`
        );
      }

      return embedding;
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error('[Embeddings] Request timeout');
      } else {
        console.error('[Embeddings] Request failed:', (error as Error).message);
      }
      return [];
    }
  });
}

/**
 * Generate embeddings for multiple texts (batch processing)
 *
 * @param texts - Array of texts to embed
 * @returns Array of 1024-dimensional embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (serviceDisabled || texts.length === 0) {
    return texts.map(() => []);
  }

  return maybeTrace('embeddings.generateBatch', async (span) => {
    const results: number[][] = [];

    // Process sequentially to avoid overwhelming the service
    // Could be parallelized with Promise.all if the service supports it
    for (const text of texts) {
      const embedding = await generateEmbedding(text);
      results.push(embedding);
    }

    span.setAttributes({
      'batch.size': texts.length,
      'embedding.dimensions': results[0]?.length || 0,
      model: EMBEDDING_MODEL,
      service: OLLAMA_URL,
    });

    return results;
  });
}

/**
 * Generate embedding for a student profile
 * Creates a structured text representation of the profile
 */
export async function embedStudentProfile(profile: {
  name?: string;
  diploma?: string;
  field?: string;
  skills?: string[];
  city?: string;
  monthlyIncome?: number;
  monthlyExpenses?: number;
  goals?: Array<{ name: string; amount: number }>;
}): Promise<number[]> {
  return maybeCreateSpan('embeddings.embedProfile', async (span) => {
    // Create structured text representation
    const parts: string[] = [];

    if (profile.diploma) parts.push(`Education: ${profile.diploma}`);
    if (profile.field) parts.push(`Field: ${profile.field}`);
    if (profile.skills?.length) parts.push(`Skills: ${profile.skills.join(', ')}`);
    if (profile.city) parts.push(`Location: ${profile.city}`);

    if (profile.monthlyIncome !== undefined) {
      parts.push(`Monthly income: ${profile.monthlyIncome}`);
    }
    if (profile.monthlyExpenses !== undefined) {
      parts.push(`Monthly expenses: ${profile.monthlyExpenses}`);
    }

    if (profile.goals?.length) {
      const goalTexts = profile.goals.map((g) => `${g.name} (${g.amount})`).join(', ');
      parts.push(`Goals: ${goalTexts}`);
    }

    const profileText = parts.join('. ');

    span.setAttributes({
      'profile.fields': parts.length,
      'profile.hasSkills': (profile.skills?.length || 0) > 0,
      'profile.hasGoals': (profile.goals?.length || 0) > 0,
    });

    return generateEmbedding(profileText);
  });
}

/**
 * Generate embedding for a financial goal
 */
export async function embedGoal(goal: {
  name: string;
  amount: number;
  deadline?: string;
  description?: string;
  category?: string;
}): Promise<number[]> {
  return maybeCreateSpan('embeddings.embedGoal', async (span) => {
    const parts: string[] = [`Goal: ${goal.name}`, `Target amount: ${goal.amount}`];

    if (goal.deadline) parts.push(`Deadline: ${goal.deadline}`);
    if (goal.category) parts.push(`Category: ${goal.category}`);
    if (goal.description) parts.push(`Description: ${goal.description}`);

    const goalText = parts.join('. ');

    span.setAttributes({
      'goal.name': goal.name,
      'goal.amount': goal.amount,
      'goal.hasDeadline': !!goal.deadline,
    });

    return generateEmbedding(goalText);
  });
}

/**
 * Generate embedding for advice/recommendation text
 */
export async function embedAdvice(advice: {
  text: string;
  context?: string;
  goalType?: string;
}): Promise<number[]> {
  return maybeCreateSpan('embeddings.embedAdvice', async (span) => {
    const parts: string[] = [];

    if (advice.context) parts.push(`Context: ${advice.context}`);
    if (advice.goalType) parts.push(`Goal type: ${advice.goalType}`);
    parts.push(`Advice: ${advice.text}`);

    const adviceText = parts.join('. ');

    span.setAttributes({
      'advice.length': advice.text.length,
      'advice.hasContext': !!advice.context,
      'advice.goalType': advice.goalType || 'general',
    });

    return generateEmbedding(adviceText);
  });
}

/**
 * Check if the embedding service is available
 * Note: This is now a simple check, not about model loading
 */
export function isModelLoaded(): boolean {
  return !serviceDisabled;
}

/**
 * Get service info
 */
export function getModelInfo(): {
  name: string;
  dimensions: number;
  loaded: boolean;
  disabled: boolean;
  serviceUrl: string;
} {
  return {
    name: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    loaded: !serviceDisabled,
    disabled: serviceDisabled,
    serviceUrl: OLLAMA_URL,
  };
}

/**
 * Disable the embedding service (for graceful degradation)
 */
export function disableService(): void {
  serviceDisabled = true;
  console.error('[Embeddings] Service disabled');
}

/**
 * Enable the embedding service
 */
export function enableService(): void {
  serviceDisabled = false;
  console.error('[Embeddings] Service enabled');
}

// Export service
export const embeddings = {
  generate: generateEmbedding,
  generateBatch: generateEmbeddings,
  embedProfile: embedStudentProfile,
  embedGoal,
  embedAdvice,
  isLoaded: isModelLoaded,
  getInfo: getModelInfo,
  disable: disableService,
  enable: enableService,
};

export default embeddings;
