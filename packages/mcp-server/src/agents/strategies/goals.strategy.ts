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
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse les objectifs financiers de l'étudiant et donne UN conseil court et actionnable.
Focus sur: faisabilité des objectifs avec la marge actuelle, décomposition en étapes, ou ajustement des montants/délais.
Si un objectif semble irréaliste (marge insuffisante pour le délai), suggère un ajustement.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return 'Définis des objectifs SMART : Spécifiques, Mesurables, Atteignables, Réalistes et Temporels.';
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Goals
    if (context.goals && context.goals.length > 0) {
      context.goals.forEach((g, i) => {
        const progress = g.progress ? ` - ${g.progress}% accompli` : '';
        const deadline = g.deadline ? ` (deadline: ${g.deadline})` : '';
        const status = g.status ? ` [${g.status}]` : '';
        parts.push(
          `Objectif ${i + 1}: ${g.name} - ${this.formatCurrency(g.amount)}${deadline}${progress}${status}`
        );
      });

      // Calculate total needed
      const totalNeeded = context.goals.reduce((sum, g) => sum + (g.amount || 0), 0);
      const totalProgress = context.goals.reduce(
        (sum, g) => sum + ((g.amount || 0) * (g.progress || 0)) / 100,
        0
      );
      parts.push(`\nTotal objectifs: ${this.formatCurrency(totalNeeded)}`);
      parts.push(`Déjà épargné: ${this.formatCurrency(Math.round(totalProgress))}`);
    } else {
      parts.push('Aucun objectif défini');
    }

    // Monthly margin for feasibility
    if (context.monthlyMargin !== undefined) {
      parts.push(`\nMarge mensuelle disponible: ${this.formatCurrency(context.monthlyMargin)}`);

      // Calculate months to first goal
      if (context.goals && context.goals.length > 0 && context.monthlyMargin > 0) {
        const firstGoal = context.goals[0];
        const remaining = (firstGoal.amount || 0) * (1 - (firstGoal.progress || 0) / 100);
        const monthsNeeded = Math.ceil(remaining / context.monthlyMargin);
        parts.push(`Mois estimés pour "${firstGoal.name}": ${monthsNeeded}`);
      }
    }

    // Common context
    const common = this.buildCommonContext(context);
    if (common && !parts.some((p) => p.includes('Marge'))) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || 'Aucun objectif défini';
  }
}
