/**
 * SimulationControls Component
 *
 * Footer component for time simulation controls.
 * Features:
 * - Shows current simulated date when simulating
 * - Shows JOUR X/Y based on goal deadline
 * - Advance buttons: +1d, +7d, +30d
 * - Reset button
 * - Daily check-in tracking (once per real day, stored in localStorage)
 *
 * The simulation state is stored in DuckDB and tracked in Opik traces.
 */

import { createSignal, Show, onMount, createMemo } from 'solid-js';
import { simulationService } from '~/lib/simulationService';

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
          <div class="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
            <span class="text-xs text-slate-500 font-medium">DAY</span>
            <span class="text-lg font-bold text-primary-600">{daysInfo().currentDay}</span>
            <span class="text-slate-400">/</span>
            <span class="text-sm text-slate-500">{daysInfo().totalDays}</span>
            {/* Mini progress bar */}
            <div class="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden ml-1">
              <div
                class="h-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-300"
                style={{ width: `${progressPct()}%` }}
              />
            </div>
          </div>

          {/* Simulation Controls Button */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded())}
            class={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
              state().isSimulating
                ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <span>⏱️</span>
            {state().isSimulating ? (
              <span class="font-medium">+{state().offsetDays}j</span>
            ) : (
              <span>Simulation</span>
            )}
          </button>

          {/* Dropdown when expanded */}
          <Show when={expanded()}>
            <div class="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-lg border border-slate-200 p-4 z-50 min-w-[280px]">
              <div class="text-sm text-slate-600 mb-3">
                {state().isSimulating ? (
                  <>
                    <div class="font-medium text-amber-800">
                      Simulated date: {formatDate(state().simulatedDate)}
                    </div>
                    <div class="text-xs text-slate-500 mt-1">
                      +{state().offsetDays}d since {formatDate(state().realDate)}
                    </div>
                  </>
                ) : (
                  <div>Today: {formatDate(state().realDate)}</div>
                )}
              </div>

              <div class="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => handleAdvance(1)}
                  disabled={loading()}
                  class="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  +1 day
                </button>
                <button
                  type="button"
                  onClick={() => handleAdvance(7)}
                  disabled={loading()}
                  class="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  +1 week
                </button>
                <button
                  type="button"
                  onClick={() => handleAdvance(30)}
                  disabled={loading()}
                  class="px-3 py-1.5 text-sm bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  +1 month
                </button>
              </div>

              <Show when={state().isSimulating}>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading()}
                  class="w-full px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back to real time
                </button>
              </Show>

              {/* Click outside to close */}
              <button
                type="button"
                class="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                onClick={() => setExpanded(false)}
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </Show>

          {/* Daily check-in modal (same as non-compact) */}
          <Show when={showDailyCheckin()}>
            <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
                <div class="text-center mb-4">
                  <span class="text-4xl">👋</span>
                  <h3 class="text-lg font-bold text-slate-900 mt-2">New day!</h3>
                  <p class="text-slate-500 text-sm mt-1">
                    {formatDate(state().realDate)}
                    {state().isSimulating && (
                      <span class="text-amber-600 ml-1">
                        (simulated: {formatDate(state().simulatedDate)})
                      </span>
                    )}
                  </p>
                </div>
                <div class="flex gap-3">
                  <button
                    type="button"
                    onClick={completeDailyCheckin}
                    class="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Let's go!
                  </button>
                  <a
                    href="/suivi"
                    onClick={completeDailyCheckin}
                    class="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-center"
                  >
                    View my progress
                  </a>
                </div>
              </div>
            </div>
          </Show>
        </div>
      }
    >
      {/* Non-compact mode: Full simulation controls */}
      <>
        {/* Main simulation indicator - always visible when simulating */}
        <Show when={state().isSimulating || expanded()}>
          <div class="bg-amber-50 border-t border-amber-200 px-4 py-2">
            <div class="max-w-7xl mx-auto flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="text-amber-600 text-lg">⏱️</span>
                <div class="text-sm">
                  <span class="text-amber-800 font-medium">
                    Simulated date: {formatDate(state().simulatedDate)}
                  </span>
                  <span class="text-amber-600 ml-2">
                    (+{state().offsetDays}d since {formatDate(state().realDate)})
                  </span>
                </div>
              </div>

              <div class="flex items-center gap-2">
                <Show when={expanded()}>
                  <button
                    onClick={() => handleAdvance(1)}
                    disabled={loading()}
                    class="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors disabled:opacity-50"
                  >
                    +1d
                  </button>
                  <button
                    onClick={() => handleAdvance(7)}
                    disabled={loading()}
                    class="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors disabled:opacity-50"
                  >
                    +7d
                  </button>
                  <button
                    onClick={() => handleAdvance(30)}
                    disabled={loading()}
                    class="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 rounded transition-colors disabled:opacity-50"
                  >
                    +30d
                  </button>
                  <Show when={state().isSimulating}>
                    <button
                      onClick={handleReset}
                      disabled={loading()}
                      class="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded transition-colors disabled:opacity-50"
                    >
                      Reset
                    </button>
                  </Show>
                </Show>
                <button
                  onClick={() => setExpanded(!expanded())}
                  class="p-1 text-amber-600 hover:text-amber-800 transition-colors"
                >
                  <Show
                    when={expanded()}
                    fallback={
                      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    }
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </Show>
                </button>
              </div>
            </div>
          </div>
        </Show>

        {/* Simulation toggle button - shown when not simulating */}
        <Show when={!state().isSimulating && !expanded()}>
          <button
            onClick={() => setExpanded(true)}
            class="fixed bottom-4 right-4 p-3 bg-slate-700 hover:bg-slate-800 text-white rounded-full shadow-lg transition-colors z-40"
            title="Simulation mode"
          >
            <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </Show>

        {/* Daily check-in modal */}
        <Show when={showDailyCheckin()}>
          <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
              <div class="text-center mb-4">
                <span class="text-4xl">👋</span>
                <h3 class="text-lg font-bold text-slate-900 mt-2">New day!</h3>
                <p class="text-slate-500 text-sm mt-1">
                  {formatDate(state().realDate)}
                  {state().isSimulating && (
                    <span class="text-amber-600 ml-1">
                      (simulated: {formatDate(state().simulatedDate)})
                    </span>
                  )}
                </p>
              </div>

              <div class="space-y-3 mb-6">
                <div class="p-3 bg-slate-50 rounded-lg">
                  <p class="text-sm text-slate-700">
                    How are you feeling today? Did you make progress on your goals?
                  </p>
                </div>

                <Show when={state().isSimulating}>
                  <div class="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p class="text-sm text-amber-800">
                      <strong>Note:</strong> You are in simulation mode. Data is offset by +
                      {state().offsetDays} days.
                    </p>
                  </div>
                </Show>
              </div>

              <div class="flex gap-3">
                <button
                  onClick={completeDailyCheckin}
                  class="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Let's go!
                </button>
                <a
                  href="/suivi"
                  onClick={completeDailyCheckin}
                  class="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors text-center"
                >
                  View my progress
                </a>
              </div>
            </div>
          </div>
        </Show>
      </>
    </Show>
  );
}

export default SimulationControls;
