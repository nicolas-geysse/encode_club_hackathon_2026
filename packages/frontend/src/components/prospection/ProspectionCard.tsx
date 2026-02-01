/**
 * ProspectionCard Component
 *
 * Displays a job opportunity card for swiping.
 * Shows company, location, commute time, salary, and effort level.
 */

import { Show, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  MapPin,
  Clock,
  Zap,
  Star,
  ExternalLink,
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  Wrench,
  Baby,
  GraduationCap,
  PartyPopper,
  Laptop,
  Building,
} from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { cn } from '~/lib/cn';
import type { ProspectionCard as CardType } from '~/lib/prospectionTypes';
import { getEffortLabel, getCategoryById } from '~/config/prospectionCategories';
import { formatStarRating, isTopPick } from '~/lib/jobScoring';

// Icon mapping
const ICON_MAP = {
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  Wrench,
  Baby,
  GraduationCap,
  PartyPopper,
  Clock,
  Laptop,
  Building,
};

interface ProspectionCardProps {
  card: CardType & { score?: number };
  isActive?: boolean;
  style?: string;
  class?: string;
}

export function ProspectionCard(props: ProspectionCardProps) {
  const category = () => getCategoryById(props.card.categoryId);
  const IconComponent = () => {
    const cat = category();
    if (cat) {
      return ICON_MAP[cat.icon as keyof typeof ICON_MAP] || Building;
    }
    return Building;
  };

  // Effort level color
  const effortColor = () => {
    const level = props.card.effortLevel || 3;
    switch (level) {
      case 1:
        return 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300';
      case 2:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300';
      case 3:
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-300';
      case 4:
        return 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-300';
      case 5:
        return 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <Card
      class={cn(
        'w-full max-w-sm mx-auto overflow-hidden transition-transform duration-200',
        props.isActive && 'ring-2 ring-primary shadow-lg',
        props.class
      )}
      style={props.style}
    >
      {/* Header with category icon, source, and Top Pick badge */}
      <div class="bg-gradient-to-r from-primary/10 to-primary/5 px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="p-1.5 bg-primary/20 rounded-lg">
            <Dynamic component={IconComponent()} class="h-4 w-4 text-primary" />
          </div>
          <span class="text-sm font-medium text-foreground">{category()?.label}</span>
          <Show when={props.card.score !== undefined && isTopPick(props.card.score!)}>
            <span class="px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
              <Star class="h-3 w-3 fill-white" />
              Top Pick
            </span>
          </Show>
        </div>
        <span class="text-xs text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full">
          {props.card.source}
        </span>
      </div>

      <CardContent class="p-4 space-y-4">
        {/* Title and Company */}
        <div>
          <h3 class="text-xl font-bold text-foreground">{props.card.title}</h3>
          <Show when={props.card.company}>
            <p class="text-muted-foreground">{props.card.company}</p>
          </Show>
        </div>

        {/* Location and Commute */}
        <div class="flex items-start gap-4">
          <Show when={props.card.location}>
            <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin class="h-4 w-4 shrink-0" />
              <span>{props.card.location}</span>
            </div>
          </Show>
          <Show when={props.card.commuteText}>
            <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock class="h-4 w-4 shrink-0" />
              <span>{props.card.commuteText}</span>
            </div>
          </Show>
        </div>

        {/* Calculated Score (our matching algorithm) */}
        <Show when={props.card.score !== undefined}>
          <div class="flex items-center justify-between bg-gradient-to-r from-primary/5 to-transparent px-3 py-2 rounded-lg -mx-1">
            <span class="text-sm text-muted-foreground">Match Score</span>
            <div class="flex items-center gap-1">
              <div class="flex">
                <For each={[1, 2, 3, 4, 5]}>
                  {(star) => (
                    <Star
                      class={cn(
                        'h-4 w-4',
                        star <= Math.floor(props.card.score!)
                          ? 'text-primary fill-primary'
                          : star <= props.card.score!
                            ? 'text-primary fill-primary/50'
                            : 'text-muted-foreground/30'
                      )}
                    />
                  )}
                </For>
              </div>
              <span class="text-sm font-bold text-primary ml-1">
                {formatStarRating(props.card.score!)}
              </span>
            </div>
          </div>
        </Show>

        {/* Salary and Google Rating */}
        <div class="flex items-center justify-between">
          <Show when={props.card.salaryText}>
            <div class="text-lg font-bold text-green-600 dark:text-green-400">
              {props.card.salaryText}
            </div>
          </Show>
          <Show when={props.card.rating}>
            <div class="flex items-center gap-1 text-sm" title="Google rating">
              <Star class="h-4 w-4 text-amber-500 fill-amber-500" />
              <span class="text-foreground">{props.card.rating?.toFixed(1)}</span>
              <span class="text-xs text-muted-foreground">Google</span>
            </div>
          </Show>
        </div>

        {/* Effort Level and Open Status */}
        <div class="flex items-center justify-between">
          <Show when={props.card.effortLevel}>
            <div
              class={cn(
                'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
                effortColor()
              )}
            >
              <Zap class="h-3 w-3" />
              {getEffortLabel(props.card.effortLevel || 3)}
            </div>
          </Show>
          <Show when={typeof props.card.openNow === 'boolean'}>
            <span
              class={cn(
                'text-xs px-2 py-1 rounded-full',
                props.card.openNow
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {props.card.openNow ? 'Open Now' : 'Closed'}
            </span>
          </Show>
        </div>

        {/* External Link */}
        <Show when={props.card.url}>
          <a
            href={props.card.url}
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 w-full py-2 px-4 bg-muted hover:bg-muted/80 rounded-lg text-sm font-medium text-foreground transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink class="h-4 w-4" />
            View on {props.card.source}
          </a>
        </Show>
      </CardContent>

      {/* Swipe Instructions */}
      <div class="px-4 pb-3 pt-0">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span class="flex items-center gap-1">
            <span class="text-red-500">←</span> Skip
          </span>
          <span class="flex items-center gap-1">
            <span class="text-blue-500">↑</span> Open
          </span>
          <span class="flex items-center gap-1">
            Save <span class="text-green-500">→</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
