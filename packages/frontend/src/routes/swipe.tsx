/**
 * Swipe Page (swipe.tsx)
 *
 * Standalone page for Swipe Scenarios - the key decision-making feature.
 * Elevated from a tab in /plan to its own route for better visibility.
 *
 * Phase 2 of navigation restructure.
 */

import { Show, Suspense, lazy, createMemo, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useProfile } from '~/lib/profileContext';
import { profileService } from '~/lib/profileService';
import { Card } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import { goalService } from '~/lib/goalService';
import { setGoalAchieved } from '~/lib/goalAchievementStore';
import { createLogger } from '~/lib/logger';
import { Dices, ShoppingBag, Briefcase, Pause, Heart } from 'lucide-solid';
import { goalAchieved } from '~/lib/goalAchievementStore';
import { VictoryBanner } from '~/components/ui/VictoryBanner';

const logger = createLogger('SwipePage');

// Lazy load SwipeTab component and import Scenario type
const SwipeTab = lazy(() =>
  import('~/components/tabs/SwipeTab').then((m) => ({ default: m.SwipeTab }))
);

// Import Scenario type for proper typing
import type { Scenario } from '~/components/tabs/SwipeTab';

// Skeleton for lazy loading
function SwipeSkeleton() {
  return (
    <div class="space-y-6 animate-in fade-in duration-200">
      <div class="h-10 w-64 bg-muted rounded-lg animate-pulse" />
      <div class="h-80 bg-muted rounded-xl animate-pulse" />
      <div class="h-48 bg-muted rounded-xl animate-pulse" />
    </div>
  );
}

