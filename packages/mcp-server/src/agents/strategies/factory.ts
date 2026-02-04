/**
 * Tab Strategy Factory
 *
 * Creates the appropriate strategy instance for each tab type.
 * Centralizes strategy instantiation and provides type safety.
 */

import type { TabType, TabAgentStrategy } from './types.js';
import { ProfileStrategy } from './profile.strategy.js';
import { GoalsStrategy } from './goals.strategy.js';
import { BudgetStrategy } from './budget.strategy.js';
import { TradeStrategy } from './trade.strategy.js';
import { JobsStrategy } from './jobs.strategy.js';
import { SwipeStrategy } from './swipe.strategy.js';

// Strategy instances are stateless, so we can cache them
const strategyCache = new Map<TabType, TabAgentStrategy>();

/**
 * Create or retrieve a strategy for the given tab type
 */
export function createTabStrategy(tabType: TabType): TabAgentStrategy {
  // Check cache first
  const cached = strategyCache.get(tabType);
  if (cached) {
    return cached;
  }

  // Create new strategy
  let strategy: TabAgentStrategy;

  switch (tabType) {
    case 'profile':
      strategy = new ProfileStrategy();
      break;
    case 'goals':
      strategy = new GoalsStrategy();
      break;
    case 'budget':
      strategy = new BudgetStrategy();
      break;
    case 'trade':
      strategy = new TradeStrategy();
      break;
    case 'jobs':
      strategy = new JobsStrategy();
      break;
    case 'swipe':
      strategy = new SwipeStrategy();
      break;
    default:
      throw new Error(`Unknown tab type: ${tabType}`);
  }

  // Cache and return
  strategyCache.set(tabType, strategy);
  return strategy;
}

/**
 * Get all available tab types
 */
export function getAvailableTabTypes(): TabType[] {
  return ['profile', 'goals', 'budget', 'trade', 'jobs', 'swipe'];
}

/**
 * Check if a tab type is valid
 */
export function isValidTabType(tabType: string): tabType is TabType {
  return getAvailableTabTypes().includes(tabType as TabType);
}

/**
 * Get strategy configuration summary (for debugging/logging)
 */
export function getStrategyConfig(tabType: TabType): {
  tabType: TabType;
  primaryAgent: string;
  secondaryAgents: string[];
  validationRules: ReturnType<TabAgentStrategy['getValidationRules']>;
} {
  const strategy = createTabStrategy(tabType);
  return {
    tabType,
    primaryAgent: strategy.getPrimaryAgentId(),
    secondaryAgents: strategy.getSecondaryAgentIds(),
    validationRules: strategy.getValidationRules(),
  };
}

/**
 * Clear strategy cache (useful for testing)
 */
export function clearStrategyCache(): void {
  strategyCache.clear();
}
