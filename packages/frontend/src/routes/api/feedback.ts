/**
 * Feedback API Route
 *
 * Logs user feedback scores to Opik for trace evaluation.
 * Called from chat message thumbs up/down buttons.
 */

import type { APIEvent } from '@solidjs/start/server';
import { logFeedbackScores, type FeedbackScore } from '../../lib/opik';
import { createLogger } from '~/lib/logger';

const logger = createLogger('Feedback');

interface FeedbackRequest {
  traceId: string;
  scores: FeedbackScore[];
}

export async function POST(event: APIEvent) {
  try {
    const body = (await event.request.json()) as FeedbackRequest;
    const { traceId, scores } = body;

    if (!traceId || !scores || !Array.isArray(scores)) {
      return new Response(
        JSON.stringify({ error: true, message: 'traceId and scores are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log feedback to Opik
    const success = await logFeedbackScores(traceId, scores);

    if (success) {
      logger.info(`Logged ${scores.length} score(s) for trace ${traceId}`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      return new Response(JSON.stringify({ error: true, message: 'Failed to log feedback' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    logger.error('Error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
