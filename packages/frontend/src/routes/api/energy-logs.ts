/**
 * Energy Logs API
 *
 * GET: Fetch energy logs for a profile (for energy chart)
 *
 * Sprint Graphiques: Created for energy timeline chart
 */

import type { APIEvent } from '@solidjs/start/server';
import { query, escapeSQL } from './_db';
import { createLogger } from '~/lib/logger';

const logger = createLogger('EnergyLogs');

interface EnergyLog {
  id: string;
  profile_id: string;
  log_date: string;
  energy_level: number;
  mood_score: number;
  stress_level: number;
  hours_slept: number;
  notes: string;
  created_at: string;
}

/**
 * GET /api/energy-logs?profileId=xxx
 * Returns energy logs for a profile, formatted for the energy chart
 */
export async function GET(event: APIEvent) {
  const url = new URL(event.request.url);
  const profileId = url.searchParams.get('profileId');

  if (!profileId) {
    return new Response(JSON.stringify({ error: 'profileId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Use escapeSQL to prevent SQL injection
    const safeProfileId = escapeSQL(profileId);
    const logs = await query<EnergyLog>(`
      SELECT id, profile_id, log_date, energy_level, mood_score, stress_level, hours_slept, notes, created_at
      FROM energy_logs
      WHERE profile_id = ${safeProfileId}
      ORDER BY log_date DESC
      LIMIT 30
    `);

    // Transform to format expected by buildEnergyChart
    // energy_level in DB is 1-5, we need to convert to 0-100 scale
    const formattedLogs = logs.map((log) => ({
      date: log.log_date,
      level: (log.energy_level / 5) * 100, // Convert 1-5 to 0-100
    }));

    return new Response(JSON.stringify({ logs: formattedLogs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error('Query failed', { error });
    return new Response(JSON.stringify({ error: 'Failed to fetch energy logs', logs: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
