/**
 * Workflows Index
 *
 * Exports all Stride workflows.
 */

export {
  runStudentAnalysis,
  type StudentProfile,
  type AnalysisResult,
} from './student-analysis.js';

export {
  runGoalPlanningWorkflow,
  type GoalPlanningInput,
  type GoalPlanResult,
  type Strategy,
  type Milestone,
  type ActionPlan,
  type Action,
} from './goal-planning.js';
