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

    logger.info('Received feedback request', {
      traceId,
      scoresCount: scores?.length,
      hasApiKey: !!process.env.OPIK_API_KEY,
      workspace: process.env.OPIK_WORKSPACE,
    });

    if (!traceId || !scores || !Array.isArray(scores)) {
      logger.warn('Invalid feedback request', { traceId, hasScores: !!scores });
      return new Response(
        JSON.stringify({ error: true, message: 'traceId and scores are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log feedback to Opik
    const success = await logFeedbackScores(traceId, scores);

    if (success) {
      logger.info(`Logged ${scores.length} score(s) for trace ${traceId}`);
      return new Response(JSON.stringify({ success: true, traceId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      logger.error('logFeedbackScores returned false', { traceId });
      return new Response(
        JSON.stringify({ error: true, message: 'Failed to log feedback to Opik' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    logger.error('Feedback API error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
