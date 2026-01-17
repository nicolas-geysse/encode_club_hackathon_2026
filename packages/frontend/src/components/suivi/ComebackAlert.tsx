/**
 * Comeback Alert Component
 *
 * Detects comeback windows after low energy periods and proposes catch-up plans.
 * Includes celebration effects when comeback mode is activated.
 */

import { Show, For, createMemo, createEffect, createSignal } from 'solid-js';
import { celebrateComeback } from '~/lib/confetti';

interface ComebackWindow {
  detected: boolean;
  recoveryWeek: number;
  deficitWeeks: number;
  suggestedCatchUpWeeks: number;
  deficit: number;
}

interface CatchUpPlan {
  week: number;
  target: number;
  capacity: number;
}

interface ComebackAlertProps {
  energyHistory: number[];
  weeklyDeficit: number;
  capacities: number[]; // Available capacity for next weeks
  onAcceptPlan?: (plan: CatchUpPlan[]) => void;
  onDeclinePlan?: () => void;
}

// Comeback Window Detection Algorithm
function detectComebackWindow(energyHistory: number[], deficit: number): ComebackWindow | null {
  if (energyHistory.length < 3) return null;

  // Identify low weeks (energy < 40%)
  const lowWeeks = energyHistory.filter((e) => e < 40);

  // Detect recovery (current > 80%, previous < 50%)
  const currentEnergy = energyHistory[energyHistory.length - 1];
  const previousEnergy = energyHistory[energyHistory.length - 2] || 50;

  if (lowWeeks.length >= 2 && currentEnergy > 80 && previousEnergy < 50) {
    return {
      detected: true,
      recoveryWeek: energyHistory.length,
      deficitWeeks: lowWeeks.length,
      suggestedCatchUpWeeks: Math.min(3, Math.ceil(lowWeeks.length * 1.5)),
      deficit,
    };
  }
  return null;
}

// Catch-up Plan Generation
function generateCatchUpPlan(deficit: number, capacities: number[]): CatchUpPlan[] {
  const totalCapacity = capacities.reduce((a, b) => a + b, 0);

  return capacities.map((cap, index) => ({
    week: index + 1,
    target: Math.round((cap / totalCapacity) * deficit),
    capacity: cap,
  }));
}

