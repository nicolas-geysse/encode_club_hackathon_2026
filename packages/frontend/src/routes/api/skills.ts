/* eslint-disable no-console */
/**
 * Skills API Route
 *
 * Handles skill CRUD operations using DuckDB.
 * Skills are separate from profiles for:
 * - Clean data architecture
 * - Opik traceability (each skill operation can be traced)
 * - Query flexibility (skill-based job matching)
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, escapeSQL } from './_db';

// Schema initialization flag (persists across requests in same process)
let skillsSchemaInitialized = false;

// Initialize skills schema if needed
async function ensureSkillsSchema(): Promise<void> {
  if (skillsSchemaInitialized) return;

  try {
    await execute(`
      CREATE TABLE IF NOT EXISTS skills (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        level VARCHAR DEFAULT 'intermediate',
        hourly_rate DECIMAL DEFAULT 15,
        market_demand INTEGER DEFAULT 3,
        cognitive_effort INTEGER DEFAULT 3,
        rest_needed DECIMAL DEFAULT 1,
        score DECIMAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    skillsSchemaInitialized = true;
    console.log('[Skills] Schema initialized');
  } catch (error) {
    // Table might already exist, mark as initialized anyway
    console.log('[Skills] Schema init note:', error);
    skillsSchemaInitialized = true;
  }
}

// Skill type from DB
interface SkillRow {
  id: string;
  profile_id: string;
  name: string;
  level: string;
  hourly_rate: number;
  market_demand: number;
  cognitive_effort: number;
  rest_needed: number;
  score: number | null;
  created_at: string;
  updated_at: string;
}

// Public Skill type
export interface Skill {
  id: string;
  profileId: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  hourlyRate: number;
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
  score?: number;
  createdAt?: string;
  updatedAt?: string;
}

function rowToSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    profileId: row.profile_id,
    name: row.name,
    level: (row.level || 'intermediate') as Skill['level'],
    hourlyRate: row.hourly_rate || 15,
    marketDemand: row.market_demand || 3,
    cognitiveEffort: row.cognitive_effort || 3,
    restNeeded: row.rest_needed || 1,
    score: row.score || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Calculate skill arbitrage score
 * Weights: rate (30%) + demand (25%) + effort (25%) + rest (20%)
 */
function calculateArbitrageScore(skill: {
  hourlyRate: number;
  marketDemand: number;
  cognitiveEffort: number;
  restNeeded: number;
}): number {
  const weights = {
    rate: 0.3,
    demand: 0.25,
    effort: 0.25,
    rest: 0.2,
  };

  const hourlyRate = skill.hourlyRate > 0 ? skill.hourlyRate : 15;
  const marketDemand = skill.marketDemand > 0 ? skill.marketDemand : 3;
  const cognitiveEffort = skill.cognitiveEffort > 0 ? skill.cognitiveEffort : 3;
  const restNeeded = skill.restNeeded >= 0 ? skill.restNeeded : 1;

  const normalizedRate = Math.min(hourlyRate / 30, 1);
  const normalizedDemand = marketDemand / 5;
  const normalizedEffort = 1 - cognitiveEffort / 5;
  const normalizedRest = 1 - restNeeded / 4;

  return (
    (weights.rate * normalizedRate +
      weights.demand * normalizedDemand +
      weights.effort * normalizedEffort +
      weights.rest * normalizedRest) *
    10
  );
}

