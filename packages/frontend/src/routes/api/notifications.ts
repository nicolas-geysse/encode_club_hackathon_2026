/* eslint-disable no-console */
/**
 * Notifications API Route
 *
 * CRUD operations for user notifications.
 * Persisted to DuckDB for across-session persistence.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';

// Schema initialization flag
let schemaInitialized = false;

// Notification types
type NotificationType =
  | 'comeback_detected'
  | 'energy_debt'
  | 'milestone_25'
  | 'milestone_50'
  | 'milestone_75'
  | 'milestone_100'
  | 'goal_updated'
  | 'achievement_unlocked'
  | 'weekly_summary'
  | 'system';

// Initialize notifications schema if needed
async function ensureNotificationsSchema(): Promise<void> {
  if (schemaInitialized) return;

  try {
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        title VARCHAR NOT NULL,
        message TEXT,
        data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read BOOLEAN DEFAULT false,
        dismissed BOOLEAN DEFAULT false
      )
    `);

    // Create index on profile_id for faster lookups
    await execute(`
      CREATE INDEX IF NOT EXISTS idx_notifications_profile
      ON notifications(profile_id)
    `).catch(() => {
      // Index might already exist
    });

    schemaInitialized = true;
    console.log('[Notifications] Schema initialized');
  } catch {
    // Table might already exist
    schemaInitialized = true;
  }
}

// Notification row type
interface NotificationRow {
  id: string;
  profile_id: string;
  type: string;
  title: string;
  message: string | null;
  data: string | null;
  created_at: string;
  read: boolean;
  dismissed: boolean;
}

function rowToNotification(row: NotificationRow) {
  return {
    id: row.id,
    profileId: row.profile_id,
    type: row.type as NotificationType,
    title: row.title,
    message: row.message,
    data: row.data ? JSON.parse(row.data) : null,
    createdAt: row.created_at,
    read: row.read,
    dismissed: row.dismissed,
  };
}

// GET: List notifications for a profile
export async function GET(event: APIEvent) {
  try {
    await ensureNotificationsSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let sql = `SELECT * FROM notifications WHERE profile_id = ${escapeSQL(profileId)} AND dismissed = false`;

    if (unreadOnly) {
      sql += ' AND read = false';
    }

    sql += ` ORDER BY created_at DESC LIMIT ${limit}`;

    const rows = await query<NotificationRow>(sql);
    const notifications = rows.map(rowToNotification);

    // Also get count of unread
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM notifications WHERE profile_id = ${escapeSQL(profileId)} AND read = false AND dismissed = false`
    );

    return new Response(
      JSON.stringify({
        notifications,
        unreadCount: countResult[0]?.count || 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Notifications] GET error:', error);
    return new Response(JSON.stringify({ error: true, message: 'Failed to fetch notifications' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// POST: Create a new notification
export async function POST(event: APIEvent) {
  try {
    await ensureNotificationsSchema();

    const body = await event.request.json();
    const { profileId, type, title, message, data } = body;

    if (!profileId || !type || !title) {
      return new Response(
        JSON.stringify({ error: true, message: 'profileId, type, and title are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = uuidv4();
    const dataJson = data ? JSON.stringify(data).replace(/'/g, "''") : 'NULL';

    await execute(`
      INSERT INTO notifications (id, profile_id, type, title, message, data)
      VALUES (
        ${escapeSQL(id)},
        ${escapeSQL(profileId)},
        ${escapeSQL(type)},
        ${escapeSQL(title)},
        ${escapeSQL(message || null)},
        ${dataJson === 'NULL' ? 'NULL' : `'${dataJson}'`}
      )
    `);

    return new Response(
      JSON.stringify({
        id,
        profileId,
        type,
        title,
        message,
        data,
        read: false,
        dismissed: false,
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Notifications] POST error:', error);
    return new Response(JSON.stringify({ error: true, message: 'Failed to create notification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// PUT: Update notification (mark as read, dismiss)
export async function PUT(event: APIEvent) {
  try {
    await ensureNotificationsSchema();

    const body = await event.request.json();
    const { id, profileId, action } = body;

    if (!id && !profileId) {
      return new Response(JSON.stringify({ error: true, message: 'id or profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (action === 'markRead' && id) {
      // Mark single notification as read
      await execute(`UPDATE notifications SET read = true WHERE id = ${escapeSQL(id)}`);
    } else if (action === 'markAllRead' && profileId) {
      // Mark all notifications as read for profile
      await execute(
        `UPDATE notifications SET read = true WHERE profile_id = ${escapeSQL(profileId)}`
      );
    } else if (action === 'dismiss' && id) {
      // Dismiss single notification
      await execute(`UPDATE notifications SET dismissed = true WHERE id = ${escapeSQL(id)}`);
    } else if (action === 'dismissAll' && profileId) {
      // Dismiss all notifications for profile
      await execute(
        `UPDATE notifications SET dismissed = true WHERE profile_id = ${escapeSQL(profileId)}`
      );
    } else {
      return new Response(JSON.stringify({ error: true, message: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, action }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Notifications] PUT error:', error);
    return new Response(JSON.stringify({ error: true, message: 'Failed to update notification' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// DELETE: Delete notifications
export async function DELETE(event: APIEvent) {
  try {
    await ensureNotificationsSchema();

    const url = new URL(event.request.url);
    const id = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    if (id) {
      // Delete single notification
      await execute(`DELETE FROM notifications WHERE id = ${escapeSQL(id)}`);
    } else if (profileId) {
      // Delete all notifications for profile
      await execute(`DELETE FROM notifications WHERE profile_id = ${escapeSQL(profileId)}`);
    } else {
      return new Response(JSON.stringify({ error: true, message: 'id or profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Notifications] DELETE error:', error);
    return new Response(
      JSON.stringify({ error: true, message: 'Failed to delete notifications' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
