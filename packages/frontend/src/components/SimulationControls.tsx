/**
 * SimulationControls Component
 *
 * Footer component for time simulation controls.
 * Features:
 * - Shows current simulated date when simulating
 * - Shows DAY X/Y based on goal deadline
 * - Advance buttons: +1d, +7d, +30d
 * - Reset button
 * - Daily check-in tracking (once per real day, stored in localStorage)
 *
 * The simulation state is stored in DuckDB and tracked in Opik traces.
 */

import { createSignal, Show, onMount, createMemo, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { simulationService } from '~/lib/simulationService';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import {
  Timer,
  X,
  RotateCcw,
  Settings,
  Clock,
  Sparkles,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Bot,
} from 'lucide-solid';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';

// Export SimulationState type for use in app.tsx
export interface SimulationState {
  simulatedDate: string;
  realDate: string;
  offsetDays: number;
  isSimulating: boolean;
}

interface GoalInfo {
  deadline: string;
  name: string;
  amount: number;
}

interface Props {
  onSimulationChange?: (state: SimulationState) => void;
  compact?: boolean;
}

const LAST_CHECKIN_KEY = 'stride_last_daily_checkin';

interface DailyTip {
  greeting?: string;
  title: string;
  message: string;
  isAI: boolean;
  traceId?: string;
  agentsUsed?: string[];
  durationMs?: number;
  todaysFocus?: string;
  quickStats?: { label: string; value: string; trend?: 'up' | 'down' | 'stable' }[];
  action?: { label: string; href: string };
  priority?: string;
}

export function SimulationControls(props: Props) {
  const [state, setState] = createSignal<SimulationState>({
    simulatedDate: new Date().toISOString().split('T')[0],
    realDate: new Date().toISOString().split('T')[0],
    offsetDays: 0,
    isSimulating: false,
  });
  const [loading, setLoading] = createSignal(true);
  const [expanded, setExpanded] = createSignal(false);
  const [showDailyCheckin, setShowDailyCheckin] = createSignal(false);
  const [goalInfo, setGoalInfo] = createSignal<GoalInfo | null>(null);
  const [dailyTip, setDailyTip] = createSignal<DailyTip | null>(null);
  const [loadingTip, setLoadingTip] = createSignal(false);
  const [feedbackGiven, setFeedbackGiven] = createSignal<'up' | 'down' | null>(null);
  const [showAgentDetails, setShowAgentDetails] = createSignal(false);

  // Calculate days elapsed and remaining based on goal
  const daysInfo = createMemo(() => {
    const goal = goalInfo();
    const sim = state();

    if (!goal?.deadline) {
      // Default to 56 days (8 weeks) from start
      return {
        currentDay: sim.offsetDays + 1,
        totalDays: 56,
        daysRemaining: 56 - sim.offsetDays,
        hasGoal: false,
      };
    }

    // Calculate based on real goal deadline
    const startDate = new Date(sim.realDate);
    const simulatedDate = new Date(sim.simulatedDate);
    const deadline = new Date(goal.deadline);

    // Days from start to deadline
    const totalDays = Math.max(
      1,
      Math.ceil((deadline.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    // Days elapsed (simulated)
    const currentDay = Math.min(totalDays, sim.offsetDays + 1);
    // Days remaining from simulated date to deadline
    const daysRemaining = Math.max(
      0,
      Math.ceil((deadline.getTime() - simulatedDate.getTime()) / (1000 * 60 * 60 * 24))
    );

    return {
      currentDay,
      totalDays,
      daysRemaining,
      hasGoal: true,
      goalName: goal.name,
      goalAmount: goal.amount,
    };
  });

  // Load simulation state and goal info on mount
  onMount(async () => {
    await Promise.all([loadState(), loadGoalInfo()]);
    checkDailyCheckin();
  });

  // Load active profile's goal info
  const loadGoalInfo = async () => {
    try {
      const response = await fetch('/api/profiles?active=true');
      if (response.ok) {
        const profile = await response.json();
        if (profile?.goalDeadline) {
          setGoalInfo({
            deadline: profile.goalDeadline,
            name: profile.goalName || 'Goal',
            amount: profile.goalAmount || 0,
          });
        }
      }
    } catch (error) {
      console.error('Error loading goal info:', error);
    }
  };

  const loadState = async () => {
    setLoading(true);
    try {
      const simState = await simulationService.getSimulationState();
      setState(simState);
      props.onSimulationChange?.(simState);
    } catch (error) {
      console.error('Error loading simulation state:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if we need to show daily check-in
  // Only shows once per REAL day, not simulated day
  const checkDailyCheckin = () => {
    const today = new Date().toISOString().split('T')[0]; // Real date
    const lastCheckin = localStorage.getItem(LAST_CHECKIN_KEY);

    if (lastCheckin !== today) {
      // It's a new real day - show check-in prompt (only if not first visit)
      const hasProfile =
        localStorage.getItem('studentProfile') || localStorage.getItem('stride_has_visited');
      if (hasProfile) {
        setShowDailyCheckin(true);
        // Fetch daily tip
        fetchDailyTip();
      }
      // Mark that we've visited today
      localStorage.setItem('stride_has_visited', 'true');
    }
  };

  const fetchDailyTip = async (simulatedDate?: string) => {
    setLoadingTip(true);
    setFeedbackGiven(null);
    setShowAgentDetails(false);
    try {
      const profileData = localStorage.getItem('studentProfile');
      if (!profileData) {
        setDailyTip({
          title: 'Welcome!',
          message: 'Set up your profile to get personalized tips.',
          isAI: false,
        });
        return;
      }

      const profile = JSON.parse(profileData);

      // Build rich context for daily briefing
      const goal = goalInfo();
      const goalProgress =
        goal?.amount && profile.currentAmount
          ? Math.round((profile.currentAmount / goal.amount) * 100)
          : 0;

      // Get missions from profile if available
      const activeMissions = (profile.missions || [])
        .filter((m: { status?: string }) => m.status === 'active')
        .map(
          (m: {
            id: string;
            title: string;
            category?: string;
            weeklyHours?: number;
            weeklyEarnings?: number;
            progress?: number;
          }) => ({
            id: m.id,
            title: m.title,
            category: m.category || 'other',
            weeklyHours: m.weeklyHours || 0,
            weeklyEarnings: m.weeklyEarnings || 0,
            progress: m.progress || 0,
          })
        );

      // Build energy history (use stored or default)
      const energyHistory = profile.energyHistory || [profile.energyLevel || 70];

      const response = await fetch('/api/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: profile.id || 'default',
          currentEnergy: profile.energyLevel || 70,
          energyHistory,
          goalProgress,
          goalAmount: goal?.amount,
          currentAmount: profile.currentAmount || 0,
          goalDeadline: goal?.deadline,
          goalName: goal?.name,
          activeMissions,
          upcomingDeadlines: profile.upcomingDeadlines || [],
          recentAchievements: profile.recentAchievements || [],
          currentDate: simulatedDate,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setDailyTip({
          greeting: data.briefing.greeting,
          title: data.briefing.title,
          message: data.briefing.message,
          isAI: data.processingInfo?.agentsUsed?.length > 0,
          traceId: data.traceId,
          agentsUsed: data.processingInfo?.agentsUsed || [],
          durationMs: data.processingInfo?.durationMs,
          todaysFocus: data.briefing.todaysFocus,
          quickStats: data.briefing.quickStats,
          action: data.briefing.action,
          priority: data.briefing.priority,
        });
      } else {
        throw new Error('Failed to fetch briefing');
      }
    } catch (error) {
      console.error('[DailyBriefing] Failed to fetch:', error);
      setDailyTip({
        greeting: 'Good day',
        title: 'New day!',
        message: 'Ready to reach your goals?',
        isAI: false,
      });
    } finally {
      setLoadingTip(false);
    }
  };

  // Send feedback to Opik via API
  const handleFeedback = async (isHelpful: boolean) => {
    const tip = dailyTip();
    if (!tip?.traceId) return;

    const vote = isHelpful ? 'up' : 'down';
    setFeedbackGiven(vote);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: tip.traceId,
          scores: [
            {
              name: 'User feedback',
              value: isHelpful ? 1 : 0,
              reason: isHelpful
                ? 'User found this tip helpful'
                : 'User did not find this tip helpful',
            },
          ],
        }),
      });
    } catch (error) {
      console.error('[DailyTip] Feedback error:', error);
    }
  };

  const completeDailyCheckin = () => {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(LAST_CHECKIN_KEY, today);
    setShowDailyCheckin(false);
  };

  const handleAdvance = async (days: number) => {
    setLoading(true);
    try {
      const newState = await simulationService.advanceDays(days);
      setState(newState);
      props.onSimulationChange?.(newState);

      // Close dropdown and show daily tip popup after advancing simulation
      setExpanded(false);
      setShowDailyCheckin(true);
      fetchDailyTip(newState.simulatedDate);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    try {
      const newState = await simulationService.resetToRealTime();
      setState(newState);
      props.onSimulationChange?.(newState);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const formatFullDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Get current date for display (simulated or real)
  const currentDate = () => (state().isSimulating ? state().simulatedDate : state().realDate);

  // Helper to get progress percentage (reactive)
  const progressPct = () => {
    const info = daysInfo();
    return Math.round((info.currentDay / info.totalDays) * 100);
  };

  // Compact mode for header - use Show to maintain reactivity
  return (
    <>
      <Show
        when={!props.compact}
        fallback={
          <div class="relative flex items-center gap-2">
            {/* Day Counter Display */}
            <div class="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
              <span class="text-xs text-muted-foreground font-medium">DAY</span>
              <span class="text-lg font-bold text-primary">{daysInfo().currentDay}</span>
              <span class="text-muted-foreground">/</span>
              <span class="text-sm text-muted-foreground">{daysInfo().totalDays}</span>
              {/* Mini progress bar */}
              <div class="w-12 h-1.5 bg-secondary rounded-full overflow-hidden ml-1">
                <div
                  class="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct()}%` }}
                />
              </div>
            </div>

            {/* Simulation Controls Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded())}
              class={`flex items-center gap-2 h-9 px-3 rounded-full text-sm transition-colors ${
                state().isSimulating
                  ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/70'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              <Clock class="h-4 w-4" />
              {state().isSimulating ? (
                <span class="font-medium">+{state().offsetDays}d</span>
              ) : (
                <span>Simulation</span>
              )}
            </Button>

            {/* Dropdown when expanded */}
            <Show when={expanded()}>
              <Card class="absolute right-0 top-full mt-2 z-50 min-w-[280px] shadow-lg">
                <CardContent class="p-4 space-y-3">
                  <div class="text-sm text-muted-foreground mb-3">
                    {state().isSimulating ? (
                      <>
                        <div class="font-medium text-amber-800 dark:text-amber-300">
                          Simulated date: {formatDate(state().simulatedDate)}
                        </div>
                        <div class="text-xs text-muted-foreground mt-1">
                          +{state().offsetDays}d since {formatDate(state().realDate)}
                        </div>
                      </>
                    ) : (
                      <div>Today: {formatDate(state().realDate)}</div>
                    )}
                  </div>

                  <div class="flex flex-wrap gap-2 mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdvance(1)}
                      disabled={loading()}
                      class="h-8"
                    >
                      +1 day
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdvance(7)}
                      disabled={loading()}
                      class="h-8"
                    >
                      +1 week
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAdvance(30)}
                      disabled={loading()}
                      class="h-8"
                    >
                      +1 month
                    </Button>
                  </div>

                  <Show when={state().isSimulating}>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleReset}
                      disabled={loading()}
                      class="w-full"
                    >
                      <RotateCcw class="h-4 w-4 mr-2" />
                      Back to real time
                    </Button>
                  </Show>

                  {/* Click outside to close (button X) */}
                  <button
                    type="button"
                    class="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded(false)}
                  >
                    <X class="h-4 w-4" />
                  </button>
                </CardContent>
              </Card>
            </Show>
          </div>
        }
      >
        {/* Non-compact mode: Full simulation controls */}
        <>
          {/* Main simulation indicator - always visible when simulating */}
          <Show when={state().isSimulating || expanded()}>
            <div class="bg-amber-50 dark:bg-amber-900/30 border-t border-amber-200 dark:border-amber-800 px-4 py-2">
              <div class="max-w-7xl mx-auto flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <Timer class="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div class="text-sm">
                    <span class="text-amber-800 dark:text-amber-300 font-medium">
                      Simulated date: {formatDate(state().simulatedDate)}
                    </span>
                    <span class="text-amber-600 dark:text-amber-400 ml-2">
                      (+{state().offsetDays}d since {formatDate(state().realDate)})
                    </span>
                  </div>
                </div>

                <div class="flex items-center gap-2">
                  <Show when={expanded()}>
                    {/* Actions in non-compact mode */}
                    <div class="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdvance(1)}
                        disabled={loading()}
                        class="h-7 text-xs"
                      >
                        +1d
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdvance(7)}
                        disabled={loading()}
                        class="h-7 text-xs"
                      >
                        +7d
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAdvance(30)}
                        disabled={loading()}
                        class="h-7 text-xs"
                      >
                        +30d
                      </Button>
                      <Show when={state().isSimulating}>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleReset}
                          disabled={loading()}
                          class="h-7 text-xs"
                        >
                          Reset
                        </Button>
                      </Show>
                    </div>
                  </Show>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setExpanded(!expanded())}
                    class="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300"
                  >
                    <Show when={expanded()} fallback={<Settings class="h-4 w-4" />}>
                      <X class="h-4 w-4" />
                    </Show>
                  </Button>
                </div>
              </div>
            </div>
          </Show>

          {/* Simulation toggle button - shown when not simulating */}
          <Show when={!state().isSimulating && !expanded()}>
            <Button
              size="icon"
              onClick={() => setExpanded(true)}
              class="fixed bottom-4 right-4 h-12 w-12 rounded-full shadow-lg z-40"
              title="Simulation mode"
            >
              <Clock class="h-6 w-6" />
            </Button>
          </Show>
        </>
      </Show>

      {/* Daily Briefing Modal - Portal to render outside component hierarchy */}
      <Portal>
        <Show when={showDailyCheckin()}>
          <div class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <Card class="w-full max-w-md bg-card border shadow-2xl">
              <CardContent class="p-4">
                {/* Header with Avatar and Greeting */}
                <div class="flex items-start gap-3">
                  <div class="flex-shrink-0">
                    <PlasmaAvatar size={48} color="green" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h3 class="font-semibold text-foreground">
                        {loadingTip() ? 'Loading...' : dailyTip()?.title || 'Daily briefing'}
                      </h3>
                      <Show when={dailyTip()?.isAI}>
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <Sparkles class="h-3 w-3" />
                          AI
                        </span>
                      </Show>
                      {/* Agent count badge */}
                      <Show when={dailyTip()?.agentsUsed && dailyTip()!.agentsUsed!.length > 0}>
                        <button
                          onClick={() => setShowAgentDetails(!showAgentDetails())}
                          class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                          title="Click to see agent details"
                        >
                          <Bot class="h-3 w-3" />
                          {dailyTip()!.agentsUsed!.length}
                        </button>
                      </Show>
                    </div>
                    <p class="text-sm text-muted-foreground mt-0.5">
                      {dailyTip()?.greeting || 'Good day'} • {formatFullDate(currentDate())}
                    </p>
                  </div>
                </div>

                {/* Quick Stats */}
                <Show
                  when={
                    !loadingTip() && dailyTip()?.quickStats && dailyTip()!.quickStats!.length > 0
                  }
                >
                  <div class="flex items-center gap-3 mt-3 p-2 rounded-lg bg-muted/50">
                    <For each={dailyTip()!.quickStats!}>
                      {(stat) => (
                        <div class="flex-1 text-center">
                          <div class="text-lg font-bold text-foreground">
                            {stat.value}
                            <Show when={stat.trend === 'up'}>
                              <span class="text-green-500 text-xs ml-0.5">↑</span>
                            </Show>
                            <Show when={stat.trend === 'down'}>
                              <span class="text-red-500 text-xs ml-0.5">↓</span>
                            </Show>
                          </div>
                          <div class="text-[10px] text-muted-foreground uppercase tracking-wide">
                            {stat.label}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>

                {/* Briefing Message */}
                <div class="mt-3 p-3 rounded-lg bg-muted">
                  <Show when={loadingTip()}>
                    <div class="flex items-center gap-2 text-muted-foreground">
                      <Loader2 class="h-4 w-4 animate-spin" />
                      <span class="text-sm">Bruno is preparing your briefing...</span>
                    </div>
                  </Show>
                  <Show when={!loadingTip() && dailyTip()}>
                    <p class="text-sm text-foreground">{dailyTip()?.message}</p>
                    {/* Today's Focus */}
                    <Show when={dailyTip()?.todaysFocus}>
                      <div class="mt-2 pt-2 border-t border-border/50">
                        <span class="text-xs text-muted-foreground">Today's focus: </span>
                        <span class="text-xs font-medium text-primary">
                          {dailyTip()!.todaysFocus}
                        </span>
                      </div>
                    </Show>
                  </Show>
                </div>

                {/* Agent Details Panel (expandable) */}
                <Show when={showAgentDetails() && dailyTip()?.agentsUsed?.length}>
                  <div class="mt-3 p-2 rounded-lg bg-muted/50 border border-border/50">
                    <div class="flex items-center gap-2 flex-wrap text-xs">
                      <span class="text-muted-foreground">Agents:</span>
                      <For each={dailyTip()!.agentsUsed!}>
                        {(agent) => (
                          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-background text-muted-foreground">
                            <Bot class="h-3 w-3" />
                            {agent}
                          </span>
                        )}
                      </For>
                      <Show when={dailyTip()?.durationMs}>
                        <span class="text-muted-foreground ml-auto">
                          {dailyTip()!.durationMs}ms
                        </span>
                      </Show>
                    </div>
                  </div>
                </Show>

                {/* Feedback + Actions */}
                <div class="flex items-center justify-between mt-4">
                  {/* Feedback buttons */}
                  <div class="flex items-center gap-1">
                    <Show when={dailyTip()?.isAI && dailyTip()?.traceId}>
                      <Show
                        when={feedbackGiven() === null}
                        fallback={
                          <span class="text-xs text-muted-foreground">
                            {feedbackGiven() === 'up' ? '👍 Thanks!' : '👎 Noted'}
                          </span>
                        }
                      >
                        <button
                          onClick={() => handleFeedback(true)}
                          class="p-1.5 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 transition-colors"
                          title="Helpful"
                        >
                          <ThumbsUp class="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleFeedback(false)}
                          class="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                          title="Not helpful"
                        >
                          <ThumbsDown class="h-4 w-4" />
                        </button>
                      </Show>
                    </Show>
                  </div>

                  {/* Action buttons */}
                  <div class="flex items-center gap-2">
                    <Button variant="outline" onClick={completeDailyCheckin}>
                      Got it!
                    </Button>
                    <Show
                      when={dailyTip()?.action}
                      fallback={
                        <Button as="a" href="/suivi" onClick={completeDailyCheckin}>
                          View progress
                        </Button>
                      }
                    >
                      <Button as="a" href={dailyTip()!.action!.href} onClick={completeDailyCheckin}>
                        {dailyTip()!.action!.label}
                      </Button>
                    </Show>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </Show>
      </Portal>
    </>
  );
}

export default SimulationControls;
