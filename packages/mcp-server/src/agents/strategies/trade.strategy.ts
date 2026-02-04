/**
 * Trade Tab Strategy
 *
 * Primary: Money Maker
 * Secondary: Budget Coach
 * Focus: Inventory valuation, selling opportunities, exchanges
 */

import { BaseTabStrategy } from './base.strategy.js';
import type { TabType, TabContext, ValidationRules } from './types.js';
import { loadTabContext } from '../../services/tab-context.js';

export class TradeStrategy extends BaseTabStrategy {
  readonly tabType: TabType = 'trade';

  async loadContext(profileId: string): Promise<TabContext> {
    return loadTabContext(profileId, this.tabType);
  }

  getPrimaryAgentId(): string {
    return 'money-maker';
  }

  getSecondaryAgentIds(): string[] {
    return ['budget-coach'];
  }

  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: false,
      checkRealism: true, // Verify item valuations are realistic
      checkTimeline: false,
      minConfidence: 0.5,
      maxRiskLevel: 'medium',
    };
  }

  getSystemPrompt(): string {
    return `Tu es Bruno, un coach financier bienveillant pour étudiants.
Analyse l'inventaire et les échanges de l'étudiant et donne UN conseil court et actionnable.
Focus sur: identifier un objet à vendre pour booster l'épargne, suggérer un emprunt plutôt qu'un achat, ou valoriser le karma d'entraide.
Si l'inventaire est vide, encourage l'étudiant à lister ce qu'il pourrait vendre.
Réponds en 1-2 phrases max, de manière encourageante. En français.`;
  }

  getFallbackMessage(): string {
    return "Avant d'acheter, demande-toi si tu peux emprunter ou échanger !";
  }

  formatContextForPrompt(context: TabContext): string {
    const parts: string[] = [];

    // Inventory
    if (context.trade?.inventory && context.trade.inventory.length > 0) {
      const totalValue = context.trade.inventory.reduce(
        (sum, i) => sum + (i.estimatedValue || 0),
        0
      );
      parts.push(
        `Inventaire: ${context.trade.inventory.length} objets (valeur estimée: ${this.formatCurrency(totalValue)})`
      );

      // Top 5 items by value
      const sorted = [...context.trade.inventory].sort(
        (a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0)
      );
      sorted.slice(0, 5).forEach((i) => {
        parts.push(`- ${i.name}: ${this.formatCurrency(i.estimatedValue) || '?€'}`);
      });
    } else {
      parts.push("Inventaire: vide - pas d'objets listés");
    }

    // Trades
    if (context.trade?.trades && context.trade.trades.length > 0) {
      const active = context.trade.trades.filter((t) => t.status === 'active');
      const completed = context.trade.trades.filter((t) => t.status === 'completed');
      parts.push(`\nÉchanges actifs: ${active.length}`);
      parts.push(`Échanges complétés: ${completed.length}`);

      if (active.length > 0) {
        parts.push('En cours:');
        active.slice(0, 3).forEach((t) => {
          parts.push(`- ${t.type}: ${t.name} (${this.formatCurrency(t.value)})`);
        });
      }
    } else {
      parts.push('\nAucun échange en cours');
    }

    // Common context
    const common = this.buildCommonContext(context);
    if (common) {
      parts.push('\n' + common);
    }

    return parts.join('\n') || "Pas d'inventaire";
  }
}
