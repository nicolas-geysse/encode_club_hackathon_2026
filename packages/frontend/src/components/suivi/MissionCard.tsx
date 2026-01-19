/**
 * Mission Card Component
 *
 * Individual mission item from swipe selections.
 */

import { Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import {
  Clock,
  DollarSign,
  Package,
  Briefcase,
  GraduationCap,
  Home,
  Repeat,
  Hand,
  RotateCcw,
  Trash2,
  CheckCircle2,
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
  previousState?: {
    hoursCompleted: number;
    earningsCollected: number;
  };
}

interface MissionCardProps {
  mission: Mission;
  currency?: Currency;
  onComplete?: () => void;
  onSkip?: () => void;
  onUndo?: () => void;
  onDelete?: () => void;
  onLogProgress?: () => void;
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

  const Icon = () => getCategoryIcon(props.mission.category);

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
            <Dynamic component={Icon()} class="h-5 w-5" />
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
          {/* Actions */}
          <div class="flex-shrink-0 flex flex-col items-end gap-2">
            <Show when={props.mission.status === 'active'}>
              <div class="flex items-center gap-2">
                <Button
                  size="sm"
                  class="gap-1 h-8 bg-green-600 hover:bg-green-700 text-white"
                  onClick={props.onComplete}
                >
                  <CheckCircle2 class="h-4 w-4" />
                  To be done
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1 h-8 px-3 text-muted-foreground hover:text-foreground"
                  onClick={props.onLogProgress}
                  title="Log Progress"
                >
                  <Clock class="h-4 w-4" />
                  <span>Log</span>
                </Button>
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1 h-8 px-3 text-muted-foreground hover:text-foreground"
                  onClick={props.onSkip}
                  title="Skip Mission"
                >
                  <Hand class="h-4 w-4" />
                  <span>Skip</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="gap-1 h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                  onClick={props.onDelete}
                  title="Delete Mission"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </Show>

            <Show when={props.mission.status !== 'active'}>
              <Button
                variant="outline"
                size="sm"
                class="gap-1 h-8 text-muted-foreground hover:text-primary"
                onClick={props.onUndo}
              >
                <RotateCcw class="h-4 w-4" />
                Undo
              </Button>
            </Show>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
