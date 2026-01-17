/* eslint-disable no-console */
/**
 * Centralized DuckDB Connection with Write Queue
 *
 * DuckDB doesn't support concurrent writes (WAL lock conflict).
 * This module provides:
 * - Single database instance (singleton) with EXCLUSIVE access
 * - Single persistent connection for all operations
 * - Write queue to serialize all write operations
 * - Retry logic for transient lock errors
 * - Process-level lock file to prevent multiple processes
 *
 * Note: Uses createRequire via nativeModule.ts because Vite SSR
 * doesn't support direct ESM imports of native Node.js modules.
 */

import { duckdb } from '../../lib/nativeModule';
import type { DuckDBDatabase, DuckDBConnection } from '../../types/duckdb';
import * as fs from 'fs';
import * as path from 'path';

// Resolve absolute path ONCE at module load
const DB_DIR = process.env.DUCKDB_DIR || path.resolve(process.cwd(), 'data');
const DB_PATH = process.env.DUCKDB_PATH || path.join(DB_DIR, 'stride.duckdb');
const LOCK_PATH = `${DB_PATH}.app.lock`;

// Database and connection singletons
let db: DuckDBDatabase | null = null;
let conn: DuckDBConnection | null = null;
let initialized = false;

// Write queue - serializes all write operations
let writeQueue: Promise<void> = Promise.resolve();

// Process ID for lock file
const PROCESS_ID = process.pid;

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
 * Check if another process holds the lock
 * Returns true if we can acquire the lock, false if blocked
 */
function checkAndAcquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const lockContent = fs.readFileSync(LOCK_PATH, 'utf-8');
      const lockedPid = parseInt(lockContent, 10);

      // Check if the process is still running
      if (lockedPid && lockedPid !== PROCESS_ID) {
        try {
          // Signal 0 checks if process exists without killing it
          process.kill(lockedPid, 0);
          // Process exists, we're blocked
          console.warn(`[DuckDB] Database locked by PID ${lockedPid}`);
          return false;
        } catch {
          // Process doesn't exist, stale lock - we can take over
          console.log(`[DuckDB] Removing stale lock from PID ${lockedPid}`);
        }
      }
    }

    // Acquire the lock
    fs.writeFileSync(LOCK_PATH, String(PROCESS_ID));
    console.log(`[DuckDB] Lock acquired by PID ${PROCESS_ID}`);
    return true;
  } catch (error) {
    console.error('[DuckDB] Lock check error:', error);
    return true; // Proceed anyway in case of error
  }
}

/**
 * Release the lock file
 */
function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      const lockContent = fs.readFileSync(LOCK_PATH, 'utf-8');
      if (parseInt(lockContent, 10) === PROCESS_ID) {
        fs.unlinkSync(LOCK_PATH);
        console.log(`[DuckDB] Lock released by PID ${PROCESS_ID}`);
      }
    }
  } catch (error) {
    console.error('[DuckDB] Lock release error:', error);
  }
}

/**
 * Get or create database instance and connection
 * Uses EXCLUSIVE access mode to prevent concurrent access
 */
function getConnection(): DuckDBConnection {
  if (!db) {
    ensureDataDir();

    // Check application-level lock
    if (!checkAndAcquireLock()) {
      throw new Error('Database is locked by another process');
    }

    // Open database - DuckDB node bindings use single argument
    // The app-level lock file handles cross-process coordination
    db = new duckdb.Database(DB_PATH);
    console.log(`[DuckDB] Opened database: ${DB_PATH} (PID: ${PROCESS_ID})`);

    // Register cleanup on process exit
    process.on('exit', () => releaseLock());
    process.on('SIGINT', () => {
      releaseLock();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      releaseLock();
      process.exit(0);
    });
  }
  if (!conn) {
    conn = db.connect();
    initialized = true;
    console.log(`[DuckDB] Connection established`);
  }
  return conn;
}

/**
 * Initialize the database connection
 * Safe to call multiple times - only initializes once
 */
export async function initDatabase(): Promise<void> {
  if (initialized && db && conn) return;
  getConnection();
}

/**
 * Execute a read query and return results
 * Reads can happen concurrently with the write queue
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  const connection = getConnection();

  return new Promise((resolve, reject) => {
    connection.all<T>(sql, (err: Error | null, result: T[]) => {
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
 * Execute a write statement without returning results
 * All writes are queued to prevent WAL lock conflicts
 */
export async function execute(sql: string): Promise<void> {
  // Queue this write operation
  const operation = writeQueue.then(() => executeWithRetry(sql));

  // Update the queue to include this operation
  writeQueue = operation.catch(() => {
    // Don't break the chain on errors
  });

  return operation;
}

/**
 * Execute with retry for transient lock errors
 */
async function executeWithRetry(sql: string, retries = 3, delay = 100): Promise<void> {
  const connection = getConnection();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        connection.exec(sql, (err: Error | null) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      return; // Success
    } catch (err) {
      const error = err as Error;
      const isLockError = error.message?.includes('lock') || error.message?.includes('Conflicting');

      if (isLockError && attempt < retries) {
        console.warn(`[DuckDB] Lock conflict, retry ${attempt}/${retries} in ${delay}ms`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else {
        console.error('[DuckDB] Execute error:', error.message);
        throw error;
      }
    }
  }
}

/**
 * Execute a query that returns results (for writes that need RETURNING)
 * Also queued to prevent WAL conflicts
 */
export async function queryWrite<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  // Queue this write operation
  const operation = writeQueue.then(() => queryWithRetry<T>(sql));

  // Update the queue
  writeQueue = operation.then(() => {}).catch(() => {});

  return operation;
}

/**
 * Query with retry for transient lock errors
 */
async function queryWithRetry<T>(sql: string, retries = 3, delay = 100): Promise<T[]> {
  const connection = getConnection();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise<T[]>((resolve, reject) => {
        connection.all<T>(sql, (err: Error | null, result: T[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    } catch (err) {
      const error = err as Error;
      const isLockError = error.message?.includes('lock') || error.message?.includes('Conflicting');

      if (isLockError && attempt < retries) {
        console.warn(`[DuckDB] Lock conflict on query, retry ${attempt}/${retries}`);
        await sleep(delay);
        delay *= 2;
      } else {
        console.error('[DuckDB] Query error:', error.message);
        throw error;
      }
    }
  }
  return []; // Should never reach here
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * Close the database connection (for cleanup)
 */
export async function closeDatabase(): Promise<void> {
  if (conn) {
    await new Promise<void>((resolve) => {
      conn!.close((err: Error | null) => {
        if (err) console.error('[DuckDB] Connection close error:', err.message);
        resolve();
      });
    });
    conn = null;
  }
  if (db) {
    await new Promise<void>((resolve) => {
      db!.close((err: Error | null) => {
        if (err) console.error('[DuckDB] Database close error:', err.message);
        resolve();
      });
    });
    db = null;
  }
  initialized = false;
  console.log('[DuckDB] Database closed');
}

// Export database path for external use
export const DATABASE_PATH = DB_PATH;
export const DATABASE_DIR = DB_DIR;
