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
  Trophy,
  Star,
  Briefcase,
  ExternalLink,
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

  return (
    <div class="space-y-4">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-foreground mb-2">Explore Job Categories</h2>
        <p class="text-muted-foreground">Select a category to discover opportunities near you</p>
      </div>

      <div class="space-y-2">
        {/* Special TOP 10 of all categories - always visible, triggers deep search */}
        <Card
          class={cn(
            'transition-all duration-200 border-2',
            'border-amber-400/50 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20',
            'hover:border-amber-400 hover:shadow-lg hover:shadow-amber-200/30 dark:hover:shadow-amber-900/20'
          )}
        >
          <button
            type="button"
            onClick={() => props.onCategorySelect(TOP10_ALL_CATEGORY_ID)}
            class="w-full"
            disabled={props.isLoading}
          >
            <CardContent class="p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg shadow-md bg-gradient-to-br from-amber-400 to-yellow-500 text-white">
                    <Trophy class="h-5 w-5" />
                  </div>
                  <div class="text-left">
                    <div class="flex items-center gap-2">
                      <h3 class="font-bold text-amber-900 dark:text-amber-100">
                        TOP 10 of All Categories
                      </h3>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-200 dark:bg-amber-800/50 rounded-full text-xs font-medium text-amber-800 dark:text-amber-200">
                        <Star class="h-3 w-3 fill-current" />
                        {hasCachedJobs() ? 'Best Matches' : 'Deep Search'}
                      </span>
                    </div>
                    <p class="text-sm text-amber-700 dark:text-amber-300">
                      {hasCachedJobs()
                        ? `Top ${globalTop10Count()} jobs from ${categoriesExploredCount()} categories explored`
                        : 'Search all categories to find your best matches'}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {props.isLoading && props.loadingCategory === TOP10_ALL_CATEGORY_ID ? (
                    <svg
                      class="animate-spin h-5 w-5 text-amber-600"
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
                    <Search class="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </button>
        </Card>

        {/* Remote Job Listings - from external APIs (Remotive, Arbeitnow) */}
        <Card
          class={cn(
            'transition-all duration-200 border-2',
            'border-violet-400/50 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20',
            'hover:border-violet-400 hover:shadow-lg hover:shadow-violet-200/30 dark:hover:shadow-violet-900/20'
          )}
        >
          <button
            type="button"
            onClick={() => props.onCategorySelect(REAL_JOBS_CATEGORY_ID)}
            class="w-full"
            disabled={props.isLoading}
          >
            <CardContent class="p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="p-2 rounded-lg shadow-md bg-gradient-to-br from-violet-400 to-purple-500 text-white">
                    <Globe class="h-5 w-5" />
                  </div>
                  <div class="text-left">
                    <div class="flex items-center gap-2">
                      <h3 class="font-bold text-violet-900 dark:text-violet-100">
                        Remote Job Listings
                      </h3>
                      <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-200 dark:bg-violet-800/50 rounded-full text-xs font-medium text-violet-800 dark:text-violet-200">
                        <ExternalLink class="h-3 w-3" />
                        Work from Anywhere
                      </span>
                    </div>
                    <p class="text-sm text-violet-700 dark:text-violet-300">
                      Real remote job postings - no commute required
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  {props.isLoading && props.loadingCategory === REAL_JOBS_CATEGORY_ID ? (
                    <svg
                      class="animate-spin h-5 w-5 text-violet-600"
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
                    <Search class="h-5 w-5 text-violet-600 dark:text-violet-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </button>
        </Card>

        <For each={PROSPECTION_CATEGORIES}>
          {(category) => {
            const isExpanded = () => expandedId() === category.id;
            const isLoadingThis = () => props.isLoading && props.loadingCategory === category.id;
            const IconComponent = ICON_MAP[category.icon as keyof typeof ICON_MAP] || Building;
            const isPlatformOnly = category.googlePlaceTypes.length === 0;

            return (
              <Card
                class={cn(
                  'transition-all duration-200',
                  isExpanded() ? 'ring-2 ring-primary/20' : ''
                )}
              >
                <button type="button" onClick={() => toggleExpand(category.id)} class="w-full">
                  <CardContent class="p-4">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-3">
                        <div
                          class={cn(
                            'p-2 rounded-lg bg-primary/10',
                            getCategoryColor(category.effortLevel)
                          )}
                        >
                          <Dynamic component={IconComponent} class="h-5 w-5" />
                        </div>
                        <div class="text-left">
                          <div class="flex items-center gap-2">
                            <h3 class="font-semibold text-foreground">{category.label}</h3>
                            {isPlatformOnly && (
                              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-950/30 rounded text-xs text-blue-700 dark:text-blue-300">
                                <Globe class="h-3 w-3" />
                                Platforms
                              </span>
                            )}
                          </div>
                          <p class="text-sm text-muted-foreground">
                            {formatHourlyRange(category.avgHourlyRate, currency())}
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        class={cn(
                          'h-5 w-5 text-muted-foreground transition-transform duration-200',
                          isExpanded() && 'rotate-180'
                        )}
                      />
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
