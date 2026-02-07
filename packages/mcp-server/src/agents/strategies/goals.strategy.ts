/**
 * Goals Tab Strategy
 *
 * Primary: Strategy Comparator
 * Secondary: Budget Coach
 * Focus: Goal feasibility, timeline, progress tracking
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class GoalsStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'goals';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'strategy-comparator';
  }

  getSecondaryAgentIds(): string[] {
    return ['budget-coach'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: false,
      checkRealism: false,
      checkTimeline: true, // Verify feasibility with current margin
      minConfidence: 0.6,
      maxRiskLevel: 'medium',
    };
  }

  getSystemPrompt(): string {
    return `You are Bruno, a caring financial coach for students.
Analyze the student's financial goals and give ONE short actionable tip.
Focus on: goal feasibility with current margin, breaking down into steps, or adjusting amounts/deadlines.
If a goal seems unrealistic (insufficient margin for the deadline), suggest an adjustment.

GOAL ACHIEVED: If any goal has 100% progress, celebrate warmly and encourage creating a new goal.
Example: "You crushed it! Your goal is fully funded. Ready to aim higher? Create a new goal!"

Reply in 1-2 sentences max, in an encouraging tone.`;
  }

  getFallbackMessage(): string {
    return 'Set SMART goals: Specific, Measurable, Achievable, Realistic, and Time-bound.';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Goal achieved flag (from frontend dynamic progress)
    if (context.goalAchieved) {
      parts.push('*** GOAL ACHIEVED — progress is 100%! Celebrate and suggest a new goal. ***');
    }

    // Goals
    if (context.goals && context.goals.length > 0) {
      context.goals.forEach((g, i) => {
        const progress = g.progress ? ` - ${g.progress}% completed` : '';
        const deadline = g.deadline ? ` (deadline: ${g.deadline})` : '';
        const status = g.status ? ` [${g.status}]` : '';
        parts.push(
          `Goal ${i + 1}: ${g.name} - ${this.formatCurrency(g.amount)}${deadline}${progress}${status}`
        );
      });

      // Calculate total needed
      const totalNeeded = context.goals.reduce((sum, g) => sum + (g.amount || 0), 0);
      const totalProgress = context.goals.reduce(
        (sum, g) => sum + ((g.amount || 0) * (g.progress || 0)) / 100,
        0
      );
      parts.push(`\nTotal goals: ${this.formatCurrency(totalNeeded)}`);
      parts.push(`Already saved: ${this.formatCurrency(Math.round(totalProgress))}`);
    } else {
      parts.push('No goals defined');
    }

    // Monthly margin for feasibility
    if (context.monthlyMargin !== undefined) {
      parts.push(`\nAvailable monthly margin: ${this.formatCurrency(context.monthlyMargin)}`);

      // Calculate months to first goal
      if (context.goals && context.goals.length > 0 && context.monthlyMargin > 0) {
        const firstGoal = context.goals[0];
        const remaining = (firstGoal.amount || 0) * (1 - (firstGoal.progress || 0) / 100);
        const monthsNeeded = Math.ceil(remaining / context.monthlyMargin);
        parts.push(`Estimated months for "${firstGoal.name}": ${monthsNeeded}`);
      }
    }

    // Common context
    const common = this.buildCommonContext(context);
    if (common && !parts.some((p) => p.includes('margin'))) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'No goals defined';
  }
}
