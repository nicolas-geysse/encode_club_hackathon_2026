/**
 * Cash Flow Smoothing Agent
 *
 * Prevents value destruction from timing mismatches:
 * - Detects when expenses due before income arrives
 * - Suggests delaying flexible expenses vs urgent selling
 * - Calculates trade-offs: urgency discount vs overdraft fees
 *
 * Mantra: "Don't destroy value for short-term liquidity."
 *
 * Part of Checkpoint H.5: Guardrail Agents
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool } from './factory.js';
import { trace, setPromptAttributes } from '../services/opik.js';

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface UpcomingExpense {
  id: string;
  name: string;
  amount: number;
  dueDate: string;
  isFlexible: boolean;
  category: 'essential' | 'flexible' | 'discretionary';
}

export interface UpcomingIncome {
  source: string;
  amount: number;
  expectedDate: string;
  confidence: number;
}

export interface PendingSale {
  itemId: string;
  itemName: string;
  estimatedValue: number;
  urgency: 'asap' | 'normal' | 'flexible';
}

export interface CashFlowContext {
  currentBalance: number;
  upcomingExpenses: UpcomingExpense[];
  upcomingIncome: UpcomingIncome[];
  pendingSales: PendingSale[];
}

export interface TimingMismatch {
  expenseId: string;
  expenseName: string;
  expenseAmount: number;
  expenseDue: string;
  shortfallAmount: number;
  incomeArrival: string;
  gapDays: number;
}

export interface CashFlowSolution {
  type: 'delay_expense' | 'accelerate_sale' | 'partial_payment' | 'use_savings';
  description: string;
  targetId: string;
  targetName: string;
  originalDate: string;
  suggestedDate: string;
  impactAmount: number;
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface CashFlowOutput {
  mismatches: TimingMismatch[];
  solutions: CashFlowSolution[];
  worstCaseDate: string | null;
  daysUntilCrisis: number;
  recommendedAction: string;
}

// ============================================================
// CONFIGURATION
// ============================================================

export const CASHFLOW_CONFIG = {
  // Cost assumptions
  URGENCY_SALE_DISCOUNT: 0.2, // -20% for urgent sale
  OVERDRAFT_DAILY_FEE: 0.5, // 0.50€/day overdraft fee
  LATE_PAYMENT_FEE: 15, // Flat 15€ late fee assumption

  // Limits
  MAX_DELAY_DAYS: 14, // Max 2 weeks delay
  SIMULATION_DAYS: 30, // Look ahead 30 days

  // Categories that can be delayed
  DELAYABLE_CATEGORIES: ['flexible', 'discretionary'],
  NEVER_DELAY: ['essential'],

  // Solution priority
  SOLUTION_PRIORITY: ['delay_expense', 'partial_payment', 'accelerate_sale', 'use_savings'],
};

// ============================================================
// ANALYSIS FUNCTIONS
// ============================================================

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Format date to ISO string (date only)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate days between two dates
 */
function daysBetween(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((date2.getTime() - date1.getTime()) / msPerDay);
}

/**
 * Simulate cash flow day by day to detect mismatches
 */
