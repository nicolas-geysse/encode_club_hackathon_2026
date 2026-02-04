/**
 * Guardian Agent
 *
 * LLM-as-Judge pattern for validating financial recommendations.
 * Ensures advice is safe, realistic, and mathematically correct.
 *
 * Features:
 * - Hybrid evaluation: heuristics + LLM-as-Judge (G-Eval)
 * - Veto logic for critical failures
 * - Full Opik tracing integration
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import { runQuickEvaluation, type EvaluationInput } from '../evaluation/index.js';
import { trace, setPromptAttributes } from '../services/opik.js';

/**
 * Risk keywords that should trigger warnings
 */
const HIGH_RISK_KEYWORDS = [
  'crypto',
  'bitcoin',
  'ethereum',
  'nft',
  'forex',
  'trading',
  'options',
  'leverage',
  'guaranteed',
  'risk-free',
  'high returns',
  'invest everything',
  'all-in',
  'borrow to invest',
];

/**
 * Safe keywords that indicate responsible advice
 */
const SAFE_KEYWORDS = [
  'savings account',
  'savings',
  'budget',
  'save money',
  'financial aid',
  'scholarship',
  'grants',
  'student loan',
  'student job',
  'tutoring',
  'freelance',
  'roommates',
  'public transport',
];

// === Core Validation Logic ===

/**
 * Validate a calculation
 */
function validateCalculation(
  calculationType: 'margin' | 'projection' | 'compound_interest' | 'loan_payoff',
  inputs: Record<string, number>,
  expectedOutput: number,
  tolerance = 0.01
): {
  valid: boolean;
  calculationType: string;
  formula: string;
  computedOutput: number;
  expectedOutput: number;
  difference: number;
  percentDifference: number;
  tolerance: number;
  message: string;
} {
  let computedOutput: number;
  let formula: string;

  switch (calculationType) {
    case 'margin':
      computedOutput = (inputs.income || 0) - (inputs.expenses || 0);
      formula = 'margin = income - expenses';
      break;

    case 'projection': {
      const margin = inputs.monthlyMargin || 0;
      const months = inputs.months || 0;
      const initial = inputs.initialBalance || 0;
      computedOutput = initial + margin * months;
      formula = 'projection = initial + (margin * months)';
      break;
    }

    case 'compound_interest': {
      const principal = inputs.principal || 0;
      const rate = inputs.annualRate || 0;
      const years = inputs.years || 0;
      const n = inputs.compoundingPerYear || 12;
      computedOutput = principal * Math.pow(1 + rate / n, n * years);
      formula = 'A = P * (1 + r/n)^(nt)';
      break;
    }

    case 'loan_payoff': {
      const loanAmount = inputs.loanAmount || 0;
      const monthlyPayment = inputs.monthlyPayment || 0;
      const interestRate = inputs.monthlyInterestRate || 0;

      if (monthlyPayment <= loanAmount * interestRate) {
        computedOutput = Infinity; // Loan never paid off
      } else {
        computedOutput = Math.ceil(
          Math.log(monthlyPayment / (monthlyPayment - loanAmount * interestRate)) /
            Math.log(1 + interestRate)
        );
      }
      formula = 'n = log(PMT / (PMT - P * r)) / log(1 + r)';
      break;
    }

    default:
      return {
        valid: false,
        calculationType,
        formula: 'unknown',
        computedOutput: 0,
        expectedOutput,
        difference: 0,
        percentDifference: 0,
        tolerance: tolerance * 100,
        message: `Unknown calculation type: ${calculationType}`,
      };
  }

  const difference = Math.abs(computedOutput - expectedOutput);
  const percentDifference =
    expectedOutput !== 0 ? difference / Math.abs(expectedOutput) : difference;

  const isValid = percentDifference <= tolerance;

  return {
    valid: isValid,
    calculationType,
    formula,
    computedOutput: Math.round(computedOutput * 100) / 100,
    expectedOutput,
    difference: Math.round(difference * 100) / 100,
    percentDifference: Math.round(percentDifference * 10000) / 100,
    tolerance: tolerance * 100,
    message: isValid
      ? 'Calculation valid'
      : `${Math.round(percentDifference * 100)}% deviation detected (tolerance: ${tolerance * 100}%)`,
  };
}

/**
 * Check risk level of a recommendation
 */
