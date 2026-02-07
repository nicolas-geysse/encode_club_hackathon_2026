/**
 * Handler: complete_mission
 *
 * Triggered by: "j'ai terminé la mission X", "completed mission X"
 * - If mission title extracted: fuzzy-match and complete it
 * - If no title: show selection buttons for all active missions
 */

import type { ChatHandlerContext, ChatHandlerResult } from './types';
import type { UIResource } from '~/types/chat';
import { getCurrencySymbol } from '../prompts';
import { createLogger } from '~/lib/logger';

const logger = createLogger('handler:complete_mission');
const BASE_URL = () => process.env.INTERNAL_API_URL || 'http://localhost:3006';

interface MissionData {
  id: string;
  title: string;
  status?: string;
  weeklyEarnings?: number;
  earningsCollected?: number;
  hoursCompleted?: number;
  weeklyHours?: number;
  source?: string;
  sourceId?: string;
}

export async function handleCompleteMission(hCtx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return hCtx.ctx.createChildSpan(
    'chat.intent.complete_mission',
    async (span) => {
      const { context, intent, profileId } = hCtx;
      const curr = getCurrencySymbol(context.currency as string);
      const missionTitle = intent.extractedMission;

      // Get missions from followupData
      const followupData = context.followupData as
        | { missions?: MissionData[]; currentAmount?: number }
        | undefined;
      const missions = followupData?.missions || [];
      const active = missions.filter((m) => m.status === 'active');

      span.setAttributes({
        profileId: profileId || 'anonymous',
        'input.extracted_mission': missionTitle || 'none',
        'context.active_missions': active.length,
      });

      // No active missions
      if (active.length === 0) {
        return {
          response: `You don't have any active missions. Go to Swipe to add some!`,
          uiResource: {
            type: 'grid',
            params: {
              columns: 1,
              children: [
                {
                  type: 'action',
                  params: {
                    type: 'button',
                    label: 'Go to Swipe',
                    action: 'navigate',
                    params: { to: '/swipe' },
                  },
                },
              ],
            },
          },
        };
      }

      // No title extracted — show selection
      if (!missionTitle) {
        return {
          response: `Which mission did you complete?`,
          uiResource: buildMissionSelectionGrid(active, 'complete'),
        };
      }

      // Fuzzy match
      const lower = missionTitle.toLowerCase();
      const match = active.find(
        (m) => m.title.toLowerCase().includes(lower) || lower.includes(m.title.toLowerCase())
      );

      if (!match) {
        return {
          response: `I couldn't find an active mission matching "${missionTitle}". Which one?`,
          uiResource: buildMissionSelectionGrid(active, 'complete'),
        };
      }

      // Complete the mission
      match.status = 'completed';
      match.earningsCollected = match.weeklyEarnings || 0;
      match.hoursCompleted = match.weeklyHours || 0;

      // Update currentAmount
      const newCurrentAmount = (followupData?.currentAmount || 0) + (match.weeklyEarnings || 0);

      // Save via PATCH
      if (profileId) {
        try {
          await fetch(`${BASE_URL()}/api/profiles`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: profileId,
              followupData: {
                ...followupData,
                missions,
                currentAmount: newCurrentAmount,
              },
            }),
          });
        } catch (err) {
          logger.error('Failed to save mission completion', { error: String(err) });
        }
      }

      span.setAttributes({
        'result.mission_id': match.id,
        'result.mission_title': match.title,
        'result.earnings': match.weeklyEarnings || 0,
      });

      return {
        response: `Mission **${match.title}** completed! +${curr}${match.weeklyEarnings || 0} earned.`,
        uiResource: {
          type: 'grid',
          params: {
            columns: 2,
            children: [
              {
                type: 'action',
                params: {
                  type: 'button',
                  label: 'See Progress',
                  action: 'navigate',
                  params: { to: '/progress' },
                },
              },
              {
                type: 'action',
                params: {
                  type: 'button',
                  label: 'More Opportunities',
                  action: 'navigate',
                  params: { to: '/swipe' },
                },
              },
            ],
          },
        },
      };
    },
    { type: 'tool', input: { profileId: hCtx.profileId, mission: hCtx.intent.extractedMission } }
  );
}

function buildMissionSelectionGrid(
  missions: MissionData[],
  action: 'complete' | 'skip'
): UIResource {
  return {
    type: 'grid',
    params: {
      columns: 1,
      children: missions.slice(0, 6).map((m) => ({
        type: 'action' as const,
        params: {
          label: `${action === 'complete' ? '\u2705' : '\u23ED\uFE0F'} ${m.title}`,
          action: `__action:${action}_mission`,
          params: { missionTitle: m.title },
        },
      })),
    },
  };
}
