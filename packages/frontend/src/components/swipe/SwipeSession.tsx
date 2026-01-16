/**
 * Swipe Session Component
 *
 * Manages a swipe session with preference learning and 4-way gestures.
 * - RIGHT: Accept
 * - LEFT: Reject
 * - UP: Super Like (stronger positive signal)
 * - DOWN: Negative feedback (card stays, logs sentiment)
 */

import { createSignal, For, Show } from 'solid-js';
import { SwipeCard, type SwipeDirection } from './SwipeCard';
import type { Scenario, UserPreferences } from '../tabs/SwipeTab';

interface SwipeSessionProps {
  scenarios: Scenario[];
  initialPreferences: UserPreferences;
  onComplete: (
    accepted: Scenario[],
    rejected: Scenario[],
    preferences: UserPreferences,
    mehIds?: Set<string>
  ) => void;
}

interface SwipeDecision {
  scenarioId: string;
  decision: SwipeDirection;
  timeSpent: number;
}

interface SwipeHistoryEntry {
  index: number;
  direction: SwipeDirection;
  scenario: Scenario;
  previousPreferences: UserPreferences;
  previousAdjustments: CardAdjustments;
  wasAccepted: boolean;
}

interface CardAdjustments {
  perceivedEffort: number;
  perceivedFlexibility: number;
  customHourlyRate: number;
}

