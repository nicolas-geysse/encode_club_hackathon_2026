/**
 * Embedding Service - Local embedding generation
 *
 * Uses @xenova/transformers for in-process embedding generation.
 * Model: BGE-M3 (1024 dimensions) for multilingual support.
 *
 * For production, consider converting to ONNX for faster inference:
 * - Install: pip install model2vec onnx
 * - Convert: model.export_onnx("./models/m2v-bge-m3-1024d.onnx")
 */

import { maybeTrace, maybeCreateSpan } from './opik.js';

// Lazy-load pipeline to avoid startup delay
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractorPipeline: any = null;
let modelLoadPromise: Promise<unknown> | null = null;
let modelDisabled = false;

// Model configuration
const MODEL_NAME = 'Xenova/bge-m3';
const EMBEDDING_DIMENSIONS = 1024;

/**
 * Get or create the embedding extractor pipeline.
 * Lazy loads the model on first use.
 */
async function getExtractor() {
  if (extractorPipeline) return extractorPipeline;

  // Prevent multiple concurrent loads
  if (modelLoadPromise) {
    await modelLoadPromise;
    return extractorPipeline;
  }

  modelLoadPromise = (async () => {
    try {
      console.error(`[Embeddings] Loading model ${MODEL_NAME}...`);
      const startTime = Date.now();

      // Dynamic import to avoid bundling issues
      const { pipeline } = await import('@xenova/transformers');

      // Load the BGE-M3 model for feature extraction
      extractorPipeline = await pipeline('feature-extraction', MODEL_NAME, {
        // Use quantized version for faster inference
        quantized: true,
      });

      const loadTime = Date.now() - startTime;
      console.error(`[Embeddings] Model loaded in ${loadTime}ms`);

      return extractorPipeline;
    } catch (error) {
      console.error('[Embeddings] Model disabled:', error instanceof Error ? error.message : error);
      modelDisabled = true;
      extractorPipeline = null;
      modelLoadPromise = null;
      // DON'T throw - gracefully degrade
      return null;
    }
  })();

  await modelLoadPromise;
  return extractorPipeline;
}

/**
 * Generate embedding for a single text
 *
 * @param text - Text to embed
 * @returns 1024-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (modelDisabled) {
    console.error('[Embeddings] Skipping - model disabled');
    return [];
  }

  return maybeTrace('embeddings.generate', async (span) => {
    const extractor = await getExtractor();

    if (!extractor) {
      console.error('[Embeddings] Skipping - model not available');
      return [];
    }

    // Truncate text if too long (BGE-M3 max ~8192 tokens)
    const truncatedText = text.slice(0, 8000);

    const output = await extractor(truncatedText, {
      pooling: 'cls', // BGE models use CLS pooling
      normalize: true, // L2 normalize for cosine similarity
    });

    // Convert to array
    const embedding = Array.from(output.data) as number[];

    span.setAttributes({
      'text.length': text.length,
      'text.truncated': text.length > 8000,
      'embedding.dimensions': embedding.length,
      model: MODEL_NAME,
    });

    // Verify dimensions
    if (embedding.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `[Embeddings] Warning: Expected ${EMBEDDING_DIMENSIONS} dims, got ${embedding.length}`
      );
    }

    return embedding;
  });
}

/**
 * Generate embeddings for multiple texts (batch processing)
 *
 * @param texts - Array of texts to embed
 * @returns Array of 1024-dimensional embedding vectors
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (modelDisabled) {
    return texts.map(() => []);
  }

  return maybeTrace('embeddings.generateBatch', async (span) => {
    const extractor = await getExtractor();

    if (!extractor) {
      return texts.map(() => []);
    }

    const results: number[][] = [];

    // Process in batches to avoid memory issues
    const batchSize = 4;
    const batches = Math.ceil(texts.length / batchSize);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);

      // Process batch sequentially (transformers.js handles internal batching)
      for (const text of batch) {
        const truncatedText = text.slice(0, 8000);
        const output = await extractor(truncatedText, {
          pooling: 'cls',
          normalize: true,
        });
        results.push(Array.from(output.data) as number[]);
      }
    }

    span.setAttributes({
      'batch.size': texts.length,
      'batch.count': batches,
      'embedding.dimensions': results[0]?.length || 0,
      model: MODEL_NAME,
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
 * Check if the embedding model is loaded and available
 */
export function isModelLoaded(): boolean {
  return extractorPipeline !== null && !modelDisabled;
}

/**
 * Get model info
 */
export function getModelInfo(): {
  name: string;
  dimensions: number;
  loaded: boolean;
  disabled: boolean;
} {
  return {
    name: MODEL_NAME,
    dimensions: EMBEDDING_DIMENSIONS,
    loaded: isModelLoaded(),
    disabled: modelDisabled,
  };
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
};

export default embeddings;
