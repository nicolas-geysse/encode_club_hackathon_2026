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
import { createLogger } from '~/lib/logger';
import { todayISO } from '~/lib/dateUtils';

const logger = createLogger('SimulationControls');

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

interface PopupMetrics {
  weeklyEarned: number;
  weeklyTarget: number;
  totalEarned: number;
  totalGoal: number;
  daysRemaining: number;
  energyLevel: number;
}

// Mood emoji options
const MOOD_OPTIONS = [
  { emoji: '😫', level: 1, label: 'Exhausted', color: 'text-red-500' },
  { emoji: '😕', level: 2, label: 'Tired', color: 'text-orange-500' },
  { emoji: '😐', level: 3, label: 'Okay', color: 'text-yellow-500' },
  { emoji: '🙂', level: 4, label: 'Good', color: 'text-green-500' },
  { emoji: '😄', level: 5, label: 'Great', color: 'text-emerald-500' },
];

const MOOD_STORAGE_KEY = 'stride_daily_mood';

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
    simulatedDate: todayISO(),
    realDate: todayISO(),
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
  const [popupMetrics, setPopupMetrics] = createSignal<PopupMetrics | null>(null);
  const [currentMood, setCurrentMood] = createSignal<number | null>(null);

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
      logger.error('Error loading goal info', { error });
    }
  };

  const loadState = async () => {
    setLoading(true);
    try {
      const simState = await simulationService.getSimulationState();
      setState(simState);
      props.onSimulationChange?.(simState);
    } catch (error) {
      logger.error('Error loading simulation state', { error });
    } finally {
      setLoading(false);
    }
  };

  // Load saved mood for today
  const loadTodaysMood = () => {
    try {
      const moodData = localStorage.getItem(MOOD_STORAGE_KEY);
      if (moodData) {
        const { date, level } = JSON.parse(moodData);
        const today = todayISO();
        if (date === today) {
          setCurrentMood(level);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  };

  // Save mood to localStorage and optionally to energy logs
  const saveMood = async (level: number) => {
    const today = todayISO();
    localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify({ date: today, level }));
    setCurrentMood(level);

    // Also log energy via API (convert 1-5 scale to percentage for consistency)
    try {
      const profileData = localStorage.getItem('studentProfile');
      if (profileData) {
        const profile = JSON.parse(profileData);
        const profileId = profile.id || 'default';
        await fetch('/api/retroplan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_energy',
            userId: profileId,
            energyLevel: level, // 1-5 scale
            date: today,
          }),
        });
      }
    } catch {
      // Silently ignore - local storage already saved
    }
  };

  // Check if we need to show daily check-in
  // Only shows once per REAL day, not simulated day
  const checkDailyCheckin = () => {
    const today = todayISO(); // Real date
    const lastCheckin = localStorage.getItem(LAST_CHECKIN_KEY);

    // Load today's mood
    loadTodaysMood();

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
      const profileId = profile.id || 'default';

      // Read followupData from localStorage as fallback
      const followupDataStr = localStorage.getItem('followupData');
      const followupData = followupDataStr ? JSON.parse(followupDataStr) : {};

      // Fetch the primary goal from API (source of truth for progress)
      let primaryGoal: {
        id: string;
        name: string;
        amount: number;
        deadline?: string;
        progress: number;
        createdAt?: string;
      } | null = null;
      try {
        const goalsResponse = await fetch(`/api/goals?profileId=${profileId}&status=active`);
        if (goalsResponse.ok) {
          const goals = await goalsResponse.json();
          if (goals && goals.length > 0) {
            primaryGoal = goals[0]; // First active goal is primary
          }
        }
      } catch {
        // Continue with goalInfo() fallback
      }

      // Fetch budget data for one-time gains (trade sales, paused savings)
      let oneTimeGains = { tradeSales: 0, tradeBorrow: 0, pausedSavings: 0 };
      try {
        const budgetResponse = await fetch(`/api/budget?profileId=${profileId}`);
        if (budgetResponse.ok) {
          const budgetData = await budgetResponse.json();
          oneTimeGains = budgetData.budget?.oneTimeGains || oneTimeGains;
        }
      } catch {
        // Continue without one-time gains
      }

      // Fetch energy logs from API to get real energy data
      let energyLevel = 70; // Default
      let energyHistory: number[] = [70];
      try {
        const energyResponse = await fetch(
          `/api/retroplan?action=get_energy_logs&userId=${profileId}`
        );
        if (energyResponse.ok) {
          const energyData = await energyResponse.json();
          if (energyData.logs && energyData.logs.length > 0) {
            // Convert 1-5 scale to percentage (1=20%, 5=100%)
            energyHistory = energyData.logs
              .slice(0, 7)
              .map((log: { energyLevel: number }) => log.energyLevel * 20);
            energyLevel = energyHistory[0] || 70;
          }
        }
      } catch {
        // Use defaults if fetch fails
      }

      // Fetch sellable items (trades with type='sell' and status='available' or 'pending')
      let sellableItems: { id: string; name: string; value: number; category?: string }[] = [];
      try {
        const tradesResponse = await fetch(`/api/trades?profileId=${profileId}`);
        if (tradesResponse.ok) {
          const trades = await tradesResponse.json();
          sellableItems = (trades || [])
            .filter(
              (t: { type: string; status: string }) =>
                t.type === 'sell' && (t.status === 'available' || t.status === 'pending')
            )
            .map((t: { id: string; name: string; value: number; description?: string }) => ({
              id: t.id,
              name: t.name,
              value: t.value || 0,
              category: t.description,
            }))
            .slice(0, 5);
        }
      } catch {
        // Continue without sellable items
      }

      // Get skills from profile's planData
      const planData = profile.planData || {};
      const skills = (planData.skills || [])
        .map((s: { name: string; hourlyRate?: number; effortLevel?: number }) => ({
          name: s.name,
          hourlyRate: s.hourlyRate || 15,
          effortLevel: s.effortLevel,
        }))
        .slice(0, 5);

      // Use API goal data or fallback to goalInfo()
      const goal = primaryGoal || goalInfo();
      const goalAmount = goal?.amount || 0;
      const goalDeadline = primaryGoal?.deadline || goalInfo()?.deadline;

      // Calculate total earned: followup savings + one-time gains (trade sales)
      const savedAmount = followupData.currentAmount || 0;
      const totalOneTimeGains =
        (oneTimeGains.tradeSales || 0) +
        (oneTimeGains.tradeBorrow || 0) +
        (oneTimeGains.pausedSavings || 0);
      const totalEarned = savedAmount + totalOneTimeGains;

      // Calculate goal progress
      const goalProgress = goalAmount > 0 ? Math.round((totalEarned / goalAmount) * 100) : 0;

      // Calculate days remaining
      let daysRemaining = 0;
      if (goalDeadline) {
        const now = simulatedDate ? new Date(simulatedDate) : new Date();
        const deadline = new Date(goalDeadline);
        daysRemaining = Math.max(
          0,
          Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );
      }

      // Calculate weeks remaining for weekly target
      const weeksRemaining = Math.max(1, Math.ceil(daysRemaining / 7));
      const remainingToSave = Math.max(0, goalAmount - totalEarned);
      const weeklyTarget = Math.ceil(remainingToSave / weeksRemaining);

      // Weekly earned: missions completed this week + portion of trade sales
      // For simplicity, show trade sales as "this week" if they're recent
      const missionEarnings = (followupData.missions || [])
        .filter((m: { status?: string }) => m.status === 'completed')
        .reduce(
          (sum: number, m: { earningsCollected?: number }) => sum + (m.earningsCollected || 0),
          0
        );
      const weeklyEarned = missionEarnings + totalOneTimeGains;

      // Set popup metrics for display
      setPopupMetrics({
        weeklyEarned,
        weeklyTarget,
        totalEarned,
        totalGoal: goalAmount,
        daysRemaining,
        energyLevel,
      });

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

      const response = await fetch('/api/daily-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId,
          currentEnergy: energyLevel,
          energyHistory,
          goalProgress,
          goalAmount,
          currentAmount: totalEarned,
          goalDeadline,
          goalName: goal?.name,
          daysRemaining,
          weeklyEarned,
          weeklyTarget,
          activeMissions,
          sellableItems,
          skills,
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
      logger.error('Failed to fetch daily briefing', { error });
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
    const vote = isHelpful ? 'up' : 'down';
    setFeedbackGiven(vote);

    // Save feedback locally even if no traceId
    logger.info('User feedback received', {
      isHelpful,
      hasTraceId: !!tip?.traceId,
      traceId: tip?.traceId,
      traceIdLength: tip?.traceId?.length || 0,
    });

    // Only send to Opik if we have a valid traceId (UUIDs are 36 chars with dashes)
    if (!tip?.traceId || tip.traceId.length < 10) {
      logger.warn('No valid traceId available for feedback - feedback saved locally only', {
        traceId: tip?.traceId,
        hint: 'The daily briefing may not have been traced. Check server logs for Opik initialization.',
      });
      return;
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: tip.traceId,
          scores: [
            {
              name: 'user_feedback',
              value: isHelpful ? 1 : 0,
              reason: isHelpful
                ? 'User found this daily briefing helpful'
                : 'User did not find this daily briefing helpful',
            },
          ],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        logger.error('Feedback API error', { status: response.status, data });
      } else {
        logger.info('Feedback sent successfully', { traceId: tip.traceId, data });
      }
    } catch (error) {
      logger.error('Failed to submit tip feedback', { error });
    }
  };

  const completeDailyCheckin = () => {
    const today = todayISO();
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

  // Compact mode for header - use Show to maintain reactivity
  return (
    <>
      <Show
        when={!props.compact}
        fallback={
          <div class="relative flex items-center gap-2">
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
              <CardContent class="p-0">
                {/* Header with Day Counter and Date */}
                <div class="p-4 pb-3 border-b border-border">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <PlasmaAvatar size={40} color="green" />
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium text-muted-foreground">Day</span>
                          <span class="text-xl font-bold text-primary">
                            {daysInfo().currentDay}
                          </span>
                        </div>
                        <p class="text-xs text-muted-foreground">{formatFullDate(currentDate())}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <Show when={dailyTip()?.isAI}>
                        <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                          <Sparkles class="h-3 w-3" />
                          AI
                        </span>
                      </Show>
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
                  </div>
                </div>

                {/* Progress Metrics Section */}
                <Show when={popupMetrics()}>
                  <div class="p-4 space-y-3 bg-muted/30">
                    {/* Weekly Progress */}
                    <div>
                      <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-muted-foreground">This week</span>
                        <span class="font-medium">
                          {popupMetrics()!.weeklyEarned}€ / {popupMetrics()!.weeklyTarget}€
                        </span>
                      </div>
                      <div class="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          class="h-full bg-primary transition-all duration-300"
                          style={{
                            width: `${Math.min(100, popupMetrics()!.weeklyTarget > 0 ? (popupMetrics()!.weeklyEarned / popupMetrics()!.weeklyTarget) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Total Progress */}
                    <div>
                      <div class="flex items-center justify-between text-sm mb-1">
                        <span class="text-muted-foreground">Total</span>
                        <span class="font-medium">
                          {popupMetrics()!.totalEarned}€ / {popupMetrics()!.totalGoal}€
                        </span>
                      </div>
                      <div class="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          class="h-full bg-green-500 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, popupMetrics()!.totalGoal > 0 ? (popupMetrics()!.totalEarned / popupMetrics()!.totalGoal) * 100 : 0)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Days Remaining Badge */}
                    <div class="flex items-center justify-center pt-1">
                      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-background text-sm">
                        <Clock class="h-4 w-4 text-muted-foreground" />
                        <span class="font-medium">{popupMetrics()!.daysRemaining}</span>
                        <span class="text-muted-foreground">days remaining</span>
                      </span>
                    </div>
                  </div>
                </Show>

                {/* Briefing Message */}
                <div class="p-4 border-t border-border">
                  <Show when={loadingTip()}>
                    <div class="flex items-center gap-2 text-muted-foreground py-4">
                      <Loader2 class="h-4 w-4 animate-spin" />
                      <span class="text-sm">Bruno is preparing your briefing...</span>
                    </div>
                  </Show>
                  <Show when={!loadingTip() && dailyTip()}>
                    <div class="flex items-start gap-2 mb-2">
                      <Sparkles class="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 class="font-semibold text-foreground text-sm">
                          {dailyTip()?.title || 'Daily Tip'}
                        </h4>
                        <p class="text-sm text-muted-foreground mt-1">{dailyTip()?.message}</p>
                      </div>
                    </div>
                    {/* Today's Focus */}
                    <Show when={dailyTip()?.todaysFocus}>
                      <div class="mt-3 p-2 rounded-lg bg-primary/10 border border-primary/20">
                        <span class="text-xs text-muted-foreground">Recommended action: </span>
                        <span class="text-sm font-medium text-primary">
                          {dailyTip()!.todaysFocus}
                        </span>
                      </div>
                    </Show>
                  </Show>
                </div>

                {/* Inline Mood Selection */}
                <div class="p-4 border-t border-border bg-muted/20">
                  <div class="text-center mb-3">
                    <span class="text-sm text-muted-foreground">How are you feeling today?</span>
                  </div>
                  <div class="flex justify-center gap-2">
                    <For each={MOOD_OPTIONS}>
                      {(option) => (
                        <button
                          type="button"
                          onClick={() => saveMood(option.level)}
                          class={`text-2xl p-2 rounded-lg transition-all duration-200 ${
                            currentMood() === option.level
                              ? 'bg-primary/20 scale-110 ring-2 ring-primary ring-offset-2 ring-offset-background'
                              : 'hover:bg-muted hover:scale-105 opacity-60 hover:opacity-100'
                          }`}
                          title={option.label}
                        >
                          {option.emoji}
                        </button>
                      )}
                    </For>
                  </div>
                  <Show when={currentMood()}>
                    <p class="text-xs text-center text-muted-foreground mt-2">
                      Mood saved: {MOOD_OPTIONS.find((o) => o.level === currentMood())?.label}
                    </p>
                  </Show>
                </div>

                {/* Agent Details Panel (expandable) */}
                <Show when={showAgentDetails() && dailyTip()?.agentsUsed?.length}>
                  <div class="mx-4 mb-3 p-2 rounded-lg bg-muted/50 border border-border/50">
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
                <div class="flex items-center justify-between p-4 border-t border-border">
                  {/* Feedback buttons - show for AI responses */}
                  <div class="flex items-center gap-1">
                    <Show when={dailyTip()?.isAI}>
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
                        <Button as="a" href="/progress" onClick={completeDailyCheckin}>
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