function detectTimingMismatches(context: CashFlowContext): TimingMismatch[] {
  const { currentBalance, upcomingExpenses, upcomingIncome } = context;
  const mismatches: TimingMismatch[] = [];

  const today = new Date();
  let runningBalance = currentBalance;

  // Sort events by date
  interface CashEvent {
    date: Date;
    type: 'expense' | 'income';
    amount: number;
    id: string;
    name: string;
  }

  const events: CashEvent[] = [
    ...upcomingExpenses.map((e) => ({
      date: parseDate(e.dueDate),
      type: 'expense' as const,
      amount: -e.amount,
      id: e.id,
      name: e.name,
    })),
    ...upcomingIncome.map((i) => ({
      date: parseDate(i.expectedDate),
      type: 'income' as const,
      amount: i.amount,
      id: i.source,
      name: i.source,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Simulate day by day
  for (const event of events) {
    if (daysBetween(today, event.date) > CASHFLOW_CONFIG.SIMULATION_DAYS) break;

    runningBalance += event.amount;

    if (runningBalance < 0 && event.type === 'expense') {
      // Find next income that would cover this
      const nextIncome = events.find(
        (e) => e.type === 'income' && e.date > event.date && runningBalance + e.amount >= 0
      );

      if (nextIncome) {
        mismatches.push({
          expenseId: event.id,
          expenseName: event.name,
          expenseAmount: -event.amount,
          expenseDue: formatDate(event.date),
          shortfallAmount: Math.abs(runningBalance),
          incomeArrival: formatDate(nextIncome.date),
          gapDays: daysBetween(event.date, nextIncome.date),
        });
      } else {
        // No income to cover - serious problem
        mismatches.push({
          expenseId: event.id,
          expenseName: event.name,
          expenseAmount: -event.amount,
          expenseDue: formatDate(event.date),
          shortfallAmount: Math.abs(runningBalance),
          incomeArrival: 'unknown',
          gapDays: -1, // Unknown
        });
      }
    }
  }

  return mismatches;
}

/**
 * Generate solutions for a mismatch
 */
function generateSolutions(mismatch: TimingMismatch, context: CashFlowContext): CashFlowSolution[] {
  const solutions: CashFlowSolution[] = [];

  // Find the expense details
  const expense = context.upcomingExpenses.find((e) => e.id === mismatch.expenseId);

  // Solution 1: Delay the expense if flexible
  if (expense && CASHFLOW_CONFIG.DELAYABLE_CATEGORIES.includes(expense.category)) {
    const delayDays = Math.min(mismatch.gapDays + 3, CASHFLOW_CONFIG.MAX_DELAY_DAYS);
    const newDate = new Date(parseDate(mismatch.expenseDue));
    newDate.setDate(newDate.getDate() + delayDays);

    solutions.push({
      type: 'delay_expense',
      description: `Reporter ${expense.name} de ${delayDays} jours`,
      targetId: expense.id,
      targetName: expense.name,
      originalDate: mismatch.expenseDue,
      suggestedDate: formatDate(newDate),
      impactAmount: expense.amount,
      risk: delayDays <= 7 ? 'low' : 'medium',
      reason: `Attendre l'arrivée de ton revenu le ${mismatch.incomeArrival}`,
    });
  }

  // Solution 2: Partial payment
  if (expense && expense.amount > 50) {
    solutions.push({
      type: 'partial_payment',
      description: `Payer ${Math.round(expense.amount * 0.5)}€ maintenant, le reste après`,
      targetId: expense.id,
      targetName: expense.name,
      originalDate: mismatch.expenseDue,
      suggestedDate: mismatch.incomeArrival !== 'unknown' ? mismatch.incomeArrival : '',
      impactAmount: Math.round(expense.amount * 0.5),
      risk: 'medium',
      reason: 'Réduire le découvert immédiat de moitié',
    });
  }

  // Solution 3: Accelerate a pending sale
  for (const sale of context.pendingSales) {
    if (sale.urgency !== 'asap' && sale.estimatedValue >= mismatch.shortfallAmount) {
      const discountedValue = Math.round(
        sale.estimatedValue * (1 - CASHFLOW_CONFIG.URGENCY_SALE_DISCOUNT)
      );
      solutions.push({
        type: 'accelerate_sale',
        description: `Vendre ${sale.itemName} rapidement (~${discountedValue}€)`,
        targetId: sale.itemId,
        targetName: sale.itemName,
        originalDate: '',
        suggestedDate: mismatch.expenseDue,
        impactAmount: discountedValue,
        risk: 'low',
        reason: `Baisse le prix de 20% pour vente rapide, évite ${mismatch.gapDays}j de découvert`,
      });
      break; // One sale suggestion is enough
    }
  }

  // Sort by priority
  solutions.sort((a, b) => {
    const priorityA = CASHFLOW_CONFIG.SOLUTION_PRIORITY.indexOf(a.type);
    const priorityB = CASHFLOW_CONFIG.SOLUTION_PRIORITY.indexOf(b.type);
    return priorityA - priorityB;
  });

  return solutions;
}

/**
 * Evaluate if urgent sale is worth it vs overdraft
 */
function evaluateUrgencySale(
  saleValue: number,
  gapDays: number
): { shouldAccelerate: boolean; priceReduction: number; comparison: string } {
  const discountLoss = saleValue * CASHFLOW_CONFIG.URGENCY_SALE_DISCOUNT;
  const overdraftCost =
    gapDays * CASHFLOW_CONFIG.OVERDRAFT_DAILY_FEE + CASHFLOW_CONFIG.LATE_PAYMENT_FEE;

  if (discountLoss > overdraftCost) {
    return {
      shouldAccelerate: false,
      priceReduction: 0,
      comparison: `Perte vente urgente (${discountLoss}€) > coût découvert (${overdraftCost}€) - mieux vaut attendre`,
    };
  } else {
    return {
      shouldAccelerate: true,
      priceReduction: CASHFLOW_CONFIG.URGENCY_SALE_DISCOUNT,
      comparison: `Perte vente urgente (${discountLoss}€) < coût découvert (${overdraftCost}€) - vends vite !`,
    };
  }
}

// ============================================================
// MASTRA TOOLS
// ============================================================

/**
 * Tool: Detect timing mismatches in cash flow
 */
export const detectTimingMismatchesTool = createTool({
  id: 'detect_timing_mismatches',
  description: 'Simulate cash flow to detect when expenses due before income arrives',
  inputSchema: z.object({
    currentBalance: z.number().describe('Current account balance in euros'),
    upcomingExpenses: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        amount: z.number(),
        dueDate: z.string(),
        isFlexible: z.boolean(),
        category: z.enum(['essential', 'flexible', 'discretionary']),
      })
    ),
    upcomingIncome: z.array(
      z.object({
        source: z.string(),
        amount: z.number(),
        expectedDate: z.string(),
        confidence: z.number(),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.detect_timing_mismatches', async (ctx) => {
      setPromptAttributes(ctx, 'cashflow-smoother');

      const context: CashFlowContext = {
        currentBalance: input.currentBalance,
        upcomingExpenses: input.upcomingExpenses,
        upcomingIncome: input.upcomingIncome,
        pendingSales: [],
      };

      const mismatches = detectTimingMismatches(context);

      // Find worst case
      const worstMismatch = mismatches.reduce(
        (worst, m) => (m.shortfallAmount > (worst?.shortfallAmount || 0) ? m : worst),
        null as TimingMismatch | null
      );

      ctx.setAttributes({
        'input.balance': input.currentBalance,
        'input.expenses_count': input.upcomingExpenses.length,
        'input.income_count': input.upcomingIncome.length,
        'output.mismatches_count': mismatches.length,
        'output.worst_shortfall': worstMismatch?.shortfallAmount || 0,
      });

      return {
        mismatches,
        worstCase: worstMismatch,
        daysUntilCrisis: worstMismatch
          ? daysBetween(new Date(), parseDate(worstMismatch.expenseDue))
          : null,
        totalShortfall: mismatches.reduce((sum, m) => sum + m.shortfallAmount, 0),
      };
    });
  },
});

/**
 * Tool: Suggest timing solutions
 */
export const suggestTimingSolutionsTool = createTool({
  id: 'suggest_timing_solutions',
  description: 'Generate solutions for cash flow timing problems',
  inputSchema: z.object({
    mismatch: z.object({
      expenseId: z.string(),
      expenseName: z.string(),
      expenseAmount: z.number(),
      expenseDue: z.string(),
      shortfallAmount: z.number(),
      incomeArrival: z.string(),
      gapDays: z.number(),
    }),
    context: z.object({
      upcomingExpenses: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          amount: z.number(),
          dueDate: z.string(),
          isFlexible: z.boolean(),
          category: z.enum(['essential', 'flexible', 'discretionary']),
        })
      ),
      pendingSales: z.array(
        z.object({
          itemId: z.string(),
          itemName: z.string(),
          estimatedValue: z.number(),
          urgency: z.enum(['asap', 'normal', 'flexible']),
        })
      ),
    }),
  }),
  execute: async (input) => {
    return trace('tool.suggest_timing_solutions', async (ctx) => {
      setPromptAttributes(ctx, 'cashflow-smoother');

      const fullContext: CashFlowContext = {
        currentBalance: 0,
        upcomingExpenses: input.context.upcomingExpenses,
        upcomingIncome: [],
        pendingSales: input.context.pendingSales,
      };

      const solutions = generateSolutions(input.mismatch, fullContext);

      ctx.setAttributes({
        'input.expense_name': input.mismatch.expenseName,
        'input.shortfall': input.mismatch.shortfallAmount,
        'input.gap_days': input.mismatch.gapDays,
        'output.solutions_count': solutions.length,
        'output.best_solution': solutions[0]?.type || 'none',
      });

      return {
        solutions,
        bestSolution: solutions[0] || null,
        hasDelaySolution: solutions.some((s) => s.type === 'delay_expense'),
        hasSaleSolution: solutions.some((s) => s.type === 'accelerate_sale'),
      };
    });
  },
});

