/**
 * Handler: update_energy
 *
 * Triggered by: "fatigué" (→30), "super forme" (→85), "énergie 70" (→70)
 * Logs energy via the retroplan API and returns contextual advice.
 */

import type { ChatHandlerContext, ChatHandlerResult } from './types';
import type { UIResource } from '~/types/chat';
import { getReferenceDate } from '~/lib/timeAwareDate';
import { createLogger } from '~/lib/logger';

const logger = createLogger('handler:update_energy');
const BASE_URL = () => process.env.INTERNAL_API_URL || 'http://localhost:3006';

export async function handleUpdateEnergy(hCtx: ChatHandlerContext): Promise<ChatHandlerResult> {
  return hCtx.ctx.createChildSpan(
    'chat.intent.update_energy',
    async (span) => {
      const { intent, profileId, timeCtx } = hCtx;
      const level = intent.extractedEnergy ?? 50;
      const today = getReferenceDate(timeCtx).toISOString().split('T')[0];

      // Convert 0-100 percentage to 1-5 scale (DB CHECK constraint: BETWEEN 1 AND 5)
      const energyLevel1to5 = Math.max(1, Math.min(5, Math.ceil(level / 20)));
      const stressLevel1to5 = 6 - energyLevel1to5; // Inverse: high energy = low stress

      span.setAttributes({
        profileId: profileId || 'anonymous',
        'input.energy_level': level,
        'input.energy_1to5': energyLevel1to5,
        'input.date': today,
      });

      // Log via retroplan API
      // API reads { userId, action, date, energyLevel, ... } from body (flat, not nested)
      if (profileId) {
        try {
          const resp = await fetch(`${BASE_URL()}/api/retroplan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: profileId,
              action: 'log_energy',
              date: today,
              energyLevel: energyLevel1to5,
              moodScore: energyLevel1to5,
              stressLevel: stressLevel1to5,
            }),
          });
          if (!resp.ok) {
            logger.error('Energy log API returned error', { status: resp.status });
          }
        } catch (err) {
          logger.error('Failed to log energy', { error: String(err) });
        }
      }

      let statusMsg: string;
      if (level < 40) {
        statusMsg = `That's low. Consider lighter missions this week.`;
      } else if (level > 80) {
        statusMsg = `Great energy! Good time to tackle high-impact missions.`;
      } else {
        statusMsg = `Moderate energy. Stay steady.`;
      }

      const response = `Energy logged at **${level}%**. ${statusMsg}`;

      const uiResource: UIResource = {
        type: 'grid',
        params: {
          columns: 2,
          children: [
            {
              type: 'action',
              params: { type: 'button', label: 'Energy Chart', action: 'show_energy_chart' },
            },
            {
              type: 'action',
              params: { type: 'button', label: 'Focus Advice', action: 'recommend_focus' },
            },
          ],
        },
      };

      span.setAttributes({ 'result.status_msg': statusMsg });

      return { response, uiResource };
    },
    { type: 'tool', input: { profileId: hCtx.profileId, level: hCtx.intent.extractedEnergy } }
  );
}
