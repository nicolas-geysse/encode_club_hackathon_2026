/**
 * Swipe Session Component
 *
 * Manages a swipe session with preference learning.
 */

import { createSignal, For, Show } from 'solid-js';
import { SwipeCard } from './SwipeCard';
import type { Scenario, UserPreferences } from '../tabs/SwipeTab';

interface SwipeSessionProps {
  scenarios: Scenario[];
  initialPreferences: UserPreferences;
  onComplete: (accepted: Scenario[], rejected: Scenario[], preferences: UserPreferences) => void;
}

interface SwipeDecision {
  scenarioId: string;
  decision: 'left' | 'right';
  timeSpent: number;
}

// Preference learning algorithm
function updatePreferences(
  currentPrefs: UserPreferences,
  scenario: Scenario,
  decision: SwipeDecision
): UserPreferences {
  const learningRate = 0.15;
  const multiplier = decision.decision === 'right' ? 1 : -1;

  // Normalize scenario attributes to 0-1
  const normalizedEffort = scenario.effortLevel / 5;
  const normalizedRate = scenario.hourlyRate > 20 ? 1 : scenario.hourlyRate / 20;
  const normalizedFlexibility = scenario.flexibilityScore / 5;
  const stabilitySignal = scenario.category === 'freelance' ? 0.3 : 0.7;

  // Update preferences with bounded values
  const clamp = (value: number) => Math.max(0, Math.min(1, value));

  return {
    effortSensitivity: clamp(
      currentPrefs.effortSensitivity + learningRate * multiplier * (1 - normalizedEffort)
    ),
    hourlyRatePriority: clamp(
      currentPrefs.hourlyRatePriority + learningRate * multiplier * normalizedRate
    ),
    timeFlexibility: clamp(
      currentPrefs.timeFlexibility + learningRate * multiplier * normalizedFlexibility
    ),
    incomeStability: clamp(
      currentPrefs.incomeStability + learningRate * multiplier * stabilitySignal
    ),
  };
}

export function SwipeSession(props: SwipeSessionProps) {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [preferences, setPreferences] = createSignal<UserPreferences>(props.initialPreferences);
  const [decisions, setDecisions] = createSignal<SwipeDecision[]>([]);
  const [accepted, setAccepted] = createSignal<Scenario[]>([]);
  const [rejected, setRejected] = createSignal<Scenario[]>([]);

  const handleSwipe = (direction: 'left' | 'right', timeSpent: number) => {
    const scenario = props.scenarios[currentIndex()];

    // Record decision
    const decision: SwipeDecision = {
      scenarioId: scenario.id,
      decision: direction,
      timeSpent,
    };
    setDecisions([...decisions(), decision]);

    // Update accepted/rejected
    if (direction === 'right') {
      setAccepted([...accepted(), scenario]);
    } else {
      setRejected([...rejected(), scenario]);
    }

    // Update preferences
    const updatedPrefs = updatePreferences(preferences(), scenario, decision);
    setPreferences(updatedPrefs);

    // Move to next or complete
    if (currentIndex() >= props.scenarios.length - 1) {
      // Session complete
      setTimeout(() => {
        props.onComplete(accepted(), rejected(), preferences());
      }, 300);
    } else {
      setCurrentIndex(currentIndex() + 1);
    }
  };

  const progress = () => ((currentIndex() + 1) / props.scenarios.length) * 100;

  return (
    <div class="flex flex-col items-center py-8">
      {/* Progress Bar */}
      <div class="w-full max-w-sm mb-8">
        <div class="flex justify-between text-sm text-slate-500 mb-2">
          <span>
            {currentIndex() + 1} / {props.scenarios.length}
          </span>
          <span>{accepted().length} accepted</span>
        </div>
        <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${progress()}%` }}
          />
        </div>
      </div>

      {/* Card Stack */}
      <div class="relative w-80 h-[450px] flex items-center justify-center">
        <For each={props.scenarios}>
          {(scenario, index) => (
            <Show when={index() >= currentIndex()}>
              <SwipeCard
                id={scenario.id}
                title={scenario.title}
                description={scenario.description}
                weeklyHours={scenario.weeklyHours}
                weeklyEarnings={scenario.weeklyEarnings}
                effortLevel={scenario.effortLevel}
                flexibilityScore={scenario.flexibilityScore}
                hourlyRate={scenario.hourlyRate}
                category={scenario.category}
                onSwipe={handleSwipe}
                isActive={index() === currentIndex()}
              />
            </Show>
          )}
        </For>

        {/* Empty State */}
        <Show when={currentIndex() >= props.scenarios.length}>
          <div class="text-center text-slate-500">
            <div class="text-4xl mb-4">✅</div>
            <p>All scenarios have been evaluated!</p>
          </div>
        </Show>
      </div>

      {/* Keyboard Hints */}
      <div class="mt-8 flex gap-8">
        <button
          type="button"
          class="flex flex-col items-center gap-2 text-red-500 hover:text-red-600 transition-colors"
          onClick={() => handleSwipe('left', 500)}
        >
          <div class="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center text-2xl">
            ✕
          </div>
          <span class="text-xs">Not for me</span>
        </button>
        <button
          type="button"
          class="flex flex-col items-center gap-2 text-green-500 hover:text-green-600 transition-colors"
          onClick={() => handleSwipe('right', 500)}
        >
          <div class="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-2xl">
            ♥
          </div>
          <span class="text-xs">I'll take it!</span>
        </button>
      </div>

      {/* Live Preference Updates */}
      <div class="mt-8 w-full max-w-sm">
        <p class="text-xs text-slate-400 text-center mb-2">Preferences learning in progress</p>
        <div class="grid grid-cols-4 gap-2">
          <div class="text-center">
            <div class="h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500"
                style={{ width: `${(1 - preferences().effortSensitivity) * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-400">Effort</span>
          </div>
          <div class="text-center">
            <div class="h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500"
                style={{ width: `${preferences().hourlyRatePriority * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-400">Pay</span>
          </div>
          <div class="text-center">
            <div class="h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500"
                style={{ width: `${preferences().timeFlexibility * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-400">Flex</span>
          </div>
          <div class="text-center">
            <div class="h-1 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-amber-500"
                style={{ width: `${preferences().incomeStability * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-400">Stable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
