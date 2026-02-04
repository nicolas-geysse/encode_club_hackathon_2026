/**
 * Base Strategy
 *
 * Abstract base class for tab strategies.
 * Provides common functionality and enforces the interface.
 */

import type { TabType, TabContext, TabAgentStrategy, ValidationRules } from './types.js';

export abstract class BaseTabStrategy implements TabAgentStrategy {
  abstract readonly tabType: TabType;

  // Subclasses must implement these
  abstract loadContext(profileId: string): Promise<TabContext>;
  abstract getPrimaryAgentId(): string;
  abstract getSecondaryAgentIds(): string[];
  abstract getSystemPrompt(): string;
  abstract getFallbackMessage(): string;
  abstract formatContextForPrompt(context: TabContext): string;

  /**
   * Default validation rules - subclasses can override
   */
  getValidationRules(): ValidationRules {
    return {
      tabType: this.tabType,
      checkFeasibility: false,
      checkSolvency: false,
      checkRealism: false,
      checkTimeline: false,
      minConfidence: 0.5,
      maxRiskLevel: 'medium',
    };
  }

  /**
   * Helper to format a list of items for the prompt
   */
  protected formatList(items: string[], maxItems = 5): string {
    if (!items || items.length === 0) return 'none';
    const limited = items.slice(0, maxItems);
    const suffix = items.length > maxItems ? ` (+${items.length - maxItems} more)` : '';
    return limited.join(', ') + suffix;
  }

  /**
   * Helper to format currency
   */
  protected formatCurrency(amount: number | undefined, symbol = '€'): string {
    if (amount === undefined || amount === null) return 'unknown';
    return `${amount}${symbol}`;
  }

  /**
   * Helper to format percentage
   */
  protected formatPercent(value: number | undefined): string {
    if (value === undefined || value === null) return 'unknown';
    return `${Math.round(value)}%`;
  }

  /**
   * Helper to build common context header
   */
  protected buildCommonContext(context: TabContext): string {
    const parts: string[] = [];

    if (context.currentEnergy !== undefined) {
      parts.push(`Current energy: ${this.formatPercent(context.currentEnergy)}`);
    }

    if (context.monthlyMargin !== undefined) {
      const status = context.monthlyMargin >= 0 ? 'positive' : 'deficit';
      parts.push(`Monthly margin: ${this.formatCurrency(context.monthlyMargin)} (${status})`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }
}
