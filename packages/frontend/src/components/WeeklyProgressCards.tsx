/**
 * Weekly Progress Cards Component
 *
 * Horizontal scrollable cards showing week-by-week progress towards a goal.
 * Each card shows: week number, target, actual earnings, status (ahead/behind).
 */

import { For, Show, createMemo, createSignal, createEffect, onMount, onCleanup } from 'solid-js';
import type { Goal } from '~/lib/goalService';
import { formatCurrency, type Currency } from '~/lib/dateUtils';

interface WeekData {
  weekNumber: number;
  weekStartDate: string;
  target: number;
  earned: number;
  cumulative: number;
  cumulativeTarget: number;
  status: 'ahead' | 'on-track' | 'behind' | 'future';
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
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.retroplan) setRetroplan(data.retroplan);
        })
        .catch(() => {});
    }
  });

  // Generate week data from retroplan
  const weeks = createMemo<WeekData[]>(() => {
    const plan = retroplan();
    if (!plan?.milestones) return [];

    const currentSaved = Math.round((props.goal.amount * (props.goal.progress || 0)) / 100);
    const now = new Date();
    const earningsMap = new Map(props.weeklyEarnings?.map((w) => [w.week, w.earned]) || []);

    return plan.milestones.map((m, idx) => {
      const weekStart = new Date(m.capacity.weekStartDate);
      const isFuture = weekStart > now;
      const isPast =
        idx === 0
          ? false
          : new Date(plan.milestones[idx - 1].capacity.weekStartDate) < now && weekStart > now;

      // For demo: simulate earnings based on progress
      // In real app, this would come from actual tracking data
      const simulatedEarned = isFuture
        ? 0
        : Math.round(m.adjustedTarget * (0.8 + Math.random() * 0.4)); // ±20% variance
      const earned = earningsMap.get(m.weekNumber) ?? (idx < 3 ? simulatedEarned : 0);

      // Calculate cumulative
      const prevCumulative =
        idx > 0
          ? plan.milestones.slice(0, idx).reduce((sum, p) => {
              const prevEarned =
                earningsMap.get(p.weekNumber) ??
                (plan.milestones.indexOf(p) < 3
                  ? Math.round(p.adjustedTarget * (0.8 + Math.random() * 0.4))
                  : 0);
              return sum + prevEarned;
            }, 0)
          : 0;
      const cumulative = prevCumulative + earned;

      // Determine status
      let status: WeekData['status'];
      if (isFuture) {
        status = 'future';
      } else if (cumulative >= m.cumulativeTarget * 1.05) {
        status = 'ahead';
      } else if (cumulative >= m.cumulativeTarget * 0.9) {
        status = 'on-track';
      } else {
        status = 'behind';
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
  const stats = createMemo(() => {
    const weekData = weeks();
    const pastWeeks = weekData.filter((w) => w.status !== 'future');
    const aheadWeeks = pastWeeks.filter((w) => w.status === 'ahead').length;
    const behindWeeks = pastWeeks.filter((w) => w.status === 'behind').length;
    const totalEarned = pastWeeks.reduce((sum, w) => sum + w.earned, 0);
    const totalTarget = pastWeeks.reduce((sum, w) => sum + w.target, 0);

    return {
      totalWeeks: weekData.length,
      pastWeeks: pastWeeks.length,
      aheadWeeks,
      behindWeeks,
      totalEarned,
      totalTarget,
      overallStatus: (totalEarned >= totalTarget
        ? 'ahead'
        : totalEarned >= totalTarget * 0.9
          ? 'on-track'
          : 'behind') as WeekData['status'],
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
          <span class="text-muted-foreground">
            {stats().pastWeeks} / {stats().totalWeeks} weeks
          </span>
          <Show when={stats().aheadWeeks > 0}>
            <span class="text-green-600 dark:text-green-400">🚀 {stats().aheadWeeks} ahead</span>
          </Show>
          <Show when={stats().behindWeeks > 0}>
            <span class="text-amber-600 dark:text-amber-400">⚠ {stats().behindWeeks} behind</span>
          </Show>
        </div>
        <div class={`font-medium ${statusConfig[stats().overallStatus].text}`}>
          {formatCurrency(stats().totalEarned, currency())} /{' '}
          {formatCurrency(stats().totalTarget, currency())}
        </div>
      </div>

      {/* Horizontal Scrollable Cards - native scroll with wheel support */}
      <div
        ref={scrollContainerRef}
        class="overflow-x-auto pb-2 scrollbar-thin cursor-grab active:cursor-grabbing"
      >
        <div class="flex gap-2 pb-1 px-0.5" style={{ 'min-width': 'max-content' }}>
          <For each={weeks()}>
            {(week, idx) => {
              const config = statusConfig[week.status];
              const isCurrentWeek =
                idx() === 0 ||
                (idx() > 0 && weeks()[idx() - 1].status !== 'future' && week.status === 'future');
              const progressPercent =
                week.target > 0 ? Math.min(100, Math.round((week.earned / week.target) * 100)) : 0;

              // Format date nicely (e.g., "Jan 27")
              const formatWeekDate = (dateStr: string) => {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              };

              return (
                <div
                  class={`flex-shrink-0 w-28 p-2 rounded-lg border-2 transition-all ${config.bg} ${config.border} ${
                    isCurrentWeek ? 'ring-2 ring-primary/30' : ''
                  }`}
                >
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
                              : 'bg-muted-foreground/30'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Target & Earned */}
                  <div class="text-center">
                    <Show when={week.status !== 'future'}>
                      <p class={`text-xs font-bold ${config.text}`}>
                        {formatCurrency(week.earned, currency())}
                      </p>
                    </Show>
                    <p class="text-[10px] text-muted-foreground">
                      / {formatCurrency(week.target, currency())}
                    </p>
                  </div>

                  {/* Current week badge */}
                  <Show when={isCurrentWeek && week.status !== 'future'}>
                    <div class="mt-1 text-center">
                      <span class="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary font-medium">
                        NOW
                      </span>
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
        <span>○ Future</span>
        <span class="border-l border-border pl-3">
          Capacity: 🟢 High 🟡 Med 🟠 Low 🔴 Protected
        </span>
      </div>
    </div>
  );
}

export default WeeklyProgressCards;
