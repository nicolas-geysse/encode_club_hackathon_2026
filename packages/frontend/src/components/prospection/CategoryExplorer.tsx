/**
 * CategoryExplorer Component
 *
 * Displays prospection categories in an accordion layout.
 * Click a category to trigger a job search.
 *
 * Special "TOP 10 of all categories" appears at top when user has explored multiple categories.
 */

import { For, Show, createSignal } from 'solid-js';
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
  ChevronDown,
  Search,
  Zap,
  Globe,
  Star,
  Briefcase,
  ThumbsDown,
  Undo2,
} from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/cn';
import {
  PROSPECTION_CATEGORIES,
  formatHourlyRange,
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
  /** All jobs accumulated from previous category searches (for global TOP 10) */
  allCategoryJobs?: ScoredJob[];
  /** Categories that have been searched (for showing how many categories explored) */
  searchedCategories?: string[];
  /** Phase 4: Set of excluded category IDs */
  excludedCategories?: Set<string>;
  /** Phase 4: Callback to toggle category exclusion */
  onExcludeCategory?: (categoryId: string, categoryLabel: string) => void;
  /** Phase 4: Count of excluded jobs per category */
  exclusionCounts?: Map<string, number>;
}

export function CategoryExplorer(props: CategoryExplorerProps) {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId() === id ? null : id);
  };

  const currency = () => props.currency || 'EUR';

  // Check if we have cached jobs from previous searches
  const hasCachedJobs = () => {
    const jobs = props.allCategoryJobs;
    return jobs && jobs.length > 0;
  };

  const globalTop10Count = () => {
    const jobs = props.allCategoryJobs;
    if (!jobs) return 0;
    return Math.min(jobs.length, 10);
  };

  const categoriesExploredCount = () => props.searchedCategories?.length || 0;
  const excludedCount = () => props.excludedCategories?.size || 0;
  const isExcluded = (categoryId: string) => props.excludedCategories?.has(categoryId) ?? false;
  const jobExclusionCount = (categoryId: string) => props.exclusionCounts?.get(categoryId) || 0;

  return (
    <div class="space-y-4">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-foreground mb-2">Explore Job Categories</h2>
        <p class="text-muted-foreground">Select a category to discover opportunities near you</p>
        <Show when={excludedCount() > 0}>
          <p class="text-xs text-amber-600 dark:text-amber-400 mt-1">
            {excludedCount()} {excludedCount() === 1 ? 'category' : 'categories'} excluded
          </p>
        </Show>
      </div>

      <div class="space-y-2">
        {/* Special cards moved to parent Dashboard to reduce redundancy */}

        <For each={PROSPECTION_CATEGORIES}>
          {(category) => {
            const isExpanded = () => expandedId() === category.id;
            const isLoadingThis = () => props.isLoading && props.loadingCategory === category.id;
            const IconComponent = ICON_MAP[category.icon as keyof typeof ICON_MAP] || Building;
            const isPlatformOnly = category.googlePlaceTypes.length === 0;

            const excluded = () => isExcluded(category.id);
            const jobExclCount = () => jobExclusionCount(category.id);

            return (
              <Card
                class={cn(
                  'transition-all duration-200',
                  isExpanded() ? 'ring-2 ring-primary/20' : '',
                  excluded() ? 'opacity-50' : ''
                )}
              >
                <button type="button" onClick={() => toggleExpand(category.id)} class="w-full">
                  <CardContent class="p-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div
                          class={cn(
                            'p-2 rounded-lg',
                            excluded() ? 'bg-muted' : 'bg-primary/10',
                            !excluded() && getCategoryColor(category.effortLevel)
                          )}
                        >
                          <Dynamic
                            component={IconComponent}
                            class={cn('h-5 w-5', excluded() && 'text-muted-foreground')}
                          />
                        </div>
                        <div class="text-left">
                          <div class="flex items-center gap-2">
                            <h3
                              class={cn(
                                'font-semibold',
                                excluded()
                                  ? 'text-muted-foreground line-through'
                                  : 'text-foreground'
                              )}
                            >
                              {category.label}
                            </h3>
                            {isPlatformOnly && (
                              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950/30 rounded text-xs text-blue-700 dark:text-blue-300">
                                <Globe class="h-3 w-3" />
                                Platforms
                              </span>
                            )}
                            <Show when={excluded()}>
                              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-950/30 rounded text-xs text-amber-700 dark:text-amber-300">
                                Excluded
                              </span>
                            </Show>
                            <Show when={!excluded() && jobExclCount() > 0}>
                              <span class="text-xs text-muted-foreground">
                                ({jobExclCount()} job{jobExclCount() > 1 ? 's' : ''} excluded)
                              </span>
                            </Show>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2">
                        {/* Exclude/Include toggle */}
                        <Show when={props.onExcludeCategory}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onExcludeCategory?.(category.id, category.label);
                            }}
                            class={cn(
                              'p-1.5 rounded-full transition-colors',
                              excluded()
                                ? 'text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/30'
                                : 'text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10'
                            )}
                            title={
                              excluded() ? 'Re-include this category' : 'Exclude this category'
                            }
                          >
                            {excluded() ? (
                              <Undo2 class="h-4 w-4" />
                            ) : (
                              <ThumbsDown class="h-4 w-4" />
                            )}
                          </button>
                        </Show>
                        <ChevronDown
                          class={cn(
                            'h-5 w-5 text-muted-foreground transition-transform duration-200',
                            isExpanded() && 'rotate-180'
                          )}
                        />
                      </div>
                    </div>
                  </CardContent>
                </button>

                {/* Expanded Content */}
                <div
                  class={cn(
                    'overflow-hidden transition-all duration-200',
                    isExpanded() ? 'max-h-96' : 'max-h-0'
                  )}
                >
                  <div class="px-4 pb-4 border-t border-border/50 pt-4">
                    <p class="text-sm text-muted-foreground mb-3">{category.description}</p>

                    {/* Examples */}
                    <div class="mb-4">
                      <p class="text-xs font-medium text-muted-foreground mb-2">Examples:</p>
                      <div class="flex flex-wrap gap-1.5">
                        <For each={category.examples}>
                          {(example) => (
                            <span class="px-2 py-0.5 bg-muted rounded-full text-xs text-foreground">
                              {example}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>

                    {/* Platforms */}
                    <div class="mb-4">
                      <p class="text-xs font-medium text-muted-foreground mb-2">Platforms:</p>
                      <div class="flex flex-wrap gap-1.5">
                        <For each={category.platforms}>
                          {(platform) => (
                            <span class="px-2 py-0.5 bg-blue-100 dark:bg-blue-950/30 rounded-full text-xs text-blue-700 dark:text-blue-300">
                              {platform}
                            </span>
                          )}
                        </For>
                      </div>
                    </div>

                    {/* Stats */}
                    <div class="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
                      <span class="flex items-center gap-1">
                        <Zap class="h-3 w-3" />
                        Effort: {getEffortLabel(category.effortLevel)}
                      </span>
                    </div>

                    {/* Search Button */}
                    <Button
                      class="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        props.onCategorySelect(category.id);
                      }}
                      disabled={props.isLoading}
                    >
                      {isLoadingThis() ? (
                        <>
                          <svg
                            class="animate-spin -ml-1 mr-2 h-4 w-4"
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
                          Searching...
                        </>
                      ) : (
                        <>
                          <Search class="h-4 w-4 mr-2" />
                          Find {category.label} Jobs
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          }}
        </For>
      </div>
    </div>
  );
}
