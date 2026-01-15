/**
 * Hybrid Evaluation System Types
 *
 * TypeScript interfaces for the combined heuristic + LLM-as-Judge evaluation.
 */

/**
 * Individual heuristic check result
 */
export interface HeuristicResult {
  name: string;
  passed: boolean;
  score: number; // 0-1
  isCritical: boolean; // If true and failed, triggers veto
  details: Record<string, unknown>;
  message: string;
}

/**
 * Result from all heuristic checks
 */
export interface HeuristicsResults {
  checks: HeuristicResult[];
  aggregatedScore: number; // Weighted average
  criticalFailed: boolean; // True if any critical check failed
  issues: string[];
}

/**
 * G-Eval criterion definition
 */
export interface GEvalCriterion {
  name: string;
  description: string;
  weight: number; // 0-1, sum of all weights should be 1
  rubric: string; // Scoring rubric for LLM
}

/**
 * G-Eval criterion result
 */
export interface GEvalCriterionResult {
  criterion: string;
  score: number; // 1-5, normalized to 0-1
  normalizedScore: number; // 0-1
  confidence: number; // 0-1
  reasoning: string;
}

/**
 * Result from G-Eval LLM-as-Judge
 */
export interface GEvalResult {
  criteriaResults: GEvalCriterionResult[];
  aggregatedScore: number; // Weighted average of normalized scores
  averageConfidence: number;
  overallReasoning: string;
}

/**
 * Final hybrid evaluation result
 */
export interface HybridEvaluationResult {
  passed: boolean;
  finalScore: number; // 0-1
  heuristicScore: number;
  llmScore: number;
  vetoed: boolean;
  vetoReason?: string;
  issues: string[];
  suggestions: string[];
  heuristicsResults: HeuristicsResults;
  gEvalResult?: GEvalResult; // May be skipped if vetoed
  opikTraceId?: string;
}

/**
 * Context for evaluation
 */
export interface EvaluationContext {
  targetAudience: 'etudiant' | 'general';
  financialSituation?: 'deficit' | 'serre' | 'equilibre' | 'confortable';
  hasLoan?: boolean;
  yearsRemaining?: number;
}

/**
 * Input for hybrid evaluation
 */
export interface EvaluationInput {
  recommendation: string;
  calculations?: Array<{
    type: 'margin' | 'projection' | 'compound_interest' | 'loan_payoff';
    inputs: Record<string, number>;
    result: number;
  }>;
  context: EvaluationContext;
}

/**
 * Aggregation configuration
 */
export interface AggregationConfig {
  heuristicWeight: number;
  llmWeight: number;
  vetoThreshold: number;
  passThreshold: number;
  confidenceWeighting: {
    enabled: boolean;
    minConfidence: number;
  };
}

/**
 * Default aggregation config for Student Life Navigator
 */
export const DEFAULT_AGGREGATION_CONFIG: AggregationConfig = {
  heuristicWeight: 0.60,
  llmWeight: 0.40,
  vetoThreshold: 0.3,
  passThreshold: 0.6,
  confidenceWeighting: {
    enabled: true,
    minConfidence: 0.5,
  },
};

/**
 * Risk keywords configuration
 */
export const HIGH_RISK_KEYWORDS = [
  'crypto', 'bitcoin', 'ethereum', 'nft',
  'forex', 'trading', 'options', 'leverage',
  'garanti', 'sans risque', 'rendement eleve',
  'investis tout', 'all-in', 'emprunte pour investir',
] as const;

export const SAFE_KEYWORDS = [
  'livret a', 'epargne', 'budget', 'economiser',
  'apl', 'bourse', 'crous', 'caf',
  'job etudiant', 'tutorat', 'freelance',
  'colocation', 'transport en commun',
] as const;
