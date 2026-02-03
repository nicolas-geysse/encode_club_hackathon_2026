/**
 * ProspectionList Component
 *
 * Displays job opportunities as a sorted list instead of swipe cards.
 * Jobs are sorted by score (descending) with star ratings and Top Pick badges.
 */

import { createSignal, createMemo, Show, For } from 'solid-js';
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
  Globe,
  Navigation,
} from 'lucide-solid';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';
import { Card, CardContent } from '~/components/ui/Card';
import { Button } from '~/components/ui/Button';
import { cn } from '~/lib/cn';
import type { ScoredJob } from '~/lib/jobScoring';
import type { ProspectionSearchMeta } from '~/lib/prospectionTypes';
import { formatStarRating, isTopPick } from '~/lib/jobScoring';
import { getEffortLabel, getCategoryById } from '~/config/prospectionCategories';
import type { CertificationDefinition } from '~/lib/data/certificationMapping';
import { FeedbackButton } from '~/components/ui/FeedbackButton';

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

/** P3: View mode for hybrid Places/Remote filtering */
export type ViewMode = 'all' | 'nearby' | 'remote';

/** Check if job is from a remote source (Remotive, Arbeitnow, etc.) */
function isRemoteJob(job: ScoredJob): boolean {
  const remoteSources = ['remotive', 'arbeitnow', 'adzuna', 'jooble'];
  return remoteSources.includes(job.source?.toLowerCase() ?? '');
}

/** Check if job is from a local source (Google Places) */
function isNearbyJob(job: ScoredJob): boolean {
  return !isRemoteJob(job);
}

interface ProspectionListProps {
  jobs: ScoredJob[];
  onSave: (job: ScoredJob) => void;
  savedIds?: Set<string>;
  /** Metadata from API for diagnostic messages */
  meta?: ProspectionSearchMeta;
  /** Phase 8: User's certifications for proactive banner */
  userCertifications?: string[];
  /** Phase 6: Profile ID for feedback tracking */
  profileId?: string;
  /** Current category label for TOP 10 context */
  categoryLabel?: string;
  /** All jobs from all searched categories (for global TOP 10) */
  allCategoryJobs?: ScoredJob[];
  /** P3: Enable hybrid view tabs (Nearby Places / Remote Jobs / All) */
  showViewTabs?: boolean;
  /** P3: Default view mode */
  defaultViewMode?: ViewMode;
}

