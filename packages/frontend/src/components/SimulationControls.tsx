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

import { createSignal, Show, onMount, createMemo } from 'solid-js';
import { simulationService } from '~/lib/simulationService';
import { Button } from '~/components/ui/Button';
import { Card, CardContent } from '~/components/ui/Card';
import { Timer, X, RotateCcw, Settings, Clock } from 'lucide-solid';

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
      }
      // Mark that we've visited today
      localStorage.setItem('stride_has_visited', 'true');
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

  // Helper to get progress percentage (reactive)
  const progressPct = () => {
    const info = daysInfo();
    return Math.round((info.currentDay / info.totalDays) * 100);
  };

  // Compact mode for header - use Show to maintain reactivity
  return (
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

          {/* Daily check-in modal (same as non-compact) */}
          <Show when={showDailyCheckin()}>
            <div class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
              <Card class="w-full max-w-md mx-4 shadow-xl">
                <CardContent class="p-6">
                  <div class="text-center mb-4">
                    <span class="text-4xl">👋</span>
                    <h3 class="text-lg font-bold text-foreground mt-2">New day!</h3>
                    <p class="text-muted-foreground text-sm mt-1">
                      {formatDate(state().realDate)}
                      {state().isSimulating && (
                        <span class="text-amber-600 dark:text-amber-400 ml-1">
                          (simulated: {formatDate(state().simulatedDate)})
                        </span>
                      )}
                    </p>
                  </div>
                  <div class="flex gap-3">
                    <Button onClick={completeDailyCheckin} class="flex-1">
                      Let's go!
                    </Button>
                    <a
                      href="/suivi"
                      onClick={completeDailyCheckin}
                      class="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                    >
                      View my progress
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
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

        {/* Daily check-in modal */}
        <Show when={showDailyCheckin()}>
          <div class="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card class="w-full max-w-md mx-4 shadow-xl">
              <CardContent class="p-6">
                <div class="text-center mb-4">
                  <span class="text-4xl">👋</span>
                  <h3 class="text-lg font-bold text-foreground mt-2">New day!</h3>
                  <p class="text-muted-foreground text-sm mt-1">
                    {formatDate(state().realDate)}
                    {state().isSimulating && (
                      <span class="text-amber-600 dark:text-amber-400 ml-1">
                        (simulated: {formatDate(state().simulatedDate)})
                      </span>
                    )}
                  </p>
                </div>

                <div class="space-y-3 mb-6">
                  <div class="p-3 bg-muted rounded-lg">
                    <p class="text-sm text-foreground">
                      How are you feeling today? Did you make progress on your goals?
                    </p>
                  </div>

                  <Show when={state().isSimulating}>
                    <div class="p-3 bg-amber-50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800">
                      <p class="text-sm text-amber-800 dark:text-amber-300">
                        <strong>Note:</strong> You are in simulation mode. Data is offset by +
                        {state().offsetDays} days.
                      </p>
                    </div>
                  </Show>
                </div>

                <div class="flex gap-3">
                  <Button onClick={completeDailyCheckin} class="flex-1">
                    Let's go!
                  </Button>
                  <a
                    href="/suivi"
                    onClick={completeDailyCheckin}
                    class="flex-1 inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    View my progress
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </Show>
      </>
    </Show>
  );
}

export default SimulationControls;
