/**
 * Algorithms Index
 *
 * Exports all Stride core algorithms.
 * These algorithms power the tips, predictions, and recommendations.
 */

// Energy Debt Detection
export {
  detectEnergyDebt,
  detectEnergyDebtTraced,
  adjustTargetForDebt,
  calculateRecoveryProgress,
  checkDebtAchievements,
  DEFAULT_CONFIG as ENERGY_DEBT_CONFIG,
} from './energy-debt.js';
export type {
  EnergyDebt,
  DebtSeverity,
  EnergyDebtConfig,
  TargetAdjustment,
  DebtAchievement,
  EnergyEntry,
} from './energy-debt.js';

// Comeback Detection
export {
  detectComebackWindow,
  detectComebackWindowTraced,
  generateCatchUpPlan,
  analyzeComeback,
  checkComebackCompletion,
  DEFAULT_CONFIG as COMEBACK_CONFIG,
  DEFAULT_CAPACITIES,
} from './comeback-detection.js';
export type {
  ComebackWindow,
  CatchUpPlan,
  ComebackResult,
  ComebackAchievement,
  ComebackConfig,
} from './comeback-detection.js';

// Skill Arbitrage
export {
  calculateArbitrageScore,
  rankSkills,
  adjustWeights,
  euros,
  euroCents,
  formatEuro,
  toEuros,
  DEFAULT_WEIGHTS as SKILL_ARBITRAGE_WEIGHTS,
  SKILL_TEMPLATES,
} from './skill-arbitrage.js';
export type {
  Skill,
  ArbitrageWeights,
  ArbitrageResult,
  SkillRanking,
  Money,
} from './skill-arbitrage.js';

// Retroplanning
export { generateRetroplan, calculateCatchUp, generateCalendarView } from './retroplanning.js';
