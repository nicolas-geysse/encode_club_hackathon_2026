/**
 * Mission Card Component
 *
 * Individual mission item from swipe selections.
 */

import { Show } from 'solid-js';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  Check,
  Clock,
  DollarSign,
  Package,
  Briefcase,
  GraduationCap,
  Home,
  Repeat,
  X,
  Plus,
} from 'lucide-solid';
import { cn } from '~/lib/cn';

export interface Mission {
  id: string;
  title: string;
  description: string;
  category: string;
  weeklyHours: number;
  weeklyEarnings: number;
  status: 'active' | 'completed' | 'skipped';
  progress: number; // 0-100
  startDate: string;
  hoursCompleted: number;
  earningsCollected: number;
}

interface MissionCardProps {
  mission: Mission;
  currency?: Currency;
  onComplete?: () => void;
  onSkip?: () => void;
  onLogProgress?: (hours: number, earnings: number) => void;
}

export function MissionCard(props: MissionCardProps) {
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'freelance':
        return Briefcase;
      case 'tutoring':
        return GraduationCap;
      case 'selling':
        return Package;
      case 'lifestyle':
        return Home;
      case 'trade':
        return Repeat;
      default:
        return Briefcase;
    }
  };

  const Icon = getCategoryIcon(props.mission.category);

  return (
    <Card
      class={cn(
        'transition-all',
        props.mission.status === 'completed' &&
          'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-900',
        props.mission.status === 'skipped' && 'opacity-60 bg-muted/50'
      )}
    >
      <CardContent class="p-4">
        <div class="flex items-start gap-4">
          {/* Category Icon */}
          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Icon class="h-5 w-5" />
          </div>

          {/* Content */}
          <div class="flex-1 min-w-0">
            {/* Header */}
            <div class="flex items-center gap-2 mb-1">
              <h4 class="font-semibold text-foreground truncate">{props.mission.title}</h4>
              <span
                class={cn(
                  'px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-full',
                  props.mission.status === 'completed' &&
                    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
                  props.mission.status === 'skipped' && 'bg-muted text-muted-foreground',
                  props.mission.status === 'active' &&
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                )}
              >
                {props.mission.status === 'active' ? 'In progress' : props.mission.status}
              </span>
            </div>

            {/* Description */}
            <p class="text-sm text-muted-foreground mb-3">{props.mission.description}</p>

            {/* Progress Bar */}
            <Show when={props.mission.status === 'active'}>
              <div class="mb-3">
                <div class="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Progress</span>
                  <span>{props.mission.progress}%</span>
                </div>
                <div class="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    class="h-full bg-primary transition-all duration-300"
                    style={{ width: `${props.mission.progress}%` }}
                  />
                </div>
              </div>
            </Show>

            {/* Stats */}
            <div class="flex items-center gap-4 text-sm">
              <div class="flex items-center gap-1 text-muted-foreground">
                <Clock class="h-3.5 w-3.5" />
                <span>
                  {props.mission.hoursCompleted}/{props.mission.weeklyHours}h
                </span>
              </div>
              <div class="flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                <DollarSign class="h-3.5 w-3.5" />
                <span>
                  {formatCurrency(props.mission.earningsCollected, props.currency)}/
                  {formatCurrency(props.mission.weeklyEarnings, props.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <Show when={props.mission.status === 'active'}>
            <div class="flex-shrink-0 flex flex-col gap-2">
              <Button
                size="sm"
                variant="outline"
                class="h-8 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 border-green-200 dark:border-green-900"
                onClick={() => props.onComplete?.()}
              >
                <Check class="h-3.5 w-3.5" />
                <span class="sr-only sm:not-sr-only">Done</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 gap-1"
                onClick={() => {
                  const hours = prompt('Hours completed this week:', '0');
                  const earnings = prompt('Dollars earned:', '0');
                  if (hours && earnings) {
                    props.onLogProgress?.(parseFloat(hours), parseFloat(earnings));
                  }
                }}
              >
                <Plus class="h-3.5 w-3.5" />
                <span class="sr-only sm:not-sr-only">Log</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                class="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => props.onSkip?.()}
              >
                <X class="h-3.5 w-3.5" />
              </Button>
            </div>
          </Show>
        </div>
      </CardContent>
    </Card>
  );
}
