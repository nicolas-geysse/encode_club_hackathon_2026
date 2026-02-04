/**
 * Tip Cache Service
 *
 * Smart LRU cache with hash-based invalidation for Bruno tips.
 * Features:
 * - Hash-based invalidation (recalculate only when context changes meaningfully)
 * - LRU eviction when cache is full
 * - TTL-based expiration
 * - Cache metrics for monitoring
 * - Tab prediction for prefetching
 */

import { createLogger } from './logger.js';
import type { TabType, TabTipsOutput, TabContext } from '../agents/strategies/types.js';

const logger = createLogger('TipCache');

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 200;

// Tab prediction map: which tabs are likely next
const TAB_PREDICTION: Record<TabType, TabType[]> = {
  profile: ['goals', 'jobs'],
  goals: ['budget', 'swipe'],
  budget: ['jobs', 'trade'],
  trade: ['budget'],
  jobs: ['swipe', 'budget'],
  swipe: ['goals', 'jobs'],
};

// ============================================================================
// Types
// ============================================================================

interface CacheEntry {
  tip: TabTipsOutput;
  timestamp: number;
  contextHash: string;
  hits: number;
}

interface CacheMetrics {
  hits: number;
  misses: number;
  invalidations: number;
  evictions: number;
  warmups: number;
  prefetches: number;
  size: number;
  hitRate: number;
}

// ============================================================================
// Cache State
// ============================================================================

const cache = new Map<string, CacheEntry>();
let metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  invalidations: 0,
  evictions: 0,
  warmups: 0,
  prefetches: 0,
  size: 0,
  hitRate: 0,
};

// ============================================================================
// Hash Functions
// ============================================================================

/**
 * Generate a deterministic hash of context data
 * Only hashes fields that should trigger recalculation
 */
export function hashContext(context: Partial<TabContext>): string {
  const meaningfulData = {
    // Profile
    profileName: context.profile?.name ? 1 : 0,
    skillsCount: context.profile?.skills?.length ?? 0,
    // Energy - round to 10% buckets
    energy: Math.round((context.currentEnergy ?? 50) / 10) * 10,
    // Budget - round to 50€ buckets
    margin: Math.round((context.monthlyMargin ?? 0) / 50) * 50,
    // Goals
    goalsCount: context.goals?.length ?? 0,
    goalsProgress: context.goals?.map((g) => Math.round((g.progress ?? 0) / 20) * 20).join(','),
    // Trade
    inventoryCount: context.trade?.inventory?.length ?? 0,
    tradesActive: context.trade?.trades?.filter((t) => t.status === 'active').length ?? 0,
    // Jobs
    leadsCount: context.jobs?.leads?.length ?? 0,
    // Swipe
    scenariosCount: context.swipe?.scenariosCount ?? 0,
  };

  // Simple hash function
  const str = JSON.stringify(meaningfulData);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Generate cache key from tab type and profile ID
 */
export function getCacheKey(tabType: TabType, profileId: string): string {
  return `${tabType}:${profileId}`;
}

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Get cached tip if valid
 */
export function getCachedTip(
  tabType: TabType,
  profileId: string,
  contextHash: string
): TabTipsOutput | null {
  const key = getCacheKey(tabType, profileId);
  const entry = cache.get(key);

  if (!entry) {
    metrics.misses++;
    updateHitRate();
    return null;
  }

  // Check TTL
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    metrics.invalidations++;
    metrics.misses++;
    metrics.size = cache.size;
    updateHitRate();
    logger.debug('Cache expired', { tabType, profileId });
    return null;
  }

  // Check if context changed meaningfully
  if (entry.contextHash !== contextHash) {
    cache.delete(key);
    metrics.invalidations++;
    metrics.misses++;
    metrics.size = cache.size;
    updateHitRate();
    logger.debug('Cache invalidated (context changed)', { tabType, profileId });
    return null;
  }

  // Cache hit
  entry.hits++;
  metrics.hits++;
  updateHitRate();

  logger.debug('Cache hit', { tabType, profileId, entryHits: entry.hits });

  // Return with cached flag
  return {
    ...entry.tip,
    processingInfo: {
      ...entry.tip.processingInfo,
      cached: true,
      cacheKey: key,
    },
  };
}

