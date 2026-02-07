/**
 * Bruno Hint V2 Component (Strategy Pattern)
 *
 * Enhanced agent message block for tab headers.
 * Uses the new Strategy pattern orchestration from /api/tab-tips.
 *
 * Features:
 * - Multi-agent orchestration per tab
 * - Expandable agent details panel
 * - Processing info (agents used, duration, fallback level)
 * - Opik tracing with user feedback
 * - Smart cache integration
 */

import { createSignal, createEffect, Show, onMount, For, untrack } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import {
  ThumbsUp,
  ThumbsDown,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Bot,
  Sparkles,
  Briefcase,
  PiggyBank,
  TrendingUp,
  Target,
  Clock,
  Zap,
} from 'lucide-solid';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';
import { cn } from '~/lib/cn';
import { createLogger } from '~/lib/logger';
import { goalAchieved } from '~/lib/goalAchievementStore';

const logger = createLogger('BrunoHintV2');

// ============================================================================
// Types
// ============================================================================

export type TabType = 'profile' | 'goals' | 'budget' | 'trade' | 'jobs' | 'swipe';

type TipCategory = 'energy' | 'progress' | 'mission' | 'opportunity' | 'warning' | 'celebration';

interface AgentRecommendation {
  agentId: string;
  recommendation: string;
  confidence: number;
}

interface TabTipResponse {
  tip: {
    title: string;
    message: string;
    category: TipCategory;
    action?: { label: string; href: string };
  };
  insights: {
    tabSpecific: Record<string, unknown>;
    agentRecommendations?: AgentRecommendation[];
  };
  processingInfo: {
    agentsUsed: string[];
    fallbackLevel: 0 | 1 | 2 | 3;
    durationMs: number;
    orchestrationType: 'full' | 'partial' | 'algorithms' | 'static';
    cached: boolean;
    cacheKey?: string;
  };
  traceId: string;
  traceUrl: string;
}

interface BrunoHintV2Props {
  /** Tab type for personalized tips */
  tabType: TabType;
  /** Profile ID for API calls */
  profileId?: string;
  /** Context data to send to the orchestrator */
  contextData?: Record<string, unknown>;
  /** Static fallback message */
  fallbackMessage?: string;
  /** Optional action link (fallback) */
  action?: {
    label: string;
    href: string;
  };
  /** Compact mode for tighter spacing */
  compact?: boolean;
  /** Disable LLM tips (use static message only) */
  disableLLM?: boolean;
  /** Show expandable agent details */
  showAgentDetails?: boolean;
  /** Callback when tip is loaded */
  onTipLoaded?: (response: TabTipResponse) => void;
}

// ============================================================================
// Constants
// ============================================================================

const AGENT_CONFIG: Record<string, { icon: typeof Bot; label: string; color: string }> = {
  'budget-coach': { icon: PiggyBank, label: 'Budget', color: 'text-green-500' },
  'job-matcher': { icon: Briefcase, label: 'Jobs', color: 'text-blue-500' },
  'strategy-comparator': { icon: TrendingUp, label: 'Strategy', color: 'text-purple-500' },
  guardian: { icon: Target, label: 'Guardian', color: 'text-orange-500' },
  'money-maker': { icon: Zap, label: 'Money', color: 'text-yellow-500' },
};

const CATEGORY_COLORS: Record<TipCategory, string> = {
  energy: 'border-l-amber-500',
  progress: 'border-l-green-500',
  mission: 'border-l-blue-500',
  opportunity: 'border-l-purple-500',
  warning: 'border-l-red-500',
  celebration: 'border-l-yellow-500',
};

const FALLBACK_LEVEL_LABELS: Record<number, string> = {
  0: 'Full',
  1: 'Partial',
  2: 'Algo',
  3: 'Static',
};

// ============================================================================
// Component
// ============================================================================

