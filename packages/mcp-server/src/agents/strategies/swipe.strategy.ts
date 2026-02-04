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
    return `You are Bruno, a caring financial coach for students.
Give ONE short tip on how to use scenario swiping effectively.
Focus on: balancing effort and income based on preferences, diversifying income sources, or listening to true preferences.
The app learns from the student's choices - encourage swiping based on true preferences.
Reply in 1-2 sentences max, in an encouraging tone.`;
  }

  getFallbackMessage(): string {
    return 'Swipe based on your true preferences - the app learns from your choices!';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Preferences
    if (context.swipe?.preferences) {
      const prefs = context.swipe.preferences;

      if (prefs.effort_sensitivity !== undefined) {
        const level =
          prefs.effort_sensitivity > 0.6
            ? 'high'
            : prefs.effort_sensitivity < 0.4
              ? 'low'
              : 'medium';
        parts.push(`Effort sensitivity: ${level}`);
      }

      if (prefs.hourly_rate_priority !== undefined) {
        const level =
          prefs.hourly_rate_priority > 0.6
            ? 'high'
            : prefs.hourly_rate_priority < 0.4
              ? 'low'
              : 'medium';
        parts.push(`Hourly rate priority: ${level}`);
      }

      if (prefs.time_flexibility !== undefined) {
        const level =
          prefs.time_flexibility > 0.6 ? 'high' : prefs.time_flexibility < 0.4 ? 'low' : 'medium';
        parts.push(`Time flexibility: ${level}`);
      }
    } else {
      parts.push('Preferences: default (no swipes yet)');
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
      parts.push(`Recent acceptance rate: ${acceptRate}%`);

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
        parts.push(`Preferred type: ${topType[0]}`);
      }
    }

    // Skills for matching
    if (context.profile?.skills && context.profile.skills.length > 0) {
      parts.push(`\nSkills for matching: ${this.formatList(context.profile.skills)}`);
    }

    // Common context
    const common = this.buildCommonContext(context);
    if (common) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Default preferences';
  }
}
