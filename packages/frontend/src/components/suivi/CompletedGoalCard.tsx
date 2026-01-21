/**
 * Completed Goal Card Component
 *
 * Compact summary card for a completed goal.
 * Shows goal name, amount achieved, duration, and average energy.
 */

import { Card, CardContent } from '~/components/ui/Card';
import { Trophy, Clock, Zap, CheckCircle2 } from 'lucide-solid';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { cn } from '~/lib/cn';
import type { Goal } from '~/lib/goalService';

interface CompletedGoalCardProps {
  goal: Goal;
  timeTakenWeeks: number;
  avgEnergy: number | null;
  missionCount: number;
  currency: Currency;
  onClick: () => void;
}

export function CompletedGoalCard(props: CompletedGoalCardProps) {
  return (
    <Card
      class="cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] hover:border-green-500/50 border-green-500/20 bg-gradient-to-br from-green-500/5 to-green-500/10"
      onClick={props.onClick}
    >
      <CardContent class="p-5">
        {/* Header with trophy */}
        <div class="flex items-start gap-3 mb-4">
          <div class="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <Trophy class="h-5 w-5 text-green-500" />
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-foreground truncate">{props.goal.name}</h3>
            <div class="flex items-center gap-1 mt-1">
              <CheckCircle2 class="h-3.5 w-3.5 text-green-500" />
              <span class="text-xs text-green-600 dark:text-green-400 font-medium">Completed</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div class="space-y-2">
          {/* Amount */}
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Achieved</span>
            <span class="font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(props.goal.amount, props.currency)}
            </span>
          </div>

          {/* Duration */}
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground flex items-center gap-1">
              <Clock class="h-3.5 w-3.5" />
              Duration
            </span>
            <span class="text-foreground">
              {props.timeTakenWeeks} week{props.timeTakenWeeks !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Energy */}
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground flex items-center gap-1">
              <Zap class="h-3.5 w-3.5 text-yellow-500" />
              Avg energy
            </span>
            <span
              class={cn(
                'font-medium',
                props.avgEnergy === null
                  ? 'text-muted-foreground'
                  : props.avgEnergy >= 70
                    ? 'text-green-600 dark:text-green-400'
                    : props.avgEnergy >= 50
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-orange-600 dark:text-orange-400'
              )}
            >
              {props.avgEnergy !== null ? `${props.avgEnergy}%` : 'N/A'}
            </span>
          </div>

          {/* Missions count */}
          <div class="flex items-center justify-between text-sm">
            <span class="text-muted-foreground">Missions</span>
            <span class="text-foreground">{props.missionCount}</span>
          </div>
        </div>

        {/* View details hint */}
        <div class="mt-4 pt-3 border-t border-border/50">
          <span class="text-xs text-muted-foreground">Click to view details</span>
        </div>
      </CardContent>
    </Card>
  );
}