export function BrunoHintV2(props: BrunoHintV2Props) {
  // State
  const [tipData, setTipData] = createSignal<TabTipResponse | null>(null);
  const [isLoading, setIsLoading] = createSignal(false);
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [showDetails, setShowDetails] = createSignal(false);
  const [feedbackGiven, setFeedbackGiven] = createSignal<'up' | 'down' | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  // Derived state
  const tip = () => tipData()?.tip;
  const processingInfo = () => tipData()?.processingInfo;
  const agentRecommendations = () => tipData()?.insights?.agentRecommendations;
  const traceId = () => tipData()?.traceId;

  const displayMessage = () => {
    return tip()?.message || props.fallbackMessage || 'Conseil Bruno en cours de chargement...';
  };

  const displayTitle = () => {
    return tip()?.title || 'Bruno';
  };

  const displayAction = () => {
    return tip()?.action || props.action;
  };

  const category = () => tip()?.category || 'opportunity';

  // Fetch tip from API
  const fetchTip = async (forceRefresh = false) => {
    if (props.disableLLM || !props.profileId || goalAchieved()) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setFeedbackGiven(null);

    try {
      // Clear cache if force refresh
      if (forceRefresh) {
        await fetch(`/api/tab-tips?profileId=${props.profileId}&tabType=${props.tabType}`, {
          method: 'DELETE',
        });
      }

      const response = await fetch('/api/tab-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tabType: props.tabType,
          profileId: props.profileId,
          contextData: props.contextData || {},
          options: {
            enableFullOrchestration: true,
            timeoutMs: 5000,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: TabTipResponse = await response.json();
      setTipData(data);

      // Notify parent
      if (props.onTipLoaded) {
        props.onTipLoaded(data);
      }

      logger.debug('Tip loaded', {
        tabType: props.tabType,
        cached: data.processingInfo.cached,
        fallbackLevel: data.processingInfo.fallbackLevel,
        agents: data.processingInfo.agentsUsed,
      });
    } catch (err) {
      logger.warn('Failed to fetch tip', { error: err, tabType: props.tabType });
      setError('Unable to load tip');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Track if initial fetch was done to prevent double-fetch
  let initialFetchDone = false;
  // Track last context data hash to only refetch on actual changes
  let lastContextHash = '';

  // Fetch on mount
  onMount(() => {
    if (props.tabType && props.profileId && !props.disableLLM) {
      initialFetchDone = true;
      fetchTip();
    }
  });

  // Refetch when context data changes meaningfully (NOT on initial render or loading state changes)
  createEffect(() => {
    const data = props.contextData;
    // Create a simple hash of context data to detect actual changes
    const contextHash = data ? JSON.stringify(data) : '';

    // Only proceed if context actually changed (not just reference)
    if (contextHash === lastContextHash) {
      return;
    }

    const hasData = data && Object.keys(data).length > 0;

    // Use untrack for isLoading to prevent re-triggering when loading state changes
    const currentlyLoading = untrack(() => isLoading());

    // Skip if: no data, disabled, already loading, or this is the initial mount (onMount handles that)
    if (!hasData || !props.tabType || !props.profileId || props.disableLLM || currentlyLoading) {
      lastContextHash = contextHash;
      return;
    }

    // Skip if this is the first render (onMount handles initial fetch)
    if (!initialFetchDone) {
      lastContextHash = contextHash;
      return;
    }

    // Context actually changed - update hash and schedule refetch
    lastContextHash = contextHash;

    // Debounce
    const timeout = setTimeout(() => {
      // Double-check we're not already loading
      if (!untrack(() => isLoading())) {
        fetchTip();
      }
    }, 1500);
    return () => clearTimeout(timeout);
  });

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTip(true);
  };

  // Handle feedback
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
              name: 'User feedback',
              value: isHelpful ? 1 : 0,
              reason: isHelpful
                ? `User found ${props.tabType} tab tip helpful`
                : `User did not find ${props.tabType} tab tip helpful`,
            },
          ],
        }),
      });
      logger.debug('Feedback sent', { traceId: currentTraceId, vote, tabType: props.tabType });
    } catch (err) {
      logger.warn('Failed to send feedback', { error: err });
    }
  };

  // Render
  const canShowDetails = () =>
    props.showAgentDetails !== false && processingInfo() && processingInfo()!.agentsUsed.length > 0;

  return (
    <Show when={!goalAchieved()}>
      <Card
        class={cn(
          'bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 border-l-4 transition-all',
          CATEGORY_COLORS[category()]
        )}
      >
        <CardContent class={props.compact ? 'p-2' : 'p-3'}>
          {/* Main row */}
          <div class="flex items-start gap-2.5">
            {/* Bruno Avatar */}
            <div class="flex-shrink-0 mt-0.5">
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

            {/* Content */}
            <div class="flex-1 min-w-0">
              {/* Title row with badges */}
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-medium text-sm text-foreground">{displayTitle()}</span>

                {/* AI Badge */}
                <Show when={processingInfo() && processingInfo()!.fallbackLevel < 3}>
                  <span class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                    <Sparkles class="h-2.5 w-2.5" />
                    AI
                  </span>
                </Show>

                {/* Agent count badge (clickable) */}
                <Show when={canShowDetails()}>
                  <button
                    onClick={() => setShowDetails(!showDetails())}
                    class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors"
                    title={showDetails() ? 'Hide agent details' : 'Show agent details'}
                  >
                    <Bot class="h-2.5 w-2.5" />
                    {processingInfo()!.agentsUsed.length}
                    <Show when={showDetails()} fallback={<ChevronDown class="h-2 w-2" />}>
                      <ChevronUp class="h-2 w-2" />
                    </Show>
                  </button>
                </Show>

                {/* Cached indicator */}
                <Show when={processingInfo()?.cached}>
                  <span class="text-[9px] text-muted-foreground">(cached)</span>
                </Show>
              </div>

              {/* Message */}
              <p class="text-xs text-muted-foreground leading-relaxed mt-0.5">{displayMessage()}</p>

              {/* Action link */}
              <Show when={displayAction()}>
                <a
                  href={displayAction()!.href}
                  class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1"
                >
                  {displayAction()!.label} →
                </a>
              </Show>
            </div>

            {/* Actions column */}
            <div class="flex flex-col items-end gap-1 flex-shrink-0">
              {/* Refresh + Feedback row */}
              <div class="flex items-center gap-0.5">
                {/* Refresh Button */}
                <Show when={!isLoading() && props.profileId && !props.disableLLM}>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing()}
                    class="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    title="Refresh tip"
                  >
                    <RefreshCw class={cn('h-3 w-3', isRefreshing() && 'animate-spin')} />
                  </button>
                </Show>

                {/* Feedback Buttons */}
                <Show when={traceId() && !isLoading()}>
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
          </div>

          {/* Expandable Agent Details Panel */}
          <Show when={showDetails() && canShowDetails()}>
            <div class="mt-2 pt-2 border-t border-border/50 space-y-1.5 animate-in slide-in-from-top-2 duration-200">
              {/* Agents row */}
              <div class="flex items-center gap-1 flex-wrap">
                <span class="text-[10px] text-muted-foreground mr-1">Agents:</span>
                <For each={processingInfo()!.agentsUsed}>
                  {(agentId) => {
                    const config = AGENT_CONFIG[agentId] || {
                      icon: Bot,
                      label: agentId,
                      color: 'text-gray-500',
                    };
                    const AgentIcon = config.icon;
                    return (
                      <span
                        class={cn(
                          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-muted/50',
                          config.color
                        )}
                      >
                        <AgentIcon class="h-2.5 w-2.5" />
                        {config.label}
                      </span>
                    );
                  }}
                </For>
              </div>

              {/* Processing info row */}
              <div class="flex items-center gap-3 text-[9px] text-muted-foreground">
                <span class="inline-flex items-center gap-0.5">
                  <Clock class="h-2.5 w-2.5" />
                  {processingInfo()!.durationMs}ms
                </span>
                <span>Level: {FALLBACK_LEVEL_LABELS[processingInfo()!.fallbackLevel]}</span>
                <span>Type: {processingInfo()!.orchestrationType}</span>
              </div>

              {/* Agent recommendations */}
              <Show when={agentRecommendations() && agentRecommendations()!.length > 0}>
                <div class="space-y-1 pt-1">
                  <For each={agentRecommendations()!.slice(0, 2)}>
                    {(rec) => {
                      const config = AGENT_CONFIG[rec.agentId] || {
                        icon: Bot,
                        label: rec.agentId,
                        color: 'text-gray-500',
                      };
                      return (
                        <div class="flex items-start gap-1.5 text-[10px]">
                          <span class={cn('flex-shrink-0', config.color)}>{config.label}:</span>
                          <span class="text-muted-foreground truncate">{rec.recommendation}</span>
                          <span class="text-muted-foreground/60 flex-shrink-0">
                            ({Math.round(rec.confidence * 100)}%)
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </div>
          </Show>

          {/* Error state */}
          <Show when={error() && !tipData()}>
            <p class="text-[10px] text-red-500 mt-1">{error()}</p>
          </Show>
        </CardContent>
      </Card>
    </Show>
  );
}

export default BrunoHintV2;