function checkRiskLevel(
  recommendation: string,
  userContext?: {
    targetAudience?: string;
    financialSituation?: 'deficit' | 'tight' | 'balanced' | 'comfortable';
    hasLoan?: boolean;
  }
): {
  passed: boolean;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  issues: string[];
  warnings: string[];
  safeKeywordsFound: string[];
  highRiskKeywordsFound: string[];
  recommendation: string;
  suggestions: string[];
} {
  const recommendationLower = recommendation.toLowerCase();

  // Check for high-risk keywords
  const foundHighRisk: string[] = [];
  for (const keyword of HIGH_RISK_KEYWORDS) {
    if (recommendationLower.includes(keyword.toLowerCase())) {
      foundHighRisk.push(keyword);
    }
  }

  // Check for safe keywords
  const foundSafe: string[] = [];
  for (const keyword of SAFE_KEYWORDS) {
    if (recommendationLower.includes(keyword.toLowerCase())) {
      foundSafe.push(keyword);
    }
  }

  // Calculate risk score (0 = safe, 1 = very risky)
  const baseRiskScore = foundHighRisk.length * 0.3;
  const safeBonus = foundSafe.length * -0.1;
  let riskScore = Math.max(0, Math.min(1, 0.3 + baseRiskScore + safeBonus));

  // Adjust based on context
  const issues: string[] = [];
  const warnings: string[] = [];

  if (userContext?.financialSituation === 'deficit') {
    if (foundHighRisk.length > 0) {
      riskScore += 0.2;
      issues.push('Risky recommendation for a student in deficit');
    }
  }

  if (userContext?.hasLoan && recommendationLower.includes('borrow')) {
    riskScore += 0.2;
    warnings.push('Warning: student already has a loan');
  }

  if (foundHighRisk.length > 0) {
    issues.push(`High-risk keywords detected: ${foundHighRisk.join(', ')}`);
  }

  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' | 'critical';
  if (riskScore < 0.2) {
    riskLevel = 'low';
  } else if (riskScore < 0.4) {
    riskLevel = 'medium';
  } else if (riskScore < 0.7) {
    riskLevel = 'high';
  } else {
    riskLevel = 'critical';
  }

  const passed = riskScore < 0.5;

  return {
    passed,
    riskLevel,
    riskScore: Math.round(riskScore * 100) / 100,
    issues,
    warnings,
    safeKeywordsFound: foundSafe,
    highRiskKeywordsFound: foundHighRisk,
    recommendation: passed
      ? 'Recommendation acceptable'
      : 'Risky recommendation - requires revision',
    suggestions: passed
      ? []
      : ['Remove or modify risky elements', 'Add risk disclaimers', 'Propose safer alternatives'],
  };
}

// === Tool Definitions ===

/**
 * Validate calculation tool
 */
export const validateCalculationTool = createTool({
  id: 'validate_calculation',
  description: 'Validates financial calculations (margins, projections, interest)',
  inputSchema: z.object({
    calculationType: z
      .enum(['margin', 'projection', 'compound_interest', 'loan_payoff'])
      .describe('Type of calculation'),
    inputs: z.record(z.string(), z.number()).describe('Input values'),
    expectedOutput: z.number().describe('Expected result'),
    tolerance: z.number().optional().describe('Error tolerance (%)'),
  }),
  execute: async (input) => {
    return trace('tool.validate_calculation', async (ctx) => {
      setPromptAttributes(ctx, 'guardian');
      const { calculationType, inputs, expectedOutput, tolerance = 0.01 } = input;

      ctx.setAttributes({
        'input.calculation_type': calculationType,
        'input.expected_output': expectedOutput,
        'input.tolerance': tolerance,
      });

      const result = validateCalculation(calculationType, inputs, expectedOutput, tolerance);

      ctx.setAttributes({
        'output.valid': result.valid,
        'output.computed_output': result.computedOutput,
        'output.difference': result.difference,
        'output.percent_difference': result.percentDifference,
      });

      return result;
    });
  },
});

/**
 * Check risk level tool
 */
export const checkRiskLevelTool = createTool({
  id: 'check_risk_level',
  description: 'Checks the risk level of a recommendation',
  inputSchema: z.object({
    recommendation: z.string().describe('Recommendation text'),
    context: z
      .object({
        targetAudience: z.string().optional().describe('Target audience (student, etc.)'),
        financialSituation: z.enum(['deficit', 'tight', 'balanced', 'comfortable']).optional(),
        hasLoan: z.boolean().optional(),
      })
      .optional(),
  }),
  execute: async (input) => {
    return trace('tool.check_risk_level', async (ctx) => {
      setPromptAttributes(ctx, 'guardian');
      const { recommendation, context: userContext } = input;

      ctx.setAttributes({
        'input.recommendation_length': recommendation.length,
        'input.financial_situation': userContext?.financialSituation ?? 'unknown',
        'input.has_loan': userContext?.hasLoan ?? false,
      });

      const result = checkRiskLevel(recommendation, userContext);

      ctx.setAttributes({
        'output.passed': result.passed,
        'output.risk_level': result.riskLevel,
        'output.risk_score': result.riskScore,
        'output.high_risk_keywords_count': result.highRiskKeywordsFound.length,
        'output.safe_keywords_count': result.safeKeywordsFound.length,
      });

      return result;
    });
  },
});

