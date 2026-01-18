/**
 * Metric Card Component
 *
 * Displays a single metric with label, value, and optional trend.
 */

import { Show, type Component } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Card, CardContent } from '~/components/ui/Card';
import { ArrowUp, ArrowDown, ArrowRight } from 'lucide-solid';
import { cn } from '~/lib/cn';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: Component<{ class?: string }>;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  color?: 'default' | 'green' | 'red' | 'blue' | 'amber';
  format?: 'currency' | 'percentage' | 'number' | 'hours';
  currencySymbol?: string;
}

export function MetricCard(props: MetricCardProps) {
  const formatValue = () => {
    const val = props.value;
    if (typeof val === 'string') return val;

    switch (props.format) {
      case 'currency': {
        const symbol = props.currencySymbol || '$';
        return `${symbol}${val.toLocaleString()}`;
      }
      case 'percentage':
        return `${val}%`;
      case 'hours':
        return `${val}h`;
      default:
        return val.toLocaleString();
    }
  };

  return (
    <Card
      class={cn(
        'hover:shadow-md transition-shadow',
        props.color === 'green' &&
          'border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-900/10',
        props.color === 'red' &&
          'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-900/10',
        props.color === 'blue' &&
          'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-900/10',
        props.color === 'amber' &&
          'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-900/10'
      )}
    >
      <CardContent class="p-6">
        <div class="flex items-center justify-between space-y-0 pb-2">
          <p class="text-sm font-medium text-muted-foreground">{props.label}</p>
          <Show when={props.icon}>
            <div
              class={cn(
                'h-4 w-4 text-muted-foreground',
                props.color === 'green' && 'text-green-600',
                props.color === 'red' && 'text-red-600'
              )}
            >
              <Dynamic component={props.icon} class="h-4 w-4" />
            </div>
          </Show>
        </div>
        <div class="flex items-center space-x-2">
          <div class="text-2xl font-bold">{formatValue()}</div>
        </div>
        <Show when={props.trend}>
          <div
            class={cn(
              'flex items-center text-xs',
              props.trend!.direction === 'up'
                ? 'text-green-600 dark:text-green-400'
                : props.trend!.direction === 'down'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
            )}
          >
            <Show when={props.trend!.direction === 'up'}>
              <ArrowUp class="mr-1 h-3 w-3" />
            </Show>
            <Show when={props.trend!.direction === 'down'}>
              <ArrowDown class="mr-1 h-3 w-3" />
            </Show>
            <Show when={props.trend!.direction === 'neutral'}>
              <ArrowRight class="mr-1 h-3 w-3" />
            </Show>
            <span class="font-medium">{Math.abs(props.trend!.value)}%</span>
            <span class="ml-1 text-muted-foreground">vs last week</span>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