// GET: List skills for a profile or get specific skill
export async function GET(event: APIEvent) {
  try {
    await ensureSkillsSchema();

    const url = new URL(event.request.url);
    const skillId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    if (skillId) {
      // Get specific skill
      const escapedSkillId = escapeSQL(skillId);
      const skillRows = await query<SkillRow>(`SELECT * FROM skills WHERE id = ${escapedSkillId}`);

      if (skillRows.length === 0) {
        return new Response(JSON.stringify({ error: true, message: 'Skill not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(rowToSkill(skillRows[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (profileId) {
      // List skills for profile, sorted by score descending
      const escapedProfileId = escapeSQL(profileId);
      const skillRows = await query<SkillRow>(
        `SELECT * FROM skills WHERE profile_id = ${escapedProfileId} ORDER BY score DESC NULLS LAST, created_at DESC`
      );

      const skills = skillRows.map(rowToSkill);

      return new Response(JSON.stringify(skills), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: true, message: 'profileId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Skills] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// POST: Create a new skill
export async function POST(event: APIEvent) {
  try {
    await ensureSkillsSchema();

    const body = await event.request.json();
    const {
      profileId,
      name,
      level = 'intermediate',
      hourlyRate = 15,
      marketDemand = 3,
      cognitiveEffort = 3,
      restNeeded = 1,
    } = body;

    if (!profileId || !name) {
      return new Response(
        JSON.stringify({
          error: true,
          message: 'profileId and name are required',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Check for existing skill with same name (case-insensitive) to prevent duplicates
    const escapedProfileId = escapeSQL(profileId);
    const escapedName = escapeSQL(name.toLowerCase());
    const existing = await query<SkillRow>(
      `SELECT * FROM skills WHERE profile_id = ${escapedProfileId} AND LOWER(name) = ${escapedName}`
    );

    if (existing.length > 0) {
      // Skill already exists - return it instead of creating duplicate
      console.log(`[Skills] Skill "${name}" already exists for profile, skipping duplicate`);
      return new Response(JSON.stringify(rowToSkill(existing[0])), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const skillId = uuidv4();

    // Calculate score
    const score = calculateArbitrageScore({
      hourlyRate,
      marketDemand,
      cognitiveEffort,
      restNeeded,
    });

    // Insert skill
    await execute(`
      INSERT INTO skills (
        id, profile_id, name, level, hourly_rate, market_demand,
        cognitive_effort, rest_needed, score
      ) VALUES (
        ${escapeSQL(skillId)},
        ${escapeSQL(profileId)},
        ${escapeSQL(name)},
        ${escapeSQL(level)},
        ${hourlyRate},
        ${marketDemand},
        ${cognitiveEffort},
        ${restNeeded},
        ${score}
      )
    `);

    // Fetch the created skill
    const skillRows = await query<SkillRow>(
      `SELECT * FROM skills WHERE id = ${escapeSQL(skillId)}`
    );
    const skill = rowToSkill(skillRows[0]);

    return new Response(JSON.stringify(skill), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Skills] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// PUT: Update skill
export async function PUT(event: APIEvent) {
  try {
    await ensureSkillsSchema();

    const body = await event.request.json();
    const { id, ...updates } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: true, message: 'id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedId = escapeSQL(id);

    // Check if skill exists
    const existing = await query<SkillRow>(`SELECT * FROM skills WHERE id = ${escapedId}`);
    if (existing.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Skill not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build update query
    const updateFields: string[] = ['updated_at = CURRENT_TIMESTAMP'];

    const currentSkill = existing[0];
    const newHourlyRate = updates.hourlyRate ?? currentSkill.hourly_rate;
    const newMarketDemand = updates.marketDemand ?? currentSkill.market_demand;
    const newCognitiveEffort = updates.cognitiveEffort ?? currentSkill.cognitive_effort;
    const newRestNeeded = updates.restNeeded ?? currentSkill.rest_needed;

    if (updates.name !== undefined) {
      updateFields.push(`name = ${escapeSQL(updates.name)}`);
    }
    if (updates.level !== undefined) {
      updateFields.push(`level = ${escapeSQL(updates.level)}`);
    }
    if (updates.hourlyRate !== undefined) {
      updateFields.push(`hourly_rate = ${updates.hourlyRate}`);
    }
    if (updates.marketDemand !== undefined) {
      updateFields.push(`market_demand = ${updates.marketDemand}`);
    }
    if (updates.cognitiveEffort !== undefined) {
      updateFields.push(`cognitive_effort = ${updates.cognitiveEffort}`);
    }
    if (updates.restNeeded !== undefined) {
      updateFields.push(`rest_needed = ${updates.restNeeded}`);
    }

    // Recalculate score if any scoring field changed
    const newScore = calculateArbitrageScore({
      hourlyRate: newHourlyRate,
      marketDemand: newMarketDemand,
      cognitiveEffort: newCognitiveEffort,
      restNeeded: newRestNeeded,
    });
    updateFields.push(`score = ${newScore}`);

    await execute(`UPDATE skills SET ${updateFields.join(', ')} WHERE id = ${escapedId}`);

    // Fetch updated skill
    const skillRows = await query<SkillRow>(`SELECT * FROM skills WHERE id = ${escapedId}`);
    const skill = rowToSkill(skillRows[0]);

    return new Response(JSON.stringify(skill), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Skills] PUT error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// DELETE: Delete skill(s) - supports single id or bulk by profileId
export async function DELETE(event: APIEvent) {
  try {
    await ensureSkillsSchema();

    const url = new URL(event.request.url);
    const skillId = url.searchParams.get('id');
    const profileId = url.searchParams.get('profileId');

    // Bulk delete by profileId (for re-onboarding)
    if (profileId && !skillId) {
      const escapedProfileId = escapeSQL(profileId);
      const countResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM skills WHERE profile_id = ${escapedProfileId}`
      );
      // Convert BigInt to Number (DuckDB returns BigInt for COUNT)
      const count = Number(countResult[0]?.count || 0);

      await execute(`DELETE FROM skills WHERE profile_id = ${escapedProfileId}`);

      console.log(`[Skills] Bulk deleted ${count} skills for profile ${profileId}`);
      return new Response(JSON.stringify({ success: true, deletedCount: count }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Single skill delete by id
    if (!skillId) {
      return new Response(JSON.stringify({ error: true, message: 'id or profileId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const escapedSkillId = escapeSQL(skillId);

    // Get skill info before deletion
    const skill = await query<{ name: string }>(
      `SELECT name FROM skills WHERE id = ${escapedSkillId}`
    );
    if (skill.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Skill not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete the skill
    await execute(`DELETE FROM skills WHERE id = ${escapedSkillId}`);

    return new Response(JSON.stringify({ success: true, deleted: skill[0].name }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Skills] DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