export function ComebackAlert(props: ComebackAlertProps) {
  const [hasShownCelebration, setHasShownCelebration] = createSignal(false);
  const [showContent, setShowContent] = createSignal(false);
  const [animatedTotal, setAnimatedTotal] = createSignal(0);

  const comebackWindow = createMemo(() =>
    detectComebackWindow(props.energyHistory, props.weeklyDeficit)
  );

  const catchUpPlan = createMemo(() => {
    const window = comebackWindow();
    if (!window) return [];
    return generateCatchUpPlan(
      window.deficit,
      props.capacities.slice(0, window.suggestedCatchUpWeeks)
    );
  });

  const totalCatchUp = createMemo(() => catchUpPlan().reduce((sum, week) => sum + week.target, 0));

  // Trigger celebration when comeback is detected
  createEffect(() => {
    if (comebackWindow() && !hasShownCelebration()) {
      setHasShownCelebration(true);
      // Delay content reveal for dramatic effect
      setTimeout(() => {
        celebrateComeback();
        setShowContent(true);

        // Animate the total counter
        const duration = 1000;
        const startTime = Date.now();
        const target = totalCatchUp();

        function animate() {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easeOut = 1 - Math.pow(1 - progress, 3);
          setAnimatedTotal(Math.round(target * easeOut));

          if (progress < 1) {
            requestAnimationFrame(animate);
          }
        }

        requestAnimationFrame(animate);
      }, 300);
    }
  });

  // Update animated total when plan changes
  createEffect(() => {
    if (showContent()) {
      setAnimatedTotal(totalCatchUp());
    }
  });

  return (
    <Show when={comebackWindow()}>
      {(window) => (
        <div
          class={`card border-2 border-green-300 dark:border-green-700 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 transition-all duration-500 ${
            showContent() ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
        >
          {/* Header */}
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-3xl animate-bounce shadow-lg shadow-green-300/50 dark:shadow-green-700/50">
                🚀
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-xl font-bold text-green-900 dark:text-green-100 flex items-center gap-2">
                Comeback Mode Active!
                <span class="text-base animate-pulse">✨</span>
              </h3>
              <p class="text-green-700 dark:text-green-300 mt-1">
                Your energy is back up to {props.energyHistory[props.energyHistory.length - 1]}%
                after {window().deficitWeeks} tough weeks. Time to catch up!
              </p>
            </div>
          </div>

          {/* Catch-up Plan */}
          <div class="mt-6">
            <h4 class="font-semibold text-green-800 dark:text-green-200 mb-3">
              Suggested Catch-up Plan
            </h4>

            <div class="space-y-2">
              <For each={catchUpPlan()}>
                {(week, index) => (
                  <div
                    class="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm transition-all duration-300"
                    style={{
                      'animation-delay': `${index() * 100}ms`,
                      animation: showContent() ? 'slideIn 0.3s ease-out forwards' : 'none',
                      opacity: showContent() ? 1 : 0,
                    }}
                  >
                    <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-800 dark:to-green-700 flex items-center justify-center font-bold text-green-700 dark:text-green-200">
                      W{week.week}
                    </div>
                    <div class="flex-1">
                      <div class="flex justify-between">
                        <span class="font-medium text-slate-800 dark:text-slate-200">
                          Week {week.week}
                        </span>
                        <span class="font-bold text-green-600 dark:text-green-400">
                          +${week.target}
                        </span>
                      </div>
                      <div class="mt-1 h-2 bg-green-100 dark:bg-green-900/50 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-1000"
                          style={{
                            width: showContent()
                              ? `${(week.target / Math.max(...catchUpPlan().map((w) => w.target))) * 100}%`
                              : '0%',
                          }}
                        />
                      </div>
                      <span class="text-xs text-slate-500 dark:text-slate-400">
                        Capacity: {week.capacity}h available
                      </span>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Total */}
            <div class="mt-4 p-4 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 rounded-lg">
              <div class="flex justify-between items-center">
                <div>
                  <span class="text-green-800 dark:text-green-200 font-medium">Total Catch-up</span>
                  <p class="text-sm text-green-600 dark:text-green-400">
                    In {window().suggestedCatchUpWeeks} weeks
                  </p>
                </div>
                <div class="text-right">
                  <div class="text-3xl font-bold text-green-700 dark:text-green-300 tabular-nums">
                    +${animatedTotal()}
                  </div>
                  <div class="text-sm text-green-600 dark:text-green-400">
                    = ${Math.round(totalCatchUp() / window().suggestedCatchUpWeeks)}/week
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div class="flex gap-3 mt-6">
            <button
              type="button"
              class="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-xl font-bold hover:from-green-600 hover:to-emerald-600 transition-all shadow-lg shadow-green-300/30 dark:shadow-green-700/30 hover:shadow-green-400/40 flex items-center justify-center gap-2"
              onClick={() => props.onAcceptPlan?.(catchUpPlan())}
            >
              <span class="text-xl">💪</span>
              Let's go!
            </button>
            <button
              type="button"
              class="px-4 py-3 bg-white dark:bg-slate-700 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 rounded-xl font-medium hover:bg-green-50 dark:hover:bg-slate-600 transition-colors"
              onClick={props.onDeclinePlan}
            >
              Later
            </button>
          </div>

          {/* Achievement Teaser */}
          <div class="mt-4 p-3 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 rounded-lg flex items-center gap-3 border border-yellow-200 dark:border-yellow-700">
            <span class="text-2xl animate-pulse">🏆</span>
            <div>
              <p class="font-medium text-amber-800 dark:text-amber-200">Achievement to unlock</p>
              <p class="text-sm text-amber-600 dark:text-amber-400">
                Complete the plan to get "Comeback King"!
              </p>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
