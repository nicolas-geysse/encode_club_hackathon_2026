/**
 * Timeline Hero Component
 *
 * Double progress bar showing time progress and workload progress.
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
      class={`card text-white transition-all duration-500 ${
        goalAchieved()
          ? 'bg-gradient-to-br from-yellow-600 via-amber-600 to-orange-600 ring-4 ring-yellow-400/50'
          : 'bg-gradient-to-br from-slate-900 to-slate-800'
      }`}
    >
      {/* Goal Achieved Banner */}
      <Show when={goalAchieved()}>
        <div class="mb-4 -mt-2 -mx-2 px-4 py-2 bg-yellow-400/20 rounded-t-lg flex items-center justify-center gap-2 animate-pulse">
          <span class="text-2xl">🎉</span>
          <span class="font-bold text-yellow-100">Congratulations! Goal Achieved!</span>
          <span class="text-2xl">🎉</span>
        </div>
      </Show>

      {/* Header */}
      <div class="flex items-start justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold">{props.goalName}</h2>
          <p class="text-slate-300 mt-1">
            Goal: <span class="text-white font-semibold">{props.goalAmount}€</span>
          </p>
        </div>
        <div class="text-right">
          <div
            class={`text-3xl font-bold tabular-nums ${
              goalAchieved() ? 'text-yellow-100' : 'text-white'
            }`}
          >
            {animatedAmount()}€
          </div>
          <div class="text-slate-300 text-sm">collected</div>
        </div>
      </div>

      {/* Double Progress Bars */}
      <div class="space-y-4">
        {/* Time Progress */}
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-slate-300">Time elapsed</span>
            <span class="font-medium">
              Week {props.currentWeek}/{props.totalWeeks}
            </span>
          </div>
          <div class="h-3 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-slate-500 to-slate-400 transition-all duration-1000 ease-out"
              style={{ width: `${timeProgress()}%` }}
            />
          </div>
        </div>

        {/* Amount Progress */}
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-slate-300">Goal progress</span>
            <span class="font-medium">{Math.round(amountProgress())}%</span>
          </div>
          <div class="h-3 bg-slate-700/50 rounded-full overflow-hidden relative">
            {/* Time marker */}
            <div
              class="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10 transition-all duration-1000"
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
        </div>
      </div>

      {/* Status & Stats */}
      <div class="mt-6 pt-6 border-t border-slate-700/50 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class={`text-2xl ${goalAchieved() ? 'animate-bounce' : ''}`}>{status().icon}</span>
          <span class={`font-medium ${status().color}`}>{status().text}</span>
        </div>
        <div class="flex gap-6 text-sm">
          <div class="text-center">
            <div class="font-bold text-white tabular-nums">{daysRemaining()}</div>
            <div class="text-slate-300">days</div>
          </div>
          <div class="text-center">
            <div class="font-bold text-white tabular-nums">{props.weeklyTarget}€</div>
            <div class="text-slate-300">/week</div>
          </div>
          <div class="text-center">
            <div
              class={`font-bold tabular-nums ${goalAchieved() ? 'text-yellow-200' : 'text-white'}`}
            >
              {goalAchieved() ? '+' : ''}
              {Math.abs(props.goalAmount - props.currentAmount)}€
            </div>
            <div class="text-slate-300">{goalAchieved() ? 'surplus' : 'remaining'}</div>
          </div>
        </div>
      </div>

      {/* Quick Action - only show if behind */}
      <Show when={!isOnTrack() && !goalAchieved()}>
        <div class="mt-4 p-3 bg-amber-500/20 rounded-lg flex items-center justify-between">
          <span class="text-amber-200 text-sm">
            You are {Math.round(timeProgress() - amountProgress())}% behind schedule
          </span>
          <button
            type="button"
            class="px-3 py-1 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors"
          >
            Catch-up plan
          </button>
        </div>
      </Show>
    </div>
  );
}
