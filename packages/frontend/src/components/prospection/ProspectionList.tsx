/**
 * ProspectionList Component
 *
 * Displays job opportunities as a sorted list instead of swipe cards.
 * Jobs are sorted by score (descending) with star ratings and Top Pick badges.
 */

import { createSignal, Show, For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  MapPin,
  Clock,
  Zap,
  Star,
  ExternalLink,
  Save,
  ArrowUpDown,
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  Wrench,
  Baby,
  GraduationCap,
  PartyPopper,
  Laptop,
  Building,
  Award,
} from 'lucide-solid';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/cn';
import type { ScoredJob } from '~/lib/jobScoring';
import type { ProspectionSearchMeta } from '~/lib/prospectionTypes';
import { formatStarRating, isTopPick } from '~/lib/jobScoring';
import { getEffortLabel, getCategoryById } from '~/config/prospectionCategories';

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

type SortOption = 'score' | 'distance' | 'salary';

interface ProspectionListProps {
  jobs: ScoredJob[];
  onSave: (job: ScoredJob) => void;
  savedIds?: Set<string>;
  /** Metadata from API for diagnostic messages */
  meta?: ProspectionSearchMeta;
}

export function ProspectionList(props: ProspectionListProps) {
  const [sortBy, setSortBy] = createSignal<SortOption>('score');

  // Sort jobs based on selected option
  const sortedJobs = () => {
    const jobs = [...props.jobs];
    switch (sortBy()) {
      case 'score':
        return jobs.sort((a, b) => b.score - a.score);
      case 'distance':
        return jobs.sort((a, b) => (a.commuteMinutes ?? 999) - (b.commuteMinutes ?? 999));
      case 'salary':
        return jobs.sort((a, b) => (b.avgHourlyRate ?? 0) - (a.avgHourlyRate ?? 0));
      default:
        return jobs;
    }
  };

  // Check if job is already saved
  const isSaved = (jobId: string) => props.savedIds?.has(jobId) ?? false;

  return (
    <div class="space-y-4">
      {/* Sort controls */}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-muted-foreground">
            {props.jobs.length} {props.jobs.length === 1 ? 'opportunity' : 'opportunities'} found
          </p>
          {/* Show search location for debugging */}
          <Show when={props.meta?.searchLocation}>
            <p class="text-xs text-muted-foreground/60 flex items-center gap-1">
              <MapPin class="h-3 w-3" />
              Searching near {props.meta!.searchLocation!.city}
            </p>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <ArrowUpDown class="h-4 w-4 text-muted-foreground" />
          <select
            value={sortBy()}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            class="text-sm bg-background border border-input rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="score">Best Match</option>
            <option value="distance">Nearest</option>
            <option value="salary">Highest Pay</option>
          </select>
        </div>
      </div>

      {/* Empty state with diagnostic messages */}
      <Show when={props.jobs.length === 0}>
        <Card>
          <CardContent class="p-8 text-center">
            <div class="text-muted-foreground">
              <Building class="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 class="text-lg font-semibold mb-2">No opportunities found</h3>

              {/* Context-aware diagnostic message */}
              <Show when={props.meta?.source === 'platforms'}>
                <p class="text-sm mb-3">
                  This category uses job platforms rather than nearby places.
                </p>
                <p class="text-xs text-muted-foreground/70">
                  Try visiting the platforms listed in the category details.
                </p>
              </Show>

              <Show when={props.meta?.source === 'google_places' && props.meta?.searchPerformed}>
                <p class="text-sm mb-3">Google Places returned no results for this location.</p>
                <p class="text-xs text-muted-foreground/70">
                  Check that the Google Places API is enabled and billing is configured in your GCP
                  console.
                </p>
              </Show>

              <Show when={props.meta?.source === 'google_places' && !props.meta?.hasCoordinates}>
                <p class="text-sm mb-3">Location coordinates are required for this search.</p>
                <p class="text-xs text-muted-foreground/70">
                  Please enable location access or enter your city in your profile.
                </p>
              </Show>

              <Show when={!props.meta}>
                <p class="text-sm">
                  Try selecting a different category or adjusting your location settings.
                </p>
              </Show>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Job list */}
      <div class="space-y-3">
        <For each={sortedJobs()}>
          {(job) => <JobListItem job={job} onSave={props.onSave} isSaved={isSaved(job.id)} />}
        </For>
      </div>
    </div>
  );
}

interface JobListItemProps {
  job: ScoredJob;
  onSave: (job: ScoredJob) => void;
  isSaved: boolean;
}

