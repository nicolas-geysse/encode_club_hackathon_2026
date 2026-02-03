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
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';
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

  // Check if we have any one-time gains to display in breakdown
  const hasOneTimeGains = () => {
    const otg = props.oneTimeGains;
    return otg && (otg.tradeSales > 0 || otg.tradeBorrow > 0 || otg.pausedSavings > 0);
  };

  // Build breakdown text showing all sources of progress
  const breakdownText = () => {
    if (!hasOneTimeGains()) return null;
    const otg = props.oneTimeGains!;
    const parts: string[] = [];
    if (props.currentAmount > 0)
      parts.push(`Earned: ${formatCurrency(props.currentAmount, props.currency)}`);
    if (otg.tradeSales > 0) parts.push(`Sold: ${formatCurrency(otg.tradeSales, props.currency)}`);
    if (otg.tradeBorrow > 0)
      parts.push(`Borrowed: ${formatCurrency(otg.tradeBorrow, props.currency)}`);
    if (otg.pausedSavings > 0)
      parts.push(`Paused: ${formatCurrency(otg.pausedSavings, props.currency)}`);
    return parts.join(' + ');
  };

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
  const gapPercent = () => Math.round(timeProgress() - amountProgress());

  // Bruno's contextual catch-up advice based on gap severity
  // v4.2: Smart Actions - returns advice + navigation target
  const catchUpStrategy = () => {
    const gap = gapPercent();
    const remaining = props.goalAmount - totalAmount();
    const weeksLeft = props.totalWeeks - props.currentWeek;
    const adjustedWeekly = weeksLeft > 0 ? Math.ceil(remaining / weeksLeft) : remaining;

    if (gap <= 5) {
      return {
        advice: `You're almost there! Just ${gap}% gap - one good week and you're back on track.`,
        href: '/plan?tab=swipe',
        label: 'Find gigs',
        focusId: null,
      };
    } else if (gap <= 15) {
      return {
        advice: `Aim for ${formatCurrency(adjustedWeekly, props.currency)}/week to catch up. Try adding 2-3 extra hours or explore new opportunities in Swipe.`,
        href: '/plan?tab=swipe',
        label: 'Explore',
        focusId: null,
      };
    } else if (gap <= 30) {
      return {
        advice: `Significant gap - let's replan. Consider selling items you don't need, or find higher-paying gigs in the Jobs tab.`,
        href: '/plan?tab=prospection',
        label: 'Find jobs',
        focusId: 'category-select',
      };
    } else {
      return {
        advice: `Major catch-up needed. I recommend reviewing your goal timeline or exploring Trade scenarios for quick wins.`,
        href: '/plan?tab=trade#add-trade',
        label: 'Add trade',
        focusId: 'add-trade-btn',
      };
    }
  };

  const catchUpAdvice = () => catchUpStrategy().advice;

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
                : totalAmount() >= 0
                  ? 'bg-green-500/10 dark:bg-green-900/30 border-green-500/20'
                  : 'bg-red-500/10 dark:bg-red-900/30 border-red-500/20'
            )}
          >
            <div
              class={cn(
                'text-lg font-bold tabular-nums',
                goalAchieved()
                  ? 'text-yellow-100' // Darker bg in achieved state
                  : totalAmount() >= 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
              )}
            >
              {formatCurrency(
                hasOneTimeGains() ? totalAmount() : props.currentAmount,
                props.currency,
                { showSign: goalAchieved() }
              )}
            </div>
            {/* Breakdown text when one-time gains exist */}
            <Show when={hasOneTimeGains()}>
              <div
                class={cn(
                  'text-[10px] mt-0.5 leading-tight',
                  goalAchieved() ? 'text-yellow-100/70' : 'text-muted-foreground'
                )}
              >
                {breakdownText()}
              </div>
            </Show>
            {/* Simple label when no one-time gains */}
            <Show when={!hasOneTimeGains()}>
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
            </Show>
            {/* "total" label when breakdown is shown */}
            <Show when={hasOneTimeGains()}>
              <div
                class={cn(
                  'text-xs flex items-center justify-center gap-1 mt-1',
                  goalAchieved() ? 'text-yellow-100/70' : 'text-muted-foreground'
                )}
              >
                {totalAmount() >= 0 ? (
                  <ArrowRight class="h-3 w-3 rotate-[-45deg]" />
                ) : (
                  <ArrowRight class="h-3 w-3 rotate-[45deg]" />
                )}
                total
              </div>
            </Show>
          </div>
        </div>

        {/* Bruno's Catch-up Advice - only show if behind */}
        <Show when={!isOnTrack() && !goalAchieved()}>
          <div class="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <div class="flex items-start gap-3">
              {/* Bruno Avatar */}
              <div class="flex-shrink-0 pt-0.5">
                <PlasmaAvatar size={28} color="green" />
              </div>
              {/* Content */}
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-amber-700 dark:text-amber-400 text-sm font-semibold flex items-center gap-1">
                    <Zap class="h-3.5 w-3.5" />
                    {gapPercent()}% behind schedule
                  </span>
                </div>
                <p class="text-xs text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
                  {catchUpAdvice()}
                </p>
              </div>
              {/* Smart Action - navigates to appropriate tab based on gap */}
              <Button
                as="a"
                href={catchUpStrategy().href}
                size="sm"
                class="bg-amber-500 hover:bg-amber-600 text-white h-7 text-xs flex-shrink-0 self-center"
                onClick={() => {
                  // v4.2: Focus specific element after navigation
                  const focusId = catchUpStrategy().focusId;
                  if (focusId) {
                    setTimeout(() => document.getElementById(focusId)?.focus(), 500);
                  }
                }}
              >
                {catchUpStrategy().label}
              </Button>
            </div>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
