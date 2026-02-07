/**
 * Handler: skip_mission
 *
 * Triggered by: "passer la mission X", "skip mission X"
 * Same pattern as completeMission but sets status to 'skipped'.
 */

import type { ChatHandlerContext, ChatHandlerResult } from './types';
import type { UIResource } from '~/types/chat';
import { createLogger } from '~/lib/logger';

const logger = createLogger('handler:skip_mission');
const BASE_URL = () => process.env.INTERNAL_API_URL || 'http://localhost:3006';

interface MissionData {
  id: string;
  title: string;
  status?: string;
  weeklyEarnings?: number;
}

export async function handleSkipMission(hCtx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return hCtx.ctx.createChildSpan(
    'chat.intent.skip_mission',
    async (span) => {
      const { context, intent, profileId } = hCtx;
      const missionTitle = intent.extractedMission;

      const followupData = context.followupData as { missions?: MissionData[] } | undefined;
      const missions = followupData?.missions || [];
      const active = missions.filter((m) => m.status === 'active');

      span.setAttributes({
        profileId: profileId || 'anonymous',
        'input.extracted_mission': missionTitle || 'none',
        'context.active_missions': active.length,
      });

      if (active.length === 0) {
        return {
          response: `You don't have any active missions to skip.`,
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

      if (!missionTitle) {
        return {
          response: `Which mission do you want to skip?`,
          uiResource: buildSkipSelectionGrid(active),
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
          uiResource: buildSkipSelectionGrid(active),
        };
      }

      // Skip the mission
      match.status = 'skipped';

      if (profileId) {
        try {
          await fetch(`${BASE_URL()}/api/profiles`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: profileId,
              followupData: { ...followupData, missions },
            }),
          });
        } catch (err) {
          logger.error('Failed to save mission skip', { error: String(err) });
        }
      }

      span.setAttributes({
        'result.mission_id': match.id,
        'result.mission_title': match.title,
      });

      return {
        response: `Mission **${match.title}** skipped. You can always undo this from the Progress page.`,
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
                  label: 'Swipe for More',
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

function buildSkipSelectionGrid(missions: MissionData[]): UIResource {
  return {
    type: 'grid',
    params: {
      columns: 1,
      children: missions.slice(0, 6).map((m) => ({
        type: 'action' as const,
        params: {
          label: `\u23ED\uFE0F ${m.title}`,
          action: '__action:skip_mission',
          params: { missionTitle: m.title },
        },
      })),
    },
  };
}
