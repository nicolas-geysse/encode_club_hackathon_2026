/* eslint-disable no-console */
/**
 * Centralized DuckDB Connection - Singleton Pattern
 *
 * Uses persistent connection with globalThis to survive Vite HMR.
 *
 * Key fixes:
 * 1. DuckDB Database constructor is async - must wait for callback
 * 2. Use synchronous guard to prevent race condition in concurrent init
 */

import { duckdb } from '../../lib/nativeModule';
import type { DuckDBDatabase, DuckDBConnection } from '../../types/duckdb';
import * as fs from 'fs';
import * as path from 'path';

// Database paths - resolve relative to project root
function getProjectRoot(): string {
  const cwd = process.cwd();
  if (cwd.includes('packages/frontend') || cwd.endsWith('frontend')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

const PROJECT_ROOT = getProjectRoot();
const DB_DIR = process.env.DUCKDB_DIR || path.join(PROJECT_ROOT, 'data');
const DB_PATH = process.env.DUCKDB_PATH
  ? path.resolve(PROJECT_ROOT, process.env.DUCKDB_PATH)
  : path.join(DB_DIR, 'stride.duckdb');

// Use globalThis with a unique key to persist across Vite HMR
const GLOBAL_KEY = '__stride_duckdb_v2__';

interface DuckDBState {
  db: DuckDBDatabase | null;
  conn: DuckDBConnection | null;
  writeQueue: Promise<void>;
  initialized: boolean;
  initPromise: Promise<void> | null;
  initializing: boolean; // Synchronous guard to prevent race conditions
}

function getGlobalState(): DuckDBState {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = {
      db: null,
      conn: null,
      writeQueue: Promise.resolve(),
      initialized: false,
      initPromise: null,
      initializing: false,
    };
    console.log('[DuckDB] Created new global state');
  }
  return g[GLOBAL_KEY] as DuckDBState;
}

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log(`[DuckDB] Created data directory: ${DB_DIR}`);
  }
}

/**
 * Open database with callback (required for DuckDB async init)
 */
function openDatabase(): Promise<DuckDBDatabase> {
  ensureDataDir();
  console.log(`[DuckDB] Opening database: ${DB_PATH}`);

  return new Promise((resolve, reject) => {
    const db = new (duckdb.Database as new (
      path: string,
      callback: (err: Error | null) => void
    ) => DuckDBDatabase)(DB_PATH, (err) => {
      if (err) {
        console.error('[DuckDB] Failed to open database:', err.message);
        reject(err);
      } else {
        console.log('[DuckDB] Database opened successfully');
        resolve(db);
      }
    });
  });
}

/**
 * Initialize database and create connection
 */
async function initializeDatabaseInternal(state: DuckDBState): Promise<void> {
  // Open database (waits for async init)
  const db = await openDatabase();
  state.db = db;

  // Now safe to connect
  const conn = db.connect();
  state.conn = conn;
  console.log('[DuckDB] Connection established');

  // Verify connection works
  await new Promise<void>((resolve, reject) => {
    conn.exec('SELECT 1 as test', (err) => {
      if (err) {
        console.error('[DuckDB] Connection verification failed:', err.message);
        state.conn = null;
        state.db = null;
        reject(err);
      } else {
        console.log('[DuckDB] Connection verified - ready for queries');
        state.initialized = true;
        resolve();
      }
    });
  });
}

/**
 * Initialize the database - ensures connection is ready
 * Uses synchronous guard + promise to handle concurrent calls safely
 */
export async function initDatabase(): Promise<void> {
  const state = getGlobalState();

  // Fast path: already initialized
  if (state.initialized && state.conn) {
    return;
  }

  // If init promise exists, wait for it
  if (state.initPromise) {
    return state.initPromise;
  }

  // Synchronous guard: if someone else is initializing, wait and retry
  if (state.initializing) {
    // Wait a tick and check again
    await new Promise((r) => setTimeout(r, 50));
    return initDatabase();
  }

  // Set synchronous guard IMMEDIATELY (before any await)
  state.initializing = true;

  // Create and store promise
  state.initPromise = initializeDatabaseInternal(state)
    .catch((err) => {
      // On error, reset state so retry is possible
      state.initialized = false;
      state.conn = null;
      state.db = null;
      throw err;
    })
    .finally(() => {
      state.initializing = false;
      // Keep initPromise around if successful, clear on error
      if (!state.initialized) {
        state.initPromise = null;
      }
    });

  return state.initPromise;
}

/**
 * Get connection - ensures initialized first
 */
async function getConnectionAsync(): Promise<DuckDBConnection> {
  await initDatabase();
  const state = getGlobalState();
  if (!state.conn) {
    throw new Error('Failed to establish database connection');
  }
  return state.conn;
}

/**
 * Execute a read query and return results
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const conn = await getConnectionAsync();
  return new Promise<T[]>((resolve, reject) => {
    conn.all<T>(sql, (err: Error | null, result: T[]) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

/**
 * Execute a write statement - queued to prevent WAL conflicts
 */
export async function execute(sql: string): Promise<void> {
  const state = getGlobalState();

  const operation = state.writeQueue.then(async () => {
    const conn = await getConnectionAsync();
    return new Promise<void>((resolve, reject) => {
      conn.exec(sql, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  // Update queue (don't break chain on errors)
  state.writeQueue = operation.catch(() => {});

  return operation;
}

/**
 * Execute a query that returns results (for writes with RETURNING)
 */
export async function queryWrite<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const state = getGlobalState();

  const operation = state.writeQueue.then(() => query<T>(sql));
  state.writeQueue = operation.then(() => {}).catch(() => {});

  return operation;
}

/**
 * Escape SQL string values
 */
export function escapeSQL(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  // Convert to string if not already
  const str = typeof value === 'string' ? value : String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Get database info
 */
export function getDatabaseInfo(): { path: string; dir: string; initialized: boolean } {
  const state = getGlobalState();
  return { path: DB_PATH, dir: DB_DIR, initialized: state.initialized };
}

/**
 * Close database (only for shutdown, not during normal ops)
 */
export async function closeDatabase(): Promise<void> {
  const state = getGlobalState();
  if (state.conn) {
    state.conn.close(() => {});
    state.conn = null;
  }
  if (state.db) {
    state.db.close(() => {});
    state.db = null;
  }
  state.initialized = false;
  state.initPromise = null;
  console.log('[DuckDB] Database closed');
}

export const DATABASE_PATH = DB_PATH;
export const DATABASE_DIR = DB_DIR;
