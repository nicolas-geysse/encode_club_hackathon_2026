/**
 * CRUD Helpers
 *
 * Shared utilities for API route handlers to reduce code duplication.
 * Provides common patterns for responses, schema initialization, and CRUD operations.
 */

import type { APIEvent } from '@solidjs/start/server';
import { v4 as uuidv4 } from 'uuid';
import { query, execute, executeSchema, escapeSQL } from './_db';

// Logger type from createLogger return type
type Logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
};

// Re-export database functions for convenience
export { query, execute, executeSchema, escapeSQL };
export { uuidv4 };

// ============================================================================
// Response Helpers
// ============================================================================

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const NO_CACHE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

/**
 * Create a success JSON response
 */
export function successResponse<T>(data: T, status = 200, noCache = false): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: noCache ? NO_CACHE_HEADERS : JSON_HEADERS,
  });
}

/**
 * Create an error JSON response
 */
export function errorResponse(message: string, status = 500, noCache = false): Response {
  return new Response(JSON.stringify({ error: true, message }), {
    status,
    headers: noCache ? NO_CACHE_HEADERS : JSON_HEADERS,
  });
}

// ============================================================================
// Schema Initialization
// ============================================================================

interface SchemaConfig {
  flag: { initialized: boolean };
  sql: string;
  migrations?: string[];
  logger: Logger;
  tableName: string;
}

/**
 * Ensure schema is initialized (create table if not exists + run migrations)
 */
export async function ensureSchema(config: SchemaConfig): Promise<void> {
  if (config.flag.initialized) return;

  try {
    await executeSchema(config.sql);

    // Run migrations if any
    if (config.migrations) {
      for (const migration of config.migrations) {
        try {
          await execute(migration);
        } catch {
          // Migration might fail if column already exists, ignore
        }
      }
    }

    config.flag.initialized = true;
    config.logger.info('Schema initialized');
  } catch (error) {
    config.logger.debug('Schema init note', { error });
    config.flag.initialized = true;
  }
}

// ============================================================================
// Field Mapping Helpers
// ============================================================================

/**
 * Field mapping configuration: DB column name -> Entity property name + optional transform
 */
export interface FieldMapping<R, E> {
  /** DB column name (snake_case) */
  dbField: keyof R;
  /** Entity property name (camelCase) */
  entityField: keyof E;
  /** Optional transform function */
  transform?: (value: unknown) => unknown;
}

/**
 * Create a mapper function from a row to an entity
 * Handles snake_case to camelCase conversion and optional transforms
 */
export function createMapper<R extends Record<string, unknown>, E>(
  mappings: FieldMapping<R, E>[]
): (row: R) => E {
  return (row: R): E => {
    const result = {} as E;
    for (const mapping of mappings) {
      const value = row[mapping.dbField as string];
      if (mapping.transform) {
        (result as Record<string, unknown>)[mapping.entityField as string] =
          mapping.transform(value);
      } else {
        (result as Record<string, unknown>)[mapping.entityField as string] = value;
      }
    }
    return result;
  };
}

/**
 * Common transforms for field mapping
 */
export const transforms = {
  /** Convert null/undefined to undefined */
  nullToUndefined: (v: unknown) => v ?? undefined,

  /** Parse JSON string or return undefined */
  parseJson: (v: unknown) => {
    if (!v) return undefined;
    if (typeof v === 'string') {
      try {
        return JSON.parse(v);
      } catch {
        return undefined;
      }
    }
    return v;
  },

  /** Convert to boolean with default false */
  toBoolean: (v: unknown) => Boolean(v),

  /** Convert to number with default 0 */
  toNumber: (v: unknown) => Number(v) || 0,

  /** Convert BigInt to Number (DuckDB returns BigInt for COUNT) */
  bigIntToNumber: (v: unknown) => Number(v ?? 0),

  /** Convert to enum with fallback */
  toEnum:
    <T extends string>(fallback: T) =>
    (v: unknown): T =>
      (v as T) || fallback,
};

