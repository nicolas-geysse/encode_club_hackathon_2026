/**
 * Vector Store Service - RAG for personalized advice
 *
 * Uses @mastra/duckdb for embedded vector storage with HNSW indexing.
 * Stores student profiles and advice history for similarity search.
 */

import { DuckDBVector } from '@mastra/duckdb';
import { maybeTrace, maybeCreateSpan } from './opik.js';
import * as path from 'path';
import * as fs from 'fs';

// Vector store instance (lazy initialized)
let vectorStore: DuckDBVector | null = null;

/**
 * Retry wrapper for DuckDB operations that may fail due to transaction conflicts.
 * Uses exponential backoff to handle concurrent upsert race conditions.
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; context?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 100, context = 'operation' } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isConflict =
        error instanceof Error &&
        (error.message.includes('Conflict') || error.message.includes('transaction'));

      if (isConflict && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.error(
          `[VectorStore] ${context}: conflict on attempt ${attempt}/${maxRetries}, retrying in ${delay}ms`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  // TypeScript: unreachable but needed for type inference
  throw new Error('Retry exhausted');
}

// Configuration
const VECTOR_DB_DIR = process.env.VECTOR_DB_DIR || path.resolve(process.cwd(), 'data');
const VECTOR_DB_PATH = path.join(VECTOR_DB_DIR, 'stride-vectors.duckdb');

// Index dimensions - BGE-M3 uses 1024 dimensions
const EMBEDDING_DIMENSIONS = 1024;

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(VECTOR_DB_DIR)) {
    fs.mkdirSync(VECTOR_DB_DIR, { recursive: true });
    console.error(`[VectorStore] Created data directory: ${VECTOR_DB_DIR}`);
  }
}

/**
 * Initialize the vector store with required indexes
 */
export async function initVectorStore(): Promise<DuckDBVector> {
  if (vectorStore) return vectorStore;

  ensureDataDir();

  vectorStore = new DuckDBVector({
    id: 'stride-vectors',
    path: VECTOR_DB_PATH,
    dimensions: EMBEDDING_DIMENSIONS,
    metric: 'cosine',
  });

  // Create indexes for different data types
  try {
    await vectorStore.createIndex({
      indexName: 'student_profiles',
      dimension: EMBEDDING_DIMENSIONS,
    });
    console.error('[VectorStore] Index student_profiles created/verified');
  } catch (error) {
    // Index may already exist
    console.error('[VectorStore] student_profiles index:', (error as Error).message);
  }

  try {
    await vectorStore.createIndex({
      indexName: 'advice_history',
      dimension: EMBEDDING_DIMENSIONS,
    });
    console.error('[VectorStore] Index advice_history created/verified');
  } catch (error) {
    console.error('[VectorStore] advice_history index:', (error as Error).message);
  }

  try {
    await vectorStore.createIndex({
      indexName: 'goals',
      dimension: EMBEDDING_DIMENSIONS,
    });
    console.error('[VectorStore] Index goals created/verified');
  } catch (error) {
    console.error('[VectorStore] goals index:', (error as Error).message);
  }

  console.error(`[VectorStore] Initialized at ${VECTOR_DB_PATH}`);
  return vectorStore;
}

/**
 * Embed a student profile for later similarity search
 */
export async function embedProfile(
  profileId: string,
  profileText: string,
  embedding: number[],
  metadata?: Record<string, unknown>
): Promise<void> {
  return maybeTrace('vectorstore.embedProfile', async (span) => {
    const store = await initVectorStore();

    await withRetry(
      () =>
        store.upsert({
          indexName: 'student_profiles',
          vectors: [embedding],
          metadata: [{ profileId, text: profileText, ...metadata }],
          ids: [profileId],
        }),
      { context: `embedProfile(${profileId})` }
    );

    span.setAttributes({
      'profile.id': profileId,
      'text.length': profileText.length,
      'embedding.dimensions': embedding.length,
    });
  });
}