export function ProspectionList(props: ProspectionListProps) {
  const [sortBy, setSortBy] = createSignal<SortOption>('score');
  const [viewMode, setViewMode] = createSignal<ViewMode>(props.defaultViewMode ?? 'all');

  // P3: Count jobs by source type
  const nearbyCount = createMemo(() => props.jobs.filter(isNearbyJob).length);
  const remoteCount = createMemo(() => props.jobs.filter(isRemoteJob).length);

  // P3: Filter jobs based on view mode
  const filteredJobs = createMemo(() => {
    const mode = viewMode();
    if (mode === 'nearby') return props.jobs.filter(isNearbyJob);
    if (mode === 'remote') return props.jobs.filter(isRemoteJob);
    return props.jobs; // 'all'
  });

  // Sort jobs based on selected option
  const sortedJobs = () => {
    const jobs = [...filteredJobs()];
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

  // Phase 8b: TOP 10 jobs according to current sort option
  const top10Jobs = () => sortedJobs().slice(0, 10);

  // Global TOP 10: Best from ALL categories (when allCategoryJobs is provided)
  const globalTop10Jobs = () => {
    if (!props.allCategoryJobs || props.allCategoryJobs.length === 0) return [];
    return [...props.allCategoryJobs].sort((a, b) => b.score - a.score).slice(0, 10);
  };

  // Get label for TOP 10 section based on sort option
  const top10Label = () => {
    switch (sortBy()) {
      case 'score':
        return 'Best Matches';
      case 'distance':
        return 'Nearest';
      case 'salary':
        return 'Highest Paying';
      default:
        return 'Top 10';
    }
  };

  // Phase 8: Jobs with certification matches (filtered by view mode)
  const certificationMatches = () => {
    const matches = filteredJobs().filter(
      (job) => job.matchedCertifications && job.matchedCertifications.length > 0
    );
    return matches;
  };

  // Phase 8: Unique certifications found in jobs
  const matchedCertNames = (): string[] => {
    const certNames = new Set<string>();
    certificationMatches().forEach((job) => {
      job.matchedCertifications?.forEach((cert) => certNames.add(cert.name));
    });
    return Array.from(certNames);
  };

  // Check if job is already saved
  const isSaved = (jobId: string) => props.savedIds?.has(jobId) ?? false;

  return (
    <div class="space-y-4">
      {/* P3: View Mode Tabs (Hybrid View) */}
      <Show when={props.showViewTabs && (nearbyCount() > 0 || remoteCount() > 0)}>
        <div class="flex gap-1 p-1 bg-muted rounded-lg">
          {/* All */}
          <button
            onClick={() => setViewMode('all')}
            class={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              viewMode() === 'all'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Star class="h-4 w-4" />
            All
            <span class="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
              {props.jobs.length}
            </span>
          </button>

          {/* Nearby Places */}
          <button
            onClick={() => setViewMode('nearby')}
            class={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              viewMode() === 'nearby'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Navigation class="h-4 w-4" />
            Nearby
            <Show when={nearbyCount() > 0}>
              <span class="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                {nearbyCount()}
              </span>
            </Show>
          </button>

          {/* Remote Jobs */}
          <button
            onClick={() => setViewMode('remote')}
            class={cn(
              'flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors',
              viewMode() === 'remote'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <Globe class="h-4 w-4" />
            Remote
            <Show when={remoteCount() > 0}>
              <span class="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-1.5 py-0.5 rounded-full">
                {remoteCount()}
              </span>
            </Show>
          </button>
        </div>
      </Show>

      {/* Sort controls */}
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-muted-foreground">
            {filteredJobs().length} {filteredJobs().length === 1 ? 'opportunity' : 'opportunities'}{' '}
            {viewMode() !== 'all' ? `(${viewMode()})` : 'found'}
          </p>
          {/* Show search location for debugging */}
          <Show when={props.meta?.searchLocation && viewMode() !== 'remote'}>
            <p class="text-xs text-muted-foreground/60 flex items-center gap-1">
              <MapPin class="h-3 w-3" />
              Searching near {props.meta!.searchLocation!.city}
            </p>
          </Show>
          {/* Show remote info */}
          <Show when={viewMode() === 'remote'}>
            <p class="text-xs text-violet-600 dark:text-violet-400 flex items-center gap-1">
              <Globe class="h-3 w-3" />
              Work from anywhere - no commute required
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

      {/* Phase 8: Proactive Certification Banner */}
      <Show when={certificationMatches().length > 0}>
        <div class="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <div class="flex items-center justify-center w-10 h-10 bg-green-100 dark:bg-green-900/50 rounded-full">
            <Award class="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-green-800 dark:text-green-200">
              {certificationMatches().length} job{certificationMatches().length > 1 ? 's' : ''}{' '}
              match your {matchedCertNames().join(', ')} certification
              {matchedCertNames().length > 1 ? 's' : ''}!
            </p>
            <p class="text-xs text-green-600 dark:text-green-400">Look for the green badge below</p>
          </div>
        </div>
      </Show>

      {/* Global TOP 10: Best from ALL searched categories */}
      <Show when={globalTop10Jobs().length > 0}>
        <Card class="border-2 border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-3">
              <div class="flex items-center gap-1">
                <Star class="h-5 w-5 text-amber-500 fill-amber-500" />
                <Star class="h-4 w-4 text-amber-400 fill-amber-400" />
              </div>
              <h3 class="font-semibold text-foreground">
                TOP 10 — Best Matches — from all categories
              </h3>
              <span class="text-xs text-muted-foreground ml-auto">
                {globalTop10Jobs().length} best overall
              </span>
            </div>
            <div class="space-y-2">
              <For each={globalTop10Jobs()}>
                {(job, index) => {
                  const jobCategory = getCategoryById(job.categoryId);
                  return (
                    <div class="flex items-center gap-3 p-2 bg-background rounded-md border border-border hover:border-amber-400/50 transition-colors">
                      {/* Rank badge */}
                      <div class="flex-shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-bold text-amber-600 dark:text-amber-400">
                        {index() + 1}
                      </div>
                      {/* Star rating */}
                      <div class="flex items-center gap-0.5 shrink-0">
                        <For each={[1, 2, 3, 4, 5]}>
                          {(star) => (
                            <Star
                              class={cn(
                                'h-3 w-3',
                                star <= Math.floor(job.score)
                                  ? 'text-amber-500 fill-amber-500'
                                  : 'text-muted-foreground/30'
                              )}
                            />
                          )}
                        </For>
                      </div>
                      {/* Job info */}
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{job.company || job.title}</p>
                        <p class="text-xs text-muted-foreground truncate">
                          <span class="text-amber-600 dark:text-amber-400 font-medium">
                            {jobCategory?.label || job.categoryId}
                          </span>
                          {job.location ? ` • ${job.location}` : ''}
                          {job.commuteText ? ` • ${job.commuteText}` : ''}
                        </p>
                      </div>
                      {/* Certification badge */}
                      <Show
                        when={job.matchedCertifications && job.matchedCertifications.length > 0}
                      >
                        <span class="shrink-0 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                          {job.matchedCertifications![0].name}
                        </span>
                      </Show>
                      {/* View button */}
                      <Show when={job.url}>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="shrink-0 flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md text-foreground transition-colors"
                        >
                          <ExternalLink class="h-3 w-3" />
                          View
                        </a>
                      </Show>
                      {/* Save button */}
                      <Button
                        size="sm"
                        variant={isSaved(job.id) ? 'outline' : 'default'}
                        onClick={() => props.onSave(job)}
                        disabled={isSaved(job.id)}
                        class="shrink-0"
                      >
                        {isSaved(job.id) ? 'Saved' : 'Save'}
                      </Button>
                    </div>
                  );
                }}
              </For>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Category TOP 10 Section - Respects current sort option */}
      <Show when={top10Jobs().length > 0}>
        <Card class="border-2 border-primary/20 bg-primary/5">
          <CardContent class="p-4">
            <div class="flex items-center gap-2 mb-3">
              <Star class="h-5 w-5 text-primary fill-primary" />
              <h3 class="font-semibold text-foreground">
                TOP 10 — {top10Label()} —{' '}
                {props.categoryLabel ? `from ${props.categoryLabel}` : 'this category'}
              </h3>
              <span class="text-xs text-muted-foreground ml-auto">
                {top10Jobs().length} of {props.jobs.length} jobs
              </span>
            </div>
            <div class="space-y-2">
              <For each={top10Jobs()}>
                {(job, index) => (
                  <div class="flex items-center gap-3 p-2 bg-background rounded-md border border-border hover:border-primary/30 transition-colors">
                    {/* Rank badge */}
                    <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {index() + 1}
                    </div>
                    {/* Star rating */}
                    <div class="flex items-center gap-0.5 shrink-0">
                      <For each={[1, 2, 3, 4, 5]}>
                        {(star) => (
                          <Star
                            class={cn(
                              'h-3 w-3',
                              star <= Math.floor(job.score)
                                ? 'text-amber-500 fill-amber-500'
                                : 'text-muted-foreground/30'
                            )}
                          />
                        )}
                      </For>
                    </div>
                    {/* Job info */}
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium truncate">{job.company || job.title}</p>
                      <p class="text-xs text-muted-foreground truncate">
                        {/* Show relevant info based on sort */}
                        <Show when={sortBy() === 'distance' && job.commuteText}>
                          <span class="text-blue-600 dark:text-blue-400 font-medium">
                            {job.commuteText}
                          </span>
                          {job.location ? ` • ${job.location}` : ''}
                        </Show>
                        <Show when={sortBy() === 'salary' && job.salaryText}>
                          <span class="text-green-600 dark:text-green-400 font-medium">
                            {job.salaryText}
                          </span>
                          {job.location ? ` • ${job.location}` : ''}
                        </Show>
                        <Show when={sortBy() === 'score'}>
                          {job.location}
                          {job.commuteText ? ` • ${job.commuteText}` : ''}
                        </Show>
                      </p>
                    </div>
                    {/* Certification badge */}
                    <Show when={job.matchedCertifications && job.matchedCertifications.length > 0}>
                      <span class="shrink-0 px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                        {job.matchedCertifications![0].name}
                      </span>
                    </Show>
                    {/* View button */}
                    <Show when={job.url}>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="shrink-0 flex items-center gap-1 px-2 py-1 text-xs bg-muted hover:bg-muted/80 rounded-md text-foreground transition-colors"
                      >
                        <ExternalLink class="h-3 w-3" />
                        View
                      </a>
                    </Show>
                    {/* Save button */}
                    <Button
                      size="sm"
                      variant={isSaved(job.id) ? 'outline' : 'default'}
                      onClick={() => props.onSave(job)}
                      disabled={isSaved(job.id)}
                      class="shrink-0"
                    >
                      {isSaved(job.id) ? 'Saved' : 'Save'}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Empty state with diagnostic messages */}
      <Show when={filteredJobs().length === 0}>
        <Card>
          <CardContent class="p-8 text-center">
            <div class="text-muted-foreground">
              {/* P3: View-specific empty states */}
              <Show when={viewMode() === 'nearby' && props.jobs.length > 0}>
                <Navigation class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 class="text-lg font-semibold mb-2">No nearby places in this category</h3>
                <p class="text-sm mb-3">
                  All {props.jobs.length} opportunities in this search are remote jobs.
                </p>
                <button
                  onClick={() => setViewMode('remote')}
                  class="text-sm text-violet-600 dark:text-violet-400 hover:underline"
                >
                  View {remoteCount()} remote opportunities instead →
                </button>
              </Show>

              <Show when={viewMode() === 'remote' && props.jobs.length > 0}>
                <Globe class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 class="text-lg font-semibold mb-2">No remote jobs in this category</h3>
                <p class="text-sm mb-3">
                  All {props.jobs.length} opportunities in this search are nearby places.
                </p>
                <button
                  onClick={() => setViewMode('nearby')}
                  class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View {nearbyCount()} nearby opportunities instead →
                </button>
              </Show>

              <Show when={props.jobs.length === 0}>
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
                    Check that the Google Places API is enabled and billing is configured in your
                    GCP console.
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
              </Show>
            </div>
          </CardContent>
        </Card>
      </Show>

      {/* Job list */}
      <div class="space-y-3">
        <For each={sortedJobs()}>
          {(job) => (
            <JobListItem
              job={job}
              onSave={props.onSave}
              isSaved={isSaved(job.id)}
              profileId={props.profileId}
            />
          )}
        </For>
      </div>
    </div>
  );
}

interface JobListItemProps {
  job: ScoredJob;
  onSave: (job: ScoredJob) => void;
  isSaved: boolean;
  /** Phase 6: Profile ID for feedback tracking */
  profileId?: string;
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
              {/* P3: Source badge */}
              <Show when={isRemoteJob(props.job)}>
                <span class="flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 rounded-full">
                  <Globe class="h-3 w-3" />
                  Remote
                </span>
              </Show>
              <Show when={props.job.location}>
                <div class="flex items-center gap-1">
                  <MapPin class="h-3 w-3 shrink-0" />
                  <span class="truncate max-w-[150px]">{props.job.location}</span>
                </div>
              </Show>
              <Show when={props.job.commuteText && !isRemoteJob(props.job)}>
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
            {/* Phase 6: Feedback buttons */}
            <Show when={props.profileId}>
              <div class="flex items-center justify-center">
                <FeedbackButton
                  suggestionType="job"
                  suggestionId={props.job.id}
                  profileId={props.profileId}
                  size="sm"
                  metadata={{
                    categoryId: props.job.categoryId,
                    score: props.job.score,
                    company: props.job.company,
                  }}
                />
              </div>
            </Show>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
