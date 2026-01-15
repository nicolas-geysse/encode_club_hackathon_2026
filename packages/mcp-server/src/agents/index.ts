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

// Initialize all tools (must be called before creating agents)
import './budget-coach.js';
import './job-matcher.js';
import './projection-ml.js';
import './guardian.js';
