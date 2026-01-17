/**
 * Local types for DuckDB
 *
 * We define our own types instead of importing from 'duckdb' because:
 * 1. The duckdb package's type exports can conflict with Vite SSR
 * 2. We only need a subset of the API
 * 3. This avoids import resolution issues at build time
 */

/**
 * DuckDB Database instance
 */
export interface DuckDBDatabase {
  /**
   * Create a new connection to the database
   */
  connect(): DuckDBConnection;

  /**
   * Close the database
   */
  close(callback?: (err: Error | null) => void): void;
}

/**
 * DuckDB Connection for executing queries
 */
export interface DuckDBConnection {
  /**
   * Execute a query and return all results
   */
  all<T = Record<string, unknown>>(
    sql: string,
    callback: (err: Error | null, result: T[]) => void
  ): void;

  /**
   * Execute multiple statements (no results returned)
   */
  exec(sql: string, callback: (err: Error | null) => void): void;

  /**
   * Execute a single statement (no results returned)
   */
  run(sql: string, callback: (err: Error | null) => void): void;

  /**
   * Close the connection
   */
  close(callback?: (err: Error | null) => void): void;
}

/**
 * DuckDB module interface
 */
export interface DuckDBModule {
  /**
   * Database constructor
   */
  Database: new (path: string) => DuckDBDatabase;
}