// ============================================================================
// CRUD Operation Helpers
// ============================================================================

interface GetByIdOptions<R, E> {
  table: string;
  idColumn?: string;
  mapper: (row: R) => E;
  logger: Logger;
  notFoundMessage?: string;
}

/**
 * GET by ID - fetch a single row by its ID
 */
export async function handleGetById<R, E>(
  id: string,
  options: GetByIdOptions<R, E>
): Promise<{ data: E | null; response?: Response }> {
  const { table, idColumn = 'id', mapper, notFoundMessage = 'Not found' } = options;

  const escapedId = escapeSQL(id);
  const rows = await query<R>(`SELECT * FROM ${table} WHERE ${idColumn} = ${escapedId}`);

  if (rows.length === 0) {
    return { data: null, response: errorResponse(notFoundMessage, 404) };
  }

  return { data: mapper(rows[0]) };
}

interface GetByProfileIdOptions<R, E> {
  table: string;
  profileIdColumn?: string;
  mapper: (row: R) => E;
  logger: Logger;
  orderBy?: string;
  additionalWhere?: string;
}

/**
 * GET by profile ID - fetch all rows for a profile
 */
export async function handleGetByProfileId<R, E>(
  profileId: string,
  options: GetByProfileIdOptions<R, E>
): Promise<E[]> {
  const {
    table,
    profileIdColumn = 'profile_id',
    mapper,
    orderBy = 'created_at DESC',
    additionalWhere = '',
  } = options;

  const escapedProfileId = escapeSQL(profileId);
  let sql = `SELECT * FROM ${table} WHERE ${profileIdColumn} = ${escapedProfileId}`;
  if (additionalWhere) {
    sql += ` AND ${additionalWhere}`;
  }
  sql += ` ORDER BY ${orderBy}`;

  const rows = await query<R>(sql);
  return rows.map(mapper);
}

interface CheckExistsOptions {
  table: string;
  idColumn?: string;
}

/**
 * Check if a record exists by ID
 */
export async function checkExists(id: string, options: CheckExistsOptions): Promise<boolean> {
  const { table, idColumn = 'id' } = options;
  const escapedId = escapeSQL(id);
  const rows = await query<{ id: string }>(
    `SELECT ${idColumn} FROM ${table} WHERE ${idColumn} = ${escapedId}`
  );
  return rows.length > 0;
}

interface CheckDuplicateOptions {
  table: string;
  profileIdColumn?: string;
  nameColumn?: string;
  caseSensitive?: boolean;
}

/**
 * Check for duplicate by profile_id + name (common deduplication pattern)
 */
export async function checkDuplicate<R>(
  profileId: string,
  name: string,
  options: CheckDuplicateOptions
): Promise<R | null> {
  const {
    table,
    profileIdColumn = 'profile_id',
    nameColumn = 'name',
    caseSensitive = true,
  } = options;

  const escapedProfileId = escapeSQL(profileId);
  const escapedName = caseSensitive ? escapeSQL(name) : escapeSQL(name.toLowerCase());
  const nameCheck = caseSensitive
    ? `${nameColumn} = ${escapedName}`
    : `LOWER(${nameColumn}) = ${escapedName}`;

  const rows = await query<R>(
    `SELECT * FROM ${table} WHERE ${profileIdColumn} = ${escapedProfileId} AND ${nameCheck}`
  );

  return rows.length > 0 ? rows[0] : null;
}

interface BuildUpdateFieldsOptions {
  updates: Record<string, unknown>;
  fieldMappings: Array<{
    entityField: string;
    dbField: string;
    isNumeric?: boolean;
    isJson?: boolean;
    isBoolean?: boolean;
    nullable?: boolean;
  }>;
}

/**
 * Build SQL UPDATE field assignments from partial updates
 */
