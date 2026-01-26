/**
 * CategoryExplorer Component
 *
 * Displays prospection categories in an accordion layout.
 * Click a category to trigger a job search.
 */

import { For, createSignal } from 'solid-js';
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
}

export function CategoryExplorer(props: CategoryExplorerProps) {
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId() === id ? null : id);
  };

  const currency = () => props.currency || 'EUR';

  return (
    <div class="space-y-4">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-foreground mb-2">Explore Job Categories</h2>
        <p class="text-muted-foreground">Select a category to discover opportunities near you</p>
      </div>

      <div class="space-y-2">
        <For each={PROSPECTION_CATEGORIES}>
          {(category) => {
            const isExpanded = () => expandedId() === category.id;
            const isLoadingThis = () => props.isLoading && props.loadingCategory === category.id;
            const IconComponent = ICON_MAP[category.icon as keyof typeof ICON_MAP] || Building;

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
                          <h3 class="font-semibold text-foreground">{category.label}</h3>
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
