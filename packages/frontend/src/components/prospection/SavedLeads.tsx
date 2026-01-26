/**
 * SavedLeads Component
 *
 * Displays a list of saved leads with status management.
 * Allows filtering by category and status.
 */

import { createSignal, Show, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  MapPin,
  Clock,
  ExternalLink,
  Trash2,
  Check,
  X,
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  Wrench,
  Baby,
  GraduationCap,
  PartyPopper,
  Laptop,
  Building,
  Filter,
} from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/cn';
import type { Lead, LeadStatus } from '~/lib/prospectionTypes';
import { getCategoryById } from '~/config/prospectionCategories';

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

interface SavedLeadsProps {
  leads: Lead[];
  onStatusChange: (leadId: string, status: LeadStatus) => void;
  onDelete: (leadId: string) => void;
  onLeadClick?: (leadId: string) => void;
  highlightedId?: string;
}

const STATUS_COLORS: Record<LeadStatus, string> = {
  interested: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300',
  applied: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300',
  rejected: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-300',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  interested: 'Interested',
  applied: 'Applied',
  rejected: 'Rejected',
  archived: 'Archived',
};

export function SavedLeads(props: SavedLeadsProps) {
  const [filterCategory, setFilterCategory] = createSignal<string | null>(null);
  const [filterStatus, setFilterStatus] = createSignal<LeadStatus | null>(null);
  const [showFilters, setShowFilters] = createSignal(false);

  // Get unique categories from leads
  const categories = () => {
    const cats = new Set(props.leads.map((l) => l.category));
    return Array.from(cats);
  };

  // Filtered leads
  const filteredLeads = () => {
    let result = props.leads;

    if (filterCategory()) {
      result = result.filter((l) => l.category === filterCategory());
    }

    if (filterStatus()) {
      result = result.filter((l) => l.status === filterStatus());
    }

    return result;
  };

  // Stats
  const stats = () => {
    const all = props.leads;
    return {
      total: all.length,
      interested: all.filter((l) => l.status === 'interested').length,
      applied: all.filter((l) => l.status === 'applied').length,
      rejected: all.filter((l) => l.status === 'rejected').length,
    };
  };

  return (
    <div class="space-y-4">
      {/* Header with stats */}
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-foreground">Saved Leads</h3>
          <p class="text-sm text-muted-foreground">
            {stats().total} total • {stats().interested} interested • {stats().applied} applied
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFilters(!showFilters())}
          class={cn(showFilters() && 'bg-muted')}
        >
          <Filter class="h-4 w-4 mr-1" />
          Filter
        </Button>
      </div>

      {/* Filters */}
      <Show when={showFilters()}>
        <Card>
          <CardContent class="p-4 space-y-3">
            {/* Category filter */}
            <div>
              <p class="text-xs font-medium text-muted-foreground mb-2">Category</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterCategory(null)}
                  class={cn(
                    'px-2 py-1 rounded-full text-xs transition-colors',
                    filterCategory() === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  )}
                >
                  All
                </button>
                <For each={categories()}>
                  {(catId) => {
                    const cat = getCategoryById(catId);
                    return (
                      <button
                        type="button"
                        onClick={() => setFilterCategory(catId)}
                        class={cn(
                          'px-2 py-1 rounded-full text-xs transition-colors',
                          filterCategory() === catId
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground hover:bg-muted/80'
                        )}
                      >
                        {cat?.label || catId}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Status filter */}
            <div>
              <p class="text-xs font-medium text-muted-foreground mb-2">Status</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterStatus(null)}
                  class={cn(
                    'px-2 py-1 rounded-full text-xs transition-colors',
                    filterStatus() === null
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  )}
                >
                  All
                </button>
                <For each={['interested', 'applied', 'rejected', 'archived'] as LeadStatus[]}>
                  {(status) => (
                    <button
                      type="button"
                      onClick={() => setFilterStatus(status)}
                      class={cn(
                        'px-2 py-1 rounded-full text-xs transition-colors',
                        filterStatus() === status
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground hover:bg-muted/80'
                      )}
                    >
                      {STATUS_LABELS[status]}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Leads list */}
      <Show
        when={filteredLeads().length > 0}
        fallback={
          <div class="text-center py-8 text-muted-foreground">
            <p>No leads found</p>
            <p class="text-sm">Start swiping to save opportunities</p>
          </div>
        }
      >
        <div class="space-y-2">
          <For each={filteredLeads()}>
            {(lead) => {
              const category = getCategoryById(lead.category);
              const IconComponent = ICON_MAP[category?.icon as keyof typeof ICON_MAP] || Building;
              const isHighlighted = () => props.highlightedId === lead.id;

              return (
                <Card
                  class={cn(
                    'transition-all duration-200 cursor-pointer',
                    isHighlighted() && 'ring-2 ring-primary shadow-md'
                  )}
                  onClick={() => props.onLeadClick?.(lead.id)}
                >
                  <CardContent class="p-4">
                    <div class="flex items-start justify-between gap-3">
                      {/* Left: Icon and Info */}
                      <div class="flex items-start gap-3 flex-1 min-w-0">
                        <div class="p-2 bg-muted rounded-lg shrink-0">
                          <Dynamic component={IconComponent} class="h-5 w-5 text-primary" />
                        </div>
                        <div class="min-w-0 flex-1">
                          <h4 class="font-medium text-foreground truncate">{lead.title}</h4>
                          <Show when={lead.company}>
                            <p class="text-sm text-muted-foreground truncate">{lead.company}</p>
                          </Show>
                          <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <Show when={lead.locationRaw}>
                              <span class="flex items-center gap-1">
                                <MapPin class="h-3 w-3" />
                                {lead.locationRaw}
                              </span>
                            </Show>
                            <Show when={lead.commuteTimeMins}>
                              <span class="flex items-center gap-1">
                                <Clock class="h-3 w-3" />
                                {lead.commuteTimeMins} min
                              </span>
                            </Show>
                          </div>
                        </div>
                      </div>

                      {/* Right: Status and Actions */}
                      <div class="flex flex-col items-end gap-2 shrink-0">
                        <span
                          class={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            STATUS_COLORS[lead.status]
                          )}
                        >
                          {STATUS_LABELS[lead.status]}
                        </span>

                        {/* Action buttons */}
                        <div class="flex items-center gap-1">
                          <Show when={lead.status === 'interested'}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onStatusChange(lead.id, 'applied');
                              }}
                              class="p-1.5 rounded-md hover:bg-amber-100 dark:hover:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                              title="Mark as Applied"
                            >
                              <Check class="h-4 w-4" />
                            </button>
                          </Show>

                          <Show when={lead.status !== 'rejected'}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                props.onStatusChange(lead.id, 'rejected');
                              }}
                              class="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                              title="Mark as Rejected"
                            >
                              <X class="h-4 w-4" />
                            </button>
                          </Show>

                          <Show when={lead.url}>
                            <a
                              href={lead.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              class="p-1.5 rounded-md hover:bg-blue-100 dark:hover:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                              title="Open External Link"
                            >
                              <ExternalLink class="h-4 w-4" />
                            </a>
                          </Show>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onDelete(lead.id);
                            }}
                            class="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-950/30 text-red-500"
                            title="Delete"
                          >
                            <Trash2 class="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Notes */}
                    <Show when={lead.notes}>
                      <p class="mt-2 text-sm text-muted-foreground border-t border-border/50 pt-2">
                        {lead.notes}
                      </p>
                    </Show>
                  </CardContent>
                </Card>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
