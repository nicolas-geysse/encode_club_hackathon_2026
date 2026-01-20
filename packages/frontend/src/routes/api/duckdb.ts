/**
 * DuckDB REST API Wrapper
 *
 * Exposes DuckDB query capabilities via REST API.
 * Useful for external tools that can't use MCP protocol directly.
 *
 * Security:
 * - Read-only queries only (SELECT)
 * - Whitelisted table access
 * - Rate limiting recommended for production
 *
 * @see sprint-10-5.md Phase 5
 */

import type { APIEvent } from '@solidjs/start/server';
import { query } from './_db';
import { createLogger } from '../../lib/logger';

const logger = createLogger('DuckDB-API');

/**
 * Allowed tables for external queries
 * Add tables here to expose them via the API
 */
const ALLOWED_TABLES = [
  'profiles',
  'goals',
  'goal_components',
  'trades',
  'energy_history',
  'simulation_state',
];

/**
 * Maximum rows to return per query
 */
const MAX_ROWS = 100;

/**
 * Validate that query is read-only SELECT
 */
function isReadOnlyQuery(sql: string): boolean {
  const normalized = sql.trim().toUpperCase();

  // Must start with SELECT
  if (!normalized.startsWith('SELECT')) {
    return false;
  }

  // Block dangerous keywords
  const dangerousKeywords = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'TRUNCATE',
    'REPLACE',
    'MERGE',
    'CALL',
    'EXEC',
    'EXECUTE',
  ];

  for (const keyword of dangerousKeywords) {
    if (normalized.includes(keyword)) {
      return false;
    }
  }

  return true;
}

/**
 * Check if query only accesses allowed tables
 */
function accessesOnlyAllowedTables(sql: string): { valid: boolean; invalidTables: string[] } {
  const normalized = sql.toLowerCase();
  const invalidTables: string[] = [];

  // Extract table names from FROM and JOIN clauses (simplified regex)
  const tableMatches = normalized.match(/(?:from|join)\s+(\w+)/gi) || [];

  for (const match of tableMatches) {
    const tableName = match.replace(/(?:from|join)\s+/i, '').trim();
    if (!ALLOWED_TABLES.includes(tableName)) {
      invalidTables.push(tableName);
    }
  }

  return {
    valid: invalidTables.length === 0,
    invalidTables,
  };
}

/**
 * POST /api/duckdb
 * Execute a read-only DuckDB query
 */
export async function POST({ request }: APIEvent) {
  try {
    const body = await request.json();
    const { sql, limit = 50 } = body as { sql: string; limit?: number };

    if (!sql) {
      return new Response(JSON.stringify({ error: 'sql is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Security checks
    if (!isReadOnlyQuery(sql)) {
      logger.warn('Blocked non-SELECT query', { sql: sql.slice(0, 100) });
      return new Response(JSON.stringify({ error: 'Only SELECT queries are allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const tableCheck = accessesOnlyAllowedTables(sql);
    if (!tableCheck.valid) {
      logger.warn('Blocked query with disallowed tables', { tables: tableCheck.invalidTables });
      return new Response(
        JSON.stringify({
          error: 'Query accesses disallowed tables',
          invalidTables: tableCheck.invalidTables,
          allowedTables: ALLOWED_TABLES,
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Apply row limit
    const effectiveLimit = Math.min(limit, MAX_ROWS);
    const limitedSql = sql.toLowerCase().includes('limit') ? sql : `${sql} LIMIT ${effectiveLimit}`;

    logger.debug('Executing query', { sql: limitedSql.slice(0, 100) });

    // Execute query
    const rows = await query<Record<string, unknown>>(limitedSql);

    return new Response(
      JSON.stringify({
        success: true,
        rows,
        count: rows.length,
        limitApplied: effectiveLimit,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('Query execution failed', { error });
    return new Response(
      JSON.stringify({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/duckdb
 * Get database schema information
 */
export async function GET({ request }: APIEvent) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'tables';

    switch (action) {
      case 'tables': {
        // List allowed tables with their schemas
        const tableInfo = await Promise.all(
          ALLOWED_TABLES.map(async (table) => {
            try {
              const columns = await query<{ column_name: string; data_type: string }>(
                `SELECT column_name, data_type
                 FROM information_schema.columns
                 WHERE table_name = '${table}'
                 ORDER BY ordinal_position`
              );
              return {
                name: table,
                columns: columns.map((c) => ({
                  name: c.column_name,
                  type: c.data_type,
                })),
                available: true,
              };
            } catch {
              return {
                name: table,
                columns: [],
                available: false,
              };
            }
          })
        );

        return new Response(
          JSON.stringify({
            tables: tableInfo,
            count: tableInfo.length,
            maxRows: MAX_ROWS,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'describe': {
        const table = url.searchParams.get('table');
        if (!table || !ALLOWED_TABLES.includes(table)) {
          return new Response(
            JSON.stringify({
              error: 'Invalid or disallowed table',
              allowedTables: ALLOWED_TABLES,
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const columns = await query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = '${table}'
           ORDER BY ordinal_position`
        );

        // Get row count
        const countResult = await query<{ count: bigint }>(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        const rowCount = Number(countResult[0]?.count || 0);

        return new Response(
          JSON.stringify({
            table,
            columns,
            rowCount,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      case 'health': {
        // Check DuckDB connection
        try {
          await query('SELECT 1 as test');
          return new Response(JSON.stringify({ healthy: true, allowedTables: ALLOWED_TABLES }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              healthy: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }

      default:
        return new Response(
          JSON.stringify({
            error: 'Unknown action',
            availableActions: ['tables', 'describe', 'health'],
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    logger.error('DuckDB API error', { error });
    return new Response(
      JSON.stringify({
        error: 'DuckDB API failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