/**
 * Find similar student profiles based on embedding similarity
 */
export async function findSimilarProfiles(
  queryEmbedding: number[],
  topK = 5,
  minScore = 0.7
): Promise<
  Array<{
    id: string;
    score: number;
    metadata: Record<string, unknown>;
  }>
> {
  return maybeTrace('vectorstore.findSimilarProfiles', async (span) => {
    const store = await initVectorStore();

    const results = await store.query({
      indexName: 'student_profiles',
      queryVector: queryEmbedding,
      topK,
      includeVector: false,
    });

    // Filter by minimum score
    const filtered = results.filter((r) => r.score >= minScore);

    span.setAttributes({
      'query.topK': topK,
      'query.minScore': minScore,
      'results.total': results.length,
      'results.filtered': filtered.length,
    });

    return filtered.map((r) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata || {},
    }));
  });
}

/**
 * Store advice given to a student for RAG retrieval
 */
export async function storeAdvice(
  adviceId: string,
  adviceText: string,
  embedding: number[],
  metadata: {
    profileId: string;
    goalType?: string;
    outcome?: 'helpful' | 'neutral' | 'unhelpful';
    timestamp?: string;
    [key: string]: unknown;
  }
): Promise<void> {
  return maybeCreateSpan('vectorstore.storeAdvice', async (span) => {
    const store = await initVectorStore();

    await withRetry(
      () =>
        store.upsert({
          indexName: 'advice_history',
          vectors: [embedding],
          metadata: [{ adviceId, text: adviceText, ...metadata }],
          ids: [adviceId],
        }),
      { context: `storeAdvice(${adviceId})` }
    );

    span.setAttributes({
      'advice.id': adviceId,
      'advice.profileId': metadata.profileId,
      'advice.outcome': metadata.outcome || 'unknown',
    });
  });
}

/**
 * Find similar advice that was helpful in the past
 */
export async function findSimilarAdvice(
  queryEmbedding: number[],
  options: {
    topK?: number;
    minScore?: number;
    onlyHelpful?: boolean;
    goalType?: string;
  } = {}
): Promise<
  Array<{
    id: string;
    score: number;
    text: string;
    metadata: Record<string, unknown>;
  }>
> {
  return maybeCreateSpan('vectorstore.findSimilarAdvice', async (span) => {
    const store = await initVectorStore();
    const { topK = 5, minScore = 0.6, onlyHelpful = false, goalType } = options;

    // Build filter if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filter: any = undefined;

    if (onlyHelpful || goalType) {
      const conditions: Record<string, unknown>[] = [];

      if (onlyHelpful) {
        conditions.push({ outcome: { $eq: 'helpful' } });
      }

      if (goalType) {
        conditions.push({ goalType: { $eq: goalType } });
      }

      if (conditions.length === 1) {
        filter = conditions[0];
      } else if (conditions.length > 1) {
        filter = { $and: conditions };
      }
    }

    const results = await store.query({
      indexName: 'advice_history',
      queryVector: queryEmbedding,
      topK,
      includeVector: false,
      filter,
    });

    const filtered = results.filter((r) => r.score >= minScore);

    span.setAttributes({
      'query.topK': topK,
      'query.minScore': minScore,
      'query.onlyHelpful': onlyHelpful,
      'query.goalType': goalType || 'any',
      'results.count': filtered.length,
    });

    return filtered.map((r) => ({
      id: r.id,
      score: r.score,
      text: (r.metadata?.text as string) || '',
      metadata: r.metadata || {},
    }));
  });
}

/**
 * Store a goal for similarity search
 */
