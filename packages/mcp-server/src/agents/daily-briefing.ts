/**
 * Daily Briefing Agent
 *
 * Specialized agent for the "New Day" popup that provides a personalized
 * morning briefing to help students start their day with focus.
 *
 * Features:
 * - Aggregates all relevant context (missions, deadlines, energy, progress)
 * - Fast single-agent mode (optimized for <3s response)
 * - Prioritizes the most important action for today
 * - Full Opik tracing
 *
 * Context sources:
 * - Active missions and their progress
 * - Upcoming deadlines (exams, goal deadline)
 * - Current energy level and trend
 * - Goal progress percentage
 * - Recent achievements
 */

import { trace, createSpan, getCurrentTraceId, getTraceUrl } from '../services/opik.js';
import { chat, type ChatMessage } from '../services/groq.js';
import { detectEnergyDebt } from '../algorithms/energy-debt.js';
import { detectComebackWindow } from '../algorithms/comeback-detection.js';

// ============================================================================
// Types
// ============================================================================

export interface DailyBriefingInput {
  profileId: string;
  // Student state
  currentEnergy: number;
  energyHistory: number[];
  // Goal tracking
  goalProgress: number;
  goalAmount?: number;
  currentAmount?: number;
  goalDeadline?: string; // ISO date
  goalName?: string;
  // Active missions
  activeMissions: {
    id: string;
    title: string;
    category: string;
    weeklyHours: number;
    weeklyEarnings: number;
    progress?: number;
    deadline?: string;
  }[];
  // Upcoming events
  upcomingDeadlines?: {
    title: string;
    date: string; // ISO date
    type: 'exam' | 'project' | 'payment' | 'goal' | 'other';
    importance: 'high' | 'medium' | 'low';
  }[];
  // Recent activity
  recentAchievements?: string[];
  lastCheckIn?: string; // ISO date of last daily check-in
  // Simulation context
  currentDate?: string; // ISO date (for simulation mode)
}

