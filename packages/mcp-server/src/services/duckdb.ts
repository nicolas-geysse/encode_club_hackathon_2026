/**
 * DuckDB Service - Consolidated Version
 *
 * Aligned with frontend/_db.ts for compatibility:
 * - Same database path resolution (DUCKDB_PATH env or cwd/data/stride.duckdb)
 * - Write queue for serialized writes
 * - Process-level lock file
 * - Retry logic for transient errors
 *
 * Also includes MCP-server specific features:
 * - DuckPGQ extension for graph queries
 * - Full schema with goals, projections, academic events, etc.
 */

import type * as DuckDBTypes from 'duckdb';
import { createRequire } from 'module';

import * as fs from 'fs';
import * as path from 'path';

// Native module: must use createRequire for ESM compatibility with .node bindings
const require = createRequire(import.meta.url);
const duckdb = require('duckdb') as typeof DuckDBTypes;

// Resolve project root - same pattern as frontend/_db.ts
function getProjectRoot(): string {
  const cwd = process.cwd();
  // If running from packages/frontend or packages/mcp-server, go up to monorepo root
  if (cwd.includes('packages/')) {
    return path.resolve(cwd, '../..');
  }
  return cwd;
}

// Database path - ALIGNED with frontend
// Priority: DUCKDB_PATH env > PROJECT_ROOT/data/stride.duckdb
const PROJECT_ROOT = getProjectRoot();
const DB_DIR = process.env.DUCKDB_DIR || path.join(PROJECT_ROOT, 'data');
const DB_PATH = process.env.DUCKDB_PATH || path.join(DB_DIR, 'stride.duckdb');
const LOCK_PATH = `${DB_PATH}.app.lock`;

// Database instance
let db: DuckDBTypes.Database | null = null;
let connection: DuckDBTypes.Connection | null = null;
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
    console.error(`[DuckDB-MCP] Created data directory: ${DB_DIR}`);
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
          console.error(`[DuckDB-MCP] Database locked by PID ${lockedPid}`);
          return false;
        } catch {
          // Process doesn't exist, stale lock - we can take over
          console.error(`[DuckDB-MCP] Removing stale lock from PID ${lockedPid}`);
        }
      }
    }

    // Acquire the lock
    fs.writeFileSync(LOCK_PATH, String(PROCESS_ID));
    console.error(`[DuckDB-MCP] Lock acquired by PID ${PROCESS_ID}`);
    return true;
  } catch (error) {
    console.error('[DuckDB-MCP] Lock check error:', error);
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
        console.error(`[DuckDB-MCP] Lock released by PID ${PROCESS_ID}`);
      }
    }
  } catch (error) {
    console.error('[DuckDB-MCP] Lock release error:', error);
  }
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get or create database connection
 */
