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
const DB_PATH =
  process.env.DUCKDB_PATH || path.join(process.env.HOME || '.', '.stride', 'data.duckdb');

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
  // Install and load DuckPGQ extension for graph queries
  try {
    await execute('INSTALL duckpgq FROM community;');
    await execute('LOAD duckpgq;');
    console.error('DuckPGQ extension loaded successfully');
  } catch (error) {
    console.error('Warning: Could not load DuckPGQ extension:', error);
    // Continue without graph extension - basic queries will still work
  }

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

  // Create property graph for knowledge graph queries (DuckPGQ)
  try {
    await execute(`
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
    console.error('Property graph student_graph created');
  } catch (error) {
    console.error('Warning: Could not create property graph:', error);
    // Continue without property graph
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
  try {
    await execute(
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_type VARCHAR DEFAULT 'main'`
    );
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_profile_id VARCHAR`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_name VARCHAR`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_amount DECIMAL`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_deadline DATE`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_data JSON`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followup_data JSON`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS achievements JSON`);
    await execute(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE`);
  } catch {
    // Columns may already exist, ignore errors
  }

  // Create simulation_state table for time simulation
  await execute(`
    CREATE TABLE IF NOT EXISTS simulation_state (
      id VARCHAR PRIMARY KEY DEFAULT 'global',
      simulated_date DATE DEFAULT CURRENT_DATE,
      real_date DATE DEFAULT CURRENT_DATE,
      offset_days INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Initialize simulation state if not exists
  await execute(`
    INSERT INTO simulation_state (id, simulated_date, real_date, offset_days)
    SELECT 'global', CURRENT_DATE, CURRENT_DATE, 0
    WHERE NOT EXISTS (SELECT 1 FROM simulation_state WHERE id = 'global')
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

  // ==========================================
  // GOAL-DRIVEN MODE TABLES
  // ==========================================

  // Goals table - main goal definitions
  await execute(`
    CREATE TABLE IF NOT EXISTS goals (
      id VARCHAR PRIMARY KEY,
      user_id VARCHAR,
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
  await execute(`
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
  await execute(`
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
  await execute(`
    CREATE TABLE IF NOT EXISTS goal_achievements (
      id VARCHAR PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      achievement_id VARCHAR NOT NULL,
      goal_id VARCHAR,
      unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, achievement_id, goal_id)
    )
  `);

  // ==========================================
  // RETROPLANNING / CAPACITY TABLES
  // ==========================================

  // Academic events - exams, vacations, internships, project deadlines
  await execute(`
    CREATE TABLE IF NOT EXISTS academic_events (
      id VARCHAR PRIMARY KEY,
      user_id VARCHAR NOT NULL,
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
  await execute(`
    CREATE TABLE IF NOT EXISTS commitments (
      id VARCHAR PRIMARY KEY,
      user_id VARCHAR NOT NULL,
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
  await execute(`
    CREATE TABLE IF NOT EXISTS energy_logs (
      id VARCHAR PRIMARY KEY,
      user_id VARCHAR NOT NULL,
      log_date DATE NOT NULL,
      energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
      mood_score INTEGER CHECK (mood_score BETWEEN 1 AND 5),
      stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
      hours_slept DECIMAL,
      notes VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, log_date)
    )
  `);

  // Retroplans - generated capacity-aware plans for goals
  await execute(`
    CREATE TABLE IF NOT EXISTS retroplans (
      id VARCHAR PRIMARY KEY,
      goal_id VARCHAR NOT NULL,
      user_id VARCHAR NOT NULL,
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

// Export singleton for use in tools
export const database = {
  init: initDatabase,
  query,
  execute,
  close: closeDatabase,
  getSimulatedDate,
  getSimulationState,
};

export default database;
