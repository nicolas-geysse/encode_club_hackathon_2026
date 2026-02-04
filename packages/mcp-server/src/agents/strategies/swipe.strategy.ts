/**
 * Swipe Tab Strategy
 *
 * Primary: Strategy Comparator
 * Secondary: Job Matcher
 * Focus: Scenario preferences, swipe patterns, strategy optimization
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class SwipeStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'swipe';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'strategy-comparator';
  }

  getSecondaryAgentIds(): string[] {
    return ['job-matcher'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: false,
      checkRealism: false,
      checkTimeline: false,
      minConfidence: 0.5,
      maxRiskLevel: 'high', // Swipe is exploratory, more risk allowed
    };
  }

  getSystemPrompt(): string {
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Donne UN conseil court sur comment utiliser le swipe de scénarios efficacement.
Focus sur: équilibrer effort et revenus selon les préférences, diversifier les sources de revenus, ou écouter ses vraies préférences.
L'app apprend des choix de l'étudiant - encourage à swiper selon ses vraies préférences.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return "Swipe selon tes vraies préférences, l'app apprend de tes choix !";
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Preferences
    if (context.swipe?.preferences) {
      const prefs = context.swipe.preferences;

      if (prefs.effort_sensitivity !== undefined) {
        const level =
          prefs.effort_sensitivity > 0.6
            ? 'élevée'
            : prefs.effort_sensitivity < 0.4
              ? 'faible'
              : 'moyenne';
        parts.push(`Sensibilité à l'effort: ${level}`);
      }

      if (prefs.hourly_rate_priority !== undefined) {
        const level =
          prefs.hourly_rate_priority > 0.6
            ? 'élevée'
            : prefs.hourly_rate_priority < 0.4
              ? 'faible'
              : 'moyenne';
        parts.push(`Priorité taux horaire: ${level}`);
      }

      if (prefs.time_flexibility !== undefined) {
        const level =
          prefs.time_flexibility > 0.6
            ? 'élevée'
            : prefs.time_flexibility < 0.4
              ? 'faible'
              : 'moyenne';
        parts.push(`Flexibilité horaire: ${level}`);
      }
    } else {
      parts.push('Préférences: par défaut (pas encore de swipes)');
    }

    // Scenarios count
    if (context.swipe?.scenariosCount !== undefined) {
      parts.push(`Scénarios disponibles: ${context.swipe.scenariosCount}`);
    }

    // Recent swipes pattern
    if (context.swipe?.recentSwipes && context.swipe.recentSwipes.length > 0) {
      const rightCount = context.swipe.recentSwipes.filter((s) => s.direction === 'right').length;
      const total = context.swipe.recentSwipes.length;
      const acceptRate = Math.round((rightCount / total) * 100);
      parts.push(`Taux d'acceptation récent: ${acceptRate}%`);

      // Most swiped right types
      const rightSwipes = context.swipe.recentSwipes.filter((s) => s.direction === 'right');
      const typeCounts = rightSwipes.reduce(
        (acc, s) => {
          acc[s.scenarioType] = (acc[s.scenarioType] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const topType = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
      if (topType) {
        parts.push(`Type préféré: ${topType[0]}`);
      }
    }

    // Skills for matching
    if (context.profile?.skills && context.profile.skills.length > 0) {
      parts.push(`\nCompétences pour matching: ${this.formatList(context.profile.skills)}`);
    }

    // Common context
    const common = this.buildCommonContext(context);
    if (common) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Préférences par défaut';
  }
}
