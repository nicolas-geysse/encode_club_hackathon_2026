/**
 * Analytics Dashboard Component (Simplified)
 *
 * Shows only financial breakdown (income + expenses).
 * Always visible, no collapse. Other metrics moved to dedicated components.
 */

import { createSignal, onMount, createEffect, Show, For } from 'solid-js';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { BarChart3, TrendingUp, TrendingDown, Wallet, PiggyBank, Tag, Pause } from 'lucide-solid';

export interface AnalyticsData {
  summary: {
    // Monthly recurring (correct semantics)
    totalIncome: number; // Only recurring income
    totalExpenses: number; // Active monthly expenses
    netMargin: number; // Monthly margin (income - expenses)
    // One-time gains
    tradeSalesCompleted?: number;
    tradeBorrowSavings?: number;
    pausedSavings?: number;
    oneTimeGainsTotal?: number; // Total one-time gains
    // Legacy (deprecated)
    adjustedMargin?: number;
  };
  incomeBreakdown: { source: string; amount: number; percentage: number }[];
  expenseBreakdown: { category: string; amount: number; percentage: number }[];
  savingsBreakdown?: { source: string; amount: number; type: 'trade' | 'paused' }[];
  // Goal projection with correct calculation
  goalProjection?: {
    goalAmount: number;
    monthsRemaining: number;
    fromMonthlyMargin: number;
    fromOneTimeGains: number;
    totalProjected: number;
    potentialExtra: number;
    progressPercent: number;
  };
}

interface AnalyticsDashboardProps {
  profileId?: string;
  currency?: Currency;
  /** Pre-fetched analytics data - if provided, skips internal fetch */
  analyticsData?: AnalyticsData | null;
}

export function AnalyticsDashboard(props: AnalyticsDashboardProps) {
  const [data, setData] = createSignal<AnalyticsData | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  // Use pre-fetched data if provided
  createEffect(() => {
    if (props.analyticsData !== undefined) {
      setData(props.analyticsData);
      setLoading(false);
      setError(null);
    }
  });

  onMount(async () => {
    // Skip fetch if data is provided via prop
    if (props.analyticsData !== undefined) {
      setData(props.analyticsData);
      setLoading(false);
      return;
    }
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
    return (
      d.incomeBreakdown.length > 0 ||
      d.expenseBreakdown.length > 0 ||
      (d.savingsBreakdown && d.savingsBreakdown.length > 0)
    );
  };

  const hasSavings = () => {
    const d = data();
    return d?.savingsBreakdown && d.savingsBreakdown.length > 0;
  };

  const totalSavings = () => {
    const d = data();
    if (!d?.savingsBreakdown) return 0;
    return d.savingsBreakdown.reduce((sum, item) => sum + item.amount, 0);
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
          {/* MONTHLY RECURRING - 3 columns with /mois labels */}
          <div class="grid gap-4 mb-6 grid-cols-3">
            <div class="bg-green-500/10 rounded-lg p-4 text-center border border-green-500/20">
              <div class="text-lg font-bold text-green-600 dark:text-green-400">
                {formatCurrency(data()!.summary.totalIncome, props.currency, { showSign: true })}
              </div>
              <div class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Income <span class="text-green-600/70">/mois</span>
              </div>
            </div>
            <div class="bg-red-500/10 rounded-lg p-4 text-center border border-red-500/20">
              <div class="text-lg font-bold text-red-600 dark:text-red-400">
                -{formatCurrency(data()!.summary.totalExpenses, props.currency)}
              </div>
              <div class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">
                Expenses <span class="text-red-600/70">/mois</span>
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
                Margin{' '}
                <span
                  class={data()!.summary.netMargin >= 0 ? 'text-primary/70' : 'text-amber-600/70'}
                >
                  /mois
                </span>
              </div>
            </div>
          </div>

          {/* ONE-TIME GAINS - shown only if they exist */}
          <Show when={hasSavings()}>
            <div class="bg-emerald-500/5 rounded-lg p-4 mb-6 border border-emerald-500/20">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <PiggyBank class="h-4 w-4 text-emerald-500" />
                  <span class="text-sm font-medium text-foreground">One-Time Gains (realized)</span>
                </div>
                <div class="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                  +{formatCurrency(totalSavings(), props.currency)}
                </div>
              </div>
            </div>
          </Show>

          {/* GOAL PROJECTION - shown only if goal exists */}
          <Show when={data()!.goalProjection}>
            <div class="bg-blue-500/5 rounded-lg p-4 mb-6 border border-blue-500/20">
              <div class="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <TrendingUp class="h-4 w-4 text-blue-500" />
                Goal Projection
              </div>
              <div class="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div class="text-sm font-semibold text-muted-foreground">
                    {formatCurrency(data()!.goalProjection!.fromMonthlyMargin, props.currency)}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    via margin × {data()!.goalProjection!.monthsRemaining}mo
                  </div>
                </div>
                <div>
                  <div class="text-sm font-semibold text-emerald-600">
                    +{formatCurrency(data()!.goalProjection!.fromOneTimeGains, props.currency)}
                  </div>
                  <div class="text-xs text-muted-foreground">one-time gains</div>
                </div>
                <div>
                  <div class="text-sm font-bold text-blue-600">
                    {formatCurrency(data()!.goalProjection!.totalProjected, props.currency)}
                  </div>
                  <div class="text-xs text-muted-foreground">total projected</div>
                </div>
              </div>
              <div class="mt-3 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  class="bg-blue-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min(100, data()!.goalProjection!.progressPercent)}%` }}
                />
              </div>
              <div class="text-xs text-center text-muted-foreground mt-1">
                {data()!.goalProjection!.progressPercent.toFixed(0)}% of{' '}
                {formatCurrency(data()!.goalProjection!.goalAmount, props.currency)} goal
              </div>
            </div>
          </Show>

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

          {/* One-time gains breakdown - trades and paused items */}
          <Show when={hasSavings()}>
            <div class="mt-8 pt-6 border-t border-border">
              <h4 class="font-medium text-foreground mb-4 text-sm flex items-center gap-2">
                <PiggyBank class="h-4 w-4 text-emerald-500" />
                One-Time Gains Detail
              </h4>
              <div class="space-y-3">
                <For each={data()!.savingsBreakdown}>
                  {(item) => (
                    <div class="flex items-center justify-between text-sm group">
                      <div class="flex items-center gap-3">
                        <div
                          class={`w-1.5 h-1.5 rounded-full ring-2 ${
                            item.type === 'trade'
                              ? 'bg-emerald-500 ring-emerald-500/20'
                              : 'bg-amber-500 ring-amber-500/20'
                          }`}
                        />
                        <span class="text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1.5">
                          {item.type === 'trade' ? (
                            <Tag class="h-3 w-3 text-emerald-500" />
                          ) : (
                            <Pause class="h-3 w-3 text-amber-500" />
                          )}
                          {item.source}
                        </span>
                      </div>
                      <span class="font-medium text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(item.amount, props.currency)}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

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
