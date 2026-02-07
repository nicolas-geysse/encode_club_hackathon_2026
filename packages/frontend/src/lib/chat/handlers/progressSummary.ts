/**
 * Handler: progress_summary
 *
 * Triggered by: "comment ça avance", "résumé", "bilan", "summary"
 * Returns: structured text + composite UIResource (metrics + action buttons)
 */

import type { ChatHandlerContext, ChatHandlerResult } from './types';
import type { UIResource } from '~/types/chat';
import { getCurrencySymbol } from '../prompts';
import { getWeeksUntil } from '~/lib/timeAwareDate';
import { createLogger } from '~/lib/logger';

const logger = createLogger('handler:progress_summary');
const BASE_URL = () => process.env.INTERNAL_API_URL || 'http://localhost:3006';

export async function handleProgressSummary(hCtx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return hCtx.ctx.createChildSpan(
    'chat.intent.progress_summary',
    async (span) => {
      const { context, budgetContext, profileId, timeCtx } = hCtx;

      const goalName = (context.goalName as string) || 'your goal';
      const goalAmount = (context.goalAmount as number) || 0;
      const currentSaved = (context.currentSaved as number) || 0;
      const goalDeadline = context.goalDeadline as string | undefined;
      const progress = goalAmount > 0 ? Math.round((currentSaved / goalAmount) * 100) : 0;
      const margin = budgetContext?.adjustedMargin || budgetContext?.netMargin || 0;
      const curr = getCurrencySymbol(context.currency as string);

      // Weeks remaining
      const weeksRemaining = goalDeadline ? getWeeksUntil(goalDeadline, timeCtx) : 0;
      const weeklyNeeded =
        weeksRemaining > 0 ? Math.round((goalAmount - currentSaved) / weeksRemaining) : 0;

      // Fetch missions from followupData
      let activeMissions = 0;
      let completedMissions = 0;
      try {
        const followupData = context.followupData as
          | { missions?: Array<{ status?: string }> }
          | undefined;
        const missions = followupData?.missions || [];
        activeMissions = missions.filter((m) => m.status === 'active').length;
        completedMissions = missions.filter((m) => m.status === 'completed').length;
      } catch {
        /* context may not have followupData */
      }

      // Fetch latest energy (non-blocking)
      let latestEnergy: number | null = null;
      if (profileId) {
        try {
          const resp = await fetch(`${BASE_URL()}/api/energy-logs?profileId=${profileId}&limit=1`);
          if (resp.ok) {
            const data = await resp.json();
            const logs = Array.isArray(data) ? data : data?.logs || [];
            if (logs.length > 0) {
              latestEnergy = logs[0].energyLevel ?? logs[0].energy_level ?? null;
            }
          }
        } catch (err) {
          logger.debug('Failed to fetch energy logs', { error: String(err) });
        }
      }

      span.setAttributes({
        profileId: profileId || 'anonymous',
        'result.progress': progress,
        'result.missions_active': activeMissions,
        'result.missions_completed': completedMissions,
        'result.energy': latestEnergy,
      });

      const response =
        `Here's your update:\n\n` +
        `- **Goal**: ${goalName} — ${curr}${currentSaved} / ${curr}${goalAmount} (${progress}%)\n` +
        (weeksRemaining > 0
          ? `- **Pace**: ${curr}${weeklyNeeded}/week needed, margin ${curr}${margin}/month\n`
          : `- **Margin**: ${curr}${margin}/month\n`) +
        `- **Missions**: ${activeMissions} active, ${completedMissions} completed\n` +
        (latestEnergy !== null ? `- **Energy**: ${latestEnergy}%\n` : '');

      const components: UIResource[] = [
        { type: 'metric', params: { title: 'Goal', value: `${progress}%`, unit: goalName } },
        {
          type: 'metric',
          params: { title: 'Missions', value: `${activeMissions}`, unit: 'active' },
        },
      ];

      if (latestEnergy !== null) {
        components.push({
          type: 'metric',
          params: { title: 'Energy', value: `${latestEnergy}%` },
        });
      }

      components.push({
        type: 'grid',
        params: {
          columns: 3,
          children: [
            {
              type: 'action',
              params: { type: 'button', label: 'Charts', action: 'show_chart_gallery' },
            },
            {
              type: 'action',
              params: {
                type: 'button',
                label: 'Progress',
                action: 'navigate',
                params: { to: '/progress' },
              },
            },
            {
              type: 'action',
              params: {
                type: 'button',
                label: 'Swipe',
                action: 'navigate',
                params: { to: '/swipe' },
              },
            },
          ],
        },
      });

      const uiResource: UIResource = { type: 'composite', components };

      return { response, uiResource };
    },
    { type: 'tool', input: { profileId: hCtx.profileId } }
  );
}
