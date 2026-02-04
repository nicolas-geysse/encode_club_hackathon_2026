import { Show, createMemo } from 'solid-js';
import { formatCurrency } from '~/lib/dateUtils';
import type { Currency } from '~/lib/dateUtils';
import {
  Rocket,
  CheckCircle2,
  TrendingUp,
  AlertTriangle,
  AlertOctagon,
  Ban,
  AlertCircle,
} from 'lucide-solid';

interface GoalMetricsProps {
  goal: {
    amount: number;
    deadline?: string | null;
    progress?: number;
  };
  currency: Currency;
  adjustedProgress: number;
  feasibilityScore: number | null;
  simulatedDate?: Date;
  isLoading?: boolean;
}

export function GoalMetrics(props: GoalMetricsProps) {
  // Days Remaining Calculation
  const daysRemaining = createMemo(() => {
    if (!props.goal.deadline) return null;
    const deadline = new Date(props.goal.deadline!);
    const now = props.simulatedDate || new Date();
    const diffTime = deadline.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  });

  const formattedDeadline = createMemo(() => {
    if (!props.goal.deadline) return null;
    return new Date(props.goal.deadline!).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  });

  const getDeadlineColor = () => {
    const days = daysRemaining();
    if (days === null) return 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300';

    // Overdue or Today
    if (days <= 0)
      return 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-2 border-red-500/50';

    // Critical (< 3 days)
    if (days <= 3)
      return 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800';

    // Warning (< 1 week)
    if (days <= 7)
      return 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800';

    // Approaching (< 2 weeks)
    if (days <= 14)
      return 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800';

    // Safe
    return 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800';
  };

  const getProgressColor = () => {
    const p = props.adjustedProgress;
    if (p >= 100) return 'text-green-600 dark:text-green-400';
    if (p >= 75) return 'text-emerald-600 dark:text-emerald-400';
    if (p >= 50) return 'text-lime-600 dark:text-lime-400';
    if (p >= 25) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const feasibility = createMemo(() => {
    const score = props.feasibilityScore;

    if (score === null) {
      if (props.isLoading) {
        return {
          bg: 'bg-slate-100 dark:bg-slate-700/50',
          border: 'border-slate-200 dark:border-slate-600',
          text: 'text-slate-600 dark:text-slate-300',
          label: 'Calculating...',
          icon: <TrendingUp class="h-5 w-5 animate-pulse" />,
        };
      }
      return {
        bg: 'bg-slate-100 dark:bg-slate-700/50',
        border: 'border-slate-200 dark:border-slate-600',
        text: 'text-slate-400 dark:text-slate-500',
        label: 'Not Available',
        icon: <AlertCircle class="h-5 w-5" />,
      };
    }

    // 100% - Perfect
    if (score >= 1.0)
      return {
        bg: 'bg-green-500/10',
        border: 'border-green-500/40',
        text: 'text-green-600 dark:text-green-400',
        label: 'Very Achievable',
        icon: <Rocket class="h-5 w-5" />,
      };

    // 80-99% - Great
    if (score >= 0.8)
      return {
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/40',
        text: 'text-emerald-600 dark:text-emerald-400',
        label: 'High Probability',
        icon: <CheckCircle2 class="h-5 w-5" />,
      };

    // 60-79% - Good but caution
    if (score >= 0.6)
      return {
        bg: 'bg-lime-500/10',
        border: 'border-lime-500/40',
        text: 'text-lime-600 dark:text-lime-400',
        label: 'On Track',
        icon: <TrendingUp class="h-5 w-5" />,
      };

    // 40-59% - Warning
    if (score >= 0.4)
      return {
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/40',
        text: 'text-yellow-600 dark:text-yellow-400',
        label: 'Challenging',
        icon: <AlertTriangle class="h-5 w-5" />,
      };

    // 15-39% - Critical
    if (score >= 0.15)
      return {
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/40',
        text: 'text-orange-600 dark:text-orange-400',
        label: 'High Risk',
        icon: <AlertOctagon class="h-5 w-5" />,
      };

    // < 15% - Impossible
    return {
      bg: 'bg-red-500/10',
      border: 'border-red-500/40',
      text: 'text-red-700 dark:text-red-300',
      label: 'Unrealistic',
      icon: <Ban class="h-5 w-5" />,
    };
  });

  return (
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {/* Target */}
      <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
          Target
        </p>
        <p class="text-lg font-bold text-slate-900 dark:text-slate-100">
          {formatCurrency(props.goal.amount, props.currency)}
        </p>
      </div>

      {/* Deadline */}
      <div class={`rounded-lg p-3 text-center ${getDeadlineColor()}`}>
        <p class="text-xs uppercase tracking-wider mb-1 opacity-80">Deadline</p>
        <Show when={props.goal.deadline} fallback={<p class="text-lg font-bold">Not set</p>}>
          <p class="text-lg font-bold">{formattedDeadline()}</p>
          <p class="text-xs font-medium mt-0.5">
            {daysRemaining() !== null && daysRemaining()! > 0
              ? `${daysRemaining()}d left`
              : daysRemaining() === 0
                ? 'Today!'
                : `${Math.abs(daysRemaining()!)}d overdue`}
          </p>
        </Show>
      </div>

      {/* Progress */}
      <div class="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 text-center">
        <p class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
          Progress
        </p>
        <p class={`text-lg font-bold ${getProgressColor()}`}>
          {Math.round(props.adjustedProgress)}%
        </p>
      </div>

      {/* Achievable */}
      <div
        class={`rounded-lg p-3 text-center border-2 ${feasibility().bg} ${feasibility().border}`}
      >
        <p class={`text-xs uppercase tracking-wider mb-1 ${feasibility().text} opacity-80`}>
          Achievable
        </p>
        <div
          class={`flex items-center justify-center gap-2 text-lg font-bold ${feasibility().text}`}
        >
          {feasibility().icon}
          <span>
            {props.feasibilityScore !== null
              ? `${Math.round(props.feasibilityScore! * 100)}%`
              : '--'}
          </span>
        </div>
        <p class={`text-xs font-medium mt-0.5 ${feasibility().text}`}>{feasibility().label}</p>
      </div>
    </div>
  );
}
