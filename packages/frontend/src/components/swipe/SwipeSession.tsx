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
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { Card } from '~/components/ui/Card';
import { X, ThumbsDown, Heart, Star, Bot } from 'lucide-solid';

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
  const [triggerSwipe, setTriggerSwipe] = createSignal<SwipeDirection | null>(null);

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

  const handleSwipe = (direction: SwipeDirection, timeSpent: number) => {
    setTriggerSwipe(null); // Reset trigger to prevent double firing on next card
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

  return (
    <div class="flex flex-col md:flex-row items-center md:items-end justify-center py-4 w-full max-w-7xl mx-auto gap-6">
      {/* (Left Column content skipped - implies it is unchanged in this replacement block if I target correctly, but replace_file_content replaces the whole block. I will target the gap line first, then the buttons separately to avoid massive context.) */}

      {/* Left Column: AI Context & Adjustments */}
      <div class="w-full md:w-72 space-y-4 flex flex-col shrink-0 order-2 md:order-1">
        {/* AI Context Block */}
        <div class="flex flex-col gap-2 p-3 bg-muted/20 rounded-xl border border-border/50 backdrop-blur-sm w-full">
          <div class="flex items-center gap-2 mb-1">
            <div class="p-1 bg-purple-500/10 rounded-md">
              <Bot class="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              AI Context
            </span>
          </div>

          <div class="flex items-end justify-between gap-2 pt-1">
            {/* Effort */}
            <Tooltip>
              <TooltipTrigger>
                <div class="flex flex-col items-center gap-1.5 group w-full">
                  <div class="h-8 w-1.5 bg-blue-200 dark:bg-blue-950/50 rounded-full relative overflow-hidden">
                    <div
                      class="absolute bottom-0 w-full bg-blue-500 rounded-full transition-all duration-500 ease-out"
                      style={{ height: `${preferences().effortSensitivity * 100}%` }}
                    />
                  </div>
                  <span class="text-[8px] text-muted-foreground font-medium uppercase tracking-tight group-hover:text-blue-400 transition-colors">
                    Effort
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent class="bg-card border-border text-foreground p-3">
                <div class="text-xs font-bold mb-1">Effort Sensitivity</div>
                <div class="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Influence: {Math.round(preferences().effortSensitivity * 100)}%
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Pay */}
            <Tooltip>
              <TooltipTrigger>
                <div class="flex flex-col items-center gap-1.5 group w-full">
                  <div class="h-8 w-1.5 bg-green-200 dark:bg-green-950/50 rounded-full relative overflow-hidden">
                    <div
                      class="absolute bottom-0 w-full bg-green-500 rounded-full transition-all duration-500 ease-out"
                      style={{ height: `${preferences().hourlyRatePriority * 100}%` }}
                    />
                  </div>
                  <span class="text-[8px] text-muted-foreground font-medium uppercase tracking-tight group-hover:text-green-400 transition-colors">
                    Pay
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent class="bg-card border-border text-foreground p-3">
                <div class="text-xs font-bold mb-1">Hourly Rate Priority</div>
                <div class="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Influence: {Math.round(preferences().hourlyRatePriority * 100)}%
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Flexibility */}
            <Tooltip>
              <TooltipTrigger>
                <div class="flex flex-col items-center gap-1.5 group w-full">
                  <div class="h-8 w-1.5 bg-purple-200 dark:bg-purple-950/50 rounded-full relative overflow-hidden">
                    <div
                      class="absolute bottom-0 w-full bg-purple-500 rounded-full transition-all duration-500 ease-out"
                      style={{ height: `${preferences().timeFlexibility * 100}%` }}
                    />
                  </div>
                  <span class="text-[8px] text-muted-foreground font-medium uppercase tracking-tight group-hover:text-purple-400 transition-colors">
                    Flex
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent class="bg-card border-border text-foreground p-3">
                <div class="text-xs font-bold mb-1">Time Flexibility</div>
                <div class="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Influence: {Math.round(preferences().timeFlexibility * 100)}%
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Stability */}
            <Tooltip>
              <TooltipTrigger>
                <div class="flex flex-col items-center gap-1.5 group w-full">
                  <div class="h-8 w-1.5 bg-amber-200 dark:bg-amber-950/50 rounded-full relative overflow-hidden">
                    <div
                      class="absolute bottom-0 w-full bg-amber-500 rounded-full transition-all duration-500 ease-out"
                      style={{ height: `${preferences().incomeStability * 100}%` }}
                    />
                  </div>
                  <span class="text-[8px] text-muted-foreground font-medium uppercase tracking-tight group-hover:text-amber-400 transition-colors">
                    Stable
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent class="bg-card border-border text-foreground p-3">
                <div class="text-xs font-bold mb-1">Income Stability</div>
                <div class="text-[10px] text-muted-foreground font-medium mb-1.5">
                  Influence: {Math.round(preferences().incomeStability * 100)}%
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Adjustments Card */}
        <Show when={currentIndex() < props.scenarios.length}>
          <Card class="bg-muted/30 border-none shadow-none w-full">
            <div class="p-3 space-y-3">
              <div class="flex justify-between items-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Adjust Assumptions</span>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label class="text-[10px] text-muted-foreground">
                    Rate ({currencySymbol()}/h)
                  </label>
                  <Input
                    type="number"
                    class="h-8 bg-background border-border text-xs"
                    value={adjustments().customHourlyRate}
                    onInput={(e) =>
                      setAdjustments({
                        ...adjustments(),
                        customHourlyRate: Number(e.currentTarget.value),
                      })
                    }
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] text-muted-foreground">Hours/week</label>
                  <Input
                    type="number"
                    class="h-8 bg-background border-border text-xs"
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
        </Show>

        {/* Spacer to align left column content with Card bottom (compensating for buttons on right) */}
        <div class="h-24 hidden md:block shrink-0" aria-hidden="true" />
      </div>

      {/* Right Column: Cards & Actions */}
      <div class="flex flex-col items-center min-w-0 order-1 md:order-2 w-auto">
        {/* Counter Only (Progress Bar removed) */}
        <div class="w-80 flex flex-col items-center gap-3 mb-6">
          <div class="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Card {currentIndex() + 1} / {props.scenarios.length}
          </div>
        </div>

        {/* Card Stack Area */}
        <div class="relative w-full flex justify-center mb-10 z-10">
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
                    currency={currency()}
                    onSwipe={handleSwipe}
                    isActive={index() === currentIndex()}
                    triggerSwipe={triggerSwipe()}
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

        {/* Action Buttons with Labels */}
        <Show when={currentIndex() < props.scenarios.length}>
          <div class="w-80 grid grid-cols-4 gap-2">
            {/* Not for me (Left) */}
            <div class="flex flex-col items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                class="h-14 w-14 rounded-full border-border bg-background dark:bg-[#121215] text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all shadow-sm"
                onClick={() => setTriggerSwipe('left')}
              >
                <X class="h-6 w-6" />
              </Button>
              <span class="text-[10px] font-bold text-red-600 uppercase tracking-tight text-center leading-tight transition-colors">
                Not for me
              </span>
            </div>

            {/* Meh (Down) */}
            <div class="flex flex-col items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                class="h-14 w-14 rounded-full border-border bg-background dark:bg-[#121215] text-orange-500 hover:bg-orange-500/10 hover:border-orange-500/20 transition-all shadow-sm"
                onClick={() => setTriggerSwipe('down')}
              >
                <ThumbsDown class="h-6 w-6" />
              </Button>
              <span class="text-[10px] font-bold text-orange-600 uppercase tracking-tight text-center leading-tight transition-colors">
                Meh
              </span>
            </div>

            {/* Super Like (Up) */}
            <div class="flex flex-col items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                class="h-14 w-14 rounded-full border-border bg-background dark:bg-[#121215] text-blue-500 hover:bg-blue-500/10 hover:border-blue-500/20 transition-all shadow-sm"
                onClick={() => setTriggerSwipe('up')}
              >
                <Star class="h-6 w-6" />
              </Button>
              <span class="text-[10px] font-bold text-blue-600 uppercase tracking-tight text-center leading-tight transition-colors">
                Super like
              </span>
            </div>

            {/* I'll take it (Right) */}
            <div class="flex flex-col items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                class="h-14 w-14 rounded-full border-border bg-background dark:bg-[#121215] text-green-500 hover:bg-green-500/10 hover:border-green-500/20 transition-all shadow-sm"
                onClick={() => setTriggerSwipe('right')}
              >
                <Heart class="h-6 w-6" />
              </Button>
              <span class="text-[10px] font-bold text-green-600 uppercase tracking-tight text-center leading-tight transition-colors">
                I'll take it!
              </span>
            </div>
          </div>
        </Show>
      </div>

      {/* Right Spacer for Balance (Centers the Card) */}
      <div class="w-full md:w-72 hidden md:block shrink-0 order-3" aria-hidden="true" />
    </div>
  );
}
