/**
 * Analytics Dashboard Component (Simplified)
 *
 * Shows only financial breakdown (income + expenses).
 * Always visible, no collapse. Other metrics moved to dedicated components.
 */

import { createSignal, onMount, Show, For } from 'solid-js';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Wallet } from 'lucide-solid';

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
  currency?: Currency;
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
    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2 text-lg">
          <BarChart3 class="h-5 w-5 text-primary" />
          Financial Breakdown
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Loading state */}
        <Show when={loading()}>
          <div class="flex items-center justify-center py-8">
            <div class="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </Show>

        {/* Error state */}
        <Show when={error()}>
          <div class="text-center py-6">
            <p class="text-destructive text-sm">{error()}</p>
            <button
              type="button"
              onClick={loadAnalytics}
              class="mt-2 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        </Show>

        {/* Empty state */}
        <Show when={!loading() && !error() && !hasData()}>
          <div class="text-center py-8 text-muted-foreground">
            <Wallet class="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p class="text-sm">No financial data yet</p>
            <p class="text-xs mt-1">Complete missions to see your breakdown</p>
          </div>
        </Show>

        {/* Data display */}
        <Show when={data() && !loading() && hasData()}>
          {/* Summary row */}
          <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-green-500/10 rounded-lg p-4 text-center border border-green-500/20">
              <div class="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(data()!.summary.totalIncome, props.currency, { showSign: true })}
              </div>
              <div class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Income
              </div>
            </div>
            <div class="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/20">
              <div class="text-lg font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(data()!.summary.totalExpenses, props.currency)}
              </div>
              <div class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Expenses
              </div>
            </div>
            <div
              class={`rounded-lg p-4 text-center border ${
                data()!.summary.netMargin >= 0
                  ? 'bg-primary/10 border-primary/20'
                  : 'bg-amber-500/10 border-amber-500/20'
              }`}
            >
              <div
                class={`text-lg font-bold ${
                  data()!.summary.netMargin >= 0
                    ? 'text-primary'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {formatCurrency(data()!.summary.netMargin, props.currency, { showSign: true })}
              </div>
              <div class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Net
              </div>
            </div>
          </div>

          {/* Breakdown columns */}
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Income breakdown */}
            <Show when={data()!.incomeBreakdown.length > 0}>
              <div>
                <h4 class="font-medium text-foreground mb-4 text-sm flex items-center gap-2">
                  <TrendingUp class="h-4 w-4 text-green-500" />
                  Income by Source
                </h4>
                <div class="space-y-3">
                  <For each={data()!.incomeBreakdown}>
                    {(item) => (
                      <div class="flex items-center justify-between text-sm group">
                        <div class="flex items-center gap-3">
                          <div class="w-1.5 h-1.5 rounded-full bg-green-500 ring-2 ring-green-500/20" />
                          <span class="text-muted-foreground group-hover:text-foreground transition-colors">
                            {item.source}
                          </span>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="font-medium text-foreground">
                            {formatCurrency(item.amount, props.currency)}
                          </span>
                          <span class="text-xs text-muted-foreground w-8 text-right bg-muted px-1 rounded">
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
                <h4 class="font-medium text-foreground mb-4 text-sm flex items-center gap-2">
                  <TrendingDown class="h-4 w-4 text-red-500" />
                  Expenses by Category
                </h4>
                <div class="space-y-3">
                  <For each={data()!.expenseBreakdown}>
                    {(item) => (
                      <div class="flex items-center justify-between text-sm group">
                        <div class="flex items-center gap-3">
                          <div class="w-1.5 h-1.5 rounded-full bg-red-500 ring-2 ring-red-500/20" />
                          <span class="text-muted-foreground group-hover:text-foreground transition-colors">
                            {item.category}
                          </span>
                        </div>
                        <div class="flex items-center gap-3">
                          <span class="font-medium text-foreground">
                            {formatCurrency(item.amount, props.currency)}
                          </span>
                          <span class="text-xs text-muted-foreground w-8 text-right bg-muted px-1 rounded">
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
          <div class="text-center mt-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={loadAnalytics}
              class="text-xs text-muted-foreground hover:text-primary hover:underline transition-colors"
            >
              Refresh data
            </button>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
