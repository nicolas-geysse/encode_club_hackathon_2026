/**
 * Mission Card Component
 *
 * Individual mission item from swipe selections.
 */

import { Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { formatCurrency, type Currency } from '~/lib/dateUtils';
import { Button } from '~/components/ui/Button';
import {
  Clock,
  Package,
  Briefcase,
  GraduationCap,
  Home,
  Repeat,
  RotateCcw,
  Trash2,
  CheckCircle2,
  ShoppingBag,
  Pause,
  HandHeart,
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
  /** ISO timestamp when mission was completed (for earnings date attribution) */
  completedAt?: string;
  /** ISO timestamp when mission was last updated */
  updatedAt?: string;
  previousState?: {
    hoursCompleted: number;
    earningsCollected: number;
  };
  /** Source of the mission for syncing back (Pull Architecture) */
  source?: 'trade' | 'prospection' | 'lifestyle';
  /** ID of the source item for syncing (trade_id, lifestyle_id, lead_id) */
  sourceId?: string;
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
      // Pull Architecture categories
      case 'sell_item':
        return ShoppingBag;
      case 'job_lead':
        return Briefcase;
      case 'pause_expense':
        return Pause;
      case 'karma_trade':
        return Repeat;
      case 'karma_lend':
        return HandHeart;
      // Legacy categories
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
    <div
      class={cn(
        'group flex items-center gap-4 p-4 border rounded-xl hover:shadow-md transition-all duration-200',
        props.mission.status === 'completed'
          ? 'bg-green-50/50 border-green-200 dark:bg-green-900/10 dark:border-green-900/30'
          : props.mission.status === 'skipped'
            ? 'bg-slate-50/50 border-slate-200 dark:bg-slate-900/30 dark:border-slate-800 opacity-60 grayscale'
            : 'bg-white border-slate-200 dark:bg-slate-900/60 dark:border-slate-800 hover:border-primary/20 dark:hover:border-primary/20'
      )}
    >
      {/* Icon */}
      <div class="flex-shrink-0 w-10 h-10 rounded-full bg-muted/40 flex items-center justify-center text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
        <Dynamic component={Icon()} class="h-5 w-5" />
      </div>

      {/* Info Grid */}
      <div class="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* Title & Desc (Col 1-5) */}
        <div class="md:col-span-5">
          <div class="flex items-center gap-2">
            <h4 class="font-medium text-foreground truncate">{props.mission.title}</h4>
            {/* Status Badge (Mini) */}
            <Show when={props.mission.status !== 'active'}>
              <span
                class={cn(
                  'px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-full',
                  props.mission.status === 'completed'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {props.mission.status}
              </span>
            </Show>
          </div>
          <p class="text-xs text-muted-foreground truncate">{props.mission.description}</p>
        </div>

        {/* Progress (Col 6-8) */}
        <div class="md:col-span-3">
          <Show when={props.mission.status === 'active'}>
            <div class="flex items-center gap-2">
              <div class="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary transition-all duration-500"
                  style={{ width: `${props.mission.progress}%` }}
                />
              </div>
              <span class="text-[10px] text-muted-foreground w-8 text-right">
                {props.mission.progress}%
              </span>
            </div>
          </Show>
        </div>

        {/* Stats & Actions (Col 9-12) */}
        <div class="md:col-span-4 flex items-center justify-end gap-4 text-sm">
          <div class="flex flex-col items-end">
            <div class="font-medium text-foreground flex items-center gap-1">
              <span class="text-green-600 dark:text-green-400">
                {formatCurrency(props.mission.earningsCollected, props.currency)}
              </span>
              <span class="text-muted-foreground text-xs font-normal">
                / {formatCurrency(props.mission.weeklyEarnings, props.currency)}
              </span>
            </div>
            <Show when={props.mission.hoursCompleted > 0}>
              <span class="text-[10px] text-muted-foreground">
                {props.mission.hoursCompleted}h worked
              </span>
            </Show>
          </div>

          {/* Quick Actions (Visible on Hover on desktop, always on mobile if we wanted compatibility, but let's stick to simple) */}
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Show when={props.mission.status === 'active'}>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                onClick={props.onComplete}
                title="Complete"
              >
                <CheckCircle2 class="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={props.onLogProgress}
                title="Log Time"
              >
                <Clock class="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onClick={props.onDelete}
                title="Delete"
              >
                <Trash2 class="h-4 w-4" />
              </Button>
            </Show>
            <Show when={props.mission.status !== 'active'}>
              <Button
                size="icon"
                variant="ghost"
                class="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={props.onUndo}
                title="Undo"
              >
                <RotateCcw class="h-4 w-4" />
              </Button>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
