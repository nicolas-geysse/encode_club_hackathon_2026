/**
 * Bruno Tips Component
 *
 * Data-driven insights card for the Suivi page.
 * Uses profile data, missions, energy history, and algorithms
 * to provide actionable advice.
 *
 * Features:
 * - Automatic insight generation based on user data
 * - Arrow navigation for tip cycling
 * - Optional LLM-generated tips via API with Opik tracing
 * - Extensive coverage: energy debt, comeback mode, budget health, etc.
 */

import { createSignal, createMemo, Show, onMount, onCleanup } from 'solid-js';
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
} from 'lucide-solid';
import { cn } from '~/lib/cn';
import type { Mission } from './MissionCard';

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
  /** Callback when a trace is generated (for feedback features) */
  onTraceGenerated?: (traceId: string, traceUrl: string) => void;
}

// Tip categories with icons and colors
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
  priority: number; // Higher = more important
}

// AI-generated tip response
interface AITipResponse {
  tip: {
    title: string;
    message: string;
    category: string;
    action?: { label: string; href: string };
  };
  traceId: string;
  traceUrl: string;
}

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

export function BrunoTips(props: BrunoTipsProps) {
  const [currentTipIndex, setCurrentTipIndex] = createSignal(0);
  const [isTransitioning, setIsTransitioning] = createSignal(false);

  // LLM tip state
  const [aiTip, setAITip] = createSignal<Tip | null>(null);
  const [isLoadingAI, setIsLoadingAI] = createSignal(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_aiError, setAIError] = createSignal<string | null>(null); // State tracked for potential future error UI
  const [aiTraceId, setAITraceId] = createSignal<string | null>(null);

  // Feedback state: null = not voted, 'up' = helpful, 'down' = not helpful
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

  // Generate tips based on current data
  const tips = createMemo((): Tip[] => {
    const allTips: Tip[] = [];

    // === ENERGY-BASED TIPS ===
    const energy = props.currentEnergy;
    const historyLevels = props.energyHistory.map((e) => e.level);
    const avgEnergy =
      historyLevels.length > 0
        ? Math.round(historyLevels.reduce((a, b) => a + b, 0) / historyLevels.length)
        : 50;

    // Low energy warning
    if (energy < 40) {
      allTips.push({
        id: 'energy_low',
        category: 'warning',
        title: 'Low energy detected',
        message: `Your energy is at ${energy}%. Consider reducing hours this week or postponing non-urgent missions.`,
        action: { label: 'View missions', href: '#missions' },
        priority: 90,
      });
    }

    // Energy debt detection (3+ weeks below 40%)
    const lowWeeks = historyLevels.filter((e) => e < 40).length;
    if (lowWeeks >= 3) {
      // Calculate debt severity
      const avgLowEnergy =
        historyLevels.filter((e) => e < 40).reduce((a, b) => a + b, 0) / lowWeeks;
      let severity: 'low' | 'medium' | 'high' = 'low';
      let reduction = 10;

      if (avgLowEnergy < 25) {
        severity = 'high';
        reduction = 30;
      } else if (avgLowEnergy < 35) {
        severity = 'medium';
        reduction = 20;
      }

      allTips.push({
        id: 'energy_debt',
        category: 'warning',
        title: 'Energy debt',
        message: `You've had ${lowWeeks} weeks of low energy (${severity} severity). Consider reducing your weekly target by ${reduction}% to avoid burnout.`,
        action: { label: 'Adjust targets', href: '/plan?tab=goals' },
        priority: 95,
      });
    }

    // Comeback opportunity (energy recovered after low period)
    if (energy > 80 && avgEnergy < 50 && historyLevels.length >= 3) {
      // Calculate potential catch-up (weeklyPotential = 1.5x normal for high energy)
      const weeklyPotential = Math.round(props.weeklyTarget * 1.5);

      allTips.push({
        id: 'comeback',
        category: 'celebration',
        title: 'Comeback Mode activated!',
        message: `Your energy bounced back to ${energy}% after a tough period. Perfect time to catch up! You could earn ${weeklyPotential}${props.currency || '€'}/week at full capacity.`,
        action: { label: 'View catch-up plan', href: '/plan?tab=swipe' },
        priority: 88,
      });
    }

    // High energy - opportunity to push harder
    if (energy >= 85 && avgEnergy >= 70) {
      allTips.push({
        id: 'energy_high',
        category: 'opportunity',
        title: 'High capacity week',
        message: `Energy at ${energy}% and trending strong! This is a great week to take on extra work or tackle challenging tasks.`,
        action: { label: 'Find opportunities', href: '/plan?tab=swipe' },
        priority: 55,
      });
    }

    // === PROGRESS-BASED TIPS ===
    const progressPercent =
      props.goalAmount > 0 ? Math.round((props.currentAmount / props.goalAmount) * 100) : 0;

    // Excellent progress celebration
    if (progressPercent >= 90) {
      allTips.push({
        id: 'progress_excellent',
        category: 'celebration',
        title: 'Almost there!',
        message: `${progressPercent}% complete! Just ${props.goalAmount - props.currentAmount}${props.currency || '€'} left to reach your goal. The finish line is in sight!`,
        priority: 75,
      });
    } else if (progressPercent >= 75) {
      allTips.push({
        id: 'progress_great',
        category: 'progress',
        title: 'Excellent progress!',
        message: `You've reached ${progressPercent}% of your goal. Keep up the momentum!`,
        priority: 60,
      });
    } else if (progressPercent >= 50) {
      allTips.push({
        id: 'progress_good',
        category: 'progress',
        title: 'Halfway there',
        message: `You're at ${progressPercent}% of your goal. Half the journey is done!`,
        priority: 50,
      });
    } else if (progressPercent < 25 && props.goalAmount > 0) {
      allTips.push({
        id: 'progress_slow',
        category: 'warning',
        title: 'Behind on goal',
        message: `Only ${progressPercent}% of your goal reached. Explore new scenarios to accelerate?`,
        action: { label: 'View scenarios', href: '/plan?tab=swipe' },
        priority: 70,
      });
    }

    // === MISSION-BASED TIPS ===
    const activeMissions = props.missions.filter((m) => m.status === 'active');
    const completedMissions = props.missions.filter((m) => m.status === 'completed');
    const skippedMissions = props.missions.filter((m) => m.status === 'skipped');

    // No active missions
    if (activeMissions.length === 0 && props.missions.length > 0) {
      allTips.push({
        id: 'no_active_missions',
        category: 'celebration',
        title: 'All missions completed!',
        message: 'Great work! Explore new scenarios to continue progressing.',
        action: { label: 'New scenarios', href: '/plan?tab=swipe' },
        priority: 75,
      });
    }

    // Too many skipped missions (warning)
    if (skippedMissions.length > 2 && skippedMissions.length > completedMissions.length) {
      allTips.push({
        id: 'many_skipped',
        category: 'warning',
        title: 'Many missions skipped',
        message: `You've skipped ${skippedMissions.length} missions. Consider finding scenarios that better match your energy and schedule.`,
        action: { label: 'Find better matches', href: '/plan?tab=swipe' },
        priority: 72,
      });
    }

    // High completion rate
    if (completedMissions.length > 0 && completedMissions.length >= activeMissions.length) {
      const totalEarned = completedMissions.reduce((sum, m) => sum + m.earningsCollected, 0);
      allTips.push({
        id: 'missions_completed',
        category: 'progress',
        title: 'Missions accomplished',
        message: `You've completed ${completedMissions.length} mission(s) for ${totalEarned}${props.currency || '€'} earned!`,
        priority: 55,
      });
    }

    // Mission with high earnings potential
    const highValueMission = activeMissions.find(
      (m) => m.weeklyEarnings > props.weeklyTarget * 0.5
    );
    if (highValueMission) {
      allTips.push({
        id: 'high_value_mission',
        category: 'opportunity',
        title: `Priority: ${highValueMission.title}`,
        message: `This mission can earn ${highValueMission.weeklyEarnings}${props.currency || '€'}/week. Focus recommended!`,
        priority: 65,
      });
    }

    // Low effort mission suggestion during low energy
    if (energy < 50) {
      const lowEffortMission = activeMissions.find(
        (m) => m.weeklyHours <= 3 && m.weeklyEarnings > 0
      );
      if (lowEffortMission) {
        allTips.push({
          id: 'low_effort_suggestion',
          category: 'opportunity',
          title: 'Low-effort option',
          message: `"${lowEffortMission.title}" only needs ${lowEffortMission.weeklyHours}h/week - perfect for when energy is low.`,
          priority: 68,
        });
      }
    }

    // === WEEKLY TARGET TIPS ===
    if (props.weeklyTarget > 0) {
      const weeklyProgress = activeMissions.reduce((sum, m) => sum + m.earningsCollected, 0);
      const weeklyPercent = Math.round((weeklyProgress / props.weeklyTarget) * 100);

      if (weeklyPercent >= 100) {
        allTips.push({
          id: 'weekly_target_met',
          category: 'celebration',
          title: 'Weekly target reached!',
          message: `You've exceeded your weekly goal of ${props.weeklyTarget}${props.currency || '€'}. Excellent work!`,
          priority: 80,
        });
      } else if (weeklyPercent >= 75) {
        const remaining = props.weeklyTarget - weeklyProgress;
        allTips.push({
          id: 'weekly_almost',
          category: 'mission',
          title: 'Almost there!',
          message: `Just ${remaining}${props.currency || '€'} left to reach your weekly target.`,
          priority: 70,
        });
      }
    }

    // === SKILL ARBITRAGE INSIGHT ===
    // If user has multiple mission types, suggest focusing on highest ROI
    const missionsByCategory = new Map<string, number>();
    activeMissions.forEach((m) => {
      const hourlyRate = m.weeklyEarnings / Math.max(1, m.weeklyHours);
      const existing = missionsByCategory.get(m.category) || 0;
      missionsByCategory.set(m.category, Math.max(existing, hourlyRate));
    });

    if (missionsByCategory.size >= 2) {
      let bestCategory = '';
      let bestRate = 0;
      missionsByCategory.forEach((rate, cat) => {
        if (rate > bestRate) {
          bestRate = rate;
          bestCategory = cat;
        }
      });

      if (bestRate > 0) {
        allTips.push({
          id: 'skill_arbitrage',
          category: 'opportunity',
          title: 'Best hourly rate',
          message: `Your ${bestCategory} missions pay ${Math.round(bestRate)}${props.currency || '€'}/hour - focus here for maximum efficiency.`,
          priority: 45,
        });
      }
    }

    // Default tip if no specific insights
    if (allTips.length === 0) {
      allTips.push({
        id: 'default',
        category: 'opportunity',
        title: 'Ready to start?',
        message: 'Explore available scenarios to find opportunities tailored to you.',
        action: { label: 'Explore', href: '/plan?tab=swipe' },
        priority: 10,
      });
    }

    // Sort by priority (highest first)
    return allTips.sort((a, b) => b.priority - a.priority);
  });

  // Get current tip (local or AI)
  const currentTip = createMemo(() => {
    // If AI tip is loaded and we're on index 0, show it
    if (props.useLLM && aiTip() && currentTipIndex() === 0) {
      return aiTip()!;
    }

    const allTips = tips();
    // Adjust index if we have an AI tip at position 0
    const adjustedIndex = props.useLLM && aiTip() ? currentTipIndex() - 1 : currentTipIndex();
    const idx = Math.max(0, adjustedIndex) % allTips.length;
    return allTips[idx];
  });

  // Total tips count
  const totalTips = createMemo(() => {
    const base = tips().length;
    return props.useLLM && aiTip() ? base + 1 : base;
  });

  // Cycle to next tip
  const nextTip = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentTipIndex((i) => (i + 1) % totalTips());
      setIsTransitioning(false);
    }, 200);
  };

  // Cycle to previous tip
  const prevTip = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentTipIndex((i) => (i - 1 + totalTips()) % totalTips());
      setIsTransitioning(false);
    }, 200);
  };

  // Fetch AI-generated tip
  const fetchAITip = async () => {
    if (!props.useLLM) return;

    setIsLoadingAI(true);
    setAIError(null);

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
        priority: 100, // AI tips always highest priority
      });

      // Store trace ID for feedback
      if (data.traceId) {
        setAITraceId(data.traceId);
        // Reset feedback state for new tip
        setFeedbackGiven(null);
      }

      // Notify parent of trace
      if (props.onTraceGenerated && data.traceId) {
        props.onTraceGenerated(data.traceId, data.traceUrl);
      }
    } catch (error) {
      console.error('[BrunoTips] AI tip fetch error:', error);
      setAIError('AI insight unavailable');
    } finally {
      setIsLoadingAI(false);
    }
  };

  // Fetch AI tip on mount if enabled
  onMount(() => {
    if (props.useLLM) {
      fetchAITip();
    }
  });

  // Auto-cycle tips every 30 seconds (with proper cleanup)
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

  // Is this the AI-generated tip?
  const isAITip = () => props.useLLM && aiTip() && currentTipIndex() === 0;

  return (
    <Card class="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20 overflow-hidden">
      <CardContent class="p-3">
        {/* Main row: Icon + Content + Navigation */}
        <div class="flex items-center gap-2.5">
          {/* Tip Icon - smaller */}
          <div class={cn('p-1.5 rounded-lg flex-shrink-0', config().bg)}>
            <Show
              when={!isLoadingAI()}
              fallback={<Loader2 class="h-4 w-4 animate-spin text-muted-foreground" />}
            >
              <TipIcon />
            </Show>
          </div>

          {/* Tip Content - compact */}
          <div class="flex-1 min-w-0">
            {/* Title row with AI badge */}
            <div class="flex items-center gap-1.5">
              <h4 class="font-semibold text-foreground text-sm truncate">{tip().title}</h4>
              <Show when={isAITip()}>
                <span class="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400 flex-shrink-0">
                  <Sparkles class="h-2.5 w-2.5" />
                  AI
                </span>
              </Show>
            </div>

            {/* Message - single line or two lines max */}
            <p
              class={cn(
                'text-xs text-muted-foreground transition-opacity duration-200 line-clamp-2',
                isTransitioning() && 'opacity-0'
              )}
            >
              {tip().message}
            </p>
          </div>

          {/* Right side: Navigation < 1/3 > */}
          <Show when={totalTips() > 1}>
            <div class="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={prevTip}
                disabled={isTransitioning()}
                class="p-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                title="Previous tip"
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
                title="Next tip"
              >
                <ChevronRight class="h-4 w-4" />
              </button>
            </div>
          </Show>
        </div>

        {/* Bottom row: Action link + Feedback (fixed height area) */}
        <div class="flex items-center justify-between mt-1.5 min-h-[24px]">
          {/* Action link */}
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

          {/* Feedback buttons (only for AI tips) */}
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
      </CardContent>
    </Card>
  );
}
