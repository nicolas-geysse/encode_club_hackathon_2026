/**
 * Bruno Hint Component (v2 - Personalized)
 *
 * Agent message block for tab headers with personalized tips.
 * - Fetches tips from /api/tab-tips based on tab type and user data
 * - Shows thumbs up/down feedback that traces to Opik
 * - Falls back to static message if API unavailable
 */

import { createSignal, createEffect, Show, onMount } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import { ThumbsUp, ThumbsDown, Loader2, RefreshCw } from 'lucide-solid';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';
import { createLogger } from '~/lib/logger';

const logger = createLogger('BrunoHint');

export type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

interface BrunoHintProps {
  /** Static message (used as fallback) */
  message: string;
  /** Tab type for personalized tips */
  tabType?: TabType;
  /** Profile ID for API calls */
  profileId?: string;
  /** Context data to send to the LLM */
  contextData?: Record<string, unknown>;
  /** Optional action link */
  action?: {
    label: string;
    href: string;
  };
  /** Compact mode for tighter spacing */
  compact?: boolean;
  /** Disable LLM tips (use static message only) */
  disableLLM?: boolean;
}

export function BrunoHint(props: BrunoHintProps) {
  const [tip, setTip] = createSignal<string>(props.message);
  const [traceId, setTraceId] = createSignal<string | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [feedbackGiven, setFeedbackGiven] = createSignal<'up' | 'down' | null>(null);
  const [isRefreshing, setIsRefreshing] = createSignal(false);

  // Fetch personalized tip from API
  const fetchTip = async (forceRefresh = false) => {
    if (props.disableLLM || !props.tabType || !props.profileId) {
      return;
    }

    setIsLoading(true);
    setFeedbackGiven(null);

    try {
      // Clear cache if force refresh
      if (forceRefresh) {
        await fetch(`/api/tab-tips?profileId=${props.profileId}`, { method: 'DELETE' });
      }

      const response = await fetch('/api/tab-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabType: props.tabType,
          profileId: props.profileId,
          contextData: props.contextData || {},
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.tip) {
          setTip(data.tip);
          setTraceId(data.traceId || null);
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch personalized tip', { error });
      // Keep the static fallback message
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Fetch on mount if we have the required props
  onMount(() => {
    if (props.tabType && props.profileId && !props.disableLLM) {
      fetchTip();
    }
  });

  // Refresh when context data changes significantly
  createEffect(() => {
    // Access contextData to track it
    const data = props.contextData;
    const hasData = data && Object.keys(data).length > 0;

    // Only refetch if we have meaningful context data
    if (hasData && props.tabType && props.profileId && !props.disableLLM) {
      // Debounce to avoid too many requests
      const timeout = setTimeout(() => fetchTip(), 1000);
      return () => clearTimeout(timeout);
    }
  });

  // Handle refresh button click
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTip(true);
  };

  // Send feedback to Opik
  const handleFeedback = async (isHelpful: boolean) => {
    const currentTraceId = traceId();
    const vote = isHelpful ? 'up' : 'down';
    setFeedbackGiven(vote);

    if (!currentTraceId) {
      logger.debug('No trace ID for feedback');
      return;
    }

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId: currentTraceId,
          scores: [
            {
              name: 'tab_tip_helpful',
              value: isHelpful ? 1 : 0,
              reason: isHelpful
                ? 'User found tab tip helpful'
                : 'User did not find tab tip helpful',
            },
          ],
        }),
      });
      logger.debug('Feedback sent', { traceId: currentTraceId, vote });
    } catch (error) {
      logger.warn('Failed to send feedback', { error });
    }
  };

  const showFeedback = () => props.tabType && props.profileId && !props.disableLLM;
  const canRefresh = () => !isLoading() && !isRefreshing() && showFeedback();

  return (
    <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <CardContent class={props.compact ? 'p-2.5' : 'p-3'}>
        <div class="flex items-center gap-2.5">
          {/* Bruno Avatar */}
          <div class="flex-shrink-0">
            <Show
              when={!isLoading()}
              fallback={
                <div class="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 class="h-4 w-4 animate-spin text-primary" />
                </div>
              }
            >
              <PlasmaAvatar size={28} color="green" />
            </Show>
          </div>

          {/* Message */}
          <div class="flex-1 min-w-0">
            <p class="text-xs text-muted-foreground leading-relaxed">{tip()}</p>
          </div>

          {/* Actions */}
          <div class="flex items-center gap-1 flex-shrink-0">
            {/* Optional Action Link */}
            <Show when={props.action}>
              <a
                href={props.action!.href}
                class="text-xs font-medium text-primary hover:underline mr-2"
              >
                {props.action!.label} →
              </a>
            </Show>

            {/* Refresh Button */}
            <Show when={canRefresh()}>
              <button
                onClick={handleRefresh}
                disabled={isRefreshing()}
                class="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                title="Refresh tip"
              >
                <RefreshCw class={`h-3 w-3 ${isRefreshing() ? 'animate-spin' : ''}`} />
              </button>
            </Show>

            {/* Feedback Buttons */}
            <Show when={showFeedback() && !isLoading()}>
              <Show
                when={feedbackGiven() === null}
                fallback={
                  <span class="text-[10px] text-muted-foreground px-1">
                    {feedbackGiven() === 'up' ? '👍' : '👎'}
                  </span>
                }
              >
                <button
                  onClick={() => handleFeedback(true)}
                  class="p-1 rounded hover:bg-green-500/10 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 transition-colors"
                  title="Helpful"
                >
                  <ThumbsUp class="h-3 w-3" />
                </button>
                <button
                  onClick={() => handleFeedback(false)}
                  class="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Not helpful"
                >
                  <ThumbsDown class="h-3 w-3" />
                </button>
              </Show>
            </Show>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BrunoHint;
