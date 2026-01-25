/**
 * Budget Coach Agent
 *
 * Analyzes student budget and provides personalized advice.
 * Uses LLM for natural language understanding and recommendations.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { registerTool, getAgentConfig, createStrideAgent } from './factory.js';
import { trace } from '../services/opik.js';

// === Tool Definitions ===

/**
 * Analyze budget tool
 */
export const analyzeBudgetTool = createTool({
  id: 'analyze_budget',
  description: "Analyze a student's monthly budget (income vs expenses)",
  inputSchema: z.object({
    incomes: z.array(
      z.object({
        source: z.string().describe('Income source (Financial Aid, Parents, Job, Scholarship)'),
        amount: z.number().describe('Monthly amount in dollars'),
      })
    ),
    expenses: z.array(
      z.object({
        category: z.string().describe('Expense category (Rent, Food, Transport)'),
        amount: z.number().describe('Monthly amount in dollars'),
      })
    ),
  }),
  execute: async (input) => {
    return trace('tool.analyze_budget', async (span) => {
      span.setAttributes({
        'input.income_sources': input.incomes.length,
        'input.expense_categories': input.expenses.length,
      });

      const totalIncome = input.incomes.reduce((sum, i) => sum + i.amount, 0);
      const totalExpenses = input.expenses.reduce((sum, e) => sum + e.amount, 0);
      const margin = totalIncome - totalExpenses;

      // Categorize expenses
      const expenseBreakdown = input.expenses.reduce(
        (acc, e) => {
          acc[e.category] = (acc[e.category] || 0) + e.amount;
          return acc;
        },
        {} as Record<string, number>
      );

      // Calculate percentages
      const expensePercentages = Object.entries(expenseBreakdown).map(([category, amount]) => ({
        category,
        amount,
        percentage: Math.round((amount / totalExpenses) * 100),
      }));

      // Determine status
      const status = margin >= 0 ? 'positive' : 'deficit';
      const severity =
        margin < -100 ? 'critical' : margin < 0 ? 'warning' : margin < 50 ? 'tight' : 'comfortable';

      span.setAttributes({
        'output.margin': margin,
        'output.status': status,
        'output.severity': severity,
        'output.savings_rate': totalIncome > 0 ? Math.round((margin / totalIncome) * 100) : 0,
      });

      return {
        totalIncome,
        totalExpenses,
        margin,
        status,
        severity,
        expenseBreakdown: expensePercentages,
        incomeBreakdown: input.incomes,
        savingsRate: totalIncome > 0 ? Math.round((margin / totalIncome) * 100) : 0,
      };
    });
  },
});

/**
 * Generate advice tool
 */
export const generateAdviceTool = createTool({
  id: 'generate_advice',
  description: 'Generate personalized advice based on student profile',
  inputSchema: z.object({
    diploma: z.string().optional().describe('Current degree'),
    skills: z.array(z.string()).optional().describe('Skills'),
    margin: z.number().optional().describe('Monthly margin in dollars'),
    hasLoan: z.boolean().optional().describe('Has student loan'),
    loanAmount: z.number().optional().describe('Loan amount'),
    context: z.string().optional().describe('Additional context'),
  }),
  execute: async (input) => {
    return trace('tool.generate_advice', async (span) => {
      span.setAttributes({
        'input.margin': input.margin ?? null,
        'input.has_loan': input.hasLoan ?? false,
        'input.skills_count': input.skills?.length ?? 0,
      });

      const advice: string[] = [];

      // Generate advice based on margin
      if (input.margin !== undefined) {
        if (input.margin < 0) {
          advice.push(
            'Priority: reduce the deficit. Look for financial aid (grants, scholarships) or a compatible part-time job.'
          );
          advice.push('Tip: check your eligibility for student aid programs.');
        } else if (input.margin < 50) {
          advice.push('Your margin is tight. Building a small safety cushion is recommended.');
          advice.push(
            'Tip: budget optimizations (meal plans, roommates) can free up $100-200/month.'
          );
        } else if (input.margin < 200) {
          advice.push('Good balance! You can start saving regularly.');
          advice.push('Goal: aim for 3 months of expenses as an emergency fund.');
        } else {
          advice.push('Excellent margin! You have flexibility to invest in yourself.');
          advice.push('Idea: courses, certifications, or experiences that boost your resume.');
        }
      }

      // Advice based on loan
      if (input.hasLoan && input.loanAmount) {
        advice.push(`Student loan of $${input.loanAmount}: start planning repayment now.`);
        advice.push('Strategy: as soon as possible, increase your income to accelerate repayment.');
      }

      // Skills-based advice
      if (input.skills && input.skills.length > 0) {
        advice.push(
          `Your skills (${input.skills.slice(0, 3).join(', ')}) are monetizable: freelance, tutoring, internships.`
        );
      }

      const priority = input.margin && input.margin < 0 ? 'urgent' : 'normal';

      span.setAttributes({
        'output.advice_count': advice.length,
        'output.priority': priority,
      });

      return {
        advice,
        priority,
        profile: {
          diploma: input.diploma,
          skills: input.skills,
          financialStatus: input.margin && input.margin < 0 ? 'deficit' : 'balanced',
        },
      };
    });
  },
});

