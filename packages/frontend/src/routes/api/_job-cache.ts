/**
 * Job Cache Utility (P2)
 *
 * DuckDB-based caching for job search results to avoid repeated API calls.
 *
 * TTL Settings:
 * - Google Places results: 24h (businesses don't change often)
 * - Remote job listings: 6h (job postings are more dynamic)
 *
 * Cache key format: {source}_{categoryId}_{locationHash}
 */

import { initDatabase, execute, query, escapeSQL, executeSchema } from './_db';
import crypto from 'crypto';

// Track if table is created
let tableCreated = false;

// Cache TTL in milliseconds
const CACHE_TTL = {
  google_places: 24 * 60 * 60 * 1000, // 24 hours
  job_listings: 6 * 60 * 60 * 1000, // 6 hours
  default: 12 * 60 * 60 * 1000, // 12 hours
};

// Job cache table schema
const JOB_CACHE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS job_cache (
    id VARCHAR PRIMARY KEY,
    source VARCHAR NOT NULL,
    category_id VARCHAR NOT NULL,
    location_hash VARCHAR,
    job_data VARCHAR NOT NULL,
    result_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL
  )
`;

/**
 * Ensure cache table exists
 */
async function ensureCacheTable(): Promise<void> {
  if (tableCreated) return;
  await initDatabase();
  await executeSchema(JOB_CACHE_TABLE_SQL);
  tableCreated = true;
}

/**
 * Generate location hash from coordinates
 */
function hashLocation(lat?: number, lng?: number, city?: string): string {
  const data = `${lat?.toFixed(3) || 'null'}_${lng?.toFixed(3) || 'null'}_${city || 'unknown'}`;
  return crypto.createHash('md5').update(data).digest('hex').slice(0, 12);
}

/**
 * Generate cache key
 */
function getCacheKey(
  source: 'google_places' | 'job_listings' | string,
  categoryId: string,
  locationHash: string
): string {
  return `${source}_${categoryId}_${locationHash}`;
}

export interface CachedJobResult {
  id: string;
  source: string;
  categoryId: string;
  jobs: unknown[];
  resultCount: number;
  cachedAt: Date;
  expiresAt: Date;
}

/**
 * Get cached job results if available and not expired
 */
export async function getCachedJobs(
  source: 'google_places' | 'job_listings',
  categoryId: string,
  lat?: number,
  lng?: number,
  city?: string
): Promise<CachedJobResult | null> {
  try {
    await ensureCacheTable();

    const locationHash = hashLocation(lat, lng, city);
    const cacheKey = getCacheKey(source, categoryId, locationHash);

    const results = await query(`
      SELECT * FROM job_cache
      WHERE id = ${escapeSQL(cacheKey)}
      AND expires_at > CURRENT_TIMESTAMP
    `);

    if (results.length === 0) {
      return null;
    }

    const row = results[0] as {
      id: string;
      source: string;
      category_id: string;
      job_data: string;
      result_count: number;
      created_at: string;
      expires_at: string;
    };

    return {
      id: row.id,
      source: row.source,
      categoryId: row.category_id,
      jobs: JSON.parse(row.job_data),
      resultCount: row.result_count,
      cachedAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
    };
  } catch (error) {
    console.error('[JobCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Save job results to cache
 */
export async function setCachedJobs(
  source: 'google_places' | 'job_listings',
  categoryId: string,
  jobs: unknown[],
  lat?: number,
  lng?: number,
  city?: string
): Promise<void> {
  try {
    await ensureCacheTable();

    const locationHash = hashLocation(lat, lng, city);
    const cacheKey = getCacheKey(source, categoryId, locationHash);
    const ttl = CACHE_TTL[source] || CACHE_TTL.default;
    const expiresAt = new Date(Date.now() + ttl);

    const jobData = JSON.stringify(jobs);

    // Delete existing cache entry if any
    await execute(`DELETE FROM job_cache WHERE id = ${escapeSQL(cacheKey)}`);

    // Insert new cache entry
    await execute(`
      INSERT INTO job_cache (id, source, category_id, location_hash, job_data, result_count, expires_at)
      VALUES (
        ${escapeSQL(cacheKey)},
        ${escapeSQL(source)},
        ${escapeSQL(categoryId)},
        ${escapeSQL(locationHash)},
        ${escapeSQL(jobData)},
        ${jobs.length},
        ${escapeSQL(expiresAt.toISOString())}
      )
    `);

    console.log(
      `[JobCache] Cached ${jobs.length} jobs for ${cacheKey}, expires ${expiresAt.toISOString()}`
    );
  } catch (error) {
    console.error('[JobCache] Error writing cache:', error);
    // Don't throw - caching is non-critical
  }
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  try {
    await ensureCacheTable();

    // Get count before deletion
    const countResult = await query(`
      SELECT COUNT(*) as count FROM job_cache
      WHERE expires_at <= CURRENT_TIMESTAMP
    `);
    const expiredCount = (countResult[0] as { count: number })?.count || 0;

    if (expiredCount > 0) {
      await execute(`DELETE FROM job_cache WHERE expires_at <= CURRENT_TIMESTAMP`);
      console.log(`[JobCache] Cleared ${expiredCount} expired cache entries`);
    }

    return expiredCount;
  } catch (error) {
    console.error('[JobCache] Error clearing cache:', error);
    return 0;
  }
}

/**
 * Clear all cache (for debugging/testing)
 */
export async function clearAllCache(): Promise<void> {
  try {
    await ensureCacheTable();
    await execute(`DELETE FROM job_cache`);
    console.log('[JobCache] Cleared all cache entries');
  } catch (error) {
    console.error('[JobCache] Error clearing all cache:', error);
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
  bySource: Record<string, number>;
}> {
  try {
    await ensureCacheTable();

    const totalResult = await query(`SELECT COUNT(*) as count FROM job_cache`);
    const expiredResult = await query(`
      SELECT COUNT(*) as count FROM job_cache
      WHERE expires_at <= CURRENT_TIMESTAMP
    `);
    const bySourceResult = await query(`
      SELECT source, COUNT(*) as count FROM job_cache
      GROUP BY source
    `);

    const bySource: Record<string, number> = {};
    for (const row of bySourceResult as { source: string; count: number }[]) {
      bySource[row.source] = row.count;
    }

    return {
      totalEntries: (totalResult[0] as { count: number })?.count || 0,
      expiredEntries: (expiredResult[0] as { count: number })?.count || 0,
      bySource,
    };
  } catch (error) {
    console.error('[JobCache] Error getting stats:', error);
    return { totalEntries: 0, expiredEntries: 0, bySource: {} };
  }
}
