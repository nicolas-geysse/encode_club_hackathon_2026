/**
 * Budget Tab Strategy
 *
 * Primary: Budget Coach
 * Secondary: Guardian
 * Focus: Income/expense analysis, optimizations, solvency
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class BudgetStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'budget';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'budget-coach';
  }

  getSecondaryAgentIds(): string[] {
    return ['guardian'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: true, // No risky advice if deficit
      checkRealism: false,
      checkTimeline: false,
      minConfidence: 0.7,
      maxRiskLevel: 'low', // Be conservative with budget advice
    };
  }

  getSystemPrompt(): string {
    return `You are Bruno, a caring financial coach for students.
Analyze the student's budget (income and expenses) and give ONE short actionable tip.
Focus on: reducing a specific expense, increasing income, or optimizing savings margin.
If the budget is in deficit, prioritize reducing non-essential expenses.
If the budget is tight (<€50 margin), suggest low-effort quick wins.
Reply in 1-2 sentences max, in an encouraging tone.`;
  }

  getFallbackMessage(): string {
    return 'Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Budget summary
    if (context.budget?.monthlyIncome !== undefined) {
      parts.push(`Monthly income: ${this.formatCurrency(context.budget.monthlyIncome)}`);
    }
    if (context.budget?.monthlyExpenses !== undefined) {
      parts.push(`Monthly expenses: ${this.formatCurrency(context.budget.monthlyExpenses)}`);
    }
    if (context.monthlyMargin !== undefined) {
      const status =
        context.monthlyMargin < 0 ? '⚠️ deficit' : context.monthlyMargin < 50 ? 'tight' : 'OK';
      parts.push(`Savings margin: ${this.formatCurrency(context.monthlyMargin)} (${status})`);
    }

    // Expense breakdown by category
    if (context.budget?.expenses && context.budget.expenses.length > 0) {
      parts.push('\nExpenses by category:');
      const byCategory = context.budget.expenses.reduce(
        (acc, e) => {
          const cat = e.category || 'Autre';
          acc[cat] = (acc[cat] || 0) + e.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      // Sort by amount descending
      Object.entries(byCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([cat, amount]) => {
          parts.push(`- ${cat}: ${this.formatCurrency(amount)}`);
        });
    }

    // Common context (energy)
    const common = this.buildCommonContext(context);
    if (common && !parts.some((p) => p.includes('energy'))) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Budget not provided';
  }
}