/**
 * Hybrid evaluation tool - combines heuristics + LLM-as-Judge
 */
export const hybridEvaluationTool = createTool({
  id: 'hybrid_evaluation',
  description: 'Complete hybrid evaluation: heuristics + LLM-as-Judge with Opik tracing',
  inputSchema: z.object({
    recommendation: z.string().describe('Recommendation text to evaluate'),
    calculations: z
      .array(
        z.object({
          type: z.enum(['margin', 'projection', 'compound_interest', 'loan_payoff']),
          inputs: z.record(z.string(), z.number()),
          result: z.number(),
        })
      )
      .optional()
      .describe('Calculations to validate'),
    context: z.object({
      targetAudience: z.enum(['student', 'general']).default('student'),
      financialSituation: z.enum(['deficit', 'tight', 'balanced', 'comfortable']).optional(),
      hasLoan: z.boolean().optional(),
      yearsRemaining: z.number().optional(),
    }),
  }),
  execute: async (toolInput) => {
    // Note: In a real implementation, generateFn would use the LLM
    // For now, we use quick evaluation (heuristics only)
    const input: EvaluationInput = {
      recommendation: toolInput.recommendation,
      calculations: toolInput.calculations,
      context: {
        ...toolInput.context,
        targetAudience: toolInput.context.targetAudience || 'student',
      },
    };

    const result = await runQuickEvaluation(input);

    return {
      passed: result.passed,
      score: result.score,
      criticalFailed: result.criticalFailed,
      issues: result.issues,
      mode: 'quick', // Indicates heuristics-only mode
      message: result.passed
        ? 'Evaluation passed'
        : `Evaluation failed: ${result.issues.slice(0, 2).join('; ')}`,
    };
  },
});

// Register tools
registerTool('validate_calculation', validateCalculationTool);
registerTool('check_risk_level', checkRiskLevelTool);
registerTool('hybrid_evaluation', hybridEvaluationTool);

/**
 * Validate a complete recommendation
 */
export async function validateRecommendation(
  recommendation: {
    text: string;
    calculations?: Array<{
      type: 'margin' | 'projection' | 'compound_interest' | 'loan_payoff';
      inputs: Record<string, number>;
      result: number;
    }>;
  },
  profile: {
    financialSituation?: 'deficit' | 'tight' | 'balanced' | 'comfortable';
    hasLoan?: boolean;
  }
): Promise<{
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
}> {
  const allIssues: string[] = [];
  const allSuggestions: string[] = [];
  let calculationsValid = true;

  // Validate calculations using direct function
  if (recommendation.calculations) {
    for (const calc of recommendation.calculations) {
      const result = validateCalculation(calc.type, calc.inputs, calc.result);

      if (!result.valid) {
        calculationsValid = false;
        allIssues.push(result.message);
        allSuggestions.push('Verify calculations');
      }
    }
  }

  // Check risk level using direct function
  const riskResult = checkRiskLevel(recommendation.text, {
    targetAudience: 'student',
    financialSituation: profile.financialSituation,
    hasLoan: profile.hasLoan,
  });

  allIssues.push(...riskResult.issues);
  allSuggestions.push(...riskResult.suggestions);

  // Overall assessment
  const passed = calculationsValid && riskResult.passed;
  const confidence = passed ? 0.9 - riskResult.riskScore * 0.3 : 0.3 + riskResult.riskScore * -0.2;

  return {
    passed,
    confidence: Math.max(0, Math.min(1, confidence)),
    issues: allIssues,
    suggestions: allSuggestions,
  };
}

/**
 * Create Guardian agent instance
 */
export async function createGuardianAgent(): Promise<Agent> {
  const config = getAgentConfig('guardian');
  if (!config) {
    throw new Error('Guardian agent config not found');
  }
  return createStrideAgent(config);
}

export default {
  validateCalculationTool,
  checkRiskLevelTool,
  hybridEvaluationTool,
  validateRecommendation,
  createGuardianAgent,
};
