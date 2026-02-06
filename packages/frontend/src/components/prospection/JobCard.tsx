/**
 * JobCard Component
 *
 * Compact, action-oriented job card for search results.
 * Single-line header with score + title + distance + rate.
 * Expandable details section for score breakdown.
 */

import { createSignal, Show, For } from 'solid-js';
import {
  Star,
  MapPin,
  Clock,
  Zap,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  ChevronDown,
  Sparkles,
  Award,
  Globe,
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import type { ScoredJob } from '~/lib/jobScoring';
import { formatStarRating, isTopPick } from '~/lib/jobScoring';
import { getEffortLabel } from '~/config/prospectionCategories';
import { FeedbackButton } from '~/components/ui/FeedbackButton';

interface JobCardProps {
  job: ScoredJob;
  onSave: (job: ScoredJob) => void;
  onExclude?: (job: ScoredJob) => void;
  isSaved: boolean;
  profileId?: string;
}

/** Check if job is from a remote source */
function isRemoteJob(job: ScoredJob): boolean {
  const remoteSources = ['remotive', 'arbeitnow', 'adzuna', 'jooble'];
  return remoteSources.includes(job.source?.toLowerCase() ?? '');
}

export function JobCard(props: JobCardProps) {
  const [expanded, setExpanded] = createSignal(false);

  const effortColor = () => {
    const level = props.job.effortLevel || 3;
    if (level <= 2) return 'text-green-600 dark:text-green-400';
    if (level <= 3) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-orange-600 dark:text-orange-400';
  };

  return (
    <div
      class={cn(
        'border border-border rounded-lg bg-card transition-all hover:shadow-sm',
        isTopPick(props.job.score) && 'border-amber-400/50 bg-amber-50/30 dark:bg-amber-950/10'
      )}
    >
      {/* Main row — always visible */}
      <div class="px-3 py-2.5">
        {/* Line 1: Score + Title + Distance + Rate */}
        <div class="flex items-center gap-2 min-w-0">
          {/* Star rating (compact) */}
          <div class="flex items-center gap-1 shrink-0">
            <div class="flex">
              <For each={[1, 2, 3, 4, 5]}>
                {(star) => (
                  <Star
                    class={cn(
                      'h-3 w-3',
                      star <= Math.floor(props.job.score)
                        ? 'text-amber-500 fill-amber-500'
                        : star <= props.job.score
                          ? 'text-amber-500 fill-amber-500/50'
                          : 'text-muted-foreground/20'
                    )}
                  />
                )}
              </For>
            </div>
            <span class="text-xs font-bold text-foreground">
              {formatStarRating(props.job.score)}
            </span>
          </div>

          {/* Title + Company */}
          <div class="flex-1 min-w-0 flex items-center gap-1.5">
            <span class="font-medium text-sm text-foreground truncate">{props.job.title}</span>
            <Show when={props.job.company}>
              <span class="text-xs text-muted-foreground truncate hidden sm:inline">
                at {props.job.company}
              </span>
            </Show>
          </div>

          {/* Badges (compact) */}
          <div class="flex items-center gap-1.5 shrink-0">
            <Show when={isTopPick(props.job.score)}>
              <span class="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded">
                TOP
              </span>
            </Show>
            <Show
              when={props.job.matchedCertifications && props.job.matchedCertifications.length > 0}
            >
              <span class="px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded flex items-center gap-0.5">
                <Award class="h-2.5 w-2.5" />
                {props.job.matchedCertifications![0].name}
              </span>
            </Show>
            <Show
              when={
                props.job.scoreBreakdown?.profileDetails?.skillMatch &&
                props.job.scoreBreakdown.profileDetails.skillMatch >= 0.5
              }
            >
              <span class="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-bold rounded">
                {Math.round((props.job.scoreBreakdown?.profileDetails?.skillMatch ?? 0) * 100)}%
              </span>
            </Show>
            <Show when={isRemoteJob(props.job)}>
              <span class="px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-300 text-[10px] font-medium rounded flex items-center gap-0.5">
                <Globe class="h-2.5 w-2.5" />
                Remote
              </span>
            </Show>
          </div>
        </div>

        {/* Line 2: Location + Commute + Salary + Effort */}
        <div class="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <Show when={props.job.location}>
            <span class="flex items-center gap-1 truncate max-w-[180px]">
              <MapPin class="h-3 w-3 shrink-0" />
              {props.job.location}
            </span>
          </Show>
          <Show when={props.job.commuteText && !isRemoteJob(props.job)}>
            <span class="flex items-center gap-1 shrink-0">
              <Clock class="h-3 w-3" />
              {props.job.commuteText}
            </span>
          </Show>
          <Show when={props.job.salaryText}>
            <span class="font-semibold text-green-600 dark:text-green-400 shrink-0">
              {props.job.salaryText}
            </span>
          </Show>
          <Show when={props.job.effortLevel}>
            <span class={cn('flex items-center gap-0.5 shrink-0', effortColor())}>
              <Zap class="h-3 w-3" />
              {getEffortLabel(props.job.effortLevel || 3)}
            </span>
          </Show>
        </div>

        {/* Line 3: Actions */}
        <div class="flex items-center gap-2 mt-2">
          {/* Thumb up = Save / Interested */}
          <button
            onClick={() => props.onSave(props.job)}
            disabled={props.isSaved}
            class={cn(
              'flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              props.isSaved
                ? 'bg-green-100 dark:bg-green-950/30 text-green-600 dark:text-green-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700'
            )}
            title={props.isSaved ? 'Already saved' : 'Interested — save this job'}
          >
            <ThumbsUp class="h-3 w-3" />
            {props.isSaved ? 'Saved' : 'Interested'}
          </button>

          {/* Thumb down = Exclude */}
          <Show when={props.onExclude}>
            <button
              onClick={() => props.onExclude?.(props.job)}
              class="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
              title="Not interested — exclude this job"
            >
              <ThumbsDown class="h-3 w-3" />
            </button>
          </Show>

          <Show when={props.job.url}>
            <a
              href={props.job.url}
              target="_blank"
              rel="noopener noreferrer"
              class="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            >
              <ExternalLink class="h-3 w-3" />
              View
            </a>
          </Show>

          <button
            onClick={() => setExpanded(!expanded())}
            class="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors ml-auto"
          >
            Details
            <ChevronDown class={cn('h-3 w-3 transition-transform', expanded() && 'rotate-180')} />
          </button>

          <Show when={props.profileId}>
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
          </Show>
        </div>
      </div>

      {/* Expandable Details */}
      <div
        class={cn(
          'overflow-hidden transition-all duration-200',
          expanded() ? 'max-h-60' : 'max-h-0'
        )}
      >
        <div class="px-3 pb-3 pt-1 border-t border-border/50">
          {/* Company (shown here if hidden on small screens) */}
          <Show when={props.job.company}>
            <p class="text-sm text-foreground mb-2 sm:hidden">{props.job.company}</p>
          </Show>

          {/* Score breakdown */}
          <Show when={props.job.scoreBreakdown}>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mb-2">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Distance</span>
                <span class="font-mono">
                  {Math.round((props.job.scoreBreakdown?.distance ?? 0) * 100)}%
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Profile</span>
                <span class="font-mono">
                  {Math.round((props.job.scoreBreakdown?.profile ?? 0) * 100)}%
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Effort</span>
                <span class="font-mono">
                  {Math.round((props.job.scoreBreakdown?.effort ?? 0) * 100)}%
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Rate</span>
                <span class="font-mono">
                  {Math.round((props.job.scoreBreakdown?.rate ?? 0) * 100)}%
                </span>
              </div>
              <Show when={props.job.scoreBreakdown?.profileDetails?.skillMatch}>
                <div class="flex justify-between text-blue-600 dark:text-blue-400">
                  <span>Skill match</span>
                  <span class="font-mono">
                    {Math.round((props.job.scoreBreakdown?.profileDetails?.skillMatch || 0) * 100)}%
                  </span>
                </div>
              </Show>
              <Show when={props.job.scoreBreakdown?.profileDetails?.certificationBonus}>
                <div class="flex justify-between text-green-600 dark:text-green-400">
                  <span>Cert boost</span>
                  <span class="font-mono">
                    +
                    {Math.round(
                      (props.job.scoreBreakdown?.profileDetails?.certificationBonus || 0) * 100
                    )}
                    %
                  </span>
                </div>
              </Show>
            </div>
          </Show>

          {/* Google rating if available */}
          <Show when={props.job.rating}>
            <div class="flex items-center gap-1 text-xs text-muted-foreground">
              <Star class="h-3 w-3 text-amber-500" />
              Google rating: {props.job.rating?.toFixed(1)}/5
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
