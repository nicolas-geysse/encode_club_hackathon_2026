/**
 * Comeback Alert Component
 *
 * Detects comeback windows after low energy periods and proposes catch-up plans.
 * Includes celebration effects when comeback mode is activated.
 */

import { Show, For, createMemo, createEffect, createSignal } from 'solid-js';
import { celebrateComeback } from '~/lib/confetti';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Progress } from '~/components/ui/Progress';
import { Rocket, Sparkles, Trophy, CheckCircle } from 'lucide-solid';
import { cn } from '~/lib/cn';

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
  currency?: Currency;
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
        <Card
          class={cn(
            'border-2 border-green-300 dark:border-green-700 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 transition-all duration-500',
            showContent() ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          )}
        >
          <CardContent class="p-6">
            {/* Header */}
            <div class="flex items-start gap-4">
              <div class="flex-shrink-0">
                <div class="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center text-white animate-bounce shadow-lg shadow-green-300/50 dark:shadow-green-700/50">
                  <Rocket class="h-8 w-8" />
                </div>
              </div>
              <div class="flex-1">
                <h3 class="text-xl font-bold text-green-900 dark:text-green-100 flex items-center gap-2">
                  Comeback Mode Active!
                  <Sparkles class="h-5 w-5 text-yellow-400 animate-pulse" />
                </h3>
                <p class="text-green-700 dark:text-green-300 mt-1">
                  Your energy is back up to {props.energyHistory[props.energyHistory.length - 1]}%
                  after {window().deficitWeeks} tough weeks. Time to catch up!
                </p>
                {/* Explanation for users */}
                <p class="text-sm text-green-600 dark:text-green-400 mt-2 italic">
                  Tu as eu des semaines difficiles - maintenant que ton energie est revenue, voici
                  un plan pour rattraper le temps perdu !
                </p>
              </div>
            </div>

            {/* Catch-up Plan */}
            <div class="mt-8">
              <h4 class="font-semibold text-green-800 dark:text-green-200 mb-4">
                Suggested Catch-up Plan
              </h4>

              <div class="space-y-3">
                <For each={catchUpPlan()}>
                  {(week, index) => (
                    <div
                      class="flex items-center gap-4 p-4 bg-background/50 dark:bg-slate-800/50 rounded-xl shadow-sm transition-all duration-300 border border-green-100 dark:border-green-800"
                      style={{
                        'animation-delay': `${index() * 100}ms`,
                        animation: showContent() ? 'slideIn 0.3s ease-out forwards' : 'none',
                        opacity: showContent() ? 1 : 0,
                        transform: showContent() ? 'translateY(0)' : 'translateY(10px)',
                      }}
                    >
                      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-800 dark:to-green-700 flex items-center justify-center font-bold text-green-700 dark:text-green-200 text-sm">
                        W{week.week}
                      </div>
                      <div class="flex-1 space-y-2">
                        <div class="flex justify-between items-center">
                          <span class="font-medium text-foreground">Week {week.week}</span>
                          <span class="font-bold text-green-600 dark:text-green-400">
                            {formatCurrency(week.target, props.currency, { showSign: true })}
                          </span>
                        </div>

                        <div class="relative h-2 w-full bg-green-100 dark:bg-green-900/50 rounded-full overflow-hidden">
                          <div
                            class="h-full bg-gradient-to-r from-green-400 to-green-500 transition-all duration-1000 rounded-full"
                            style={{
                              width: showContent()
                                ? `${(week.target / Math.max(...catchUpPlan().map((w) => w.target))) * 100}%`
                                : '0%',
                            }}
                          />
                        </div>

                        <span class="text-xs text-muted-foreground block">
                          Capacity: {week.capacity}h available
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>

              {/* Total */}
              <div class="mt-6 p-5 bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 rounded-xl border border-green-200 dark:border-green-800">
                <div class="flex justify-between items-center">
                  <div>
                    <span class="text-green-800 dark:text-green-200 font-medium">
                      Total Catch-up
                    </span>
                    <p class="text-sm text-green-600 dark:text-green-400">
                      In {window().suggestedCatchUpWeeks} weeks
                    </p>
                  </div>
                  <div class="text-right">
                    <div class="text-3xl font-bold text-green-700 dark:text-green-300 tabular-nums">
                      {formatCurrency(animatedTotal(), props.currency, { showSign: true })}
                    </div>
                    <div class="text-sm text-green-600 dark:text-green-400">
                      ={' '}
                      {formatCurrency(
                        Math.round(totalCatchUp() / window().suggestedCatchUpWeeks),
                        props.currency
                      )}
                      /week
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div class="flex gap-4 mt-8">
              <Button
                class="flex-1 h-12 text-lg font-bold bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 shadow-lg shadow-green-300/30 dark:shadow-green-700/30 hover:shadow-green-400/40"
                onClick={() => props.onAcceptPlan?.(catchUpPlan())}
              >
                <span class="mr-2">💪</span>
                Let's go!
              </Button>
              <Button
                variant="outline"
                class="h-12 border-green-200 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/20"
                onClick={props.onDeclinePlan}
              >
                Later
              </Button>
            </div>

            {/* Achievement Teaser */}
            <div class="mt-6 p-4 bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/30 dark:to-amber-900/30 rounded-xl flex items-center gap-4 border border-yellow-200 dark:border-yellow-700">
              <Trophy class="h-8 w-8 text-yellow-600 dark:text-yellow-400 animate-pulse" />
              <div>
                <p class="font-medium text-amber-900 dark:text-amber-100">Achievement to unlock</p>
                <p class="text-sm text-amber-700 dark:text-amber-300">
                  Complete the plan to get "Comeback King"!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </Show>
  );
}