export function buildUpdateFields(options: BuildUpdateFieldsOptions): string[] {
  const { updates, fieldMappings } = options;
  const fields: string[] = [];

  for (const mapping of fieldMappings) {
    const value = updates[mapping.entityField];
    if (value === undefined) continue;

    if (mapping.isNumeric) {
      fields.push(`${mapping.dbField} = ${value ?? 'NULL'}`);
    } else if (mapping.isJson) {
      fields.push(`${mapping.dbField} = ${value ? escapeSQL(JSON.stringify(value)) : 'NULL'}`);
    } else if (mapping.isBoolean) {
      fields.push(`${mapping.dbField} = ${value ? 'TRUE' : 'FALSE'}`);
    } else if (mapping.nullable && value === null) {
      fields.push(`${mapping.dbField} = NULL`);
    } else {
      fields.push(`${mapping.dbField} = ${value ? escapeSQL(String(value)) : 'NULL'}`);
    }
  }

  return fields;
}

interface DeleteOptions {
  table: string;
  idColumn?: string;
  nameColumn?: string;
  notFoundMessage?: string;
}

/**
 * DELETE by ID - delete a single row and return the deleted name
 */
export async function handleDeleteById(
  id: string,
  options: DeleteOptions
): Promise<{ success: boolean; deletedName?: string; response?: Response }> {
  const { table, idColumn = 'id', nameColumn = 'name', notFoundMessage = 'Not found' } = options;

  const escapedId = escapeSQL(id);

  // Get name before deletion
  const item = await query<Record<string, unknown>>(
    `SELECT ${nameColumn} FROM ${table} WHERE ${idColumn} = ${escapedId}`
  );
  if (item.length === 0) {
    return { success: false, response: errorResponse(notFoundMessage, 404) };
  }

  await execute(`DELETE FROM ${table} WHERE ${idColumn} = ${escapedId}`);

  const deletedName = String(item[0][nameColumn]);
  return { success: true, deletedName };
}

interface BulkDeleteOptions {
  table: string;
  profileIdColumn?: string;
  logger: Logger;
}

/**
 * DELETE by profile ID - bulk delete all rows for a profile
 */
export async function handleBulkDeleteByProfileId(
  profileId: string,
  options: BulkDeleteOptions
): Promise<{ count: number }> {
  const { table, profileIdColumn = 'profile_id', logger } = options;

  const escapedProfileId = escapeSQL(profileId);

  // Get count before deletion
  const countResult = await query<{ count: bigint }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${profileIdColumn} = ${escapedProfileId}`
  );
  const count = Number(countResult[0]?.count || 0);

  await execute(`DELETE FROM ${table} WHERE ${profileIdColumn} = ${escapedProfileId}`);

  logger.info('Bulk deleted items for profile', { count, profileId });
  return { count };
}

// ============================================================================
// Request Parsing Helpers
// ============================================================================

/**
 * Parse query parameters from an API event
 */
export function parseQueryParams(event: APIEvent): URLSearchParams {
  const url = new URL(event.request.url);
  return url.searchParams;
}

/**
 * Get a required query parameter or return an error response
 */
export function getRequiredParam(
  params: URLSearchParams,
  name: string,
  errorMsg?: string
): { value: string } | { response: Response } {
  const value = params.get(name);
  if (!value) {
    return { response: errorResponse(errorMsg || `${name} is required`, 400) };
  }
  return { value };
}

/**
 * Parse JSON body from an API event with error handling
 */
export async function parseBody<T>(event: APIEvent): Promise<T> {
  return event.request.json();
}

// ============================================================================
// Deduplication Helpers
// ============================================================================

interface DedupDeleteOptions {
  table: string;
  profileIdColumn?: string;
  nameColumn?: string;
  orderColumn?: string;
  logger: Logger;
}

/**
 * Delete duplicate rows keeping the oldest one for each name
 */
export async function handleDeduplication(
  profileId: string,
  options: DedupDeleteOptions
): Promise<{ remaining: number }> {
  const {
    table,
    profileIdColumn = 'profile_id',
    nameColumn = 'name',
    orderColumn = 'created_at',
    logger,
  } = options;

  const escapedProfileId = escapeSQL(profileId);

  const duplicatesQuery = `
    DELETE FROM ${table}
    WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY ${profileIdColumn}, ${nameColumn} ORDER BY ${orderColumn} ASC) as rn
        FROM ${table}
        WHERE ${profileIdColumn} = ${escapedProfileId}
      ) sub
      WHERE rn > 1
    )
  `;
  await execute(duplicatesQuery);

  // Count remaining items
  const remainingResult = await query<{ count: bigint }>(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${profileIdColumn} = ${escapedProfileId}`
  );
  const remaining = Number(remainingResult[0]?.count || 0);

  logger.info('Deduplicated items', { profileId, remaining, table });
  return { remaining };
}

