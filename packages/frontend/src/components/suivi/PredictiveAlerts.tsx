/**
 * Predictive Alerts Component
 *
 * Shows proactive warnings about upcoming difficult weeks based on
 * retroplan capacity data. Warns users 2+ weeks in advance.
 */

import { createSignal, createEffect, Show, For } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { AlertTriangle, Calendar, Shield, ChevronDown, ChevronUp } from 'lucide-solid';
import { createLogger } from '~/lib/logger';

const logger = createLogger('PredictiveAlerts');

interface WeekAlert {
  weekNumber: number;
  weekStartDate: string;
  capacityCategory: 'low' | 'protected';
  effectiveHours: number;
  reason: string;
  suggestedAction: 'front-load' | 'add-protection' | 'reduce-target';
}

interface PredictiveAlertsProps {
  goalId: string;
  userId?: string;
  lookahead?: number; // weeks to look ahead (default 4)
  onViewPlan?: () => void;
  onAdjustPlan?: (weekNumber: number) => void;
}

const ACTION_LABELS = {
  'front-load': 'Front-load work this week',
  'add-protection': 'Mark as protected',
  'reduce-target': 'Reduce weekly target',
};

export function PredictiveAlerts(props: PredictiveAlertsProps) {
  const [alerts, setAlerts] = createSignal<WeekAlert[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [expanded, setExpanded] = createSignal(false);
  const [dismissed, setDismissed] = createSignal<Set<number>>(new Set());

  const fetchPredictions = async () => {
    if (!props.goalId) return;

    setLoading(true);
    try {
      const response = await fetch('/api/retroplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_predictions',
          goalId: props.goalId,
          userId: props.userId || 'default',
          lookahead: props.lookahead || 4,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.alerts) {
          setAlerts(data.alerts);
        }
      }
    } catch (err) {
      logger.error('Failed to fetch predictions', { error: err });
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.goalId) {
      fetchPredictions();
    }
  });

  // Filter out dismissed alerts
  const activeAlerts = () => alerts().filter((a) => !dismissed().has(a.weekNumber));

  const handleDismiss = (weekNumber: number) => {
    setDismissed((prev) => new Set([...prev, weekNumber]));
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Use Show for proper SolidJS reactivity - don't render if no active alerts
  return (
    <Show when={!loading() && activeAlerts().length > 0}>
      <Card class="border-amber-500/30 bg-amber-500/5">
        <CardContent class="p-4">
          {/* Header */}
          <button
            type="button"
            class="w-full flex items-center justify-between"
            onClick={() => setExpanded(!expanded())}
          >
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div class="text-left">
                <h3 class="font-semibold text-amber-700 dark:text-amber-300">
                  Heads up: {activeAlerts().length} challenging week
                  {activeAlerts().length > 1 ? 's' : ''} ahead
                </h3>
                <p class="text-sm text-amber-600/80 dark:text-amber-400/80">
                  {activeAlerts()
                    .slice(0, 2)
                    .map((a) => `Week ${a.weekNumber}`)
                    .join(', ')}
                  {activeAlerts().length > 2 ? ` +${activeAlerts().length - 2} more` : ''}
                </p>
              </div>
            </div>
            <div class="text-amber-600 dark:text-amber-400">
              {expanded() ? <ChevronUp class="h-5 w-5" /> : <ChevronDown class="h-5 w-5" />}
            </div>
          </button>

          {/* Expanded Content */}
          <Show when={expanded()}>
            <div class="mt-4 space-y-3">
              <For each={activeAlerts()}>
                {(alert) => (
                  <div class="bg-white/50 dark:bg-black/20 rounded-lg p-3 border border-amber-500/20">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                          <span
                            class={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              alert.capacityCategory === 'protected'
                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                : 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                            }`}
                          >
                            {alert.capacityCategory === 'protected' ? (
                              <span class="flex items-center gap-1">
                                <Shield class="h-3 w-3" /> Protected
                              </span>
                            ) : (
                              'Low Capacity'
                            )}
                          </span>
                          <span class="text-sm text-muted-foreground flex items-center gap-1">
                            <Calendar class="h-3 w-3" />
                            Week {alert.weekNumber} ({formatDate(alert.weekStartDate)})
                          </span>
                        </div>

                        <p class="text-sm text-foreground">{alert.reason}</p>

                        <p class="text-xs text-muted-foreground mt-1">
                          Only {alert.effectiveHours}h available this week
                        </p>

                        <div class="mt-2 flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            class="text-xs h-7 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                            onClick={() => props.onAdjustPlan?.(alert.weekNumber)}
                          >
                            {ACTION_LABELS[alert.suggestedAction]}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="text-xs h-7 text-muted-foreground"
                            onClick={() => handleDismiss(alert.weekNumber)}
                          >
                            I'll manage
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </For>

              {/* View Full Plan Button */}
              <Show when={props.onViewPlan}>
                <Button
                  variant="outline"
                  class="w-full mt-2 border-amber-500/30 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                  onClick={() => props.onViewPlan?.()}
                >
                  <Calendar class="h-4 w-4 mr-2" />
                  View full capacity plan
                </Button>
              </Show>
            </div>
          </Show>
        </CardContent>
      </Card>
    </Show>
  );
}

export default PredictiveAlerts;
