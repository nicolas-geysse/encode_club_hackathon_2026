/**
 * DuckDB Service
 *
 * Handles database connection, persistence, and graph queries
 */

import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as path from 'path';

// Database instance
let db: duckdb.Database | null = null;
let connection: duckdb.Connection | null = null;

// Database file path (persisted in user's home directory)
const DB_PATH = process.env.STUDENT_NAV_DB_PATH ||
  path.join(process.env.HOME || '.', '.student-life-navigator', 'data.duckdb');

/**
 * Initialize the DuckDB database
 */
export async function initDatabase(): Promise<void> {
  // Ensure directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Create database instance
  db = new duckdb.Database(DB_PATH);
  connection = db.connect();

  // Initialize schema if needed
  await initSchema();

  console.error(`DuckDB initialized at ${DB_PATH}`);
}

/**
 * Initialize database schema (knowledge graph + profiles)
 */
async function initSchema(): Promise<void> {
  const schemaPath = path.join(__dirname, '../graph/student-knowledge-graph.sql');

  // Check if tables already exist
  const tablesExist = await query<{ count: number }>(
    `SELECT COUNT(*) as count FROM information_schema.tables
     WHERE table_name IN ('student_nodes', 'student_edges')`
  );

  if (tablesExist[0]?.count === 0) {
    // Load and execute schema
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await execute(schema);
      console.error('Knowledge graph schema initialized');
    }
  }

  // Create profiles table if not exists
  await execute(`
    CREATE TABLE IF NOT EXISTS profiles (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      diploma VARCHAR,
      skills VARCHAR[],
      city VARCHAR,
      city_size VARCHAR,
      income_sources JSON,
      expenses JSON,
      max_work_hours_weekly INTEGER,
      min_hourly_rate DECIMAL,
      has_loan BOOLEAN DEFAULT FALSE,
      loan_amount DECIMAL,
      monthly_income DECIMAL,
      monthly_expenses DECIMAL,
      monthly_margin DECIMAL
    )
  `);

  // Create projections table if not exists
  await execute(`
    CREATE TABLE IF NOT EXISTS projections (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      scenario_name VARCHAR,
      scenario_params JSON,
      horizon_years INTEGER,
      final_balance DECIMAL,
      probability_debt_free DECIMAL,
      confidence_interval_low DECIMAL,
      confidence_interval_high DECIMAL,
      monthly_savings_projected DECIMAL,
      job_income_projected DECIMAL,
      optimization_savings_projected DECIMAL,
      model_version VARCHAR,
      prediction_confidence DECIMAL,
      opik_trace_id VARCHAR
    )
  `);

  // Create job recommendations table if not exists
  await execute(`
    CREATE TABLE IF NOT EXISTS job_recommendations (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      jobs JSON,
      skills_used VARCHAR[],
      graph_paths JSON,
      feedback VARCHAR,
      selected_job VARCHAR,
      opik_trace_id VARCHAR
    )
  `);
}

/**
 * Execute a SQL query and return results
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!connection) {
    await initDatabase();
  }

  return new Promise((resolve, reject) => {
    connection!.all(sql, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result as T[]);
      }
    });
  });
}

/**
 * Execute a SQL statement (no return value)
 */
export async function execute(sql: string): Promise<void> {
  if (!connection) {
    await initDatabase();
  }

  return new Promise((resolve, reject) => {
    connection!.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  if (connection) {
    connection = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}

// Export singleton for use in tools
export const database = {
  init: initDatabase,
  query,
  execute,
  close: closeDatabase,
};

export default database;
