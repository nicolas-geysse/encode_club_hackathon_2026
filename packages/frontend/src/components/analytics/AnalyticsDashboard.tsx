/**
 * Analytics Dashboard Component (Simplified)
 *
 * Shows only financial breakdown (income + expenses).
 * Always visible, no collapse. Other metrics moved to dedicated components.
 */

import { createSignal, onMount, Show, For } from 'solid-js';

interface AnalyticsData {
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netMargin: number;
  };
  incomeBreakdown: { source: string; amount: number; percentage: number }[];
  expenseBreakdown: { category: string; amount: number; percentage: number }[];
}

interface AnalyticsDashboardProps {
  profileId?: string;
}

export function AnalyticsDashboard(props: AnalyticsDashboardProps) {
  const [data, setData] = createSignal<AnalyticsData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    await loadAnalytics();
  });

  const loadAnalytics = async () => {
    setLoading(true);
    setError(null);

    try {
      const url = props.profileId
        ? `/api/analytics?profileId=${props.profileId}`
        : '/api/analytics';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load analytics');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const hasData = () => {
    const d = data();
    if (!d) return false;
    return d.incomeBreakdown.length > 0 || d.expenseBreakdown.length > 0;
  };

  return (
    <div class="card">
      {/* Header */}
      <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
        <span>📊</span> Financial Breakdown
      </h3>

      {/* Loading state */}
      <Show when={loading()}>
        <div class="flex items-center justify-center py-8">
          <div class="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
        </div>
      </Show>

      {/* Error state */}
      <Show when={error()}>
        <div class="text-center py-6">
          <p class="text-red-500 dark:text-red-400 text-sm">{error()}</p>
          <button
            type="button"
            onClick={loadAnalytics}
            class="mt-2 text-sm text-primary-600 dark:text-primary-400 hover:underline"
          >
            Try again
          </button>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && !error() && !hasData()}>
        <div class="text-center py-8 text-slate-500 dark:text-slate-400">
          <div class="text-3xl mb-2">💸</div>
          <p class="text-sm">No financial data yet</p>
          <p class="text-xs mt-1">Complete missions to see your breakdown</p>
        </div>
      </Show>

      {/* Data display */}
      <Show when={data() && !loading() && hasData()}>
        {/* Summary row */}
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div class="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <div class="text-lg font-bold text-green-700 dark:text-green-400">
              +${data()!.summary.totalIncome}
            </div>
            <div class="text-xs text-green-600 dark:text-green-500">Income</div>
          </div>
          <div class="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <div class="text-lg font-bold text-red-700 dark:text-red-400">
              -${data()!.summary.totalExpenses}
            </div>
            <div class="text-xs text-red-600 dark:text-red-500">Expenses</div>
          </div>
          <div
            class={`rounded-lg p-3 text-center ${
              data()!.summary.netMargin >= 0
                ? 'bg-primary-50 dark:bg-primary-900/20'
                : 'bg-amber-50 dark:bg-amber-900/20'
            }`}
          >
            <div
              class={`text-lg font-bold ${
                data()!.summary.netMargin >= 0
                  ? 'text-primary-700 dark:text-primary-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {data()!.summary.netMargin >= 0 ? '+$' : '-$'}
              {Math.abs(data()!.summary.netMargin)}
            </div>
            <div class="text-xs text-slate-600 dark:text-slate-400">Net</div>
          </div>
        </div>

        {/* Breakdown columns */}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Income breakdown */}
          <Show when={data()!.incomeBreakdown.length > 0}>
            <div>
              <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-2 text-sm">
                Income by Source
              </h4>
              <div class="space-y-1.5">
                <For each={data()!.incomeBreakdown}>
                  {(item) => (
                    <div class="flex items-center justify-between text-sm">
                      <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-green-500" />
                        <span class="text-slate-600 dark:text-slate-400">{item.source}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-slate-900 dark:text-slate-100 font-medium">
                          ${item.amount}
                        </span>
                        <span class="text-xs text-slate-400 w-10 text-right">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Expense breakdown */}
          <Show when={data()!.expenseBreakdown.length > 0}>
            <div>
              <h4 class="font-medium text-slate-700 dark:text-slate-300 mb-2 text-sm">
                Expenses by Category
              </h4>
              <div class="space-y-1.5">
                <For each={data()!.expenseBreakdown}>
                  {(item) => (
                    <div class="flex items-center justify-between text-sm">
                      <div class="flex items-center gap-2">
                        <div class="w-2 h-2 rounded-full bg-red-500" />
                        <span class="text-slate-600 dark:text-slate-400">{item.category}</span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-slate-900 dark:text-slate-100 font-medium">
                          ${item.amount}
                        </span>
                        <span class="text-xs text-slate-400 w-10 text-right">
                          {item.percentage}%
                        </span>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Refresh link */}
        <div class="text-center mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
          <button
            type="button"
            onClick={loadAnalytics}
            class="text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            Refresh
          </button>
        </div>
      </Show>
    </div>
  );
}
