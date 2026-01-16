/* eslint-disable no-console */
/**
 * Centralized DuckDB Connection
 *
 * Provides a single source of truth for database connection with:
 * - Absolute path resolution (fixes relative path issues)
 * - Automatic directory creation
 * - Connection pooling (single connection reused)
 * - Proper error handling
 *
 * Note: Uses createRequire via nativeModule.ts because Vite SSR
 * doesn't support direct ESM imports of native Node.js modules.
 * See: packages/frontend/src/lib/nativeModule.ts for details.
 */

import { duckdb } from '../../lib/nativeModule';
import type { DuckDBDatabase, DuckDBConnection } from '../../types/duckdb';
import * as fs from 'fs';
import * as path from 'path';

// Resolve absolute path ONCE at module load
const DB_DIR = process.env.DUCKDB_DIR || path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DUCKDB_PATH || path.join(DB_DIR, 'stride.duckdb');

// Database connection singleton
let db: DuckDBDatabase | null = null;
let connection: DuckDBConnection | null = null;
let initialized = false;

/**
 * Initialize the database connection
 * Safe to call multiple times - only initializes once
 */
export async function initDatabase(): Promise<void> {
  if (initialized && connection) return;

  try {
    // Create directory if it doesn't exist
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`[DuckDB] Created data directory: ${DB_DIR}`);
    }

    // Create database connection
    db = new duckdb.Database(DB_PATH);
    connection = db.connect();
    initialized = true;

    console.log(`[DuckDB] Connected to: ${DB_PATH}`);
  } catch (error) {
    console.error('[DuckDB] Initialization failed:', error);
    throw error;
  }
}

/**
 * Get the database connection
 * Throws if database not initialized
 */
export function getConnection(): DuckDBConnection {
  if (!connection) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return connection;
}

/**
 * Execute a query and return results
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await initDatabase();
  const conn = getConnection();

  return new Promise((resolve, reject) => {
    conn.all<T>(sql, (err: Error | null, result: T[]) => {
      if (err) {
        console.error('[DuckDB] Query error:', err.message);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Execute a statement without returning results
 */
export async function execute(sql: string): Promise<void> {
  await initDatabase();
  const conn = getConnection();

  return new Promise((resolve, reject) => {
    conn.exec(sql, (err: Error | null) => {
      if (err) {
        console.error('[DuckDB] Execute error:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Escape SQL string values to prevent injection
 */
export function escapeSQL(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Get database info for debugging
 */
export function getDatabaseInfo(): { path: string; dir: string; initialized: boolean } {
  return {
    path: DB_PATH,
    dir: DB_DIR,
    initialized,
  };
}

// Export database path for external use
export const DATABASE_PATH = DB_PATH;
export const DATABASE_DIR = DB_DIR;
