/**
 * Schema Manager
 *
 * Centralized schema initialization for DuckDB tables.
 * Each table's schema is initialized once per process.
 */

import { executeSchema } from '../../routes/api/_db';

// Track which schemas have been initialized
const initializedSchemas = new Set<string>();

/**
 * Ensure a table exists with the given schema.
 * Uses a process-level flag to avoid redundant CREATE TABLE calls.
 *
 * @param tableName - Name of the table (used for tracking)
 * @param createTableSQL - Full CREATE TABLE IF NOT EXISTS statement
 * @param logger - Optional logger for debug info
 *
 * @example
 * await ensureSchema('skills', `
 *   CREATE TABLE IF NOT EXISTS skills (
 *     id VARCHAR PRIMARY KEY,
 *     profile_id VARCHAR NOT NULL,
 *     name VARCHAR NOT NULL
 *   )
 * `, logger);
 */
export async function ensureSchema(
  tableName: string,
  createTableSQL: string,
  logger?: { info: (msg: string) => void; debug: (msg: string, meta?: unknown) => void }
): Promise<void> {
  if (initializedSchemas.has(tableName)) {
    return;
  }

  try {
    await executeSchema(createTableSQL);
    initializedSchemas.add(tableName);
    logger?.info(`Schema initialized: ${tableName}`);
  } catch (error) {
    // Table might already exist, mark as initialized anyway
    logger?.debug(`Schema init note: ${tableName}`, { error });
    initializedSchemas.add(tableName);
  }
}

/**
 * Reset schema tracking (for testing purposes)
 */
export function resetSchemaTracking(): void {
  initializedSchemas.clear();
}

/**
 * Check if a schema has been initialized
 */
export function isSchemaInitialized(tableName: string): boolean {
  return initializedSchemas.has(tableName);
}

/**
 * Common schema definitions for reference.
 * These match the actual table structures in the database.
 */
export const SCHEMAS = {
  skills: `
    CREATE TABLE IF NOT EXISTS skills (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      level VARCHAR DEFAULT 'intermediate',
      hourly_rate DECIMAL DEFAULT 15,
      market_demand INTEGER DEFAULT 3,
      cognitive_effort INTEGER DEFAULT 3,
      rest_needed DECIMAL DEFAULT 1,
      score DECIMAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  inventory_items: `
    CREATE TABLE IF NOT EXISTS inventory_items (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      category VARCHAR DEFAULT 'other',
      estimated_value DECIMAL DEFAULT 50,
      condition VARCHAR DEFAULT 'good',
      platform VARCHAR,
      status VARCHAR DEFAULT 'available',
      sold_price DECIMAL,
      sold_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  subscriptions: `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      category VARCHAR DEFAULT 'other',
      current_cost DECIMAL NOT NULL,
      original_cost DECIMAL,
      frequency VARCHAR DEFAULT 'monthly',
      status VARCHAR DEFAULT 'active',
      next_billing_date TIMESTAMP,
      savings_potential DECIMAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  income_streams: `
    CREATE TABLE IF NOT EXISTS income_streams (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      category VARCHAR DEFAULT 'other',
      amount DECIMAL NOT NULL,
      frequency VARCHAR DEFAULT 'monthly',
      is_active BOOLEAN DEFAULT true,
      skill_id VARCHAR,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  trade_opportunities: `
    CREATE TABLE IF NOT EXISTS trade_opportunities (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      type VARCHAR NOT NULL,
      description VARCHAR NOT NULL,
      with_person VARCHAR,
      for_what VARCHAR,
      estimated_value DECIMAL,
      status VARCHAR DEFAULT 'pending',
      completed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  goals: `
    CREATE TABLE IF NOT EXISTS goals (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      target_amount DECIMAL NOT NULL,
      current_amount DECIMAL DEFAULT 0,
      deadline TIMESTAMP,
      priority INTEGER DEFAULT 1,
      status VARCHAR DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,

  academic_events: `
    CREATE TABLE IF NOT EXISTS academic_events (
      id VARCHAR PRIMARY KEY,
      profile_id VARCHAR NOT NULL,
      name VARCHAR NOT NULL,
      type VARCHAR NOT NULL,
      start_date TIMESTAMP,
      end_date TIMESTAMP,
      duration VARCHAR,
      difficulty INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `,
} as const;
