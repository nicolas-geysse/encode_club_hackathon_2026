/**
 * Capacity Forecast Component
 *
 * Shows the current week's capacity (HIGH/MEDIUM/LOW/PROTECTED)
 * with hours available and color coding.
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { Zap, Shield, AlertTriangle, Clock, TrendingUp, CalendarClock } from 'lucide-solid';
import { createLogger } from '~/lib/logger';

const logger = createLogger('CapacityForecast');

interface WeekCapacity {
  weekNumber: number;
  weekStartDate: string;
  capacityScore: number;
  capacityCategory: 'high' | 'medium' | 'low' | 'protected';
  effectiveHours: number;
  academicMultiplier: number;
  energyMultiplier: number;
}

interface CapacityForecastProps {
  goalId?: string;
  userId?: string;
  onViewDetails?: () => void;
}

const CAPACITY_CONFIG = {
  high: {
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    icon: TrendingUp,
    label: 'High Capacity',
    description: 'Great week for extra work!',
  },
  medium: {
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    icon: Clock,
    label: 'Medium Capacity',
    description: 'Balanced week ahead',
  },
  low: {
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    icon: AlertTriangle,
    label: 'Low Capacity',
    description: 'Take it easy this week',
  },
  protected: {
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    icon: Shield,
    label: 'Protected Week',
    description: 'Focus on exams/deadlines',
  },
};

export function CapacityForecast(props: CapacityForecastProps) {
  const [capacity, setCapacity] = createSignal<WeekCapacity | null>(null);
  const [loading, setLoading] = createSignal(false);

  const fetchCapacity = async () => {
    if (!props.goalId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_week_capacity',
          goalId: props.goalId,
          userId: props.userId || 'default',
          weekOffset: 0, // Current week
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.capacity) {
          setCapacity(data.capacity);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch capacity', { error: err });
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.goalId) {
      fetchCapacity();
    }
  });

  const config = () => {
    const cap = capacity();
    if (!cap) return CAPACITY_CONFIG.medium;
    return CAPACITY_CONFIG[cap.capacityCategory] || CAPACITY_CONFIG.medium;
  };

  return (
    <Show when={!loading() && capacity()}>
      <Card class={`${config().bgColor} ${config().borderColor} border`}>
        <CardContent class="p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class={`p-2 rounded-lg ${config().bgColor}`}>
                {(() => {
                  const Icon = config().icon;
                  return <Icon class={`h-5 w-5 ${config().color}`} />;
                })()}
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class={`text-sm font-bold uppercase ${config().color}`}>
                    {config().label}
                  </span>
                  <Tooltip>
                    <TooltipTrigger>
                      <span class="text-xs text-muted-foreground cursor-help">
                        Week {capacity()!.weekNumber}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div class="text-xs space-y-1">
                        <div>
                          Academic load: {Math.round(capacity()!.academicMultiplier * 100)}%
                        </div>
                        <div>Energy: {Math.round(capacity()!.energyMultiplier * 100)}%</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p class="text-xs text-muted-foreground">{config().description}</p>
              </div>
            </div>

            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="flex items-center gap-1">
                  <Zap class={`h-4 w-4 ${config().color}`} />
                  <span class={`text-2xl font-bold ${config().color}`}>
                    {capacity()!.effectiveHours}h
                  </span>
                </div>
                <span class="text-xs text-muted-foreground">available</span>
              </div>
              <Show when={props.onViewDetails}>
                <button
                  type="button"
                  onClick={() => props.onViewDetails?.()}
                  class={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${config().borderColor} ${config().color} hover:bg-black/5 dark:hover:bg-white/5`}
                >
                  <CalendarClock class="h-4 w-4" />
                  <span class="hidden sm:inline">View plan</span>
                </button>
              </Show>
            </div>
          </div>
        </CardContent>
      </Card>
    </Show>
  );
}

export default CapacityForecast;