export interface DailyBriefingOutput {
  briefing: {
    greeting: string;
    title: string;
    message: string;
    priority: 'energy' | 'deadline' | 'progress' | 'mission' | 'celebration' | 'general';
    todaysFocus?: string;
    quickStats?: {
      label: string;
      value: string;
      trend?: 'up' | 'down' | 'stable';
    }[];
    action?: {
      label: string;
      href: string;
    };
  };
  context: {
    daysUntilGoal?: number;
    closestDeadline?: {
      title: string;
      daysUntil: number;
    };
    energyTrend: 'improving' | 'declining' | 'stable';
    missionsActive: number;
    isComeback: boolean;
    isEnergyDebt: boolean;
  };
  processingInfo: {
    agentsUsed: string[];
    durationMs: number;
  };
  traceId: string;
  traceUrl: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate days until a date
 */
function daysUntil(dateStr: string, fromDate?: string): number {
  const target = new Date(dateStr);
  const now = fromDate ? new Date(fromDate) : new Date();
  const diffTime = target.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get time of day greeting
 */
function getGreeting(date?: string): string {
  const hour = date ? new Date(date).getHours() : new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Determine energy trend from history
 */
function getEnergyTrend(history: number[]): 'improving' | 'declining' | 'stable' {
  if (history.length < 2) return 'stable';

  const recent = history.slice(-3);
  const older = history.slice(-6, -3);

  if (older.length === 0) return 'stable';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

  const diff = recentAvg - olderAvg;
  if (diff > 10) return 'improving';
  if (diff < -10) return 'declining';
  return 'stable';
}

/**
 * Determine the priority for today's briefing
 */
function determinePriority(
  input: DailyBriefingInput,
  context: {
    isEnergyDebt: boolean;
    isComeback: boolean;
    closestDeadline?: { title: string; daysUntil: number };
    daysUntilGoal?: number;
  }
): DailyBriefingOutput['briefing']['priority'] {
  // Critical: Energy debt
  if (context.isEnergyDebt && input.currentEnergy < 30) {
    return 'energy';
  }

  // Urgent deadline (within 3 days)
  if (context.closestDeadline && context.closestDeadline.daysUntil <= 3) {
    return 'deadline';
  }

  // Celebration: Comeback mode
  if (context.isComeback) {
    return 'celebration';
  }

  // Goal at risk (low progress + deadline approaching)
  if (context.daysUntilGoal && context.daysUntilGoal < 14 && input.goalProgress < 50) {
    return 'progress';
  }

  // Mission focus (has active missions)
  if (input.activeMissions.length > 0) {
    return 'mission';
  }

  // Goal progress celebration
  if (input.goalProgress >= 80) {
    return 'celebration';
  }

  return 'general';
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate a personalized daily briefing
 */
export async function generateDailyBriefing(
  input: DailyBriefingInput
): Promise<DailyBriefingOutput> {
  const startTime = Date.now();

  return trace(
    'daily_briefing.generate',
    async (rootSpan) => {
      rootSpan.setInput({
        profileId: input.profileId,
        energy: input.currentEnergy,
        goalProgress: input.goalProgress,
        missionsCount: input.activeMissions.length,
        deadlinesCount: input.upcomingDeadlines?.length || 0,
      });

      const agentsUsed: string[] = ['daily-briefing'];

      // === Analyze Context ===
      const energyTrend = getEnergyTrend(input.energyHistory);

      // Detect energy debt
      const energyEntries = input.energyHistory.map((level, i) => ({
        week: i + 1,
        level,
        date: new Date(
          Date.now() - (input.energyHistory.length - i) * 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
      }));
      const energyDebt = detectEnergyDebt(energyEntries);
      const isEnergyDebt = energyDebt.detected;

      // Detect comeback
      const deficit = (input.goalAmount || 0) - (input.currentAmount || 0);
      const comebackResult = detectComebackWindow(input.energyHistory, deficit);
      const isComeback = comebackResult?.detected || false;

      // Calculate days until goal
      const daysUntilGoal = input.goalDeadline
        ? daysUntil(input.goalDeadline, input.currentDate)
        : undefined;

      // Find closest deadline
      const allDeadlines = [
        ...(input.upcomingDeadlines || []).map((d) => ({
          title: d.title,
          daysUntil: daysUntil(d.date, input.currentDate),
          type: d.type,
        })),
        ...(input.goalDeadline
          ? [
              {
                title: input.goalName || 'Goal deadline',
                daysUntil: daysUntilGoal!,
                type: 'goal' as const,
              },
            ]
          : []),
      ].filter((d) => d.daysUntil > 0);

      allDeadlines.sort((a, b) => a.daysUntil - b.daysUntil);
      const closestDeadline = allDeadlines[0]
        ? { title: allDeadlines[0].title, daysUntil: allDeadlines[0].daysUntil }
        : undefined;

      // Determine priority
      const priority = determinePriority(input, {
        isEnergyDebt,
        isComeback,
        closestDeadline,
        daysUntilGoal,
      });

      // === Generate Briefing with LLM ===
      const briefing = await createSpan(
        'daily_briefing.llm',
        async (llmSpan) => {
          llmSpan.setInput({ priority, isComeback, isEnergyDebt });

          const contextParts: string[] = [];

          // Student state
          contextParts.push(`Student Status:
- Energy: ${input.currentEnergy}% (${energyTrend})
- Goal progress: ${input.goalProgress}%${daysUntilGoal ? ` (${daysUntilGoal} days left)` : ''}
- Active missions: ${input.activeMissions.length}`);

          // Energy alerts
          if (isEnergyDebt) {
            contextParts.push(
              `⚠️ Energy Debt: ${energyDebt.consecutiveLowWeeks} weeks of low energy. Suggested reduction: ${Math.round(energyDebt.targetReduction * 100)}%`
            );
          }
          if (isComeback) {
            contextParts.push(`🎉 Comeback Mode: Energy recovered! Great opportunity to catch up.`);
          }

          // Deadlines
          if (closestDeadline) {
            contextParts.push(
              `📅 Next deadline: "${closestDeadline.title}" in ${closestDeadline.daysUntil} day${closestDeadline.daysUntil > 1 ? 's' : ''}`
            );
          }

          // Missions
          if (input.activeMissions.length > 0) {
            const missionsList = input.activeMissions
              .slice(0, 3)
              .map((m) => `- ${m.title}: ${m.progress || 0}% complete, ${m.weeklyHours}h/week`)
              .join('\n');
            contextParts.push(`Active Missions:\n${missionsList}`);
          }

          // Recent achievements
          if (input.recentAchievements && input.recentAchievements.length > 0) {
            contextParts.push(`Recent wins: ${input.recentAchievements.slice(0, 2).join(', ')}`);
          }

          const systemPrompt = `You are Bruno, a friendly and motivating financial coach for students.
Generate a brief, personalized morning briefing (max 2 sentences).

PRIORITY FOR TODAY: ${priority}

STYLE:
- Be warm and encouraging
- Focus on ONE key thing for today
- Be specific and actionable
- Use simple language

OUTPUT FORMAT (JSON):
{
  "title": "Short catchy title (max 5 words)",
  "message": "Personalized message with today's focus (max 2 sentences)",
  "todaysFocus": "One specific action for today (optional)",
  "action": { "label": "Button text", "href": "/valid-route" }
}

VALID ROUTES:
- /plan?tab=swipe, /plan?tab=skills, /plan?tab=goals, /plan?tab=lifestyle
- /suivi (dashboard)
- #missions`;

          const userPrompt = `Generate today's briefing based on this context:\n\n${contextParts.join('\n\n')}`;

          const messages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ];

          try {
            const response = await chat(messages, {
              temperature: 0.6,
              maxTokens: 200,
              tags: ['ai', 'bruno', 'daily-briefing'],
              metadata: { source: 'daily_briefing', priority },
            });

            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              llmSpan.setOutput({ title: parsed.title, hasAction: !!parsed.action });
              return {
                greeting: getGreeting(input.currentDate),
                title: parsed.title,
                message: parsed.message,
                priority,
                todaysFocus: parsed.todaysFocus,
                action: parsed.action,
              };
            }
          } catch (error) {
            llmSpan.setAttributes({
              error: true,
              errorMessage: error instanceof Error ? error.message : 'Unknown',
            });
          }

          // Fallback based on priority
          return generateFallbackBriefing(
            input,
            priority,
            closestDeadline,
            isComeback,
            isEnergyDebt
          );
        },
        { tags: ['llm', 'daily-briefing'] }
      );

      // === Build Quick Stats ===
      const quickStats: DailyBriefingOutput['briefing']['quickStats'] = [];

      if (daysUntilGoal !== undefined) {
        quickStats.push({
          label: 'Days left',
          value: daysUntilGoal.toString(),
          trend: daysUntilGoal < 7 ? 'down' : 'stable',
        });
      }

      quickStats.push({
        label: 'Progress',
        value: `${input.goalProgress}%`,
        trend: input.goalProgress >= 50 ? 'up' : 'stable',
      });

      quickStats.push({
        label: 'Energy',
        value: `${input.currentEnergy}%`,
        trend: energyTrend === 'improving' ? 'up' : energyTrend === 'declining' ? 'down' : 'stable',
      });

      const durationMs = Date.now() - startTime;

      rootSpan.setOutput({
        priority,
        title: briefing.title,
        durationMs,
      });

      return {
        briefing: {
          ...briefing,
          quickStats,
        },
        context: {
          daysUntilGoal,
          closestDeadline,
          energyTrend,
          missionsActive: input.activeMissions.length,
          isComeback,
          isEnergyDebt,
        },
        processingInfo: {
          agentsUsed,
          durationMs,
        },
        traceId: getCurrentTraceId() || '',
        traceUrl: getTraceUrl(getCurrentTraceId() || ''),
      };
    },
    {
      tags: ['ai', 'bruno', 'daily-briefing'],
      metadata: {
        providers: ['groq'],
        source: 'daily_briefing',
      },
      input: {
        profileId: input.profileId,
        energy: input.currentEnergy,
        goalProgress: input.goalProgress,
      },
    }
  );
}

/**
 * Generate fallback briefing when LLM fails
 */
function generateFallbackBriefing(
  input: DailyBriefingInput,
  priority: DailyBriefingOutput['briefing']['priority'],
  closestDeadline?: { title: string; daysUntil: number },
  isComeback?: boolean,
  _isEnergyDebt?: boolean
): Omit<DailyBriefingOutput['briefing'], 'quickStats'> {
  const greeting = getGreeting(input.currentDate);

  switch (priority) {
    case 'energy':
      return {
        greeting,
        title: 'Take it easy today',
        message: `Your energy is at ${input.currentEnergy}%. Focus on rest and light tasks today.`,
        priority,
        todaysFocus: 'Rest and recharge',
        action: { label: 'Adjust goals', href: '/plan?tab=goals' },
      };

    case 'deadline':
      return {
        greeting,
        title: `${closestDeadline!.daysUntil}d until ${closestDeadline!.title}`,
        message: `You have ${closestDeadline!.daysUntil} day${closestDeadline!.daysUntil > 1 ? 's' : ''} left. Let's make today count!`,
        priority,
        todaysFocus: `Prepare for ${closestDeadline!.title}`,
        action: { label: 'View missions', href: '#missions' },
      };

    case 'celebration':
      if (isComeback) {
        return {
          greeting,
          title: 'Comeback Mode!',
          message: `Your energy bounced back to ${input.currentEnergy}%! Perfect time to accelerate your progress.`,
          priority,
          todaysFocus: 'Catch up on goals',
          action: { label: 'View scenarios', href: '/plan?tab=swipe' },
        };
      }
      return {
        greeting,
        title: 'Amazing progress!',
        message: `You're at ${input.goalProgress}% of your goal. Keep up the great work!`,
        priority,
        action: { label: 'View dashboard', href: '/suivi' },
      };

    case 'progress':
      return {
        greeting,
        title: 'Time to accelerate',
        message: `At ${input.goalProgress}% with the deadline approaching. Let's find ways to boost your progress.`,
        priority,
        todaysFocus: 'Explore earning opportunities',
        action: { label: 'Find opportunities', href: '/plan?tab=swipe' },
      };

    case 'mission': {
      const topMission = input.activeMissions[0];
      return {
        greeting,
        title: `Focus: ${topMission?.title || 'Your missions'}`,
        message: `You have ${input.activeMissions.length} active mission${input.activeMissions.length > 1 ? 's' : ''}. Stay focused and consistent!`,
        priority,
        todaysFocus: topMission?.title,
        action: { label: 'View missions', href: '#missions' },
      };
    }

    default:
      return {
        greeting,
        title: 'Ready for a new day',
        message: 'Every day is a step toward your goal. What will you accomplish today?',
        priority,
        action: { label: 'View dashboard', href: '/suivi' },
      };
  }
}

export default {
  generateDailyBriefing,
};
