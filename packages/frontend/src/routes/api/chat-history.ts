/**
 * Chat History API Route
 *
 * Persists chat messages to DuckDB for proper cross-device persistence.
 * Replaces localStorage-based persistence from Bug 9 fix.
 */

import type { APIEvent } from '@solidjs/start/server';
import { initDatabase, execute, query, escapeSQL, escapeJSON } from './_db';
import { createLogger } from '~/lib/logger';

const logger = createLogger('ChatHistory');

// Initialize chat_messages table
async function initChatTable() {
  await initDatabase();
  await execute(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      thread_id VARCHAR,
      role VARCHAR NOT NULL,
      content TEXT NOT NULL,
      source VARCHAR,
      extracted_data JSON,
      ui_resource JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create index for faster queries by profile
  try {
    await execute(`CREATE INDEX IF NOT EXISTS idx_chat_profile ON chat_messages(profile_id)`);
  } catch {
    // Index might already exist
  }
}

interface ChatMessage {
  id: string;
  profile_id: string;
  thread_id?: string;
  role: 'user' | 'assistant';
  content: string;
  source?: string;
  extracted_data?: Record<string, unknown>;
  ui_resource?: Record<string, unknown>;
  created_at?: string;
}

/**
 * GET /api/chat-history?profileId=xxx&limit=50
 * Retrieve chat history for a profile
 */
export async function GET({ request }: APIEvent) {
  try {
    await initChatTable();

    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');
    const limit = parseInt(url.searchParams.get('limit') || '50', 10);
    const threadId = url.searchParams.get('threadId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let sql = `
      SELECT id, profile_id, thread_id, role, content, source, extracted_data, ui_resource, created_at
      FROM chat_messages
      WHERE profile_id = ${escapeSQL(profileId)}
    `;

    if (threadId) {
      sql += ` AND thread_id = ${escapeSQL(threadId)}`;
    }

    // Subquery: get the N most RECENT messages, then sort ASC for display order
    sql = `SELECT * FROM (${sql} ORDER BY created_at DESC LIMIT ${limit}) sub ORDER BY created_at ASC`;

    const rows = await query<{
      id: string;
      profile_id: string;
      thread_id: string | null;
      role: string;
      content: string;
      source: string | null;
      extracted_data: string | null;
      ui_resource: string | null;
      created_at: string;
    }>(sql);

    const messages = rows.map((row) => ({
      id: row.id,
      profileId: row.profile_id,
      threadId: row.thread_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      source: row.source,
      extractedData: row.extracted_data ? JSON.parse(row.extracted_data) : undefined,
      uiResource: row.ui_resource ? JSON.parse(row.ui_resource) : undefined,
      createdAt: row.created_at,
    }));

    return new Response(JSON.stringify(messages), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to get chat history', { error });
    return new Response(JSON.stringify({ error: 'Failed to get chat history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * POST /api/chat-history
 * Save a new chat message
 */
export async function POST({ request }: APIEvent) {
  try {
    await initChatTable();

    const body = (await request.json()) as ChatMessage;

    if (!body.profile_id || !body.role || !body.content) {
      return new Response(JSON.stringify({ error: 'profile_id, role, and content are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = body.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Sprint 13.15: Use escapeJSON for JSON columns (no backslash escaping needed)
    const extractedDataJson = body.extracted_data ? escapeJSON(body.extracted_data) : 'NULL';
    const uiResourceJson = body.ui_resource ? escapeJSON(body.ui_resource) : 'NULL';

    const sql = `
      INSERT INTO chat_messages (id, profile_id, thread_id, role, content, source, extracted_data, ui_resource)
      VALUES (
        ${escapeSQL(id)},
        ${escapeSQL(body.profile_id)},
        ${body.thread_id ? escapeSQL(body.thread_id) : 'NULL'},
        ${escapeSQL(body.role)},
        ${escapeSQL(body.content)},
        ${body.source ? escapeSQL(body.source) : 'NULL'},
        ${extractedDataJson},
        ${uiResourceJson}
      )
    `;
    await execute(sql);

    return new Response(JSON.stringify({ id, success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to save chat message', { error });
    return new Response(JSON.stringify({ error: 'Failed to save chat message' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * DELETE /api/chat-history?profileId=xxx
 * Clear chat history for a profile (useful for "start fresh")
 */
export async function DELETE({ request }: APIEvent) {
  try {
    await initChatTable();

    const url = new URL(request.url);
    const profileId = url.searchParams.get('profileId');
    const threadId = url.searchParams.get('threadId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let sql = `DELETE FROM chat_messages WHERE profile_id = ${escapeSQL(profileId)}`;

    if (threadId) {
      sql += ` AND thread_id = ${escapeSQL(threadId)}`;
    }

    await execute(sql);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Failed to delete chat history', { error });
    return new Response(JSON.stringify({ error: 'Failed to delete chat history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