function getConnection(): DuckDBTypes.Connection {
  if (!db) {
    ensureDataDir();

    // Check application-level lock
    if (!checkAndAcquireLock()) {
      throw new Error('Database is locked by another process');
    }

    // Open database
    db = new duckdb.Database(DB_PATH);
    console.error(`[DuckDB-MCP] Opened database: ${DB_PATH} (PID: ${PROCESS_ID})`);

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
  if (!connection) {
    connection = db.connect();
    console.error(`[DuckDB-MCP] Connection established`);
  }
  return connection;
}

/**
 * Initialize the DuckDB database
 * Uses a promise singleton to prevent race conditions with concurrent queries
 */
let initPromise: Promise<void> | null = null;

export async function initDatabase(): Promise<void> {
  if (initialized && db && connection) return;

  // Deduplicate concurrent init calls - all await the same promise
  if (!initPromise) {
    initPromise = (async () => {
      getConnection();

      // Initialize schema if needed
      await initSchema();

      initialized = true;
      console.error(`[DuckDB-MCP] Database initialized at ${DB_PATH}`);
    })();
  }

  await initPromise;
}

/**
 * Initialize database schema (knowledge graph + profiles)
 */
async function initSchema(): Promise<void> {
  // Install and load DuckPGQ extension for graph queries
  try {
    await executeInternal('INSTALL duckpgq FROM community;');
    await executeInternal('LOAD duckpgq;');
    console.error('[DuckDB-MCP] DuckPGQ extension loaded successfully');
  } catch (error) {
    console.error('[DuckDB-MCP] Warning: Could not load DuckPGQ extension:', error);
    // Continue without graph extension - basic queries will still work
  }

  // Graph SQL files live in src/graph/ (not copied to dist/ by tsc)
  // Use PROJECT_ROOT to find them reliably from both src/ and dist/ contexts
  const graphDir = path.join(PROJECT_ROOT, 'packages/mcp-server/src/graph');
  const schemaPath = path.join(graphDir, 'student-knowledge-graph.sql');
  const prospectionGraphPath = path.join(graphDir, 'prospection-graph.sql');
  const skillsGraphPath = path.join(graphDir, 'skills-knowledge-graph.sql');

  // Check if tables already exist (use queryWithRetry to avoid initDatabase recursion)
  const tablesExist = await queryWithRetry<{ count: number }>(
    `SELECT COUNT(*) as count FROM information_schema.tables
     WHERE table_name IN ('student_nodes', 'student_edges')`
  );

  if (Number(tablesExist[0]?.count) === 0) {
    // Load and execute base schema
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      await executeInternal(schema);
      console.error('[DuckDB-MCP] Knowledge graph schema initialized');
    } else {
      console.error(`[DuckDB-MCP] Warning: Graph schema not found at ${schemaPath}`);
    }
  }

  // Load prospection graph data (extends the base graph)
  // Only attempt if student_nodes table exists (base graph loaded successfully)
  try {
    const prospectionNodesExist = await queryWithRetry<{ count: number }>(
      `SELECT COUNT(*) as count FROM student_nodes WHERE domain = 'prospection_category'`
    );

    if (Number(prospectionNodesExist[0]?.count) === 0 && fs.existsSync(prospectionGraphPath)) {
      try {
        const prospectionSchema = fs.readFileSync(prospectionGraphPath, 'utf-8');
        await executeInternal(prospectionSchema);
        console.error('[DuckDB-MCP] Prospection graph data loaded successfully');
      } catch (error) {
        console.error('[DuckDB-MCP] Warning: Could not load prospection graph:', error);
      }
    }
  } catch {
    console.error(
      '[DuckDB-MCP] Warning: student_nodes table not found, skipping prospection graph'
    );
  }

  // Load skills knowledge graph data (fields of study + monetizable skills)
  try {
    const skillsNodesExist = await queryWithRetry<{ count: number }>(
      `SELECT COUNT(*) as count FROM student_nodes WHERE domain = 'field_of_study'`
    );

    if (Number(skillsNodesExist[0]?.count) === 0 && fs.existsSync(skillsGraphPath)) {
      try {
        const skillsSchema = fs.readFileSync(skillsGraphPath, 'utf-8');
        await executeInternal(skillsSchema);
        console.error('[DuckDB-MCP] Skills knowledge graph data loaded successfully');
      } catch (error) {
        console.error('[DuckDB-MCP] Warning: Could not load skills knowledge graph:', error);
      }
    }
  } catch {
    console.error('[DuckDB-MCP] Warning: student_nodes table not found, skipping skills graph');
  }

  // Create property graph for knowledge graph queries (DuckPGQ)
  try {
    await executeInternal(`
      CREATE PROPERTY GRAPH IF NOT EXISTS student_graph
      VERTEX TABLES (
        student_nodes
      )
      EDGE TABLES (
        student_edges
          SOURCE KEY (source_id) REFERENCES student_nodes (id)
          DESTINATION KEY (target_id) REFERENCES student_nodes (id)
      );
    `);
    console.error('[DuckDB-MCP] Property graph student_graph created');
  } catch (error) {
    console.error('[DuckDB-MCP] Warning: Could not create property graph:', error);
    // Continue without property graph
  }

  // Create profiles table if not exists
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS profiles (
      id VARCHAR PRIMARY KEY,
      name VARCHAR NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      diploma VARCHAR,
      field VARCHAR,
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
      monthly_margin DECIMAL,
      -- Profile type and duplication support
      profile_type VARCHAR DEFAULT 'main',
      parent_profile_id VARCHAR,
      -- Goal data
      goal_name VARCHAR,
      goal_amount DECIMAL,
      goal_deadline DATE,
      -- Plan and followup data (stored as JSON)
      plan_data JSON,
      followup_data JSON,
      achievements JSON,
      -- Active profile flag (only one active at a time)
      is_active BOOLEAN DEFAULT FALSE
    )
  `);

  // Migrate existing profiles: add new columns if they don't exist
  const migrations = [
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_type VARCHAR DEFAULT 'main'`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_profile_id VARCHAR`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_name VARCHAR`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_amount DECIMAL`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_deadline DATE`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_data JSON`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followup_data JSON`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS achievements JSON`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS field VARCHAR`,
  ];

  for (const migration of migrations) {
    try {
      await executeInternal(migration);
    } catch {
      // Columns may already exist, ignore errors
    }
  }

  // Create simulation_state table for time simulation
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS simulation_state (
      id VARCHAR PRIMARY KEY DEFAULT 'global',
      simulated_date DATE DEFAULT CURRENT_DATE,
      real_date DATE DEFAULT CURRENT_DATE,
      offset_days INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize simulation state if not exists
  await executeInternal(`
    INSERT INTO simulation_state (id, simulated_date, real_date, offset_days)
    SELECT 'global', CURRENT_DATE, CURRENT_DATE, 0
    WHERE NOT EXISTS (SELECT 1 FROM simulation_state WHERE id = 'global')
  `);

  // Create projections table if not exists
  await executeInternal(`
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
  await executeInternal(`
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

  // ==========================================
  // GOAL-DRIVEN MODE TABLES
  // ==========================================

  // Goals table - main goal definitions
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS goals (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR,
      goal_name VARCHAR NOT NULL,
      goal_amount DECIMAL NOT NULL,
      goal_deadline DATE NOT NULL,
      minimum_budget DECIMAL,
      status VARCHAR DEFAULT 'active',
      feasibility_score DECIMAL,
      risk_level VARCHAR,
      weekly_target DECIMAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Goal progress tracking - weekly milestones
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS goal_progress (
      id VARCHAR PRIMARY KEY,
      goal_id VARCHAR NOT NULL,
      week_number INTEGER NOT NULL,
      target_amount DECIMAL NOT NULL,
      earned_amount DECIMAL DEFAULT 0,
      pace_ratio DECIMAL,
      risk_alert VARCHAR DEFAULT 'on_track',
      actions_completed JSON,
      achievements_unlocked JSON,
      notes VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(goal_id, week_number)
    )
  `);

  // Goal actions - individual actions within a goal plan
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS goal_actions (
      id VARCHAR PRIMARY KEY,
      goal_id VARCHAR NOT NULL,
      action_type VARCHAR NOT NULL,
      action_name VARCHAR NOT NULL,
      description VARCHAR,
      estimated_value DECIMAL,
      actual_value DECIMAL,
      time_hours DECIMAL,
      priority VARCHAR DEFAULT 'medium',
      start_week INTEGER,
      completion_week INTEGER,
      status VARCHAR DEFAULT 'pending',
      source_strategy_id VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Goal achievements - gamification tracking
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS goal_achievements (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      achievement_id VARCHAR NOT NULL,
      goal_id VARCHAR,
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, achievement_id, goal_id)
    )
  `);

  // ==========================================
  // RETROPLANNING / CAPACITY TABLES
  // ==========================================

  // Academic events - exams, vacations, internships, project deadlines
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS academic_events (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      event_type VARCHAR NOT NULL,
      event_name VARCHAR NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      capacity_impact DECIMAL DEFAULT 0.2,
      priority VARCHAR DEFAULT 'normal',
      is_recurring BOOLEAN DEFAULT FALSE,
      recurrence_pattern VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Commitments - recurring time obligations (classes, sports, family, etc.)
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS commitments (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      commitment_type VARCHAR NOT NULL,
      commitment_name VARCHAR NOT NULL,
      hours_per_week DECIMAL NOT NULL,
      flexible_hours BOOLEAN DEFAULT TRUE,
      day_preferences VARCHAR[],
      start_date DATE,
      end_date DATE,
      priority VARCHAR DEFAULT 'important',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Energy/mood logs - daily tracking for capacity prediction
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS energy_logs (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      log_date DATE NOT NULL,
      energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
      mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
      stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
      hours_slept DECIMAL,
      notes VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(profile_id, log_date)
    )
  `);

  // Retroplans - generated capacity-aware plans for goals
  await executeInternal(`
    CREATE TABLE IF NOT EXISTS retroplans (
      id VARCHAR PRIMARY KEY,
      goal_id VARCHAR NOT NULL,
      profile_id VARCHAR NOT NULL,
      config JSON NOT NULL,
      milestones JSON NOT NULL,
      total_weeks INTEGER,
      high_capacity_weeks INTEGER,
      medium_capacity_weeks INTEGER,
      low_capacity_weeks INTEGER,
      protected_weeks INTEGER,
      feasibility_score DECIMAL,
      confidence_low DECIMAL,
      confidence_high DECIMAL,
      risk_factors JSON,
      front_loaded_percentage DECIMAL,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Internal execute without queue (for schema init)
 */
async function executeInternal(sql: string): Promise<void> {
  const conn = getConnection();
  return new Promise((resolve, reject) => {
    conn.exec(sql, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Execute with retry for transient lock errors
 */
async function executeWithRetry(sql: string, retries = 3, delay = 100): Promise<void> {
  const conn = getConnection();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        conn.exec(sql, (err) => {
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
        console.error(`[DuckDB-MCP] Lock conflict, retry ${attempt}/${retries} in ${delay}ms`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
      } else {
        console.error('[DuckDB-MCP] Execute error:', error.message);
        throw error;
      }
    }
  }
}

/**
 * Query with retry for transient lock errors
 */
async function queryWithRetry<T>(sql: string, retries = 3, delay = 100): Promise<T[]> {
  const conn = getConnection();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await new Promise<T[]>((resolve, reject) => {
        conn.all(sql, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result as T[]);
          }
        });
      });
    } catch (err) {
      const error = err as Error;
      const isLockError = error.message?.includes('lock') || error.message?.includes('Conflicting');

      if (isLockError && attempt < retries) {
        console.error(`[DuckDB-MCP] Lock conflict on query, retry ${attempt}/${retries}`);
        await sleep(delay);
        delay *= 2;
      } else {
        console.error('[DuckDB-MCP] Query error:', error.message);
        throw error;
      }
    }
  }
  return []; // Should never reach here
}

/**
 * Execute a SQL query and return results
 */
export async function query<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!initialized) {
    await initDatabase();
  }
  return queryWithRetry<T>(sql);
}

/**
 * Execute a SQL statement (no return value)
 * All writes are queued to prevent WAL lock conflicts
 */
export async function execute(sql: string): Promise<void> {
  if (!initialized) {
    await initDatabase();
  }

  // Queue this write operation
  const operation = writeQueue.then(() => executeWithRetry(sql));

  // Update the queue to include this operation
  writeQueue = operation.catch(() => {
    // Don't break the chain on errors
  });

  return operation;
}

/**
 * Execute a query that returns results (for writes that need RETURNING)
 * Also queued to prevent WAL conflicts
 */
export async function queryWrite<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  if (!initialized) {
    await initDatabase();
  }

  // Queue this write operation
  const operation = writeQueue.then(() => queryWithRetry<T>(sql));

  // Update the queue
  writeQueue = operation.then(() => {}).catch(() => {});

  return operation;
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
  initialized = false;
  releaseLock();
  console.error('[DuckDB-MCP] Database closed');
}

/**
 * Get the current simulated date
 */
export async function getSimulatedDate(): Promise<Date> {
  const result = await query<{ simulated_date: string }>(`
    SELECT simulated_date FROM simulation_state WHERE id = 'global'
  `);
  if (result.length > 0 && result[0].simulated_date) {
    return new Date(result[0].simulated_date);
  }
  return new Date();
}

/**
 * Get simulation state
 */
export async function getSimulationState(): Promise<{
  simulatedDate: Date;
  realDate: Date;
  offsetDays: number;
  isSimulating: boolean;
}> {
  const result = await query<{
    simulated_date: string;
    real_date: string;
    offset_days: number;
  }>(`SELECT simulated_date, real_date, offset_days FROM simulation_state WHERE id = 'global'`);

  if (result.length > 0) {
    return {
      simulatedDate: new Date(result[0].simulated_date),
      realDate: new Date(result[0].real_date),
      offsetDays: result[0].offset_days,
      isSimulating: result[0].offset_days > 0,
    };
  }

  return {
    simulatedDate: new Date(),
    realDate: new Date(),
    offsetDays: 0,
    isSimulating: false,
  };
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

// Export singleton for use in tools
export const database = {
  init: initDatabase,
  query,
  execute,
  queryWrite,
  close: closeDatabase,
  getSimulatedDate,
  getSimulationState,
  escapeSQL,
  getDatabaseInfo,
};

// Export database path for external use
export const DATABASE_PATH = DB_PATH;
export const DATABASE_DIR = DB_DIR;

export default database;