// ============================================================================
// CRUD Handler Factory
// ============================================================================

export interface CrudConfig<Row, Entity> {
  table: string;
  entityName: string;
  mapper: (row: Row) => Entity;
  logger: Logger;
  ensureSchema: () => Promise<void>;
  idColumn?: string;
  profileIdColumn?: string;
  nameColumn?: string;
  orderBy?: string;
  noCache?: boolean;
}

/**
 * Create standard GET handler for a CRUD resource
 */
export function createGetHandler<Row, Entity>(config: CrudConfig<Row, Entity>) {
  const {
    table,
    entityName,
    mapper,
    logger,
    ensureSchema,
    idColumn = 'id',
    profileIdColumn = 'profile_id',
    orderBy = 'created_at DESC',
    noCache = false,
  } = config;

  return async (event: APIEvent): Promise<Response> => {
    try {
      await ensureSchema();

      const params = parseQueryParams(event);
      const itemId = params.get('id');
      const profileId = params.get('profileId');

      // Get by ID
      if (itemId) {
        const result = await handleGetById<Row, Entity>(itemId, {
          table,
          idColumn,
          mapper,
          logger,
          notFoundMessage: `${entityName} not found`,
        });

        if (result.response) return result.response;
        return successResponse(result.data, 200, noCache);
      }

      // Get by profile ID
      if (profileId) {
        const items = await handleGetByProfileId<Row, Entity>(profileId, {
          table,
          profileIdColumn,
          mapper,
          logger,
          orderBy,
        });
        return successResponse(items, 200, noCache);
      }

      return errorResponse('profileId is required', 400, noCache);
    } catch (error) {
      logger.error('GET error', { error });
      return errorResponse(error instanceof Error ? error.message : 'Database error', 500, noCache);
    }
  };
}

/**
 * Create standard DELETE handler for a CRUD resource
 */
export function createDeleteHandler<Row, Entity>(config: CrudConfig<Row, Entity>) {
  const {
    table,
    entityName,
    logger,
    ensureSchema,
    idColumn = 'id',
    profileIdColumn = 'profile_id',
    nameColumn = 'name',
    noCache = false,
  } = config;

  return async (event: APIEvent): Promise<Response> => {
    try {
      await ensureSchema();

      const params = parseQueryParams(event);
      const itemId = params.get('id');
      const profileId = params.get('profileId');

      // Bulk delete by profileId
      if (profileId && !itemId) {
        const { count } = await handleBulkDeleteByProfileId(profileId, {
          table,
          profileIdColumn,
          logger,
        });
        return successResponse({ success: true, deletedCount: count }, 200, noCache);
      }

      // Single delete by id
      if (!itemId) {
        return errorResponse('id or profileId is required', 400, noCache);
      }

      const result = await handleDeleteById(itemId, {
        table,
        idColumn,
        nameColumn,
        notFoundMessage: `${entityName} not found`,
      });

      if (result.response) return result.response;
      return successResponse({ success: true, deleted: result.deletedName }, 200, noCache);
    } catch (error) {
      logger.error('DELETE error', { error });
      return errorResponse(error instanceof Error ? error.message : 'Database error', 500, noCache);
    }
  };
}