/**
 * Find optimizations tool
 */
export const findOptimizationsTool = createTool({
  id: 'find_optimizations',
  description: 'Find budget optimizations based on knowledge graph',
  inputSchema: z.object({
    expenseCategories: z.array(z.string()).describe('Expense categories to optimize'),
    currentExpenses: z
      .record(z.string(), z.number())
      .optional()
      .describe('Current expenses by category'),
    constraints: z.array(z.string()).optional().describe('Constraints (e.g., "no roommate")'),
  }),
  execute: async (input) => {
    return trace('tool.find_optimizations', async (span) => {
      span.setAttributes({
        'input.categories_count': input.expenseCategories.length,
        'input.constraints_count': input.constraints?.length ?? 0,
      });

      // Optimization database
      const optimizations: Record<
        string,
        Array<{
          solution: string;
          savingsPct: number;
          effort: string;
          condition: string;
        }>
      > = {
        rent: [
          { solution: 'Roommate', savingsPct: 0.3, effort: 'medium', condition: 'good roommate' },
          {
            solution: 'Student housing',
            savingsPct: 0.4,
            effort: 'low',
            condition: 'eligibility',
          },
          {
            solution: 'Housing assistance',
            savingsPct: 0.25,
            effort: 'low',
            condition: 'apply for aid',
          },
        ],
        food: [
          { solution: 'Campus dining', savingsPct: 0.5, effort: 'low', condition: 'nearby' },
          {
            solution: 'Meal prep',
            savingsPct: 0.3,
            effort: 'medium',
            condition: 'time available',
          },
          {
            solution: 'Food rescue apps',
            savingsPct: 0.2,
            effort: 'low',
            condition: 'stock availability',
          },
        ],
        transport: [
          {
            solution: 'Bike/Walk',
            savingsPct: 0.8,
            effort: 'medium',
            condition: 'bike-friendly city',
          },
          {
            solution: 'Student transit pass',
            savingsPct: 0.3,
            effort: 'low',
            condition: 'regular trips',
          },
          {
            solution: 'Carpool',
            savingsPct: 0.5,
            effort: 'medium',
            condition: 'compatible routes',
          },
        ],
        phone: [
          {
            solution: 'Student plan',
            savingsPct: 0.4,
            effort: 'low',
            condition: 'switch carrier',
          },
          {
            solution: 'Family plan',
            savingsPct: 0.5,
            effort: 'low',
            condition: 'family agreement',
          },
        ],
      };

      const results: Array<{
        expense: string;
        solution: string;
        savingsPct: number;
        potentialSavings: number;
        effort: string;
        condition: string;
      }> = [];

      for (const category of input.expenseCategories) {
        const categoryLower = category.toLowerCase();
        const opts = optimizations[categoryLower] || [];
        const currentAmount =
          input.currentExpenses?.[categoryLower] || input.currentExpenses?.[category] || 0;

        // Filter out constrained solutions
        const constraints = input.constraints || [];
        const filteredOpts = opts.filter((o) => {
          const solutionLower = o.solution.toLowerCase();
          return !constraints.some((c) => solutionLower.includes(c.toLowerCase()));
        });

        for (const opt of filteredOpts) {
          results.push({
            expense: category,
            solution: opt.solution,
            savingsPct: opt.savingsPct,
            potentialSavings: Math.round(currentAmount * opt.savingsPct),
            effort: opt.effort,
            condition: opt.condition,
          });
        }
      }

      // Sort by potential savings
      results.sort((a, b) => b.potentialSavings - a.potentialSavings);

      const totalPotentialSavings = results.reduce((sum, r) => sum + r.potentialSavings, 0);

      span.setAttributes({
        'output.optimizations_count': Math.min(results.length, 10),
        'output.total_potential_savings': totalPotentialSavings,
        'output.top_recommendation': results[0]?.solution ?? null,
      });

      return {
        optimizations: results.slice(0, 10),
        totalPotentialSavings,
        topRecommendation: results[0] || null,
      };
    });
  },
});

// Register tools
registerTool('analyze_budget', analyzeBudgetTool);
registerTool('generate_advice', generateAdviceTool);
registerTool('find_optimizations', findOptimizationsTool);

/**
 * Create Budget Coach agent instance
 */
export async function createBudgetCoachAgent(): Promise<Agent> {
  const config = getAgentConfig('budget-coach');
  if (!config) {
    throw new Error('Budget Coach agent config not found');
  }
  return createStrideAgent(config);
}

export default {
  analyzeBudgetTool,
  generateAdviceTool,
  findOptimizationsTool,
  createBudgetCoachAgent,
};
