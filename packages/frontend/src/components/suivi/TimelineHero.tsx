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
import { Trophy, Rocket, ThumbsUp, Zap } from 'lucide-solid';
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

  // Build breakdown text showing all sources of progress (for future tooltip/details)
  const _breakdownText = () => {
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

  // Days remaining calculation (for future metric display)
  const _daysRemaining = () => {
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
        href: '/swipe',
        label: 'Find gigs',
        focusId: null,
      };
    } else if (gap <= 15) {
      return {
        advice: `Aim for ${formatCurrency(adjustedWeekly, props.currency)}/week to catch up. Try adding 2-3 extra hours or explore new opportunities in Swipe.`,
        href: '/swipe',
        label: 'Explore',
        focusId: null,
      };
    } else if (gap <= 30) {
      return {
        advice: `Significant gap - let's replan. Consider selling items you don't need, or find higher-paying gigs in the Jobs tab.`,
        href: '/me?tab=jobs',
        label: 'Find jobs',
        focusId: 'category-select',
      };
    } else {
      return {
        advice: `Major catch-up needed. I recommend reviewing your goal timeline or exploring Trade scenarios for quick wins.`,
        href: '/me?tab=trade#add-trade',
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
        'transition-all duration-500 overflow-hidden rounded-xl border shadow-sm',
        goalAchieved()
          ? 'bg-gradient-to-br from-yellow-500/10 via-amber-500/10 to-orange-500/10 border-yellow-500/20'
          : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
      )}
    >
      <CardContent class="p-6 md:p-8">
        {/* Goal Achieved Banner */}
        <Show when={goalAchieved()}>
          <div class="mb-6 px-4 py-2 bg-yellow-500/10 rounded-lg flex items-center justify-center gap-2">
            <Trophy class="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <span class="font-bold text-yellow-700 dark:text-yellow-300 text-sm">
              Goal Achieved!
            </span>
          </div>
        </Show>

        {/* Compact Header */}
        <div class="flex items-end justify-between mb-6">
          <div class="flex items-center gap-3">
            <h2 class="text-2xl font-bold tracking-tight text-foreground">{props.goalName}</h2>
            <div
              class={cn(
                'p-1.5 rounded-full',
                goalAchieved() ? 'bg-yellow-100 text-yellow-600' : 'bg-primary/10 text-primary'
              )}
            >
              <Dynamic component={status().icon} class="h-5 w-5" />
            </div>
          </div>
          <div class="text-right flex items-baseline gap-2">
            <span
              class={cn(
                'text-3xl font-bold tabular-nums',
                goalAchieved() ? 'text-yellow-600 dark:text-yellow-400' : 'text-primary'
              )}
            >
              {formatCurrency(animatedAmount(), props.currency)}
            </span>
            <span class="text-muted-foreground text-base font-medium">
              / {formatCurrency(props.goalAmount, props.currency)}
            </span>
          </div>
        </div>

        {/* Single Progress Bar with status text */}
        <div class="mb-2">
          <div class="h-3 bg-secondary dark:bg-slate-800/50 rounded-full overflow-hidden relative">
            {/* Time marker */}
            <div
              class="absolute top-0 bottom-0 w-[2px] bg-foreground/20 z-10"
              style={{ left: `${timeProgress()}%` }}
            />
            <div
              class={cn(
                'h-full transition-all duration-1000 ease-out rounded-full',
                goalAchieved()
                  ? 'bg-gradient-to-r from-yellow-400 to-amber-500'
                  : isAhead()
                    ? 'bg-gradient-to-r from-green-500 to-green-400'
                    : isOnTrack()
                      ? 'bg-gradient-to-r from-blue-500 to-blue-400'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400'
              )}
              style={{ width: `${amountProgress()}%` }}
            />
          </div>
          <div class="flex justify-between mt-2 text-xs uppercase tracking-wider font-medium text-muted-foreground">
            <span class={cn(status().color)}>
              {Math.round(amountProgress())}% - {status().text}
            </span>
            <span>
              Week {props.currentWeek}/{props.totalWeeks}
            </span>
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
