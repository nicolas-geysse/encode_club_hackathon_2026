/**
 * Profile Reset API Route
 *
 * Deletes all data associated with a profile (skills, goals, inventory, lifestyle, income)
 * without deleting the profile itself. Used when creating a truly fresh start.
 */

import type { APIEvent } from '@solidjs/start/server';
import { execute, escapeSQL } from '../_db';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('ProfilesReset');

// POST: Reset profile data (delete associated data from all tables)
export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { profileId } = body;

    if (!profileId) {
      return new Response(JSON.stringify({ error: true, message: 'profileId required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedProfileId = escapeSQL(profileId);
    const deletedTables: string[] = [];

    // Delete goals for this profile
    try {
      await execute(`DELETE FROM goals WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('goals');
    } catch {
      // Goals table might not exist yet, ignore
    }

    // Delete skills for this profile
    try {
      await execute(`DELETE FROM skills WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('skills');
    } catch {
      // Skills table might not exist yet, ignore
    }

    // Delete inventory items for this profile
    try {
      await execute(`DELETE FROM inventory_items WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('inventory_items');
    } catch {
      // Inventory table might not exist yet, ignore
    }

    // Delete lifestyle items for this profile
    try {
      await execute(`DELETE FROM lifestyle_items WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('lifestyle_items');
    } catch {
      // Lifestyle table might not exist yet, ignore
    }

    // Delete income items for this profile
    try {
      await execute(`DELETE FROM income_items WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('income_items');
    } catch {
      // Income table might not exist yet, ignore
    }

    // Delete leads (saved job opportunities) for this profile
    try {
      await execute(`DELETE FROM leads WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('leads');
    } catch {
      // Leads table might not exist yet, ignore
    }

    // Delete trades for this profile
    try {
      await execute(`DELETE FROM trades WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('trades');
    } catch {
      // Trades table might not exist yet, ignore
    }

    // Delete energy logs for this profile
    try {
      await execute(`DELETE FROM energy_logs WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('energy_logs');
    } catch {
      // Energy logs table might not exist yet, ignore
    }

    // Delete chat messages for this profile
    try {
      await execute(`DELETE FROM chat_messages WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('chat_messages');
    } catch {
      // Chat messages table might not exist yet, ignore
    }

    // Delete job exclusions for this profile
    try {
      await execute(`DELETE FROM job_exclusions WHERE profile_id = ${escapedProfileId}`);
      deletedTables.push('job_exclusions');
    } catch {
      // Job exclusions table might not exist yet, ignore
    }

    // Reset skipped_steps and followup_data on the profile itself
    try {
      await execute(`
        UPDATE profiles SET
          skipped_steps = NULL,
          followup_data = '{}'
        WHERE id = ${escapedProfileId}
      `);
    } catch {
      // Column might not exist yet, ignore
    }

    logger.info('Profile data reset', { profileId, deletedTables });

    return new Response(
      JSON.stringify({
        success: true,
        profileId,
        deletedTables,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('POST error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database operation failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
