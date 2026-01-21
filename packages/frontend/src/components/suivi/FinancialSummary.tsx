/**
 * Financial Summary Component
 *
 * Simplified 3-column view of budget data:
 * - Monthly recurring (Income / Expenses / Margin)
 * - One-time gains (if any)
 * - Goal progress bar
 * - Collapsible details section
 */

import { Show, For, createSignal } from 'solid-js';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  ChevronDown,
  ChevronUp,
  Target,
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import type { ConsolidatedBudget } from '~/lib/budgetService';

interface FinancialSummaryProps {
  budget: ConsolidatedBudget | null;
  currency?: Currency;
  /** Optional breakdown for expanded details view */
  breakdown?: {
    income: { source: string; amount: number }[];
    expenses: { category: string; amount: number }[];
  };
}

export function FinancialSummary(props: FinancialSummaryProps) {
  const [showDetails, setShowDetails] = createSignal(false);

  // Use Show for conditional rendering (SolidJS best practice)
  return (
    <Show
      when={props.budget}
      fallback={
        <Card>
          <CardContent class="py-8 text-center text-muted-foreground">
            <Wallet class="mx-auto h-12 w-12 mb-2 opacity-50" />
            <p class="text-sm">No financial data available</p>
          </CardContent>
        </Card>
      }
    >
      {(budget) => {
        // These helpers are defined inside the accessor where budget() is guaranteed to be non-null
        const hasOneTimeGains = () => {
          const b = budget();
          return b.oneTimeGains && b.oneTimeGains.total > 0;
        };

        const hasGoal = () => {
          const b = budget();
          return b.goalProjection && b.goalProjection.goalAmount > 0;
        };

        return (
          <FinancialSummaryContent
            budget={budget()}
            currency={props.currency}
            breakdown={props.breakdown}
            showDetails={showDetails}
            setShowDetails={setShowDetails}
            hasOneTimeGains={hasOneTimeGains}
            hasGoal={hasGoal}
          />
        );
      }}
    </Show>
  );
}

