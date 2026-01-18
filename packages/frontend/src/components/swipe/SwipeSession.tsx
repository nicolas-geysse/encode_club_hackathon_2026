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
import { SwipeCard, type SwipeDirection, type CardAdjustments } from './SwipeCard';
import type { Scenario, UserPreferences } from '../tabs/SwipeTab';
import { getCurrencySymbol, type Currency } from '~/lib/dateUtils';
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Progress } from '~/components/ui/Progress';
import { Card } from '~/components/ui/Card';
import { RotateCcw, X, ThumbsDown, Heart, Star, Bot } from 'lucide-solid';

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
          customWeeklyHours: nextScenario.weeklyHours, // Fix: use weeklyHours, not effort
        });
      }
    }
  };

  const progress = () => (currentIndex() / props.scenarios.length) * 100;
  const canUndo = () => swipeHistory().length > 0;

  return (
    <div class="flex flex-col items-center py-4 relative min-h-[600px] w-full max-w-lg mx-auto">
      {/* Top Bar: Progress & AI-Learning status */}
      <div class="w-full flex items-center justify-between px-4 mb-4">
        <div class="flex items-center gap-2 text-sm text-muted-foreground font-medium">
          <span class="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">
            {currentIndex() + 1} / {props.scenarios.length}
          </span>
          <span>Cards</span>
        </div>

        <div class="flex items-center gap-1.5">
          <Bot class="h-4 w-4 text-purple-500" />
          <div class="flex gap-0.5 items-end h-3">
            <div
              class="w-1 bg-blue-500 rounded-sm transition-all"
              style={{ height: `${preferences().effortSensitivity * 100}%` }}
            />
            <div
              class="w-1 bg-green-500 rounded-sm transition-all"
              style={{ height: `${preferences().hourlyRatePriority * 100}%` }}
            />
            <div
              class="w-1 bg-purple-500 rounded-sm transition-all"
              style={{ height: `${preferences().timeFlexibility * 100}%` }}
            />
            <div
              class="w-1 bg-amber-500 rounded-sm transition-all"
              style={{ height: `${preferences().incomeStability * 100}%` }}
            />
          </div>
        </div>
      </div>

      <Progress value={progress()} class="h-1 w-full max-w-xs mb-8 bg-muted/50" />

      {/* Card Stack Area */}
      <div class="relative w-full flex justify-center mb-8 z-10">
        <div class="relative w-80 h-[420px]">
          <For each={props.scenarios}>
            {(scenario, index) => (
              <Show when={index() >= currentIndex()}>
                <SwipeCard
                  id={scenario.id}
                  title={scenario.title}
                  description={scenario.description}
                  weeklyHours={
                    index() === currentIndex()
                      ? (adjustments().customWeeklyHours ?? scenario.weeklyHours)
                      : scenario.weeklyHours
                  }
                  weeklyEarnings={
                    index() === currentIndex()
                      ? (adjustments().customWeeklyHours ?? scenario.weeklyHours) *
                        (adjustments().customHourlyRate ?? scenario.hourlyRate)
                      : scenario.weeklyEarnings
                  }
                  effortLevel={scenario.effortLevel}
                  flexibilityScore={scenario.flexibilityScore}
                  hourlyRate={
                    index() === currentIndex()
                      ? (adjustments().customHourlyRate ?? scenario.hourlyRate)
                      : scenario.hourlyRate
                  }
                  category={scenario.category}
                  onSwipe={handleSwipe}
                  isActive={index() === currentIndex()}
                />
              </Show>
            )}
          </For>

          {/* Empty State / Complete */}
          <Show when={currentIndex() >= props.scenarios.length}>
            <div class="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-card border border-border rounded-3xl shadow-sm animate-in fade-in zoom-in duration-300">
              <div class="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <Heart class="h-10 w-10 text-green-600" />
              </div>
              <h3 class="text-xl font-bold text-foreground mb-2">All Done!</h3>
              <p class="text-muted-foreground">Preparing your personalized plan...</p>
            </div>
          </Show>
        </div>
      </div>

      {/* Controls / Adjustments */}
      <Show when={currentIndex() < props.scenarios.length}>
        <div class="w-full max-w-sm px-4 space-y-6">
          {/* Action Buttons */}
          <div class="flex items-center justify-center gap-5">
            <Button
              variant="outline"
              size="icon"
              class="h-12 w-12 rounded-full border-muted-foreground/20 hover:border-red-500/50 hover:bg-red-500/5 hover:text-red-600 transition-all"
              onClick={() => handleSwipe('left', 200)}
            >
              <X class="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              class="h-10 w-10 rounded-full border-muted-foreground/20 text-muted-foreground opacity-70 hover:opacity-100 hover:bg-muted"
              onClick={handleUndo}
              disabled={!canUndo()}
            >
              <RotateCcw class="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              class="h-12 w-12 rounded-full border-muted-foreground/20 hover:border-blue-500/50 hover:bg-blue-500/5 hover:text-blue-600 transition-all"
              onClick={() => handleSwipe('up', 200)}
            >
              <Star class="h-5 w-5" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              class="h-12 w-12 rounded-full border-green-500 text-green-600 bg-green-500/10 hover:bg-green-500/20 hover:scale-110 shadow-lg shadow-green-500/10 transition-all"
              onClick={() => handleSwipe('right', 200)}
            >
              <Heart class="h-6 w-6" />
            </Button>
          </div>

          {/* Collapsible Adjustments */}
          <Card class="bg-muted/30 border-none shadow-none">
            <div class="p-4 space-y-4">
              <div class="flex justify-between items-center text-xs font-medium text-muted-foreground uppercase tracking-wider">
                <span>Adjust Assumptions</span>
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">Rate ({currencySymbol()}/h)</label>
                  <Input
                    type="number"
                    class="h-8 bg-background border-border"
                    value={adjustments().customHourlyRate}
                    onInput={(e) =>
                      setAdjustments({
                        ...adjustments(),
                        customHourlyRate: Number(e.currentTarget.value),
                      })
                    }
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-xs text-muted-foreground">Hours/week</label>
                  <Input
                    type="number"
                    class="h-8 bg-background border-border"
                    value={adjustments().customWeeklyHours}
                    onInput={(e) =>
                      setAdjustments({
                        ...adjustments(),
                        customWeeklyHours: Number(e.currentTarget.value),
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </Card>
        </div>
      </Show>
    </div>
  );
}
