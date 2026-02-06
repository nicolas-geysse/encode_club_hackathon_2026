/**
 * CategoryExplorer Component
 *
 * Displays prospection categories as a flat grid of clickable chips.
 * Click a category to immediately trigger a job search (no accordion).
 * Long-press or secondary action to exclude.
 */

import { For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
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
  Search,
  Zap,
  Globe,
  ThumbsDown,
  Undo2,
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import {
  PROSPECTION_CATEGORIES,
  getEffortLabel,
  getCategoryColor,
} from '~/config/prospectionCategories';
import type { ScoredJob } from '~/lib/jobScoring';

// Special category ID for global TOP 10
export const TOP10_ALL_CATEGORY_ID = '__top10_all__';
// Special category ID for real job listings (from external APIs)
export const REAL_JOBS_CATEGORY_ID = '__real_jobs__';

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

interface CategoryExplorerProps {
  onCategorySelect: (categoryId: string) => void;
  isLoading?: boolean;
  loadingCategory?: string;
  currency?: 'USD' | 'EUR' | 'GBP';
  allCategoryJobs?: ScoredJob[];
  searchedCategories?: string[];
  excludedCategories?: Set<string>;
  onExcludeCategory?: (categoryId: string, categoryLabel: string) => void;
  exclusionCounts?: Map<string, number>;
}

export function CategoryExplorer(props: CategoryExplorerProps) {
  const excludedCount = () => props.excludedCategories?.size || 0;
  const isExcluded = (categoryId: string) => props.excludedCategories?.has(categoryId) ?? false;
  const jobExclusionCount = (categoryId: string) => props.exclusionCounts?.get(categoryId) || 0;
  const isSearched = (categoryId: string) =>
    props.searchedCategories?.includes(categoryId) ?? false;

  return (
    <div class="space-y-4">
      <div class="text-center mb-4">
        <h2 class="text-2xl font-bold text-foreground mb-1">Explore Job Categories</h2>
        <p class="text-sm text-muted-foreground">Tap a category to find opportunities near you</p>
        <Show when={excludedCount() > 0}>
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {excludedCount()} {excludedCount() === 1 ? 'category' : 'categories'} excluded
          </p>
        </Show>
      </div>

      {/* Category Grid — flat, clickable chips */}
      <div class="grid grid-cols-2 gap-2">
        <For each={PROSPECTION_CATEGORIES}>
          {(category) => {
            const isLoadingThis = () => props.isLoading && props.loadingCategory === category.id;
            const IconComponent = ICON_MAP[category.icon as keyof typeof ICON_MAP] || Building;
            const isPlatformOnly = category.googlePlaceTypes.length === 0;
            const excluded = () => isExcluded(category.id);
            const searched = () => isSearched(category.id);
            const jobExclCount = () => jobExclusionCount(category.id);

            return (
              <div
                class={cn(
                  'relative rounded-lg border transition-all',
                  excluded()
                    ? 'border-border/50 bg-muted/30 opacity-50'
                    : searched()
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-border bg-card hover:border-primary/40 hover:shadow-sm'
                )}
              >
                {/* Main clickable area — triggers search */}
                <button
                  type="button"
                  onClick={() => {
                    if (!excluded() && !props.isLoading) {
                      props.onCategorySelect(category.id);
                    }
                  }}
                  disabled={props.isLoading || excluded()}
                  class="w-full p-3 text-left"
                >
                  <div class="flex items-center gap-2.5">
                    <div
                      class={cn(
                        'p-1.5 rounded-md shrink-0',
                        excluded() ? 'bg-muted' : 'bg-primary/10',
                        !excluded() && getCategoryColor(category.effortLevel)
                      )}
                    >
                      {isLoadingThis() ? (
                        <svg
                          class="animate-spin h-4 w-4 text-primary"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                          />
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <Dynamic
                          component={IconComponent}
                          class={cn('h-4 w-4', excluded() ? 'text-muted-foreground' : '')}
                        />
                      )}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span
                          class={cn(
                            'text-sm font-medium truncate',
                            excluded() ? 'text-muted-foreground line-through' : 'text-foreground'
                          )}
                        >
                          {category.label}
                        </span>
                        <Show when={isPlatformOnly}>
                          <Globe class="h-3 w-3 text-blue-500 shrink-0" />
                        </Show>
                        <Show when={searched() && !excluded()}>
                          <Search class="h-3 w-3 text-primary/50 shrink-0" />
                        </Show>
                      </div>
                      <div class="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span class="flex items-center gap-0.5">
                          <Zap class="h-2.5 w-2.5" />
                          {getEffortLabel(category.effortLevel)}
                        </span>
                        <Show when={!excluded() && jobExclCount() > 0}>
                          <span class="text-amber-600 dark:text-amber-400">
                            {jobExclCount()} excl.
                          </span>
                        </Show>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Exclude toggle — small button in corner */}
                <Show when={props.onExcludeCategory}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onExcludeCategory?.(category.id, category.label);
                    }}
                    class={cn(
                      'absolute top-1 right-1 p-1 rounded-full transition-colors',
                      excluded()
                        ? 'text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-950/30'
                        : 'text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10'
                    )}
                    title={excluded() ? 'Re-include' : 'Exclude category'}
                  >
                    {excluded() ? <Undo2 class="h-3 w-3" /> : <ThumbsDown class="h-3 w-3" />}
                  </button>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