// Internal component for the actual content
function FinancialSummaryContent(props: {
  budget: ConsolidatedBudget;
  currency?: Currency;
  breakdown?: FinancialSummaryProps['breakdown'];
  showDetails: () => boolean;
  setShowDetails: (v: boolean) => void;
  hasOneTimeGains: () => boolean;
  hasGoal: () => boolean;
}) {
  // Use props.budget directly in JSX to maintain reactivity
  return (
    <Card>
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-lg">
          <Wallet class="h-5 w-5 text-primary" />
          Budget Mensuel
        </CardTitle>
      </CardHeader>

      <CardContent class="space-y-4">
        {/* 3-Column Monthly Summary */}
        <div class="grid grid-cols-3 gap-3">
          {/* Income */}
          <div class="bg-green-500/10 rounded-lg p-3 text-center border border-green-500/20">
            <div class="flex items-center justify-center gap-1 text-green-600 dark:text-green-400 mb-1">
              <TrendingUp class="h-4 w-4" />
            </div>
            <div class="text-lg font-bold text-green-600 dark:text-green-400">
              {formatCurrency(props.budget.monthly.income, props.currency, { showSign: true })}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              Revenus <span class="text-green-600/70">/mois</span>
            </div>
          </div>

          {/* Expenses */}
          <div class="bg-red-500/10 rounded-lg p-3 text-center border border-red-500/20">
            <div class="flex items-center justify-center gap-1 text-red-600 dark:text-red-400 mb-1">
              <TrendingDown class="h-4 w-4" />
            </div>
            <div class="text-lg font-bold text-red-600 dark:text-red-400">
              -{formatCurrency(props.budget.monthly.expenses, props.currency)}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              Depenses <span class="text-red-600/70">/mois</span>
            </div>
          </div>

          {/* Margin */}
          <div
            class={cn(
              'rounded-lg p-3 text-center border',
              props.budget.monthly.margin >= 0
                ? 'bg-primary/10 border-primary/20'
                : 'bg-amber-500/10 border-amber-500/20'
            )}
          >
            <div
              class={cn(
                'flex items-center justify-center gap-1 mb-1',
                props.budget.monthly.margin >= 0
                  ? 'text-primary'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              <Wallet class="h-4 w-4" />
            </div>
            <div
              class={cn(
                'text-lg font-bold',
                props.budget.monthly.margin >= 0
                  ? 'text-primary'
                  : 'text-amber-600 dark:text-amber-400'
              )}
            >
              {formatCurrency(props.budget.monthly.margin, props.currency, { showSign: true })}
            </div>
            <div class="text-xs text-muted-foreground mt-1">
              Marge{' '}
              <span
                class={props.budget.monthly.margin >= 0 ? 'text-primary/70' : 'text-amber-600/70'}
              >
                /mois
              </span>
            </div>
          </div>
        </div>

        {/* One-Time Gains */}
        <Show when={props.hasOneTimeGains()}>
          <div class="bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/20 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <PiggyBank class="h-4 w-4 text-emerald-500" />
              <span class="text-sm font-medium text-foreground">Gains ponctuels</span>
            </div>
            <div class="text-base font-bold text-emerald-600 dark:text-emerald-400">
              +{formatCurrency(props.budget.oneTimeGains.total, props.currency)}
            </div>
          </div>
        </Show>

        {/* Goal Progress */}
        <Show when={props.hasGoal()}>
          <div class="bg-blue-500/5 rounded-lg p-3 border border-blue-500/20">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <Target class="h-4 w-4 text-blue-500" />
                <span class="text-sm font-medium text-foreground">Projection objectif</span>
              </div>
              <span class="text-sm text-muted-foreground">
                {props.budget.goalProjection.monthsRemaining} mois
              </span>
            </div>

            {/* Progress bar */}
            <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden mb-2">
              <div
                class={cn(
                  'h-full transition-all duration-500',
                  props.budget.goalProjection.progressPercent >= 100
                    ? 'bg-green-500'
                    : props.budget.goalProjection.progressPercent >= 75
                      ? 'bg-blue-500'
                      : props.budget.goalProjection.progressPercent >= 50
                        ? 'bg-amber-500'
                        : 'bg-red-500'
                )}
                style={{ width: `${Math.min(100, props.budget.goalProjection.progressPercent)}%` }}
              />
            </div>

            <div class="flex justify-between text-xs text-muted-foreground">
              <span>
                {formatCurrency(props.budget.goalProjection.totalProjected, props.currency)} projete
              </span>
              <span
                class={cn(
                  'font-medium',
                  props.budget.goalProjection.progressPercent >= 100
                    ? 'text-green-600'
                    : props.budget.goalProjection.progressPercent >= 75
                      ? 'text-blue-600'
                      : 'text-amber-600'
                )}
              >
                {props.budget.goalProjection.progressPercent.toFixed(0)}% de{' '}
                {formatCurrency(props.budget.goalProjection.goalAmount, props.currency)}
              </span>
            </div>
          </div>
        </Show>

        {/* Collapsible Details */}
        <Show when={props.breakdown}>
          <div class="border-t border-border pt-3">
            <Button
              variant="ghost"
              size="sm"
              class="w-full justify-between text-muted-foreground hover:text-foreground"
              onClick={() => props.setShowDetails(!props.showDetails())}
            >
              <span class="text-xs uppercase tracking-wider">Details</span>
              {props.showDetails() ? (
                <ChevronUp class="h-4 w-4" />
              ) : (
                <ChevronDown class="h-4 w-4" />
              )}
            </Button>

            <Show when={props.showDetails() && props.breakdown}>
              <div class="grid grid-cols-2 gap-6 mt-4 text-sm">
                {/* Income Breakdown */}
                <Show when={props.breakdown!.income.length > 0}>
                  <div>
                    <h4 class="font-medium text-foreground mb-2 flex items-center gap-1 text-xs uppercase tracking-wider">
                      <TrendingUp class="h-3 w-3 text-green-500" />
                      Revenus
                    </h4>
                    <div class="space-y-1">
                      <For each={props.breakdown!.income}>
                        {(item) => (
                          <div class="flex justify-between text-muted-foreground">
                            <span>{item.source}</span>
                            <span class="font-medium text-foreground">
                              {formatCurrency(item.amount, props.currency)}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Expense Breakdown */}
                <Show when={props.breakdown!.expenses.length > 0}>
                  <div>
                    <h4 class="font-medium text-foreground mb-2 flex items-center gap-1 text-xs uppercase tracking-wider">
                      <TrendingDown class="h-3 w-3 text-red-500" />
                      Depenses
                    </h4>
                    <div class="space-y-1">
                      <For each={props.breakdown!.expenses}>
                        {(item) => (
                          <div class="flex justify-between text-muted-foreground">
                            <span>{item.category}</span>
                            <span class="font-medium text-foreground">
                              {formatCurrency(item.amount, props.currency)}
                            </span>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
