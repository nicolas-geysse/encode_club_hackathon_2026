/**
 * Comeback Alert Component
 *
 * Detects comeback windows after low energy periods and proposes catch-up plans.
 */

import { Show, For, createMemo } from 'solid-js';

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

  return (
    <Show when={comebackWindow()}>
      {(window) => (
        <div class="card border-2 border-green-300 bg-gradient-to-br from-green-50 to-emerald-50">
          {/* Header */}
          <div class="flex items-start gap-4">
            <div class="flex-shrink-0">
              <div class="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-3xl animate-bounce">
                🚀
              </div>
            </div>
            <div class="flex-1">
              <h3 class="text-xl font-bold text-green-900">Comeback Mode Active !</h3>
              <p class="text-green-700 mt-1">
                Ton energie est remontee a {props.energyHistory[props.energyHistory.length - 1]}%
                apres {window().deficitWeeks} semaines difficiles. C'est le moment de rattraper !
              </p>
            </div>
          </div>

          {/* Catch-up Plan */}
          <div class="mt-6">
            <h4 class="font-semibold text-green-800 mb-3">Plan de rattrapage suggere</h4>

            <div class="space-y-2">
              <For each={catchUpPlan()}>
                {(week) => (
                  <div class="flex items-center gap-3 p-3 bg-white rounded-lg">
                    <div class="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center font-bold text-green-700">
                      S{week.week}
                    </div>
                    <div class="flex-1">
                      <div class="flex justify-between">
                        <span class="font-medium text-slate-800">Semaine {week.week}</span>
                        <span class="font-bold text-green-600">+{week.target}€</span>
                      </div>
                      <div class="mt-1 h-2 bg-green-100 rounded-full overflow-hidden">
                        <div
                          class="h-full bg-green-500"
                          style={`width: ${(week.target / Math.max(...catchUpPlan().map((w) => w.target))) * 100}%`}
                        />
                      </div>
                      <span class="text-xs text-slate-500">
                        Capacite: {week.capacity}h disponibles
                      </span>
                    </div>
                  </div>
                )}
              </For>
            </div>

            {/* Total */}
            <div class="mt-4 p-4 bg-green-100 rounded-lg">
              <div class="flex justify-between items-center">
                <div>
                  <span class="text-green-800 font-medium">Rattrapage total</span>
                  <p class="text-sm text-green-600">En {window().suggestedCatchUpWeeks} semaines</p>
                </div>
                <div class="text-right">
                  <div class="text-3xl font-bold text-green-700">+{totalCatchUp()}€</div>
                  <div class="text-sm text-green-600">
                    = {Math.round(totalCatchUp() / window().suggestedCatchUpWeeks)}€/semaine
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div class="flex gap-3 mt-6">
            <button
              type="button"
              class="flex-1 px-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              onClick={() => props.onAcceptPlan?.(catchUpPlan())}
            >
              <span class="text-xl">💪</span>
              C'est parti !
            </button>
            <button
              type="button"
              class="px-4 py-3 bg-white border border-green-200 text-green-700 rounded-xl font-medium hover:bg-green-50 transition-colors"
              onClick={props.onDeclinePlan}
            >
              Plus tard
            </button>
          </div>

          {/* Achievement Teaser */}
          <div class="mt-4 p-3 bg-gradient-to-r from-yellow-100 to-amber-100 rounded-lg flex items-center gap-3">
            <span class="text-2xl">🏆</span>
            <div>
              <p class="font-medium text-amber-800">Achievement a debloquer</p>
              <p class="text-sm text-amber-600">Complete le plan pour obtenir "Comeback King" !</p>
            </div>
          </div>
        </div>
      )}
    </Show>
  );
}
