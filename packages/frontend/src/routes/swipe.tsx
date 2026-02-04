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
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { createLogger } from '~/lib/logger';
import { Dices, ArrowRight } from 'lucide-solid';

const logger = createLogger('SwipePage');

// Lazy load SwipeTab component
const SwipeTab = lazy(() =>
  import('~/components/tabs/SwipeTab').then((m) => ({ default: m.SwipeTab }))
);

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

  // Build props for SwipeTab from ProfileContext
  const swipeProps = () => {
    const p = activeProfile();
    if (!p) return null;

    return {
      skills: skills().map((s) => ({
        name: s.name,
        hourlyRate: s.hourlyRate,
      })),
      items: inventory().map((i) => ({
        name: i.name,
        estimatedValue: i.estimatedValue,
      })),
      lifestyle: lifestyle().map((l) => ({
        name: l.name,
        currentCost: l.currentCost,
        pausedMonths: l.pausedMonths,
      })),
      trades: trades().map((t) => ({
        name: t.name,
        value: t.value,
      })),
      // Filter leads to only include "interested" ones for Swipe scenarios
      leads: leads().filter((l) => l.status === 'interested'),
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

  // Handle scenarios selected - navigate to progress page
  const handleScenariosSelected = (scenarios: unknown[]) => {
    logger.info('Scenarios selected', { count: scenarios.length });
    // Refresh profile to get updated missions
    refreshProfile({ silent: true });
    // Navigate to progress page after completing swipe session
    if (scenarios.length > 0) {
      navigate('/progress');
    }
  };

  // No profile view - prompt to complete onboarding
  const NoProfileView = () => (
    <div class="flex items-center justify-center min-h-[60vh]">
      <Card class="p-8 text-center max-w-md">
        <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Dices class="h-8 w-8 text-primary" />
        </div>
        <h2 class="text-xl font-bold text-foreground mb-2">Set up your profile first</h2>
        <p class="text-muted-foreground mb-6">
          Complete your profile to unlock personalized swipe scenarios based on your skills and
          situation.
        </p>
        <Button as="a" href="/me">
          Go to Profile
          <ArrowRight class="h-4 w-4 ml-2" />
        </Button>
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
    <div class="container mx-auto px-4 py-6 max-w-4xl">
      {/* Page Header */}
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-foreground flex items-center gap-3">
          <div class="p-2 rounded-lg bg-primary/10">
            <Dices class="h-6 w-6 text-primary" />
          </div>
          Swipe Scenarios
        </h1>
        <p class="text-muted-foreground mt-1">
          Discover personalized earning opportunities based on your profile
        </p>
      </div>

      {/* Content */}
      <Show when={!isLoading()} fallback={<LoadingView />}>
        <Show when={hasProfile()} fallback={<NoProfileView />}>
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
  );
}