/**
 * Store tip in cache with LRU eviction
 */
export function setCachedTip(
  tabType: TabType,
  profileId: string,
  contextHash: string,
  tip: TabTipsOutput,
  source: 'request' | 'warmup' | 'prefetch' = 'request'
): void {
  const key = getCacheKey(tabType, profileId);

  // LRU eviction if cache is full
  if (cache.size >= MAX_CACHE_SIZE && !cache.has(key)) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
      metrics.evictions++;
      logger.debug('Cache evicted (LRU)', { evictedKey: firstKey });
    }
  }

  cache.set(key, {
    tip,
    timestamp: Date.now(),
    contextHash,
    hits: 0,
  });

  metrics.size = cache.size;

  if (source === 'warmup') {
    metrics.warmups++;
  } else if (source === 'prefetch') {
    metrics.prefetches++;
  }

  logger.debug('Cache set', { tabType, profileId, source });
}

/**
 * Clear cache for a specific profile or all
 */
export function clearCache(profileId?: string, tabType?: TabType): number {
  let cleared = 0;

  if (profileId && tabType) {
    const key = getCacheKey(tabType, profileId);
    if (cache.delete(key)) cleared++;
  } else if (profileId) {
    for (const key of cache.keys()) {
      if (key.includes(profileId)) {
        cache.delete(key);
        cleared++;
      }
    }
  } else {
    cleared = cache.size;
    cache.clear();
  }

  metrics.size = cache.size;
  logger.info('Cache cleared', { profileId, tabType, cleared });

  return cleared;
}

/**
 * Check if tip is cached (without retrieving)
 */
export function hasCachedTip(tabType: TabType, profileId: string): boolean {
  const key = getCacheKey(tabType, profileId);
  const entry = cache.get(key);

  if (!entry) return false;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) return false;

  return true;
}

// ============================================================================
// Tab Prediction & Prefetching
// ============================================================================

/**
 * Get predicted next tabs for prefetching
 */
export function getPredictedTabs(currentTab: TabType): TabType[] {
  return TAB_PREDICTION[currentTab] || [];
}

/**
 * Get tabs that need prefetching (not already cached)
 */
export function getTabsToPreFetch(currentTab: TabType, profileId: string): TabType[] {
  const predicted = getPredictedTabs(currentTab);
  return predicted.filter((tab) => !hasCachedTip(tab, profileId));
}

/**
 * Get warmup tabs (most common after login)
 */
export function getWarmupTabs(): TabType[] {
  return ['goals', 'budget', 'jobs'];
}

// ============================================================================
// Metrics
// ============================================================================

function updateHitRate(): void {
  const total = metrics.hits + metrics.misses;
  metrics.hitRate = total > 0 ? metrics.hits / total : 0;
}

/**
 * Get current cache metrics
 */
export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}

/**
 * Reset cache metrics (for testing)
 */
export function resetCacheMetrics(): void {
  metrics = {
    hits: 0,
    misses: 0,
    invalidations: 0,
    evictions: 0,
    warmups: 0,
    prefetches: 0,
    size: cache.size,
    hitRate: 0,
  };
}

/**
 * Log cache metrics summary
 */
export function logCacheMetrics(): void {
  const m = getCacheMetrics();
  logger.info('Cache metrics', {
    size: m.size,
    hitRate: `${(m.hitRate * 100).toFixed(1)}%`,
    hits: m.hits,
    misses: m.misses,
    invalidations: m.invalidations,
    evictions: m.evictions,
    warmups: m.warmups,
    prefetches: m.prefetches,
  });
}

// ============================================================================
// Exports
// ============================================================================

export const tipCache = {
  get: getCachedTip,
  set: setCachedTip,
  has: hasCachedTip,
  clear: clearCache,
  hashContext,
  getCacheKey,
  getPredictedTabs,
  getTabsToPreFetch,
  getWarmupTabs,
  getMetrics: getCacheMetrics,
  resetMetrics: resetCacheMetrics,
  logMetrics: logCacheMetrics,
};

export default tipCache;
