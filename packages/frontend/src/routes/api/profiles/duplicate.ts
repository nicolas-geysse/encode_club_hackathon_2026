/**
 * Profile Duplication API
 *
 * POST: Duplicate a profile for a new goal workspace.
 * Copies all related data (skills, income, lifestyle, trades) to the new profile
 * and creates a goal in the goals table.
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, execute, escapeSQL, escapeJSON } from '../_db';
import { createLogger } from '../../../lib/logger';

const logger = createLogger('ProfileDuplicate');

export async function POST(event: APIEvent) {
  try {
    const body = await event.request.json();
    const { sourceProfileId, goalName, goalAmount, goalDeadline } = body;

    if (!sourceProfileId || !goalName || goalAmount == null) {
      return new Response(
        JSON.stringify({ error: 'sourceProfileId, goalName, and goalAmount are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const escapedSourceId = escapeSQL(sourceProfileId);

    // 1. Load source profile
    const sourceRows = await query<Record<string, unknown>>(
      `SELECT * FROM profiles WHERE id = ${escapedSourceId}`
    );
    if (sourceRows.length === 0) {
      return new Response(JSON.stringify({ error: 'Source profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const source = sourceRows[0];

    // 2. Create new profile ID
    const newProfileId = crypto.randomUUID();
    const escapedNewId = escapeSQL(newProfileId);

    // 3. Deactivate all profiles, then insert new one
    await execute(`UPDATE profiles SET is_active = FALSE`);

    // Copy profile with fresh goal state
    await execute(`
      INSERT INTO profiles (
        id, name, diploma, field, currency, skills, certifications,
        city, city_size, latitude, longitude, address,
        income_sources, expenses, max_work_hours_weekly, min_hourly_rate,
        has_loan, loan_amount, monthly_income, monthly_expenses, monthly_margin,
        income_day, profile_type, parent_profile_id,
        goal_name, goal_amount, goal_deadline,
        plan_data, followup_data, achievements, swipe_preferences, skipped_steps,
        is_active
      )
      SELECT
        ${escapedNewId},
        name,
        diploma, field, currency, skills, certifications,
        city, city_size, latitude, longitude, address,
        -- income_sources/expenses set to NULL: real data is in income_items/lifestyle_items tables
        -- Keeping both would cause duplicates via mergeExpenseSources fallback
        NULL, NULL, max_work_hours_weekly, min_hourly_rate,
        has_loan, loan_amount, monthly_income, monthly_expenses, monthly_margin,
        income_day,
        'goal-clone',
        ${escapedSourceId},
        ${escapeSQL(goalName)},
        ${goalAmount},
        ${goalDeadline ? escapeSQL(goalDeadline) : 'NULL'},
        NULL,
        NULL,
        NULL,
        swipe_preferences,
        skipped_steps,
        TRUE
      FROM profiles WHERE id = ${escapedSourceId}
    `);

    // 4. Copy skills
    try {
      const skillCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM skills WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(skillCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO skills (id, profile_id, name, level, hourly_rate, market_demand, cognitive_effort, rest_needed, score, created_at, updated_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, name, level, hourly_rate, market_demand, cognitive_effort, rest_needed, score, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM skills WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated skills', { count: Number(skillCount[0]?.cnt) });
      }
    } catch (err) {
      logger.warn('Failed to duplicate skills (table may not exist)', { error: err });
    }

    // 5. Copy income_items
    try {
      const incomeCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM income_items WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(incomeCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO income_items (id, profile_id, name, amount, created_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, name, amount, CURRENT_TIMESTAMP
          FROM income_items WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated income items', { count: Number(incomeCount[0]?.cnt) });
      }
    } catch (err) {
      logger.warn('Failed to duplicate income items (table may not exist)', { error: err });
    }

    // 6. Copy lifestyle_items
    try {
      const lifestyleCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM lifestyle_items WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(lifestyleCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO lifestyle_items (id, profile_id, name, category, current_cost, optimized_cost, suggestion, essential, applied, paused_months, created_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, name, category, current_cost, optimized_cost, suggestion, essential, FALSE, 0, CURRENT_TIMESTAMP
          FROM lifestyle_items WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated lifestyle items', {
          count: Number(lifestyleCount[0]?.cnt),
        });
      }
    } catch (err) {
      logger.warn('Failed to duplicate lifestyle items (table may not exist)', { error: err });
    }

    // 7. Copy trades
    try {
      const tradeCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM trades WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(tradeCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO trades (id, profile_id, type, name, description, partner, value, status, due_date, inventory_item_id, created_at, updated_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, type, name, description, partner, value, status, due_date, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          FROM trades WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated trades', { count: Number(tradeCount[0]?.cnt) });
      }
    } catch (err) {
      logger.warn('Failed to duplicate trades (table may not exist)', { error: err });
    }

    // 8. Copy academic_events (exam/vacation schedule — user-level, needed by retroplanning)
    try {
      const aeCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM academic_events WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(aeCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO academic_events (id, profile_id, name, type, start_date, end_date,
            capacity_impact, priority, is_recurring, recurrence_pattern, created_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, name, type, start_date, end_date,
            capacity_impact, priority, is_recurring, recurrence_pattern, CURRENT_TIMESTAMP
          FROM academic_events WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated academic events', { count: Number(aeCount[0]?.cnt) });
      }
    } catch (err) {
      logger.warn('Failed to duplicate academic_events (table may not exist)', { error: err });
    }

    // 9. Copy commitments (classes, sports, family — user-level schedule constraints)
    try {
      const cmtCount = await query<{ cnt: bigint }>(
        `SELECT COUNT(*) as cnt FROM commitments WHERE profile_id = ${escapedSourceId}`
      );
      if (Number(cmtCount[0]?.cnt) > 0) {
        await execute(`
          INSERT INTO commitments (id, profile_id, name, type, hours_per_week,
            flexible_hours, day_preferences, start_date, end_date, priority, created_at)
          SELECT
            gen_random_uuid()::VARCHAR, ${escapedNewId}, name, type, hours_per_week,
            flexible_hours, day_preferences, start_date, end_date, priority, CURRENT_TIMESTAMP
          FROM commitments WHERE profile_id = ${escapedSourceId}
        `);
        logger.info('Duplicated commitments', { count: Number(cmtCount[0]?.cnt) });
      }
    } catch (err) {
      logger.warn('Failed to duplicate commitments (table may not exist)', { error: err });
    }

    // 10. Create goal in goals table
    const goalId = crypto.randomUUID();
    try {
      await execute(`
        INSERT INTO goals (id, profile_id, name, amount, deadline, priority, status, progress, created_at, updated_at)
        VALUES (
          ${escapeSQL(goalId)},
          ${escapedNewId},
          ${escapeSQL(goalName)},
          ${goalAmount},
          ${goalDeadline ? escapeSQL(goalDeadline) : 'NULL'},
          1,
          'active',
          0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `);
      logger.info('Created goal for new profile', { goalId, goalName });
    } catch (err) {
      logger.warn('Failed to create goal (table may not exist yet)', { error: err });
    }

    logger.info('Profile duplicated successfully', {
      sourceProfileId,
      newProfileId,
      goalName,
    });

    return new Response(
      JSON.stringify({
        success: true,
        profileId: newProfileId,
        goalId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Duplicate profile error', { error });
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Duplication failed',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