/**
 * Tool: Evaluate urgency sale trade-off
 */
export const evaluateUrgencySaleTool = createTool({
  id: 'evaluate_urgency_sale',
  description: 'Compare cost of urgent sale discount vs overdraft fees',
  inputSchema: z.object({
    saleValue: z.number().describe('Normal sale value in euros'),
    gapDays: z.number().describe('Days of overdraft if not selling urgently'),
    overdraftAmount: z.number().optional().describe('Amount of overdraft'),
  }),
  execute: async (input) => {
    return trace('tool.evaluate_urgency_sale', async (ctx) => {
      setPromptAttributes(ctx, 'cashflow-smoother');

      const evaluation = evaluateUrgencySale(input.saleValue, input.gapDays);

      ctx.setAttributes({
        'input.sale_value': input.saleValue,
        'input.gap_days': input.gapDays,
        'output.should_accelerate': evaluation.shouldAccelerate,
        'output.price_reduction': evaluation.priceReduction,
      });

      return {
        ...evaluation,
        urgentSalePrice: Math.round(input.saleValue * (1 - evaluation.priceReduction)),
        overdraftCostEstimate:
          input.gapDays * CASHFLOW_CONFIG.OVERDRAFT_DAILY_FEE + CASHFLOW_CONFIG.LATE_PAYMENT_FEE,
      };
    });
  },
});

