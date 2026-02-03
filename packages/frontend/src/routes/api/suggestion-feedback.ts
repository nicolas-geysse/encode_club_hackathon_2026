/**
 * Suggestion Feedback API Route
 *
 * Phase 6: Persists user feedback on suggestions (skills, jobs, swipe scenarios)
 * Stored in DuckDB for local analysis and recommendation improvement.
 */

import type { APIEvent } from '@solidjs/start/server';
import { initDatabase, execute, query, escapeSQL, executeSchema } from './_db';

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

    return new Response(JSON.stringify({ success: true, id, feedback }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SuggestionFeedback] POST error:', error);
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
    console.error('[SuggestionFeedback] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
