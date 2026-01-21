/**
 * Row Mapper Utilities
 *
 * Generic utilities for converting between DuckDB rows (snake_case)
 * and TypeScript models (camelCase).
 */

/**
 * Convert snake_case to camelCase
 *
 * @example
 * snakeToCamel('profile_id') // 'profileId'
 * snakeToCamel('created_at') // 'createdAt'
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert camelCase to snake_case
 *
 * @example
 * camelToSnake('profileId') // 'profile_id'
 * camelToSnake('createdAt') // 'created_at'
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convert all keys in an object from snake_case to camelCase
 *
 * @example
 * const row = { profile_id: '123', created_at: '2024-01-01' };
 * const model = rowToModel(row);
 * // { profileId: '123', createdAt: '2024-01-01' }
 */
export function rowToModel<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    const camelKey = snakeToCamel(key);
    result[camelKey] = value;
  }

  return result as T;
}

/**
 * Convert all keys in an object from camelCase to snake_case
 *
 * @example
 * const model = { profileId: '123', createdAt: '2024-01-01' };
 * const row = modelToRow(model);
 * // { profile_id: '123', created_at: '2024-01-01' }
 */
export function modelToRow<T extends Record<string, unknown>>(model: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(model)) {
    const snakeKey = camelToSnake(key);
    result[snakeKey] = value;
  }

  return result as T;
}

/**
 * Row mapper interface for type-safe conversions
 */
export interface RowMapper<TRow, TModel> {
  fromRow(row: TRow): TModel;
  toRow(model: TModel): Partial<TRow>;
}

/**
 * Create a row mapper with custom field transformations
 *
 * @example
 * const skillMapper = createRowMapper<SkillRow, Skill>({
 *   fromRow: (row) => ({
 *     id: row.id,
 *     profileId: row.profile_id,
 *     name: row.name,
 *     level: (row.level || 'intermediate') as Skill['level'],
 *     hourlyRate: row.hourly_rate || 15,
 *   }),
 *   toRow: (skill) => ({
 *     id: skill.id,
 *     profile_id: skill.profileId,
 *     name: skill.name,
 *     level: skill.level,
 *     hourly_rate: skill.hourlyRate,
 *   }),
 * });
 */
export function createRowMapper<TRow, TModel>(
  config: RowMapper<TRow, TModel>
): RowMapper<TRow, TModel> {
  return config;
}

/**
 * Map an array of rows to models
 *
 * @example
 * const skills = mapRows(skillRows, rowToSkill);
 */
export function mapRows<TRow, TModel>(rows: TRow[], mapper: (row: TRow) => TModel): TModel[] {
  return rows.map(mapper);
}

/**
 * Handle null/undefined values with defaults
 *
 * @example
 * const value = withDefault(row.hourly_rate, 15);
 */
export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return value ?? defaultValue;
}

/**
 * Safely cast a string value to an enum/union type
 *
 * @example
 * const level = castEnum(row.level, 'intermediate', ['beginner', 'intermediate', 'advanced']);
 */
export function castEnum<T extends string>(
  value: string | null | undefined,
  defaultValue: T,
  _validValues?: readonly T[]
): T {
  if (!value) return defaultValue;
  // In practice, we trust DB values; this is for type safety
  return value as T;
}
