/**
 * ProspectionList Component
 *
 * Displays job opportunities as a sorted list with compact JobCard components.
 * Jobs are sorted by score (descending) with star ratings and Top Pick badges.
 */

import { createSignal, createMemo, Show, For } from 'solid-js';
import {
  Star,
  ArrowUpDown,
  Building,
  Globe,
  Navigation,
  Award,
  Clock,
  MapPin,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-solid';
import { Card, CardContent } from '~/components/ui/Card';
import { cn } from '~/lib/cn';
import type { ScoredJob } from '~/lib/jobScoring';
import type { ProspectionSearchMeta } from '~/lib/prospectionTypes';
import { JobCard } from './JobCard';

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
  onExclude?: (job: ScoredJob) => void;
  savedIds?: Set<string>;
  meta?: ProspectionSearchMeta;
  userCertifications?: string[];
  profileId?: string;
  categoryLabel?: string;
  allCategoryJobs?: ScoredJob[];
  showViewTabs?: boolean;
  defaultViewMode?: ViewMode;
  limit?: number;
}

export function ProspectionList(props: ProspectionListProps) {
  const [sortBy, setSortBy] = createSignal<SortOption>('score');
  const [viewMode, setViewMode] = createSignal<ViewMode>(props.defaultViewMode ?? 'all');

  const nearbyCount = createMemo(() => props.jobs.filter(isNearbyJob).length);
  const remoteCount = createMemo(() => props.jobs.filter(isRemoteJob).length);

  const filteredJobs = createMemo(() => {
    const mode = viewMode();
    if (mode === 'nearby') return props.jobs.filter(isNearbyJob);
    if (mode === 'remote') return props.jobs.filter(isRemoteJob);
    return props.jobs;
  });

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

  const top10Jobs = () => sortedJobs().slice(0, 10);

  // Global TOP 10: Balanced selection from ALL categories (max 2 per category)
  const globalTop10Jobs = () => {
    if (!props.allCategoryJobs || props.allCategoryJobs.length === 0) return [];
    const allJobs = props.allCategoryJobs;
    if (allJobs.length <= 10) return [...allJobs].sort((a, b) => b.score - a.score);

    const byCategory = new Map<string, ScoredJob[]>();
    for (const job of allJobs) {
      const cat = job.categoryId || 'unknown';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(job);
    }
    for (const jobs of byCategory.values()) {
      jobs.sort((a, b) => b.score - a.score);
    }

    const result: ScoredJob[] = [];
    const categoryCount = new Map<string, number>();
    const picked = new Set<string>();

    for (const [cat, jobs] of byCategory) {
      if (jobs.length > 0 && result.length < 10) {
        result.push(jobs[0]);
        picked.add(jobs[0].id);
        categoryCount.set(cat, 1);
      }
    }

    const remaining = [...allJobs]
      .filter((j) => !picked.has(j.id))
      .sort((a, b) => b.score - a.score);
    for (const job of remaining) {
      if (result.length >= 10) break;
      const cat = job.categoryId || 'unknown';
      if ((categoryCount.get(cat) || 0) < 2) {
        result.push(job);
        categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
      }
    }

    return result.sort((a, b) => b.score - a.score);
  };

  const certificationMatches = () =>
    filteredJobs().filter(
      (job) => job.matchedCertifications && job.matchedCertifications.length > 0
    );

  const matchedCertNames = (): string[] => {
    const certNames = new Set<string>();
    certificationMatches().forEach((job) => {
      job.matchedCertifications?.forEach((cert) => certNames.add(cert.name));
    });
    return Array.from(certNames);
  };

  const isSaved = (jobId: string) => props.savedIds?.has(jobId) ?? false;

  return (
    <div class="space-y-4">
      {/* P3: View Mode Tabs (Hybrid View) */}
      <Show when={props.showViewTabs && (nearbyCount() > 0 || remoteCount() > 0)}>
        <div class="flex gap-1 p-1 bg-muted rounded-lg">
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
            <Show
              when={props.limit}
              fallback={`${filteredJobs().length} ${filteredJobs().length === 1 ? 'opportunity' : 'opportunities'} found`}
            >
              Showing Top {props.limit} of {filteredJobs().length} opportunities
            </Show>
            {viewMode() !== 'all' ? ` (${viewMode()})` : ''}
          </p>
          <Show when={props.meta?.searchLocation && viewMode() !== 'remote'}>
            <p class="text-xs text-muted-foreground/60 flex items-center gap-1">
              <MapPin class="h-3 w-3" />
              Searching near {props.meta!.searchLocation!.city}
            </p>
          </Show>
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

      {/* Certification Banner */}
      <Show when={certificationMatches().length > 0}>
        <div class="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <Award class="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          <p class="text-sm text-green-800 dark:text-green-200">
            {certificationMatches().length} job{certificationMatches().length > 1 ? 's' : ''} match
            your {matchedCertNames().join(', ')} certification
            {matchedCertNames().length > 1 ? 's' : ''}!
          </p>
        </div>
      </Show>

      {/* Category TOP 10 Section (compact) */}
      <Show when={!props.limit && top10Jobs().length > 0 && props.jobs.length > 15}>
        <div class="border border-primary/20 bg-primary/5 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2">
            <Star class="h-4 w-4 text-primary fill-primary" />
            <h3 class="font-semibold text-foreground text-sm">
              Top Picks in {props.categoryLabel || 'Category'}
            </h3>
          </div>
          <div class="space-y-1">
            <For each={top10Jobs()}>
              {(job, index) => (
                <div class="flex items-center gap-2 px-2 py-1.5 bg-background rounded border border-border/50 hover:border-primary/30 transition-colors text-sm">
                  <span class="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {index() + 1}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <For each={[1, 2, 3, 4, 5]}>
                      {(star) => (
                        <Star
                          class={cn(
                            'h-2.5 w-2.5',
                            star <= Math.floor(job.score)
                              ? 'text-amber-500 fill-amber-500'
                              : 'text-muted-foreground/20'
                          )}
                        />
                      )}
                    </For>
                  </div>
                  <span class="font-medium truncate flex-1">{job.company || job.title}</span>
                  <Show when={job.commuteText}>
                    <span class="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0">
                      <Clock class="h-2.5 w-2.5" />
                      {job.commuteText}
                    </span>
                  </Show>
                  <Show when={job.salaryText}>
                    <span class="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">
                      {job.salaryText}
                    </span>
                  </Show>
                  <Show when={job.url}>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <ExternalLink class="h-3 w-3" />
                    </a>
                  </Show>
                  <div class="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => props.onSave(job)}
                      disabled={isSaved(job.id)}
                      class={cn(
                        'p-1 rounded transition-colors',
                        isSaved(job.id)
                          ? 'text-green-500 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30'
                      )}
                      title={isSaved(job.id) ? 'Saved' : 'Interested'}
                    >
                      <ThumbsUp class="h-3.5 w-3.5" />
                    </button>
                    <Show when={props.onExclude}>
                      <button
                        onClick={() => props.onExclude!(job)}
                        class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Not interested"
                      >
                        <ThumbsDown class="h-3.5 w-3.5" />
                      </button>
                    </Show>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Empty state with diagnostic messages */}
      <Show when={filteredJobs().length === 0}>
        <Card>
          <CardContent class="p-8 text-center">
            <div class="text-muted-foreground">
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
                  View {remoteCount()} remote opportunities instead
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
                  View {nearbyCount()} nearby opportunities instead
                </button>
              </Show>

              <Show when={props.jobs.length === 0}>
                <Building class="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 class="text-lg font-semibold mb-2">No opportunities found</h3>

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

      {/* Job list — compact JobCard components */}
      <div class="space-y-2">
        <For each={props.limit ? sortedJobs().slice(0, props.limit) : sortedJobs()}>
          {(job) => (
            <JobCard
              job={job}
              onSave={props.onSave}
              onExclude={props.onExclude}
              isSaved={isSaved(job.id)}
              profileId={props.profileId}
            />
          )}
        </For>
      </div>
    </div>
  );
}
