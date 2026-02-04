/**
 * Agents Index
 *
 * Exports all Stride agents and tools.
 */

// Factory
export {
  createStrideAgent,
  getAgentConfig,
  createAllAgents,
  registerTool,
  getToolsByNames,
  AGENT_CONFIGS,
  type AgentConfig,
} from './factory.js';

// Budget Coach Agent
export {
  analyzeBudgetTool,
  generateAdviceTool,
  findOptimizationsTool,
  createBudgetCoachAgent,
} from './budget-coach.js';

// Job Matcher Agent
export {
  matchJobsTool,
  explainJobMatchTool,
  compareJobsTool,
  createJobMatcherAgent,
} from './job-matcher.js';

// Projection ML Agent
export {
  predictGraduationBalanceTool,
  simulateScenariosTool,
  createProjectionMLAgent,
} from './projection-ml.js';

// Guardian Agent
export {
  validateCalculationTool,
  checkRiskLevelTool,
  hybridEvaluationTool,
  validateRecommendation,
  createGuardianAgent,
} from './guardian.js';

// Money Maker Agent
export {
  analyzeImageTool,
  estimatePriceTool,
  budgetImpactTool,
  suggestHustlesTool,
  moneyMakerAnalysisTool,
  createMoneyMakerAgent,
  ITEM_CATEGORIES,
  SIDE_HUSTLES,
} from './money-maker.js';

// Strategy Comparator Agent
export {
  compareStrategiesTool,
  quickComparisonTool,
  compareStrategies,
  createStrategyFromJob,
  createStrategyFromHustle,
  createStrategyFromSelling,
  createStrategyFromOptimization,
  createStrategyComparatorAgent,
  type Strategy,
  type StrategyType,
  type StrategyComparison,
} from './strategy-comparator.js';

// Onboarding Agent
export {
  extractProfileDataTool,
  generateOnboardingResponseTool,
  validateProfileTool,
  getOnboardingAgent,
  processOnboardingMessage,
  ONBOARDING_AGENT_CONFIG,
  type ProfileData,
  type OnboardingInput,
  type OnboardingOutput,
} from './onboarding-agent.js';

// Tips Orchestrator (Multi-Agent System) - Legacy
export { orchestrateTips } from './tips-orchestrator.js';
export type {
  TipsOrchestratorInput,
  TipsOrchestratorOutput,
  AgentRecommendation,
  LocalOpportunity,
} from './tips-orchestrator.js';

// Tab Tips Orchestrator (Strategy Pattern - New)
export {
  orchestrateTabTips,
  warmupTabTips,
  prefetchNextTabs,
  getTabPrediction,
} from './tab-tips-orchestrator.js';

// Daily Briefing Agent
export { generateDailyBriefing } from './daily-briefing.js';
export type { DailyBriefingInput, DailyBriefingOutput } from './daily-briefing.js';

// Tab Agent Strategies
export {
  createTabStrategy,
  getAvailableTabTypes,
  isValidTabType,
  getStrategyConfig,
  type TabType,
  type TabContext,
  type TabAgentStrategy,
  type TabTipsInput,
  type TabTipsOutput,
  type ValidationRules,
} from './strategies/index.js';

// Initialize all tools (must be called before creating agents)
import './budget-coach.js';
import './job-matcher.js';
import './projection-ml.js';
import './guardian.js';
import './money-maker.js';
import './strategy-comparator.js';
import './onboarding-agent.js';
import './tips-orchestrator.js';
import './tab-tips-orchestrator.js';
import './daily-briefing.js';