export default function SwipePage() {
  const navigate = useNavigate();
  const { profile, skills, inventory, lifestyle, trades, leads, loading, refreshProfile } =
    useProfile();

  // Derived state
  const activeProfile = () => profile();
  const isLoading = () => loading();
  const hasProfile = () => !!activeProfile()?.id;

  // Set goal-achievement store (hides tips + content when goal reached)
  createEffect(() => {
    const p = activeProfile();
    if (!p?.id) return;
    const currentAmount = Number(p.followupData?.currentAmount || 0);
    goalService
      .listGoals(p.id, { status: 'active' })
      .then((goals) => {
        const achievedGoal = goals.find(
          (g) => g.progress >= 100 || (g.amount > 0 && currentAmount >= g.amount)
        );
        if (achievedGoal) {
          let days: number | null = null;
          if (achievedGoal.createdAt) {
            const start = new Date(achievedGoal.createdAt);
            days = Math.max(1, Math.ceil((Date.now() - start.getTime()) / 86_400_000));
          }
          setGoalAchieved(true, days);
        }
      })
      .catch(() => {});
  });

  // Access control: Check if user has content to swipe (Pull Architecture)
  const swipeAccess = createMemo(() => {
    const t = trades();
    const l = leads();
    const ls = lifestyle();

    // Check each source
    const hasSellableItems = t.some((item) => item.type === 'sell' && item.status !== 'completed');
    const hasInterestedLeads = l.some((lead) => lead.status === 'interested');
    const hasPausableExpenses = ls.some((item) => item.currentCost > 0 && !item.pausedMonths);
    const hasKarmaItems = t.some(
      (item) =>
        (item.type === 'trade' || item.type === 'lend' || item.type === 'borrow') &&
        item.status !== 'completed'
    );

    const canAccess =
      hasSellableItems || hasInterestedLeads || hasPausableExpenses || hasKarmaItems;

    // Build helpful message
    const sources: string[] = [];
    if (hasSellableItems) sources.push('sellable items');
    if (hasInterestedLeads) sources.push('saved jobs');
    if (hasPausableExpenses) sources.push('pausable subscriptions');
    if (hasKarmaItems) sources.push('trade/lend/borrow items');

    return {
      canAccess,
      hasSellableItems,
      hasInterestedLeads,
      hasPausableExpenses,
      hasKarmaItems,
      sources,
      message: canAccess
        ? `Ready to swipe: ${sources.join(', ')}`
        : 'Add items to sell, save job listings, or add subscriptions to pause before swiping!',
    };
  });

  // Build props for SwipeTab from ProfileContext (Pull Architecture)
  const swipeProps = () => {
    const p = activeProfile();
    if (!p) return null;

    // Calculate goal context for urgency calculations
    const goalAmount = p.goalAmount || 0;
    const currentAmount =
      (p.followupData as { currentAmount?: number } | undefined)?.currentAmount || 0;
    const remainingAmount = Math.max(0, goalAmount - currentAmount);
    const daysToGoal = p.goalDeadline
      ? Math.ceil((new Date(p.goalDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 30;

    // Get existing missions to filter out items that already have active missions
    const followupData = p.followupData as
      | { missions?: Array<{ source?: string; sourceId?: string; status?: string }> }
      | undefined;
    const existingMissions = followupData?.missions || [];
    // Only exclude items with active or completed missions (not skipped)
    const missionSourceIds = new Set(
      existingMissions.filter((m) => m.status !== 'skipped').map((m) => `${m.source}_${m.sourceId}`)
    );

    return {
      // Skills are kept for job matching (Phase 5), not for scenario generation
      skills: skills().map((s) => ({
        name: s.name,
        hourlyRate: s.hourlyRate,
      })),

      // Trades with full type/status for filtering (Pull Architecture)
      // Filter out trades that already have missions
      trades: trades()
        .filter((t) => !missionSourceIds.has(`trade_${t.id}`))
        .map((t) => ({
          id: t.id,
          type: t.type,
          name: t.name,
          value: t.value,
          status: t.status,
        })),

      // Lifestyle items with id for tracking
      // Filter out lifestyle items that already have missions
      lifestyle: lifestyle()
        .filter((l) => !missionSourceIds.has(`lifestyle_${l.id}`))
        .map((l) => ({
          id: l.id,
          name: l.name,
          currentCost: l.currentCost,
          pausedMonths: l.pausedMonths,
          category: l.category,
        })),

      // Filter leads to only include "interested" ones that don't have missions
      leads: leads().filter(
        (l) => l.status === 'interested' && !missionSourceIds.has(`prospection_${l.id}`)
      ),

      // Goal context for urgency calculations
      goalContext: {
        goalAmount,
        currentAmount,
        remainingAmount,
        daysToGoal,
        weeksRemaining: Math.ceil(daysToGoal / 7),
        today: new Date(),
      },

      currency: p.currency,
      profileId: p.id,
      initialPreferences: p.swipePreferences
        ? {
            effortSensitivity: p.swipePreferences.effort_sensitivity ?? 0.5,
            hourlyRatePriority: p.swipePreferences.hourly_rate_priority ?? 0.5,
            timeFlexibility: p.swipePreferences.time_flexibility ?? 0.5,
            incomeStability: p.swipePreferences.income_stability ?? 0.5,
          }
        : undefined,
    };
  };

  // Handle preferences change - save to profile
  const handlePreferencesChange = async (prefs: {
    effortSensitivity: number;
    hourlyRatePriority: number;
    timeFlexibility: number;
    incomeStability: number;
  }) => {
    const p = activeProfile();
    if (!p?.id || !p?.name) return;

    try {
      await profileService.patchProfile(p.id, {
        swipePreferences: {
          effort_sensitivity: prefs.effortSensitivity,
          hourly_rate_priority: prefs.hourlyRatePriority,
          time_flexibility: prefs.timeFlexibility,
          income_stability: prefs.incomeStability,
        },
      });
      logger.info('Swipe preferences saved');
    } catch (error) {
      logger.error('Failed to save swipe preferences', { error });
    }
  };

  // Handle scenarios selected - save to profile and navigate to progress page
  const handleScenariosSelected = async (scenarios: Scenario[]) => {
    const p = activeProfile();
    if (!p?.id || !p?.name) {
      logger.error('Cannot save scenarios: no active profile');
      return;
    }

    logger.info('Scenarios selected', { count: scenarios.length });

    // Save selected scenarios to profile.planData.selectedScenarios
    // This is what the Progress page reads to create missions
    try {
      const currentPlanData = (p.planData || {}) as Record<string, unknown>;
      const updatedPlanData = {
        ...currentPlanData,
        selectedScenarios: scenarios.map((s) => ({
          id: s.id,
          title: s.title,
          description: s.description,
          category: s.category,
          // Financial data (new format)
          weeklyHours: s.weeklyHours,
          weeklyEarnings: s.weeklyEarnings,
          oneTimeAmount: s.oneTimeAmount,
          monthlyAmount: s.monthlyAmount,
          hourlyRate: s.hourlyRate,
          // Metadata
          effortLevel: s.effortLevel,
          flexibilityScore: s.flexibilityScore,
          source: s.source,
          sourceId: s.sourceId,
          leadId: s.leadId,
          // Karma
          karmaPoints: s.karmaPoints,
        })),
      };

      await profileService.patchProfile(p.id, {
        planData: updatedPlanData,
      });
      logger.info('Selected scenarios saved to profile');

      // Refresh profile to get updated data
      await refreshProfile({ silent: true });

      // Navigate to progress page after completing swipe session
      if (scenarios.length > 0) {
        navigate('/progress');
      }
    } catch (error) {
      logger.error('Failed to save selected scenarios', { error });
    }
  };

  // No profile view - prompt to complete onboarding (consistent with me.tsx and progress.tsx)
  const NoProfileView = () => (
    <div class="h-[60vh] flex items-center justify-center">
      <Card class="text-center py-12 px-8 max-w-md mx-auto">
        <div class="text-4xl mb-4">👋</div>
        <h2 class="text-xl font-bold text-foreground mb-2">No profile yet</h2>
        <p class="text-muted-foreground mb-6">
          Complete the onboarding first to create your profile
        </p>
        <a
          href="/"
          class="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          Start onboarding
        </a>
      </Card>
    </div>
  );

  // Loading view
  const LoadingView = () => (
    <div class="flex items-center justify-center min-h-[60vh]">
      <div class="text-center">
        <div class="animate-spin w-10 h-10 border-3 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p class="text-muted-foreground">Loading your data...</p>
      </div>
    </div>
  );

  // Empty state - nothing to swipe yet (Pull Architecture access control)
  const EmptySwipeView = () => (
    <div class="h-[60vh] flex items-center justify-center">
      <Card class="text-center py-12 px-8 max-w-md mx-auto">
        <div class="text-5xl mb-4">🎲</div>
        <h2 class="text-xl font-bold text-foreground mb-2">Nothing to swipe yet</h2>
        <p class="text-muted-foreground mb-6">{swipeAccess().message}</p>

        <div class="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            class="flex items-center justify-center gap-2"
            onClick={() => navigate('/me?tab=trade')}
          >
            <ShoppingBag class="h-4 w-4" />
            Add items to sell
          </Button>
          <Button
            class="flex items-center justify-center gap-2"
            onClick={() => navigate('/me?tab=jobs')}
          >
            <Briefcase class="h-4 w-4" />
            Find jobs
          </Button>
          <Button
            variant="outline"
            class="flex items-center justify-center gap-2"
            onClick={() => navigate('/me?tab=budget')}
          >
            <Pause class="h-4 w-4" />
            Pause subscriptions
          </Button>
          <Button
            variant="outline"
            class="flex items-center justify-center gap-2"
            onClick={() => navigate('/me?tab=trade')}
          >
            <Heart class="h-4 w-4" />
            Lend or trade
          </Button>
        </div>
      </Card>
    </div>
  );

  return (
    <Show when={!isLoading()} fallback={<LoadingView />}>
      <Show when={hasProfile()} fallback={<NoProfileView />}>
        <div class="flex flex-col h-full space-y-6">
          {/* Page Header */}
          <div class="sticky top-0 z-10 -mx-4 md:-mx-6 px-4 md:px-6 py-4 bg-background/80 backdrop-blur-xl border-b border-border/50 space-y-3">
            <h1 class="text-xl font-bold text-foreground flex items-center gap-2">
              <Dices class="h-6 w-6 text-primary" />
              Swipe Scenarios
            </h1>
            <BrunoHintV2
              tabType="swipe"
              profileId={activeProfile()?.id}
              contextData={{
                preferences: activeProfile()?.swipePreferences,
                scenariosCount: swipeProps()?.skills?.length || 0,
              }}
              fallbackMessage="Swipe right on strategies you like, left on those you don't. I'll learn your preferences!"
              compact
            />
          </div>

          {/* Victory Banner */}
          <VictoryBanner />

          {/* Content — hidden when goal achieved */}
          <Show when={!goalAchieved()}>
            <Show when={swipeAccess().canAccess} fallback={<EmptySwipeView />}>
              <Show when={swipeProps()}>
                {(props) => (
                  <Suspense fallback={<SwipeSkeleton />}>
                    <SwipeTab
                      {...props()}
                      onPreferencesChange={handlePreferencesChange}
                      onScenariosSelected={handleScenariosSelected}
                    />
                  </Suspense>
                )}
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </Show>
  );
}
