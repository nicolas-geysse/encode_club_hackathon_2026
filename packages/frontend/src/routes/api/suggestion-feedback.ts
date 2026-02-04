/**
 * Suggestion Feedback API Route
 *
 * Phase 6: Persists user feedback on suggestions (skills, jobs, swipe scenarios)
 * Stored in DuckDB for local analysis and recommendation improvement.
 *
 * Phase 7: Added Opik tracing for user feedback (P7.3)
 */

import type { APIEvent } from '@solidjs/start/server';
import { initDatabase, execute, query, escapeSQL, executeSchema } from './_db';
import { trace, logFeedbackScores, getTraceUrl, type TraceOptions } from '../../lib/opik';
import { createLogger } from '~/lib/logger';

const logger = createLogger('SuggestionFeedback');

// Track if table is created
let tableCreated = false;

// Feedback table schema
const FEEDBACK_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS suggestion_feedback (
    id VARCHAR PRIMARY KEY,
    profile_id VARCHAR NOT NULL,
    suggestion_type VARCHAR NOT NULL,
    suggestion_id VARCHAR NOT NULL,
    feedback VARCHAR,
    metadata VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

async function ensureFeedbackTable(): Promise<void> {
  if (tableCreated) return;
  await initDatabase();
  await executeSchema(FEEDBACK_TABLE_SQL);
  tableCreated = true;
}

interface FeedbackRequest {
  profileId: string;
  suggestionType: 'skill' | 'job' | 'swipe';
  suggestionId: string;
  feedback: 'up' | 'down' | null;
  metadata?: Record<string, unknown>;
}

/**
 * POST - Create or update feedback
 * Phase 7 (P7.3): Traces user feedback to Opik for quality monitoring
 */
export async function POST(event: APIEvent) {
  try {
    const body = (await event.request.json()) as FeedbackRequest;
    const { profileId, suggestionType, suggestionId, feedback, metadata } = body;

    if (!profileId || !suggestionType || !suggestionId) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId, suggestionType, and suggestionId are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Phase 7 (P7.3): Trace user feedback for quality monitoring
    const traceOptions: TraceOptions = {
      source: 'user_feedback',
      tags: ['feedback', suggestionType, feedback || 'removed'],
      input: { profileId, suggestionType, suggestionId, feedback },
      metadata: {
        'feedback.type': suggestionType,
        'feedback.value': feedback || 'removed',
        'feedback.suggestion_id': suggestionId,
      },
    };

    const result = await trace(
      'feedback.user_rating',
      async (ctx) => {
        await ensureFeedbackTable();

        const id = `${profileId}_${suggestionType}_${suggestionId}`;
        const metadataJson = metadata ? JSON.stringify(metadata) : null;

        // Delete existing feedback for this suggestion
        await execute(`DELETE FROM suggestion_feedback WHERE id = ${escapeSQL(id)}`);

        // Only insert if feedback is not null (null means removed feedback)
        if (feedback !== null) {
          await execute(
            `INSERT INTO suggestion_feedback (id, profile_id, suggestion_type, suggestion_id, feedback, metadata, updated_at)
             VALUES (${escapeSQL(id)}, ${escapeSQL(profileId)}, ${escapeSQL(suggestionType)}, ${escapeSQL(suggestionId)}, ${escapeSQL(feedback)}, ${escapeSQL(metadataJson)}, CURRENT_TIMESTAMP)`
          );
        }

        // Set trace attributes
        ctx.setAttributes({
          'feedback.profile_id': profileId,
          'feedback.suggestion_type': suggestionType,
          'feedback.suggestion_id': suggestionId,
          'feedback.value': feedback || 'removed',
          'feedback.has_metadata': !!metadata,
        });

        ctx.setOutput({
          id,
          feedback,
          suggestionType,
          suggestionId,
          traceUrl: getTraceUrl(ctx.getTraceId() || undefined),
        });

        // Log feedback score to Opik for quality monitoring
        const traceId = ctx.getTraceId();
        if (traceId && feedback !== null) {
          // Convert thumb feedback to numeric score: up=1.0, down=0.0
          const feedbackScore = feedback === 'up' ? 1.0 : 0.0;
          await logFeedbackScores(traceId, [
            {
              name: `${suggestionType}_feedback`,
              value: feedbackScore,
              reason: `User rated ${suggestionType} suggestion "${suggestionId}" as ${feedback}`,
            },
          ]);
        }

        return { success: true, id, feedback, traceId };
      },
      traceOptions
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET - Get feedback for a profile or specific suggestion
 */
export async function GET(event: APIEvent) {
  try {
    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');
    const suggestionType = url.searchParams.get('suggestionType');
    const suggestionId = url.searchParams.get('suggestionId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await ensureFeedbackTable();

    let sql = `SELECT * FROM suggestion_feedback WHERE profile_id = ${escapeSQL(profileId)}`;

    if (suggestionType) {
      sql += ` AND suggestion_type = ${escapeSQL(suggestionType)}`;
    }

    if (suggestionId) {
      sql += ` AND suggestion_id = ${escapeSQL(suggestionId)}`;
    }

    sql += ' ORDER BY updated_at DESC';

    const results = await query(sql);

    // Parse metadata JSON
    const parsed = results.map((row: Record<string, unknown>) => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
    }));

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
