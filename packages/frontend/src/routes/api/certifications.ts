/* eslint-disable no-console */
/**
 * Certifications API Route
 *
 * Manages professional certifications that open job opportunities for students.
 * Includes seed data for common certifications in France, UK, US, and International.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';

// Schema initialization flag
let schemaInitialized = false;
let seedDataInserted = false;

/**
 * Certification types by category
 */
type CertificationCategory =
  | 'childcare'
  | 'lifeguard'
  | 'first_aid'
  | 'diving'
  | 'teaching'
  | 'food'
  | 'other';

/**
 * Seed data for common certifications
 */
const CERTIFICATION_SEED_DATA = [
  // France
  {
    code: 'BAFA',
    name: "Brevet d'aptitude aux fonctions d'animateur",
    country: 'FR',
    category: 'childcare' as CertificationCategory,
    duration_hours: 64,
    typical_cost_eur: 800,
    min_age: 17,
    jobs_enabled: ['summer_camp_counselor', 'youth_animator', 'after_school_staff'],
  },
  {
    code: 'BNSSA',
    name: 'Brevet National de Sécurité et de Sauvetage Aquatique',
    country: 'FR',
    category: 'lifeguard' as CertificationCategory,
    duration_hours: 35,
    typical_cost_eur: 600,
    min_age: 17,
    jobs_enabled: ['pool_lifeguard', 'beach_lifeguard', 'aquatic_center_staff'],
  },
  {
    code: 'PSC1',
    name: 'Prévention et Secours Civiques de niveau 1',
    country: 'FR',
    category: 'first_aid' as CertificationCategory,
    duration_hours: 7,
    typical_cost_eur: 60,
    min_age: 10,
    jobs_enabled: ['first_aid_responder', 'event_staff', 'childcare_assistant'],
  },
  {
    code: 'SST',
    name: 'Sauveteur Secouriste du Travail',
    country: 'FR',
    category: 'first_aid' as CertificationCategory,
    duration_hours: 14,
    typical_cost_eur: 200,
    min_age: 16,
    jobs_enabled: ['workplace_safety_officer', 'factory_worker', 'warehouse_staff'],
  },

  // UK
  {
    code: 'DBS',
    name: 'Disclosure and Barring Service Check',
    country: 'UK',
    category: 'childcare' as CertificationCategory,
    duration_hours: 0,
    typical_cost_eur: 30,
    min_age: 16,
    jobs_enabled: ['nanny', 'tutor', 'teaching_assistant', 'youth_worker'],
  },
  {
    code: 'PFA',
    name: 'Paediatric First Aid',
    country: 'UK',
    category: 'first_aid' as CertificationCategory,
    duration_hours: 12,
    typical_cost_eur: 150,
    min_age: 16,
    jobs_enabled: ['nursery_worker', 'nanny', 'childminder', 'teaching_assistant'],
  },
  {
    code: 'NPLQ',
    name: 'National Pool Lifeguard Qualification',
    country: 'UK',
    category: 'lifeguard' as CertificationCategory,
    duration_hours: 40,
    typical_cost_eur: 350,
    min_age: 16,
    jobs_enabled: ['pool_lifeguard', 'leisure_center_staff', 'swimming_instructor'],
  },

  // US
  {
    code: 'CPR_AHA',
    name: 'CPR/First Aid (American Heart Association)',
    country: 'US',
    category: 'first_aid' as CertificationCategory,
    duration_hours: 8,
    typical_cost_eur: 80,
    min_age: 14,
    jobs_enabled: ['healthcare_assistant', 'camp_counselor', 'fitness_instructor'],
  },
  {
    code: 'LIFEGUARD_RC',
    name: 'Lifeguard Certification (Red Cross)',
    country: 'US',
    category: 'lifeguard' as CertificationCategory,
    duration_hours: 25,
    typical_cost_eur: 300,
    min_age: 15,
    jobs_enabled: ['pool_lifeguard', 'beach_lifeguard', 'waterpark_staff'],
  },
  {
    code: 'FOOD_HANDLER',
    name: 'Food Handler Certification',
    country: 'US',
    category: 'food' as CertificationCategory,
    duration_hours: 4,
    typical_cost_eur: 20,
    min_age: 14,
    jobs_enabled: ['restaurant_worker', 'barista', 'food_truck_staff', 'catering'],
  },

  // International
  {
    code: 'PADI_OW',
    name: 'PADI Open Water Diver',
    country: 'INTL',
    category: 'diving' as CertificationCategory,
    duration_hours: 20,
    typical_cost_eur: 400,
    min_age: 10,
    jobs_enabled: ['dive_guide_assistant', 'tourism_water_sports'],
  },
  {
    code: 'PADI_DM',
    name: 'PADI Divemaster',
    country: 'INTL',
    category: 'diving' as CertificationCategory,
    duration_hours: 60,
    typical_cost_eur: 1200,
    min_age: 18,
    jobs_enabled: ['professional_dive_guide', 'dive_shop_staff', 'resort_water_sports'],
  },
  {
    code: 'TEFL',
    name: 'TEFL/TESOL Certificate',
    country: 'INTL',
    category: 'teaching' as CertificationCategory,
    duration_hours: 120,
    typical_cost_eur: 350,
    min_age: 18,
    jobs_enabled: ['english_teacher_abroad', 'language_tutor', 'online_english_teacher'],
  },
  {
    code: 'SSI_OW',
    name: 'SSI Open Water Diver',
    country: 'INTL',
    category: 'diving' as CertificationCategory,
    duration_hours: 20,
    typical_cost_eur: 380,
    min_age: 10,
    jobs_enabled: ['dive_guide_assistant', 'tourism_water_sports'],
  },
];