/**
 * Combined cash flow smoother tool
 */
export const cashFlowSmootherTool = createTool({
  id: 'cashflow_smoother',
  description:
    'Full cash flow analysis: detect mismatches + generate solutions + evaluate trade-offs',
  inputSchema: z.object({
    currentBalance: z.number(),
    upcomingExpenses: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        amount: z.number(),
        dueDate: z.string(),
        isFlexible: z.boolean(),
        category: z.enum(['essential', 'flexible', 'discretionary']),
      })
    ),
    upcomingIncome: z.array(
      z.object({
        source: z.string(),
        amount: z.number(),
        expectedDate: z.string(),
        confidence: z.number(),
      })
    ),
    pendingSales: z
      .array(
        z.object({
          itemId: z.string(),
          itemName: z.string(),
          estimatedValue: z.number(),
          urgency: z.enum(['asap', 'normal', 'flexible']),
        })
      )
      .optional(),
  }),
  execute: async (input): Promise<CashFlowOutput> => {
    return trace('cashflow_smoother.full_analysis', async (ctx) => {
      setPromptAttributes(ctx, 'cashflow-smoother');

      const context: CashFlowContext = {
        currentBalance: input.currentBalance,
        upcomingExpenses: input.upcomingExpenses,
        upcomingIncome: input.upcomingIncome,
        pendingSales: input.pendingSales || [],
      };

      // Step 1: Detect mismatches
      const mismatches = detectTimingMismatches(context);

      // Step 2: Generate solutions for each mismatch
      const allSolutions: CashFlowSolution[] = [];
      for (const mismatch of mismatches) {
        const solutions = generateSolutions(mismatch, context);
        allSolutions.push(...solutions);
      }

      // Step 3: Find worst case
      const worstMismatch = mismatches.reduce(
        (worst, m) => (m.shortfallAmount > (worst?.shortfallAmount || 0) ? m : worst),
        null as TimingMismatch | null
      );

      const daysUntilCrisis = worstMismatch
        ? daysBetween(new Date(), parseDate(worstMismatch.expenseDue))
        : 999;

      // Generate recommendation
      let recommendedAction = '';
      if (mismatches.length === 0) {
        recommendedAction = 'Ton cash flow est équilibré - tout va bien !';
      } else if (daysUntilCrisis <= 3) {
        recommendedAction = `URGENT: Problème de cash dans ${daysUntilCrisis} jours. ${allSolutions[0]?.description || 'Contacte ta banque.'}`;
      } else if (daysUntilCrisis <= 7) {
        recommendedAction = `Attention: tension cash dans ${daysUntilCrisis} jours. ${allSolutions[0]?.description || 'Prépare-toi.'}`;
      } else {
        recommendedAction = `Mismatch détecté dans ${daysUntilCrisis} jours. Tu as le temps de ${allSolutions[0]?.description?.toLowerCase() || 'trouver une solution'}.`;
      }

      ctx.setAttributes({
        'input.balance': input.currentBalance,
        'input.expenses_count': input.upcomingExpenses.length,
        'output.mismatches_count': mismatches.length,
        'output.solutions_count': allSolutions.length,
        'output.days_until_crisis': daysUntilCrisis,
      });

      ctx.setOutput({
        mismatches: mismatches.length,
        solutions: allSolutions.length,
        days_until_crisis: daysUntilCrisis,
        status: mismatches.length === 0 ? 'healthy' : daysUntilCrisis <= 7 ? 'warning' : 'planning',
      });

      return {
        mismatches,
        solutions: allSolutions,
        worstCaseDate: worstMismatch?.expenseDue || null,
        daysUntilCrisis,
        recommendedAction,
      };
    });
  },
});

// ============================================================
// REGISTER TOOLS
// ============================================================

registerTool('detect_timing_mismatches', detectTimingMismatchesTool);
registerTool('suggest_timing_solutions', suggestTimingSolutionsTool);
registerTool('evaluate_urgency_sale', evaluateUrgencySaleTool);
registerTool('cashflow_smoother', cashFlowSmootherTool);

// ============================================================
// EXPORTS
// ============================================================

export default {
  detectTimingMismatchesTool,
  suggestTimingSolutionsTool,
  evaluateUrgencySaleTool,
  cashFlowSmootherTool,
  CASHFLOW_CONFIG,
};