// Preference learning algorithm with 4-way support
function updatePreferences(
  currentPrefs: UserPreferences,
  scenario: Scenario,
  direction: SwipeDirection,
  adjustments?: CardAdjustments
): UserPreferences {
  const learningRate = 0.15;

  // Multipliers for different directions
  const multipliers: Record<SwipeDirection, number> = {
    right: 1.0, // Accept
    left: -1.0, // Reject
    up: 1.5, // Super like (stronger positive)
    down: -0.3, // Negative feedback (mild)
  };
  const multiplier = multipliers[direction];

  // Use adjusted values if provided, otherwise use scenario defaults
  const effort = adjustments?.perceivedEffort ?? scenario.effortLevel;
  const rate = adjustments?.customHourlyRate ?? scenario.hourlyRate;
  const flexibility = adjustments?.perceivedFlexibility ?? scenario.flexibilityScore;

  // Normalize attributes to 0-1
  const normalizedEffort = effort / 5;
  const normalizedRate = rate > 20 ? 1 : rate / 20;
  const normalizedFlexibility = flexibility / 5;
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
  const [swipeHistory, setSwipeHistory] = createSignal<SwipeHistoryEntry[]>([]);
  const [negativeFeedback, setNegativeFeedback] = createSignal<Set<string>>(new Set());

  // Adjustments for current card (reset when moving to next card)
  const getDefaultAdjustments = (): CardAdjustments => {
    const scenario = props.scenarios[currentIndex()];
    return {
      perceivedEffort: scenario?.effortLevel ?? 3,
      perceivedFlexibility: scenario?.flexibilityScore ?? 3,
      customHourlyRate: scenario?.hourlyRate ?? 0,
    };
  };
  const [adjustments, setAdjustments] = createSignal<CardAdjustments>(getDefaultAdjustments());

  // Undo last swipe
  const handleUndo = () => {
    const history = swipeHistory();
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];

    // Restore preferences
    setPreferences(lastEntry.previousPreferences);
    setCurrentIndex(lastEntry.index);

    // Remove from accepted/rejected
    if (lastEntry.wasAccepted) {
      setAccepted(accepted().filter((s) => s.id !== lastEntry.scenario.id));
    } else if (lastEntry.direction === 'left') {
      setRejected(rejected().filter((s) => s.id !== lastEntry.scenario.id));
    }

    // Remove from decisions
    setDecisions(decisions().slice(0, -1));

    // Remove from history
    setSwipeHistory(history.slice(0, -1));

    // Restore the adjustments that were set for this card
    setAdjustments(lastEntry.previousAdjustments);
  };

  const handleSwipe = (direction: SwipeDirection, timeSpent: number) => {
    const scenario = props.scenarios[currentIndex()];
    const previousPrefs = { ...preferences() };

    // For 'down' swipe: reject + record as "meh" (strong dislike)
    if (direction === 'down') {
      const newFeedback = new Set(negativeFeedback());
      newFeedback.add(scenario.id);
      setNegativeFeedback(newFeedback);
      // Continue to process as rejection (don't return early)
    }

    // Record decision
    const decision: SwipeDecision = {
      scenarioId: scenario.id,
      decision: direction,
      timeSpent,
    };
    setDecisions([...decisions(), decision]);

    // Determine if accepted (right or up = accept)
    const isAccepted = direction === 'right' || direction === 'up';

    // Update accepted/rejected
    if (isAccepted) {
      setAccepted([...accepted(), scenario]);
    } else {
      setRejected([...rejected(), scenario]);
    }

    // Update preferences using user's adjustments
    const updatedPrefs = updatePreferences(preferences(), scenario, direction, adjustments());
    setPreferences(updatedPrefs);

    // Save to history for undo (including current adjustments)
    const currentAdjustments = { ...adjustments() };
    setSwipeHistory([
      ...swipeHistory(),
      {
        index: currentIndex(),
        direction,
        scenario,
        previousPreferences: previousPrefs,
        previousAdjustments: currentAdjustments,
        wasAccepted: isAccepted,
      },
    ]);

    // Move to next or complete
    if (currentIndex() >= props.scenarios.length - 1) {
      // Session complete
      setTimeout(() => {
        props.onComplete(accepted(), rejected(), preferences(), negativeFeedback());
      }, 300);
    } else {
      const nextIndex = currentIndex() + 1;
      setCurrentIndex(nextIndex);
      // Reset adjustments for next card
      const nextScenario = props.scenarios[nextIndex];
      if (nextScenario) {
        setAdjustments({
          perceivedEffort: nextScenario.effortLevel,
          perceivedFlexibility: nextScenario.flexibilityScore,
          customHourlyRate: nextScenario.hourlyRate,
        });
      }
    }
  };

  const progress = () => ((currentIndex() + 1) / props.scenarios.length) * 100;
  const canUndo = () => swipeHistory().length > 0;

  return (
    <div class="flex flex-col items-center py-6">
      {/* AI Learning Indicator - Above Timeline */}
      <div class="w-full max-w-sm mb-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🤖</span>
          <p class="text-sm font-medium text-slate-700">AI Learning Your Preferences</p>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(1 - preferences().effortSensitivity) * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500">Effort</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${preferences().hourlyRatePriority * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500">Pay</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${preferences().timeFlexibility * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500">Flex</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${preferences().incomeStability * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500">Stable</span>
          </div>
        </div>
      </div>

      {/* Adjustable Fields - Below AI Learning */}
      <Show when={currentIndex() < props.scenarios.length}>
        <div class="w-full max-w-sm mb-4 bg-white rounded-lg border border-slate-200 p-3">
          <p class="text-xs text-slate-500 mb-2 font-medium">Adjust (if needed) before swiping:</p>
          <div class="grid grid-cols-3 gap-4">
            {/* Effort Rating */}
            <div class="text-center">
              <label class="block text-xs text-slate-600 mb-1">Effort</label>
              <div class="flex justify-center gap-0.5">
                <For each={[1, 2, 3, 4, 5]}>
                  {(star) => (
                    <button
                      type="button"
                      class={`text-lg transition-colors ${
                        star <= adjustments().perceivedEffort
                          ? 'text-amber-400'
                          : 'text-slate-300 hover:text-amber-200'
                      }`}
                      onClick={() => setAdjustments({ ...adjustments(), perceivedEffort: star })}
                    >
                      ★
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Flexibility Rating */}
            <div class="text-center">
              <label class="block text-xs text-slate-600 mb-1">Flexibility</label>
              <div class="flex justify-center gap-0.5">
                <For each={[1, 2, 3, 4, 5]}>
                  {(star) => (
                    <button
                      type="button"
                      class={`text-lg transition-colors ${
                        star <= adjustments().perceivedFlexibility
                          ? 'text-purple-400'
                          : 'text-slate-300 hover:text-purple-200'
                      }`}
                      onClick={() =>
                        setAdjustments({ ...adjustments(), perceivedFlexibility: star })
                      }
                    >
                      ★
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Hourly Rate */}
            <div class="text-center">
              <label class="block text-xs text-slate-600 mb-1">Rate (€/h)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={adjustments().customHourlyRate}
                onInput={(e) =>
                  setAdjustments({
                    ...adjustments(),
                    customHourlyRate: Math.max(0, parseInt(e.currentTarget.value) || 0),
                  })
                }
                class="w-full text-center text-sm font-medium border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>
      </Show>

      {/* Progress Bar - Below Adjustments */}
      <div class="w-full max-w-sm mb-6">
        <div class="flex justify-between text-sm text-slate-500 mb-2">
          <span class="font-medium">
            {currentIndex() + 1} / {props.scenarios.length}
          </span>
          <span>
            {accepted().length} accepted • {rejected().length} rejected
          </span>
        </div>
        <div class="h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${progress()}%` }}
          />
        </div>
      </div>

      {/* Card Stack */}
      <div class="relative w-80 h-[420px] flex items-center justify-center overflow-hidden">
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
            <p>All scenarios evaluated!</p>
          </div>
        </Show>
      </div>

      {/* Action Buttons with Undo */}
      <div class="mt-6 flex items-center gap-4">
        {/* Undo Button */}
        <button
          type="button"
          class={`flex flex-col items-center gap-1 transition-all ${
            canUndo() ? 'text-slate-500 hover:text-slate-700' : 'text-slate-300 cursor-not-allowed'
          }`}
          onClick={handleUndo}
          disabled={!canUndo()}
          title="Undo last swipe"
        >
          <div
            class={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
              canUndo() ? 'bg-slate-100 hover:bg-slate-200' : 'bg-slate-50'
            }`}
          >
            ↩️
          </div>
          <span class="text-[10px]">Undo</span>
        </button>

        {/* Reject Button */}
        <button
          type="button"
          class="flex flex-col items-center gap-1 text-red-500 hover:text-red-600 transition-colors"
          onClick={() => handleSwipe('left', 500)}
        >
          <div class="w-12 h-12 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center text-xl transition-colors">
            ✕
          </div>
          <span class="text-[10px]">Not for me</span>
        </button>

        {/* Meh Button (down swipe) */}
        <button
          type="button"
          class="flex flex-col items-center gap-1 text-orange-500 hover:text-orange-600 transition-colors"
          onClick={() => handleSwipe('down', 500)}
        >
          <div class="w-10 h-10 rounded-full bg-orange-100 hover:bg-orange-200 flex items-center justify-center text-lg transition-colors">
            👎
          </div>
          <span class="text-[10px]">Meh</span>
        </button>

        {/* Accept Button */}
        <button
          type="button"
          class="flex flex-col items-center gap-1 text-green-500 hover:text-green-600 transition-colors"
          onClick={() => handleSwipe('right', 500)}
        >
          <div class="w-12 h-12 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center text-xl transition-colors">
            ♥
          </div>
          <span class="text-[10px]">I'll take it!</span>
        </button>

        {/* Super Like Button */}
        <button
          type="button"
          class="flex flex-col items-center gap-1 text-blue-500 hover:text-blue-600 transition-colors"
          onClick={() => handleSwipe('up', 500)}
        >
          <div class="w-10 h-10 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-lg transition-colors">
            ⭐
          </div>
          <span class="text-[10px]">Super</span>
        </button>
      </div>

      {/* Gesture Hints */}
      <div class="mt-4 text-center">
        <p class="text-xs text-slate-400">
          Drag: ← reject • → accept • ↑ super like • ↓ negative feedback
        </p>
      </div>
    </div>
  );
}
