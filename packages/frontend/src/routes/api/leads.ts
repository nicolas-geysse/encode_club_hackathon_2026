/**
 * Leads API Endpoint
 *
 * Manages prospection leads (job opportunities saved by user).
 * CRUD operations for leads with DuckDB persistence.
 *
 * Pattern follows routes/api/skills.ts
 */

import type { APIEvent } from '@solidjs/start/server';
import { createLogger } from '~/lib/logger';
import {
  query,
  execute,
  escapeSQL,
  uuidv4,
  ensureSchema,
  successResponse,
  errorResponse,
  parseQueryParams,
  createMapper,
  transforms,
  type FieldMapping,
} from './_crud-helpers';

const logger = createLogger('leads-api');

// =============================================================================
// Types
// =============================================================================

interface LeadRow {
  [key: string]: string | number | null;
  id: string;
  profile_id: string;
  category: string;
  title: string;
  company: string | null;
  location_raw: string | null;
  lat: number | null;
  lng: number | null;
  commute_time_mins: number | null;
  salary_min: number | null;
  salary_max: number | null;
  effort_level: number | null;
  source: string | null;
  url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  profileId: string;
  category: string;
  title: string;
  company?: string;
  locationRaw?: string;
  lat?: number;
  lng?: number;
  commuteTimeMins?: number;
  salaryMin?: number;
  salaryMax?: number;
  effortLevel?: number;
  source?: string;
  url?: string;
  status: 'interested' | 'applied' | 'rejected' | 'archived';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// Schema
// =============================================================================

const LEADS_SCHEMA = `
  CREATE TABLE IF NOT EXISTS leads (
    id VARCHAR PRIMARY KEY,
    profile_id VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    company VARCHAR,
    location_raw VARCHAR,
    lat DOUBLE,
    lng DOUBLE,
    commute_time_mins INTEGER,
    salary_min DECIMAL(10,2),
    salary_max DECIMAL(10,2),
    effort_level INTEGER,
    source VARCHAR,
    url VARCHAR,
    status VARCHAR DEFAULT 'interested',
    notes VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`;

const schemaConfig = {
  flag: { initialized: false },
  sql: LEADS_SCHEMA,
  logger,
  tableName: 'leads',
};

async function ensureLeadsSchema(): Promise<void> {
  return ensureSchema(schemaConfig);
}

// =============================================================================
// Field Mapping
// =============================================================================

const leadMappings: FieldMapping<LeadRow, Lead>[] = [
  { dbField: 'id', entityField: 'id' },
  { dbField: 'profile_id', entityField: 'profileId' },
  { dbField: 'category', entityField: 'category' },
  { dbField: 'title', entityField: 'title' },
  { dbField: 'company', entityField: 'company', transform: transforms.nullToUndefined },
  { dbField: 'location_raw', entityField: 'locationRaw', transform: transforms.nullToUndefined },
  { dbField: 'lat', entityField: 'lat', transform: transforms.nullToUndefined },
  { dbField: 'lng', entityField: 'lng', transform: transforms.nullToUndefined },
  {
    dbField: 'commute_time_mins',
    entityField: 'commuteTimeMins',
    transform: transforms.nullToUndefined,
  },
  { dbField: 'salary_min', entityField: 'salaryMin', transform: transforms.nullToUndefined },
  { dbField: 'salary_max', entityField: 'salaryMax', transform: transforms.nullToUndefined },
  { dbField: 'effort_level', entityField: 'effortLevel', transform: transforms.nullToUndefined },
  { dbField: 'source', entityField: 'source', transform: transforms.nullToUndefined },
  { dbField: 'url', entityField: 'url', transform: transforms.nullToUndefined },
  { dbField: 'status', entityField: 'status', transform: transforms.toEnum('interested') },
  { dbField: 'notes', entityField: 'notes', transform: transforms.nullToUndefined },
  { dbField: 'created_at', entityField: 'createdAt' },
  { dbField: 'updated_at', entityField: 'updatedAt' },
];

const mapRowToLead = createMapper<LeadRow, Lead>(leadMappings);

// =============================================================================
// Handlers
// =============================================================================

export async function GET(event: APIEvent): Promise<Response> {
  try {
    await ensureLeadsSchema();

    const params = parseQueryParams(event);
    const id = params.get('id');
    const profileId = params.get('profileId');
    const category = params.get('category');
    const status = params.get('status');

    // Get by ID
    if (id) {
      const rows = await query<LeadRow>(`SELECT * FROM leads WHERE id = ${escapeSQL(id)}`);
      if (rows.length === 0) {
        return errorResponse('Lead not found', 404);
      }
      return successResponse(mapRowToLead(rows[0]));
    }

    // Get by profileId (required for list)
    if (!profileId) {
      return errorResponse('profileId is required', 400);
    }

    let sql = `SELECT * FROM leads WHERE profile_id = ${escapeSQL(profileId)}`;

    // Optional filters
    if (category) {
      sql += ` AND category = ${escapeSQL(category)}`;
    }
    if (status) {
      sql += ` AND status = ${escapeSQL(status)}`;
    }

    sql += ' ORDER BY created_at DESC';

    const rows = await query<LeadRow>(sql);
    const leads = rows.map(mapRowToLead);

    return successResponse(leads);
  } catch (error) {
    logger.error('GET error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error', 500);
  }
}

export async function POST(event: APIEvent): Promise<Response> {
  try {
    await ensureLeadsSchema();

    const body = await event.request.json();
    const {
      profileId,
      category,
      title,
      company,
      locationRaw,
      lat,
      lng,
      commuteTimeMins,
      salaryMin,
      salaryMax,
      effortLevel,
      source,
      url,
      notes,
    } = body;

    // Validation
    if (!profileId) {
      return errorResponse('profileId is required', 400);
    }
    if (!category) {
      return errorResponse('category is required', 400);
    }
    if (!title) {
      return errorResponse('title is required', 400);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    await execute(`
      INSERT INTO leads (
        id, profile_id, category, title, company, location_raw,
        lat, lng, commute_time_mins, salary_min, salary_max,
        effort_level, source, url, status, notes, created_at, updated_at
      ) VALUES (
        ${escapeSQL(id)},
        ${escapeSQL(profileId)},
        ${escapeSQL(category)},
        ${escapeSQL(title)},
        ${company ? escapeSQL(company) : 'NULL'},
        ${locationRaw ? escapeSQL(locationRaw) : 'NULL'},
        ${lat != null ? lat : 'NULL'},
        ${lng != null ? lng : 'NULL'},
        ${commuteTimeMins != null ? commuteTimeMins : 'NULL'},
        ${salaryMin != null ? salaryMin : 'NULL'},
        ${salaryMax != null ? salaryMax : 'NULL'},
        ${effortLevel != null ? effortLevel : 'NULL'},
        ${source ? escapeSQL(source) : 'NULL'},
        ${url ? escapeSQL(url) : 'NULL'},
        'interested',
        ${notes ? escapeSQL(notes) : 'NULL'},
        ${escapeSQL(now)},
        ${escapeSQL(now)}
      )
    `);

    // Fetch the created lead
    const rows = await query<LeadRow>(`SELECT * FROM leads WHERE id = ${escapeSQL(id)}`);
    const lead = mapRowToLead(rows[0]);

    logger.info('Lead created', { id, profileId, title, category });

    return successResponse(lead, 201);
  } catch (error) {
    logger.error('POST error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error', 500);
  }
}

export async function PUT(event: APIEvent): Promise<Response> {
  try {
    await ensureLeadsSchema();

    const body = await event.request.json();
    const { id, status, notes, commuteTimeMins } = body;

    if (!id) {
      return errorResponse('id is required', 400);
    }

    // Check if lead exists
    const existing = await query<LeadRow>(`SELECT id FROM leads WHERE id = ${escapeSQL(id)}`);
    if (existing.length === 0) {
      return errorResponse('Lead not found', 404);
    }

    // Build update fields
    const updates: string[] = [];
    if (status !== undefined) {
      updates.push(`status = ${escapeSQL(status)}`);
    }
    if (notes !== undefined) {
      updates.push(`notes = ${notes ? escapeSQL(notes) : 'NULL'}`);
    }
    if (commuteTimeMins !== undefined) {
      updates.push(`commute_time_mins = ${commuteTimeMins != null ? commuteTimeMins : 'NULL'}`);
    }

    if (updates.length === 0) {
      return errorResponse('No fields to update', 400);
    }

    updates.push(`updated_at = ${escapeSQL(new Date().toISOString())}`);

    await execute(`UPDATE leads SET ${updates.join(', ')} WHERE id = ${escapeSQL(id)}`);

    // Fetch updated lead
    const rows = await query<LeadRow>(`SELECT * FROM leads WHERE id = ${escapeSQL(id)}`);
    const lead = mapRowToLead(rows[0]);

    logger.info('Lead updated', { id, status });

    return successResponse(lead);
  } catch (error) {
    logger.error('PUT error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error', 500);
  }
}

export async function DELETE(event: APIEvent): Promise<Response> {
  try {
    await ensureLeadsSchema();

    const params = parseQueryParams(event);
    const id = params.get('id');
    const profileId = params.get('profileId');

    // Bulk delete by profileId
    if (profileId && !id) {
      const countResult = await query<{ count: bigint }>(
        `SELECT COUNT(*) as count FROM leads WHERE profile_id = ${escapeSQL(profileId)}`
      );
      const count = Number(countResult[0]?.count || 0);

      await execute(`DELETE FROM leads WHERE profile_id = ${escapeSQL(profileId)}`);

      logger.info('Bulk deleted leads', { profileId, count });

      return successResponse({ success: true, deletedCount: count });
    }

    // Single delete by id
    if (!id) {
      return errorResponse('id or profileId is required', 400);
    }

    const existing = await query<LeadRow>(`SELECT title FROM leads WHERE id = ${escapeSQL(id)}`);
    if (existing.length === 0) {
      return errorResponse('Lead not found', 404);
    }

    await execute(`DELETE FROM leads WHERE id = ${escapeSQL(id)}`);

    logger.info('Lead deleted', { id, title: existing[0].title });

    return successResponse({ success: true, deleted: existing[0].title });
  } catch (error) {
    logger.error('DELETE error', { error });
    return errorResponse(error instanceof Error ? error.message : 'Database error', 500);
  }
}