function JobListItem(props: JobListItemProps) {
  const category = () => getCategoryById(props.job.categoryId);
  const IconComponent = () => {
    const cat = category();
    if (cat) {
      return ICON_MAP[cat.icon as keyof typeof ICON_MAP] || Building;
    }
    return Building;
  };

  // Effort level color
  const effortColor = () => {
    const level = props.job.effortLevel || 3;
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
        'overflow-hidden transition-all hover:shadow-md',
        isTopPick(props.job.score) && 'ring-2 ring-amber-400/50'
      )}
    >
      <CardContent class="p-4">
        <div class="flex gap-4">
          {/* Left: Icon and score */}
          <div class="flex flex-col items-center gap-2 shrink-0">
            <div class="p-2 bg-primary/10 rounded-lg">
              <Dynamic component={IconComponent()} class="h-5 w-5 text-primary" />
            </div>
            {/* Star rating with score breakdown tooltip */}
            <Tooltip>
              <TooltipTrigger class="cursor-help">
                <div class="flex flex-col items-center">
                  <div class="flex">
                    <For each={[1, 2, 3, 4, 5]}>
                      {(star) => (
                        <Star
                          class={cn(
                            'h-3 w-3',
                            star <= Math.floor(props.job.score)
                              ? 'text-primary fill-primary'
                              : star <= props.job.score
                                ? 'text-primary fill-primary/50'
                                : 'text-muted-foreground/30'
                          )}
                        />
                      )}
                    </For>
                  </div>
                  <span class="text-xs font-bold text-primary">
                    {formatStarRating(props.job.score)}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent class="max-w-xs">
                <div class="text-xs space-y-1">
                  <div class="font-semibold mb-1">Why this job matches:</div>
                  <div class="flex justify-between gap-4">
                    <span>Distance</span>
                    <span class="font-mono">
                      {Math.round(props.job.scoreBreakdown.distance * 100)}%
                    </span>
                  </div>
                  <div class="flex justify-between gap-4">
                    <span>Profile match</span>
                    <span class="font-mono">
                      {Math.round(props.job.scoreBreakdown.profile * 100)}%
                    </span>
                  </div>
                  <div class="flex justify-between gap-4">
                    <span>Low effort</span>
                    <span class="font-mono">
                      {Math.round(props.job.scoreBreakdown.effort * 100)}%
                    </span>
                  </div>
                  <div class="flex justify-between gap-4">
                    <span>Good rate</span>
                    <span class="font-mono">
                      {Math.round(props.job.scoreBreakdown.rate * 100)}%
                    </span>
                  </div>
                  <Show when={props.job.scoreBreakdown.profileDetails?.certificationBonus}>
                    <div class="flex justify-between gap-4 text-green-600 dark:text-green-400">
                      <span>Certification boost</span>
                      <span class="font-mono">
                        +
                        {Math.round(
                          (props.job.scoreBreakdown.profileDetails?.certificationBonus || 0) * 100
                        )}
                        %
                      </span>
                    </div>
                  </Show>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Middle: Job details */}
          <div class="flex-1 min-w-0">
            {/* Title row with Top Pick + Certification badges */}
            <div class="flex items-start gap-2 mb-1 flex-wrap">
              <h3 class="font-semibold text-foreground truncate">{props.job.title}</h3>
              <Show when={isTopPick(props.job.score)}>
                <span class="shrink-0 px-2 py-0.5 bg-amber-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                  <Star class="h-3 w-3 fill-white" />
                  Top Pick
                </span>
              </Show>
              {/* Phase 5: Certification badge */}
              <Show
                when={props.job.matchedCertifications && props.job.matchedCertifications.length > 0}
              >
                <Tooltip>
                  <TooltipTrigger>
                    <span class="shrink-0 px-2 py-0.5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                      <Award class="h-3 w-3" />
                      {props.job.matchedCertifications![0].name}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Your {props.job.matchedCertifications![0].name} certification boosts this job!
                  </TooltipContent>
                </Tooltip>
              </Show>
            </div>

            {/* Company */}
            <Show when={props.job.company}>
              <p class="text-sm text-muted-foreground truncate mb-2">{props.job.company}</p>
            </Show>

            {/* Location and commute */}
            <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-2">
              <Show when={props.job.location}>
                <div class="flex items-center gap-1">
                  <MapPin class="h-3 w-3 shrink-0" />
                  <span class="truncate max-w-[150px]">{props.job.location}</span>
                </div>
              </Show>
              <Show when={props.job.commuteText}>
                <div class="flex items-center gap-1">
                  <Clock class="h-3 w-3 shrink-0" />
                  <span>{props.job.commuteText}</span>
                </div>
              </Show>
            </div>

            {/* Tags row */}
            <div class="flex flex-wrap items-center gap-2">
              {/* Salary */}
              <Show when={props.job.salaryText}>
                <span class="text-sm font-bold text-green-600 dark:text-green-400">
                  {props.job.salaryText}
                </span>
              </Show>

              {/* Effort level */}
              <Show when={props.job.effortLevel}>
                <span
                  class={cn(
                    'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs',
                    effortColor()
                  )}
                >
                  <Zap class="h-3 w-3" />
                  {getEffortLabel(props.job.effortLevel || 3)}
                </span>
              </Show>

              {/* Google rating */}
              <Show when={props.job.rating}>
                <span class="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star class="h-3 w-3 text-amber-500 fill-amber-500" />
                  {props.job.rating?.toFixed(1)}
                </span>
              </Show>

              {/* Open status */}
              <Show when={typeof props.job.openNow === 'boolean'}>
                <span
                  class={cn(
                    'text-xs px-2 py-0.5 rounded-full',
                    props.job.openNow
                      ? 'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  )}
                >
                  {props.job.openNow ? 'Open' : 'Closed'}
                </span>
              </Show>
            </div>
          </div>

          {/* Right: Actions */}
          <div class="flex flex-col gap-2 shrink-0">
            <Button
              size="sm"
              variant={props.isSaved ? 'outline' : 'default'}
              onClick={() => props.onSave(props.job)}
              disabled={props.isSaved}
              class="w-20"
            >
              <Save class="h-4 w-4 mr-1" />
              {props.isSaved ? 'Saved' : 'Save'}
            </Button>
            <Show when={props.job.url}>
              <a
                href={props.job.url}
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center justify-center gap-1 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md text-foreground transition-colors"
              >
                <ExternalLink class="h-3 w-3" />
                View
              </a>
            </Show>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
