/**
 * Metric Card Component
 *
 * Displays a single metric with label, value, and optional trend.
 */

import { Show } from 'solid-js';

interface MetricCardProps {
  label: string;
  value: string | number;
  icon?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  color?: 'default' | 'green' | 'red' | 'blue' | 'amber';
  format?: 'currency' | 'percentage' | 'number' | 'hours';
}

export function MetricCard(props: MetricCardProps) {
  const formatValue = () => {
    const val = props.value;
    if (typeof val === 'string') return val;

    switch (props.format) {
      case 'currency':
        return `${val.toLocaleString()}€`;
      case 'percentage':
        return `${val}%`;
      case 'hours':
        return `${val}h`;
      default:
        return val.toLocaleString();
    }
  };

  const getColorClasses = () => {
    switch (props.color) {
      case 'green':
        return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'red':
        return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'blue':
        return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'amber':
        return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800';
      default:
        return 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700';
    }
  };

  const getTrendColor = () => {
    if (!props.trend) return '';
    switch (props.trend.direction) {
      case 'up':
        return 'text-green-600 dark:text-green-400';
      case 'down':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  const getTrendIcon = () => {
    if (!props.trend) return '';
    switch (props.trend.direction) {
      case 'up':
        return '↑';
      case 'down':
        return '↓';
      default:
        return '→';
    }
  };

  return (
    <div class={`rounded-xl border p-4 ${getColorClasses()}`}>
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm text-slate-500 dark:text-slate-400">{props.label}</p>
          <p class="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatValue()}</p>
        </div>
        <Show when={props.icon}>
          <span class="text-2xl">{props.icon}</span>
        </Show>
      </div>
      <Show when={props.trend}>
        <div class={`flex items-center gap-1 mt-2 text-sm font-medium ${getTrendColor()}`}>
          <span>{getTrendIcon()}</span>
          <span>{Math.abs(props.trend!.value)}%</span>
          <span class="text-slate-400 dark:text-slate-500 font-normal">vs last week</span>
        </div>
      </Show>
    </div>
  );
}
