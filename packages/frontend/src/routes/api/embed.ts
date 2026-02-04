/**
 * Embedding Trigger API Endpoint
 *
 * Triggers vector embedding for profiles and goals.
 * Non-blocking - returns success immediately, embedding happens in background.
 *
 * @see sprint-10-5.md Phase 3
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '../../lib/logger';

const logger = createLogger('EmbedAPI');

/**
 * Track in-flight embedding operations to prevent concurrent upserts
 * that cause DuckDB transaction conflicts (DELETE+INSERT race condition)
 */
const inFlightEmbeddings = new Map<string, Promise<void>>();

/**
 * Get a unique key for tracking in-flight operations
 */
function getEmbedKey(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * POST /api/embed
 * Trigger embedding for a profile or goal
 */
export async function POST({ request }: APIEvent) {
  try {
    const body = await request.json();
    const { type, id, data } = body as {
      type: 'profile' | 'goal';
      id: string;
      data: Record<string, unknown>;
    };

    if (!type || !id) {
      return new Response(JSON.stringify({ error: 'type and id are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if an embedding is already in progress for this type/id
    const embedKey = getEmbedKey(type, id);
    if (inFlightEmbeddings.has(embedKey)) {
      logger.debug(`Skipping duplicate embedding request for ${type}/${id} (already in progress)`);
      return new Response(JSON.stringify({ success: true, queued: false, skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fire-and-forget embedding in background with deduplication tracking
    const embeddingPromise = triggerEmbedding(type, id, data)
      .catch((error) => {
        logger.warn(`Background embedding failed for ${type}/${id}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      })
      .finally(() => {
        // Always remove from tracking when done (success or failure)
        inFlightEmbeddings.delete(embedKey);
      });

    // Track this embedding operation
    inFlightEmbeddings.set(embedKey, embeddingPromise);

    return new Response(JSON.stringify({ success: true, queued: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Embedding request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return new Response(JSON.stringify({ error: 'Embedding request failed', success: false }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Background embedding task
 */
async function triggerEmbedding(
  type: 'profile' | 'goal',
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    // Dynamic import to avoid bundling issues with native modules
    const { indexStudentProfile, indexGoal } = await import('@stride/mcp-server/services');

    switch (type) {
      case 'profile': {
        // Convert goals from strings to { name, amount } format if needed
        const goals = data.goals as Array<string | { name: string; amount: number }> | undefined;
        const formattedGoals = goals?.map((g) =>
          typeof g === 'string' ? { name: g, amount: 0 } : g
        );

        await indexStudentProfile(id, {
          diploma: data.diploma as string | undefined,
          skills: data.skills as string[] | undefined,
          monthlyIncome: data.monthlyIncome as number | undefined,
          monthlyExpenses: data.monthlyExpenses as number | undefined,
          goals: formattedGoals,
        });
        logger.debug(`Profile ${id} embedded successfully`);
        break;
      }

      case 'goal': {
        const name = data.name as string;
        const amount = (data.amount as number | undefined) ?? 0;
        const userId = (data.userId as string | undefined) ?? id;

        await indexGoal(id, {
          name,
          amount,
          userId,
          deadline: data.deadline as string | undefined,
          description: data.description as string | undefined,
          category: data.category as string | undefined,
        });
        logger.debug(`Goal ${id} embedded successfully`);
        break;
      }

      default:
        logger.warn(`Unknown type: ${type}`);
    }
  } catch (error) {
    // Log but don't throw - embedding is non-critical
    logger.warn(`Embedding failed for ${type}/${id}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error; // Re-throw so caller can catch
  }
}

/**
 * GET /api/embed/health
 * Check if embedding services are available
 */
export async function GET() {
  try {
    const services = await import('@stride/mcp-server/services');
    const available =
      typeof services.indexStudentProfile === 'function' &&
      typeof services.indexGoal === 'function';

    return new Response(JSON.stringify({ available }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({ available: false, reason: 'mcp-server services not available' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
