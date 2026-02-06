/**
 * Job Exclusions API Route
 *
 * CRUD for job and category exclusions.
 * Users can exclude individual jobs (thumb down) or entire categories.
 */

import type { APIEvent } from '@solidjs/start/server';
import { execute, query } from './_db';
import { ensureSchema, SCHEMAS } from '~/lib/api/schemaManager';
import { createLogger } from '~/lib/logger';

const logger = createLogger('exclusions-api');

async function initSchema() {
  await ensureSchema(
    'job_exclusions',
    SCHEMAS.job_exclusions,
    logger as Parameters<typeof ensureSchema>[2]
  );
}

// GET: List exclusions for a profile
export async function GET(event: APIEvent): Promise<Response> {
  try {
    await initSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');

    if (!profileId) {
      return new Response(JSON.stringify({ error: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const rows = await query(
      `SELECT id, profile_id, exclusion_type, target_id, target_label, reason, created_at
       FROM job_exclusions
       WHERE profile_id = '${profileId}'
       ORDER BY created_at DESC`
    );

    const exclusions = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      profileId: row.profile_id,
      exclusionType: row.exclusion_type,
      targetId: row.target_id,
      targetLabel: row.target_label,
      reason: row.reason,
      createdAt: row.created_at,
    }));

    return new Response(JSON.stringify(exclusions), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('GET error', { error });
    return new Response(JSON.stringify({ error: 'Failed to fetch exclusions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// POST: Add an exclusion
export async function POST(event: APIEvent): Promise<Response> {
  try {
    await initSchema();

    const body = await event.request.json();
    const { profileId, exclusionType, targetId, targetLabel, reason } = body;

    if (!profileId || !exclusionType || !targetId) {
      return new Response(
        JSON.stringify({ error: 'profileId, exclusionType, and targetId are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['job', 'category'].includes(exclusionType)) {
      return new Response(JSON.stringify({ error: 'exclusionType must be "job" or "category"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check for duplicate
    const existing = await query(
      `SELECT id FROM job_exclusions
       WHERE profile_id = '${profileId}'
       AND exclusion_type = '${exclusionType}'
       AND target_id = '${targetId}'`
    );

    if (existing.length > 0) {
      return new Response(JSON.stringify({ message: 'Already excluded', id: existing[0].id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = crypto.randomUUID();
    const safeLabel = (targetLabel || '').replace(/'/g, "''");
    const safeReason = (reason || '').replace(/'/g, "''");

    await execute(
      `INSERT INTO job_exclusions (id, profile_id, exclusion_type, target_id, target_label, reason)
       VALUES ('${id}', '${profileId}', '${exclusionType}', '${targetId}', '${safeLabel}', '${safeReason}')`
    );

    logger.info('Exclusion added', { id, profileId, exclusionType, targetId });

    return new Response(
      JSON.stringify({
        id,
        profileId,
        exclusionType,
        targetId,
        targetLabel,
        reason,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(JSON.stringify({ error: 'Failed to add exclusion' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// DELETE: Remove an exclusion
export async function DELETE(event: APIEvent): Promise<Response> {
  try {
    await initSchema();

    const url = new URL(event.request.url);
    const id = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    if (id) {
      // Delete single exclusion
      await execute(`DELETE FROM job_exclusions WHERE id = '${id}'`);
      logger.info('Exclusion removed', { id });
    } else if (profileId) {
      // Delete all exclusions for profile
      await execute(`DELETE FROM job_exclusions WHERE profile_id = '${profileId}'`);
      logger.info('All exclusions removed for profile', { profileId });
    } else {
      return new Response(JSON.stringify({ error: 'id or profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('DELETE error', { error });
    return new Response(JSON.stringify({ error: 'Failed to delete exclusion' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
