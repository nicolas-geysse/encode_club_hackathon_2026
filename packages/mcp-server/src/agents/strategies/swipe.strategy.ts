/**
 * Swipe Tab Strategy
 *
 * Primary: Swipe Orchestrator (aggregates scenarios from all sources)
 * Secondary: Guardrail Agents (filter and enrich scenarios)
 * Focus: Scenario preferences, swipe patterns, behavioral learning
 *
 * Pipeline:
 * 1. Swipe Orchestrator: Gather + rank scenarios from Trade/Lifestyle/Jobs
 * 2. Essential Guardian: Block naive suggestions (pause rent, eat less)
 * 3. Ghost Observer: Filter based on rejection patterns
 * 4. Asset Pivot: Suggest rent vs sell for productive assets
 * 5. Cash Flow Smoother: Adjust for timing mismatches
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
    return 'swipe-orchestrator';
  }

  getSecondaryAgentIds(): string[] {
    return [
      'lifestyle-agent',
      'money-maker',
      'job-matcher',
      // H.5 Guardrail agents
      'essential-guardian',
      'ghost-observer',
      'asset-pivot',
      'cashflow-smoother',
      // Validation
      'guardian',
    ];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: true, // Verify energy vs effort
      checkSolvency: false,
      checkRealism: true, // Valuations should be realistic
      checkTimeline: true, // Goal attainable?
      minConfidence: 0.6,
      maxRiskLevel: 'medium', // More careful with guardrails active
    };
  }

  getSystemPrompt(): string {
    return `You are Bruno, a caring financial coach for students.

You are helping with the SWIPE feature - presenting money-making scenarios.

Given the user's context:
- Goal: {{goalAmount}} in {{daysToGoal}} days ({{remainingAmount}} remaining)
- Energy level: {{energyLevel}}%
- Preferences: effort={{effortSensitivity}}, rate={{hourlyRatePriority}}

ESSENTIAL EXPENSES (STRICT):
- NEVER suggest pausing or canceling rent, food, or transport. These are non-negotiable.
- Only suggest pausing SUBSCRIPTIONS (streaming, gym memberships, premium apps).
- For essential costs, suggest structural alternatives: roommate, biking, meal prep, student aid.

SMART RECOMMENDATION RULES:
1. If energy < 40%: Prioritize selling items or pausing subscriptions (minimal effort)
2. If sellable items available AND energy < 60%: Suggest selling first
3. If energy >= 60% AND skills match: Suggest highest-paying matching job
4. For productive assets (guitar, bike, camera): Suggest renting instead of selling

Analyze the scenarios and provide:
1. Which scenario to focus on first and why
2. One encouraging tip about their progress
3. If energy is low, prioritize passive income (selling, pausing)

Be concise (2-3 sentences max), warm, and actionable.`;
  }

  getFallbackMessage(): string {
    return 'Swipe based on your true preferences - the app learns from your choices!';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Energy level (important for guardrails)
    if (context.currentEnergy !== undefined) {
      const energy = context.currentEnergy;
      const status = energy < 40 ? '⚠️ Low energy' : energy > 70 ? '✅ High energy' : 'Moderate';
      parts.push(`Energy: ${energy}% (${status})`);
    }

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

    // Scenarios count by category
    if (context.swipe?.scenariosCount !== undefined) {
      parts.push(`\nScénarios disponibles: ${context.swipe.scenariosCount}`);
    }

    // Trade items for selling (from trade context)
    if (context.trade?.trades && context.trade.trades.length > 0) {
      const sellItems = context.trade.trades.filter(
        (t) => t.type === 'sell' && t.status !== 'completed'
      );
      if (sellItems.length > 0) {
        const topItems = sellItems.slice(0, 3);
        const itemsList = topItems.map((i) => `${i.name}: ${i.value || 0}€`).join(', ');
        parts.push(`🏷️ Items to sell: ${itemsList}`);
      }
    }

    // Budget info for subscription pausing
    if (context.budget?.monthlyExpenses && context.budget.monthlyExpenses > 0) {
      parts.push(`📊 Monthly expenses: ${context.budget.monthlyExpenses}€`);
    }

    // Recent swipes pattern (for ghost observer)
    if (context.swipe?.recentSwipes && context.swipe.recentSwipes.length > 0) {
      const rightCount = context.swipe.recentSwipes.filter((s) => s.direction === 'right').length;
      const total = context.swipe.recentSwipes.length;
      const acceptRate = Math.round((rightCount / total) * 100);
      parts.push(`\nRecent acceptance rate: ${acceptRate}%`);

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

      // Rejection patterns (for ghost observer insights)
      const leftSwipes = context.swipe.recentSwipes.filter((s) => s.direction === 'left');
      if (leftSwipes.length >= 3) {
        const rejectedTypes = leftSwipes.reduce(
          (acc, s) => {
            acc[s.scenarioType] = (acc[s.scenarioType] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );
        const topRejected = Object.entries(rejectedTypes).sort((a, b) => b[1] - a[1])[0];
        if (topRejected && topRejected[1] >= 3) {
          parts.push(`⚠️ Often rejected: ${topRejected[0]} (${topRejected[1]}x)`);
        }
      }
    }

    // Skills for matching
    if (context.profile?.skills && context.profile.skills.length > 0) {
      parts.push(`\nSkills for matching: ${this.formatList(context.profile.skills)}`);
    }

    // Common context (goal, deadline, etc.)
    const common = this.buildCommonContext(context);
    if (common) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Default preferences';
  }
}
