/**
 * useTipsWarmup Hook
 *
 * Prefetches Bruno tips for predicted next tabs to improve UX.
 * Uses the Strategy Pattern orchestrator's tab prediction logic
 * to warm up cache before users navigate.
 *
 * Features:
 * - Warms up current tab on mount
 * - Prefetches predicted next tabs in background
 * - Tracks warmup status per tab
 * - Non-blocking (all fetches in background)
 *
 * @example
 * ```tsx
 * function MyTab(props: { profileId: string }) {
 *   const { isWarmedUp, warmupTabs } = useTipsWarmup(
 *     () => props.profileId,
 *     'goals'
 *   );
 *
 *   return (
 *     <Show when={isWarmedUp()}>
 *       <BrunoHintV2 tabType="goals" profileId={props.profileId} />
 *     </Show>
 *   );
 * }
 * ```
 */

import { createSignal, createEffect, onMount, type Accessor } from 'solid-js';
import { createLogger } from '../lib/logger';

const logger = createLogger('useTipsWarmup');

// ============================================================================
// Types
// ============================================================================

export type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

export interface WarmupStatus {
  /** Tab type being warmed up */
  tab: TabType;
  /** Whether warmup is in progress */
  loading: boolean;
  /** Whether warmup completed successfully */
  success: boolean;
  /** Error if warmup failed */
  error?: string;
  /** Timestamp when warmup completed */
  completedAt?: number;
}

export interface UseTipsWarmupResult {
  /** Whether the current tab cache is warmed up */
  isWarmedUp: Accessor<boolean>;
  /** Status of all warmup operations */
  warmupStatus: Accessor<Record<TabType, WarmupStatus>>;
  /** Manually trigger warmup for specific tabs */
  warmupTabs: (tabs: TabType[]) => Promise<void>;
  /** Check if a specific tab is warmed up */
  isTabWarmedUp: (tab: TabType) => boolean;
  /** Clear warmup status (useful for profile changes) */
  clearStatus: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Tab prediction map - predicts which tabs users will likely visit next.
 * Mirrors the backend prediction in tip-cache.ts
 */
const TAB_PREDICTION: Record<TabType, TabType[]> = {
  profile: ['goals', 'jobs'],
  goals: ['budget', 'swipe'],
  budget: ['jobs', 'trade'],
  trade: ['budget'],
  jobs: ['swipe', 'budget'],
  swipe: ['goals', 'jobs'],
};

/** Warmup timeout in milliseconds */
const WARMUP_TIMEOUT_MS = 5000;

/** Debounce time before prefetching predicted tabs */
const PREFETCH_DEBOUNCE_MS = 500;

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for warming up Bruno tips cache.
 *
 * @param profileIdAccessor - Reactive accessor for profile ID
 * @param currentTab - Current tab being viewed
 * @param options - Optional configuration
 * @returns Warmup status and controls
 */
export function useTipsWarmup(
  profileIdAccessor: Accessor<string | undefined>,
  currentTab: TabType,
  options: {
    /** Skip automatic warmup on mount */
    skipAutoWarmup?: boolean;
    /** Skip prefetching predicted tabs */
    skipPrefetch?: boolean;
    /** Custom context data to send with warmup */
    contextData?: Record<string, unknown>;
  } = {}
): UseTipsWarmupResult {
  // Status tracking
  const [warmupStatus, setWarmupStatus] = createSignal<Record<TabType, WarmupStatus>>(
    {} as Record<TabType, WarmupStatus>
  );

  // Track if current tab is warmed up
  const isWarmedUp = () => {
    const status = warmupStatus()[currentTab];
    return status?.success === true;
  };

  // Check if specific tab is warmed up
  const isTabWarmedUp = (tab: TabType): boolean => {
    const status = warmupStatus()[tab];
    return status?.success === true;
  };

  // Update status for a tab
  const updateStatus = (tabType: TabType, update: Partial<WarmupStatus>) => {
    setWarmupStatus((prev) => {
      const existing = prev[tabType] || { tab: tabType, loading: false, success: false };
      return {
        ...prev,
        [tabType]: {
          ...existing,
          ...update,
        },
      };
    });
  };

  // Warmup a single tab
  const warmupTab = async (tab: TabType): Promise<boolean> => {
    const profileId = profileIdAccessor();
    if (!profileId) {
      logger.debug('No profile ID, skipping warmup', { tab });
      return false;
    }

    // Check if already warmed up recently (within 5 minutes)
    const existing = warmupStatus()[tab];
    if (existing?.success && existing.completedAt) {
      const age = Date.now() - existing.completedAt;
      if (age < 5 * 60 * 1000) {
        logger.debug('Tab already warmed up recently', { tab, ageMs: age });
        return true;
      }
    }

    // Mark as loading
    updateStatus(tab, { loading: true, success: false, error: undefined });

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WARMUP_TIMEOUT_MS);

      const response = await fetch('/api/tab-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabType: tab,
          profileId,
          contextData: options.contextData || {},
          options: {
            enableFullOrchestration: true,
            timeoutMs: WARMUP_TIMEOUT_MS,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Mark as success
      updateStatus(tab, {
        loading: false,
        success: true,
        completedAt: Date.now(),
      });

      logger.debug('Tab warmed up successfully', { tab, profileId });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updateStatus(tab, {
        loading: false,
        success: false,
        error: errorMessage,
      });

      // Don't log abort errors (normal timeout behavior)
      if (errorMessage !== 'The operation was aborted') {
        logger.warn('Tab warmup failed', { tab, error: errorMessage });
      }
      return false;
    }
  };

  // Warmup multiple tabs in parallel
  const warmupTabs = async (tabs: TabType[]): Promise<void> => {
    const profileId = profileIdAccessor();
    if (!profileId) {
      logger.debug('No profile ID, skipping bulk warmup');
      return;
    }

    // Filter out tabs that are already warmed up
    const tabsToWarmup = tabs.filter((tab) => !isTabWarmedUp(tab));

    if (tabsToWarmup.length === 0) {
      logger.debug('All tabs already warmed up', { tabs });
      return;
    }

    logger.debug('Warming up tabs', { tabs: tabsToWarmup });

    // Warmup in parallel (non-blocking)
    await Promise.allSettled(tabsToWarmup.map(warmupTab));
  };

  // Clear all status
  const clearStatus = () => {
    setWarmupStatus({} as Record<TabType, WarmupStatus>);
  };

  // Auto-warmup on mount
  onMount(() => {
    if (options.skipAutoWarmup) return;

    const profileId = profileIdAccessor();
    if (!profileId) return;

    // Warmup current tab immediately
    warmupTab(currentTab);

    // Prefetch predicted tabs after debounce
    if (!options.skipPrefetch) {
      const predictedTabs = TAB_PREDICTION[currentTab] || [];
      if (predictedTabs.length > 0) {
        setTimeout(() => {
          warmupTabs(predictedTabs);
        }, PREFETCH_DEBOUNCE_MS);
      }
    }
  });

  // Re-warmup when profile ID changes
  createEffect(() => {
    const profileId = profileIdAccessor();
    if (!profileId) {
      clearStatus();
      return;
    }

    // Clear status for new profile
    const existingStatus = warmupStatus();
    if (Object.keys(existingStatus).length > 0) {
      // Only clear if we have old status
      clearStatus();
      // Re-trigger warmup for current tab
      warmupTab(currentTab);
    }
  });

  return {
    isWarmedUp,
    warmupStatus,
    warmupTabs,
    isTabWarmedUp,
    clearStatus,
  };
}

export default useTipsWarmup;
