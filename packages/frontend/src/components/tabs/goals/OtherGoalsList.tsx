import { Show, For } from 'solid-js';
import { Pencil, RotateCcw, Trash2 } from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { formatCurrency } from '~/lib/dateUtils';
import type { Goal } from '~/lib/profileContext';
import type { Currency } from '~/lib/dateUtils';

interface OtherGoalsListProps {
  goals: Goal[];
  currency: Currency;
  onEdit: (goal: Goal) => void;
  onReactivate: (goal: Goal) => void;
  onDelete: (goalId: string) => void;
}

export function OtherGoalsList(props: OtherGoalsListProps) {
  return (
    <Show when={props.goals.length > 0}>
      <div class="mt-8">
        <h3 class="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Other Goals ({props.goals.length})
        </h3>
        <div class="space-y-2">
          <For each={props.goals}>
            {(goal) => (
              <Card class="opacity-70 hover:opacity-100 transition-opacity">
                <CardContent class="p-3">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <span class="text-xl">
                        {goal.status === 'completed'
                          ? '✅'
                          : goal.status === 'paused'
                            ? '📦'
                            : '⏳'}
                      </span>
                      <div>
                        <h4 class="font-medium text-foreground">{goal.name}</h4>
                        <p class="text-xs text-muted-foreground">
                          {formatCurrency(goal.amount, props.currency)} • {goal.progress || 0}% •{' '}
                          {goal.status}
                        </p>
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => props.onEdit(goal)}
                        class="h-8 w-8"
                        title="Edit goal"
                      >
                        <Pencil class="h-3 w-3" />
                      </Button>
                      <Show when={goal.status !== 'completed'}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => props.onReactivate(goal)}
                          class="h-8 w-8 text-amber-600"
                          title="Reactivate goal"
                        >
                          <RotateCcw class="h-3 w-3" />
                        </Button>
                      </Show>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => props.onDelete(goal.id)}
                        class="h-8 w-8 text-destructive"
                        title="Delete goal"
                      >
                        <Trash2 class="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