/**
 * Initialize certifications schema
 */
async function ensureCertificationsSchema(): Promise<void> {
  if (schemaInitialized) return;

  try {
    // Certifications reference table
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS certifications (
        id VARCHAR PRIMARY KEY,
        code VARCHAR NOT NULL UNIQUE,
        name VARCHAR NOT NULL,
        country VARCHAR NOT NULL,
        category VARCHAR NOT NULL,
        duration_hours INTEGER,
        typical_cost_eur DECIMAL,
        min_age INTEGER,
        jobs_enabled JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Profile-certifications junction table
    await executeSchema(`
      CREATE TABLE IF NOT EXISTS profile_certifications (
        id VARCHAR PRIMARY KEY,
        profile_id VARCHAR NOT NULL,
        certification_id VARCHAR NOT NULL,
        obtained_at DATE,
        expires_at DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(profile_id, certification_id)
      )
    `);

    schemaInitialized = true;
    console.log('[Certifications] Schema initialized');
  } catch (err) {
    console.error('[Certifications] Schema init error:', err);
    schemaInitialized = true; // Don't retry
  }
}

/**
 * Insert seed data if not already present
 */
async function ensureSeedData(): Promise<void> {
  if (seedDataInserted) return;

  try {
    // Check if seed data exists
    const existingCount = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM certifications`
    );

    if (existingCount[0].count > 0) {
      seedDataInserted = true;
      return;
    }

    // Insert seed data
    for (const cert of CERTIFICATION_SEED_DATA) {
      const id = uuidv4();
      await execute(`
        INSERT INTO certifications (id, code, name, country, category, duration_hours, typical_cost_eur, min_age, jobs_enabled)
        VALUES (
          ${escapeSQL(id)},
          ${escapeSQL(cert.code)},
          ${escapeSQL(cert.name)},
          ${escapeSQL(cert.country)},
          ${escapeSQL(cert.category)},
          ${cert.duration_hours},
          ${cert.typical_cost_eur},
          ${cert.min_age},
          ${escapeSQL(JSON.stringify(cert.jobs_enabled))}
        )
      `);
    }

    seedDataInserted = true;
    console.log(`[Certifications] Inserted ${CERTIFICATION_SEED_DATA.length} seed certifications`);
  } catch (err) {
    console.error('[Certifications] Seed data error:', err);
    seedDataInserted = true; // Don't retry
  }
}

// Certification row type
interface CertificationRow {
  id: string;
  code: string;
  name: string;
  country: string;
  category: string;
  duration_hours: number | null;
  typical_cost_eur: number | null;
  min_age: number | null;
  jobs_enabled: string | null;
  created_at: string;
}

function rowToCertification(row: CertificationRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    country: row.country,
    category: row.category,
    durationHours: row.duration_hours,
    typicalCostEur: row.typical_cost_eur,
    minAge: row.min_age,
    jobsEnabled: row.jobs_enabled ? JSON.parse(row.jobs_enabled) : [],
  };
}

/**
 * GET: List certifications or get profile certifications
 */
export async function GET(event: APIEvent) {
  try {
    await ensureCertificationsSchema();
    await ensureSeedData();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');
    const country = url.searchParams.get('country');
    const category = url.searchParams.get('category');

    if (profileId) {
      // Get certifications for a specific profile
      const escapedProfileId = escapeSQL(profileId);
      const rows = await query<
        CertificationRow & { obtained_at: string | null; expires_at: string | null }
      >(`
        SELECT c.*, pc.obtained_at, pc.expires_at
        FROM certifications c
        JOIN profile_certifications pc ON c.id = pc.certification_id
        WHERE pc.profile_id = ${escapedProfileId}
      `);

      return new Response(
        JSON.stringify(
          rows.map((row) => ({
            ...rowToCertification(row),
            obtainedAt: row.obtained_at,
            expiresAt: row.expires_at,
          }))
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // List all certifications with optional filters
    let sql = `SELECT * FROM certifications WHERE 1=1`;
    if (country) {
      sql += ` AND country = ${escapeSQL(country)}`;
    }
    if (category) {
      sql += ` AND category = ${escapeSQL(category)}`;
    }
    sql += ` ORDER BY country, category, name`;

    const rows = await query<CertificationRow>(sql);
    return new Response(JSON.stringify(rows.map(rowToCertification)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Certifications] GET error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * POST: Add certification to profile
 */
export async function POST(event: APIEvent) {
  try {
    await ensureCertificationsSchema();
    await ensureSeedData();

    const body = await event.request.json();
    const { profileId, certificationCode, obtainedAt, expiresAt } = body;

    if (!profileId || !certificationCode) {
      return new Response(
        JSON.stringify({ error: true, message: 'profileId and certificationCode required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get certification by code
    const cert = await query<{ id: string }>(
      `SELECT id FROM certifications WHERE code = ${escapeSQL(certificationCode)}`
    );

    if (cert.length === 0) {
      return new Response(
        JSON.stringify({ error: true, message: `Certification "${certificationCode}" not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const certificationId = cert[0].id;
    const id = uuidv4();

    // Check if already exists
    const existing = await query<{ id: string }>(`
      SELECT id FROM profile_certifications
      WHERE profile_id = ${escapeSQL(profileId)}
      AND certification_id = ${escapeSQL(certificationId)}
    `);

    if (existing.length > 0) {
      // Update existing
      await execute(`
        UPDATE profile_certifications
        SET obtained_at = ${obtainedAt ? escapeSQL(obtainedAt) : 'NULL'},
            expires_at = ${expiresAt ? escapeSQL(expiresAt) : 'NULL'}
        WHERE id = ${escapeSQL(existing[0].id)}
      `);
      return new Response(JSON.stringify({ success: true, id: existing[0].id, updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Insert new
    await execute(`
      INSERT INTO profile_certifications (id, profile_id, certification_id, obtained_at, expires_at)
      VALUES (
        ${escapeSQL(id)},
        ${escapeSQL(profileId)},
        ${escapeSQL(certificationId)},
        ${obtainedAt ? escapeSQL(obtainedAt) : 'NULL'},
        ${expiresAt ? escapeSQL(expiresAt) : 'NULL'}
      )
    `);

    return new Response(JSON.stringify({ success: true, id, created: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Certifications] POST error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * DELETE: Remove certification from profile
 */
export async function DELETE(event: APIEvent) {
  try {
    await ensureCertificationsSchema();

    const url = new URL(event.request.url);
    const profileId = url.searchParams.get('profileId');
    const certificationCode = url.searchParams.get('code');

    if (!profileId || !certificationCode) {
      return new Response(JSON.stringify({ error: true, message: 'profileId and code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get certification by code
    const cert = await query<{ id: string }>(
      `SELECT id FROM certifications WHERE code = ${escapeSQL(certificationCode)}`
    );

    if (cert.length === 0) {
      return new Response(JSON.stringify({ error: true, message: 'Certification not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await execute(`
      DELETE FROM profile_certifications
      WHERE profile_id = ${escapeSQL(profileId)}
      AND certification_id = ${escapeSQL(cert[0].id)}
    `);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Certifications] DELETE error:', error);
    return new Response(
      JSON.stringify({
        error: true,
        message: error instanceof Error ? error.message : 'Database error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Certification patterns for auto-detection in user messages
 */
export const CERTIFICATION_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  // France
  { pattern: /\bBAFA\b/i, code: 'BAFA' },
  { pattern: /\bBNSSA\b/i, code: 'BNSSA' },
  { pattern: /\bPSC1\b/i, code: 'PSC1' },
  { pattern: /\bSST\b/i, code: 'SST' },
  // UK
  { pattern: /\bDBS\b(?:\s+check)?/i, code: 'DBS' },
  { pattern: /\b(?:paediatric|pediatric)\s+first\s+aid\b/i, code: 'PFA' },
  { pattern: /\bNPLQ\b/i, code: 'NPLQ' },
  // US
  { pattern: /\bCPR\b(?:\s*\/?\s*first\s*aid)?/i, code: 'CPR_AHA' },
  { pattern: /\blifeguard(?:\s+cert(?:ified|ification)?)?/i, code: 'LIFEGUARD_RC' },
  { pattern: /\bfood\s+handler\b/i, code: 'FOOD_HANDLER' },
  // International
  { pattern: /\bPADI\s+(?:open\s+water|OW)\b/i, code: 'PADI_OW' },
  { pattern: /\bPADI\s+(?:divemaster|DM)\b/i, code: 'PADI_DM' },
  { pattern: /\bPADI\b/i, code: 'PADI_OW' }, // Generic PADI defaults to OW
  { pattern: /\bSSI\s+(?:open\s+water|OW)\b/i, code: 'SSI_OW' },
  { pattern: /\bTEFL\b|\bTESOL\b/i, code: 'TEFL' },
];

/**
 * Detect certifications mentioned in a message
 * @returns Array of certification codes detected
 */
export function detectCertificationsInMessage(message: string): string[] {
  const detected: string[] = [];
  for (const { pattern, code } of CERTIFICATION_PATTERNS) {
    if (pattern.test(message) && !detected.includes(code)) {
      detected.push(code);
    }
  }
  return detected;
}
