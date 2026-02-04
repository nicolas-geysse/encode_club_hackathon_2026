/**
 * Bruno Tips Component (v2 - Multi-Agent Enhanced)
 *
 * Data-driven insights card for the Suivi page.
 * Uses multi-agent orchestration with Budget Coach, Job Matcher,
 * Strategy Comparator, and Guardian agents.
 *
 * Features:
 * - Multi-agent AI-powered tips via /api/tips
 * - Agent insights display (who recommended what)
 * - Location-aware recommendations
 * - Processing info (agents used, fallback level)
 * - Opik tracing with user feedback
 */

import { createSignal, createMemo, Show, onMount, onCleanup, For } from 'solid-js';
import { Card, CardContent } from '~/components/ui/Card';
import {
  ChevronRight,
  ChevronLeft,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Target,
  Zap,
  Sparkles,
  Trophy,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Bot,
  MapPin,
  Briefcase,
  PiggyBank,
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import type { Mission } from './MissionCard';
import PlasmaAvatar from '~/components/chat/PlasmaAvatar';

// ============================================================================
// Types
// ============================================================================

interface BrunoTipsProps {
  profileId: string;
  missions: Mission[];
  currentEnergy: number;
  energyHistory: { week: number; level: number }[];
  currentAmount: number;
  goalAmount: number;
  weeklyTarget: number;
  currency?: string;
  /** Enable AI-generated tips via /api/tips */
  useLLM?: boolean;
  /** Location data for location-aware tips */
  location?: {
    city: string;
    coordinates?: { lat: number; lng: number };
    currency: 'USD' | 'EUR' | 'GBP';
    region?: 'france' | 'uk' | 'us' | 'europe';
  };
  /** Profile skills for agent recommendations */
  skills?: string[];
  /** Monthly margin for budget analysis */
  monthlyMargin?: number;
  /** Callback when a trace is generated */
  onTraceGenerated?: (traceId: string, traceUrl: string) => void;
}

type TipCategory = 'energy' | 'progress' | 'mission' | 'opportunity' | 'warning' | 'celebration';

interface Tip {
  id: string;
  category: TipCategory;
  title: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
  priority: number;
}

interface AgentRecommendations {
  budgetCoach?: {
    advice: string[];
    topOptimization?: {
      solution: string;
      potentialSavings: number;
    };
    budgetStatus: 'positive' | 'deficit';
    severity: 'critical' | 'warning' | 'tight' | 'comfortable';
  };
  jobMatcher?: {
    topMatch?: {
      name: string;
      hourlyRate: number;
      arbitrageScore: number;
      platform: string;
    };
    matchesCount: number;
    energyAdjusted: boolean;
  };
  strategyComparator?: {
    bestStrategy: string;
    bestQuickWin: string;
    bestLongTerm: string;
    recommendation: string;
  };
}

interface LocalOpportunities {
  jobs: { title: string; company: string; distance?: string }[];
  regionalTips: string[];
  nearbyPlaces?: { name: string; type: string; distance?: string }[];
}

interface ProcessingInfo {
  agentsUsed: string[];
  fallbackLevel: 0 | 1 | 2 | 3;
  durationMs: number;
  orchestrationType: 'full' | 'single' | 'algorithms' | 'static';
}

interface AITipResponse {
  tip: {
    title: string;
    message: string;
    category: string;
    action?: { label: string; href: string };
  };
  insights: {
    energyDebt: { detected: boolean; severity: string | null; weeks: number };
    comeback: { detected: boolean; confidence: number };
    topPriority: string;
    agentRecommendations?: AgentRecommendations;
    localOpportunities?: LocalOpportunities;
  };
  processingInfo: ProcessingInfo;
  traceId: string;
  traceUrl: string;
}

// ============================================================================
// Constants
// ============================================================================

const CATEGORY_CONFIG: Record<TipCategory, { icon: typeof Lightbulb; color: string; bg: string }> =
  {
    energy: { icon: Zap, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10' },
    progress: {
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-500/10',
    },
    mission: { icon: Target, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
    opportunity: {
      icon: Lightbulb,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-500/10',
    },
    warning: {
      icon: AlertTriangle,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10',
    },
    celebration: {
      icon: Trophy,
      color: 'text-yellow-600 dark:text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
  };

const AGENT_ICONS: Record<string, { icon: typeof Bot; label: string }> = {
  'budget-coach': { icon: PiggyBank, label: 'Budget Coach' },
  'job-matcher': { icon: Briefcase, label: 'Job Matcher' },
  'strategy-comparator': { icon: TrendingUp, label: 'Strategy' },
  guardian: { icon: Target, label: 'Guardian' },
};

// ============================================================================
// Component
// ============================================================================

export function BrunoTips(props: BrunoTipsProps) {
  const [currentTipIndex, setCurrentTipIndex] = createSignal(0);
  const [isTransitioning, setIsTransitioning] = createSignal(false);

  // LLM tip state
  const [aiTip, setAITip] = createSignal<Tip | null>(null);
  const [isLoadingAI, setIsLoadingAI] = createSignal(false);
  const [aiTraceId, setAITraceId] = createSignal<string | null>(null);

  // Agent insights state
  const [agentRecommendations, setAgentRecommendations] = createSignal<AgentRecommendations | null>(
    null
  );
  const [localOpportunities, setLocalOpportunities] = createSignal<LocalOpportunities | null>(null);
  const [processingInfo, setProcessingInfo] = createSignal<ProcessingInfo | null>(null);
  const [showAgentDetails, setShowAgentDetails] = createSignal(false);

  // Feedback state
  const [feedbackGiven, setFeedbackGiven] = createSignal<'up' | 'down' | null>(null);

  // Send feedback to Opik via API
  const handleFeedback = async (isHelpful: boolean) => {
    const traceId = aiTraceId();
    if (!traceId) return;

    const vote = isHelpful ? 'up' : 'down';
    setFeedbackGiven(vote);

    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          traceId,
          scores: [
            {
              name: 'User feedback',
              value: isHelpful ? 1 : 0,
              reason: isHelpful
                ? 'User found this tip helpful'
                : 'User did not find this tip helpful',
            },
          ],
        }),
      });
    } catch (error) {
      console.error('[BrunoTips] Feedback error:', error);
    }
  };

  // Generate local tips based on current data
  const tips = createMemo((): Tip[] => {
    const allTips: Tip[] = [];
    const energy = props.currentEnergy;
    const historyLevels = props.energyHistory.map((e) => e.level);
    const avgEnergy =
      historyLevels.length > 0
        ? Math.round(historyLevels.reduce((a, b) => a + b, 0) / historyLevels.length)
        : 50;

    // Energy-based tips
    if (energy < 40) {
      allTips.push({
        id: 'energy_low',
        category: 'warning',
        title: 'Low energy detected',
        message: `Your energy is at ${energy}%. Consider reducing hours this week.`,
        action: { label: 'View missions', href: '#missions' },
        priority: 90,
      });
    }

    // Energy debt detection
    const lowWeeks = historyLevels.filter((e) => e < 40).length;
    if (lowWeeks >= 3) {
      const avgLowEnergy =
        historyLevels.filter((e) => e < 40).reduce((a, b) => a + b, 0) / lowWeeks;
      const severity = avgLowEnergy < 25 ? 'high' : avgLowEnergy < 35 ? 'medium' : 'low';
      const reduction = severity === 'high' ? 30 : severity === 'medium' ? 20 : 10;

      allTips.push({
        id: 'energy_debt',
        category: 'warning',
        title: 'Energy debt',
        message: `${lowWeeks} weeks of low energy (${severity}). Reduce target by ${reduction}%.`,
        action: { label: 'Adjust targets', href: '/me?tab=goals' },
        priority: 95,
      });
    }

    // Comeback opportunity
    if (energy > 80 && avgEnergy < 50 && historyLevels.length >= 3) {
      const weeklyPotential = Math.round(props.weeklyTarget * 1.5);
      allTips.push({
        id: 'comeback',
        category: 'celebration',
        title: 'Comeback Mode!',
        message: `Energy at ${energy}%! You could earn ${weeklyPotential}${props.currency || '€'}/week.`,
        action: { label: 'View catch-up plan', href: '/swipe' },
        priority: 88,
      });
    }

    // Progress-based tips
    const progressPercent =
      props.goalAmount > 0 ? Math.round((props.currentAmount / props.goalAmount) * 100) : 0;

    if (progressPercent >= 90) {
      allTips.push({
        id: 'progress_excellent',
        category: 'celebration',
        title: 'Almost there!',
        message: `${progressPercent}% complete! Just ${props.goalAmount - props.currentAmount}${props.currency || '€'} left!`,
        priority: 75,
      });
    } else if (progressPercent < 25 && props.goalAmount > 0) {
      allTips.push({
        id: 'progress_slow',
        category: 'warning',
        title: 'Behind on goal',
        message: `Only ${progressPercent}% progress. Explore new scenarios to accelerate.`,
        action: { label: 'View scenarios', href: '/swipe' },
        priority: 70,
      });
    }

    // Default tip
    if (allTips.length === 0) {
      allTips.push({
        id: 'default',
        category: 'opportunity',
        title: 'Ready to start?',
        message: 'Explore scenarios tailored to you.',
        action: { label: 'Explore', href: '/swipe' },
        priority: 10,
      });
    }

    return allTips.sort((a, b) => b.priority - a.priority);
  });

  // Get current tip
  const currentTip = createMemo(() => {
    if (props.useLLM && aiTip() && currentTipIndex() === 0) {
      return aiTip()!;
    }
    const allTips = tips();
    const adjustedIndex = props.useLLM && aiTip() ? currentTipIndex() - 1 : currentTipIndex();
    const idx = Math.max(0, adjustedIndex) % allTips.length;
    return allTips[idx];
  });

  const totalTips = createMemo(() => {
    const base = tips().length;
    return props.useLLM && aiTip() ? base + 1 : base;
  });

  const nextTip = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentTipIndex((i) => (i + 1) % totalTips());
      setIsTransitioning(false);
    }, 200);
  };

  const prevTip = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentTipIndex((i) => (i - 1 + totalTips()) % totalTips());
      setIsTransitioning(false);
    }, 200);
  };

  // Fetch AI-generated tip with multi-agent orchestration
  const fetchAITip = async () => {
    if (!props.useLLM) return;

    setIsLoadingAI(true);

    try {
      const response = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: props.profileId,
          currentEnergy: props.currentEnergy,
          energyHistory: props.energyHistory.map((e) => e.level),
          goalProgress:
            props.goalAmount > 0 ? Math.round((props.currentAmount / props.goalAmount) * 100) : 0,
          activeMissions: props.missions.filter((m) => m.status === 'active'),
          goalAmount: props.goalAmount,
          currentAmount: props.currentAmount,
          weeklyTarget: props.weeklyTarget,
          location: props.location,
          skills: props.skills,
          monthlyMargin: props.monthlyMargin,
          enableFullOrchestration: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch AI tip');
      }

      const data: AITipResponse = await response.json();

      setAITip({
        id: 'ai_generated',
        category: (data.tip.category as TipCategory) || 'opportunity',
        title: data.tip.title,
        message: data.tip.message,
        action: data.tip.action,
        priority: 100,
      });

      // Store agent insights
      if (data.insights.agentRecommendations) {
        setAgentRecommendations(data.insights.agentRecommendations);
      }
      if (data.insights.localOpportunities) {
        setLocalOpportunities(data.insights.localOpportunities);
      }
      if (data.processingInfo) {
        setProcessingInfo(data.processingInfo);
      }

      // Store trace ID for feedback
      if (data.traceId) {
        setAITraceId(data.traceId);
        setFeedbackGiven(null);
      }

      // Notify parent
      if (props.onTraceGenerated && data.traceId) {
        props.onTraceGenerated(data.traceId, data.traceUrl);
      }
    } catch (error) {
      console.error('[BrunoTips] AI tip fetch error:', error);
    } finally {
      setIsLoadingAI(false);
    }
  };

  // Fetch on mount
  onMount(() => {
    if (props.useLLM) {
      fetchAITip();
    }
  });

  // Auto-cycle tips
  const interval = setInterval(() => {
    if (totalTips() > 1) {
      nextTip();
    }
  }, 30000);

  onCleanup(() => clearInterval(interval));

  const tip = () => currentTip();
  const config = () => CATEGORY_CONFIG[tip().category] || CATEGORY_CONFIG.opportunity;
  const TipIcon = () => {
    const Icon = config().icon;
    return <Icon class={cn('h-5 w-5', config().color)} />;
  };

  const isAITip = () => props.useLLM && aiTip() && currentTipIndex() === 0;
  const hasAgentInsights = () =>
    isAITip() && (agentRecommendations() || localOpportunities() || processingInfo());

  return (
    <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 overflow-hidden">
      <CardContent class="p-3">
        {/* Main row */}
        <div class="flex items-center gap-2.5">
          {/* Bruno Avatar */}
          <div class="flex-shrink-0">
            <Show
              when={!isLoadingAI()}
              fallback={
                <div class={cn('p-1.5 rounded-lg', config().bg)}>
                  <Loader2 class="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              }
            >
              <PlasmaAvatar size={32} color="green" />
            </Show>
          </div>

          {/* Content */}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
              <h4 class="font-semibold text-foreground text-sm truncate">{tip().title}</h4>
              <Show when={isAITip()}>
                <span class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 flex-shrink-0">
                  <Sparkles class="h-2.5 w-2.5" />
                  AI
                </span>
              </Show>
              {/* Agent count badge */}
              <Show when={isAITip() && processingInfo() && processingInfo()!.agentsUsed.length > 0}>
                <button
                  onClick={() => setShowAgentDetails(!showAgentDetails())}
                  class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 flex-shrink-0 hover:bg-blue-500/20 transition-colors"
                  title="Click to see agent details"
                >
                  <Bot class="h-2.5 w-2.5" />
                  {processingInfo()!.agentsUsed.length}
                </button>
              </Show>
            </div>

            <p
              class={cn(
                'text-xs text-muted-foreground transition-opacity duration-200 line-clamp-2',
                isTransitioning() && 'opacity-0'
              )}
            >
              {tip().message}
            </p>
          </div>

          {/* Navigation */}
          <Show when={totalTips() > 1}>
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={prevTip}
                disabled={isTransitioning()}
                class="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <ChevronLeft class="h-4 w-4" />
              </button>
              <span class="text-xs text-muted-foreground tabular-nums min-w-[2.5rem] text-center">
                {currentTipIndex() + 1}/{totalTips()}
              </span>
              <button
                onClick={nextTip}
                disabled={isTransitioning()}
                class="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>
          </Show>
        </div>

        {/* Bottom row: Action + Feedback */}
        <div class="flex items-center justify-between mt-1.5 min-h-[24px]">
          <div class="flex-1">
            <Show when={tip().action}>
              <a
                href={tip().action!.href}
                class="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                {tip().action!.label} →
              </a>
            </Show>
          </div>

          {/* Feedback buttons */}
          <Show when={isAITip() && aiTraceId()}>
            <div class="flex items-center gap-0.5">
              <Show
                when={feedbackGiven() === null}
                fallback={
                  <span class="text-[10px] text-muted-foreground">
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
            </div>
          </Show>
        </div>

        {/* Agent Details Panel (expandable) */}
        <Show when={showAgentDetails() && hasAgentInsights()}>
          <div class="mt-2 pt-2 border-t border-border/50 space-y-2">
            {/* Agents used */}
            <Show when={processingInfo()}>
              <div class="flex items-center gap-1 flex-wrap">
                <span class="text-[10px] text-muted-foreground">Agents:</span>
                <For each={processingInfo()!.agentsUsed}>
                  {(agent) => {
                    const agentInfo = AGENT_ICONS[agent] || { icon: Bot, label: agent };
                    const AgentIcon = agentInfo.icon;
                    return (
                      <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-muted/50 text-muted-foreground">
                        <AgentIcon class="h-2.5 w-2.5" />
                        {agentInfo.label}
                      </span>
                    );
                  }}
                </For>
                <span class="text-[9px] text-muted-foreground ml-auto">
                  {processingInfo()!.durationMs}ms
                </span>
              </div>
            </Show>

            {/* Job Matcher insight */}
            <Show when={agentRecommendations()?.jobMatcher?.topMatch}>
              <div class="flex items-center gap-2 text-[10px]">
                <Briefcase class="h-3 w-3 text-blue-500" />
                <span class="text-muted-foreground">
                  Top job:{' '}
                  <span class="text-foreground font-medium">
                    {agentRecommendations()!.jobMatcher!.topMatch!.name}
                  </span>{' '}
                  (${agentRecommendations()!.jobMatcher!.topMatch!.hourlyRate}/hr)
                </span>
              </div>
            </Show>

            {/* Budget Coach insight */}
            <Show when={agentRecommendations()?.budgetCoach?.topOptimization}>
              <div class="flex items-center gap-2 text-[10px]">
                <PiggyBank class="h-3 w-3 text-green-500" />
                <span class="text-muted-foreground">
                  Save:{' '}
                  <span class="text-foreground font-medium">
                    {agentRecommendations()!.budgetCoach!.topOptimization!.solution}
                  </span>{' '}
                  (${agentRecommendations()!.budgetCoach!.topOptimization!.potentialSavings}/mo)
                </span>
              </div>
            </Show>

            {/* Strategy Comparator insight */}
            <Show when={agentRecommendations()?.strategyComparator}>
              <div class="flex items-center gap-2 text-[10px]">
                <TrendingUp class="h-3 w-3 text-purple-500" />
                <span class="text-muted-foreground">
                  Best:{' '}
                  <span class="text-foreground font-medium">
                    {agentRecommendations()!.strategyComparator!.bestStrategy}
                  </span>
                </span>
              </div>
            </Show>

            {/* Location insights */}
            <Show when={localOpportunities() && localOpportunities()!.regionalTips.length > 0}>
              <div class="flex items-start gap-2 text-[10px]">
                <MapPin class="h-3 w-3 text-orange-500 mt-0.5" />
                <span class="text-muted-foreground">{localOpportunities()!.regionalTips[0]}</span>
              </div>
            </Show>
          </div>
        </Show>
      </CardContent>
    </Card>
  );
}
