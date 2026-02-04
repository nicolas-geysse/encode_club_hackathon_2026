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
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse le budget de l'étudiant (revenus et dépenses) et donne UN conseil court et actionnable.
Focus sur: réduire une dépense spécifique, augmenter les revenus, ou optimiser la marge d'épargne.
Si le budget est en déficit, priorise la réduction des dépenses non-essentielles.
Si le budget est serré (<50€ de marge), suggère des quick wins à faible effort.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return 'Essaie la règle 50/30/20 : 50% besoins, 30% envies, 20% épargne.';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Budget summary
    if (context.budget?.monthlyIncome !== undefined) {
      parts.push(`Revenus mensuels: ${this.formatCurrency(context.budget.monthlyIncome)}`);
    }
    if (context.budget?.monthlyExpenses !== undefined) {
      parts.push(`Dépenses mensuelles: ${this.formatCurrency(context.budget.monthlyExpenses)}`);
    }
    if (context.monthlyMargin !== undefined) {
      const status =
        context.monthlyMargin < 0 ? '⚠️ déficit' : context.monthlyMargin < 50 ? 'serré' : 'OK';
      parts.push(`Marge d'épargne: ${this.formatCurrency(context.monthlyMargin)} (${status})`);
    }

    // Expense breakdown by category
    if (context.budget?.expenses && context.budget.expenses.length > 0) {
      parts.push('\nDépenses par catégorie:');
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
    if (common && !parts.some((p) => p.includes('énergie'))) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Budget non renseigné';
  }
}
