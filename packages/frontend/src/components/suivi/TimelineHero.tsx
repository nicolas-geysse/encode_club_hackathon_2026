/**
 * Timeline Hero Component
 *
 * Compact goal header with progress bar and 4 inline metric cards.
 * Includes celebration effects when goals are achieved.
 */

import { Show, createSignal, createEffect, onMount } from 'solid-js';
import { celebrateGoalAchieved } from '~/lib/confetti';

interface TimelineHeroProps {
  goalName: string;
  goalAmount: number;
  currentAmount: number;
  startDate: string;
  endDate: string;
  weeklyTarget: number;
  currentWeek: number;
  totalWeeks: number;
  totalHours?: number;
}

export function TimelineHero(props: TimelineHeroProps) {
  const [hasShownCelebration, setHasShownCelebration] = createSignal(false);
  const [animatedAmount, setAnimatedAmount] = createSignal(0);
  const [isAnimating, setIsAnimating] = createSignal(true);

  const timeProgress = () => Math.min((props.currentWeek / props.totalWeeks) * 100, 100);
  const amountProgress = () => Math.min((props.currentAmount / props.goalAmount) * 100, 100);
  const goalAchieved = () => props.currentAmount >= props.goalAmount;

  const daysRemaining = () => {
    const end = new Date(props.endDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const isOnTrack = () => amountProgress() >= timeProgress() - 5;
  const isAhead = () => amountProgress() > timeProgress() + 10;

  const status = () => {
    if (goalAchieved()) return { text: 'Goal Achieved!', color: 'text-yellow-400', icon: '🏆' };
    if (isAhead()) return { text: 'Ahead of schedule!', color: 'text-green-400', icon: '🚀' };
    if (isOnTrack()) return { text: 'On track', color: 'text-blue-400', icon: '👍' };
    return { text: 'Need a boost', color: 'text-amber-400', icon: '⚡' };
  };

  // Animate the amount counter on mount
  onMount(() => {
    const duration = 1500;
    const startTime = Date.now();
    const targetAmount = props.currentAmount;

    function animate() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      setAnimatedAmount(Math.round(targetAmount * easeOutQuart));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    }

    requestAnimationFrame(animate);
  });

  // Update animated amount when currentAmount changes
  createEffect(() => {
    const target = props.currentAmount;
    if (!isAnimating()) {
      setAnimatedAmount(target);
    }
  });

  // Trigger celebration when goal is achieved
  createEffect(() => {
    if (goalAchieved() && !hasShownCelebration()) {
      setHasShownCelebration(true);
      celebrateGoalAchieved();
    }
  });

  return (
    <div
      class={`card transition-all duration-500 ${
        goalAchieved()
          ? 'bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500 dark:from-yellow-600 dark:via-amber-600 dark:to-orange-600 text-white ring-4 ring-yellow-400/50'
          : 'bg-gradient-to-br from-primary-50 to-primary-100 dark:from-slate-900 dark:to-slate-800 text-slate-900 dark:text-white'
      }`}
    >
      {/* Goal Achieved Banner */}
      <Show when={goalAchieved()}>
        <div class="mb-3 -mt-2 -mx-2 px-4 py-1.5 bg-yellow-400/20 rounded-t-lg flex items-center justify-center gap-2 animate-pulse">
          <span class="text-lg">🎉</span>
          <span class="font-bold text-yellow-100 text-sm">Goal Achieved!</span>
          <span class="text-lg">🎉</span>
        </div>
      </Show>

      {/* Compact Header */}
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-bold">{props.goalName}</h2>
          <span class={`text-lg ${goalAchieved() ? 'animate-bounce' : ''}`}>{status().icon}</span>
        </div>
        <div class="text-right">
          <span
            class={`text-2xl font-bold tabular-nums ${
              goalAchieved() ? 'text-yellow-100' : 'text-primary-600 dark:text-white'
            }`}
          >
            {animatedAmount()}€
          </span>
          <span class="text-slate-500 dark:text-slate-300 mx-1">/</span>
          <span class="text-slate-600 dark:text-slate-300">{props.goalAmount}€</span>
        </div>
      </div>

      {/* Single Progress Bar with status text */}
      <div class="mb-4">
        <div class="h-4 bg-slate-200 dark:bg-slate-700/50 rounded-full overflow-hidden relative">
          {/* Time marker */}
          <div
            class="absolute top-0 bottom-0 w-0.5 bg-slate-400 dark:bg-white/50 z-10 transition-all duration-1000"
            style={{ left: `${timeProgress()}%` }}
          />
          <div
            class={`h-full transition-all duration-1000 ease-out ${
              goalAchieved()
                ? 'bg-gradient-to-r from-yellow-400 to-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                : isAhead()
                  ? 'bg-gradient-to-r from-green-500 to-green-400'
                  : isOnTrack()
                    ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                    : 'bg-gradient-to-r from-amber-500 to-amber-400'
            }`}
            style={{ width: `${amountProgress()}%` }}
          />
        </div>
        <div class="flex justify-between mt-1 text-xs">
          <span class={`font-medium ${status().color}`}>
            {Math.round(amountProgress())}% - {status().text}
          </span>
          <span class="text-slate-500 dark:text-slate-400">
            Week {props.currentWeek}/{props.totalWeeks}
          </span>
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div class="grid grid-cols-4 gap-2">
        <div class="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
          <div class="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {daysRemaining()}
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">days left</div>
        </div>
        <div class="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
          <div class="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {props.weeklyTarget}€
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">/week</div>
        </div>
        <div class="bg-white/50 dark:bg-slate-800/50 rounded-lg p-2 text-center">
          <div class="text-lg font-bold text-slate-900 dark:text-white tabular-nums">
            {props.totalHours ?? 0}h
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">worked</div>
        </div>
        <div
          class={`rounded-lg p-2 text-center ${
            goalAchieved()
              ? 'bg-yellow-400/30'
              : props.currentAmount >= 0
                ? 'bg-green-500/20 dark:bg-green-900/30'
                : 'bg-red-500/20 dark:bg-red-900/30'
          }`}
        >
          <div
            class={`text-lg font-bold tabular-nums ${
              goalAchieved()
                ? 'text-yellow-200'
                : props.currentAmount >= 0
                  ? 'text-green-700 dark:text-green-400'
                  : 'text-red-700 dark:text-red-400'
            }`}
          >
            {goalAchieved() ? '+' : ''}
            {props.currentAmount}€
          </div>
          <div class="text-xs text-slate-500 dark:text-slate-400">earned</div>
        </div>
      </div>

      {/* Quick Action - only show if behind */}
      <Show when={!isOnTrack() && !goalAchieved()}>
        <div class="mt-3 p-2 bg-amber-100 dark:bg-amber-500/20 rounded-lg flex items-center justify-between">
          <span class="text-amber-700 dark:text-amber-200 text-xs">
            {Math.round(timeProgress() - amountProgress())}% behind schedule
          </span>
          <button
            type="button"
            class="px-2 py-1 bg-amber-500 text-white text-xs font-medium rounded hover:bg-amber-600 transition-colors"
          >
            Catch-up
          </button>
        </div>
      </Show>
    </div>
  );
}
