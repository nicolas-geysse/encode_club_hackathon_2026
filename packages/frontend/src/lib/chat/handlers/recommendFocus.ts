/**
 * Handler: recommend_focus
 *
 * Triggered by: "sur quoi me concentrer", "focus", "priorité", "what should I focus on"
 * Returns: deterministic advice based on energy + missions + goal progress
 */

import type { ChatHandlerContext, ChatHandlerResult } from './types';
import type { UIResource } from '~/types/chat';
import { getCurrencySymbol } from '../prompts';
import { createLogger } from '~/lib/logger';

const logger = createLogger('handler:recommend_focus');
const BASE_URL = () => process.env.INTERNAL_API_URL || 'http://localhost:3006';

interface MissionLike {
  title: string;
  status?: string;
  weeklyEarnings?: number;
  progress?: number;
}

export async function handleRecommendFocus(hCtx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return hCtx.ctx.createChildSpan(
    'chat.intent.recommend_focus',
    async (span) => {
      const { context, budgetContext, profileId, timeCtx } = hCtx;
      const curr = getCurrencySymbol(context.currency as string);
      const goalProgress = budgetContext?.goalProgress || 0;

      // Get missions from context
      const followupData = context.followupData as { missions?: MissionLike[] } | undefined;
      const allMissions = followupData?.missions || [];
      const activeMissions = allMissions.filter((m) => m.status === 'active');

      // Fetch latest energy
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
          logger.debug('Failed to fetch energy', { error: String(err) });
        }
      }

      let advice: string;
      let actions: UIResource[];

      if (latestEnergy !== null && latestEnergy < 40) {
        advice = `Your energy is at **${latestEnergy}%** — take care of yourself first. Rest, then tackle small wins.`;
        actions = [
          {
            type: 'action',
            params: { type: 'button', label: 'Log Energy', action: 'update_energy' },
          },
          {
            type: 'action',
            params: { type: 'button', label: 'Energy Chart', action: 'show_energy_chart' },
          },
        ];
      } else if (activeMissions.length === 0) {
        advice = `No active missions! Head to Swipe to discover opportunities.`;
        actions = [
          {
            type: 'action',
            params: {
              type: 'button',
              label: 'Go to Swipe',
              action: 'navigate',
              params: { to: '/swipe' },
            },
          },
        ];
      } else if (goalProgress < 80) {
        // Highest-earning mission
        const sorted = [...activeMissions].sort(
          (a, b) => (b.weeklyEarnings || 0) - (a.weeklyEarnings || 0)
        );
        const top = sorted[0];
        advice = `Focus on **${top.title}** — it's your highest-impact mission (${curr}${top.weeklyEarnings || 0}/week).`;
        actions = [
          {
            type: 'action',
            params: {
              type: 'button',
              label: 'Go to Progress',
              action: 'navigate',
              params: { to: '/progress' },
            },
          },
          {
            type: 'action',
            params: { type: 'button', label: 'My Budget', action: 'show_budget_chart' },
          },
        ];
      } else {
        // Nearest to completion
        const sorted = [...activeMissions].sort((a, b) => (b.progress || 0) - (a.progress || 0));
        const nearest = sorted[0];
        advice = `Almost there! **${nearest.title}** is at ${nearest.progress || 0}%. Finish it to boost your momentum.`;
        actions = [
          {
            type: 'action',
            params: {
              type: 'button',
              label: 'Progress',
              action: 'navigate',
              params: { to: '/progress' },
            },
          },
        ];
      }

      span.setAttributes({
        profileId: profileId || 'anonymous',
        'result.energy': latestEnergy,
        'result.active_missions': activeMissions.length,
        'result.goal_progress': goalProgress,
      });

      const uiResource: UIResource = {
        type: 'grid',
        params: { columns: actions.length, children: actions },
      };

      return { response: advice, uiResource };
    },
    { type: 'tool', input: { profileId: hCtx.profileId } }
  );
}
