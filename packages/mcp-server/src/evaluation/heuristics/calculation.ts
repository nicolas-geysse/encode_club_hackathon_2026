/**
 * Calculation Validation Heuristic
 *
 * Validates financial calculations (margins, projections, compound interest).
 * This is a CRITICAL check - failure triggers veto.
 */

import type { HeuristicResult } from '../types.js';

type CalculationType = 'margin' | 'projection' | 'compound_interest' | 'loan_payoff';

interface CalculationInput {
  type: CalculationType;
  inputs: Record<string, number>;
  result: number;
}

interface CalculationValidation {
  valid: boolean;
  expected: number;
  actual: number;
  difference: number;
  percentDifference: number;
  formula: string;
}

/**
 * Validate a single calculation
 */
function validateSingleCalculation(
  calc: CalculationInput,
  tolerance = 0.01
): CalculationValidation {
  let expected: number;
  let formula: string;

  switch (calc.type) {
    case 'margin':
      expected = (calc.inputs.income || 0) - (calc.inputs.expenses || 0);
      formula = 'margin = income - expenses';
      break;

    case 'projection': {
      const margin = calc.inputs.monthlyMargin || 0;
      const months = calc.inputs.months || 0;
      const initial = calc.inputs.initialBalance || 0;
      expected = initial + margin * months;
      formula = 'projection = initial + (margin * months)';
      break;
    }

    case 'compound_interest': {
      const principal = calc.inputs.principal || 0;
      const rate = calc.inputs.annualRate || 0;
      const years = calc.inputs.years || 0;
      const n = calc.inputs.compoundingPerYear || 12;
      expected = principal * Math.pow(1 + rate / n, n * years);
      formula = 'A = P * (1 + r/n)^(nt)';
      break;
    }

    case 'loan_payoff': {
      const loanAmount = calc.inputs.loanAmount || 0;
      const monthlyPayment = calc.inputs.monthlyPayment || 0;
      const interestRate = calc.inputs.monthlyInterestRate || 0;

      if (monthlyPayment <= loanAmount * interestRate) {
        expected = Infinity;
      } else {
        expected = Math.ceil(
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
        expected: 0,
        actual: calc.result,
        difference: 0,
        percentDifference: 0,
        formula: 'unknown',
      };
  }

  const difference = Math.abs(expected - calc.result);
  const percentDifference = calc.result !== 0 ? difference / Math.abs(calc.result) : difference;

  return {
    valid: percentDifference <= tolerance,
    expected: Math.round(expected * 100) / 100,
    actual: calc.result,
    difference: Math.round(difference * 100) / 100,
    percentDifference: Math.round(percentDifference * 10000) / 100,
    formula,
  };
}

/**
 * Run calculation validation heuristic
 */
export function checkCalculations(
  calculations?: CalculationInput[],
  tolerance = 0.01
): HeuristicResult {
  // No calculations to validate = pass by default
  if (!calculations || calculations.length === 0) {
    return {
      name: 'calculation_validation',
      passed: true,
      score: 1.0,
      isCritical: true,
      details: {
        calculationsChecked: 0,
        message: 'No calculations to validate',
      },
      message: 'Aucun calcul a valider',
    };
  }

  const validations = calculations.map((calc) => ({
    type: calc.type,
    ...validateSingleCalculation(calc, tolerance),
  }));

  const failedValidations = validations.filter((v) => !v.valid);
  const passed = failedValidations.length === 0;

  // Score: percentage of valid calculations
  const score = validations.filter((v) => v.valid).length / validations.length;

  const issues = failedValidations.map(
    (v) =>
      `Calcul ${v.type}: attendu ${v.expected}, obtenu ${v.actual} (ecart ${v.percentDifference}%)`
  );

  return {
    name: 'calculation_validation',
    passed,
    score,
    isCritical: true, // Calculation errors trigger veto
    details: {
      calculationsChecked: calculations.length,
      validations,
      failedCount: failedValidations.length,
      tolerance: tolerance * 100,
    },
    message: passed
      ? `${calculations.length} calcul(s) valide(s)`
      : `${failedValidations.length}/${calculations.length} calcul(s) incorrect(s): ${issues.join('; ')}`,
  };
}

export default { checkCalculations };
