/**
 * Timeline Hero Component
 *
 * Compact goal header with progress bar and 4 inline metric cards.
 * Includes celebration effects when goals are achieved.
 */

import { Show, createSignal, createEffect, onMount } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { celebrateGoalAchieved } from '~/lib/confetti';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import {
  type OneTimeGains,
  calculateTotalProgress,
  getEmptyOneTimeGains,
} from '~/lib/progressCalculator';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { Trophy, Rocket, ThumbsUp, Zap, Calendar, Target, Clock, ArrowRight } from 'lucide-solid';
import { cn } from '~/lib/cn';

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
  currency?: Currency;
  /** Current simulated date (ISO string) - if not provided, uses real date */
  currentSimulatedDate?: string;
  /** One-time gains from trades and paused subscriptions */
  oneTimeGains?: OneTimeGains;
}

export function TimelineHero(props: TimelineHeroProps) {
  const [hasShownCelebration, setHasShownCelebration] = createSignal(false);
  const [animatedAmount, setAnimatedAmount] = createSignal(0);
  const [isAnimating, setIsAnimating] = createSignal(true);

  // Total amount including one-time gains (trades + paused subscriptions)
  const totalAmount = () =>
    calculateTotalProgress(props.currentAmount, props.oneTimeGains || getEmptyOneTimeGains());

  const timeProgress = () => Math.min((props.currentWeek / props.totalWeeks) * 100, 100);
  // Progress now uses totalAmount (mission earnings + one-time gains)
  const amountProgress = () => Math.min((totalAmount() / props.goalAmount) * 100, 100);
  const goalAchieved = () => totalAmount() >= props.goalAmount;

  const daysRemaining = () => {
    const end = new Date(props.endDate);
    // Use simulated date if provided, otherwise fall back to real date
    const now = props.currentSimulatedDate ? new Date(props.currentSimulatedDate) : new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const isOnTrack = () => amountProgress() >= timeProgress() - 5;
  const isAhead = () => amountProgress() > timeProgress() + 10;

  const status = () => {
    if (goalAchieved()) return { text: 'Goal Achieved!', color: 'text-yellow-400', icon: Trophy };
    if (isAhead()) return { text: 'Ahead of schedule!', color: 'text-green-400', icon: Rocket };
    if (isOnTrack()) return { text: 'On track', color: 'text-blue-400', icon: ThumbsUp };
    return { text: 'Need a boost', color: 'text-amber-400', icon: Zap };
  };

  // Animate the amount counter on mount (uses totalAmount including one-time gains)
  onMount(() => {
    const duration = 1500;
    const startTime = Date.now();
    const targetAmount = totalAmount();

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

  // Update animated amount when totalAmount changes (includes one-time gains)
  createEffect(() => {
    const target = totalAmount();
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
    <Card
      class={cn(
        'transition-all duration-500 overflow-hidden',
        goalAchieved()
          ? 'bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-500 dark:from-yellow-600 dark:via-amber-600 dark:to-orange-600 text-white border-yellow-400/50'
          : 'bg-gradient-to-br from-primary/5 to-primary/10 dark:from-slate-900 dark:to-slate-800'
      )}
    >
      <CardContent class="p-6">
        {/* Goal Achieved Banner */}
        <Show when={goalAchieved()}>
          <div class="mb-4 -mt-2 -mx-2 px-4 py-1.5 bg-white/20 rounded-lg flex items-center justify-center gap-2 animate-pulse">
            <Trophy class="h-5 w-5 text-yellow-100" />
            <span class="font-bold text-yellow-100 text-sm">Goal Achieved!</span>
            <Trophy class="h-5 w-5 text-yellow-100" />
          </div>
        </Show>

        {/* Compact Header */}
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-bold">{props.goalName}</h2>
            <div class={cn('p-1.5 rounded-full bg-white/10', goalAchieved() && 'animate-bounce')}>
              <Dynamic component={status().icon} class="h-5 w-5" />
            </div>
          </div>
          <div class="text-right">
            <span
              class={cn(
                'text-2xl font-bold tabular-nums',
                goalAchieved() ? 'text-yellow-100' : 'text-primary dark:text-white'
              )}
            >
              {formatCurrency(animatedAmount(), props.currency)}
            </span>
            <span
              class={cn('mx-1', goalAchieved() ? 'text-yellow-100/70' : 'text-muted-foreground')}
            >
              /
            </span>
            <span class={cn(goalAchieved() ? 'text-yellow-100/70' : 'text-muted-foreground')}>
              {formatCurrency(props.goalAmount, props.currency)}
            </span>
          </div>
        </div>

        {/* Single Progress Bar with status text */}
        <div class="mb-6">
          <div class="h-4 bg-secondary dark:bg-slate-700/50 rounded-full overflow-hidden relative border border-black/5 dark:border-white/5">
            {/* Time marker */}
            <div
              class="absolute top-0 bottom-0 w-[2px] bg-foreground/50 z-10 transition-all duration-1000"
              style={{ left: `${timeProgress()}%` }}
            />
            <div
              class={cn(
                'h-full transition-all duration-1000 ease-out',
                goalAchieved()
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                  : isAhead()
                    ? 'bg-gradient-to-r from-green-500 to-green-400'
                    : isOnTrack()
                      ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400'
              )}
              style={{ width: `${amountProgress()}%` }}
            />
          </div>
          <div class="flex justify-between mt-2 text-xs">
            <span class={cn('font-medium', status().color)}>
              {Math.round(amountProgress())}% - {status().text}
            </span>
            <span class="text-muted-foreground">
              Week {props.currentWeek}/{props.totalWeeks}
            </span>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="bg-background/50 dark:bg-slate-800/50 rounded-lg p-3 text-center border border-border/50">
            <div
              class={cn(
                'text-lg font-bold tabular-nums',
                goalAchieved() ? 'text-slate-900 dark:text-white' : 'text-foreground'
              )}
            >
              {daysRemaining()}
            </div>
            <div class="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Calendar class="h-3 w-3" />
              days left
            </div>
          </div>
          <div class="bg-background/50 dark:bg-slate-800/50 rounded-lg p-3 text-center border border-border/50">
            <div
              class={cn(
                'text-lg font-bold tabular-nums',
                goalAchieved() ? 'text-slate-900 dark:text-white' : 'text-foreground'
              )}
            >
              {formatCurrency(props.weeklyTarget, props.currency)}
            </div>
            <div class="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Target class="h-3 w-3" />
              /week
            </div>
          </div>
          <div class="bg-background/50 dark:bg-slate-800/50 rounded-lg p-3 text-center border border-border/50">
            <div
              class={cn(
                'text-lg font-bold tabular-nums',
                goalAchieved() ? 'text-slate-900 dark:text-white' : 'text-foreground'
              )}
            >
              {props.totalHours ?? 0}h
            </div>
            <div class="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-1">
              <Clock class="h-3 w-3" />
              worked
            </div>
          </div>
          <div
            class={cn(
              'rounded-lg p-3 text-center border',
              goalAchieved()
                ? 'bg-yellow-400/30 border-yellow-400/20'
                : props.currentAmount >= 0
                  ? 'bg-green-500/10 dark:bg-green-900/30 border-green-500/20'
                  : 'bg-red-500/10 dark:bg-red-900/30 border-red-500/20'
            )}
          >
            <div
              class={cn(
                'text-lg font-bold tabular-nums',
                goalAchieved()
                  ? 'text-yellow-100' // Darker bg in achieved state
                  : props.currentAmount >= 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
              )}
            >
              {formatCurrency(props.currentAmount, props.currency, { showSign: goalAchieved() })}
            </div>
            <div
              class={cn(
                'text-xs flex items-center justify-center gap-1 mt-1',
                goalAchieved() ? 'text-yellow-100/70' : 'text-muted-foreground'
              )}
            >
              {props.currentAmount >= 0 ? (
                <ArrowRight class="h-3 w-3 rotate-[-45deg]" />
              ) : (
                <ArrowRight class="h-3 w-3 rotate-[45deg]" />
              )}
              earned
            </div>
          </div>
        </div>

        {/* Quick Action - only show if behind */}
        <Show when={!isOnTrack() && !goalAchieved()}>
          <div class="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
            <span class="text-amber-700 dark:text-amber-400 text-sm font-medium flex items-center gap-2">
              <Zap class="h-4 w-4" />
              {Math.round(timeProgress() - amountProgress())}% behind schedule
            </span>
            <Button size="sm" class="bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs">
              Catch-up
            </Button>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
