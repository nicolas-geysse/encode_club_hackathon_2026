/**
 * Weekly Progress Cards Component
 *
 * Horizontal scrollable cards showing week-by-week progress towards a goal.
 * Each card shows: week number, target, actual earnings, status (ahead/behind).
 */

import { For, Show, createMemo, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import type { Goal } from '~/lib/goalService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { getCurrentWeekInfo } from '~/lib/weekCalculator';
import { cn } from '~/lib/cn';

interface WeekData {
  weekNumber: number;
  weekStartDate: string;
  target: number;
  earned: number;
  cumulative: number;
  cumulativeTarget: number;
  status: 'ahead' | 'on-track' | 'behind' | 'critical' | 'future';
  capacityCategory?: 'boosted' | 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
}

interface RetroplanMilestone {
  weekNumber: number;
  adjustedTarget: number;
  cumulativeTarget: number;
  capacity: {
    weekStartDate: string;
    capacityCategory: 'boosted' | 'high' | 'medium' | 'low' | 'protected';
    effectiveHours: number;
  };
}

interface WeeklyProgressCardsProps {
  goal: Goal;
  currency?: Currency;
  /** Optional: actual weekly earnings data */
  weeklyEarnings?: Array<{ week: number; earned: number }>;
  /** Hourly rate for earnings calculations (from profile.minHourlyRate) */
  hourlyRate?: number;
  /** Optional: simulated date for testing (defaults to current date) */
  simulatedDate?: Date;
}

export function WeeklyProgressCards(props: WeeklyProgressCardsProps) {
  const currency = () => props.currency || 'USD';
  const [retroplan, setRetroplan] = createSignal<{
    milestones: RetroplanMilestone[];
    feasibilityScore?: number;
  } | null>(null);
  let scrollContainerRef: HTMLDivElement | undefined;

  // Enable horizontal scroll with mouse wheel and drag-to-scroll
  onMount(() => {
    // Wheel scroll
    const handleWheel = (e: WheelEvent) => {
      if (scrollContainerRef && e.deltaY !== 0) {
        e.preventDefault();
        scrollContainerRef.scrollLeft += e.deltaY;
      }
    };

    // Drag-to-scroll state
    let isDragging = false;
    let startX = 0;
    let scrollLeft = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (!scrollContainerRef) return;
      isDragging = true;
      startX = e.pageX - scrollContainerRef.offsetLeft;
      scrollLeft = scrollContainerRef.scrollLeft;
      scrollContainerRef.style.cursor = 'grabbing';
      scrollContainerRef.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !scrollContainerRef) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.offsetLeft;
      const walk = (x - startX) * 1.5; // Multiplier for scroll speed
      scrollContainerRef.scrollLeft = scrollLeft - walk;
    };

    const handleMouseUp = () => {
      if (!scrollContainerRef) return;
      isDragging = false;
      scrollContainerRef.style.cursor = 'grab';
      scrollContainerRef.style.userSelect = '';
    };

    const handleMouseLeave = () => {
      if (isDragging && scrollContainerRef) {
        isDragging = false;
        scrollContainerRef.style.cursor = 'grab';
        scrollContainerRef.style.userSelect = '';
      }
    };

    scrollContainerRef?.addEventListener('wheel', handleWheel, { passive: false });
    scrollContainerRef?.addEventListener('mousedown', handleMouseDown);
    scrollContainerRef?.addEventListener('mousemove', handleMouseMove);
    scrollContainerRef?.addEventListener('mouseup', handleMouseUp);
    scrollContainerRef?.addEventListener('mouseleave', handleMouseLeave);

    onCleanup(() => {
      scrollContainerRef?.removeEventListener('wheel', handleWheel);
      scrollContainerRef?.removeEventListener('mousedown', handleMouseDown);
      scrollContainerRef?.removeEventListener('mousemove', handleMouseMove);
      scrollContainerRef?.removeEventListener('mouseup', handleMouseUp);
      scrollContainerRef?.removeEventListener('mouseleave', handleMouseLeave);
    });
  });

  // Fetch retroplan data
  createEffect(() => {
    const goal = props.goal;
    if (goal.status === 'active' && goal.deadline && goal.amount) {
      fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_retroplan',
          goalId: goal.id,
          goalAmount: goal.amount,
          deadline: goal.deadline,
          academicEvents: (goal.planData as { academicEvents?: unknown[] })?.academicEvents || [],
          // Pass hourlyRate from profile for consistent feasibility calculations
          hourlyRate: props.hourlyRate,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.retroplan) setRetroplan(data.retroplan);
        })
        .catch(() => {});
    }
  });

  // Calculate current week info from simulated date
  const weekInfo = createMemo(() => {
    const plan = retroplan();
    if (!plan?.milestones?.length) return null;

    // Get start date from first milestone
    const startDate = plan.milestones[0]?.capacity.weekStartDate;
    if (!startDate) return null;

    return getCurrentWeekInfo(startDate, plan.milestones.length, props.simulatedDate);
  });

  // Generate week data from retroplan
  const weeks = createMemo<WeekData[]>(() => {
    const plan = retroplan();
    if (!plan?.milestones) return [];

    const now = props.simulatedDate || new Date();
    // Only use explicit weekly earnings data - don't invent earnings from goal.progress
    // goal.progress is unreliable and can show inflated values (e.g., 100% = 3000€ when only 87€ earned)
    const earningsMap = new Map(props.weeklyEarnings?.map((w) => [w.week, w.earned]) || []);
    const hasExplicitEarnings = props.weeklyEarnings && props.weeklyEarnings.length > 0;

    return plan.milestones.map((m, idx) => {
      const weekStart = new Date(m.capacity.weekStartDate);
      const isFuture = weekStart > now;

      // Only show earnings if we have explicit data - don't fabricate from goal.progress
      let earned = 0;
      if (!isFuture && hasExplicitEarnings) {
        const explicitEarned = earningsMap.get(m.weekNumber);
        if (explicitEarned !== undefined) {
          earned = explicitEarned;
        }
      }

      // Calculate cumulative earnings up to this week (only from explicit data)
      const cumulative = hasExplicitEarnings
        ? plan.milestones.slice(0, idx + 1).reduce((sum, p) => {
            const pWeekStart = new Date(p.capacity.weekStartDate);
            const pIsFuture = pWeekStart > now;
            if (pIsFuture) return sum;

            const pExplicit = earningsMap.get(p.weekNumber);
            return sum + (pExplicit || 0);
          }, 0)
        : 0;

      // Determine status based on cumulative progress vs cumulative target
      let status: WeekData['status'];
      if (isFuture) {
        status = 'future';
      } else if (!hasExplicitEarnings) {
        // No earnings data - show as "on-track" (neutral) instead of misleading "critical"
        // User hasn't logged earnings yet, we can't judge progress
        status = 'on-track';
      } else if (cumulative >= m.cumulativeTarget * 1.05) {
        status = 'ahead';
      } else if (cumulative >= m.cumulativeTarget * 0.9) {
        status = 'on-track';
      } else if (cumulative >= m.cumulativeTarget * 0.4) {
        status = 'behind';
      } else {
        status = 'critical'; // < 40% of target
      }

      return {
        weekNumber: m.weekNumber,
        weekStartDate: m.capacity.weekStartDate,
        target: m.adjustedTarget,
        earned,
        cumulative,
        cumulativeTarget: m.cumulativeTarget,
        status,
        capacityCategory: m.capacity.capacityCategory,
        effectiveHours: m.capacity.effectiveHours,
      };
    });
  });

  // Stats summary
  const hasExplicitEarningsData = () => props.weeklyEarnings && props.weeklyEarnings.length > 0;

  const stats = createMemo(() => {
    const weekData = weeks();
    // Only count weeks with actual data (not 'future' status)
    const pastWeeks = weekData.filter((w) => w.status !== 'future');
    const aheadWeeks = pastWeeks.filter((w) => w.status === 'ahead').length;
    const behindWeeks = pastWeeks.filter((w) => w.status === 'behind').length;
    const criticalWeeks = pastWeeks.filter((w) => w.status === 'critical').length;
    const totalEarned = pastWeeks.reduce((sum, w) => sum + w.earned, 0);
    const totalTarget = pastWeeks.reduce((sum, w) => sum + w.target, 0);

    // Determine overall status
    let overallStatus: WeekData['status'];
    if (!hasExplicitEarningsData()) {
      // No earnings data - show neutral status
      overallStatus = 'on-track';
    } else if (totalEarned >= totalTarget) {
      overallStatus = 'ahead';
    } else if (totalEarned >= totalTarget * 0.9) {
      overallStatus = 'on-track';
    } else if (totalEarned >= totalTarget * 0.4) {
      overallStatus = 'behind';
    } else {
      overallStatus = 'critical';
    }

    return {
      totalWeeks: weekData.length,
      pastWeeks: pastWeeks.length,
      aheadWeeks,
      behindWeeks,
      criticalWeeks,
      totalEarned,
      totalTarget,
      overallStatus,
      hasData: hasExplicitEarningsData(),
    };
  });

  const statusConfig: Record<
    WeekData['status'],
    { icon: string; bg: string; border: string; text: string }
  > = {
    ahead: {
      icon: '🚀',
      bg: 'bg-green-500/10',
      border: 'border-green-500/40',
      text: 'text-green-600 dark:text-green-400',
    },
    'on-track': {
      icon: '✓',
      bg: 'bg-primary/10',
      border: 'border-primary/40',
      text: 'text-primary',
    },
    behind: {
      icon: '⚠',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/40',
      text: 'text-amber-600 dark:text-amber-400',
    },
    critical: {
      icon: '🔴',
      bg: 'bg-red-500/10',
      border: 'border-red-500/40',
      text: 'text-red-600 dark:text-red-400',
    },
    future: {
      icon: '○',
      bg: 'bg-muted/50',
      border: 'border-border',
      text: 'text-muted-foreground',
    },
  };

  const capacityIcons = {
    boosted: '🚀',
    high: '🟢',
    medium: '🟡',
    low: '🟠',
    protected: '🔴',
  };

  return (
    <div class="space-y-4">
      {/* Summary Stats */}
      <div class="flex items-center justify-between text-sm">
        <div class="flex items-center gap-4">
          <span class="text-muted-foreground">{stats().totalWeeks} weeks total</span>
          <Show when={stats().hasData && stats().aheadWeeks > 0}>
            <span class="text-green-600 dark:text-green-400">🚀 {stats().aheadWeeks} ahead</span>
          </Show>
          <Show when={stats().hasData && stats().behindWeeks > 0}>
            <span class="text-amber-600 dark:text-amber-400">⚠ {stats().behindWeeks} behind</span>
          </Show>
          <Show when={stats().hasData && stats().criticalWeeks > 0}>
            <span class="text-red-600 dark:text-red-400">🔴 {stats().criticalWeeks} critical</span>
          </Show>
          <Show when={!stats().hasData}>
            <span class="text-muted-foreground italic">Log earnings on /suivi</span>
          </Show>
        </div>
        <Show
          when={stats().hasData}
          fallback={
            <span class="text-muted-foreground">
              Target: {formatCurrency(props.goal.amount, currency())}
            </span>
          }
        >
          <div class={`font-medium ${statusConfig[stats().overallStatus].text}`}>
            {formatCurrency(stats().totalEarned, currency())} /{' '}
            {formatCurrency(stats().totalTarget, currency())}
          </div>
        </Show>
      </div>

      {/* Horizontal Scrollable Cards - native scroll with wheel support */}
      <div
        ref={scrollContainerRef}
        class="overflow-x-auto pb-2 scrollbar-thin cursor-grab active:cursor-grabbing"
      >
        <div class="flex gap-2 pb-1 px-0.5" style={{ 'min-width': 'max-content' }}>
          <For each={weeks()}>
            {(week) => {
              const config = statusConfig[week.status];

              // Check if this is the current week using weekCalculator
              const currentWeekNum = weekInfo()?.weekNumber ?? 0;
              const isCurrentWeek = week.weekNumber === currentWeekNum && week.status !== 'future';
              const daysIntoWeek = weekInfo()?.daysIntoWeek ?? 0;

              const progressPercent =
                week.target > 0 ? Math.min(100, Math.round((week.earned / week.target) * 100)) : 0;

              // Format date nicely (e.g., "Jan 27")
              const formatWeekDate = (dateStr: string) => {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              };

              return (
                <div
                  class={cn(
                    'flex-shrink-0 w-28 p-2 rounded-lg border-2 transition-all relative',
                    config.bg,
                    config.border,
                    isCurrentWeek && 'ring-2 ring-green-500 ring-offset-2 animate-pulse-subtle'
                  )}
                >
                  {/* Mascot emoji for current week */}
                  <Show when={isCurrentWeek}>
                    <div class="absolute -top-3 left-1/2 animate-bounce-slow z-10">
                      <span class="text-lg">🚶</span>
                    </div>
                  </Show>

                  {/* Week header with date */}
                  <div class="flex items-center justify-between mb-1">
                    <div class="flex flex-col">
                      <span class="text-xs font-bold text-foreground">W{week.weekNumber}</span>
                      <span class="text-[9px] text-muted-foreground">
                        {formatWeekDate(week.weekStartDate)}
                      </span>
                    </div>
                    <span class="text-sm" title={week.capacityCategory}>
                      {week.capacityCategory ? capacityIcons[week.capacityCategory] : ''}
                    </span>
                  </div>

                  {/* Status icon */}
                  <div class="flex items-center justify-center mb-1">
                    <span class={`text-lg ${config.text}`}>{config.icon}</span>
                  </div>

                  {/* Workable hours */}
                  <div class="text-center mb-1">
                    <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      ⏱ {week.effectiveHours}h avail
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div class="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                    <div
                      class={`h-full transition-all ${
                        week.status === 'ahead'
                          ? 'bg-green-500'
                          : week.status === 'on-track'
                            ? 'bg-primary'
                            : week.status === 'behind'
                              ? 'bg-amber-500'
                              : week.status === 'critical'
                                ? 'bg-red-500'
                                : 'bg-muted-foreground/30'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Target & Earned */}
                  <div class="text-center">
                    <Show
                      when={week.status !== 'future'}
                      fallback={
                        <p class="text-[10px] text-muted-foreground">
                          {formatCurrency(week.target, currency())}
                        </p>
                      }
                    >
                      <p class={`text-xs font-bold ${config.text}`}>
                        {hasExplicitEarningsData() ? formatCurrency(week.earned, currency()) : '—'}
                      </p>
                      <p class="text-[10px] text-muted-foreground">
                        / {formatCurrency(week.target, currency())}
                      </p>
                    </Show>
                  </div>

                  {/* 7-day progress bar (bricks) for current week */}
                  <Show when={isCurrentWeek}>
                    <div class="flex gap-0.5 mt-2">
                      <For each={[0, 1, 2, 3, 4, 5, 6]}>
                        {(dayIndex) => {
                          const isPastDay = dayIndex < daysIntoWeek;
                          const isToday = dayIndex === daysIntoWeek;
                          return (
                            <div
                              class={cn(
                                'flex-1 h-1.5 rounded-sm transition-all',
                                isPastDay && 'bg-green-500',
                                isToday && 'bg-green-400 animate-day-pulse',
                                !isPastDay && !isToday && 'bg-muted'
                              )}
                              title={
                                isPastDay
                                  ? `Day ${dayIndex + 1}: completed`
                                  : isToday
                                    ? `Day ${dayIndex + 1}: today`
                                    : `Day ${dayIndex + 1}: upcoming`
                              }
                            />
                          );
                        }}
                      </For>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </div>

      {/* Legend */}
      <div class="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span>🚀 Ahead</span>
        <span>✓ On track</span>
        <span>⚠ Behind</span>
        <span>🔴 Critical</span>
        <span>○ Future</span>
        <span class="border-l border-border pl-3">
          Capacity: 🟢 High 🟡 Med 🟠 Low 🔴 Protected
        </span>
      </div>
    </div>
  );
}

export default WeeklyProgressCards;