export async function embedGoal(
  goalId: string,
  goalText: string,
  embedding: number[],
  metadata: {
    userId: string;
    goalName: string;
    goalAmount: number;
    feasibilityScore?: number;
    status?: string;
    [key: string]: unknown;
  }
): Promise<void> {
  return maybeCreateSpan('vectorstore.embedGoal', async (span) => {
    const store = await initVectorStore();

    await withRetry(
      () =>
        store.upsert({
          indexName: 'goals',
          vectors: [embedding],
          metadata: [{ goalId, text: goalText, ...metadata }],
          ids: [goalId],
        }),
      { context: `embedGoal(${goalId})` }
    );

    span.setAttributes({
      'goal.id': goalId,
      'goal.name': metadata.goalName,
      'goal.userId': metadata.userId,
    });
  });
}

/**
 * Find similar goals achieved by other students
 */
export async function findSimilarGoals(
  queryEmbedding: number[],
  options: {
    topK?: number;
    minScore?: number;
    onlyCompleted?: boolean;
    excludeUserId?: string;
  } = {}
): Promise<
  Array<{
    id: string;
    score: number;
    metadata: Record<string, unknown>;
  }>
> {
  return maybeCreateSpan('vectorstore.findSimilarGoals', async (span) => {
    const store = await initVectorStore();
    const { topK = 5, minScore = 0.6, onlyCompleted = false, excludeUserId } = options;

    // Build filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let filter: any = undefined;
    const conditions: Record<string, unknown>[] = [];

    if (onlyCompleted) {
      conditions.push({ status: { $eq: 'completed' } });
    }

    if (excludeUserId) {
      conditions.push({ userId: { $ne: excludeUserId } });
    }

    if (conditions.length === 1) {
      filter = conditions[0];
    } else if (conditions.length > 1) {
      filter = { $and: conditions };
    }

    const results = await store.query({
      indexName: 'goals',
      queryVector: queryEmbedding,
      topK,
      includeVector: false,
      filter,
    });

    const filtered = results.filter((r) => r.score >= minScore);

    span.setAttributes({
      'query.topK': topK,
      'query.minScore': minScore,
      'query.onlyCompleted': onlyCompleted,
      'results.count': filtered.length,
    });

    return filtered.map((r) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata || {},
    }));
  });
}

/**
 * Update advice outcome for feedback learning
 */
export async function updateAdviceOutcome(
  adviceId: string,
  outcome: 'helpful' | 'neutral' | 'unhelpful'
): Promise<void> {
  return maybeCreateSpan('vectorstore.updateAdviceOutcome', async (span) => {
    const store = await initVectorStore();

    await withRetry(
      () =>
        store.updateVector({
          indexName: 'advice_history',
          id: adviceId,
          update: {
            metadata: { outcome, updatedAt: new Date().toISOString() },
          },
        }),
      { context: `updateAdviceOutcome(${adviceId})` }
    );

    span.setAttributes({
      'advice.id': adviceId,
      'advice.outcome': outcome,
    });
  });
}

/**
 * Close the vector store connection
 */
export async function closeVectorStore(): Promise<void> {
  if (vectorStore) {
    await vectorStore.close();
    vectorStore = null;
    console.error('[VectorStore] Closed');
  }
}

/**
 * Get vector store info for debugging
 */
export async function getVectorStoreInfo(): Promise<{
  path: string;
  indexes: string[];
  stats: Record<string, unknown>;
}> {
  const store = await initVectorStore();
  const indexes = await store.listIndexes();

  const stats: Record<string, unknown> = {};
  for (const indexName of indexes) {
    try {
      stats[indexName] = await store.describeIndex({ indexName });
    } catch {
      stats[indexName] = { error: 'Could not describe index' };
    }
  }

  return {
    path: VECTOR_DB_PATH,
    indexes,
    stats,
  };
}

// Export service
export const vectorstore = {
  init: initVectorStore,
  embedProfile,
  findSimilarProfiles,
  storeAdvice,
  findSimilarAdvice,
  embedGoal,
  findSimilarGoals,
  updateAdviceOutcome,
  close: closeVectorStore,
  getInfo: getVectorStoreInfo,
};

export default vectorstore;
