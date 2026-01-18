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
import { getCurrencySymbol, type Currency } from '~/lib/dateUtils';

interface SwipeSessionProps {
  scenarios: Scenario[];
  initialPreferences: UserPreferences;
  currency?: Currency;
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
  customWeeklyHours: number;
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
  const currency = () => props.currency || 'USD';
  const currencySymbol = () => getCurrencySymbol(currency());

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
      customWeeklyHours: scenario?.weeklyHours ?? 0,
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
          customWeeklyHours: nextScenario.weeklyHours,
        });
      }
    }
  };

  const progress = () => ((currentIndex() + 1) / props.scenarios.length) * 100;
  const canUndo = () => swipeHistory().length > 0;

  return (
    <div class="flex flex-col items-center py-2 overflow-hidden">
      {/* AI Learning Indicator - Above Timeline */}
      <div class="w-full max-w-sm mb-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/30 dark:to-purple-900/30 rounded-lg p-2">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">🤖</span>
          <p class="text-sm font-medium text-slate-700 dark:text-slate-300">
            AI Learning Your Preferences
          </p>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${(1 - preferences().effortSensitivity) * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500 dark:text-slate-400">Effort</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                class="h-full bg-green-500 transition-all duration-300"
                style={{ width: `${preferences().hourlyRatePriority * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500 dark:text-slate-400">Pay</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 transition-all duration-300"
                style={{ width: `${preferences().timeFlexibility * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500 dark:text-slate-400">Flex</span>
          </div>
          <div class="text-center">
            <div class="h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
              <div
                class="h-full bg-amber-500 transition-all duration-300"
                style={{ width: `${preferences().incomeStability * 100}%` }}
              />
            </div>
            <span class="text-[10px] text-slate-500 dark:text-slate-400">Stable</span>
          </div>
        </div>
      </div>

      {/* Adjustable Fields - Below AI Learning */}
      <Show when={currentIndex() < props.scenarios.length}>
        {(() => {
          const currentScenario = props.scenarios[currentIndex()];
          const hasHours =
            currentScenario?.weeklyHours > 0 && currentScenario?.category !== 'selling';
          return (
            <div class="w-full max-w-sm mb-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-2">
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
                Adjust before swiping:
              </p>
              <div class={`grid ${hasHours ? 'grid-cols-4' : 'grid-cols-3'} gap-3`}>
                {/* Effort Rating */}
                <div class="text-center">
                  <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Effort
                  </label>
                  <div class="flex justify-center gap-0.5">
                    <For each={[1, 2, 3, 4, 5]}>
                      {(star) => (
                        <button
                          type="button"
                          class={`text-base transition-colors ${
                            star <= adjustments().perceivedEffort
                              ? 'text-amber-400'
                              : 'text-slate-300 dark:text-slate-600 hover:text-amber-200'
                          }`}
                          onClick={() =>
                            setAdjustments({ ...adjustments(), perceivedEffort: star })
                          }
                        >
                          ★
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                {/* Flexibility Rating */}
                <div class="text-center">
                  <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Flexibility
                  </label>
                  <div class="flex justify-center gap-0.5">
                    <For each={[1, 2, 3, 4, 5]}>
                      {(star) => (
                        <button
                          type="button"
                          class={`text-base transition-colors ${
                            star <= adjustments().perceivedFlexibility
                              ? 'text-purple-400'
                              : 'text-slate-300 dark:text-slate-600 hover:text-purple-200'
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

                {/* Hourly Rate - First, with currency and blue color */}
                <div class="text-center">
                  <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    {currencySymbol()}/h
                  </label>
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
                    class="w-full text-center text-sm font-bold text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/30 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                {/* Weekly Hours (conditional) */}
                <Show when={hasHours}>
                  <div class="text-center">
                    <label class="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Hours/w
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="40"
                      step="1"
                      value={adjustments().customWeeklyHours}
                      onInput={(e) =>
                        setAdjustments({
                          ...adjustments(),
                          customWeeklyHours: Math.max(1, parseInt(e.currentTarget.value) || 1),
                        })
                      }
                      class="w-full text-center text-sm font-medium border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 rounded px-1 py-1 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </Show>
              </div>
            </div>
          );
        })()}
      </Show>

      {/* Progress Bar - Below Adjustments */}
      <div class="w-full max-w-sm mb-4">
        <div class="flex justify-between text-sm text-slate-500 dark:text-slate-400 mb-1">
          <span class="font-medium">
            {currentIndex() + 1} / {props.scenarios.length}
          </span>
          <span>
            {accepted().length} accepted • {rejected().length} rejected
          </span>
        </div>
        <div class="h-2 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 transition-all duration-300"
            style={{ width: `${progress()}%` }}
          />
        </div>
      </div>

      {/* Card Stack */}
      <div class="relative w-80 h-[340px] flex items-center justify-center">
        <For each={props.scenarios}>
          {(scenario, index) => (
            <Show when={index() >= currentIndex()}>
              <SwipeCard
                id={scenario.id}
                title={scenario.title}
                description={scenario.description}
                weeklyHours={
                  index() === currentIndex()
                    ? adjustments().customWeeklyHours
                    : scenario.weeklyHours
                }
                weeklyEarnings={
                  index() === currentIndex()
                    ? adjustments().customWeeklyHours * adjustments().customHourlyRate
                    : scenario.weeklyEarnings
                }
                effortLevel={scenario.effortLevel}
                flexibilityScore={scenario.flexibilityScore}
                hourlyRate={
                  index() === currentIndex() ? adjustments().customHourlyRate : scenario.hourlyRate
                }
                category={scenario.category}
                onSwipe={handleSwipe}
                isActive={index() === currentIndex()}
              />
            </Show>
          )}
        </For>

        {/* Empty State */}
        <Show when={currentIndex() >= props.scenarios.length}>
          <div class="text-center text-slate-500 dark:text-slate-400">
            <div class="text-4xl mb-4">✅</div>
            <p>All scenarios evaluated!</p>
          </div>
        </Show>
      </div>

      {/* Action Buttons - Icon only, no labels */}
      <div class="mt-4 flex items-center gap-3">
        {/* Undo Button */}
        <button
          type="button"
          class={`transition-transform ${
            canUndo() ? 'hover:scale-110' : 'opacity-30 cursor-not-allowed'
          }`}
          onClick={handleUndo}
          disabled={!canUndo()}
          title="Undo"
        >
          <div
            class={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
              canUndo()
                ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800'
            }`}
          >
            <svg
              class={`w-5 h-5 ${canUndo() ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2.5"
                d="M3 10h10a5 5 0 0 1 5 5v2M3 10l5-5M3 10l5 5"
              />
            </svg>
          </div>
        </button>

        {/* Reject Button */}
        <button
          type="button"
          class="transition-transform hover:scale-110"
          onClick={() => handleSwipe('left', 500)}
          title="Not for me"
        >
          <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 border-2 border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/60 flex items-center justify-center text-xl text-red-500 transition-colors">
            ✕
          </div>
        </button>

        {/* Meh Button (down swipe) */}
        <button
          type="button"
          class="transition-transform hover:scale-110"
          onClick={() => handleSwipe('down', 500)}
          title="Meh"
        >
          <div class="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 border-2 border-orange-300 dark:border-orange-700 hover:bg-orange-200 dark:hover:bg-orange-900/60 flex items-center justify-center text-lg text-orange-500 transition-colors">
            👎
          </div>
        </button>

        {/* Accept Button */}
        <button
          type="button"
          class="transition-transform hover:scale-110"
          onClick={() => handleSwipe('right', 500)}
          title="I'll take it!"
        >
          <div class="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 border-2 border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/60 flex items-center justify-center text-xl text-green-500 transition-colors">
            ♥
          </div>
        </button>

        {/* Super Like Button */}
        <button
          type="button"
          class="transition-transform hover:scale-110"
          onClick={() => handleSwipe('up', 500)}
          title="Super like!"
        >
          <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 border-2 border-blue-300 dark:border-blue-700 hover:bg-blue-200 dark:hover:bg-blue-900/60 flex items-center justify-center text-lg text-blue-500 transition-colors">
            ⭐
          </div>
        </button>
      </div>
    </div>
  );
}
