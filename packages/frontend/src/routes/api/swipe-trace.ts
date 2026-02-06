/**
 * Swipe Trace API Route
 *
 * Traces swipe preference updates to Opik for observability.
 * Captures swipe direction, scenario details, and preference weight changes.
 */

import type { APIEvent } from '@solidjs/start/server';
import { trace, logFeedbackScores, getTraceUrl } from '../../lib/opik';
import { createLogger } from '~/lib/logger';

const logger = createLogger('SwipeTrace');

interface SwipeTraceRequest {
  direction: 'left' | 'right' | 'up' | 'down';
  scenarioId: string;
  scenarioType?: string;
  scenarioTitle: string;
  oldWeights: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
  newWeights: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  };
  timeSpentMs: number;
  profileId?: string;
}

export async function POST(event: APIEvent) {
  // Generate unique request ID for structured logging
  const requestId = `swipe_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const data = (await event.request.json()) as SwipeTraceRequest;

    // Calculate weight changes
    const weightChanges = {
      effortSensitivity: data.newWeights.effortSensitivity - data.oldWeights.effortSensitivity,
      hourlyRatePriority: data.newWeights.hourlyRatePriority - data.oldWeights.hourlyRatePriority,
      timeFlexibility: data.newWeights.timeFlexibility - data.oldWeights.timeFlexibility,
      incomeStability: data.newWeights.incomeStability - data.oldWeights.incomeStability,
    };

    // Trace to Opik (flush happens at end of trace() automatically)
    const result = await trace(
      'swipe.preference_update',
      async (ctx) => {
        ctx.setAttributes({
          'swipe.direction': data.direction,
          'swipe.scenario_id': data.scenarioId,
          'swipe.scenario_type': data.scenarioType || 'unknown',
          'swipe.scenario_title': data.scenarioTitle,
          'swipe.time_spent_ms': data.timeSpentMs,
          'swipe.profile_id': data.profileId || 'anonymous',
          // Weight changes
          'swipe.weight_delta.effort': weightChanges.effortSensitivity.toFixed(3),
          'swipe.weight_delta.rate': weightChanges.hourlyRatePriority.toFixed(3),
          'swipe.weight_delta.flex': weightChanges.timeFlexibility.toFixed(3),
          'swipe.weight_delta.stability': weightChanges.incomeStability.toFixed(3),
        });

        ctx.setOutput({
          direction: data.direction,
          scenarioTitle: data.scenarioTitle,
          weightChanges,
          newWeights: data.newWeights,
        });

        const traceId = ctx.getTraceId();
        return {
          success: true,
          traceId,
          traceUrl: traceId ? getTraceUrl(traceId) : undefined,
        };
      },
      {
        source: 'swipe_session',
        tags: ['swipe', `direction:${data.direction}`, data.scenarioType || 'job'].filter(Boolean),
        input: {
          direction: data.direction,
          scenarioTitle: data.scenarioTitle,
          oldWeights: data.oldWeights,
        },
      }
    );

    // Log feedback AFTER trace is flushed (trace() auto-flushes on completion)
    if (result.traceId) {
      const swipeScore =
        data.direction === 'up'
          ? 1.0 // Super like
          : data.direction === 'right'
            ? 0.8 // Accept
            : data.direction === 'down'
              ? 0.2 // Meh
              : 0.0; // Left = reject

      // Fire and forget - don't block response for feedback logging
      logFeedbackScores(result.traceId, [
        {
          name: 'swipe_preference',
          value: swipeScore,
          reason: `${data.direction} swipe on "${data.scenarioTitle}"`,
        },
      ]).catch((err) => logger.warn('Feedback score failed', { error: err }));
    }

    logger.info(`${data.direction} on "${data.scenarioTitle}"`, {
      profileId: data.profileId || 'anonymous',
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    // Structured error logging with context for debugging
    logger.error('Error', {
      requestId,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return new Response(
      JSON.stringify({
        error: true,
        requestId,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
