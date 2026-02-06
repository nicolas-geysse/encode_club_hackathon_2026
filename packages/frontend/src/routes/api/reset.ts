/**
 * Reset API Route
 *
 * Dangerous endpoint to delete ALL data and start fresh.
 * Used for debugging/demo purposes.
 */

import type { APIEvent } from '@solidjs/start/server';
import { execute } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('Reset');

// DELETE: Reset all data
export async function DELETE(_event: APIEvent) {
  try {
    logger.info('Resetting all data...');

    // Delete in order to respect foreign key constraints
    // (even though DuckDB doesn't enforce them, good practice)

    // 1. Delete all goals
    try {
      await execute(`DELETE FROM goals`);
      logger.info('Deleted all goals');
    } catch {
      // Table might not exist
    }

    // 2. Delete all skills
    try {
      await execute(`DELETE FROM skills`);
      logger.info('Deleted all skills');
    } catch {
      // Table might not exist
    }

    // 3. Delete all inventory items
    try {
      await execute(`DELETE FROM inventory_items`);
      logger.info('Deleted all inventory items');
    } catch {
      // Table might not exist
    }

    // 4. Delete all lifestyle items
    try {
      await execute(`DELETE FROM lifestyle_items`);
      logger.info('Deleted all lifestyle items');
    } catch {
      // Table might not exist
    }

    // 5. Delete all trades
    try {
      await execute(`DELETE FROM trades`);
      logger.info('Deleted all trades');
    } catch {
      // Table might not exist
    }

    // 5b. Delete all leads (saved job opportunities)
    try {
      await execute(`DELETE FROM leads`);
      logger.info('Deleted all leads');
    } catch {
      // Table might not exist
    }

    // 5c. Delete all energy logs (mood entries)
    try {
      await execute(`DELETE FROM energy_logs`);
      logger.info('Deleted all energy logs');
    } catch {
      // Table might not exist
    }

    // 5d. Delete all chat messages
    try {
      await execute(`DELETE FROM chat_messages`);
      logger.info('Deleted all chat messages');
    } catch {
      // Table might not exist
    }

    // 6. Reset simulation state to today (UPDATE, not DELETE)
    // Sprint 13.14 Fix: UPDATE instead of DELETE to preserve the 'global' row
    // Deleting causes the simulation to not have a row, which breaks the context
    try {
      await execute(`
        UPDATE simulation_state SET
          simulated_date = CURRENT_DATE,
          real_date = CURRENT_DATE,
          offset_days = 0,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = 'global'
      `);
      logger.info('Reset simulation state to today');
    } catch {
      // Table might not exist or no 'global' row yet
    }

    // 6b. Reset followup data in profiles (savings credits, adjustments, currentAmount)
    // Sprint 13.14 Fix: Clear accumulated savings data when resetting
    try {
      await execute(`
        UPDATE profiles SET
          followup_data = '{}'
        WHERE followup_data IS NOT NULL AND followup_data != '{}'
      `);
      logger.info('Reset all profile followup data');
    } catch {
      // Table or column might not exist
    }

    // 7. Delete all profiles (last, as other tables reference it)
    try {
      await execute(`DELETE FROM profiles`);
      logger.info('Deleted all profiles');
    } catch {
      // Table might not exist
    }

    logger.info('Reset complete - all data deleted');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'All data has been deleted. Ready for fresh start.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    logger.error('Reset error', { error });
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Reset failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}
