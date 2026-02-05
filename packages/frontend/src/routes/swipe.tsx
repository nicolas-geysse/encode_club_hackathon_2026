/**
 * Swipe Page (swipe.tsx)
 *
 * Standalone page for Swipe Scenarios - the key decision-making feature.
 * Elevated from a tab in /plan to its own route for better visibility.
 *
 * Phase 2 of navigation restructure.
 */

import { Show, Suspense, lazy } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { useProfile } from '~/lib/profileContext';
import { profileService } from '~/lib/profileService';
import { Card } from '~/components/ui/Card';
import { BrunoHintV2 } from '~/components/ui/BrunoHintV2';
import { createLogger } from '~/lib/logger';
import { Dices } from 'lucide-solid';

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

    return {
      // Skills are kept for job matching (Phase 5), not for scenario generation
      skills: skills().map((s) => ({
        name: s.name,
        hourlyRate: s.hourlyRate,
      })),

      // Trades with full type/status for filtering (Pull Architecture)
      trades: trades().map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        value: t.value,
        status: t.status,
      })),

      // Lifestyle items with id for tracking
      lifestyle: lifestyle().map((l) => ({
        id: l.id,
        name: l.name,
        currentCost: l.currentCost,
        pausedMonths: l.pausedMonths,
        category: l.category,
      })),

      // Filter leads to only include "interested" ones
      leads: leads().filter((l) => l.status === 'interested'),

      // Goal context for urgency calculations
      goalContext: {
        goalAmount,
        currentAmount,
        remainingAmount,
        daysToGoal,
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
      await profileService.saveProfile(
        {
          ...p,
          swipePreferences: {
            effort_sensitivity: prefs.effortSensitivity,
            hourly_rate_priority: prefs.hourlyRatePriority,
            time_flexibility: prefs.timeFlexibility,
            income_stability: prefs.incomeStability,
          },
        },
        { setActive: false }
      );
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

      await profileService.saveProfile(
        {
          ...p,
          planData: updatedPlanData,
        },
        { setActive: false }
      );
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

          {/* Content */}
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
        </div>
      </Show>
    </Show>
  );
}
