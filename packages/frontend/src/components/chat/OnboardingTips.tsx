/**
 * Onboarding Tips Component
 *
 * Displays context-aware tips in the onboarding sidebar.
 * Adapted from BrunoTips for narrower sidebar layout.
 *
 * Features:
 * - Step-aware tip selection
 * - Manual refresh button
 * - PlasmaAvatar integration
 * - Extensible via tip rules configuration
 */

import { createSignal, createMemo, Show, createEffect } from 'solid-js';
import {
  RefreshCw,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Target,
  Zap,
  Trophy,
  Loader2,
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import type { FullProfile } from '~/lib/profileService';
import type { OnboardingStep } from '~/lib/chat/types';
import {
  type TipCategory,
  type TipRule,
  type OnboardingContext,
  getRandomTipForContext,
  getTipsForContext,
} from '~/config/onboardingTipRules';

// =============================================================================
// Types
// =============================================================================

interface OnboardingTipsProps {
  /** Current onboarding step */
  currentStep: OnboardingStep;
  /** Accumulated profile data during onboarding */
  profileData: Partial<FullProfile>;
  /** Whether onboarding is complete */
  isComplete: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const CATEGORY_CONFIG: Record<TipCategory, { icon: typeof Lightbulb; color: string; bg: string }> =
  {
    energy: {
      icon: Zap,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-500/10',
    },
    progress: {
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-500/10',
    },
    mission: {
      icon: Target,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10',
    },
    opportunity: {
      icon: Lightbulb,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-500/10',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10',
    },
    celebration: {
      icon: Trophy,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
  };

// =============================================================================
// Component
// =============================================================================

export function OnboardingTips(props: OnboardingTipsProps) {
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [refreshCount, setRefreshCount] = createSignal(0);

  // Get the current tip based on step and profile
  const currentTip = createMemo((): TipRule | null => {
    // Force recalculation on refresh
    refreshCount();

    const context = props.currentStep as OnboardingContext;
    return getRandomTipForContext(context, props.profileData);
  });

  // Check if there are multiple tips available for cycling
  const hasMultipleTips = createMemo(() => {
    const context = props.currentStep as OnboardingContext;
    return getTipsForContext(context, props.profileData).length > 1;
  });

  // Handle refresh button click
  const handleRefresh = () => {
    if (isRefreshing() || !hasMultipleTips()) return;

    setIsRefreshing(true);
    // Small delay for visual feedback
    setTimeout(() => {
      setRefreshCount((c) => c + 1);
      setIsRefreshing(false);
    }, 300);
  };

  // Reset refresh count when step changes
  createEffect(() => {
    // Track step changes - accessing the prop creates the dependency
    const _step = props.currentStep;
    void _step; // Explicitly mark as intentionally unused
    setRefreshCount(0);
  });

  const tip = () => currentTip();
  const config = () => (tip() ? CATEGORY_CONFIG[tip()!.tip.category] : CATEGORY_CONFIG.opportunity);
  const TipIcon = () => {
    const Icon = config().icon;
    return <Icon class={cn('h-4 w-4', config().color)} />;
  };

  return (
    <Show when={tip()}>
      <div
        class={cn(
          'w-full rounded-lg border p-3',
          'bg-gradient-to-r from-primary/5 to-primary/10',
          'border-primary/20'
        )}
      >
        {/* Header row with icon, title, and refresh */}
        <div class="flex items-start gap-2">
          {/* Category Icon */}
          <div class="flex-shrink-0 mt-0.5">
            <Show
              when={!isRefreshing()}
              fallback={
                <div class={cn('p-1.5 rounded-lg', config().bg)}>
                  <Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <div class={cn('p-1.5 rounded-lg', config().bg)}>
                <TipIcon />
              </div>
            </Show>
          </div>

          {/* Title and message */}
          <div class="flex-1 min-w-0">
            <h4 class="font-semibold text-foreground text-sm truncate">{tip()!.tip.title}</h4>
            <p class="text-xs text-muted-foreground mt-1 line-clamp-3">{tip()!.tip.message}</p>
          </div>

          {/* Refresh button - only show if multiple tips available */}
          <Show when={hasMultipleTips()}>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing()}
              class={cn(
                'flex-shrink-0 p-1.5 rounded-md transition-all duration-200',
                'hover:bg-primary/10 text-muted-foreground hover:text-primary',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              title="Get another tip"
            >
              <RefreshCw class={cn('h-3.5 w-3.5', isRefreshing() && 'animate-spin')} />
            </button>
          </Show>
        </div>

        {/* Action button if present */}
        <Show when={tip()!.tip.action}>
          <div class="mt-2 pt-2 border-t border-border/30">
            <Show
              when={tip()!.tip.action!.href}
              fallback={
                <span class="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  {tip()!.tip.action!.label}
                </span>
              }
            >
              <a
                href={tip()!.tip.action!.href}
                class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {tip()!.tip.action!.label} →
              </a>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}

export default OnboardingTips;
