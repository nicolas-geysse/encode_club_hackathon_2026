/**
 * Tab Agent Strategies
 *
 * Strategy pattern implementation for tab-specific agent orchestration.
 * Each tab has a dedicated strategy that defines:
 * - Context loading (from DuckDB)
 * - Agent selection (primary + secondary)
 * - Validation rules (contextual Guardian)
 * - System prompts for LLM
 */

// Types
export type {
  TabType,
  TabContext,
  TabAgentStrategy,
  ValidationRules,
  ValidationResult,
  TabAgentConfig,
  TabTipsInput,
  TabTipsOutput,
  TabStrategyFactory,
} from './types.js';

// Base class
export { BaseTabStrategy } from './base.strategy.js';

// Strategy implementations
export { ProfileStrategy } from './profile.strategy.js';
export { GoalsStrategy } from './goals.strategy.js';
export { BudgetStrategy } from './budget.strategy.js';
export { TradeStrategy } from './trade.strategy.js';
export { JobsStrategy } from './jobs.strategy.js';
export { SwipeStrategy } from './swipe.strategy.js';

// Factory
export {
  createTabStrategy,
  getAvailableTabTypes,
  isValidTabType,
  getStrategyConfig,
  clearStrategyCache,
} from './factory.js';
